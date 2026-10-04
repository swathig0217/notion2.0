/**
 * Native deep links. The share extension opens `notion2://dataUrl=…`, which isn't a
 * route; send it home and let `useShareIntake` open Dump it with the shared content.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (path.includes('dataUrl=')) return '/';
  return path;
}
