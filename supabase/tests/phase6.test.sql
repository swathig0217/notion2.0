-- Phase 6: calendar token, webhooks and the delivery outbox.
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
  ('aaaaaaaa-0000-4000-8000-0000000006a1', 'p6-a@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-0000000006b1', 'p6-b@test.local', 'authenticated', 'authenticated');
create temp table ids as select
  (select id from public.workspaces where owner_id = 'aaaaaaaa-0000-4000-8000-0000000006a1') as a_ws,
  (select id from public.workspaces where owner_id = 'bbbbbbbb-0000-4000-8000-0000000006b1') as b_ws;
grant select on ids to authenticated;

select pg_temp.as_user('aaaaaaaa-0000-4000-8000-0000000006a1');
-- Calendar token
select lives_ok($$ update public.workspaces set calendar_token = repeat('ab', 16) where id = (select a_ws from ids) $$,
  'the owner turns on the calendar feed');
select throws_ok($$ update public.workspaces set calendar_token = 'nope' where id = (select a_ws from ids) $$,
  '23514', null, 'calendar tokens are 128-bit hex');

-- Webhooks
select lives_ok($$ insert into public.webhooks (id, workspace_id, url, secret, events)
  select 'eeeeeeee-0000-4000-8000-0000000006e1', a_ws, 'https://hooks.example.com/a', repeat('cd', 32),
         array['task.created', 'task.completed', 'invoice.paid', 'client.created'] from ids $$,
  'A adds a webhook');
select throws_ok($$ insert into public.webhooks (workspace_id, url, secret, events)
  select a_ws, 'https://x.example.com', repeat('cd', 32), array['task.deleted'] from ids $$,
  '23514', null, 'only known events');
select throws_ok($$ insert into public.webhooks (workspace_id, url, secret, events)
  select a_ws, 'ftp://x.example.com', repeat('cd', 32), array['task.created'] from ids $$,
  '23514', null, 'only http(s) URLs');
select throws_ok($$ insert into public.webhooks (workspace_id, url, secret, events)
  select b_ws, 'https://x.example.com', repeat('cd', 32), array['task.created'] from ids $$,
  '42501', null, 'A cannot add webhooks to B''s workspace');
select throws_ok($$ insert into public.webhook_deliveries (workspace_id, webhook_id, event, payload)
  select a_ws, 'eeeeeeee-0000-4000-8000-0000000006e1', 'task.created', '{}' from ids $$,
  '42501', null, 'users cannot write the delivery log');

-- Events are queued by triggers
insert into public.clients (id, workspace_id, name) select 'cccccccc-0000-4000-8000-0000000006c1', a_ws, 'Acme' from ids;
insert into public.tasks (id, workspace_id, client_id, title)
  select 'dddddddd-0000-4000-8000-0000000006d1', a_ws, 'cccccccc-0000-4000-8000-0000000006c1', 'Logo' from ids;
update public.tasks set status = 'done' where id = 'dddddddd-0000-4000-8000-0000000006d1';
update public.tasks set title = 'Logo v2' where id = 'dddddddd-0000-4000-8000-0000000006d1';
select set_eq($$ select event from public.webhook_deliveries $$,
  array['client.created', 'task.created', 'task.completed'],
  'client.created, task.created and task.completed are queued (a rename is not an event)');
select is((select payload -> 'data' ->> 'client' from public.webhook_deliveries where event = 'task.completed'), 'Acme',
  'task payloads include the client name');
select ok((select not (payload -> 'data' ? 'notes') from public.webhook_deliveries where event = 'task.created'),
  'task payloads never include notes');

-- Invoice events follow status; unsubscribed events are skipped
insert into public.invoices (id, workspace_id, client_name, number, issue_date, currency)
  select 'ffffffff-0000-4000-8000-0000000006f1', a_ws, 'Acme', 'INV-0001', '2026-10-04', 'USD' from ids;
update public.invoices set status = 'sent' where id = 'ffffffff-0000-4000-8000-0000000006f1';
update public.invoices set status = 'paid' where id = 'ffffffff-0000-4000-8000-0000000006f1';
select is((select count(*)::int from public.webhook_deliveries where event like 'invoice.%'), 1,
  'only subscribed invoice events are queued (paid, not sent)');

-- Disabled webhooks get nothing; test events still work
update public.webhooks set enabled = false;
insert into public.tasks (workspace_id, title) select a_ws, 'Quiet' from ids;
select is((select count(*)::int from public.webhook_deliveries where event = 'task.created'), 1,
  'disabled webhooks queue nothing');
select lives_ok($$ select public.send_test_webhook('eeeeeeee-0000-4000-8000-0000000006e1') $$, 'A sends a test event');

select pg_temp.as_user('bbbbbbbb-0000-4000-8000-0000000006b1');
select is_empty($$ select 1 from public.webhooks union all select 1 from public.webhook_deliveries $$,
  'B cannot see A''s webhooks, secrets or deliveries');
select throws_ok($$ select public.send_test_webhook('eeeeeeee-0000-4000-8000-0000000006e1') $$, 'P0002', null,
  'B cannot trigger A''s webhook');

select pg_temp.as_admin();
insert into public.webhooks (workspace_id, url, secret, events)
  select a_ws, 'https://h' || n || '.example.com', repeat('cd', 32), array['task.created'] from ids, generate_series(2, 5) n;
select throws_ok($$ insert into public.webhooks (workspace_id, url, secret, events)
  select a_ws, 'https://h6.example.com', repeat('cd', 32), array['task.created'] from ids $$,
  'P0001', 'webhook_limit', 'at most 5 webhooks per workspace');

select is((select schedule from cron.job where jobname = 'deliver-webhooks'), '* * * * *', 'deliveries run every minute');

select * from finish();
rollback;
