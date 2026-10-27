-- Grain match G1 (z_grain_match/GRAIN-MATCH-SPEC.md): groups of cabinets whose
-- fronts nest as one block, in elevation layout, with one grain direction.

create table if not exists grain_match_groups (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,                         -- 'GM1', 'GM2' … per room
  direction text not null default 'vertical' check (direction in ('vertical','horizontal')),
  created_at timestamptz not null default now()
);
create index if not exists grain_match_groups_room_id_idx on grain_match_groups(room_id);
alter table grain_match_groups enable row level security;
drop policy if exists job_access on grain_match_groups;
create policy job_access on grain_match_groups for all to authenticated
  using ((select is_admin()) or can_access_room(room_id))
  with check ((select is_admin()) or can_access_room(room_id));

alter table cabinet_instances
  add column if not exists grain_match_group_id uuid references grain_match_groups(id) on delete set null;
create index if not exists cabinet_instances_grain_match_group_id_idx on cabinet_instances(grain_match_group_id);
