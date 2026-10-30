-- z_joints C4 — Cabineo 12 in the hardware library (CABINEO-SPEC.md)
-- 1. A joint op can name the fitting that goes in each of its sets (one per
--    first-axis step) — drawn in 3D at the set, and counted later.
alter table public.joint_type_operations
  add column if not exists fitting_id uuid references public.hardware_accessories(id) on delete set null;

-- 2. Accessories get a 'connector' category.
alter table public.hardware_accessories drop constraint if exists hardware_accessories_category_check;
alter table public.hardware_accessories add constraint hardware_accessories_category_check
  check (category = any (array['hanging_rail', 'rail_support', 'connector', 'other']));

-- 3. The connector itself (Accessories, category 'connector'). No model yet:
--    3D draws a built-in stand-in until Lamello's connector model is uploaded.
do $$
declare acc uuid;
begin
  select id into acc from hardware_accessories where name = 'Lamello Cabineo 12, collar on surface';
  if acc is null then
    insert into hardware_accessories (name, brand, category, colour, material, active, notes)
    values ('Lamello Cabineo 12, collar on surface', 'Lamello', 'connector', '#3a3a3a', 'plastic + steel screw', true,
            'Concealed connector. Pocket 3 x Ø15 x 11, screw Ø5 x 12. Placed by the Lamello Cabineo 12 joints (z_joints).')
    returning id into acc;
  end if;
  update joint_type_operations o set fitting_id = acc
    from joint_types j
   where j.id = o.joint_type_id and j.name like 'Lamello Cabineo 12%' and o.target_part = 'part_a';
end $$;
