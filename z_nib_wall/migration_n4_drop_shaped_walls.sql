-- z_nib_wall N4 (Mark 2026-11-14, RHK6468 curved PB bulkhead): drop + shaped nib walls.
-- base_height: mm above the floor the wall starts (null / 0 = floor). outline: closed plan
-- polygon [{x, y}] in room coords used as the footprint instead of length x thickness.
-- Both only read for wall_type = 'nib'.
alter table walls add column if not exists base_height numeric;
alter table walls add column if not exists outline jsonb;
