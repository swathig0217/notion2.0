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
import { isClientLimitError } from '@notion2/shared';

function writeErrorMessage(error: Error): string {
  return isClientLimitError(error)
    ? 'The free plan includes 3 active clients. Archive one or upgrade to Pro.'
    : "Couldn't save that change. It has been undone.";
}

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
  invoices: ['invoices'] as const,
  invoiceItems: (id: string) => ['invoice-items', id] as const,
  usage: ['usage'] as const,
};

/** Server-computed caches that depend on a table (refreshed after a write lands). */
const DERIVED_KEYS: Partial<Record<DbWrite['table'], QueryKey[]>> = {
  clients: [keys.usage],
};

function refreshDerived(qc: QueryClient, write: DbWrite) {
  for (const key of DERIVED_KEYS[write.table] ?? []) void qc.invalidateQueries({ queryKey: key });
}

const TABLE_KEYS: Record<DbWrite['table'], QueryKey[]> = {
  clients: [keys.clients],
  projects: [keys.projects],
  tasks: [keys.tasks],
  notes: [keys.notes, ['note']],
  inbox_items: [keys.inbox],
  events: [],
  time_entries: [keys.time],
  invoices: [keys.invoices, ['invoice-items'], keys.time],
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
    onSuccess: (_data, write) => refreshDerived(qc, write),
    onError: (error, write) => {
      reportError(error, { table: write.table, op: write.op });
      for (const key of TABLE_KEYS[write.table]) void qc.invalidateQueries({ queryKey: key });
      if (write.table !== 'events') toast.error(writeErrorMessage(error));
    },
  });
  return useCallback((write: DbWrite) => mutate(write), [mutate]);
}

/** Like `useDbWrite`, but resolves once the write reached the server (after reconnect if offline). */
export function useDbWriteAsync() {
  const qc = useQueryClient();
  const { mutateAsync } = useMutation<void, Error, DbWrite>({
    mutationKey: DB_WRITE_KEY,
    onSuccess: (_data, write) => refreshDerived(qc, write),
    onError: (error, write) => {
      reportError(error, { table: write.table, op: write.op });
      for (const key of TABLE_KEYS[write.table]) void qc.invalidateQueries({ queryKey: key });
      toast.error(writeErrorMessage(error));
    },
  });
  return mutateAsync;
}
