import { z } from 'zod';

export const NotificationPrefs = z.object({
  digest: z.boolean().catch(true),
  digest_hour: z.number().int().min(0).max(23).catch(8),
  nudges: z.boolean().catch(true),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;

export function readPrefs(value: unknown): NotificationPrefs {
  return NotificationPrefs.parse(typeof value === 'object' && value ? value : {});
}
