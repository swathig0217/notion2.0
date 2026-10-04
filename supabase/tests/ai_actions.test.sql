-- apply / undo / reject for AI actions: exact effects, one transaction, membership enforced.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'ai-a@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'ai-b@test.local', 'authenticated', 'authenticated');

create temp table ids as select
  (select id from public.workspaces where owner_id = 'aaaaaaaa-0000-4000-8000-0000000000a1') as a_ws,
  (select id from public.workspaces where owner_id = 'bbbbbbbb-0000-4000-8000-0000000000b1') as b_ws;
grant select on ids to authenticated;

insert into public.inbox_items (id, workspace_id, raw_content)
  select 'aaaaaaaa-5555-4000-8000-0000000000a1', a_ws, 'Acme wants a logo by Friday' from ids;
insert into public.ai_actions (id, workspace_id, inbox_item_id, type, proposed_changes)
  select 'aaaaaaaa-6666-4000-8000-0000000000a1', a_ws, 'aaaaaaaa-5555-4000-8000-0000000000a1', 'process_inbox', '{}' from ids;
insert into public.ai_actions (id, workspace_id, type, proposed_changes)
  select 'aaaaaaaa-6666-4000-8000-0000000000a2', a_ws, 'process_inbox', '{}' from ids;
insert into public.ai_actions (id, workspace_id, type, proposed_changes)
  select 'bbbbbbbb-6666-4000-8000-0000000000b1', b_ws, 'process_inbox', '{}' from ids;

create temp table rows_json as select '{
  "clients":  [{"id": "aaaaaaaa-1111-4000-8000-0000000000c1", "name": "Acme", "email": null}],
  "projects": [{"id": "aaaaaaaa-2222-4000-8000-0000000000d1", "client_id": "aaaaaaaa-1111-4000-8000-0000000000c1", "title": "Logo", "due_date": null}],
  "tasks": [
    {"id": "aaaaaaaa-3333-4000-8000-0000000000e1", "client_id": "aaaaaaaa-1111-4000-8000-0000000000c1", "project_id": "aaaaaaaa-2222-4000-8000-0000000000d1", "parent_task_id": null, "title": "Sketch logo", "notes": null, "due_date": "2026-10-09", "priority": "high", "position": 1024},
    {"id": "aaaaaaaa-3333-4000-8000-0000000000e2", "client_id": "aaaaaaaa-1111-4000-8000-0000000000c1", "project_id": "aaaaaaaa-2222-4000-8000-0000000000d1", "parent_task_id": "aaaaaaaa-3333-4000-8000-0000000000e1", "title": "Three directions", "notes": null, "due_date": null, "priority": "none", "position": 1024}
  ],
  "notes": [{"id": "aaaaaaaa-4444-4000-8000-0000000000a9", "client_id": null, "project_id": null, "title": "Brief", "content": {"type": "doc"}, "content_text": "Brief"}]
}'::jsonb as j;
grant select on rows_json to authenticated;

-- ---------------------------------------------------------------------------
-- Membership
-- ---------------------------------------------------------------------------
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-0000000000a1');
select throws_ok($$ select public.apply_ai_action('bbbbbbbb-6666-4000-8000-0000000000b1', '{}'::jsonb) $$,
  'P0002', null, 'A cannot apply B''s action');
select throws_ok($$ select public.reject_ai_action('bbbbbbbb-6666-4000-8000-0000000000b1') $$,
  'P0002', null, 'A cannot reject B''s action');
select throws_ok($$ select public.undo_ai_action('bbbbbbbb-6666-4000-8000-0000000000b1') $$,
  'P0002', null, 'A cannot undo B''s action');

-- ---------------------------------------------------------------------------
-- Apply
-- ---------------------------------------------------------------------------
select lives_ok($$ select public.apply_ai_action('aaaaaaaa-6666-4000-8000-0000000000a1', (select j from rows_json)) $$,
  'A applies their proposal');
select is((select count(*)::int from public.clients where id = 'aaaaaaaa-1111-4000-8000-0000000000c1'), 1, 'client created');
select is((select count(*)::int from public.tasks where ai_action_id = 'aaaaaaaa-6666-4000-8000-0000000000a1'), 2,
  'tasks and subtasks created and linked to the action');
select is((select source::text from public.tasks where id = 'aaaaaaaa-3333-4000-8000-0000000000e1'), 'ai', 'tasks are marked source=ai');
select is((select parent_task_id from public.tasks where id = 'aaaaaaaa-3333-4000-8000-0000000000e2'),
  'aaaaaaaa-3333-4000-8000-0000000000e1'::uuid, 'subtask points at its parent');
select is((select status::text from public.ai_actions where id = 'aaaaaaaa-6666-4000-8000-0000000000a1'), 'accepted', 'status accepted');
select is((select jsonb_array_length(applied_changes -> 'tasks') from public.ai_actions where id = 'aaaaaaaa-6666-4000-8000-0000000000a1'), 2,
  'applied_changes records exactly what was created');
select is((select status::text from public.inbox_items where id = 'aaaaaaaa-5555-4000-8000-0000000000a1'), 'processed', 'inbox item processed');
select throws_ok($$ select public.apply_ai_action('aaaaaaaa-6666-4000-8000-0000000000a1', '{}'::jsonb) $$,
  '55000', null, 'an action cannot be applied twice');

-- Rows are forced into the action's workspace: references to B's data fail and nothing is kept.
select throws_ok($$ select public.apply_ai_action('aaaaaaaa-6666-4000-8000-0000000000a2',
  '{"tasks": [{"id": "aaaaaaaa-3333-4000-8000-0000000000f1", "title": "x", "client_id": null, "project_id": null, "parent_task_id": null, "notes": null, "due_date": null, "priority": "none", "position": 1}],
    "projects": [{"id": "aaaaaaaa-2222-4000-8000-0000000000f2", "client_id": "bbbbbbbb-1111-4000-8000-0000000000ff", "title": "x", "due_date": null}]}'::jsonb) $$,
  '23503', null, 'cannot link to another workspace''s client');
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-3333-4000-8000-0000000000f1'), 0,
  'a failed apply leaves nothing behind (one transaction)');
select is((select status::text from public.ai_actions where id = 'aaaaaaaa-6666-4000-8000-0000000000a2'), 'proposed',
  'a failed apply leaves the action proposed');

-- ---------------------------------------------------------------------------
-- Undo
-- ---------------------------------------------------------------------------
-- Simulate a later user edit. The test is one transaction (now() is constant), so move the
-- apply and the created rows back in time (triggers off), then edit one task normally.
select pg_temp.as_admin();
set local session_replication_role = replica;
update public.ai_actions
   set applied_changes = jsonb_set(applied_changes, '{applied_at}', to_jsonb(now() - interval '1 minute'))
 where id = 'aaaaaaaa-6666-4000-8000-0000000000a1';
update public.tasks set updated_at = now() - interval '1 minute' where ai_action_id = 'aaaaaaaa-6666-4000-8000-0000000000a1';
update public.notes set updated_at = now() - interval '1 minute' where ai_action_id = 'aaaaaaaa-6666-4000-8000-0000000000a1';
update public.projects set updated_at = now() - interval '1 minute' where id = 'aaaaaaaa-2222-4000-8000-0000000000d1';
update public.clients set updated_at = now() - interval '1 minute' where id = 'aaaaaaaa-1111-4000-8000-0000000000c1';
set local session_replication_role = origin;
update public.tasks set title = 'Sketch logo (edited)' where id = 'aaaaaaaa-3333-4000-8000-0000000000e2';
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-0000000000a1');

select is(public.undo_ai_action('aaaaaaaa-6666-4000-8000-0000000000a1'),
  '{"undone": false, "edited_count": 1}'::jsonb, 'undo reports edits since apply and waits for confirmation');
select is((select count(*)::int from public.tasks where ai_action_id = 'aaaaaaaa-6666-4000-8000-0000000000a1'), 2,
  'nothing deleted without confirmation');
select is(public.undo_ai_action('aaaaaaaa-6666-4000-8000-0000000000a1', true),
  '{"undone": true, "edited_count": 1}'::jsonb, 'forced undo proceeds');
select is((select count(*)::int from public.tasks where ai_action_id = 'aaaaaaaa-6666-4000-8000-0000000000a1'), 0, 'tasks removed');
select is((select count(*)::int from public.clients where id = 'aaaaaaaa-1111-4000-8000-0000000000c1')
        + (select count(*)::int from public.projects where id = 'aaaaaaaa-2222-4000-8000-0000000000d1')
        + (select count(*)::int from public.notes where id = 'aaaaaaaa-4444-4000-8000-0000000000a9'), 0,
  'client, project and note removed');
select is((select status::text from public.ai_actions where id = 'aaaaaaaa-6666-4000-8000-0000000000a1'), 'undone', 'status undone');
select is((select status::text from public.inbox_items where id = 'aaaaaaaa-5555-4000-8000-0000000000a1'), 'pending',
  'the dump returns to the inbox');

-- ---------------------------------------------------------------------------
-- Reject
-- ---------------------------------------------------------------------------
select lives_ok($$ select public.reject_ai_action('aaaaaaaa-6666-4000-8000-0000000000a2') $$, 'A rejects a proposal');
select is((select status::text from public.ai_actions where id = 'aaaaaaaa-6666-4000-8000-0000000000a2'), 'rejected', 'status rejected');

select * from finish();
rollback;
