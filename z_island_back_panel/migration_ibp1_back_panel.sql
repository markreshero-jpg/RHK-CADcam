-- IBP1 (2026-10-24): island bench back panels (z_island_back_panel).
-- `back_panel jsonb` on definitions + instances (non-null = IBPF / IBPK),
-- `ibp:<n>` case part keys, and the two library rows (Base → End Panels,
-- copies of BEPF with the applied-panel custom part dropped — the resolver
-- makes the pieces).
ALTER TABLE cabinet_definitions ADD COLUMN IF NOT EXISTS back_panel jsonb;
ALTER TABLE cabinet_instances   ADD COLUMN IF NOT EXISTS back_panel jsonb;

ALTER TABLE case_parts DROP CONSTRAINT IF EXISTS case_parts_part_key_check;
ALTER TABLE case_parts ADD CONSTRAINT case_parts_part_key_check CHECK (
  part_key = ANY (ARRAY['left_side', 'right_side', 'bottom', 'back', 'full_top', 'front_rail', 'back_rail'])
  OR part_key ~ '^(side|back|rail|cleat):[A-Za-z0-9_-]+$'
  OR part_key ~ '^fprail:[0-9]+$'
  OR part_key ~ '^bh:[a-z_]+$'
  OR part_key ~ '^crv:[a-z0-9_]+$'
  OR part_key ~ '^fs:[a-z0-9_]+$'
  OR part_key ~ '^ibp:[0-9]+$'
);

INSERT INTO cabinet_definitions
SELECT (jsonb_populate_record(NULL::cabinet_definitions, to_jsonb(d) || jsonb_build_object(
  'id', gen_random_uuid(),
  'name', v.code,
  'default_dx', 1200,
  'default_dz', 18,
  'preserve_dz', true,
  'sort_order', 101 + v.ord,       -- after BEPF (100) / BEPK (101)
  'custom_parts', '[]'::jsonb,
  'part_hide_views', '{}'::jsonb,
  'description', v.descr,
  'back_panel', jsonb_build_object('mount', v.mount, 'sheet_w', 1200),
  'created_at', now(),
  'updated_at', now()
))).*
FROM cabinet_definitions d
CROSS JOIN (VALUES
  ('IBPF', 'floor', 1, 'Island bench back panel, runs to the floor: exposed board on the back face of an island run, height tracks the cabinet height. Wider than the sheet width (default 1200) → split into equal pieces, grain up. Taped all round incl. joins; the floor edge raw.'),
  ('IBPK', 'kick',  2, 'Island bench back panel, to kick height: starts at kick height (r.TOEH), up to the cabinet height. Wider than the sheet width (default 1200) → split into equal pieces, grain up. Taped all round incl. joins and the bottom edge.')
) AS v(code, mount, ord, descr)
WHERE d.name = 'BEPF' AND d.is_library_item
  AND NOT EXISTS (SELECT 1 FROM cabinet_definitions x WHERE x.name = v.code);
