-- z_cabinet_shape L3 follow-up (Mark, 2026-10-15): "we only need one row not 2
-- rows per edge. it should sit in the middle of the edge length." Copy of
-- "Adjustable Shelf Holes x2 Rows" with one row at D / 2 (D = the edge length
-- the shelf shares with the back), set as the CM default for adj_shelf:back.
-- Applied 2026-10-15 (joint id f78dc261-1eb0-4339-927d-49cdfc345e1c).
with jt as (
  insert into joint_types (name, description) values ('Adjustable Shelf Holes x1 Row (centre)', 'One row of 5mm adj shelf holes centred on the edge length — L corner back edges')
  returning id)
insert into joint_type_operations (joint_type_id, operation_order, target_part, machine_operation, tool_diameter_mm, depth_mm, offset_x_mm, offset_y_mm, notes, offset_z_mm, qty, face, spacing_mm, expressions, qty2, spacing2_mm, router_tool_id, drill_id, auto_tool)
select jt.id, 1, 'part_b', 'drill', 5, 12, 0, 0, 'Adj Shelf Hole (centre)', 50, 1, 'normal', null,
  '{"offset_z_mm":"D / 2","offset_y_mm":"T / 2"}'::jsonb, 5, 32, null, null, true from jt;

update construction_method_schedule_rows
  set joint_defaults = joint_defaults || '{"adj_shelf:back":"f78dc261-1eb0-4339-927d-49cdfc345e1c"}'::jsonb
  where joint_defaults ? 'adj_shelf:side';
