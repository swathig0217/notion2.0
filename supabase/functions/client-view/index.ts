// Public read-only project view for clients: POST { token } → ClientView.
// No login: the 128-bit token is the credential. Uses the service client, so every query
// is scoped to the link's workspace and project, and the response is built from a fixed
// allowlist of fields (`buildClientView`). Never returns notes, time, money or ids.
import {
  buildClientView,
  isShareToken,
} from '../../../packages/shared/src/client-view/client-view.ts';
import { corsHeaders, error, logMetrics } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabase.ts';

function noStore(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return error('method_not_allowed', 405);
  const started = Date.now();

  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = body?.token;
  if (!isShareToken(token)) return error('not_found', 404);

  const db = serviceClient();
  const { data: link } = await db
    .from('share_links')
    .select('workspace_id, project_id, hidden_task_ids')
    .eq('token', token)
    .maybeSingle();
  if (!link) return error('not_found', 404);

  const [{ data: project }, { data: tasks }, { data: workspace }] = await Promise.all([
    db
      .from('projects')
      .select('title, status, due_date, client_id')
      .eq('workspace_id', link.workspace_id)
      .eq('id', link.project_id)
      .maybeSingle(),
    db
      .from('tasks')
      .select('id, title, status, due_date, parent_task_id, completed_at, updated_at')
      .eq('workspace_id', link.workspace_id)
      .eq('project_id', link.project_id)
      .limit(500),
    db.from('workspaces').select('name, owner_id').eq('id', link.workspace_id).maybeSingle(),
  ]);
  if (!project) return error('not_found', 404);

  const [{ data: client }, { data: owner }] = await Promise.all([
    project.client_id
      ? db
          .from('clients')
          .select('name')
          .eq('workspace_id', link.workspace_id)
          .eq('id', project.client_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    workspace
      ? db.from('profiles').select('display_name').eq('id', workspace.owner_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  await db.rpc('record_share_view', { p_token: token });

  const view = buildClientView({
    project,
    clientName: client?.name ?? null,
    from: owner?.display_name ?? workspace?.name ?? null,
    tasks: tasks ?? [],
    hiddenTaskIds: link.hidden_task_ids,
  });
  logMetrics({ fn: 'client-view', tasks: view.tasks.length, ms: Date.now() - started });
  return noStore(view);
});
