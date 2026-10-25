-- z_accessories S2 / S3 (2026-10-25): hanging rail supports + end support drilling.
-- 1. Support sizes: height_mm (end support 50), width_mm = front-to-back,
--    depth_mm (new) = off the mounting face. Pillars run rail centre → shelf above,
--    so only their width / depth are used.
-- 2. Rail links its end pillar too (end_support_id / centre_support_id exist).
-- 3. joint_id: the joint that drills a support's fixing holes (A8).
-- 4. Library joint "Finista end support": 2 × Ø5 at 32 centres one above the other,
--    centred front-to-back, lower hole 10 up from the support's bottom, 1 deep
--    into the gable (a prick to mark the screws). Part A = the gable.

alter table hardware_accessories add column if not exists depth_mm numeric;
alter table hardware_accessories add column if not exists end_pillar_id uuid references hardware_accessories(id) on delete set null;
alter table hardware_accessories add column if not exists joint_id uuid references joint_types(id) on delete set null;
comment on column hardware_accessories.depth_mm is 'Rail support: thickness off the mounting face (gable / shelf)';
comment on column hardware_accessories.joint_id is 'Joint that drills this support''s fixing holes (z_accessories A8)';

insert into joint_types (name, description)
select 'Finista end support',
       'Hanging rail end support: 2 x Ø5 at 32 centres one above the other, centred front-to-back on the support, lower hole 10 up from its bottom, pricked 1 deep into the gable.'
where not exists (select 1 from joint_types where name = 'Finista end support');

insert into joint_type_operations (joint_type_id, operation_order, target_part, machine_operation, face,
  tool_diameter_mm, depth_mm, offset_x_mm, offset_y_mm, offset_z_mm, qty, spacing_mm, qty2, spacing2_mm, auto_tool)
select j.id, 1, 'part_a', 'drill', 'normal', 5, 1, 0, 0, 10, 2, 32, 1, null, true
from joint_types j
where j.name = 'Finista end support'
  and not exists (select 1 from joint_type_operations o where o.joint_type_id = j.id);

-- Sizes are placeholders until the models come in (only the 50 height is from Mark).
update hardware_accessories set height_mm = 50, width_mm = 25, depth_mm = 12,
       joint_id = (select id from joint_types where name = 'Finista end support')
 where supplier_code = '1-490-112';
update hardware_accessories set width_mm = 20, depth_mm = 20 where supplier_code in ('1-490-116', '1-490-118');
update hardware_accessories set end_pillar_id = (select id from hardware_accessories where supplier_code = '1-490-118')
 where supplier_code = '7104006';

-- Supports persist as internal parts of their own type.
alter table internal_parts drop constraint if exists internal_parts_part_type_check;
alter table internal_parts add constraint internal_parts_part_type_check check (part_type = any (array['adj_shelf','fixed_shelf','divider','inner_drawer_bottom','inner_drawer_back','inner_drawer_side','inner_drawer_front','pull_out_bottom','pull_out_side','pull_out_back','accessory','rail_support']));
