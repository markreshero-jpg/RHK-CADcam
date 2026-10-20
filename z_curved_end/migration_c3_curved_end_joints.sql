-- C3 (2026-10-20): curved end holes via the joints library (z_curved_end/CURVED-END-SPEC.md).
-- 1. joint_type_operations.skip_near_mm: an op's holes give way to another op's
--    within this distance on the same part (the kit drops a block face screw
--    within 20 of a block end screw).
-- 2. Four library joints reproducing the kit's fixing holes (kit SPEC §5) —
--    keep in step with src/lib/curvedEnd/joints.ts (a test checks the formulas).
-- 3. Every construction-method schedule row (base / wall / tall) gets them as
--    the defaults for the curved end's declared seams; a key already set wins.
alter table public.joint_type_operations add column if not exists skip_near_mm numeric;

with seed(name, description, expr, skip) as (values
  ('CRV screw 50/250',
   'Curved end: Ø5 through the panel into the mating edge, 50 in from each end, at most 250 apart, centred on the mating board.',
   '{"qty":"D > 100 ? Math.ceil((D - 100) / 250 - 1e-9) + 1 : 1","spacing_mm":"D > 100 ? (D - 100) / Math.ceil((D - 100) / 250 - 1e-9) : 0","offset_z_mm":"D > 100 ? 50 : D / 2","offset_y_mm":"CW / 2"}'::jsonb,
   null::numeric),
  ('CRV screw 40/250',
   'Curved end back into the formers: Ø5 through, 40 in from each end, at most 250 apart.',
   '{"qty":"D > 80 ? Math.ceil((D - 80) / 250 - 1e-9) + 1 : 1","spacing_mm":"D > 80 ? (D - 80) / Math.ceil((D - 80) / 250 - 1e-9) : 0","offset_z_mm":"D > 80 ? 40 : D / 2","offset_y_mm":"CW / 2"}'::jsonb,
   null::numeric),
  ('CRV block face screw',
   'Curved end fixing block out into the face board: Ø5 through up the block centre, 50 in, at most 250 apart; gives way to a block end hole within 20.',
   '{"qty":"D > 100 ? Math.ceil((D - 100) / 250 - 1e-9) + 1 : 1","spacing_mm":"D > 100 ? (D - 100) / Math.ceil((D - 100) / 250 - 1e-9) : 0","offset_z_mm":"D > 100 ? 50 : D / 2","offset_y_mm":"CW / 2"}'::jsonb,
   20::numeric),
  ('CRV block end screw',
   'Curved end fixing block back into each former’s notch edge: two Ø5 through 25 in from each side on a block 80+ wide, else one centred.',
   '{"qty":"D >= 80 ? 2 : 1","spacing_mm":"D - 50","offset_z_mm":"D >= 80 ? 25 : D / 2","offset_y_mm":"CW / 2"}'::jsonb,
   null::numeric)
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
select jt.id, 1, 'part_b', 'drill', 'normal', 5, 16.7, 0, 0, 0, 1, null, 1, null, null, null, true, null, s.expr, s.skip
from seed s join jt on jt.name = s.name
where not exists (select 1 from joint_type_operations o where o.joint_type_id = jt.id);

with map(seam, joint) as (values
  ('crv_fix:former',   'CRV screw 50/250'),
  ('crv_fix:back',     'CRV screw 50/250'),
  ('crv_back:former',  'CRV screw 40/250'),
  ('crv_block:face',   'CRV block face screw'),
  ('crv_block:former', 'CRV block end screw')
), defs as (
  select jsonb_object_agg(m.seam, j.id::text) as d from map m join joint_types j on j.name = m.joint
)
update construction_method_schedule_rows r
set joint_defaults = defs.d || coalesce(r.joint_defaults, '{}'::jsonb)
from defs
where r.assembly_class in ('base', 'wall', 'tall') and defs.d is not null;
