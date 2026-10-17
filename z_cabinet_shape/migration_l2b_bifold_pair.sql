-- z_cabinet_shape L2b (2026-10-18): BCNP bi-fold door pair.
-- 1. hardware_hinges.pie_role: 'lead' = the lead door's hinge to its end panel
--    (170° INSERTA), 'bifold' = the hinge joining the two doors. The resolver
--    uses these on any door pair at an inside (pie) corner.
-- 2. hardware_hinges.door_plate_holes: bi-fold only — screw holes on the
--    trailing door's back face. offset_x = in from its pie edge, offset_y =
--    along the hinge line. Mark: "37mm back from door edge, 5mm holes 12mm deep
--    (same as normal hinge plate drilling on gables)" → ±16 like the gable plate.
-- 3. BCNP library row: primary door hinged toward the pie corner, so a new
--    BCNP is a pair out of the box (the facet door already hangs on end2 and
--    leads). Placed cabinets keep their hinge sides.

alter table hardware_hinges add column if not exists pie_role text
  check (pie_role in ('lead', 'bifold'));
alter table hardware_hinges add column if not exists door_plate_holes jsonb not null default '[]'::jsonb;

update hardware_hinges set pie_role = 'lead' where supplier_code = '71T6580';
update hardware_hinges set pie_role = 'bifold',
  door_plate_holes = '[{"depth":12,"diameter":5,"offset_x":37,"offset_y":16},{"depth":12,"diameter":5,"offset_x":37,"offset_y":-16}]'::jsonb
 where supplier_code = '79T8530';

update cabinet_definitions
   set face_grid = jsonb_set(face_grid, '{zones,0,hinge_side}', '"left"')
 where name = 'BCNP' and is_library_item;
