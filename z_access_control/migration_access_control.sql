-- Access control: admin vs tester roles, per-job access for testers, and
-- removal of anonymous (anon-key) access. See ACCESS-CONTROL-SPEC.md.
--
-- Rollback: rollback_access_control.sql (restores the old "everyone can do
-- everything" policies).

-- ── Role + access tables ─────────────────────────────────────────────────────
create table if not exists public.user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin', 'tester')),
  created_at timestamptz not null default now()
);

create table if not exists public.project_access (
  user_id    uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index if not exists project_access_project_idx on public.project_access(project_id);

-- Every existing login becomes an admin (unchanged access for them).
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users
on conflict (user_id) do nothing;

-- ── Helper functions ─────────────────────────────────────────────────────────
-- SECURITY DEFINER so the lookups bypass RLS (no policy recursion) and stay
-- cheap. Each returns false for a missing / NULL parent.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles
                 where user_id = auth.uid() and role = 'admin')
$$;

create or replace function public.can_access_project(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin()
      or exists (select 1 from public.project_access
                 where user_id = auth.uid() and project_id = pid)
$$;

create or replace function public.can_access_room(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.can_access_project(r.project_id)
                   from public.rooms r where r.id = rid), false)
$$;

create or replace function public.can_access_cabinet(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.can_access_room(c.room_id)
                   from public.cabinet_instances c where c.id = cid), false)
$$;

create or replace function public.can_access_benchtop(bid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.can_access_room(b.room_id)
                   from public.benchtop_instances b where b.id = bid), false)
$$;

create or replace function public.can_access_joint_instance(jid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.can_access_cabinet(j.cabinet_id)
                   from public.joint_instances j where j.id = jid), false)
$$;

create or replace function public.can_access_nest_job(nid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.can_access_project(n.project_id)
                   from public.nest_jobs n where n.id = nid), false)
$$;

revoke execute on function public.is_admin(), public.can_access_project(uuid),
  public.can_access_room(uuid), public.can_access_cabinet(uuid),
  public.can_access_benchtop(uuid), public.can_access_joint_instance(uuid),
  public.can_access_nest_job(uuid) from public, anon;
grant execute on function public.is_admin(), public.can_access_project(uuid),
  public.can_access_room(uuid), public.can_access_cabinet(uuid),
  public.can_access_benchtop(uuid), public.can_access_joint_instance(uuid),
  public.can_access_nest_job(uuid) to authenticated;

-- ── Drop every existing policy (except the login allowlist) ─────────────────
do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
           where schemaname = 'public' and tablename <> 'allowed_emails'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ── Job data: rows a user can reach through a project they can access ──────
-- [table, check expression]
do $$
declare t record;
begin
  for t in select * from (values
    ('rooms',                     'public.can_access_project(project_id)'),
    ('job_materials',             'public.can_access_project(project_id)'),
    ('job_toekick_materials',     'public.can_access_project(project_id)'),
    ('job_drawerbox_materials',   'public.can_access_project(project_id)'),
    ('job_benchtop_materials',    'public.can_access_project(project_id)'),
    ('nest_jobs',                 'public.can_access_project(project_id)'),
    ('nest_placements',           'public.can_access_project(project_id)'),
    ('walls',                     'public.can_access_room(room_id)'),
    ('room_materials',            'public.can_access_room(room_id)'),
    ('room_toekick_materials',    'public.can_access_room(room_id)'),
    ('room_drawerbox_materials',  'public.can_access_room(room_id)'),
    ('room_benchtop_materials',   'public.can_access_room(room_id)'),
    ('cabinet_instances',         'public.can_access_room(room_id)'),
    ('benchtop_instances',        'public.can_access_room(room_id)'),
    ('kick_runs',                 'public.can_access_room(room_id)'),
    ('face_cols',                 'public.can_access_cabinet(cabinet_instance_id)'),
    ('face_rows',                 'public.can_access_cabinet(cabinet_instance_id)'),
    ('face_zones',                'public.can_access_cabinet(cabinet_instance_id)'),
    ('internal_parts',            'public.can_access_cabinet(cabinet_instance_id)'),
    ('case_parts',                'public.can_access_cabinet(cabinet_instance_id)'),
    ('toekick_parts',             'public.can_access_cabinet(cabinet_instance_id)'),
    ('cabinet_custom_parts',      'public.can_access_cabinet(cabinet_instance_id)'),
    ('hinge_instances',           'public.can_access_cabinet(cabinet_instance_id)'),
    ('drawer_box_parts',          'public.can_access_cabinet(cabinet_instance_id)'),
    ('joint_instances',           'public.can_access_cabinet(cabinet_id)'),
    ('part_shape_overrides',      'public.can_access_cabinet(cabinet_id)'),
    ('part_operations',           'public.can_access_cabinet(source_cabinet_id)'),
    ('joint_instance_operations', 'public.can_access_joint_instance(joint_instance_id)'),
    ('benchtop_resolved_parts',   'public.can_access_benchtop(benchtop_id)'),
    ('nest_sheets',               'public.can_access_nest_job(nest_job_id)')
  ) as v(tbl, expr)
  loop
    execute format('alter table public.%I enable row level security', t.tbl);
    execute format(
      'create policy job_access on public.%I for all to authenticated
         using ((select public.is_admin()) or %s)
         with check ((select public.is_admin()) or %s)',
      t.tbl, t.expr, t.expr);
  end loop;
end $$;

-- Projects: testers see / edit their assigned jobs; only admins create or
-- delete jobs.
create policy job_select on public.projects for select to authenticated
  using ((select public.is_admin()) or public.can_access_project(id));
create policy job_update on public.projects for update to authenticated
  using ((select public.is_admin()) or public.can_access_project(id))
  with check ((select public.is_admin()) or public.can_access_project(id));
create policy admin_insert on public.projects for insert to authenticated
  with check ((select public.is_admin()));
create policy admin_delete on public.projects for delete to authenticated
  using ((select public.is_admin()));

-- ── Library / shop settings: everyone logged in reads, admins write ─────────
do $$
declare t text;
begin
  foreach t in array array[
    'assembly_schedule_rows', 'assembly_schedules', 'benchtop_build_methods',
    'benchtop_edge_profiles', 'benchtop_materials', 'benchtop_schedule_rows',
    'benchtop_schedules', 'cabinet_categories', 'cabinet_definitions',
    'cabinet_subcategories', 'cnc_drill_block_spindles', 'cnc_drill_blocks',
    'cnc_drills', 'cnc_machine_profiles', 'cnc_machines',
    'cnc_tool_set_operations', 'cnc_tool_sets', 'cnc_tools',
    'construction_method_joints', 'construction_method_schedule_rows',
    'construction_method_schedules', 'construction_methods', 'door_catalogue',
    'door_catalogue_schedules', 'door_material_schedules',
    'door_profile_operations', 'door_profiles', 'door_schedule_materials',
    'door_styles', 'drawer_box_methods', 'drawer_slide_operations',
    'drawerbox_schedules', 'drawing_layer_sets', 'edge_banding',
    'front_schedule_rows', 'front_schedules', 'handle_schedules',
    'hardware_fasteners', 'hardware_handles', 'hardware_hinge_plates',
    'hardware_hinges', 'hardware_slides', 'hinge_count_rules',
    'hinge_schedules', 'inner_drawerbox_schedules', 'job_presets',
    'joint_type_operations', 'joint_types', 'materials', 'part_definitions',
    'parts_library', 'schema_versions', 'shop_drawerbox_materials',
    'shop_hardware_defaults', 'shop_material_defaults', 'shop_settings',
    'shop_toekick_materials', 'slide_schedule_entries', 'slide_schedules',
    'toekick_schedule_rows', 'toekick_schedules'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy library_read on public.%I for select to authenticated using (true)', t);
    execute format(
      'create policy admin_write on public.%I for all to authenticated
         using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end $$;

-- ── Role tables + leftover backup table ─────────────────────────────────────
alter table public.user_roles enable row level security;
create policy own_role on public.user_roles for select to authenticated
  using (user_id = auth.uid() or (select public.is_admin()));
create policy admin_write on public.user_roles for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.project_access enable row level security;
create policy own_access on public.project_access for select to authenticated
  using (user_id = auth.uid() or (select public.is_admin()));
create policy admin_write on public.project_access for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public._bt_p3_backup enable row level security;
create policy admin_only on public._bt_p3_backup for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- The nest view ran as its owner (bypassing RLS); make it respect the caller.
alter view public.v_nest_parts set (security_invoker = true);

-- ── Storage: model uploads admin-only (public read unchanged) ───────────────
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname in (
               'hinge-models authenticated delete', 'hinge-models authenticated insert',
               'hinge-models authenticated update', 'slide_models_authenticated_delete',
               'slide_models_authenticated_insert', 'slide_models_authenticated_update')
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;
create policy models_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('hinge-models', 'slide-models') and (select public.is_admin()));
create policy models_admin_update on storage.objects for update to authenticated
  using (bucket_id in ('hinge-models', 'slide-models') and (select public.is_admin()));
create policy models_admin_delete on storage.objects for delete to authenticated
  using (bucket_id in ('hinge-models', 'slide-models') and (select public.is_admin()));

-- ════════════════════════════════════════════════════════════════════════════
-- Second migration: access_control_users_admin (Settings → Users tab)
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.admin_list_users()
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
               role text, allowed boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at,
           r.role,
           exists (select 1 from public.allowed_emails a where lower(a.email) = lower(u.email))
    from auth.users u
    left join public.user_roles r on r.user_id = u.id
    order by u.email;
end $$;
revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

create policy admin_all on public.allowed_emails for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Never leave the system without an admin.
create or replace function public.keep_one_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'At least one admin is required' using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger keep_one_admin
  after update or delete on public.user_roles
  deferrable initially deferred
  for each row execute function public.keep_one_admin();
