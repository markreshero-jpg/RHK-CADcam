-- BEPK + TEPK (2026-10-18): end panels that sit on the kick. Applied.
-- Copied from BEPF / TEPF (same Applied Panel part, same exposed finish, same
-- depth formula). The panel starts at kick height and stops at the top:
-- y = r.TOEH, dy = cab.h - r.TOEH. No kick of their own (has_toekick = false,
-- user 2026-10-18), so cab.kick = 0 and r.TOEH is the only kick height in scope.
INSERT INTO cabinet_definitions (name, assembly_class, construction_method_id, default_dx, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type, face_grid, internal_grid, rule_overrides,
  is_library_item, active, category_id, subcategory_id, carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior, description, sort_order, no_cnc, custom_parts,
  preserve_dx, preserve_dy, preserve_dz, footprint, faces)
SELECT v.code, d.assembly_class, d.construction_method_id, d.default_dx, d.default_dy, d.default_dz,
  d.has_carcass, d.has_internal, d.has_face, false, d.top_type, d.toe_type, d.face_grid, d.internal_grid, d.rule_overrides,
  d.is_library_item, true, d.category_id, d.subcategory_id, d.carcase_joints, d.material_overrides, d.hardware_overrides,
  d.toekick_overrides, d.drawerbox_overrides, d.exposed_interior, v.descr, d.sort_order + 1, d.no_cnc,
  (SELECT jsonb_agg(
     jsonb_set(jsonb_set(jsonb_set(jsonb_set(e,
       '{y}', '140'::jsonb),
       '{dy}', to_jsonb(d.default_dy::numeric - 140)),
       '{expressions,y}', '"r.TOEH"'::jsonb),
       '{expressions,dy}', '"cab.h - r.TOEH"'::jsonb))
   FROM jsonb_array_elements(d.custom_parts) e),
  d.preserve_dx, d.preserve_dy, d.preserve_dz, d.footprint, d.faces
FROM (VALUES
  ('BEPK', 'BEPF', 'Base end panel, sits on the kick — starts at kick height (r.TOEH), height = cabinet height less kick, depth = cabinet depth + door + 2mm.'),
  ('TEPK', 'TEPF', 'Tall end panel, sits on the kick — starts at kick height (r.TOEH), height = cabinet height less kick, depth = cabinet depth + door + 2mm.')
) AS v(code, src, descr)
JOIN cabinet_definitions d ON d.name = v.src
WHERE NOT EXISTS (SELECT 1 FROM cabinet_definitions x WHERE x.name = v.code);
