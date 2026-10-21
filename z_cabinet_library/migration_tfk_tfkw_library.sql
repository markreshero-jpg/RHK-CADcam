-- TFK / TFKW (2026-10-21): tall fillers at kick height. Applied.
-- Copied from TFF / TFFW with the BFK kick pattern: the filler carries its own
-- kick (has_toekick = true) so Join Kicks picks it up, and the Filler part sits
-- on it: y = cab.kick, dy = cab.h - cab.kick (never r.TOEH — double-raises
-- after a join). TFKW defaults to 30 wide (Mark, 2026-10-21).
INSERT INTO cabinet_definitions (name, assembly_class, construction_method_id, default_dx, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type, face_grid, internal_grid, rule_overrides,
  is_library_item, active, category_id, subcategory_id, carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior, description, sort_order, no_cnc, custom_parts,
  preserve_dx, preserve_dy, preserve_dz, footprint, faces)
SELECT v.code, d.assembly_class, d.construction_method_id, v.w, d.default_dy, d.default_dz,
  d.has_carcass, d.has_internal, d.has_face, true, d.top_type, d.toe_type, d.face_grid, d.internal_grid, d.rule_overrides,
  d.is_library_item, true, d.category_id, d.subcategory_id, d.carcase_joints, d.material_overrides, d.hardware_overrides,
  d.toekick_overrides, d.drawerbox_overrides, d.exposed_interior, v.descr, v.sort, d.no_cnc,
  (SELECT jsonb_agg(
     jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(e,
       '{x}', '0'::jsonb),
       '{dx}', to_jsonb(v.w)),
       '{y}', '140'::jsonb),
       '{dy}', '1960'::jsonb),
       '{expressions,y}', '"cab.kick"'::jsonb),
       '{expressions,dy}', '"cab.h - cab.kick"'::jsonb))
   FROM jsonb_array_elements(d.custom_parts) e),
  d.preserve_dx, d.preserve_dy, d.preserve_dz, d.footprint, d.faces
FROM (VALUES
  ('TFK',  'TFF',  70, 112, 'Tall filler at kick height. Carries its own kick so it joins kick runs. Panel sits on the kick: y = cab.kick, height = cabinet height less kick. Width = assembly width (70 default).'),
  ('TFKW', 'TFFW', 30, 113, 'Tall filler at kick height, wide. Carries its own kick so it joins kick runs. Panel sits on the kick: y = cab.kick, height = cabinet height less kick. Width = assembly width (30 default).')
) AS v(code, src, w, sort, descr)
JOIN cabinet_definitions d ON d.name = v.src
WHERE NOT EXISTS (SELECT 1 FROM cabinet_definitions x WHERE x.name = v.code);
