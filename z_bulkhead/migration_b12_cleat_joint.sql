-- z_bulkhead B12 (Mark, 2026-11-07): the cleat's upright runs to the bottom and
-- the flat leg butts into it, joined by the declared seam `bh:cleat`. Every wall
-- construction-method schedule row gets 5mm Dynamic Holes as its default
-- (a key already set wins).
with defs as (
  select jsonb_build_object('bh:cleat', j.id::text) as d
  from joint_types j where j.name = '5mm Dynamic Holes' limit 1
)
update construction_method_schedule_rows r
set joint_defaults = defs.d || coalesce(r.joint_defaults, '{}'::jsonb)
from defs
where r.assembly_class in ('base', 'wall', 'tall');
