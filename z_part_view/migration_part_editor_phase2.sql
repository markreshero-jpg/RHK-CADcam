-- ============================================================================
-- RHK-CADcam — Part Editor Phase 2 migration (M1)
-- ----------------------------------------------------------------------------
-- Idempotent — safe to re-run. Additive: no existing column is renamed,
-- retyped, or dropped. See z_part_view/RHK-PartEditor-Phase2-Spec.docx §2, §3, §9.
--
-- Reconciled against the LIVE part_operations table before writing:
--   • operation_type in {drill (2985), route (1)} — NO 'pocket'/'saw' rows.
--   • operation_action in {null (2985), pocket (1)} — NO 'through'/'stopped' rows.
--   • master/slave columns (is_master, master_operation_id, slave_table,
--     slave_part_id) already exist (Phase 1 reconciliation) — Phase 2 ACTIVATES
--     them; this migration does NOT add them.
-- ============================================================================

-- 1. Operation role (spec §2) ------------------------------------------------
--    The ONE switch that decides firing behaviour: local | master | joint.
--    Every Phase 1 op is 'local'; the NOT NULL DEFAULT backfills every existing
--    row to 'local'. is_master stays the denormalised firing-query mirror of this
--    (kept in sync when roles are set in M4); operation_role is authoritative.
ALTER TABLE public.part_operations
  ADD COLUMN IF NOT EXISTS operation_role text NOT NULL DEFAULT 'local';

COMMENT ON COLUMN public.part_operations.operation_role IS
  'Part Editor (§2): local | master | joint. local = acts on this part only, never '
  'fires. master = fires a materialised slave onto coincident part(s). joint = master '
  'whose params come from the Joints library (snapshot). Default local.';

-- 2. Collapse pocket-as-a-type → route + action=pocket (spec §3.2) -----------
--    No-op on current data (0 rows with operation_type='pocket'); included so the
--    rule holds if any legacy pocket-as-type row is ever introduced. operation_type
--    otherwise stays the optimiser-facing verb and is never migrated.
UPDATE public.part_operations
   SET operation_type   = 'route',
       operation_action = 'pocket'
 WHERE operation_type = 'pocket';

-- ============================================================================
-- Verify (optional):
--   select operation_role, count(*) from public.part_operations group by 1;
--   select column_name, data_type, column_default, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='part_operations'
--      and column_name='operation_role';
-- ============================================================================
