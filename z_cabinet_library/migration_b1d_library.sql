-- B1D (2026-10-18): base, one door. Applied.
-- Copied from B2D for construction, materials, rules and internals (one adj
-- shelf); single column, door hinged left, 450 default width — same shape as
-- W1D vs W2D. Hinge side flips per placement (/L /R).
INSERT INTO cabinet_definitions (name, assembly_class, construction_method_id, default_dx, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type, face_grid, internal_grid, rule_overrides,
  is_library_item, active, category_id, subcategory_id, carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior, description, sort_order, no_cnc, custom_parts,
  preserve_dx, preserve_dy, preserve_dz, footprint, faces)
SELECT 'B1D', assembly_class, construction_method_id, 450, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type,
  '{"cols":[{"col_index":0,"width_locked":false}],"rows":[{"row_index":0,"height_locked":false}],"zones":[{"col_index":0,"face_type":"door","row_index":0,"hinge_side":"left"}]}'::jsonb,
  internal_grid, rule_overrides,
  is_library_item, true, category_id, subcategory_id,
  carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior,
  'Base, one door, one adjustable shelf.', 0, no_cnc, custom_parts,
  preserve_dx, preserve_dy, preserve_dz, footprint, faces
FROM cabinet_definitions WHERE name = 'B2D'
  AND NOT EXISTS (SELECT 1 FROM cabinet_definitions WHERE name = 'B1D');
UPDATE cabinet_definitions SET sort_order = 1 WHERE name = 'B2D';
