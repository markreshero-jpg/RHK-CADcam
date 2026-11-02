-- z_rangehood R5: the rangehood block + its flue box joints.
-- 1. `rangehood jsonb` on definitions + instances (null = not a rangehood cabinet);
--    copied definition → instance at placement (job pinning), back on Save to library.
-- 2. Every construction-method schedule row gets 5mm Dynamic Holes as the default
--    for the flue box's declared seams (shelf / top into each piece's edge, front
--    piece into the sides). A key already set wins.
alter table public.cabinet_definitions add column if not exists rangehood jsonb;
alter table public.cabinet_instances   add column if not exists rangehood jsonb;

with defs as (
  select jsonb_build_object('rh_flue:shelf', j.id::text, 'rh_flue:top', j.id::text, 'rh_flue:front', j.id::text) as d
  from joint_types j where j.name = '5mm Dynamic Holes' limit 1
)
update construction_method_schedule_rows r
set joint_defaults = defs.d || coalesce(r.joint_defaults, '{}'::jsonb)
from defs
where r.assembly_class in ('base', 'wall', 'tall');
