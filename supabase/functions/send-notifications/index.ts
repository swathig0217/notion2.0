// Hourly (pg_cron): for each user whose local hour matches their digest hour, plan and
// send at most one push per device per day. Authenticated with CRON_SECRET.
import {
  isDue,
  planNotifications,
  readNotifyPrefs,
  todayInTimeZone,
  type DaySnapshot,
  type NotifyUser,
} from '../../../packages/shared/src/index.ts';
import { json, logMetrics } from '../_shared/http.ts';
import { serviceClient, type Db } from '../_shared/supabase.ts';
import { sendPush } from '../_shared/push.ts';

const FOLLOW_UP_DAYS = 7;

async function snapshot(db: Db, userId: string, timeZone: string): Promise<DaySnapshot | null> {
  const { data: ws } = await db
    .from('workspaces')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (!ws) return null;
  const today = todayInTimeZone(timeZone);
  const [tasks, clients] = await Promise.all([
    db
      .from('tasks')
      .select('title, due_date, priority')
      .eq('workspace_id', ws.id)
      .neq('status', 'done')
      .is('parent_task_id', null)
      .lte('due_date', today)
      .order('due_date')
      .limit(50),
    db
      .from('clients')
      .select('id, name, last_contacted_at, created_at')
      .eq('workspace_id', ws.id)
      .eq('status', 'active'),
  ]);
  const due = tasks.data ?? [];
  return {
    overdue: due.filter((t) => t.due_date != null && t.due_date < today).length,
    due_today: due.filter((t) => t.due_date === today).length,
    top_titles: due.slice(0, 2).map((t) => t.title),
    silent_clients: (clients.data ?? [])
      .map((c) => ({
        client_id: c.id,
        name: c.name,
        last_contact_on: (c.last_contacted_at ?? c.created_at).slice(0, 10),
      }))
      .filter((c) => c.last_contact_on <= todayMinus(today, FOLLOW_UP_DAYS)),
  };
}

function todayMinus(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`)
    return json({ error: 'unauthorized' }, 401);
  const now = new Date();
  const db = serviceClient();

  const { data: tokens, error } = await db
    .from('push_tokens')
    .select('user_id, token, last_digest_on');
  if (error) return json({ error: 'load_failed' }, 500);
  const userIds = [...new Set((tokens ?? []).map((t) => t.user_id))];
  if (userIds.length === 0) return json({ ok: true, users: 0, sent: 0 });

  const { data: profiles } = await db
    .from('profiles')
    .select('id, timezone, notification_prefs')
    .in('id', userIds);
  let considered = 0;
  let sent = 0;
  for (const p of profiles ?? []) {
    const user: NotifyUser = {
      user_id: p.id,
      timezone: p.timezone,
      prefs: readNotifyPrefs(p.notification_prefs),
      tokens: (tokens ?? []).filter((t) => t.user_id === p.id),
    };
    if (!isDue(user, now)) continue;
    considered++;
    const snap = await snapshot(db, user.user_id, user.timezone);
    if (!snap) continue;
    const plan = planNotifications(user, snap, now);
    if (plan.messages.length) sent += await sendPush(db, plan.messages);
    if (plan.stamp.length)
      await db.from('push_tokens').update({ last_digest_on: plan.today }).in('token', plan.stamp);
  }

  logMetrics({ fn: 'send-notifications', users: userIds.length, considered, sent });
  return json({ ok: true, users: userIds.length, considered, sent });
});
