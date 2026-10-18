-- U4 (2026-10-18): cabinet contents (z_ubo). Applied.
-- cabinet_definitions.contents: default fixtures spawned with the cabinet —
--   [{ fixture_catalog_id, anchor: { kind: 'zone', row_index, col_index }
--                                | { kind: 'point', link_x, link_z, link_rot, z } }]
-- room_fixtures.link_zone: the open face cell a fixture is seated in —
--   { row_index, col_index, y } (y = cell bottom above the cabinet bottom).
ALTER TABLE cabinet_definitions ADD COLUMN IF NOT EXISTS contents jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE room_fixtures      ADD COLUMN IF NOT EXISTS link_zone jsonb;

-- UBO comes with the generic 600 oven seated in its open row.
UPDATE cabinet_definitions
SET contents = jsonb_build_array(jsonb_build_object(
  'fixture_catalog_id', (SELECT id FROM fixture_catalog WHERE name = 'Generic oven 600' LIMIT 1),
  'anchor', jsonb_build_object('kind', 'zone', 'row_index', 1, 'col_index', 0)))
WHERE name = 'UBO' AND EXISTS (SELECT 1 FROM fixture_catalog WHERE name = 'Generic oven 600');
