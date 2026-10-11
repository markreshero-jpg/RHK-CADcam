-- ============================================================================
-- RHK-CADcam — Benchtop Builder Phase 2: build method construction types
-- ----------------------------------------------------------------------------
-- Idempotent. Additive columns only. See z_benchtop_builder/BENCHTOP-SPEC.md.
--
-- construction:
--   buildup_flat     — board top + strips laid FLAT underneath (strip_width_mm
--                      wide, board-thick). Edge shows top + strip.
--   buildup_vertical — board top + rails ON EDGE underneath (buildup_rail_depth
--                      tall, board-thick).
--   solid            — single board, no build-up parts.
--   outsourced       — stone / laminate made by a supplier: measure + report
--                      only; surface parts are supply items, not cut parts.
-- ============================================================================

ALTER TABLE public.benchtop_build_methods
  ADD COLUMN IF NOT EXISTS construction text NOT NULL DEFAULT 'solid',
  ADD COLUMN IF NOT EXISTS strip_width_mm numeric,
  ADD COLUMN IF NOT EXISTS cross_member_spacing_mm numeric,
  ADD COLUMN IF NOT EXISTS default_schedule_id uuid
    REFERENCES public.benchtop_schedules(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.benchtop_build_methods
    ADD CONSTRAINT benchtop_build_methods_construction_check
    CHECK (construction IN ('buildup_flat', 'buildup_vertical', 'solid', 'outsourced'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.benchtop_build_methods.construction IS
  'buildup_flat | buildup_vertical | solid | outsourced (measure + report only).';
COMMENT ON COLUMN public.benchtop_build_methods.strip_width_mm IS
  'buildup_flat: width of the flat strips under the top.';
COMMENT ON COLUMN public.benchtop_build_methods.buildup_rail_depth IS
  'buildup_vertical: height of the on-edge rails under the top.';
COMMENT ON COLUMN public.benchtop_build_methods.cross_member_spacing_mm IS
  'Max centre spacing of cross members along the run (build-up methods).';
COMMENT ON COLUMN public.benchtop_build_methods.default_schedule_id IS
  'Material schedule used when the benchtop itself names none. Beats room/job schedule.';

ALTER TABLE public.benchtop_resolved_parts
  ADD COLUMN IF NOT EXISTS supply_item boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.benchtop_resolved_parts.supply_item IS
  'true = supplied by others (outsourced stone/laminate): report + order only, never cut list.';
