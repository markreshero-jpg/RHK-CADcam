-- BSK (2026-10-18): base sink cabinet with its sink + tap as contents (z_ubo
-- contents mechanism). Applied.
-- Also (user OK'd): the Zalo was entered as mount 'under_bench', drop 0 — fixed
-- to 'benchtop', 205 like the other Abi U/M sinks (placed copies keep theirs):
--   UPDATE fixture_catalog SET mount = 'benchtop', bench_drop = 205
--   WHERE name = 'Abi Zalo Double Bowl U/M Sink';
-- Copied from B2D (pair of doors, construction, materials, kick); 900 wide, no
-- shelf (plumbing). Contents are 'point' anchors in the cabinet frame (x from
-- the left, z from the back, yaw vs facing out); both are benchtop-mount, so
-- at placement they sit on the benchtop under them (less drop), like a
-- hand-dropped sink, and cut it.
--   Sink  Abi Zalo Double Bowl U/M (855 × 450): centred, front edge ~85 back
--         from a ~620 benchtop front → centre z 310.
--   Tap   Abi Pull-out Sink Mixer: hole (offset −31.5 / −106.75 from its
--         footprint centre) centred on the sink, 50 from the wall
--         → footprint centre x 481.5, z 156.75.
INSERT INTO cabinet_definitions (name, assembly_class, construction_method_id, default_dx, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type, face_grid, internal_grid, rule_overrides,
  is_library_item, active, category_id, subcategory_id, carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior, description, sort_order, no_cnc, custom_parts,
  preserve_dx, preserve_dy, preserve_dz, footprint, faces, contents)
SELECT 'BSK', 'base', construction_method_id, 900, default_dy, default_dz,
  has_carcass, true, has_face, has_toekick, top_type, toe_type,
  face_grid,
  '{"tree":{"type":"open","fittings":[]}}'::jsonb,
  rule_overrides,
  true, true, category_id, (SELECT id FROM cabinet_subcategories WHERE name = 'Appliances'),
  carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior,
  'Base sink: 900 wide, pair of doors, no shelf; comes with the Abi Zalo double bowl undermount sink and the pull-out mixer.',
  1, no_cnc, '[]'::jsonb,
  false, false, false, NULL, NULL,
  jsonb_build_array(
    jsonb_build_object('fixture_catalog_id', (SELECT id FROM fixture_catalog WHERE name = 'Abi Zalo Double Bowl U/M Sink' LIMIT 1),
      'anchor', jsonb_build_object('kind', 'point', 'link_x', 450, 'link_z', 310, 'yaw', 0, 'z', 0)),
    jsonb_build_object('fixture_catalog_id', (SELECT id FROM fixture_catalog WHERE name = 'Abi Pull-out Sink Mixer' LIMIT 1),
      'anchor', jsonb_build_object('kind', 'point', 'link_x', 481.5, 'link_z', 156.75, 'yaw', 0, 'z', 0)))
FROM cabinet_definitions WHERE name = 'B2D'
  AND NOT EXISTS (SELECT 1 FROM cabinet_definitions WHERE name = 'BSK');
