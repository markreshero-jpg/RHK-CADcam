-- z_faced_doors F6 — inset mirror door (mirror routed in from the back).
-- Same machining as the glass door (rebate + squared corners + opening cut through,
-- all from the back); the pane is a mirror. Everything is library data, editable in
-- Settings → CNC Tool Sets (rebate / depths / pane) and Library → Doors (frame).

-- 1. Pane type on a glass recipe: what the glazier cuts ('4mm Mirror'); null = 'Glass'.
alter table cnc_tool_sets add column if not exists glass_type text;
comment on column cnc_tool_sets.glass_type is 'Pane type on the Glass Order and in 3D (e.g. 4mm Mirror); null = Glass';

-- 2. Tool set "Mirror Door": a copy of Glass Door's steps, 4mm mirror pane.
insert into cnc_tool_sets (name, description, is_active, sort_order, glass_thickness_mm, glass_clearance_mm, glass_type)
select 'Mirror Door',
       'Inset mirror, all from the back: 15.9 x 6.35 rebate, corners squared with the 6mm, opening cut through. 4mm mirror siliconed into the rebate. Rebate steps are offset -15.9 (outward) from the opening line.',
       true, 2, 4, 1.5, '4mm Mirror'
where not exists (select 1 from cnc_tool_sets where name = 'Mirror Door');

insert into cnc_tool_set_operations (tool_set_id, tool_id, depth_eq, depth_mm, width_mm, sort_order, description, fill_strategy,
  offset_top_mm, ring_width_mm, tool_position, offset_left_mm, operation_type, offset_right_mm, offset_bottom_mm,
  raster_angle_deg, cleanup_radius_mm, feed_rate_override, raster_stepover_pct, spindle_speed_override)
select m.id, o.tool_id, o.depth_eq, o.depth_mm, o.width_mm, o.sort_order,
       replace(o.description, 'glass', 'mirror'), o.fill_strategy,
       o.offset_top_mm, o.ring_width_mm, o.tool_position, o.offset_left_mm, o.operation_type, o.offset_right_mm, o.offset_bottom_mm,
       o.raster_angle_deg, o.cleanup_radius_mm, o.feed_rate_override, o.raster_stepover_pct, o.spindle_speed_override
from cnc_tool_set_operations o
join cnc_tool_sets g on g.id = o.tool_set_id and g.name = 'Glass Door'
cross join (select id from cnc_tool_sets where name = 'Mirror Door') m
where not exists (select 1 from cnc_tool_set_operations x where x.tool_set_id = m.id);

-- 3. Profile "Mirror inset": frame 60 all round (per-edge offsets editable).
insert into door_profiles (name, profile_type, description, is_active, sort_order)
select 'Mirror inset', 'custom', 'Mirror inset from the back, frame 60 (Mirror Door tool set)', true, 1
where not exists (select 1 from door_profiles where name = 'Mirror inset');

insert into door_profile_operations (profile_id, operation_type, depth_mm, face, repeat_axis, tool_set_id, offset_from_edge_mm,
  description, sort_order, lead_in_mm, lead_out_mm, auto_tool, raster_angle_deg, raster_stepover_pct)
select p.id, 'pocket', 6.35, 'back', 'none', s.id, 60,
       'Mirror opening - frame 60 (rebate + cut-out from the Mirror Door tool set, all from the back)', 1, 0, 0, false, 0, 40
from door_profiles p cross join cnc_tool_sets s
where p.name = 'Mirror inset' and s.name = 'Mirror Door'
  and not exists (select 1 from door_profile_operations x where x.profile_id = p.id);

-- 4. Style "Mirror inset — 2pac": Glass — 2pac's blank + colour range with the mirror profile.
insert into door_styles (name, door_catalogue_id, door_material_schedule_id, default_material_id, door_profile_id, description, is_active, sort_order)
select 'Mirror inset — 2pac', g.door_catalogue_id, g.door_material_schedule_id, g.default_material_id, p.id,
       'Inset mirror door, 60 frame, 2pac. Mirror routed in from the back (Mirror Door tool set), siliconed. Mirror sizes on Reports -> Glass Order.',
       true, 13
from door_styles g cross join door_profiles p
where g.name = 'Glass — 2pac' and p.name = 'Mirror inset'
  and not exists (select 1 from door_styles where name = 'Mirror inset — 2pac');
