-- ============================================================================
-- RHK-CADcam — Shape Editor integration migration (M1)
-- ----------------------------------------------------------------------------
-- Run ONCE in the Supabase SQL editor (idempotent — safe to re-run). Additive
-- only: one new table, nothing existing is touched.
--
-- A part's drawn shape is a PER-CABINET-INSTANCE OVERRIDE, keyed by the same
-- stable part id used by part_operations / PartMeta.id (case_left_side,
-- zone_0_0, int_adj_shelf_2, tk_kick_front_face_0, custom_<uuid>), so it
-- survives persistResolved's wipe-and-reinsert of resolved part rows.
--
-- History is append-only: every save inserts the next revision; the highest
-- revision per (cabinet_id, part_key) is the live shape. "Restore previous"
-- re-inserts an old revision's segments as a new head revision. Removing the
-- override deletes all revisions for that part.
-- See z_part_shape_editor/INTEGRATION-PLAN.md (M1).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.part_shape_overrides (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id  uuid        NOT NULL REFERENCES public.cabinet_instances(id) ON DELETE CASCADE,
  part_key    text        NOT NULL,
  revision    integer     NOT NULL,
  -- Closed segment loop in part-relative mm, ordered CCW, consecutive
  -- endpoints exactly equal (ShapeEditor onSave contract — pre-validated,
  -- resolver-walkable without re-sorting). Each segment may carry an opaque
  -- `edge` block (banding display tags) that is passed through untouched.
  segments    jsonb       NOT NULL,
  -- ShapeEditor meta at save time: bounds (mm), originShift, bandedEdges,
  -- tapeLengthMM, segmentCount. Informational — bounds also drive the part's
  -- size override at save time (written by the app, not derived here).
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cabinet_id, part_key, revision)
);

COMMENT ON TABLE public.part_shape_overrides IS
  'Per-cabinet-instance part shape overrides (Shape Editor). Append-only revisions; '
  'highest revision per (cabinet_id, part_key) is live. part_key = stable part id '
  '(case_*/tk_*/int_*/zone_*/custom_*), same vocabulary as part_operations.source_part_key.';
COMMENT ON COLUMN public.part_shape_overrides.segments IS
  'Closed CCW segment loop, part-relative mm (ShapeEditor format: line/arc/curve, p0/p1 exact-joined).';
COMMENT ON COLUMN public.part_shape_overrides.revision IS
  'Monotonic per (cabinet_id, part_key). Insert max+1 on save; never update in place.';

-- Fast "latest revision per part" lookups
CREATE INDEX IF NOT EXISTS part_shape_overrides_lookup_idx
  ON public.part_shape_overrides (cabinet_id, part_key, revision DESC);

-- RLS — mirrors the existing allow-all pattern on part_operations /
-- cabinet_instances (anon_all_* / authenticated_all_*).
ALTER TABLE public.part_shape_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_all_part_shape_overrides ON public.part_shape_overrides;
CREATE POLICY anon_all_part_shape_overrides ON public.part_shape_overrides
  AS PERMISSIVE FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS authenticated_all_part_shape_overrides ON public.part_shape_overrides;
CREATE POLICY authenticated_all_part_shape_overrides ON public.part_shape_overrides
  AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- Verify (optional):
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema='public' and table_name='part_shape_overrides'
--   order by ordinal_position;
-- ============================================================================
