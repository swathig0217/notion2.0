-- Phase 4: plans and limits, invoicing, launch metrics, deletion completeness.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

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
  ('aaaaaaaa-0000-4000-8000-0000000004a1', 'p4-a@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-0000000004b1', 'p4-b@test.local', 'authenticated', 'authenticated');
create temp table ids as select
  (select id from public.workspaces where owner_id = 'aaaaaaaa-0000-4000-8000-0000000004a1') as a_ws,
  (select id from public.workspaces where owner_id = 'bbbbbbbb-0000-4000-8000-0000000004b1') as b_ws;
grant select on ids to authenticated;

-- ---------------------------------------------------------------------------
-- Inventory: every public table must be in the data export and deletion paths.
-- If this fails after adding a table, update EXPORT_TABLES in
-- packages/shared/src/export/export.ts and this list.
-- ---------------------------------------------------------------------------
select set_eq(
  $$ select table_name::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' $$,
  array['profiles', 'workspaces', 'workspace_members', 'clients', 'projects', 'tasks', 'notes',
        'inbox_items', 'ai_actions', 'time_entries', 'events', 'push_tokens', 'subscriptions',
        'invoices', 'invoice_items', 'share_links', 'webhooks', 'webhook_deliveries'],
  'public tables match the export/deletion inventory');

select is(public.plan_limits(), '{"free": {"active_clients": 3, "ai_actions_per_month": 30}}'::jsonb,
  'free limits: 3 active clients, 30 AI actions a month');

-- ---------------------------------------------------------------------------
-- Subscriptions: members read, nobody writes from the client
-- ---------------------------------------------------------------------------
insert into public.subscriptions (workspace_id, plan) select b_ws, 'pro' from ids;

select pg_temp.as_user('aaaaaaaa-0000-4000-8000-0000000004a1');
select is_empty($$ select 1 from public.subscriptions $$, 'A cannot see B''s subscription');
select throws_ok($$ insert into public.subscriptions (workspace_id, plan) select a_ws, 'pro' from ids $$,
  '42501', null, 'A cannot grant themselves Pro');
select is((select public.workspace_usage(a_ws) ->> 'plan' from ids), 'free', 'A is on the free plan');
select throws_ok($$ select public.workspace_usage(b_ws) from ids $$, 'P0002', null, 'A cannot read B''s usage');

-- ---------------------------------------------------------------------------
-- Client limit (free): 3 active, samples don't count, archived don't count
-- ---------------------------------------------------------------------------
insert into public.clients (workspace_id, name) select a_ws, 'Northwind Bakery (sample)' from ids;
insert into public.clients (workspace_id, name) select a_ws, 'Bolt Fitness (sample)' from ids;
insert into public.clients (id, workspace_id, name) select 'cccccccc-0000-4000-8000-0000000004c1', a_ws, 'Acme' from ids;
insert into public.clients (workspace_id, name) select a_ws, 'Globex' from ids;
insert into public.clients (id, workspace_id, name) select 'cccccccc-0000-4000-8000-0000000004c3', a_ws, 'Initech' from ids;
select is((select (public.workspace_usage(a_ws) ->> 'active_clients')::int from ids), 3,
  'usage counts 3 real active clients (samples excluded)');
select throws_ok($$ insert into public.clients (workspace_id, name) select a_ws, 'Umbrella' from ids $$,
  'P0001', 'plan_limit_clients', 'a 4th active client is blocked on free');
select lives_ok($$ insert into public.clients (workspace_id, name, status) select a_ws, 'Old client', 'archived' from ids $$,
  'archived clients can still be added');
select throws_ok($$ update public.clients set status = 'active' where name = 'Old client' $$,
  'P0001', 'plan_limit_clients', 'un-archiving past the limit is blocked');
select throws_ok($$ update public.clients set name = 'Bolt Fitness' where name = 'Bolt Fitness (sample)' $$,
  'P0001', 'plan_limit_clients', 'renaming a sample into a real client past the limit is blocked');
select lives_ok($$ update public.clients set name = 'Acme Corp' where name = 'Acme' $$,
  'renaming an existing real client is fine');
update public.clients set status = 'archived' where name = 'Globex';
select lives_ok($$ insert into public.clients (workspace_id, name) select a_ws, 'Umbrella' from ids $$,
  'archiving frees a slot');

-- AI usage: only metered types count
select pg_temp.as_admin();
insert into public.ai_actions (workspace_id, type) select a_ws, t
  from ids, unnest(array['process_inbox', 'process_inbox', 'client_update', 'follow_up', 'generate_workspace', 'weekly_brief']) t;
insert into public.ai_actions (workspace_id, type, created_at) select a_ws, 'process_inbox', now() - interval '40 days' from ids;
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-0000000004a1');
select is((select (public.workspace_usage(a_ws) ->> 'ai_actions_used')::int from ids), 4,
  'AI usage counts inbox + drafts this month; onboarding, brief and last month are free');
select is((select (public.workspace_usage(a_ws) ->> 'ai_action_limit')::int from ids), 30, 'free AI limit is reported');

-- Pro: no limits
select pg_temp.as_admin();
insert into public.subscriptions (workspace_id, plan, status, current_period_end)
  select a_ws, 'pro', 'active', now() + interval '1 month' from ids;
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-0000000004a1');
select is((select public.workspace_usage(a_ws) ->> 'plan' from ids), 'pro', 'an active subscription makes the workspace Pro');
select ok((select public.workspace_usage(a_ws) -> 'client_limit' = 'null'::jsonb from ids), 'Pro has no client limit');
select lives_ok($$ insert into public.clients (workspace_id, name) select a_ws, 'Hooli' from ids $$, 'Pro adds clients freely');
select pg_temp.as_admin();
update public.subscriptions set current_period_end = now() - interval '1 day' where workspace_id = (select a_ws from ids);
select is((select public.workspace_usage(a_ws) ->> 'plan' from ids), 'free', 'an expired period falls back to free');
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-0000000004a1');
select lives_ok($$ update public.clients set notes = 'still editable' where name = 'Hooli' $$,
  'over-limit clients stay editable after a downgrade');

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
insert into public.tasks (id, workspace_id, client_id, title)
  select 'dddddddd-0000-4000-8000-0000000004d1', a_ws, 'cccccccc-0000-4000-8000-0000000004c1', 'Design homepage' from ids;
insert into public.time_entries (id, workspace_id, task_id, started_at, ended_at, minutes)
  select 'eeeeeeee-0000-4000-8000-0000000004e1', a_ws, 'dddddddd-0000-4000-8000-0000000004d1', now() - interval '2 hours', now() - interval '30 minutes', 90 from ids;
insert into public.time_entries (id, workspace_id, task_id, started_at, ended_at, minutes)
  select 'eeeeeeee-0000-4000-8000-0000000004e2', a_ws, 'dddddddd-0000-4000-8000-0000000004d1', now() - interval '1 hour', now(), 60 from ids;

create temp table inv as select jsonb_build_object(
  'id', 'ffffffff-0000-4000-8000-0000000004f1', 'workspace_id', a_ws, 'client_id', 'cccccccc-0000-4000-8000-0000000004c1',
  'client_name', 'Acme Corp', 'client_email', null, 'issue_date', '2026-10-04', 'due_date', '2026-10-18',
  'currency', 'USD', 'notes', null) as payload from ids;
grant select on inv to authenticated;

select is((select public.save_invoice(payload,
  '[{"description": "Design homepage", "quantity": 2.5, "unit_price_cents": 10000, "task_id": "dddddddd-0000-4000-8000-0000000004d1"},
    {"description": "Hosting", "quantity": 1, "unit_price_cents": 2550}]'::jsonb,
  array['eeeeeeee-0000-4000-8000-0000000004e1', 'eeeeeeee-0000-4000-8000-0000000004e2']::uuid[]) from inv),
  'INV-0001', 'first invoice is INV-0001');
select is((select total_cents from public.invoices where id = 'ffffffff-0000-4000-8000-0000000004f1'), 27550::bigint,
  'total = sum(quantity x unit price)');
select is((select count(*)::int from public.time_entries where invoice_id = 'ffffffff-0000-4000-8000-0000000004f1'), 2,
  'billed time entries point at the invoice');

-- Replay (offline queue) / edit: same number, items replaced, time re-linked
select is((select public.save_invoice(payload,
  '[{"description": "Design homepage", "quantity": 1.5, "unit_price_cents": 10000}]'::jsonb,
  array['eeeeeeee-0000-4000-8000-0000000004e1']::uuid[]) from inv), 'INV-0001', 'saving again keeps the number');
select is((select count(*)::int from public.invoice_items where invoice_id = 'ffffffff-0000-4000-8000-0000000004f1'), 1,
  'items are replaced, not appended');
select is((select invoice_id from public.time_entries where id = 'eeeeeeee-0000-4000-8000-0000000004e2'), null,
  'time dropped from the invoice is released');
select throws_ok($$ select public.save_invoice(payload, '[]'::jsonb, null) from inv $$, '22023', null,
  'an invoice needs at least one line');

update public.invoices set status = 'sent', sent_at = now() where id = 'ffffffff-0000-4000-8000-0000000004f1';
select throws_ok($$ select public.save_invoice(payload, '[{"description": "x", "quantity": 1, "unit_price_cents": 1}]'::jsonb, null) from inv $$,
  '22023', null, 'sent invoices cannot be edited');

select is((select public.save_invoice(jsonb_set(payload, '{id}', '"ffffffff-0000-4000-8000-0000000004f2"'),
  '[{"description": "Retainer", "quantity": 1, "unit_price_cents": 50000}]'::jsonb, null) from inv),
  'INV-0002', 'numbers are sequential per workspace');
delete from public.invoices where id = 'ffffffff-0000-4000-8000-0000000004f2';
select is((select count(*)::int from public.invoice_items where invoice_id = 'ffffffff-0000-4000-8000-0000000004f2'), 0,
  'deleting a draft deletes its lines');

-- Isolation
select pg_temp.as_user('bbbbbbbb-0000-4000-8000-0000000004b1');
select is_empty($$ select 1 from public.invoices $$, 'B cannot see A''s invoices');
select throws_ok($$ select public.save_invoice(jsonb_set(payload, '{id}', '"ffffffff-0000-4000-8000-0000000004f9"'),
  '[{"description": "x", "quantity": 1, "unit_price_cents": 1}]'::jsonb, null) from inv $$,
  'P0002', null, 'B cannot create invoices in A''s workspace');

-- Launch metrics are private
select throws_ok($$ select * from analytics.launch_metrics $$, '42501', null, 'users cannot read launch metrics');

-- ---------------------------------------------------------------------------
-- Deletion completeness: nothing of A survives in any table with a workspace_id
-- ---------------------------------------------------------------------------
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-0000000004a1');
select public.delete_my_account();
select pg_temp.as_admin();
create function pg_temp.rows_left(ws uuid) returns int language plpgsql as $$
declare t text; n int; total int := 0;
begin
  for t in select table_name from information_schema.columns
           where table_schema = 'public' and column_name = 'workspace_id' loop
    execute format('select count(*) from public.%I where workspace_id = $1', t) into n using ws;
    total := total + n;
  end loop;
  return total;
end $$;
select is(pg_temp.rows_left((select a_ws from ids)), 0, 'account deletion leaves no workspace rows in any table');

select * from finish();
rollback;
