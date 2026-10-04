import type { ShareCapture } from '@notion2/shared';

/**
 * The last thing shared into the app, waiting for the capture screen. Kept in memory
 * only: shared content is user data and is never persisted outside the Inbox.
 */
let pending: Extract<ShareCapture, { mode: 'text' | 'image' }> | null = null;

export function setPendingShare(value: typeof pending) {
  pending = value;
}

/** Returns and clears the pending share. */
export function takePendingShare(): typeof pending {
  const value = pending;
  pending = null;
  return value;
}
