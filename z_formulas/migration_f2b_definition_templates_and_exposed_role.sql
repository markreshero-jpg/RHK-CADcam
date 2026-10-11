-- F2b (2026-10-11): finish F2 + align applied panels with the exposed-material rule.
--
-- 1. F2 swapped dx/dy on cabinet_custom_parts rows but missed the templates in
--    cabinet_definitions.custom_parts (jsonb). Every End Panel / Tall End Panel /
--    Wall End Panel / Filler placed since 2026-08-16 copied the pre-F2 template,
--    so a side panel resolved height into dx (→ depth) and depth into dy
--    (→ vertical, grain front-to-back). Fix the templates, then the instances
--    that inherited them. Detection = the pre-F2 expression signature, so rows
--    already migrated by F2 (dy = cab.h) are untouched.
--    part_shape_overrides had zero rows for the affected parts (verified).
--
-- 2. parts_library.applied_panel had material_role 'door'. Locked decision
--    2026-08-09 (cabinet-codes skill): end panels, fillers and island back
--    panels are exposed parts → the class schedule's 'exposed' row. Instances
--    pick up the new material on their next resolve (resolveCustomParts).

-- Swap the dx/dy keys of a jsonb object (expressions) — same as F2.
CREATE OR REPLACE FUNCTION pg_temp.swap_dxdy(e jsonb) RETURNS jsonb AS $$
  SELECT CASE WHEN e IS NULL THEN NULL ELSE (
    SELECT coalesce(jsonb_object_agg(
      CASE key WHEN 'dx' THEN 'dy' WHEN 'dy' THEN 'dx' ELSE key END, value), '{}'::jsonb)
    FROM jsonb_each(e)) END
$$ LANGUAGE sql IMMUTABLE;

-- 1a. Definition templates (side/front parts whose dx expression is the height).
UPDATE cabinet_definitions d
SET custom_parts = (
  SELECT jsonb_agg(
    CASE WHEN p->>'orientation' IN ('side', 'front') AND p->'expressions'->>'dx' = 'cab.h'
      THEN p || jsonb_build_object(
        'dx', p->'dy', 'dy', p->'dx',
        'expressions', pg_temp.swap_dxdy(p->'expressions'))
      ELSE p END
    ORDER BY ord)
  FROM jsonb_array_elements(d.custom_parts) WITH ORDINALITY AS t(p, ord))
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(d.custom_parts) p
  WHERE p->>'orientation' IN ('side', 'front') AND p->'expressions'->>'dx' = 'cab.h');

-- 1b. Instances placed from the stale templates.
UPDATE cabinet_custom_parts
SET dx = dy, dy = dx, expressions = pg_temp.swap_dxdy(expressions)
WHERE orientation IN ('side', 'front') AND expressions->>'dx' = 'cab.h';

-- 2. Applied panels resolve to the exposed material.
UPDATE parts_library SET material_role = 'exposed' WHERE key = 'applied_panel';

-- 3. …so their thickness follows that board, not the door's (t.door stays in
--    the depth formula — that's the door standing proud of the carcass).
UPDATE cabinet_definitions d
SET custom_parts = (
  SELECT jsonb_agg(
    CASE WHEN p->>'part_library_id' = (SELECT id::text FROM parts_library WHERE key = 'applied_panel')
              AND p->'expressions'->>'dz' = 't.door'
      THEN jsonb_set(p, '{expressions,dz}', '"t.exposed"')
      ELSE p END
    ORDER BY ord)
  FROM jsonb_array_elements(d.custom_parts) WITH ORDINALITY AS t(p, ord))
WHERE jsonb_array_length(d.custom_parts) > 0;

UPDATE cabinet_custom_parts
SET expressions = jsonb_set(expressions, '{dz}', '"t.exposed"')
WHERE part_library_id = (SELECT id FROM parts_library WHERE key = 'applied_panel')
  AND expressions->>'dz' = 't.door';
