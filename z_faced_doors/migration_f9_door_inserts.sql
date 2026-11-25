-- z_faced_doors F9 — door inserts: what goes in a door's opening (mirror, glass, ...).
-- The insert is picked on the door profile operation (and can be overridden per door in
-- the Face Grid). The CNC tool set keeps only the rebate it cuts; its glass_* columns
-- stay for fronts resolved before F9 (Glass Order fallback) but are no longer edited.

create table if not exists door_inserts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  kind          text not null default 'glass' check (kind in ('mirror', 'glass', 'other')),
  thickness_mm  numeric not null,
  clearance_mm  numeric not null default 1.5,   -- gap each side inside the rebate
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table door_inserts enable row level security;
drop policy if exists library_read on door_inserts;
create policy library_read on door_inserts for select to authenticated using (true);
drop policy if exists admin_write on door_inserts;
create policy admin_write on door_inserts for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));
revoke all on door_inserts from anon;

alter table door_profile_operations
  add column if not exists insert_id uuid references door_inserts(id) on delete set null;

-- Seed from the glass-recipe tool sets, then point their profile operations at the insert.
insert into door_inserts (name, kind, thickness_mm, clearance_mm, sort_order)
select coalesce(nullif(ts.glass_type, ''), trim(to_char(ts.glass_thickness_mm, 'FM999990.##'), '.') || 'mm Clear Glass'),
       case when ts.glass_type ~* 'mirror' then 'mirror' else 'glass' end,
       ts.glass_thickness_mm, coalesce(ts.glass_clearance_mm, 1.5), ts.sort_order
from cnc_tool_sets ts
where ts.glass_thickness_mm is not null
on conflict (name) do nothing;

update door_profile_operations o
set insert_id = i.id
from cnc_tool_sets ts
join door_inserts i
  on i.name = coalesce(nullif(ts.glass_type, ''), trim(to_char(ts.glass_thickness_mm, 'FM999990.##'), '.') || 'mm Clear Glass')
where o.tool_set_id = ts.id and ts.glass_thickness_mm is not null and o.insert_id is null;
