// Private calendar feed: GET /calendar?token=<workspaces.calendar_token> → text/calendar.
// Calendar apps poll this URL; the token is the credential (turn off or replace it in
// Settings). Service client, scoped to the token's workspace; titles and dates only.
import { buildCalendar, feedEvents } from '../../../packages/shared/src/calendar/ics.ts';
import { isShareToken } from '../../../packages/shared/src/client-view/client-view.ts';
import { isValidTimeZone, todayInTimeZone } from '../../../packages/shared/src/dates/dates.ts';
import { logMetrics } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabase.ts';

const notFound = () =>
  new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405 });
  const started = Date.now();
  const token = new URL(req.url).searchParams.get('token');
  if (!isShareToken(token)) return notFound();

  const db = serviceClient();
  const { data: workspace } = await db
    .from('workspaces')
    .select('id, name, owner_id')
    .eq('calendar_token', token)
    .maybeSingle();
  if (!workspace) return notFound();

  const ws = workspace.id;
  const [
    { data: profile },
    { data: tasks },
    { data: projects },
    { data: invoices },
    { data: clients },
  ] = await Promise.all([
    db.from('profiles').select('timezone').eq('id', workspace.owner_id).maybeSingle(),
    db
      .from('tasks')
      .select('id, title, status, due_date, parent_task_id, client_id, project_id')
      .eq('workspace_id', ws)
      .neq('status', 'done')
      .is('parent_task_id', null)
      .not('due_date', 'is', null)
      .limit(2000),
    db
      .from('projects')
      .select('id, title, status, due_date, client_id')
      .eq('workspace_id', ws)
      .eq('status', 'active')
      .not('due_date', 'is', null),
    db
      .from('invoices')
      .select('id, number, status, due_date, client_name')
      .eq('workspace_id', ws)
      .eq('status', 'sent'),
    db.from('clients').select('id, name').eq('workspace_id', ws),
  ]);

  const tz = profile?.timezone && isValidTimeZone(profile.timezone) ? profile.timezone : 'UTC';
  const events = feedEvents({
    today: todayInTimeZone(tz),
    tasks: tasks ?? [],
    projects: projects ?? [],
    invoices: invoices ?? [],
    clientNames: new Map((clients ?? []).map((c) => [c.id, c.name])),
  });
  const body = buildCalendar({ name: `${workspace.name} · due dates`, events });
  logMetrics({ fn: 'calendar', events: events.length, ms: Date.now() - started });
  return new Response(req.method === 'HEAD' ? null : body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="due-dates.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  });
});
