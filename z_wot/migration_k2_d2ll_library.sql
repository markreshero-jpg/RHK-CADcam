-- K2 (2026-10-19): D2-LL — base, two equal large drawers (z_wot/WOT-KIT-SPEC.md).
-- Copied from D2-SL with both rows unlocked so they share the height equally.
-- The WOT kit places it 650 high with a full top; the library row keeps
-- D2-SL's top. Applied.
INSERT INTO cabinet_definitions (name, assembly_class, construction_method_id, default_dx, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type, face_grid, internal_grid, rule_overrides,
  is_library_item, active, category_id, subcategory_id, carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior, description, sort_order, no_cnc, custom_parts,
  preserve_dx, preserve_dy, preserve_dz, footprint, faces, contents)
SELECT 'D2-LL', assembly_class, construction_method_id, 600, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type,
  '{"cols":[{"col_index":0,"width_locked":false}],
    "rows":[{"row_index":0,"height_locked":false},{"row_index":1,"height_locked":false}],
    "zones":[{"col_index":0,"face_type":"drawer_face","row_index":0,"hinge_side":"left"},
             {"col_index":0,"face_type":"drawer_face","row_index":1,"hinge_side":"left"}]}'::jsonb,
  internal_grid, rule_overrides,
  true, true, category_id, subcategory_id, carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior,
  'Base, two equal large drawers.', sort_order + 1, no_cnc, custom_parts,
  preserve_dx, preserve_dy, preserve_dz, footprint, faces, contents
FROM cabinet_definitions WHERE name = 'D2-SL' AND is_library_item
  AND NOT EXISTS (SELECT 1 FROM cabinet_definitions WHERE name = 'D2-LL');
