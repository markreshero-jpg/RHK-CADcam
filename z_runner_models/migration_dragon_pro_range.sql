-- DTC Dragon Pro NL 300–450 × H 95 / 127 / 178 (the 500s already exist).
-- Source: z_runner_models/NIKPOL-DRAGON-PRO-RESEARCH.md (Nikpol Dragon Pro Tilt
-- Adjust Installation Guide 2026, p.6–7). Each new row is a clone of the 500 row
-- of the same height — drilling into the drawer back / bottom / front depends on
-- height only — with the gable rear-bracket hole moved per length:
--   NL 300 / 350 → 165, 400 → 229, 450 / 500 → 261 (front bracket 37 for all).
-- Finishes (silk white / matt black / matt grey) are separate Nikpol SKUs but
-- the same hardware, so one row per size; SKUs are in notes.
-- Drawn parametrically (drawn_as = dragon_pro), no GLB.

with sizes(nl, h, rear, digit) as (
  select nl, h,
    case when nl <= 350 then 165 when nl = 400 then 229 else 261 end,
    case h when 95 then 1 when 127 then 2 else 3 end
  from unnest(array[300, 350, 400, 450]) nl, unnest(array[95, 127, 178]) h
),
tmpl as (
  select s.*, z.nl, z.h, z.rear, z.digit
  from sizes z
  join hardware_slides s on s.kind = 'slide' and s.name = 'Dragon Pro 500x' || z.h
),
ins as (
  insert into hardware_slides (name, brand, kind, side_deduction, height_options, runner_depth_options,
    min_runner_depth, max_runner_depth, active, notes, soft_close, full_extension, cost_per_pair,
    nominal_length, box_height, runner_thickness, colour, model_scale, model_anchor_x, model_anchor_y,
    model_anchor_z, drawn_as)
  select 'Dragon Pro ' || t.nl || 'x' || t.h, t.brand, 'slide', t.side_deduction, t.height_options, t.runner_depth_options,
    t.min_runner_depth, t.max_runner_depth, true,
    format('DTC Dragon Pro %s x %smm 40kg drawer kit, tilt adjust. Nikpol HB0%s%s04AX (silk white); +MB matt black, +MG matt grey where stocked. Min internal depth NL+3.',
           t.h, t.nl, t.digit, t.nl / 10),
    t.soft_close, t.full_extension, t.cost_per_pair, t.nl, t.h, t.runner_thickness, t.colour,
    1, 0, 0, 0, 'dragon_pro'
  from tmpl t
  where not exists (select 1 from hardware_slides x where x.kind = 'slide' and x.name = 'Dragon Pro ' || t.nl || 'x' || t.h)
  returning id, nominal_length, box_height
),
ops as (
  insert into drawer_slide_operations (slide_id, operation_order, target_surface, machine_operation,
    tool_diameter_mm, depth_mm, along_off_mm, up_off_mm, qty, spacing_mm, side, notes, expressions,
    repeat_axis, router_tool_id, drill_id, auto_tool)
  select i.id, o.operation_order, o.target_surface, o.machine_operation, o.tool_diameter_mm, o.depth_mm,
    case when o.target_surface = 'cabinet_member' and o.along_off_mm = 261 then t.rear else o.along_off_mm end,
    o.up_off_mm, o.qty, o.spacing_mm, o.side, o.notes, o.expressions, o.repeat_axis, o.router_tool_id, o.drill_id, o.auto_tool
  from ins i
  join tmpl t on t.nl = i.nominal_length and t.h = i.box_height
  join drawer_slide_operations o on o.slide_id = t.id
  returning slide_id
)
-- Make them reachable: entries in the DTC Dragon Pro schedule (depth tier = NL).
insert into slide_schedule_entries (schedule_id, depth_threshold, height_threshold, slide_id)
select sch.id, i.nominal_length, i.box_height, i.id
from ins i
cross join (select id from slide_schedules where name = 'DTC Dragon Pro') sch
where not exists (select 1 from slide_schedule_entries e where e.schedule_id = sch.id
                  and e.depth_threshold = i.nominal_length and e.height_threshold = i.box_height);
