-- ============================================================================
-- RHK-CADcam — Part display names (user-overridable labels)
-- ----------------------------------------------------------------------------
-- Idempotent, additive. Mirrors cabinet_instances.part_comments exactly: a JSONB
-- map keyed by the synthetic source_part_key (case_left_side, db_0_1_db_bottom,
-- int_divider_0…) that normalize.ts builds.
--
-- Why a map on the CABINET and not a name column on the part tables:
-- persistResolved deletes and re-inserts every case_parts / internal_parts /
-- toekick_parts / drawer_box_parts row on each resolve, so part rows are derived
-- data with throwaway UUIDs. A name stored there is destroyed on the next regen.
-- cabinet_instances survives regen, so authored content lives here — the same
-- reason part_comments and part_operations.source_part_key are keyed this way.
--
-- part_type / part_key remain the hard-coded machine identity used by formulas,
-- joint rules and drilling. This map only overrides the human-readable label
-- surfaced by the optimiser and (later) the cabinet labels module.
-- ============================================================================

ALTER TABLE public.cabinet_instances
  ADD COLUMN IF NOT EXISTS part_names jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.cabinet_instances.part_names IS
  'User-authored display names keyed by synthetic source_part_key (same keying '
  'as part_comments). Overrides the generated default label in normalize.ts. '
  'Survives resolver regen, which deletes/re-inserts the part rows themselves.';
