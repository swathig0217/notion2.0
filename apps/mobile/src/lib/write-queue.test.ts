import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MutationObserver,
  QueryClient,
  dehydrate,
  hydrate,
  onlineManager,
} from '@tanstack/query-core';
import { DbWriteError, executeDbWrite, isNetworkError, type DbWrite } from './db-write';
import { DB_WRITE_KEY, configureWriteQueue } from './write-queue';

const insert = (id: string): DbWrite => ({
  op: 'insert',
  table: 'tasks',
  rows: [{ id, title: id }],
});

function enqueue(client: QueryClient, write: DbWrite) {
  const observer = new MutationObserver<void, Error, DbWrite>(client, {
    mutationKey: DB_WRITE_KEY,
  });
  return observer.mutate(write).catch(() => undefined);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => onlineManager.setOnline(true));

describe('write queue', () => {
  it('runs writes serially in the order they were made', async () => {
    const client = new QueryClient();
    const order: string[] = [];
    configureWriteQueue(client, async (w) => {
      if (w.op === 'insert') order.push(String(w.rows[0]?.id));
      await new Promise((r) =>
        setTimeout(r, w.op === 'insert' && w.rows[0]?.id === 'parent' ? 20 : 0),
      );
    });
    await Promise.all([enqueue(client, insert('parent')), enqueue(client, insert('child'))]);
    expect(order).toEqual(['parent', 'child']);
  });

  it('pauses while offline and replays in order on reconnect', async () => {
    const client = new QueryClient();
    client.mount();
    const executed: string[] = [];
    configureWriteQueue(client, async (w) => {
      if (w.op === 'insert') executed.push(String(w.rows[0]?.id));
    });

    onlineManager.setOnline(false);
    const done = Promise.all(['a', 'b', 'c'].map((id) => enqueue(client, insert(id))));
    await flush();
    expect(executed).toEqual([]);
    expect(
      client
        .getMutationCache()
        .getAll()
        .some((m) => m.state.isPaused),
    ).toBe(true);

    onlineManager.setOnline(true);
    await done;
    expect(executed).toEqual(['a', 'b', 'c']);
    client.unmount();
  });

  it('survives an app restart: persisted paused writes resume on a new client', async () => {
    const before = new QueryClient();
    configureWriteQueue(before, async () => undefined);
    onlineManager.setOnline(false);
    void enqueue(before, insert('offline-1'));
    void enqueue(before, insert('offline-2'));
    await flush();
    const persisted = JSON.parse(JSON.stringify(dehydrate(before)));

    const after = new QueryClient();
    const executed: string[] = [];
    configureWriteQueue(after, async (w) => {
      if (w.op === 'insert') executed.push(String(w.rows[0]?.id));
    });
    hydrate(after, persisted);
    onlineManager.setOnline(true);
    await after.resumePausedMutations();
    expect(executed).toEqual(['offline-1', 'offline-2']);
  });

  it('does not retry server rejections (they are rolled back instead)', async () => {
    const client = new QueryClient();
    const execute = vi.fn(async () => {
      throw new DbWriteError('new row violates row-level security policy', '42501');
    });
    configureWriteQueue(client, execute);
    await enqueue(client, insert('x'));
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe('isNetworkError', () => {
  it('classifies errors', () => {
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true);
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new DbWriteError('duplicate key', '23505'))).toBe(false);
  });
});

describe('executeDbWrite', () => {
  function fakeClient() {
    const calls: { method: string; args: unknown[] }[] = [];
    const builder = {
      upsert: (...args: unknown[]) => (
        calls.push({ method: 'upsert', args }),
        Promise.resolve({ error: null })
      ),
      insert: (...args: unknown[]) => (
        calls.push({ method: 'insert', args }),
        Promise.resolve({ error: null })
      ),
      update: (...args: unknown[]) => (
        calls.push({ method: 'update', args }),
        {
          eq: (...a: unknown[]) => (
            calls.push({ method: 'eq', args: a }),
            Promise.resolve({ error: null })
          ),
        }
      ),
      delete: () => ({
        in: (...a: unknown[]) => (
          calls.push({ method: 'delete.in', args: a }),
          Promise.resolve({ error: null })
        ),
      }),
    };
    return {
      client: { from: (t: string) => (calls.push({ method: 'from', args: [t] }), builder) },
      calls,
    };
  }

  it('inserts idempotently and strips server-managed columns', async () => {
    const { client, calls } = fakeClient();
    await executeDbWrite(client as never, {
      op: 'insert',
      table: 'tasks',
      rows: [{ id: '1', title: 't', created_at: 'x', updated_at: 'y', completed_at: null }],
    });
    const upsert = calls.find((c) => c.method === 'upsert');
    expect(upsert?.args).toEqual([
      [{ id: '1', title: 't' }],
      { onConflict: 'id', ignoreDuplicates: true },
    ]);
  });

  it('keeps a client-set completed_at', async () => {
    const { client, calls } = fakeClient();
    await executeDbWrite(client as never, {
      op: 'update',
      table: 'tasks',
      id: '1',
      patch: { status: 'done', completed_at: 'now' },
    });
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({
      status: 'done',
      completed_at: 'now',
    });
  });

  it('uses plain insert for append-only events', async () => {
    const { client, calls } = fakeClient();
    await executeDbWrite(client as never, {
      op: 'insert',
      table: 'events',
      rows: [{ id: 'e', name: 'x' }],
    });
    expect(calls.some((c) => c.method === 'insert')).toBe(true);
  });

  it('throws DbWriteError on a server error', async () => {
    const client = {
      from: () => ({
        delete: () => ({
          in: () => Promise.resolve({ error: { message: 'denied', code: '42501' } }),
        }),
      }),
    };
    await expect(
      executeDbWrite(client as never, { op: 'delete', table: 'tasks', ids: ['1'] }),
    ).rejects.toBeInstanceOf(DbWriteError);
  });
});
