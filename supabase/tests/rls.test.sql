-- RLS policy tests: user A must never read, write, update, or delete user B's data.
begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

-- ---------------------------------------------------------------------------
-- Helpers (session-scoped, rolled back with the transaction)
-- ---------------------------------------------------------------------------
create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.ws(uid uuid) returns uuid language sql as $$
  select id from public.workspaces where owner_id = uid
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@test.local', 'authenticated', 'authenticated');

-- Signup trigger
select is((select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 1,
  'signup creates a profile');
select is((select display_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'a',
  'profile display name defaults to the email local part');
select isnt(pg_temp.ws('aaaaaaaa-0000-4000-8000-000000000001'), null, 'signup creates a workspace');
select is(
  (select role::text from public.workspace_members
    where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'owner', 'signup makes the user the workspace owner');
select is(
  (select count(*)::int from public.events
    where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' and name = 'signup_completed'),
  1, 'signup records a signup_completed event');

-- B's data, created as admin.
insert into public.clients (id, workspace_id, name) values
  ('bbbbbbbb-1111-4000-8000-000000000001', pg_temp.ws('bbbbbbbb-0000-4000-8000-000000000002'), 'B client');
insert into public.projects (id, workspace_id, client_id, title) values
  ('bbbbbbbb-2222-4000-8000-000000000001', pg_temp.ws('bbbbbbbb-0000-4000-8000-000000000002'),
   'bbbbbbbb-1111-4000-8000-000000000001', 'B project');
insert into public.tasks (id, workspace_id, project_id, title) values
  ('bbbbbbbb-3333-4000-8000-000000000001', pg_temp.ws('bbbbbbbb-0000-4000-8000-000000000002'),
   'bbbbbbbb-2222-4000-8000-000000000001', 'B task');
insert into public.notes (id, workspace_id, title) values
  ('bbbbbbbb-4444-4000-8000-000000000001', pg_temp.ws('bbbbbbbb-0000-4000-8000-000000000002'), 'B note');
insert into public.inbox_items (id, workspace_id, raw_content) values
  ('bbbbbbbb-5555-4000-8000-000000000001', pg_temp.ws('bbbbbbbb-0000-4000-8000-000000000002'), 'B dump');
insert into public.ai_actions (id, workspace_id, type) values
  ('bbbbbbbb-6666-4000-8000-000000000001', pg_temp.ws('bbbbbbbb-0000-4000-8000-000000000002'), 'process_inbox');
insert into public.time_entries (id, workspace_id, task_id, started_at) values
  ('bbbbbbbb-7777-4000-8000-000000000001', pg_temp.ws('bbbbbbbb-0000-4000-8000-000000000002'),
   'bbbbbbbb-3333-4000-8000-000000000001', now());
insert into public.events (workspace_id, user_id, name) values
  (pg_temp.ws('bbbbbbbb-0000-4000-8000-000000000002'), 'bbbbbbbb-0000-4000-8000-000000000002', 'signup');

-- A's own data.
insert into public.clients (id, workspace_id, name) values
  ('aaaaaaaa-1111-4000-8000-000000000001', pg_temp.ws('aaaaaaaa-0000-4000-8000-000000000001'), 'A client');
insert into public.ai_actions (id, workspace_id, type) values
  ('aaaaaaaa-6666-4000-8000-000000000001', pg_temp.ws('aaaaaaaa-0000-4000-8000-000000000001'), 'process_inbox');

-- Capture IDs before switching role (A cannot see B's workspace id under RLS).
create temp table ids as select
  pg_temp.ws('aaaaaaaa-0000-4000-8000-000000000001') as a_ws,
  pg_temp.ws('bbbbbbbb-0000-4000-8000-000000000002') as b_ws;
grant select on ids to authenticated, anon;

-- ---------------------------------------------------------------------------
-- SELECT isolation
-- ---------------------------------------------------------------------------
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');

select is((select count(*)::int from public.profiles), 1, 'A sees only their own profile');
select is((select count(*)::int from public.workspaces), 1, 'A sees only their own workspace');
select is((select count(*)::int from public.workspace_members), 1, 'A sees only their own memberships');
select is((select count(*)::int from public.clients), 1, 'A sees only their own clients');
select is_empty($$ select 1 from public.projects $$, 'A cannot see B projects');
select is_empty($$ select 1 from public.tasks $$, 'A cannot see B tasks');
select is_empty($$ select 1 from public.notes $$, 'A cannot see B notes');
select is_empty($$ select 1 from public.inbox_items $$, 'A cannot see B inbox items');
select is((select count(*)::int from public.ai_actions), 1, 'A sees only their own ai_actions');
select is_empty($$ select 1 from public.time_entries $$, 'A cannot see B time entries');
select is_empty($$ select 1 from public.events where user_id <> 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  'A cannot see B events');

-- ---------------------------------------------------------------------------
-- INSERT into B's workspace is rejected
-- ---------------------------------------------------------------------------
select throws_ok($$ insert into public.clients (workspace_id, name) select b_ws, 'x' from ids $$,
  '42501', null, 'A cannot insert a client into B workspace');
select throws_ok($$ insert into public.projects (workspace_id, title) select b_ws, 'x' from ids $$,
  '42501', null, 'A cannot insert a project into B workspace');
select throws_ok($$ insert into public.tasks (workspace_id, title) select b_ws, 'x' from ids $$,
  '42501', null, 'A cannot insert a task into B workspace');
select throws_ok($$ insert into public.notes (workspace_id, title) select b_ws, 'x' from ids $$,
  '42501', null, 'A cannot insert a note into B workspace');
select throws_ok($$ insert into public.inbox_items (workspace_id, raw_content) select b_ws, 'x' from ids $$,
  '42501', null, 'A cannot insert an inbox item into B workspace');
select throws_ok($$ insert into public.ai_actions (workspace_id, type) select b_ws, 'x' from ids $$,
  '42501', null, 'A cannot insert an ai_action into B workspace');
select throws_ok($$ insert into public.time_entries (workspace_id, started_at) select b_ws, now() from ids $$,
  '42501', null, 'A cannot insert a time entry into B workspace');
select throws_ok(
  $$ insert into public.events (workspace_id, user_id, name) select b_ws, 'bbbbbbbb-0000-4000-8000-000000000002', 'x' from ids $$,
  '42501', null, 'A cannot insert events for B');
select throws_ok(
  $$ insert into public.events (workspace_id, user_id, name) select a_ws, 'bbbbbbbb-0000-4000-8000-000000000002', 'x' from ids $$,
  '42501', null, 'A cannot insert events impersonating B in their own workspace');
select throws_ok(
  $$ insert into public.workspace_members (workspace_id, user_id, role) select b_ws, 'aaaaaaaa-0000-4000-8000-000000000001', 'owner' from ids $$,
  '42501', null, 'A cannot add themselves to B workspace');
select throws_ok($$ insert into public.workspaces (name, owner_id) values ('x', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  '42501', null, 'workspaces are created only by the signup trigger');

-- Cross-workspace references are rejected even from A's own workspace.
select throws_ok(
  $$ insert into public.tasks (workspace_id, client_id, title) select a_ws, 'bbbbbbbb-1111-4000-8000-000000000001', 'x' from ids $$,
  '23503', null, 'A task cannot reference B client');
select throws_ok(
  $$ insert into public.tasks (workspace_id, parent_task_id, title) select a_ws, 'bbbbbbbb-3333-4000-8000-000000000001', 'x' from ids $$,
  '23503', null, 'A subtask cannot reference B task');

-- Moving A's own row into B's workspace is rejected.
select throws_ok(
  $$ update public.clients set workspace_id = (select b_ws from ids) where id = 'aaaaaaaa-1111-4000-8000-000000000001' $$,
  '42501', null, 'A cannot move a client into B workspace');

-- ---------------------------------------------------------------------------
-- UPDATE / DELETE of B's rows silently affect nothing
-- ---------------------------------------------------------------------------
update public.clients set name = 'pwned' where id = 'bbbbbbbb-1111-4000-8000-000000000001';
update public.projects set title = 'pwned' where id = 'bbbbbbbb-2222-4000-8000-000000000001';
update public.tasks set title = 'pwned' where id = 'bbbbbbbb-3333-4000-8000-000000000001';
update public.notes set title = 'pwned' where id = 'bbbbbbbb-4444-4000-8000-000000000001';
update public.inbox_items set raw_content = 'pwned' where id = 'bbbbbbbb-5555-4000-8000-000000000001';
update public.ai_actions set type = 'pwned' where id = 'bbbbbbbb-6666-4000-8000-000000000001';
update public.time_entries set billable = false where id = 'bbbbbbbb-7777-4000-8000-000000000001';
update public.profiles set display_name = 'pwned' where id = 'bbbbbbbb-0000-4000-8000-000000000002';
update public.workspaces set name = 'pwned' where id = (select b_ws from ids);
delete from public.clients where id = 'bbbbbbbb-1111-4000-8000-000000000001';
delete from public.projects where id = 'bbbbbbbb-2222-4000-8000-000000000001';
delete from public.tasks where id = 'bbbbbbbb-3333-4000-8000-000000000001';
delete from public.notes where id = 'bbbbbbbb-4444-4000-8000-000000000001';
delete from public.inbox_items where id = 'bbbbbbbb-5555-4000-8000-000000000001';
delete from public.ai_actions where id = 'bbbbbbbb-6666-4000-8000-000000000001';
delete from public.time_entries where id = 'bbbbbbbb-7777-4000-8000-000000000001';
delete from public.events where user_id = 'bbbbbbbb-0000-4000-8000-000000000002';
delete from public.workspace_members where user_id = 'bbbbbbbb-0000-4000-8000-000000000002';

-- ai_actions are append-only for clients, even for the owner.
update public.ai_actions set status = 'accepted' where id = 'aaaaaaaa-6666-4000-8000-000000000001';
delete from public.ai_actions where id = 'aaaaaaaa-6666-4000-8000-000000000001';

select pg_temp.as_admin();

select is((select name from public.clients where id = 'bbbbbbbb-1111-4000-8000-000000000001'), 'B client',
  'A cannot update or delete B client');
select is((select title from public.projects where id = 'bbbbbbbb-2222-4000-8000-000000000001'), 'B project',
  'A cannot update or delete B project');
select is((select title from public.tasks where id = 'bbbbbbbb-3333-4000-8000-000000000001'), 'B task',
  'A cannot update or delete B task');
select is((select title from public.notes where id = 'bbbbbbbb-4444-4000-8000-000000000001'), 'B note',
  'A cannot update or delete B note');
select is((select raw_content from public.inbox_items where id = 'bbbbbbbb-5555-4000-8000-000000000001'), 'B dump',
  'A cannot update or delete B inbox item');
select is((select type from public.ai_actions where id = 'bbbbbbbb-6666-4000-8000-000000000001'), 'process_inbox',
  'A cannot update or delete B ai_action');
select is((select billable from public.time_entries where id = 'bbbbbbbb-7777-4000-8000-000000000001'), true,
  'A cannot update or delete B time entry');
select is((select count(*)::int from public.events where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'), 2,
  'A cannot delete B events');
select is((select display_name from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000002'), 'b',
  'A cannot update B profile');
select is((select name from public.workspaces where id = (select b_ws from ids)), 'My workspace',
  'A cannot rename B workspace');
select is((select count(*)::int from public.workspace_members where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'), 1,
  'A cannot remove B membership');
select is((select status::text from public.ai_actions where id = 'aaaaaaaa-6666-4000-8000-000000000001'), 'proposed',
  'ai_actions cannot be updated or deleted directly by clients');

-- ---------------------------------------------------------------------------
-- Anonymous users get nothing
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
select throws_ok($$ select * from public.clients $$, '42501', null, 'anon cannot read clients');
select throws_ok($$ select * from public.tasks $$, '42501', null, 'anon cannot read tasks');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'anon cannot call delete_my_account');

-- ---------------------------------------------------------------------------
-- Owner CRUD works and task completion is consistent
-- ---------------------------------------------------------------------------
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.tasks (id, workspace_id, client_id, title)
  select 'aaaaaaaa-3333-4000-8000-000000000001', a_ws, 'aaaaaaaa-1111-4000-8000-000000000001', 'A task' from ids;
update public.tasks set status = 'done' where id = 'aaaaaaaa-3333-4000-8000-000000000001';
select isnt((select completed_at from public.tasks where id = 'aaaaaaaa-3333-4000-8000-000000000001'), null,
  'completing a task sets completed_at');
update public.tasks set status = 'todo' where id = 'aaaaaaaa-3333-4000-8000-000000000001';
select is((select completed_at from public.tasks where id = 'aaaaaaaa-3333-4000-8000-000000000001'), null,
  'reopening a task clears completed_at');

-- Deleting a client keeps its tasks (client reference is cleared).
delete from public.clients where id = 'aaaaaaaa-1111-4000-8000-000000000001';
select is((select client_id from public.tasks where id = 'aaaaaaaa-3333-4000-8000-000000000001'), null,
  'deleting a client keeps tasks and clears client_id');
select is((select workspace_id from public.tasks where id = 'aaaaaaaa-3333-4000-8000-000000000001'),
  (select a_ws from ids), 'deleting a client does not clear the task workspace');

-- ---------------------------------------------------------------------------
-- Account deletion removes everything
-- ---------------------------------------------------------------------------
select public.delete_my_account();
select pg_temp.as_admin();
select is((select count(*)::int from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0,
  'delete_my_account removes the auth user');
select is((select count(*)::int from public.workspaces where id = (select a_ws from ids)), 0,
  'delete_my_account removes the workspace');
select is((select count(*)::int from public.tasks where workspace_id = (select a_ws from ids))
        + (select count(*)::int from public.ai_actions where workspace_id = (select a_ws from ids))
        + (select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0,
  'delete_my_account removes all workspace data and the profile');
select is((select count(*)::int from public.clients where workspace_id = (select b_ws from ids)), 1,
  'deleting A leaves B untouched');

select * from finish();
rollback;
