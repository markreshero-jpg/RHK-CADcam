-- WOT (2026-10-19): wall oven tower with an oven + microwave as contents
-- (z_ubo contents mechanism). Applied.
-- Locked with the user: oven opening starts 650 off the floor, two drawers
-- below, microwave / compact opening above the oven; the tower stops just
-- above the microwave — a W2D cupboard goes above it as its own cabinet.
--
-- Face grid bottom-up: drawer / drawer (unlocked, equal) / open 600 (oven) /
-- open 450 (microwave). Height preserved at 1706 = 650 + 600 + GAPR 2 + 450 +
-- REVT 4, so the oven opening sits at 650 whatever the kick (the drawers take
-- up the difference: 253 each at a 140 kick, 248 at 150).
-- Interior: oven shelf + microwave shelf on the bottoms of their openings.
-- Back: back rail only, like the UBO (BACK_TYPE rail). Construction, materials,
-- kick, full top and category from T2D.

-- Generic built-in microwave to fill the 450 opening (no model yet — box).
INSERT INTO fixture_catalog (category, kind, name, width, depth, height, mount, active, sort_order, cut_benchtop)
SELECT 'appliance', 'Microwave', 'Generic microwave 600 x 450', 600, 400, 450, 'under_bench', true, 0, false
WHERE NOT EXISTS (SELECT 1 FROM fixture_catalog WHERE name = 'Generic microwave 600 x 450');

INSERT INTO cabinet_definitions (name, assembly_class, construction_method_id, default_dx, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type, face_grid, internal_grid, rule_overrides,
  is_library_item, active, category_id, subcategory_id, carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior, description, sort_order, no_cnc, custom_parts,
  preserve_dx, preserve_dy, preserve_dz, footprint, faces, contents)
SELECT 'WOT', 'tall', construction_method_id, 600, 1706, default_dz,
  true, true, true, has_toekick, top_type, toe_type,
  '{"cols":[{"col_index":0,"width_locked":false}],
    "rows":[{"row_index":0,"height_locked":false},{"row_index":1,"height_locked":false},
            {"row_index":2,"height":600,"height_locked":true},{"row_index":3,"height":450,"height_locked":true}],
    "zones":[{"col_index":0,"face_type":"drawer_face","row_index":0},{"col_index":0,"face_type":"drawer_face","row_index":1},
             {"col_index":0,"face_type":"open","row_index":2},{"col_index":0,"face_type":"open","row_index":3}]}'::jsonb,
  '{"tree":{"type":"open","fittings":[
     {"type":"fixed_shelf","y_locked":false,"align_face_row":{"row_index":2,"edge":"bottom"}},
     {"type":"fixed_shelf","y_locked":false,"align_face_row":{"row_index":3,"edge":"bottom"}}]}}'::jsonb,
  COALESCE(rule_overrides, '{}'::jsonb) || '{"BACK_TYPE":"rail"}'::jsonb,
  true, true, category_id, (SELECT id FROM cabinet_subcategories WHERE name = 'Appliances'),
  carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior,
  'Wall oven tower: 600 wide, two drawers, oven opening from 650 off the floor, 450 microwave opening above; stops above the microwave (W2D cupboard over it). Back rail only.',
  2, no_cnc, '[]'::jsonb,
  false, true, false, NULL, NULL,
  jsonb_build_array(
    jsonb_build_object('fixture_catalog_id', (SELECT id FROM fixture_catalog WHERE name = 'Generic oven 600' LIMIT 1),
      'anchor', jsonb_build_object('kind', 'zone', 'row_index', 2, 'col_index', 0)),
    jsonb_build_object('fixture_catalog_id', (SELECT id FROM fixture_catalog WHERE name = 'Generic microwave 600 x 450' LIMIT 1),
      'anchor', jsonb_build_object('kind', 'zone', 'row_index', 3, 'col_index', 0)))
FROM cabinet_definitions WHERE name = 'T2D'
  AND NOT EXISTS (SELECT 1 FROM cabinet_definitions WHERE name = 'WOT');
