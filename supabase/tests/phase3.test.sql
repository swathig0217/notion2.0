-- Phase 3: push tokens, inbound address, inbox image storage, notification schedule.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

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
  ('aaaaaaaa-0000-4000-8000-0000000003a1', 'p3-a@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-0000000003b1', 'p3-b@test.local', 'authenticated', 'authenticated');
create temp table ids as select
  (select id from public.workspaces where owner_id = 'aaaaaaaa-0000-4000-8000-0000000003a1') as a_ws,
  (select id from public.workspaces where owner_id = 'bbbbbbbb-0000-4000-8000-0000000003b1') as b_ws,
  (select inbound_token from public.workspaces where owner_id = 'bbbbbbbb-0000-4000-8000-0000000003b1') as b_token;
grant select on ids to authenticated;

-- Defaults
select is((select notification_prefs from public.profiles where id = 'aaaaaaaa-0000-4000-8000-0000000003a1'),
  '{"digest": true, "digest_hour": 8, "nudges": true}'::jsonb, 'notification prefs default on at 8am');
select matches((select inbound_token from public.workspaces where id = (select a_ws from ids)), '^[a-f0-9]{16}$',
  'every workspace gets a random inbound token');
select isnt((select inbound_token from public.workspaces where id = (select a_ws from ids)), (select b_token from ids),
  'inbound tokens are unique per workspace');

insert into public.push_tokens (user_id, token, platform) values
  ('bbbbbbbb-0000-4000-8000-0000000003b1', 'ExponentPushToken[b-device]', 'ios');

-- ---------------------------------------------------------------------------
-- Push tokens: own rows only
-- ---------------------------------------------------------------------------
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-0000000003a1');
select lives_ok($$ insert into public.push_tokens (user_id, token, platform)
  values ('aaaaaaaa-0000-4000-8000-0000000003a1', 'ExponentPushToken[a-device]', 'android') $$, 'A registers a device');
select is((select count(*)::int from public.push_tokens), 1, 'A sees only their own push tokens');
select throws_ok($$ insert into public.push_tokens (user_id, token, platform)
  values ('bbbbbbbb-0000-4000-8000-0000000003b1', 'ExponentPushToken[evil]', 'ios') $$,
  '42501', null, 'A cannot register a token for B');
delete from public.push_tokens where token = 'ExponentPushToken[b-device]';

-- ---------------------------------------------------------------------------
-- Inbound token: members read their own; only the owner regenerates
-- ---------------------------------------------------------------------------
select is_empty($$ select 1 from public.workspaces where inbound_token = (select b_token from ids) $$,
  'A cannot read B''s inbound token');
select throws_ok($$ select public.regenerate_inbound_token((select b_ws from ids)) $$,
  'P0002', null, 'A cannot regenerate B''s address');
select matches(public.regenerate_inbound_token((select a_ws from ids)), '^[a-f0-9]{16}$', 'A regenerates their own address');

-- ---------------------------------------------------------------------------
-- Inbox image storage: per-workspace folders
-- ---------------------------------------------------------------------------
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id)
  select 'inbox', a_ws::text || '/shot.png', 'aaaaaaaa-0000-4000-8000-0000000003a1' from ids $$,
  'A uploads into their workspace folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
  select 'inbox', b_ws::text || '/shot.png', 'aaaaaaaa-0000-4000-8000-0000000003a1' from ids $$,
  '42501', null, 'A cannot upload into B''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
  values ('inbox', 'not-a-uuid/shot.png', 'aaaaaaaa-0000-4000-8000-0000000003a1') $$,
  '42501', null, 'malformed paths are rejected (no error leaks from the policy)');
select is((select count(*)::int from storage.objects where bucket_id = 'inbox'), 1, 'A sees only their own images');

select pg_temp.as_admin();
insert into storage.objects (bucket_id, name) select 'inbox', b_ws::text || '/b.png' from ids;
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-0000000003a1');
select is_empty($$ select 1 from storage.objects where name like (select b_ws::text from ids) || '/%' $$,
  'A cannot list B''s images');
select pg_temp.as_admin();

select is((select public from storage.buckets where id = 'inbox'), false, 'the inbox bucket is private');
select is((select file_size_limit from storage.buckets where id = 'inbox'), 5242880::bigint, 'images are capped at 5 MB');

-- ---------------------------------------------------------------------------
-- Schedule
-- ---------------------------------------------------------------------------
select is((select schedule from cron.job where jobname = 'send-notifications'), '5 * * * *',
  'notifications run hourly at :05');

select * from finish();
rollback;
