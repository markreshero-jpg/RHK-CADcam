-- Shelf supports as joint fittings (Mark, 2026-11-03).
-- Accessories category 'shelf_support'; Furnware SSW support linked to the adj
-- shelf pin joints, which drill the middle hole 4 below the shelf (T + 4).
alter table hardware_accessories drop constraint if exists hardware_accessories_category_check;
alter table hardware_accessories add constraint hardware_accessories_category_check
  check (category = any (array['hanging_rail', 'rail_support', 'connector', 'shelf_support', 'other']));

insert into hardware_accessories (name, brand, category, supplier_code, colour, material, width_mm, height_mm, depth_mm, active, notes)
select 'Shelf support SSW 5mm, metal pin, white', 'Furnware', 'shelf_support', 'SSW.WH.FG', '#f2f2f2', 'plastic + steel pin', 10.5, 13.4, 8.5, true,
       'Furnware Standard Shelf Support, plastic, 5mm metal pin, bags of 1000. Pin Ø5 x 8; body 10.5 wide x 8.5 out; shelf sits 4 above the hole centre. Placed by the adj shelf pin joints (one per cluster, in the hole under the shelf).'
where not exists (select 1 from hardware_accessories where supplier_code = 'SSW.WH.FG');

update joint_type_operations set fitting_id = (select id from hardware_accessories where supplier_code = 'SSW.WH.FG')
where joint_type_id in ('3fe377e6-e842-41f6-a3b0-c7a767c000c7', 'f78dc261-1eb0-4339-927d-49cdfc345e1c')
  and target_part = 'part_b' and face = 'normal' and machine_operation = 'drill';

-- 2026-11-05: the third adj shelf pin joint ("x2 Rows - 4 @ 64", used per
-- cabinet on RHK6550) gets the same support — it was missed above.
update joint_type_operations set fitting_id = (select id from hardware_accessories where supplier_code = 'SSW.WH.FG')
where joint_type_id = '9e8430fe-80b8-47f1-8d9f-d01af724c690'
  and target_part = 'part_b' and face = 'normal' and machine_operation = 'drill' and fitting_id is null;
