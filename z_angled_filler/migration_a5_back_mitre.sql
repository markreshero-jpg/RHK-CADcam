-- A5 (2026-10-15, applied): the two backs of BFKANG meet in a mitre, 22.5° each
-- at 45° (Mark: "currently one overlaps the other" — the default butt_bevel runs
-- one back through into the other's plane). ANGLE_JOIN is a normal rule, set on
-- the library row and on fillers already placed.
update cabinet_definitions set rule_overrides = coalesce(rule_overrides, '{}'::jsonb) || '{"ANGLE_JOIN":"mitre"}'::jsonb
  where name = 'BFKANG';
update cabinet_instances set rule_overrides = coalesce(rule_overrides, '{}'::jsonb) || '{"ANGLE_JOIN":"mitre"}'::jsonb
  where footprint->>'preset' = 'angled_filler';
