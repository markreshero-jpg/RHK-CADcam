-- B4 (2026-10-18): BH — bulkhead library row (z_bulkhead). New Wall → Bulkheads
-- category. No carcass / internals / face / kick: resolveBulkhead builds the
-- fascia (+ returns + cleat) from `bulkhead`. Height follows ceiling − wall-cab
-- top on placement (auto_h); depth = the wall-class cascade (carcase depth).
-- Construction + overrides copied from W2D.
INSERT INTO cabinet_categories (name, parent_id, sort_order, active)
SELECT 'Bulkheads', (SELECT id FROM cabinet_categories WHERE name = 'Wall' AND parent_id IS NULL LIMIT 1), 3, true
WHERE NOT EXISTS (
  SELECT 1 FROM cabinet_categories c JOIN cabinet_categories p ON p.id = c.parent_id
  WHERE c.name = 'Bulkheads' AND p.name = 'Wall');

INSERT INTO cabinet_definitions (name, assembly_class, construction_method_id, default_dx, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type, face_grid, internal_grid, rule_overrides,
  is_library_item, active, category_id, subcategory_id, carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior, description, sort_order, no_cnc, custom_parts,
  preserve_dx, preserve_dy, preserve_dz, footprint, faces, bulkhead)
SELECT 'BH', 'wall', w.construction_method_id, 600, 300, w.default_dz,
  false, false, false, false, w.top_type, w.toe_type, '{}'::jsonb, NULL, '{}'::jsonb,
  true, true,
  (SELECT c.id FROM cabinet_categories c JOIN cabinet_categories p ON p.id = c.parent_id WHERE c.name = 'Bulkheads' AND p.name = 'Wall' LIMIT 1),
  (SELECT id FROM cabinet_subcategories WHERE name = 'Panels'),
  '{}'::jsonb, w.material_overrides, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, false,
  'Bulkhead: exposed-board fascia from the overhead tops to the ceiling, with optional left / right / bottom returns (mitre or butt) and an L fixing cleat.',
  0, false, '[]'::jsonb,
  false, true, false, NULL, NULL,
  '{"front":"doors","auto_h":true,"cleat":true,"left":{"on":false,"depth":600,"joint":"mitre"},"right":{"on":false,"depth":600,"joint":"mitre"},"bottom":{"on":false,"depth":600,"joint":"mitre"}}'::jsonb
FROM cabinet_definitions w WHERE w.name = 'W2D'
  AND NOT EXISTS (SELECT 1 FROM cabinet_definitions WHERE name = 'BH');
