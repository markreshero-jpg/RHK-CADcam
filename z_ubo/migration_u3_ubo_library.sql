-- U3 (2026-10-18): UBO — under-bench oven cabinet (z_ubo). Applied.
-- Copied from B2D for construction, materials, kick and category. 600 wide
-- overall; face grid bottom-up: fixed panel / open 600 (locked) / fixed panel,
-- the two panels share the rest equally. Interior: one fixed shelf whose top
-- face sits on the bottom of the oven opening (align_face_row, U2). No back
-- panel, a back top rail on edge instead (BACK_TYPE rail, U1). The oven itself
-- comes with U4 (contents).
INSERT INTO cabinet_subcategories (name, sort_order, active)
SELECT 'Appliances', COALESCE(MAX(sort_order), 0) + 1, true FROM cabinet_subcategories
WHERE NOT EXISTS (SELECT 1 FROM cabinet_subcategories WHERE name = 'Appliances');

INSERT INTO cabinet_definitions (name, assembly_class, construction_method_id, default_dx, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type, face_grid, internal_grid, rule_overrides,
  is_library_item, active, category_id, subcategory_id, carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior, description, sort_order, no_cnc, custom_parts,
  preserve_dx, preserve_dy, preserve_dz, footprint, faces)
SELECT 'UBO', 'base', construction_method_id, 600, default_dy, default_dz,
  true, true, true, has_toekick, top_type, toe_type,
  '{"cols":[{"col_index":0,"width_locked":false}],
    "rows":[{"row_index":0,"height_locked":false},{"row_index":1,"height":600,"height_locked":true},{"row_index":2,"height_locked":false}],
    "zones":[{"col_index":0,"face_type":"false_panel","row_index":0},{"col_index":0,"face_type":"open","row_index":1},{"col_index":0,"face_type":"false_panel","row_index":2}]}'::jsonb,
  '{"tree":{"type":"open","fittings":[{"type":"fixed_shelf","y_locked":false,"align_face_row":{"row_index":1,"edge":"bottom"}}]}}'::jsonb,
  COALESCE(rule_overrides, '{}'::jsonb) || '{"BACK_TYPE":"rail"}'::jsonb,
  true, true, category_id, (SELECT id FROM cabinet_subcategories WHERE name = 'Appliances'),
  carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior,
  'Under-bench oven: 600 wide, fixed panels above and below a 600 high oven opening, oven shelf at the bottom of the opening, no back (top back rail on edge).',
  0, no_cnc, '[]'::jsonb,
  false, false, false, NULL, NULL
FROM cabinet_definitions WHERE name = 'B2D'
  AND NOT EXISTS (SELECT 1 FROM cabinet_definitions WHERE name = 'UBO');
