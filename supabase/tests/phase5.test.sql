-- Phase 5: client share links.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

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
  ('aaaaaaaa-0000-4000-8000-0000000005a1', 'p5-a@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-0000000005b1', 'p5-b@test.local', 'authenticated', 'authenticated');
create temp table ids as select
  (select id from public.workspaces where owner_id = 'aaaaaaaa-0000-4000-8000-0000000005a1') as a_ws,
  (select id from public.workspaces where owner_id = 'bbbbbbbb-0000-4000-8000-0000000005b1') as b_ws;
grant select on ids to authenticated;
insert into public.projects (id, workspace_id, title)
  select 'cccccccc-0000-4000-8000-0000000005c1', a_ws, 'Rebrand' from ids;
insert into public.projects (id, workspace_id, title)
  select 'cccccccc-0000-4000-8000-0000000005c2', b_ws, 'B project' from ids;

select pg_temp.as_user('aaaaaaaa-0000-4000-8000-0000000005a1');
select lives_ok($$ insert into public.share_links (workspace_id, project_id, token)
  select a_ws, 'cccccccc-0000-4000-8000-0000000005c1', repeat('a1', 16) from ids $$, 'A shares their project');
select throws_ok($$ insert into public.share_links (workspace_id, project_id, token)
  select a_ws, 'cccccccc-0000-4000-8000-0000000005c1', repeat('b2', 16) from ids $$,
  '23505', null, 'one link per project');
select throws_ok($$ insert into public.share_links (workspace_id, project_id, token)
  select a_ws, 'cccccccc-0000-4000-8000-0000000005c2', repeat('c3', 16) from ids $$,
  '23503', null, 'A cannot link B''s project into their workspace');
select throws_ok($$ insert into public.share_links (workspace_id, project_id, token)
  select b_ws, 'cccccccc-0000-4000-8000-0000000005c2', repeat('d4', 16) from ids $$,
  '42501', null, 'A cannot create links in B''s workspace');
select throws_ok($$ insert into public.share_links (workspace_id, project_id, token)
  select a_ws, 'cccccccc-0000-4000-8000-0000000005c1', 'short' from ids $$,
  '23514', null, 'tokens must be 128-bit hex');
select throws_ok($$ update public.share_links set view_count = 999 $$, '42501', null,
  'users cannot fake view counts');
select lives_ok($$ update public.share_links set hidden_task_ids = array['dddddddd-0000-4000-8000-0000000005d1'::uuid] $$,
  'A hides a task from the client');
select throws_ok($$ select public.record_share_view(repeat('a1', 16)) $$, '42501', null,
  'users cannot call record_share_view');

select pg_temp.as_user('bbbbbbbb-0000-4000-8000-0000000005b1');
select is_empty($$ select 1 from public.share_links $$, 'B cannot see A''s links (or tokens)');

select pg_temp.as_admin();
select public.record_share_view(repeat('a1', 16));
select is((select view_count from public.share_links where token = repeat('a1', 16)), 1,
  'views are counted by the server');

select pg_temp.as_user('aaaaaaaa-0000-4000-8000-0000000005a1');
select lives_ok($$ delete from public.share_links where project_id = 'cccccccc-0000-4000-8000-0000000005c1' $$,
  'A turns the link off');
insert into public.share_links (workspace_id, project_id, token)
  select a_ws, 'cccccccc-0000-4000-8000-0000000005c1', repeat('e5', 16) from ids;
delete from public.projects where id = 'cccccccc-0000-4000-8000-0000000005c1';
select is((select count(*)::int from public.share_links), 0, 'deleting the project removes its link');

select * from finish();
rollback;
