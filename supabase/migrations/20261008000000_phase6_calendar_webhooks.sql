-- Phase 6 (approved 2026-10-04): private calendar feed (.ics) and outgoing webhooks
-- (Zapier, Make, your own server).

-- ---------------------------------------------------------------------------
-- Calendar feed: <functions>/calendar?token=<calendar_token>. Off (null) by default.
-- ---------------------------------------------------------------------------
alter table public.workspaces
  add column calendar_token text unique check (calendar_token ~ '^[a-f0-9]{32}$');

-- ---------------------------------------------------------------------------
-- Webhooks
-- ---------------------------------------------------------------------------
create table public.webhooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  url text not null check (char_length(url) <= 2000 and url ~ '^https?://'),
  -- HMAC-SHA256 signing secret (shown to the user so their endpoint can verify).
  secret text not null check (secret ~ '^[a-f0-9]{64}$'),
  events text[] not null check (
    cardinality(events) between 1 and 10
    and events <@ array['task.created', 'task.completed', 'client.created', 'invoice.sent', 'invoice.paid']
  ),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index webhooks_workspace_id_idx on public.webhooks (workspace_id);
create trigger set_updated_at before update on public.webhooks
  for each row execute function public.set_updated_at();

alter table public.webhooks enable row level security;
create policy webhooks_all on public.webhooks for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- At most 5 endpoints per workspace.
create function public.enforce_webhook_limit() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.webhooks w where w.workspace_id = new.workspace_id and w.id <> new.id) >= 5 then
    raise exception 'webhook_limit' using errcode = 'P0001', hint = 'Up to 5 webhooks per workspace.';
  end if;
  return new;
end;
$$;
create trigger enforce_webhook_limit before insert on public.webhooks
  for each row execute function public.enforce_webhook_limit();

-- Outbox. Rows are written by triggers below, delivered (signed, retried) by the
-- `deliver-webhooks` function every minute, and pruned after 30 days.
create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  webhook_id uuid not null,
  event text not null check (char_length(event) <= 64),
  payload jsonb not null check (pg_column_size(payload) <= 16384),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  response_status integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, webhook_id) references public.webhooks (workspace_id, id) on delete cascade
);
create index webhook_deliveries_due_idx on public.webhook_deliveries (next_attempt_at)
  where status = 'pending';
create index webhook_deliveries_webhook_idx on public.webhook_deliveries (webhook_id, created_at desc);
create trigger set_updated_at before update on public.webhook_deliveries
  for each row execute function public.set_updated_at();

alter table public.webhook_deliveries enable row level security;
-- Members read the delivery log; only the server writes it.
create policy webhook_deliveries_select on public.webhook_deliveries for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- Queues `event` for every enabled webhook in the workspace subscribed to it.
create function public.enqueue_webhook_event(ws uuid, event text, data jsonb) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.webhook_deliveries (workspace_id, webhook_id, event, payload)
  select ws, w.id, event,
         jsonb_build_object('event', event, 'occurred_at', now(), 'data', data)
    from public.webhooks w
   where w.workspace_id = ws and w.enabled and event = any(w.events);
$$;
revoke all on function public.enqueue_webhook_event(uuid, text, jsonb) from public, anon, authenticated;

-- Payloads carry an allowlist of fields (no notes, no ids of other workspaces).
-- Takes the row as jsonb (a table-typed argument would surface as a computed column in the API).
create function public.task_webhook_data(t jsonb) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t ->> 'id', 'title', t ->> 'title', 'status', t ->> 'status', 'due_date', t ->> 'due_date',
    'priority', t ->> 'priority',
    'client', (select c.name from public.clients c
                where c.id = (t ->> 'client_id')::uuid and c.workspace_id = (t ->> 'workspace_id')::uuid),
    'project', (select p.title from public.projects p
                 where p.id = (t ->> 'project_id')::uuid and p.workspace_id = (t ->> 'workspace_id')::uuid),
    'parent_task_id', t ->> 'parent_task_id'
  );
$$;

create function public.webhooks_on_task() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.webhooks w where w.workspace_id = new.workspace_id and w.enabled) then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform public.enqueue_webhook_event(new.workspace_id, 'task.created', public.task_webhook_data(to_jsonb(new)));
    if new.status = 'done' then
      perform public.enqueue_webhook_event(new.workspace_id, 'task.completed', public.task_webhook_data(to_jsonb(new)));
    end if;
  elsif new.status = 'done' and old.status is distinct from 'done' then
    perform public.enqueue_webhook_event(new.workspace_id, 'task.completed', public.task_webhook_data(to_jsonb(new)));
  end if;
  return null;
end;
$$;
create trigger webhooks_on_task after insert or update of status on public.tasks
  for each row execute function public.webhooks_on_task();

create function public.webhooks_on_client() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.enqueue_webhook_event(new.workspace_id, 'client.created',
    jsonb_build_object('id', new.id, 'name', new.name, 'email', new.email, 'status', new.status));
  return null;
end;
$$;
create trigger webhooks_on_client after insert on public.clients
  for each row execute function public.webhooks_on_client();

create function public.webhooks_on_invoice() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event text := case new.status when 'sent' then 'invoice.sent' when 'paid' then 'invoice.paid' end;
begin
  if event is null or new.status = old.status then
    return null;
  end if;
  perform public.enqueue_webhook_event(new.workspace_id, event, jsonb_build_object(
    'id', new.id, 'number', new.number, 'status', new.status, 'client', new.client_name,
    'issue_date', new.issue_date, 'due_date', new.due_date,
    'currency', new.currency, 'total_cents', new.total_cents));
  return null;
end;
$$;
create trigger webhooks_on_invoice after update of status on public.invoices
  for each row execute function public.webhooks_on_invoice();

-- "Send test event" from Settings (members only).
create function public.send_test_webhook(p_webhook_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  select workspace_id into ws from public.webhooks where id = p_webhook_id;
  if ws is null or not public.is_workspace_member(ws) then
    raise exception 'webhook not found' using errcode = 'P0002';
  end if;
  insert into public.webhook_deliveries (workspace_id, webhook_id, event, payload)
  values (ws, p_webhook_id, 'ping',
    jsonb_build_object('event', 'ping', 'occurred_at', now(), 'data', jsonb_build_object('message', 'Hello from Notion 2.0')));
end;
$$;
revoke all on function public.send_test_webhook(uuid) from public, anon;
grant execute on function public.send_test_webhook(uuid) to authenticated;

revoke all on function public.enforce_webhook_limit() from public, anon, authenticated;
revoke all on function public.task_webhook_data(jsonb) from public, anon, authenticated;
revoke all on function public.webhooks_on_task() from public, anon, authenticated;
revoke all on function public.webhooks_on_client() from public, anon, authenticated;
revoke all on function public.webhooks_on_invoice() from public, anon, authenticated;

-- Every minute, only when something is due (same Vault secrets as notifications).
select cron.schedule(
  'deliver-webhooks',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_url') || '/deliver-webhooks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'functions_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'cron_secret')
    and exists (select 1 from public.webhook_deliveries where status = 'pending' and next_attempt_at <= now());
  $job$
);
