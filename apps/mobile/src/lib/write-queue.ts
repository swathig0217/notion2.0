import type { QueryClient } from '@tanstack/react-query';
import { isNetworkError, type DbWrite } from './db-write';

export const DB_WRITE_KEY = ['db-write'] as const;

/**
 * Registers how queued writes execute. Defaults live on the client (not the hook) so writes
 * persisted while offline can be resumed after an app restart, before any component
 * mounts the mutation.
 */
export function configureWriteQueue(
  client: QueryClient,
  execute: (write: DbWrite) => Promise<void>,
) {
  client.setMutationDefaults(DB_WRITE_KEY, {
    mutationFn: execute,
    // All writes run serially, in the order they were made (parents before children).
    scope: { id: 'db' },
    retry: (failureCount, error) => isNetworkError(error) && failureCount < 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}
