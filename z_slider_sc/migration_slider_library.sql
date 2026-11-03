-- T2D/SLD, T3D/SLD, T3D/SLD3 (2026-11-04, z_slider_sc S5): Häfele Slider SC
-- sliding robe doors in a recess. Face-only items (no carcass / internal / kick):
-- one row of 2 or 3 doors, sized and set on their tracks by resolveSlider from
-- rule_overrides.SLIDER ('2' | '3' | '3T'). Width = inside width wall to wall,
-- height = inside height, depth = recess depth (doors at the front). Profile /
-- finish / rail in the RHS sidebar. "/SLD" because "/SC" is the scribe modifier.
INSERT INTO cabinet_definitions (name, assembly_class, construction_method_id, default_dx, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type, face_grid, internal_grid, rule_overrides,
  is_library_item, active, category_id, subcategory_id, carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior, description, sort_order, no_cnc, custom_parts,
  preserve_dx, preserve_dy, preserve_dz, footprint, faces)
SELECT v.code, d.assembly_class, d.construction_method_id, v.dx, 2400, 600,
  false, false, true, false, d.top_type, d.toe_type,
  jsonb_build_object(
    'rows', jsonb_build_array(jsonb_build_object('row_index', 0, 'height_locked', false)),
    'cols', (SELECT jsonb_agg(jsonb_build_object('col_index', i, 'width_locked', false)) FROM generate_series(0, v.n - 1) i),
    'zones', (SELECT jsonb_agg(jsonb_build_object('row_index', 0, 'col_index', i, 'face_type', 'door', 'hinge_side', 'left')) FROM generate_series(0, v.n - 1) i)),
  d.internal_grid, jsonb_build_object('SLIDER', v.layout),
  d.is_library_item, true, d.category_id, d.subcategory_id, d.carcase_joints, d.material_overrides, d.hardware_overrides,
  d.toekick_overrides, d.drawerbox_overrides, false, v.descr, d.sort_order, d.no_cnc, '[]'::jsonb,
  false, true, true, null, d.faces
FROM (VALUES
  ('T2D/SLD',  2, '2',  2400, 'Sliding robe doors in a recess, 2 doors on a double track (Häfele Slider SC, soft close, 50 kg). Width = inside width, height = inside height. Profile / finish / rail in the sidebar.'),
  ('T3D/SLD',  3, '3',  3000, 'Sliding robe doors in a recess, 3 doors on a double track, middle door at the back (Häfele Slider SC). Width = inside width, height = inside height.'),
  ('T3D/SLD3', 3, '3T', 3600, 'Sliding robe doors in a recess, 3 doors on the triple track (Häfele Slider SC). Width = inside width, height = inside height.')
) AS v(code, n, layout, dx, descr)
JOIN cabinet_definitions d ON d.name = 'T2D'
WHERE NOT EXISTS (SELECT 1 FROM cabinet_definitions x WHERE x.name = v.code);
