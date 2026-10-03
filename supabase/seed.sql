-- Local development seed: two demo users with separate workspaces.
-- Sign in locally with a magic link to demo@notion2.local or other@notion2.local
-- (emails land in the local mail catcher at http://127.0.0.1:54324).

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'demo@notion2.local', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'other@notion2.local', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');

-- The signup trigger created a profile and workspace per user; fill in the demo content.
do $$
declare
  demo_ws uuid;
  other_ws uuid;
  acme uuid := 'a0000000-0000-4000-8000-000000000001';
  bolt uuid := 'a0000000-0000-4000-8000-000000000002';
  north uuid := 'a0000000-0000-4000-8000-000000000003';
  site uuid := 'b0000000-0000-4000-8000-000000000001';
  brand uuid := 'b0000000-0000-4000-8000-000000000002';
  launch uuid := 'c0000000-0000-4000-8000-000000000001';
begin
  select id into demo_ws from public.workspaces where owner_id = '11111111-1111-4111-8111-111111111111';
  select id into other_ws from public.workspaces where owner_id = '22222222-2222-4222-8222-222222222222';

  update public.profiles
     set display_name = 'Demo Designer', business_type = 'Designer', timezone = 'America/New_York',
         onboarded_at = now()
   where id = '11111111-1111-4111-8111-111111111111';
  update public.workspaces set name = 'Demo Studio' where id = demo_ws;

  insert into public.clients (id, workspace_id, name, email, status, color, last_contacted_at) values
    (acme, demo_ws, 'Acme Co', 'sam@acme.example', 'active', '#5B5BD6', now() - interval '2 days'),
    (bolt, demo_ws, 'Bolt Studio', 'alex@bolt.example', 'active', '#12A594', now() - interval '12 days'),
    (north, demo_ws, 'Northwind', null, 'paused', '#E5484D', now() - interval '40 days');

  insert into public.projects (id, workspace_id, client_id, title, status, due_date, summary) values
    (site, demo_ws, acme, 'Website refresh', 'active', current_date + 14, 'New marketing site, 6 pages.'),
    (brand, demo_ws, bolt, 'Brand guidelines', 'active', current_date + 30, null);

  insert into public.tasks (id, workspace_id, project_id, client_id, title, status, due_date, priority, position) values
    (launch, demo_ws, site, acme, 'Prepare homepage mockups', 'doing', current_date, 'high', 1024),
    (gen_random_uuid(), demo_ws, site, acme, 'Send revised sitemap', 'todo', current_date - 2, 'med', 2048),
    (gen_random_uuid(), demo_ws, brand, bolt, 'Collect logo files', 'todo', current_date, 'none', 3072),
    (gen_random_uuid(), demo_ws, null, null, 'Renew domain', 'todo', current_date + 3, 'low', 4096),
    (gen_random_uuid(), demo_ws, null, null, 'Quarterly taxes', 'todo', current_date - 1, 'high', 5120);

  insert into public.tasks (workspace_id, project_id, client_id, parent_task_id, title, status, position) values
    (demo_ws, site, acme, launch, 'Hero section', 'done', 1024),
    (demo_ws, site, acme, launch, 'Pricing table', 'todo', 2048),
    (demo_ws, site, acme, launch, 'Footer', 'todo', 3072);

  insert into public.notes (workspace_id, client_id, project_id, title, content, content_text) values
    (demo_ws, acme, site, 'Kickoff notes',
     '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Sam wants a calmer homepage."}]}]}',
     'Sam wants a calmer homepage.');

  insert into public.inbox_items (workspace_id, kind, raw_content) values
    (demo_ws, 'text', 'Bolt wants the guidelines PDF by next Friday, plus 3 social templates');

  -- A second user so RLS isolation is visible locally.
  insert into public.clients (workspace_id, name, status) values (other_ws, 'Other Person''s Client', 'active');
end $$;
