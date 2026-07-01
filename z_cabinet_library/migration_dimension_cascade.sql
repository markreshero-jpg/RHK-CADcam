-- ============================================================================
-- RHK-CADcam — Cabinet dimension cascade migration
-- ----------------------------------------------------------------------------
-- Run this whole script ONCE in the Supabase SQL editor (it is idempotent —
-- safe to re-run). All changes are ADDITIVE — no existing columns are modified.
--
-- Purpose: make cabinet HEIGHT (dy) and DEPTH (dz) cascade through the standard
-- hierarchy at placement instead of being frozen onto every library definition:
--
--     room.class_dimension_defaults
--       ?? project.class_dimension_defaults        (Job Properties — already exists)
--       ?? shop_settings.default_<class>_dy/dz      (already exists; was unused)
--       ?? DEFAULT_DIMS constant                    (600/900/580 …)
--
-- A library definition only wins on an axis the user explicitly PRESERVED when
-- saving it (preserve_dx / preserve_dy / preserve_dz). Tick nothing → the placed
-- cabinet's size cascades, matching how materials/hardware/rules already resolve.
-- See z_cabinet_library/RHK-CADcam_Cabinet-Library_Spec.md §1 (Freeze vs cascade).
-- ============================================================================

-- 1. Room-level cabinet size defaults --------------------------------------
--    Same JSONB shape as projects.class_dimension_defaults:
--      { "base": {"dy": n, "dz": n}, "wall": {...}, "tall": {...} }
--    Any missing class/axis falls through to the job level. Null/'{}' = inherit.
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS class_dimension_defaults jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.rooms.class_dimension_defaults IS
  'Per-class cabinet Height(dy)/Depth(dz) defaults { base|wall|tall: {dy,dz} }. Highest cascade level; missing class/axis inherits the job (projects.class_dimension_defaults).';

-- 2. Per-axis preservation flags on library definitions --------------------
--    When true, the definition's frozen default_dx/dy/dz wins over the cascade
--    for that axis. Default false → the axis cascades at placement.
ALTER TABLE public.cabinet_definitions
  ADD COLUMN IF NOT EXISTS preserve_dx boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preserve_dy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preserve_dz boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cabinet_definitions.preserve_dx IS 'Freeze this definition''s default_dx at placement instead of cascading. (Width has no cascade source yet, so width still resolves to default_dx / gap-fit regardless.)';
COMMENT ON COLUMN public.cabinet_definitions.preserve_dy IS 'Freeze this definition''s default_dy (height) at placement instead of cascading room→job→shop→system.';
COMMENT ON COLUMN public.cabinet_definitions.preserve_dz IS 'Freeze this definition''s default_dz (depth) at placement instead of cascading room→job→shop→system.';

-- ----------------------------------------------------------------------------
-- OPTIONAL backfill: definitions saved BEFORE this migration were created under
-- the old "dims always frozen" behaviour. Leaving preserve_* = false means their
-- placed cabinets will now cascade (height becomes the class standard). If you'd
-- rather keep existing library items frozen at their saved size, uncomment:
--
-- UPDATE public.cabinet_definitions
--   SET preserve_dx = true, preserve_dy = true, preserve_dz = true;
-- ----------------------------------------------------------------------------
