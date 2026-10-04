import { useCallback } from 'react';
import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { DbWrite } from './db-write';
import { DB_WRITE_KEY } from './query-client';
import { toast } from './toast';
import { reportError } from './sentry';

/** Query keys for the per-table caches. One list per table keeps optimistic updates simple. */
export const keys = {
  me: ['me'] as const,
  clients: ['clients'] as const,
  projects: ['projects'] as const,
  tasks: ['tasks'] as const,
  notes: ['notes'] as const,
  note: (id: string) => ['note', id] as const,
  inbox: ['inbox'] as const,
  time: ['time-entries'] as const,
};

const TABLE_KEYS: Record<DbWrite['table'], QueryKey[]> = {
  clients: [keys.clients],
  projects: [keys.projects],
  tasks: [keys.tasks],
  notes: [keys.notes, ['note']],
  inbox_items: [keys.inbox],
  events: [],
  time_entries: [keys.time],
};

/** Applies `fn` to a cached list (no-op when the list isn't loaded yet). */
export function updateList<T>(qc: QueryClient, key: QueryKey, fn: (rows: T[]) => T[]) {
  qc.setQueryData<T[]>(key, (rows) => fn(rows ?? []));
}

/**
 * Enqueues a write. Callers update the cache first (optimistic), so the UI never waits
 * on the network. On a server rejection the affected caches are refetched to restore
 * server truth and the user sees an error toast.
 */
export function useDbWrite() {
  const qc = useQueryClient();
  const { mutate } = useMutation<void, Error, DbWrite>({
    mutationKey: DB_WRITE_KEY,
    onError: (error, write) => {
      reportError(error, { table: write.table, op: write.op });
      for (const key of TABLE_KEYS[write.table]) void qc.invalidateQueries({ queryKey: key });
      if (write.table !== 'events') toast.error("Couldn't save that change. It has been undone.");
    },
  });
  return useCallback((write: DbWrite) => mutate(write), [mutate]);
}

/** Like `useDbWrite`, but resolves once the write reached the server (after reconnect if offline). */
export function useDbWriteAsync() {
  const qc = useQueryClient();
  const { mutateAsync } = useMutation<void, Error, DbWrite>({
    mutationKey: DB_WRITE_KEY,
    onError: (error, write) => {
      reportError(error, { table: write.table, op: write.op });
      for (const key of TABLE_KEYS[write.table]) void qc.invalidateQueries({ queryKey: key });
      toast.error("Couldn't save that change. It has been undone.");
    },
  });
  return mutateAsync;
}
