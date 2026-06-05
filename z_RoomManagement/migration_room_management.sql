-- ============================================================================
-- RHK-CADcam — Room Management migration
-- ----------------------------------------------------------------------------
-- Run this whole script ONCE in the Supabase SQL editor (it is idempotent —
-- safe to re-run).
--
-- Adds two room-level wall defaults to the rooms table. All changes are
-- ADDITIVE — no existing columns or tables are modified.
--
--   rooms.wall_dy — default wall HEIGHT (mm) for new walls drawn in this room.
--                   Inherited by Wall.height when a wall is drawn (null = unset).
--   rooms.wall_dz — default wall THICKNESS (mm) for new walls drawn in this room.
--                   Inherited by Wall.thickness when a wall is drawn (null = unset).
--
-- NOTE: wall width is per-wall and already stored as Wall.length — there is no
-- room-level default for it. The Wall record uses length/height/thickness; the
-- room-level defaults map to height (wall_dy) and thickness (wall_dz).
--
-- The sort_order column already exists on the rooms table — no change needed to
-- support drag-to-sort beyond the UI.
-- ============================================================================

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS wall_dy numeric,
  ADD COLUMN IF NOT EXISTS wall_dz numeric;

COMMENT ON COLUMN public.rooms.wall_dy IS 'Default wall height (mm) inherited by new walls drawn in this room. Null = not set.';
COMMENT ON COLUMN public.rooms.wall_dz IS 'Default wall thickness (mm) inherited by new walls drawn in this room. Null = not set.';
