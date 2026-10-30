-- z_joints C1 — Lamello Cabineo 12 (CABINEO-SPEC.md)
-- 1. joint ops can keep a part_b face hole stopped instead of through-bored.
alter table public.joint_type_operations
  add column if not exists stopped boolean not null default false;

-- 2. Two joint types, one per pocket face. Spacing copies "5mm Dynamic Holes"
--    (50 in from each end, ≤ 280 apart) so the two swap without moving holes.
--    Pocket = Lamello's 3 × Ø15 circles at 3.6 / 14.8 / 26.0 from the edge:
--    one op, 2nd axis 3 @ 11.2 centred on 14.8. Collar-on-surface depth 11.
--    Screw hole Ø5 × 12 into part B, axis 5 below the pocket face.
do $$
declare jin uuid; jout uuid;
  q   text := 'Math.ceil((D - 100) / 280) + 1';
  spc text := '(D - 100) / Math.ceil((D - 100) / 280)';
begin
  if exists (select 1 from joint_types where name like 'Lamello Cabineo 12%') then return; end if;
  insert into joint_types (name, description) values
    ('Lamello Cabineo 12 - inside',  'Concealed Cabineo 12 (collar on surface): pocket on part A''s inside face, Ø5×12 screw hole in part B') returning id into jin;
  insert into joint_types (name, description) values
    ('Lamello Cabineo 12 - outside', 'Concealed Cabineo 12 (collar on surface): pocket on part A''s outside face, Ø5×12 screw hole in part B') returning id into jout;

  insert into joint_type_operations
    (joint_type_id, operation_order, target_part, machine_operation, face, tool_diameter_mm, depth_mm,
     offset_x_mm, offset_y_mm, offset_z_mm, qty, spacing_mm, qty2, spacing2_mm, auto_tool, stopped, notes, expressions)
  values
    (jin,  1, 'part_a', 'drill', 'inside',  15, 11, 14.8, 0, 50, 2, 150, 3, 11.2, true, false,
     'Cabineo pocket (3 × Ø15)', jsonb_build_object('qty', q, 'spacing_mm', spc)),
    (jin,  2, 'part_b', 'drill', 'normal',   5, 12, 0,    5, 50, 2, 150, 1, null, true, true,
     'Cabineo screw Ø5×12', jsonb_build_object('qty', q, 'spacing_mm', spc, 'offset_y_mm', 'IN ? 5 : CW - 5')),
    (jout, 1, 'part_a', 'drill', 'outside', 15, 11, 14.8, 0, 50, 2, 150, 3, 11.2, true, false,
     'Cabineo pocket (3 × Ø15)', jsonb_build_object('qty', q, 'spacing_mm', spc)),
    (jout, 2, 'part_b', 'drill', 'normal',   5, 12, 0,    5, 50, 2, 150, 1, null, true, true,
     'Cabineo screw Ø5×12', jsonb_build_object('qty', q, 'spacing_mm', spc, 'offset_y_mm', 'IN ? CW - 5 : 5'));
end $$;
