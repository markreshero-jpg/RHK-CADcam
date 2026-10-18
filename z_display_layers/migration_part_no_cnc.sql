-- Per-part "No CNC" ticks (2026-10-18, PART-HIDE-SPEC.md). Applied.
-- List of part ids (canonical scheme, same as part_hide_views) that are not
-- sent to the optimiser / CNC. Custom parts keep their own
-- cabinet_custom_parts.no_cnc column instead.
ALTER TABLE cabinet_instances   ADD COLUMN IF NOT EXISTS part_no_cnc jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE cabinet_definitions ADD COLUMN IF NOT EXISTS part_no_cnc jsonb NOT NULL DEFAULT '[]'::jsonb;
