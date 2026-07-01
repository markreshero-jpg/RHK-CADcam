-- ============================================================================
-- RHK-CADcam — Part Editor Phase 1 migration (M1)
-- ----------------------------------------------------------------------------
-- Run this whole script ONCE in the Supabase SQL editor (it is idempotent —
-- safe to re-run). All changes are ADDITIVE — no existing column is renamed,
-- retyped, or dropped. operation_type is left exactly as-is: the optimiser,
-- gcode.ts, drills.ts and seamDrillSync all read it (spec §4).
--
-- Reconciled against the LIVE part_operations schema (37 cols) before writing.
-- Three spec §4 fields ALREADY EXIST and are intentionally NOT re-added:
--   • master_op_id  → reuse existing  master_operation_id  (+ is_master,
--                     slave_table, slave_part_id) — the master/slave plumbing
--                     is already present, just unused (0 rows).
--   • "depth start in part-local n" → reuse existing  pos_z  (null on all rows).
--   • repeat_axis   → already present (null on all rows).
-- output_face (cabinet-axis vocabulary: left/right/top/bottom/front/back, read
-- by the optimiser/G-code path) is LEFT UNTOUCHED. The editor's part-local plane
-- concept gets its own new fields below (plane_kind / plane_edge_index) so the
-- two semantics never collide. See z_part_view/RHK-PartEditor-Phase1-Spec.docx §4.
-- ============================================================================

-- 1. Operation bounding size in part-local axes (u, v, n) -------------------
--    Alternative to the offset_*_mm edge-offset rectangle. Null = unset.
ALTER TABLE public.part_operations
  ADD COLUMN IF NOT EXISTS size_dx numeric,
  ADD COLUMN IF NOT EXISTS size_dy numeric,
  ADD COLUMN IF NOT EXISTS size_dz numeric;

COMMENT ON COLUMN public.part_operations.size_dx IS
  'Part Editor: operation bounding size along part-local u (along DX). Null = unset.';
COMMENT ON COLUMN public.part_operations.size_dy IS
  'Part Editor: operation bounding size along part-local v (along DY). Null = unset.';
COMMENT ON COLUMN public.part_operations.size_dz IS
  'Part Editor: operation bounding size along part-local n (depth extent). Null = unset.';

-- 2. Operation rotation about part-local axes (degrees) ---------------------
--    Default 0 = axis-aligned. e.g. angle_ax drives horizontal/edge boring.
ALTER TABLE public.part_operations
  ADD COLUMN IF NOT EXISTS angle_ax numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS angle_ay numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS angle_az numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.part_operations.angle_ax IS
  'Part Editor: operation rotation about part-local u (e.g. horizontal/edge boring). Degrees, default 0.';
COMMENT ON COLUMN public.part_operations.angle_ay IS
  'Part Editor: operation rotation about part-local v. Degrees, default 0.';
COMMENT ON COLUMN public.part_operations.angle_az IS
  'Part Editor: operation rotation about part-local n (in-plane rotation). Degrees, default 0.';

-- 3. type vs action (spec §4.2) ---------------------------------------------
--    operation_type stays the VERB (route|drill|saw|groove) — unchanged, still
--    read by the optimiser. operation_action is the finer STRATEGY. The editor
--    writes BOTH. Null on legacy/generated rows.
ALTER TABLE public.part_operations
  ADD COLUMN IF NOT EXISTS operation_action text;

COMMENT ON COLUMN public.part_operations.operation_action IS
  'Part Editor: machining strategy, distinct from operation_type (the verb). '
  'e.g. outline|pocket|square_off|profile|through|stopped. Null = unset. '
  'operation_type remains the optimiser-facing verb and is never migrated.';

-- 4. Part-local plane the operation sits on (spec §2.3, §4.1) ---------------
--    Editor-only, part-local. Distinct from output_face (cabinet-axis, optimiser
--    consumed). P1: the app defaults plane_kind to 'face_front' and the picker is
--    read-only; the plane picker / edge ops land in P2. plane_edge_index references
--    an edge index into the derived rectangle outline (0..3) and stays valid when
--    Phase 3 introduces stored non-rectangular outlines (additive — no migration).
ALTER TABLE public.part_operations
  ADD COLUMN IF NOT EXISTS plane_kind       text,
  ADD COLUMN IF NOT EXISTS plane_edge_index integer;

COMMENT ON COLUMN public.part_operations.plane_kind IS
  'Part Editor (part-local): which plane the op sits on — face_front | face_back | edge. '
  'App defaults new rows to face_front in P1. Distinct from output_face (cabinet-axis vocabulary).';
COMMENT ON COLUMN public.part_operations.plane_edge_index IS
  'Part Editor: edge index into the part outline when plane_kind = ''edge'' (rectangle: 0..3). '
  'Null for faces. Stable across Phase 3 stored outlines.';

-- 5. Audit column + trigger (spec §4.3) -------------------------------------
--    Reuses the existing public.handle_updated_at() (already on 7 tables) — do
--    NOT create a duplicate function. Backfill existing rows from created_at so
--    no row carries a null updated_at.
ALTER TABLE public.part_operations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.part_operations SET updated_at = created_at WHERE updated_at < created_at;

COMMENT ON COLUMN public.part_operations.updated_at IS
  'Maintained by trigger part_operations_set_updated_at → public.handle_updated_at().';

DROP TRIGGER IF EXISTS part_operations_set_updated_at ON public.part_operations;
CREATE TRIGGER part_operations_set_updated_at
  BEFORE UPDATE ON public.part_operations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Verify (optional — run after the above):
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_schema='public' and table_name='part_operations'
--     and column_name in ('size_dx','size_dy','size_dz','angle_ax','angle_ay',
--       'angle_az','operation_action','plane_kind','plane_edge_index','updated_at')
--   order by column_name;
-- ============================================================================
