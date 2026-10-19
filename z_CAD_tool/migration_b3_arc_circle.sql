-- z_CAD_tool B3 — arcs + circles. Widens the kind check only (additive, no data change).
-- Applied live as migration `cad_b3_arc_circle`.
--   arc    geom: { c: {x,y}, r, a0, a1 }  — runs from angle a0 to a1 (degrees, svg y-down,
--                                           increasing = clockwise on screen)
--   circle geom: { c: {x,y}, r }

alter table room_annotations drop constraint if exists room_annotations_kind_check;
alter table room_annotations add constraint room_annotations_kind_check
  check (kind in ('text', 'line', 'rect', 'ellipse', 'cloud', 'dim', 'arc', 'circle'));
