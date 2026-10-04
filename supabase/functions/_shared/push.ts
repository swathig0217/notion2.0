import type { Db } from './supabase.ts';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** In-app route opened on tap, e.g. "/brief". */
  url: string;
}

const EXPO_PUSH_URL = Deno.env.get('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send';

/**
 * Sends via Expo's push service in chunks of 100. Tokens Expo reports as no longer
 * registered are deleted. Returns the number of messages Expo accepted.
 */
export async function sendPush(db: Db, messages: PushMessage[]): Promise<number> {
  let accepted = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        chunk.map((m) => ({
          to: m.to,
          title: m.title,
          body: m.body,
          data: { url: m.url },
          sound: null,
        })),
      ),
    });
    if (!res.ok) continue;
    const json = (await res.json().catch(() => ({ data: [] }))) as {
      data?: { status: string; details?: { error?: string } }[];
    };
    const dead: string[] = [];
    (json.data ?? []).forEach((ticket, idx) => {
      if (ticket.status === 'ok') accepted++;
      else if (ticket.details?.error === 'DeviceNotRegistered' && chunk[idx])
        dead.push(chunk[idx].to);
    });
    if (dead.length) await db.from('push_tokens').delete().in('token', dead);
  }
  return accepted;
}

/** All device tokens of one user (service client). */
export async function userTokens(db: Db, userId: string): Promise<string[]> {
  const { data } = await db.from('push_tokens').select('token').eq('user_id', userId);
  return (data ?? []).map((r) => r.token);
}
