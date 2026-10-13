-- Handles H1 — catalogue grip kinds, role-based handle schedules, resolved
-- handle on face_zones. See z_handles/HANDLES-SPEC.md (D1, D6, D7, D10, D12).
-- Additive only: handle_schedules.handle_id stays (legacy catch-all, read as a
-- fallback when a schedule has no entries).

-- ── Catalogue: grip kinds ─────────────────────────────────────────────────────
alter table public.hardware_handles
  add column if not exists grip_kind        text    not null default 'hardware',
  add column if not exists needs_finger_gap boolean not null default false,
  add column if not exists holes            jsonb   not null default '[]'::jsonb,
  add column if not exists hole_dia_mm      numeric,
  add column if not exists bevel_angle_deg  numeric,
  add column if not exists bevel_depth_mm   numeric;

alter table public.hardware_handles drop constraint if exists hardware_handles_grip_kind_check;
alter table public.hardware_handles add constraint hardware_handles_grip_kind_check
  check (grip_kind in ('hardware','sharknose','routed','push','rail','channel'));

-- ── Role-based schedule rows ──────────────────────────────────────────────────
create table if not exists public.handle_schedule_entries (
  id                  uuid primary key default gen_random_uuid(),
  schedule_id         uuid not null references public.handle_schedules(id) on delete cascade,
  role                text not null check (role in ('door_base','door_wall','door_tall','drawer')),
  handle_id           uuid references public.hardware_handles(id),  -- null = no handle for this role
  offset_from_edge_mm numeric not null default 50,   -- handle centre from the grip edge (top; bottom on wall)
  inset_from_side_mm  numeric,                       -- doors: centre from the non-hinged edge; null = centred
  orientation         text not null default 'horizontal' check (orientation in ('horizontal','vertical')),
  created_at          timestamptz not null default now(),
  unique (schedule_id, role)
);

alter table public.handle_schedule_entries enable row level security;
drop policy if exists library_read on public.handle_schedule_entries;
create policy library_read on public.handle_schedule_entries
  for select to authenticated using (true);
drop policy if exists admin_write on public.handle_schedule_entries;
create policy admin_write on public.handle_schedule_entries
  for all to authenticated using ((select is_admin())) with check ((select is_admin()));

-- ── Resolved handle per face zone (written by the persist RPC) ────────────────
-- face_zones.handle_hardware_id already exists (unused until now); `handle`
-- carries the resolved placement (role, grip edge, centre, orientation, kind).
alter table public.face_zones add column if not exists handle jsonb;

-- ── Seed: push-to-open item + a default "Standard" schedule ───────────────────
insert into public.hardware_handles (name, handle_type, grip_kind)
select 'Push to open', 'other', 'push'
where not exists (select 1 from public.hardware_handles where grip_kind = 'push');

insert into public.handle_schedules (name, description, is_default, handle_id)
select 'Standard', 'Bar handles on base/wall doors and drawers; push-to-open on tall doors', true,
       (select id from public.hardware_handles where grip_kind = 'hardware' and active order by created_at limit 1)
where not exists (select 1 from public.handle_schedules);

insert into public.handle_schedule_entries (schedule_id, role, handle_id, offset_from_edge_mm, inset_from_side_mm, orientation)
select s.id, v.role,
       case when v.role = 'door_tall'
            then (select id from public.hardware_handles where grip_kind = 'push' order by created_at limit 1)
            else s.handle_id end,
       50, v.inset, v.orient
from public.handle_schedules s
cross join (values ('door_base', 50::numeric, 'vertical'),
                   ('door_wall', 50::numeric, 'vertical'),
                   ('door_tall', null::numeric, 'vertical'),
                   ('drawer',    null::numeric, 'horizontal')) v(role, inset, orient)
where s.name = 'Standard'
on conflict (schedule_id, role) do nothing;
