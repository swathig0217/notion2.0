-- Notion 2.0: Phase 1 schema.
-- Every table is workspace-scoped and protected by RLS through public.is_workspace_member().
-- Cross-table references use composite (workspace_id, id) foreign keys so a row can never
-- point at another workspace's data.

-- ---------------------------------------------------------------------------
-- Enums (keep in sync with packages/shared/src/schemas/enums.ts)
-- ---------------------------------------------------------------------------
create type public.client_status as enum ('active', 'paused', 'archived');
create type public.project_status as enum ('active', 'on_hold', 'done', 'archived');
create type public.task_status as enum ('todo', 'doing', 'done');
create type public.task_priority as enum ('none', 'low', 'med', 'high');
create type public.task_source as enum ('manual', 'ai');
create type public.inbox_kind as enum ('text', 'voice', 'email', 'image');
create type public.inbox_status as enum ('pending', 'processed', 'dismissed');
create type public.ai_action_status as enum ('proposed', 'accepted', 'rejected', 'edited', 'undone');
create type public.member_role as enum ('owner', 'member');

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles and workspaces
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 200),
  business_type text check (char_length(business_type) <= 200),
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  tone text check (char_length(tone) <= 2000),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_owner_id_idx on public.workspaces (owner_id);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_id_idx on public.workspace_members (user_id);

-- Membership check used by every RLS policy. SECURITY DEFINER so the policy on
-- workspace_members itself does not recurse.
create function public.is_workspace_member(ws uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_workspace_member(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Clients, projects, tasks, notes
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  email text check (char_length(email) <= 320),
  notes text check (char_length(notes) <= 20000),
  status public.client_status not null default 'active',
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index clients_workspace_status_idx on public.clients (workspace_id, status);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id uuid,
  title text not null check (char_length(title) between 1 and 500),
  status public.project_status not null default 'active',
  due_date date,
  summary text check (char_length(summary) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
    on delete set null (client_id)
);
create index projects_workspace_status_idx on public.projects (workspace_id, status);
create index projects_client_id_idx on public.projects (client_id);

create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind public.inbox_kind not null default 'text',
  raw_content text not null check (char_length(raw_content) <= 20000),
  storage_path text check (char_length(storage_path) <= 1024),
  status public.inbox_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index inbox_items_workspace_status_created_idx
  on public.inbox_items (workspace_id, status, created_at desc);

create table public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  inbox_item_id uuid,
  type text not null check (char_length(type) <= 64),
  proposed_changes jsonb not null default '[]'::jsonb,
  applied_changes jsonb,
  status public.ai_action_status not null default 'proposed',
  model text check (char_length(model) <= 128),
  prompt_version text check (char_length(prompt_version) <= 64),
  tokens_in integer check (tokens_in >= 0),
  tokens_out integer check (tokens_out >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, inbox_item_id) references public.inbox_items (workspace_id, id)
    on delete set null (inbox_item_id)
);
create index ai_actions_workspace_created_idx on public.ai_actions (workspace_id, created_at desc);
create index ai_actions_inbox_item_id_idx on public.ai_actions (inbox_item_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid,
  client_id uuid,
  parent_task_id uuid,
  title text not null check (char_length(title) between 1 and 500),
  notes text check (char_length(notes) <= 20000),
  status public.task_status not null default 'todo',
  due_date date,
  priority public.task_priority not null default 'none',
  position double precision not null default 1024,
  source public.task_source not null default 'manual',
  ai_action_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  check (parent_task_id is null or parent_task_id <> id),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id)
    on delete set null (project_id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
    on delete set null (client_id),
  foreign key (workspace_id, parent_task_id) references public.tasks (workspace_id, id)
    on delete cascade,
  foreign key (workspace_id, ai_action_id) references public.ai_actions (workspace_id, id)
    on delete set null (ai_action_id)
);
create index tasks_today_idx on public.tasks (workspace_id, status, due_date)
  where parent_task_id is null;
create index tasks_parent_position_idx on public.tasks (parent_task_id, position);
create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_client_id_idx on public.tasks (client_id);
create index tasks_ai_action_id_idx on public.tasks (ai_action_id);

-- Keep completed_at consistent with status regardless of which client wrote it.
create function public.sync_task_completed_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id uuid,
  project_id uuid,
  title text not null default '' check (char_length(title) <= 500),
  content jsonb,
  content_text text not null default '' check (char_length(content_text) <= 200000),
  ai_action_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
    on delete set null (client_id),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id)
    on delete set null (project_id),
  foreign key (workspace_id, ai_action_id) references public.ai_actions (workspace_id, id)
    on delete set null (ai_action_id)
);
create index notes_workspace_updated_idx on public.notes (workspace_id, updated_at desc);
create index notes_client_id_idx on public.notes (client_id);
create index notes_project_id_idx on public.notes (project_id);
create index notes_ai_action_id_idx on public.notes (ai_action_id);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  task_id uuid,
  project_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz,
  minutes integer check (minutes >= 0),
  billable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  foreign key (workspace_id, task_id) references public.tasks (workspace_id, id)
    on delete set null (task_id),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id)
    on delete set null (project_id)
);
create index time_entries_workspace_started_idx on public.time_entries (workspace_id, started_at desc);
create index time_entries_task_id_idx on public.time_entries (task_id);
create index time_entries_project_id_idx on public.time_entries (project_id);

-- First-party product analytics. Props must never contain user content.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (name ~ '^[a-z][a-z0-9_]{0,63}$'),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 4096),
  created_at timestamptz not null default now()
);
create index events_workspace_name_created_idx on public.events (workspace_id, name, created_at);
create index events_user_id_idx on public.events (user_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.inbox_items
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.ai_actions
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.time_entries
  for each row execute function public.set_updated_at();

create trigger sync_completed_at before insert or update of status, completed_at on public.tasks
  for each row execute function public.sync_task_completed_at();

-- New user: profile + personal workspace + owner membership.
create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(split_part(coalesce(new.email, ''), '@', 1), ''));

  insert into public.workspaces (name, owner_id)
  values ('My workspace', new.id)
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Self-service account deletion. Cascades through every table via auth.users FKs.
create function public.delete_my_account() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: nothing for anon; authenticated is narrowed further by RLS.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.sync_task_completed_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.inbox_items enable row level security;
alter table public.ai_actions enable row level security;
alter table public.time_entries enable row level security;
alter table public.events enable row level security;

-- profiles: own row only. Created by the signup trigger, deleted with the auth user.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- workspaces: members read, owner renames. Created by the signup trigger.
create policy workspaces_select on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));
create policy workspaces_update on public.workspaces for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- workspace_members: members see the roster. Invites arrive with teams (Phase 4+).
create policy workspace_members_select on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- Standard workspace-scoped CRUD.
create policy clients_all on public.clients for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy projects_all on public.projects for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy tasks_all on public.tasks for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy notes_all on public.notes for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy inbox_items_all on public.inbox_items for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy time_entries_all on public.time_entries for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ai_actions: an append-only audit trail from the client's point of view. Status changes
-- go through apply/undo functions (Phase 2).
create policy ai_actions_select on public.ai_actions for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy ai_actions_insert on public.ai_actions for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

-- events: users write their own events and can read them back (data export).
create policy events_insert on public.events for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
create policy events_select on public.events for select to authenticated
  using (user_id = (select auth.uid()));
