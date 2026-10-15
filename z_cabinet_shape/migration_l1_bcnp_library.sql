-- L1 (2026-10-15): BCNP — base corner, square L (pie). Applied.
-- 900 × 900 box (preserve_dz so the depth cascade doesn't shrink it), footprint
-- = the l_corner preset. Leg depths (p.leg_back / p.leg_side) are classDepth
-- params: buildInstanceFromDefinition re-seeds them from the room → job → shop
-- base depth at placement, so the 580 here is only the fallback.
-- Copied from B2D for construction, materials, rules and internals. Class is
-- plain 'base' (same depth cascade + snapping; corner classes are unused in data).
-- Primary facet = 'front' (back-wall leg), door hinged right on the end panel;
-- 'front2' takes the default facet door, hinged on end2.
INSERT INTO cabinet_definitions (name, assembly_class, construction_method_id, default_dx, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type, face_grid, internal_grid, rule_overrides,
  is_library_item, active, category_id, subcategory_id, carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior, description, sort_order, no_cnc, custom_parts,
  preserve_dx, preserve_dy, preserve_dz, footprint, faces)
SELECT 'BCNP', 'base', construction_method_id, 900, default_dy, 900,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type,
  '{"cols":[{"col_index":0,"width_locked":false}],"rows":[{"row_index":0,"height_locked":false}],"zones":[{"col_index":0,"face_type":"door","row_index":0,"hinge_side":"right"}]}'::jsonb,
  internal_grid, rule_overrides,
  is_library_item, true, category_id, (SELECT id FROM cabinet_subcategories WHERE name = 'Corners'),
  carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior,
  'Base corner, square L (pie). 900 × 900; both legs take the room/job base depth at placement.', sort_order, no_cnc, '[]'::jsonb,
  true, false, true,
  '{"preset":"l_corner","params":{"side":"right","leg_back":580,"leg_side":580},"from_preset":"l_corner","segments":[{"type":"line","p0":{"x":0,"y":0},"p1":{"x":900,"y":0},"p0_expr":{"x":"0","y":"0"},"edge":{"id":"back","role":"back"}},{"type":"line","p0":{"x":900,"y":0},"p1":{"x":900,"y":580},"p0_expr":{"x":"cab.w","y":"0"},"edge":{"id":"end","role":"side"}},{"type":"line","p0":{"x":900,"y":580},"p1":{"x":580,"y":580},"p0_expr":{"x":"cab.w","y":"p.leg_back"},"edge":{"id":"front","role":"front"}},{"type":"line","p0":{"x":580,"y":580},"p1":{"x":580,"y":900},"p0_expr":{"x":"p.leg_side","y":"p.leg_back"},"edge":{"id":"front2","role":"front"}},{"type":"line","p0":{"x":580,"y":900},"p1":{"x":0,"y":900},"p0_expr":{"x":"p.leg_side","y":"cab.d"},"edge":{"id":"end2","role":"side"}},{"type":"line","p0":{"x":0,"y":900},"p1":{"x":0,"y":0},"p0_expr":{"x":"0","y":"cab.d"},"edge":{"id":"back2","role":"back"}}]}'::jsonb,
  NULL
FROM cabinet_definitions WHERE name = 'B2D';
