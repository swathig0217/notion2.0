-- Phase 3 (approved 2026-10-04): notification prefs, push tokens, inbound email token,
-- private image storage for the inbox, and the hourly notification schedule.

-- ---------------------------------------------------------------------------
-- Notification preferences (per user)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column notification_prefs jsonb not null
  default '{"digest": true, "digest_hour": 8, "nudges": true}'::jsonb;

-- ---------------------------------------------------------------------------
-- Push tokens (per user, per device). Scoped to the user, not the workspace: a token
-- identifies a person's device. One row per token; re-registering moves it.
-- ---------------------------------------------------------------------------
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique check (char_length(token) <= 512),
  platform text not null check (platform in ('ios', 'android')),
  -- Calendar day (user's timezone) of the last daily digest sent to this device.
  last_digest_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_id_idx on public.push_tokens (user_id);
create trigger set_updated_at before update on public.push_tokens
  for each row execute function public.set_updated_at();

alter table public.push_tokens enable row level security;
create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Inbound email: <inbound_token>@<INBOUND_EMAIL_DOMAIN> forwards into the workspace inbox.
-- ---------------------------------------------------------------------------
alter table public.workspaces
  add column inbound_token text not null unique
  default encode(extensions.gen_random_bytes(8), 'hex')
  check (inbound_token ~ '^[a-z0-9]{12,64}$');

-- Owner-only: issue a new address (the old one stops working immediately).
create function public.regenerate_inbound_token(p_workspace_id uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  t text := encode(extensions.gen_random_bytes(8), 'hex');
begin
  update public.workspaces set inbound_token = t
   where id = p_workspace_id and owner_id = (select auth.uid());
  if not found then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  return t;
end;
$$;
revoke all on function public.regenerate_inbound_token(uuid) from public, anon;
grant execute on function public.regenerate_inbound_token(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Inbox images (screenshots/photos for vision). Path: <workspace_id>/<uuid>.<ext>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inbox', 'inbox', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Safe cast so a malformed path can never error inside a policy.
create function public.try_uuid(value text) returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

create policy inbox_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'inbox' and public.is_workspace_member(public.try_uuid((storage.foldername(name))[1])));
create policy inbox_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'inbox' and public.is_workspace_member(public.try_uuid((storage.foldername(name))[1])));
create policy inbox_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'inbox' and public.is_workspace_member(public.try_uuid((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------------
-- Hourly notifications. The job calls the `send-notifications` edge function using
-- two Vault secrets set per environment (never in migrations):
--   select vault.create_secret('<https://<project>.supabase.co/functions/v1>', 'functions_url');
--   select vault.create_secret('<random string, same as CRON_SECRET>', 'cron_secret');
-- Without them the job does nothing.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'send-notifications',
  '5 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_url') || '/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'functions_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'cron_secret');
  $job$
);
