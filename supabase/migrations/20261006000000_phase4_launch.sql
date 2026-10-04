-- Phase 4 (approved 2026-10-04): plans and free-tier limits (billing stubbed), invoicing
-- from time and tasks, and launch metrics.

-- ---------------------------------------------------------------------------
-- Subscriptions: one row per workspace, written only by the server (billing function or
-- provider webhooks). No row means the free plan.
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'canceled')),
  provider text not null default 'stub' check (provider in ('stub', 'revenuecat', 'stripe')),
  billing_interval text check (billing_interval in ('month', 'year')),
  provider_customer_id text check (char_length(provider_customer_id) <= 255),
  provider_subscription_id text check (char_length(provider_subscription_id) <= 255),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- Free-tier limits. Mirrored in packages/shared/src/plans/plans.ts (tested to match).
create function public.plan_limits() returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"free": {"active_clients": 3, "ai_actions_per_month": 30}}'::jsonb;
$$;

create function public.workspace_is_pro(ws uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.workspace_id = ws
      and s.plan = 'pro'
      and s.status in ('active', 'trialing', 'past_due')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- Sample clients from onboarding ("… (sample)") never count toward the limit.
create function public.is_sample_client_name(name text) returns boolean
language sql
immutable
set search_path = ''
as $$
  select name like '% (sample)';
$$;

-- AI actions that count toward the monthly limit. Onboarding and the weekly brief are free.
create function public.metered_ai_action_type(t text) returns boolean
language sql
immutable
set search_path = ''
as $$
  select t in ('process_inbox', 'client_update', 'follow_up');
$$;

-- Plan + usage for the paywall, Settings, and edge-function checks. Months are UTC.
create function public.workspace_usage(ws uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  limits jsonb := public.plan_limits() -> 'free';
  pro boolean;
  period_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  clients int;
  ai int;
begin
  -- Signed-in users see their own workspaces. Callers without a user (the service role
  -- in edge functions) see any; anon has no execute grant.
  if (select auth.uid()) is not null and not public.is_workspace_member(ws) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  pro := public.workspace_is_pro(ws);
  select count(*) into clients from public.clients c
   where c.workspace_id = ws and c.status = 'active' and not public.is_sample_client_name(c.name);
  select count(*) into ai from public.ai_actions a
   where a.workspace_id = ws and a.created_at >= period_start and public.metered_ai_action_type(a.type);
  return jsonb_build_object(
    'plan', case when pro then 'pro' else 'free' end,
    'active_clients', clients,
    'client_limit', case when pro then null else limits -> 'active_clients' end,
    'ai_actions_used', ai,
    'ai_action_limit', case when pro then null else limits -> 'ai_actions_per_month' end,
    'period_start', period_start
  );
end;
$$;
revoke all on function public.workspace_usage(uuid) from public, anon;
grant execute on function public.workspace_usage(uuid) to authenticated, service_role;

-- Enforced in the database so every path (manual create, un-archive, AI apply) is covered.
create function public.enforce_client_limit() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim int := (public.plan_limits() -> 'free' ->> 'active_clients')::int;
  n int;
begin
  if new.status <> 'active' or public.is_sample_client_name(new.name) then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' and not public.is_sample_client_name(old.name) then
    return new; -- already counted
  end if;
  if public.workspace_is_pro(new.workspace_id) then
    return new;
  end if;
  select count(*) into n from public.clients c
   where c.workspace_id = new.workspace_id and c.id <> new.id
     and c.status = 'active' and not public.is_sample_client_name(c.name);
  if n >= lim then
    raise exception 'plan_limit_clients' using errcode = 'P0001',
      hint = format('The free plan includes %s active clients.', lim);
  end if;
  return new;
end;
$$;
create trigger enforce_client_limit before insert or update of status, name on public.clients
  for each row execute function public.enforce_client_limit();

-- ---------------------------------------------------------------------------
-- Invoicing
-- ---------------------------------------------------------------------------
alter table public.workspaces
  add column currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  -- Business name, address, tax id, payment instructions: printed on every invoice.
  add column invoice_details text check (char_length(invoice_details) <= 2000),
  add column next_invoice_number integer not null default 1 check (next_invoice_number > 0);

alter table public.clients
  add column hourly_rate_cents integer check (hourly_rate_cents between 0 and 100000000);

create type public.invoice_status as enum ('draft', 'sent', 'paid', 'void');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id uuid,
  -- Snapshots: an invoice keeps its addressee if the client is renamed or deleted.
  client_name text not null check (char_length(client_name) between 1 and 200),
  client_email text check (char_length(client_email) <= 320),
  number text not null check (char_length(number) between 1 and 32),
  status public.invoice_status not null default 'draft',
  issue_date date not null,
  due_date date,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  notes text check (char_length(notes) <= 2000),
  total_cents bigint not null default 0 check (total_cents >= 0),
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, number),
  check (due_date is null or due_date >= issue_date),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
    on delete set null (client_id)
);
create index invoices_workspace_status_idx on public.invoices (workspace_id, status, due_date);
create index invoices_client_id_idx on public.invoices (client_id);
create trigger set_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  invoice_id uuid not null,
  task_id uuid,
  position integer not null default 0,
  description text not null check (char_length(description) between 1 and 500),
  quantity numeric(10, 2) not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  amount_cents bigint not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, invoice_id) references public.invoices (workspace_id, id)
    on delete cascade,
  foreign key (workspace_id, task_id) references public.tasks (workspace_id, id)
    on delete set null (task_id)
);
create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id, position);
create index invoice_items_task_id_idx on public.invoice_items (task_id);

-- A billed time entry points at its invoice; deleting a draft releases the time.
alter table public.time_entries
  add column invoice_id uuid,
  add foreign key (workspace_id, invoice_id) references public.invoices (workspace_id, id)
    on delete set null (invoice_id);
create index time_entries_invoice_id_idx on public.time_entries (invoice_id);

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
create policy invoices_all on public.invoices for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy invoice_items_all on public.invoice_items for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Creates or replaces a draft invoice with its items and billed time, atomically.
-- Idempotent on p_invoice.id (safe to replay from the offline queue). The number is
-- assigned once, on first save.
create function public.save_invoice(p_invoice jsonb, p_items jsonb, p_time_entry_ids uuid[])
returns text
language plpgsql
security definer -- members (not only the owner) advance the workspace's invoice counter
set search_path = ''
as $$
declare
  inv_id uuid := (p_invoice ->> 'id')::uuid;
  is_update boolean;
  ws uuid := (p_invoice ->> 'workspace_id')::uuid;
  existing public.invoices;
  num text;
  seq int;
  total bigint;
begin
  if not public.is_workspace_member(ws) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'an invoice needs at least one line' using errcode = '22023';
  end if;

  select * into existing from public.invoices where id = inv_id for update;
  is_update := found;
  if is_update and (existing.workspace_id <> ws or existing.status <> 'draft') then
    raise exception 'only draft invoices can be edited' using errcode = '22023';
  end if;

  select coalesce(sum(round((i ->> 'quantity')::numeric * (i ->> 'unit_price_cents')::bigint)), 0)
    into total from jsonb_array_elements(p_items) i;

  if is_update then
    num := existing.number;
    update public.invoices set
      client_id = (p_invoice ->> 'client_id')::uuid,
      client_name = p_invoice ->> 'client_name',
      client_email = p_invoice ->> 'client_email',
      issue_date = (p_invoice ->> 'issue_date')::date,
      due_date = (p_invoice ->> 'due_date')::date,
      currency = p_invoice ->> 'currency',
      notes = p_invoice ->> 'notes',
      total_cents = total
    where id = inv_id;
  else
    update public.workspaces set next_invoice_number = next_invoice_number + 1
     where id = ws returning next_invoice_number - 1 into seq;
    num := 'INV-' || lpad(seq::text, 4, '0');
    insert into public.invoices (id, workspace_id, client_id, client_name, client_email, number,
      issue_date, due_date, currency, notes, total_cents)
    values (inv_id, ws, (p_invoice ->> 'client_id')::uuid, p_invoice ->> 'client_name',
      p_invoice ->> 'client_email', num, (p_invoice ->> 'issue_date')::date,
      (p_invoice ->> 'due_date')::date, p_invoice ->> 'currency', p_invoice ->> 'notes', total);
  end if;

  delete from public.invoice_items where invoice_id = inv_id;
  insert into public.invoice_items (id, workspace_id, invoice_id, task_id, position, description,
    quantity, unit_price_cents, amount_cents)
  select coalesce((i ->> 'id')::uuid, gen_random_uuid()), ws, inv_id, (i ->> 'task_id')::uuid,
    (ord - 1)::int, i ->> 'description', (i ->> 'quantity')::numeric,
    (i ->> 'unit_price_cents')::bigint,
    round((i ->> 'quantity')::numeric * (i ->> 'unit_price_cents')::bigint)
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);

  update public.time_entries set invoice_id = null
   where workspace_id = ws and invoice_id = inv_id and not (id = any(coalesce(p_time_entry_ids, '{}')));
  update public.time_entries set invoice_id = inv_id
   where workspace_id = ws and id = any(coalesce(p_time_entry_ids, '{}'))
     and (invoice_id is null or invoice_id = inv_id);

  return num;
end;
$$;
revoke all on function public.save_invoice(jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.save_invoice(jsonb, jsonb, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Launch metrics (PLAN.md success metrics). A private schema: not exposed through the
-- API, readable from the SQL editor / service role only.
-- ---------------------------------------------------------------------------
create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

-- Per user: signup, onboarding, first accepted proposal, active days.
create view analytics.user_funnel as
select
  e.user_id,
  min(e.created_at) filter (where e.name = 'signup_completed') as signed_up_at,
  min(e.created_at) filter (where e.name = 'onboarding_completed') as onboarded_at,
  min(e.created_at) filter (where e.name = 'ai_proposal_accepted') as first_accept_at,
  count(distinct (e.created_at at time zone 'UTC')::date) as active_days
from public.events e
group by e.user_id;

create view analytics.launch_metrics as
with f as (select * from analytics.user_funnel where signed_up_at is not null),
active as (
  select user_id, (created_at at time zone 'UTC')::date as day from public.events group by 1, 2
),
ret as (
  select f.user_id,
    exists (select 1 from active a where a.user_id = f.user_id and a.day = (f.signed_up_at at time zone 'UTC')::date + 1) as d1,
    exists (select 1 from active a where a.user_id = f.user_id and a.day = (f.signed_up_at at time zone 'UTC')::date + 7) as d7,
    exists (select 1 from active a where a.user_id = f.user_id and a.day = (f.signed_up_at at time zone 'UTC')::date + 30) as d30
  from f
),
actions as (
  select status, count(*) as n from public.ai_actions
  where type in ('process_inbox', 'generate_workspace') and status <> 'proposed'
  group by status
)
select
  (select count(*) from f) as signups,
  round(100.0 * (select count(*) from f where onboarded_at is not null) / nullif((select count(*) from f), 0), 1)
    as onboarding_completion_pct,
  (select percentile_cont(0.5) within group (order by extract(epoch from first_accept_at - signed_up_at))
     from f where first_accept_at is not null) as median_seconds_to_first_accept,
  round(100.0 * coalesce((select n from actions where status = 'accepted'), 0)
    / nullif((select sum(n) from actions), 0), 1) as proposal_accepted_unedited_pct,
  round(100.0 * (select count(*) from ret where d1) / nullif((select count(*) from ret), 0), 1) as d1_retention_pct,
  round(100.0 * (select count(*) from ret where d7) / nullif((select count(*) from ret), 0), 1) as d7_retention_pct,
  round(100.0 * (select count(*) from ret where d30) / nullif((select count(*) from ret), 0), 1) as d30_retention_pct,
  (select count(distinct user_id) from public.events
    where name = 'weekly_brief_opened' and created_at > now() - interval '7 days') as weekly_brief_users_7d,
  (select count(*) from public.subscriptions where public.workspace_is_pro(workspace_id)) as pro_workspaces;

revoke all on all tables in schema analytics from public, anon, authenticated;

revoke all on function public.enforce_client_limit() from public, anon, authenticated;
revoke all on function public.workspace_is_pro(uuid) from public, anon;
