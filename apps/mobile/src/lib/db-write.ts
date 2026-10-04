import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@notion2/shared';

export type WritableTable =
  | 'clients'
  | 'projects'
  | 'tasks'
  | 'notes'
  | 'inbox_items'
  | 'events'
  | 'time_entries'
  | 'invoices'
  | 'share_links'
  | 'webhooks';

/** Idempotent RPCs that may be queued like table writes (`table` = the cache they touch). */
export type QueuedRpc = 'save_invoice';

/**
 * A serializable write. Writes are queued (and persisted while offline) as plain data so
 * they can be replayed after an app restart. Every op is idempotent:
 * - insert: ON CONFLICT (id) DO NOTHING, so a replayed insert is a no-op
 * - update: sets fields by id (last write wins)
 * - delete: deleting a missing row is a no-op
 * - rpc: only functions that are idempotent by design (e.g. `save_invoice` keyed by id)
 */
export type DbWrite =
  | { op: 'insert'; table: WritableTable; rows: Record<string, unknown>[] }
  | { op: 'update'; table: WritableTable; id: string; patch: Record<string, unknown> }
  | { op: 'delete'; table: WritableTable; ids: string[] }
  | { op: 'rpc'; table: WritableTable; fn: QueuedRpc; args: Record<string, unknown> };

export class DbWriteError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
    this.name = 'DbWriteError';
  }
}

// Server-managed columns are never sent from the client.
const SERVER_COLUMNS = ['created_at', 'updated_at', 'completed_at'];

function stripServerColumns(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!SERVER_COLUMNS.includes(k) || (k === 'completed_at' && v != null)) out[k] = v;
  }
  return out;
}

export async function executeDbWrite(client: SupabaseClient<Database>, write: DbWrite) {
  // The table name is a runtime union, so payloads are typed loosely here; callers build
  // rows from generated types.
  const table = client.from(write.table as 'tasks');
  let error: { message: string; code?: string } | null = null;

  switch (write.op) {
    case 'insert': {
      if (write.rows.length === 0) return;
      const rows = write.rows.map(stripServerColumns) as never[];
      ({ error } =
        write.table === 'events'
          ? await table.insert(rows)
          : await table.upsert(rows, { onConflict: 'id', ignoreDuplicates: true }));
      break;
    }
    case 'update':
      ({ error } = await table.update(stripServerColumns(write.patch) as never).eq('id', write.id));
      break;
    case 'delete':
      if (write.ids.length === 0) return;
      ({ error } = await table.delete().in('id', write.ids));
      break;
    case 'rpc':
      ({ error } = await client.rpc(write.fn, write.args as never));
      break;
  }

  if (error) throw new DbWriteError(error.message, error.code);
}

/** Network failures are retried and queued; server rejections (RLS, validation) are not. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof DbWriteError) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /network|fetch|timeout|offline|abort/i.test(message);
}
