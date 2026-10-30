-- Drawer box schedules for every drawer-box board colour in the library
-- (2026-10-30, Mark). One schedule per colour row: box + bottom both the colour,
-- tape = the colour's matched tape, else the range tape below. Plain boards with
-- no colours get one schedule. Skipped: raw MDF and 25/32 boards (not drawer
-- stock). 18mm boards get the underside bottom rebate automatically from the
-- drawer box method rule DB_BOTTOM_FIT_T (16) — nothing to set here.
-- The unused "16mm Colour" schedule (pointed at MDF 18) is retired.

with boards as (
  select m.id, m.name,
    case
      when p.name like 'LX Abs Grain%' then 'LX Abs Grain 1mm Matching'
      when p.name like 'LX Colour%'    then 'LX Colour 1mm Matching'
      when p.name like 'PT Woodmatt%'  then 'Matching Col A Grn - 21x1'
      when m.name like '%White'        then 'White STP 21x1'
      else 'Matching Col A - 21x1'
    end as range_tape
  from materials m
  left join materials p on p.id = m.parent_id
  where m.active
    and m.dz in (16, 16.5, 18)
    and coalesce(m.finish, '') <> 'Raw'
    and not exists (select 1 from materials c where c.parent_id = m.id and c.active)  -- colours, not their parent
    and not exists (select 1 from drawerbox_schedules d where d.material_id = m.id)
),
picked as (
  select b.id, b.name,
    coalesce(
      (select e.id from edge_banding e where e.material_match_id = b.id and e.active limit 1),
      (select e.id from edge_banding e where e.name = b.range_tape and e.active limit 1)
    ) as tape
  from boards b
)
insert into drawerbox_schedules (name, description, is_default, active, material_id, edgeband_id, bottom_material_id, bottom_edgeband_id)
select name, 'Box + bottom: ' || name, false, true, id, tape, id, tape from picked;

update drawerbox_schedules set active = false
where name = '16mm Colour'
  and material_id = (select id from materials where name = 'MDF 18mm');
