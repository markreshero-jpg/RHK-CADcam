-- B6 (2026-10-19): BHSL — shadowline library row (z_bulkhead). A copy of the
-- current BH row (Wall → Bulkheads, same construction / materials) turned into
-- a shadowline: one flat exposed strip 60 deep on the overhead tops, flush with
-- their carcase front; optional returns back to the wall (mitre / butt). Height = the
-- exposed board thickness (16.5), preserved so it never takes the wall-cab
-- height cascade.
INSERT INTO cabinet_definitions
SELECT (jsonb_populate_record(NULL::cabinet_definitions, to_jsonb(d) || jsonb_build_object(
  'id', gen_random_uuid(),
  'name', 'BHSL',
  'default_dy', 16.5,
  'preserve_dy', true,
  'sort_order', d.sort_order + 1,
  'custom_parts', '[]'::jsonb,
  'part_hide_views', '{}'::jsonb,
  'description', 'Shadowline: flat exposed strip (board thickness × 60) on the overhead tops, flush with their front, optional left / right returns back to the wall (mitre by default, or butt). Set the soffit to the board thickness so it meets the ceiling.',
  'bulkhead', '{"kind":"shadowline","width":60,"front":"carcase","auto_h":false,"cleat":false,"left":{"on":false,"depth":600,"joint":"mitre"},"right":{"on":false,"depth":600,"joint":"mitre"},"bottom":{"on":false,"depth":600,"joint":"mitre"}}'::jsonb,
  'created_at', now(),
  'updated_at', now()
))).*
FROM cabinet_definitions d
WHERE d.name = 'BH' AND d.bulkhead IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM cabinet_definitions WHERE name = 'BHSL');
