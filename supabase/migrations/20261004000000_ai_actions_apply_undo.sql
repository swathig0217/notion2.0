-- Phase 2: Propose -> Review -> Apply -> Undo.
-- Clients may only read and insert ai_actions (RLS); status transitions happen here, in one
-- transaction each, with explicit membership checks (these run as SECURITY DEFINER).

-- Applies the rows the user approved for a proposed action. Rows are planned client-side
-- (packages/shared/src/ai/apply.ts) because the user may edit or deselect changes; this
-- function forces workspace_id, source and ai_action_id so nothing can be spoofed.
create function public.apply_ai_action(p_action_id uuid, p_rows jsonb, p_edited boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.ai_actions;
  ws uuid;
  applied jsonb;
begin
  select * into a from public.ai_actions where id = p_action_id for update;
  if not found or not public.is_workspace_member(a.workspace_id) then
    raise exception 'ai action not found' using errcode = 'P0002';
  end if;
  if a.status <> 'proposed' then
    raise exception 'ai action is already %', a.status using errcode = '55000';
  end if;
  ws := a.workspace_id;

  insert into public.clients (id, workspace_id, name, email)
  select r.id, ws, r.name, r.email
  from jsonb_to_recordset(coalesce(p_rows -> 'clients', '[]')) as r(id uuid, name text, email text);

  insert into public.projects (id, workspace_id, client_id, title, due_date)
  select r.id, ws, r.client_id, r.title, r.due_date
  from jsonb_to_recordset(coalesce(p_rows -> 'projects', '[]'))
    as r(id uuid, client_id uuid, title text, due_date date);

  -- One statement, so subtasks may reference parents inserted alongside them.
  insert into public.tasks (
    id, workspace_id, project_id, client_id, parent_task_id, title, notes, due_date,
    priority, position, source, ai_action_id
  )
  select r.id, ws, r.project_id, r.client_id, r.parent_task_id, r.title, r.notes, r.due_date,
         coalesce(r.priority, 'none'), coalesce(r.position, 1024), 'ai', p_action_id
  from jsonb_to_recordset(coalesce(p_rows -> 'tasks', '[]'))
    as r(id uuid, project_id uuid, client_id uuid, parent_task_id uuid, title text, notes text,
         due_date date, priority public.task_priority, position double precision);

  insert into public.notes (id, workspace_id, client_id, project_id, title, content, content_text, ai_action_id)
  select r.id, ws, r.client_id, r.project_id, coalesce(r.title, ''), r.content,
         coalesce(r.content_text, ''), p_action_id
  from jsonb_to_recordset(coalesce(p_rows -> 'notes', '[]'))
    as r(id uuid, client_id uuid, project_id uuid, title text, content jsonb, content_text text);

  applied := jsonb_build_object(
    'clients', coalesce((select jsonb_agg(e -> 'id') from jsonb_array_elements(coalesce(p_rows -> 'clients', '[]')) e), '[]'),
    'projects', coalesce((select jsonb_agg(e -> 'id') from jsonb_array_elements(coalesce(p_rows -> 'projects', '[]')) e), '[]'),
    'tasks', coalesce((select jsonb_agg(e -> 'id') from jsonb_array_elements(coalesce(p_rows -> 'tasks', '[]')) e), '[]'),
    'notes', coalesce((select jsonb_agg(e -> 'id') from jsonb_array_elements(coalesce(p_rows -> 'notes', '[]')) e), '[]'),
    'applied_at', now()
  );

  update public.ai_actions
     set status = case when p_edited then 'edited' else 'accepted' end::public.ai_action_status,
         applied_changes = applied
   where id = p_action_id;

  if a.inbox_item_id is not null then
    update public.inbox_items set status = 'processed' where id = a.inbox_item_id;
  end if;

  return applied;
end;
$$;

-- Reverts exactly the rows an action created. If any of them changed since (edited,
-- completed, or given new subtasks), nothing is deleted unless p_force is true, so the
-- app can confirm first ("1 item was edited since").
create function public.undo_ai_action(p_action_id uuid, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.ai_actions;
  ws uuid;
  applied_at timestamptz;
  task_ids uuid[];
  note_ids uuid[];
  project_ids uuid[];
  client_ids uuid[];
  edited int;
begin
  select * into a from public.ai_actions where id = p_action_id for update;
  if not found or not public.is_workspace_member(a.workspace_id) then
    raise exception 'ai action not found' using errcode = 'P0002';
  end if;
  if a.status not in ('accepted', 'edited') then
    raise exception 'ai action is %', a.status using errcode = '55000';
  end if;
  ws := a.workspace_id;
  applied_at := (a.applied_changes ->> 'applied_at')::timestamptz;
  task_ids := array(select jsonb_array_elements_text(coalesce(a.applied_changes -> 'tasks', '[]'))::uuid);
  note_ids := array(select jsonb_array_elements_text(coalesce(a.applied_changes -> 'notes', '[]'))::uuid);
  project_ids := array(select jsonb_array_elements_text(coalesce(a.applied_changes -> 'projects', '[]'))::uuid);
  client_ids := array(select jsonb_array_elements_text(coalesce(a.applied_changes -> 'clients', '[]'))::uuid);

  edited :=
      (select count(*) from public.tasks t
        where t.workspace_id = ws
          and ((t.id = any(task_ids) and t.updated_at > applied_at)
               or (t.parent_task_id = any(task_ids) and not t.id = any(task_ids))))
    + (select count(*) from public.notes n where n.workspace_id = ws and n.id = any(note_ids) and n.updated_at > applied_at)
    + (select count(*) from public.projects p where p.workspace_id = ws and p.id = any(project_ids) and p.updated_at > applied_at)
    + (select count(*) from public.clients c where c.workspace_id = ws and c.id = any(client_ids) and c.updated_at > applied_at);

  if edited > 0 and not p_force then
    return jsonb_build_object('undone', false, 'edited_count', edited);
  end if;

  delete from public.tasks where workspace_id = ws and id = any(task_ids);
  delete from public.notes where workspace_id = ws and id = any(note_ids);
  delete from public.projects where workspace_id = ws and id = any(project_ids);
  delete from public.clients where workspace_id = ws and id = any(client_ids);

  update public.ai_actions set status = 'undone' where id = p_action_id;
  -- The dump goes back to the inbox so it can be processed again.
  if a.inbox_item_id is not null then
    update public.inbox_items set status = 'pending' where id = a.inbox_item_id;
  end if;

  return jsonb_build_object('undone', true, 'edited_count', edited);
end;
$$;

create function public.reject_ai_action(p_action_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.ai_actions;
begin
  select * into a from public.ai_actions where id = p_action_id for update;
  if not found or not public.is_workspace_member(a.workspace_id) then
    raise exception 'ai action not found' using errcode = 'P0002';
  end if;
  if a.status <> 'proposed' then
    raise exception 'ai action is already %', a.status using errcode = '55000';
  end if;
  update public.ai_actions set status = 'rejected' where id = p_action_id;
end;
$$;

revoke all on function public.apply_ai_action(uuid, jsonb, boolean) from public, anon;
revoke all on function public.undo_ai_action(uuid, boolean) from public, anon;
revoke all on function public.reject_ai_action(uuid) from public, anon;
grant execute on function public.apply_ai_action(uuid, jsonb, boolean) to authenticated;
grant execute on function public.undo_ai_action(uuid, boolean) to authenticated;
grant execute on function public.reject_ai_action(uuid) to authenticated;

-- Rate limiting counts recent actions per workspace.
create index ai_actions_workspace_type_created_idx on public.ai_actions (workspace_id, type, created_at desc);
