-- z_cabinet_shape L2 (Mark, 2026-10-15): "we use the inserta type 170° hinges
-- and the knock in type bi-fold". Hardware library rows for the BCNP pie-corner
-- doors. Cup/dowel geometry follows the existing Blum 110 row's 45/9.5 pattern —
-- check against Blum's drilling template before the first CNC run.
insert into hardware_hinges
  (name, brand, supplier_code, hinge_type, default_hinge_edge, opening_angle, overlay,
   cup_diameter, cup_depth_mm, cup_x_from_edge_mm, boring_depth, bore_centre_to_door_face_mm,
   mount_angle_deg, soft_close, anchor_holes, active, notes)
values
  ('Blum 170 INSERTA', 'Blum', '71T6580', 'euro', 'left', 170, 'full',
   35, 13.5, 22, 13.5, 35, 0, false,
   '[{"depth":12,"diameter":8,"offset_x":9.5,"offset_y":22.5},{"depth":12,"diameter":8,"offset_x":9.5,"offset_y":-22.5}]',
   true, 'CLIP top 170° INSERTA, zero protrusion. BCNP lead door, end-panel edge. No soft-close built in (BLUMOTION add-on).'),
  ('Blum 60 bi-fold knock-in', 'Blum', '79T8530', 'euro', 'left', 60, 'full',
   35, 13.5, 12.5, 13.5, 35, 0, false,
   '[{"depth":12,"diameter":8,"offset_x":9.5,"offset_y":22.5},{"depth":12,"diameter":8,"offset_x":9.5,"offset_y":-22.5}]',
   true, 'CLIP top 60° bi-fold, knock-in dowels. Cup on the lead door''s pie edge at 12.5 mm (partial bore). Plate screws to the trailing door''s back face, holes 37 mm from its edge. Use only with the 170° hinge.');
