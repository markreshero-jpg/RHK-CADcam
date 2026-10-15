-- A4 (2026-10-15): BFKANG — base angled corner filler (z_angled_filler).
-- Footprint = the angled_filler preset (45°, 40 / 40 visible fillers, 50 return
-- cleats). The box (default_dx / default_dz) is the outline's bbox; placement
-- re-seeds the leg depth from the room → job → shop base depth (classDepth) and
-- resets dx / dz from the shape (presetBox), then snaps into the wall corner.
-- Doorless support carcass with a full top, no internals; untick Carcass on the
-- placed cabinet for fillers + return cleats only. Construction, materials and
-- kick copied from B2D; category from BFF, subcategory Fillers.
INSERT INTO cabinet_definitions (name, assembly_class, construction_method_id, default_dx, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type, face_grid, internal_grid, rule_overrides,
  is_library_item, active, category_id, subcategory_id, carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior, description, sort_order, no_cnc, custom_parts,
  preserve_dx, preserve_dy, preserve_dz, footprint, faces)
SELECT 'BFKANG', 'base', b.construction_method_id, 494.3, b.default_dy, 614.8,
  true, false, true, true, 'full_top', b.toe_type,
  '{"cols":[{"col_index":0,"width_locked":false}],"rows":[{"row_index":0,"height_locked":false}],"zones":[{"col_index":0,"face_type":"false_panel","row_index":0}]}'::jsonb,
  NULL, b.rule_overrides,
  true, true, (SELECT category_id FROM cabinet_definitions WHERE name = 'BFF' LIMIT 1),
  (SELECT id FROM cabinet_subcategories WHERE name = 'Fillers'),
  b.carcase_joints, b.material_overrides, b.hardware_overrides,
  b.toekick_overrides, b.drawerbox_overrides, false,
  'Base angled corner filler: two mitred 40 mm face fillers to kick height in an angled inside corner (angle set from the walls on placement), over a doorless support carcass that can be switched off (return cleats instead).',
  b.sort_order, b.no_cnc, '[]'::jsonb,
  false, false, false,
  '{"preset":"angled_filler","params":{"side":"right","angle":45,"depth":580,"fill_a":40,"fill_b":40,"cleat":50,"fo":20,"rev":1},"from_preset":"angled_filler","segments":[{"type":"line","p0":{"x":0,"y":0},"p1":{"x":289.52813742385706,"y":0},"p0_expr":{"x":"0","y":"0"},"edge":{"id":"back","role":"back"}},{"type":"line","p0":{"x":289.52813742385706,"y":0},"p1":{"x":494.25544674057704,"y":204.72730931671992},"p0_expr":{"x":"((p.fill_a + p.rev + p.fo * tan(p.angle / 2)) + p.depth * tan(p.angle / 2))","y":"0"},"edge":{"id":"back2","role":"back"}},{"type":"line","p0":{"x":494.25544674057704,"y":204.72730931671992},"p1":{"x":84.13351365237952,"y":614.8492424049175},"p0_expr":{"x":"(((p.fill_a + p.rev + p.fo * tan(p.angle / 2)) + p.depth * tan(p.angle / 2)) + (p.depth * tan(p.angle / 2) + (p.fill_b + p.rev + p.fo * tan(p.angle / 2))) * cos(p.angle))","y":"((p.depth * tan(p.angle / 2) + (p.fill_b + p.rev + p.fo * tan(p.angle / 2))) * sin(p.angle))"},"edge":{"id":"side_b","role":"side"}},{"type":"line","p0":{"x":84.13351365237952,"y":614.8492424049175},"p1":{"x":49.2842712474619,"y":580},"p0_expr":{"x":"((((p.fill_a + p.rev + p.fo * tan(p.angle / 2)) + p.depth * tan(p.angle / 2)) + (p.depth * tan(p.angle / 2) + (p.fill_b + p.rev + p.fo * tan(p.angle / 2))) * cos(p.angle)) - p.depth * sin(p.angle))","y":"(((p.depth * tan(p.angle / 2) + (p.fill_b + p.rev + p.fo * tan(p.angle / 2))) * sin(p.angle)) + p.depth * cos(p.angle))"},"edge":{"id":"fill_b","role":"front","filler":{"width":40,"cleat":50}}},{"type":"line","p0":{"x":49.2842712474619,"y":580},"p1":{"x":0,"y":580},"p0_expr":{"x":"(p.fill_a + p.rev + p.fo * tan(p.angle / 2))","y":"p.depth"},"edge":{"id":"fill_a","role":"front","filler":{"width":40,"cleat":50}}},{"type":"line","p0":{"x":0,"y":580},"p1":{"x":0,"y":0},"p0_expr":{"x":"0","y":"p.depth"},"edge":{"id":"side_a","role":"side"}}]}'::jsonb,
  NULL
FROM cabinet_definitions b WHERE b.name = 'B2D'
  AND NOT EXISTS (SELECT 1 FROM cabinet_definitions WHERE name = 'BFKANG');
