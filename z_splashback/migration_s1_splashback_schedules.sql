-- Splashback S1: schedules, job/room overrides, shop setting, seed materials.
-- See SPLASHBACK-SPEC.md (L4 inherit setting, L5 mixed-library rows).
--
-- A schedule row names its material from EITHER library, like benchtop rows:
--   material_id          → materials          (board stock / board colours)
--   benchtop_material_id → benchtop_materials (stone, timber, glass, tile, mirror, acrylic)
-- Roles: panel (the splashback itself), substrate (backing board behind
-- tile / glass), packer (battens when set off the wall).
--
-- Rollback:
--   drop table if exists room_splashback_materials, job_splashback_materials,
--     splashback_schedule_rows, splashback_schedules cascade;
--   alter table projects drop column if exists splashback_schedule_id;
--   alter table rooms drop column if exists splashback_schedule_id;
--   alter table shop_settings drop column if exists splashback_schedule_id,
--     drop column if exists splashback_inherits_benchtop;
--   delete from benchtop_materials where notes = 'seed: splashback S1';

-- ── Schedules ────────────────────────────────────────────────────────────────
create table if not exists public.splashback_schedules (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_default  boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.splashback_schedule_rows (
  id                   uuid primary key default gen_random_uuid(),
  schedule_id          uuid not null references public.splashback_schedules(id) on delete cascade,
  part_role            text not null check (part_role in ('panel', 'substrate', 'packer')),
  material_id          uuid references public.materials(id),
  benchtop_material_id uuid references public.benchtop_materials(id),
  edgeband_id          uuid references public.edge_banding(id),
  unique (schedule_id, part_role),
  check (material_id is null or benchtop_material_id is null)
);

-- ── Job / room overrides (per role, room wins) ───────────────────────────────
create table if not exists public.job_splashback_materials (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  part_role            text not null check (part_role in ('panel', 'substrate', 'packer')),
  material_id          uuid references public.materials(id),
  benchtop_material_id uuid references public.benchtop_materials(id),
  edgeband_id          uuid references public.edge_banding(id),
  unique (project_id, part_role),
  check (material_id is null or benchtop_material_id is null)
);

create table if not exists public.room_splashback_materials (
  id                   uuid primary key default gen_random_uuid(),
  room_id              uuid not null references public.rooms(id) on delete cascade,
  part_role            text not null check (part_role in ('panel', 'substrate', 'packer')),
  material_id          uuid references public.materials(id),
  benchtop_material_id uuid references public.benchtop_materials(id),
  edgeband_id          uuid references public.edge_banding(id),
  unique (room_id, part_role),
  check (material_id is null or benchtop_material_id is null)
);

-- ── Schedule picks on job / room / shop + the inherit setting ───────────────
alter table public.projects add column if not exists splashback_schedule_id uuid
  references public.splashback_schedules(id) on delete set null;
alter table public.rooms add column if not exists splashback_schedule_id uuid
  references public.splashback_schedules(id) on delete set null;
alter table public.shop_settings add column if not exists splashback_schedule_id uuid
  references public.splashback_schedules(id) on delete set null;
-- L4: an empty panel role takes the room's benchtop worktop material.
alter table public.shop_settings add column if not exists splashback_inherits_benchtop
  boolean not null default true;

-- ── RLS (library = read all / admin write; job data = job_access) ────────────
alter table public.splashback_schedules      enable row level security;
alter table public.splashback_schedule_rows  enable row level security;
alter table public.job_splashback_materials  enable row level security;
alter table public.room_splashback_materials enable row level security;

drop policy if exists library_read on public.splashback_schedules;
drop policy if exists admin_write  on public.splashback_schedules;
create policy library_read on public.splashback_schedules for select using (true);
create policy admin_write  on public.splashback_schedules for all
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists library_read on public.splashback_schedule_rows;
drop policy if exists admin_write  on public.splashback_schedule_rows;
create policy library_read on public.splashback_schedule_rows for select using (true);
create policy admin_write  on public.splashback_schedule_rows for all
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists job_access on public.job_splashback_materials;
create policy job_access on public.job_splashback_materials for all
  using ((select public.is_admin()) or public.can_access_project(project_id))
  with check ((select public.is_admin()) or public.can_access_project(project_id));

drop policy if exists job_access on public.room_splashback_materials;
create policy job_access on public.room_splashback_materials for all
  using ((select public.is_admin()) or public.can_access_room(room_id))
  with check ((select public.is_admin()) or public.can_access_room(room_id));

-- ── Seed surface materials (new types: glass, tile, mirror, acrylic) ────────
insert into public.benchtop_materials (name, material_type, dz, sheet_dx, sheet_dy, finish, notes)
select v.name, v.material_type, v.dz, v.sheet_dx, v.sheet_dy, v.finish, 'seed: splashback S1'
from (values
  ('12mm Stone',                          'stone',   12, 3200, 1600, null),
  ('6mm Toughened Glass – Colour Backed', 'glass',    6, 3600, 2400, 'colour backed'),
  ('Tile – By Others',                    'tile',    10, 3600, 2400, null),
  ('6mm Mirror',                          'mirror',   6, 3600, 2400, null),
  ('6mm Acrylic Splashback',              'acrylic',  6, 3050, 1220, null)
) as v(name, material_type, dz, sheet_dx, sheet_dy, finish)
where not exists (select 1 from public.benchtop_materials b where b.name = v.name);

-- ── Seed schedules ───────────────────────────────────────────────────────────
-- "Same as Benchtop" has no panel row, so the panel inherits the room's
-- benchtop material (L4). It is the shop default.
insert into public.splashback_schedules (name, description, is_default)
select v.name, v.description, v.is_default
from (values
  ('Same as Benchtop',          'Panel follows the room''s benchtop material', true),
  ('20mm Stone',                null, false),
  ('12mm Stone',                null, false),
  ('6mm Glass – Colour Backed', null, false),
  ('Tile – By Others',          'Tiled on 16.5 Whiteboard substrate', false),
  ('6mm Mirror',                null, false),
  ('Board – Whiteboard 16.5',   'Board splashback, cut on the CNC', false)
) as v(name, description, is_default)
where not exists (select 1 from public.splashback_schedules s where s.name = v.name);

insert into public.splashback_schedule_rows (schedule_id, part_role, benchtop_material_id)
select s.id, 'panel', b.id
from (values
  ('20mm Stone',                '20mm Stone'),
  ('12mm Stone',                '12mm Stone'),
  ('6mm Glass – Colour Backed', '6mm Toughened Glass – Colour Backed'),
  ('Tile – By Others',          'Tile – By Others'),
  ('6mm Mirror',                '6mm Mirror')
) as v(sched, mat)
join public.splashback_schedules s on s.name = v.sched
join public.benchtop_materials  b on b.name = v.mat
on conflict (schedule_id, part_role) do nothing;

insert into public.splashback_schedule_rows (schedule_id, part_role, material_id)
select s.id, v.role, m.id
from (values
  ('Tile – By Others',        'substrate'),
  ('Board – Whiteboard 16.5', 'panel')
) as v(sched, role)
join public.splashback_schedules s on s.name = v.sched
join public.materials m on m.name = 'Whiteboard 16.5mm' and m.parent_id is null
on conflict (schedule_id, part_role) do nothing;

update public.shop_settings
set splashback_schedule_id = (select id from public.splashback_schedules where name = 'Same as Benchtop')
where splashback_schedule_id is null;
