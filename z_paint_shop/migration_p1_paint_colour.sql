-- z_paint_shop P1 (2026-11-18): paint colour on each front + painted boards.
-- face_zones.door_colour_id = the Colour Ranges colour (door_schedule_materials)
-- the front resolved to (zone > room class > job class > style default).
-- materials.is_painted = board goes to the paint shop (Satin Board); a colour row
-- counts as painted when it or its board is flagged.

alter table face_zones
  add column if not exists door_colour_id uuid null
  references door_schedule_materials(id) on delete set null;

alter table materials
  add column if not exists is_painted boolean not null default false;

update materials set is_painted = true
 where name ilike 'Satin Board%'
    or parent_id in (select id from materials where name ilike 'Satin Board%');
