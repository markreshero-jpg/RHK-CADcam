-- F3 (2026-10-15): fillers stand flush with the door faces.
--
-- BFF / TFF / TFFW's front-standing "Filler" custom part sat at z = 0 (back of
-- its own box). Custom-part z is the part's BACK face (origin bottom-left-back,
-- +Z toward the front), so z = cab.d + 2 puts the filler on the same 2mm bumper
-- line as the doors: back face = cab.d + 2, front face = cab.d + 2 + t.door.
-- resolveCustomParts writes the evaluated value back into the literal z column
-- on the next resolve. Applied to the library templates and all placed copies
-- (3 × BFF, 1 × TFF — the TFF had a hand-entered z = 700, now replaced).

UPDATE cabinet_definitions d
SET custom_parts = (
  SELECT jsonb_agg(
    CASE WHEN p->>'name' = 'Filler' AND p->>'orientation' = 'front'
      THEN jsonb_set(p, '{expressions,z}', '"cab.d + 2"')
      ELSE p END
    ORDER BY ord)
  FROM jsonb_array_elements(d.custom_parts) WITH ORDINALITY AS t(p, ord))
WHERE d.name IN ('BFF', 'TFF', 'TFFW');

UPDATE cabinet_custom_parts cp
SET expressions = coalesce(cp.expressions, '{}'::jsonb) || '{"z":"cab.d + 2"}'::jsonb
FROM cabinet_instances ci, cabinet_definitions d
WHERE ci.id = cp.cabinet_instance_id AND d.id = ci.cabinet_definition_id
  AND d.name IN ('BFF', 'TFF', 'TFFW')
  AND cp.name = 'Filler' AND cp.orientation = 'front';

-- F3b (2026-10-15): fillers are exposed parts (cabinet-codes locked decision
-- 2026-08-09) — same alignment F2b did for applied_panel. filler_strip is used
-- only by the BFF/TFF/TFFW fillers. Material picks up on the next resolve.
UPDATE parts_library SET material_role = 'exposed' WHERE key = 'filler_strip';

UPDATE cabinet_definitions d
SET custom_parts = (
  SELECT jsonb_agg(
    CASE WHEN p->>'part_library_id' = (SELECT id::text FROM parts_library WHERE key = 'filler_strip')
              AND p->'expressions'->>'dz' = 't.door'
      THEN jsonb_set(p, '{expressions,dz}', '"t.exposed"')
      ELSE p END
    ORDER BY ord)
  FROM jsonb_array_elements(d.custom_parts) WITH ORDINALITY AS t(p, ord))
WHERE d.name IN ('BFF', 'TFF', 'TFFW');

UPDATE cabinet_custom_parts
SET expressions = jsonb_set(expressions, '{dz}', '"t.exposed"')
WHERE part_library_id = (SELECT id FROM parts_library WHERE key = 'filler_strip')
  AND expressions->>'dz' = 't.door';
