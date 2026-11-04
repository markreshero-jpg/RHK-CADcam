-- z_curved_end C9 (Mark, 2026-11-05): the rangehood flue box in a curved wall end
-- is screwed into every rib it passes — one Ø5 through each box piece, centred
-- along the piece, mid the rib's thickness. New joint "RH flue rib screw" and the
-- construction-method default for the declared seam key `rh_flue:rib`
-- (a key already set wins).
with seed(name, description, expr) as (values
  ('RH flue rib screw',
   'Rangehood flue box piece into a curved end rib it passes: one Ø5 through the piece, centred along it, mid the rib.',
   '{"qty":"1","offset_z_mm":"D / 2","offset_y_mm":"CW / 2"}'::jsonb)
), ins as (
  insert into joint_types (name, description)
  select s.name, s.description from seed s
  where not exists (select 1 from joint_types j where j.name = s.name)
  returning id, name
), jt as (
  select id, name from ins
  union all
  select j.id, j.name from joint_types j join seed s on s.name = j.name
)
insert into joint_type_operations (joint_type_id, operation_order, target_part, machine_operation, face,
  tool_diameter_mm, depth_mm, offset_x_mm, offset_y_mm, offset_z_mm, qty, spacing_mm, qty2, spacing2_mm,
  router_tool_id, drill_id, auto_tool, notes, expressions, skip_near_mm)
select jt.id, 1, 'part_b', 'drill', 'normal', 5, 16.7, 0, 0, 0, 1, null, 1, null, null, null, true, null, s.expr, null
from seed s join jt on jt.name = s.name
where not exists (select 1 from joint_type_operations o where o.joint_type_id = jt.id);

with defs as (
  select jsonb_build_object('rh_flue:rib', j.id::text) as d
  from joint_types j where j.name = 'RH flue rib screw' limit 1
)
update construction_method_schedule_rows r
set joint_defaults = defs.d || coalesce(r.joint_defaults, '{}'::jsonb)
from defs
where r.assembly_class in ('base', 'wall', 'tall');
