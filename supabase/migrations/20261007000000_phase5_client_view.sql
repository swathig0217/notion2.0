-- Phase 5 (approved 2026-10-04): read-only client view. A project can have one private
-- link (`/p/<token>`) that shows its status and tasks to the client without a login.
-- Served only by the `client-view` edge function, which returns a fixed set of fields.

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null,
  -- 128-bit random token, generated on the device (so creating a link works offline).
  token text not null unique check (token ~ '^[a-f0-9]{32}$'),
  -- Tasks the freelancer chose not to show the client (new tasks are visible).
  hidden_task_ids uuid[] not null default '{}' check (cardinality(hidden_task_ids) <= 1000),
  view_count integer not null default 0 check (view_count >= 0),
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One link per project; turning it off deletes it, a new one gets a new token.
  unique (project_id),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id)
    on delete cascade
);
create index share_links_workspace_id_idx on public.share_links (workspace_id);
create trigger set_updated_at before update on public.share_links
  for each row execute function public.set_updated_at();

alter table public.share_links enable row level security;
-- Members create, read and delete links, and can change only which tasks are hidden.
-- View counters are written by the edge function (service role).
create policy share_links_select on public.share_links for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy share_links_insert on public.share_links for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and view_count = 0 and last_viewed_at is null);
create policy share_links_update on public.share_links for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
revoke update on public.share_links from authenticated;
grant update (hidden_task_ids) on public.share_links to authenticated;
create policy share_links_delete on public.share_links for delete to authenticated
  using (public.is_workspace_member(workspace_id));

-- Counts a view atomically (called by the edge function with the service role).
create function public.record_share_view(p_token text) returns void
language sql
security definer
set search_path = ''
as $$
  update public.share_links
     set view_count = view_count + 1, last_viewed_at = now()
   where token = p_token;
$$;
revoke all on function public.record_share_view(text) from public, anon, authenticated;
grant execute on function public.record_share_view(text) to service_role;
