-- BFK (2026-10-18): base filler at kick height. Applied.
-- Copied from BFF; the one Filler part sits on the kick instead of the floor:
-- y = r.TOEH, dy = cab.h - r.TOEH (cab.h is the full base height incl. kick).
-- r.TOEH is the merged construction rule, in scope even though the assembly
-- has no kick of its own (cab.kick = 0), and custom-part positions evaluate
-- as formulas at resolve time — the two things that blocked BFK before.
INSERT INTO cabinet_definitions (name, assembly_class, construction_method_id, default_dx, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type, face_grid, internal_grid, rule_overrides,
  is_library_item, active, category_id, subcategory_id, carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior, description, sort_order, no_cnc, custom_parts,
  preserve_dx, preserve_dy, preserve_dz, footprint, faces)
SELECT 'BFK', assembly_class, construction_method_id, default_dx, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type, face_grid, internal_grid, rule_overrides,
  is_library_item, true, category_id, subcategory_id, carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior,
  'Base filler, at kick height — sits on the kick (r.TOEH); width = assembly width (70 default), height = cabinet height less kick.',
  100, no_cnc,
  (SELECT jsonb_agg(
     jsonb_set(jsonb_set(jsonb_set(jsonb_set(e,
       '{y}', '140'::jsonb),
       '{dy}', '760'::jsonb),
       '{expressions,y}', '"r.TOEH"'::jsonb),
       '{expressions,dy}', '"cab.h - r.TOEH"'::jsonb))
   FROM jsonb_array_elements(custom_parts) e),
  preserve_dx, preserve_dy, preserve_dz, footprint, faces
FROM cabinet_definitions WHERE name = 'BFF'
  AND NOT EXISTS (SELECT 1 FROM cabinet_definitions WHERE name = 'BFK');

-- Follow-up (2026-10-18): kick fillers carry their own kick so Join Kicks picks
-- them up (eligibleForKickRun needs has_toekick). Formulas switch to cab.kick:
-- standalone, cab.kick = TOEH → panel on the kick; once joined, the detach
-- transform raises the member by the kick and drops has_toekick (cab.kick = 0),
-- so y = 0 / dy = cab.h keeps the panel in the same place. (r.TOEH would
-- double-raise it.) BFKANG already has has_toekick = true.
UPDATE cabinet_definitions SET has_toekick = true,
  custom_parts = (SELECT jsonb_agg(jsonb_set(jsonb_set(e,
      '{expressions,y}',  '"cab.kick"'::jsonb),
      '{expressions,dy}', '"cab.h - cab.kick"'::jsonb))
    FROM jsonb_array_elements(custom_parts) e),
  description = 'Base filler, at kick height — carries its own kick (joins into kick runs); panel sits on the kick: y = cab.kick, height = cabinet height less kick. Width = assembly width (70 default).'
WHERE name = 'BFK';
