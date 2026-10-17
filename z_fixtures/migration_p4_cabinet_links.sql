-- z_fixtures P4: a placed fixture can sit on a cabinet and follow it.
-- Applied live as migration `fixtures_p4_cabinet_links` (2026-10-18).
-- link_x / link_z = footprint centre in the cabinet's frame (x along the width
-- from its left, z from its back); link_rot = fixture turn minus cabinet turn.
-- Deleting the cabinet keeps the fixture where it is (link cleared).
alter table room_fixtures
  add column if not exists cabinet_id uuid references cabinet_instances(id) on delete set null,
  add column if not exists link_x     numeric not null default 0,
  add column if not exists link_z     numeric not null default 0,
  add column if not exists link_rot   numeric not null default 0;

create index if not exists room_fixtures_cabinet_id_idx on room_fixtures(cabinet_id);
