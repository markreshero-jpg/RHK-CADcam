-- W2D/BF + T2D/BF (2026-10-30, z_bifold_slide): sliding bi-fold cabinets
-- (Lincoln Sentry Finista BF-05). Copies of W2D / T2D with the bi-fold set on the
-- cabinet: rule_overrides.BIFOLD = 'L' (hung on the left gable; Hung on / Bottom
-- guide / Centre hinge are changed per cabinet in the RHS sidebar). 900 wide by
-- default (2 × ~450 leaves; 500 max per leaf, 1200 inside max). Codes: Mark
-- 2026-10-30, "/BF" modifier like "/FL".
INSERT INTO cabinet_definitions (name, assembly_class, construction_method_id, default_dx, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type, face_grid, internal_grid, rule_overrides,
  is_library_item, active, category_id, subcategory_id, carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior, description, sort_order, no_cnc, custom_parts,
  preserve_dx, preserve_dy, preserve_dz, footprint, faces)
SELECT v.code, d.assembly_class, d.construction_method_id, 900, d.default_dy, d.default_dz,
  d.has_carcass, d.has_internal, d.has_face, d.has_toekick, d.top_type, d.toe_type,
  jsonb_set(d.face_grid, '{zones}', (SELECT jsonb_agg(jsonb_set(z, '{hinge_side}', '"left"')) FROM jsonb_array_elements(d.face_grid->'zones') z)),
  d.internal_grid, coalesce(d.rule_overrides, '{}'::jsonb) || '{"BIFOLD": "L"}'::jsonb,
  d.is_library_item, true, d.category_id, d.subcategory_id, d.carcase_joints, d.material_overrides, d.hardware_overrides,
  d.toekick_overrides, d.drawerbox_overrides, d.exposed_interior, v.descr, d.sort_order, d.no_cnc, d.custom_parts,
  d.preserve_dx, d.preserve_dy, d.preserve_dz, d.footprint, d.faces
FROM (VALUES
  ('W2D/BF', 'W2D', 'Wall, sliding bi-fold pair (Finista BF-05) — e.g. an appliance cupboard on the bench. Outer door on Blum 110 hinges; leading door on the top track; bottom guide above / below the bottom or none (sidebar).'),
  ('T2D/BF', 'T2D', 'Tall, sliding bi-fold pair (Finista BF-05). Outer door on Blum 110 hinges; leading door on the top track; bottom guide above / below the bottom or none (sidebar). Below: doors hang 55+ under the bottom, 15 clear to the floor.')
) AS v(code, src, descr)
JOIN cabinet_definitions d ON d.name = v.src
WHERE NOT EXISTS (SELECT 1 FROM cabinet_definitions x WHERE x.name = v.code);
