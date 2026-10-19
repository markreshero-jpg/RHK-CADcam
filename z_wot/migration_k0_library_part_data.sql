-- K0 (2026-10-19): library definitions carry hand-drawn part operations and
-- part comments / labels (z_wot/WOT-KIT-SPEC.md). Custom parts are keyed
-- custom_@<index in custom_parts>. Applied.
ALTER TABLE cabinet_definitions
  ADD COLUMN IF NOT EXISTS part_operations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS part_comments   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS part_labels     jsonb NOT NULL DEFAULT '{}'::jsonb;
