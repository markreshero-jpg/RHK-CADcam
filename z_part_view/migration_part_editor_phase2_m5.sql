-- ============================================================================
-- RHK-CADcam — Part Editor Phase 2 M5 migration (joint role audit FK)
-- ----------------------------------------------------------------------------
-- Idempotent, additive. Adds the joint_type_id audit FK so a materialised joint
-- op remembers which library joint it was snapshotted from (spec §6). Nullable —
-- only joint-role ops carry it; local/master ops leave it null. Copy-not-link:
-- the op keeps its snapshotted values day-to-day; "Update joints from library"
-- re-reads this FK to re-materialise. ON DELETE SET NULL so deleting a library
-- joint doesn't cascade-delete real machining rows (it just orphans the audit).
-- ============================================================================

ALTER TABLE public.part_operations
  ADD COLUMN IF NOT EXISTS joint_type_id uuid
    REFERENCES public.joint_types(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.part_operations.joint_type_id IS
  'Part Editor (§6): audit FK to the joint_types row a joint-role op was '
  'snapshotted from. Null for local/master ops. Copy-not-link — re-materialised '
  'only by the explicit "Update joints from library" action.';

CREATE INDEX IF NOT EXISTS part_operations_joint_type_id_idx
  ON public.part_operations (joint_type_id) WHERE joint_type_id IS NOT NULL;
