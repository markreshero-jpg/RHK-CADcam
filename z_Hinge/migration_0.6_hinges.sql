-- ============================================================================
-- RHK-CADcam — Hinge Hardware System migration (schema v0.6)
-- ----------------------------------------------------------------------------
-- Run this whole script ONCE in the Supabase SQL editor (it is idempotent —
-- safe to re-run). Execution order matters for FK creation; do not reorder.
--
-- DEVIATION FROM SPEC (agreed): `hinge_instances` is RE-KEYED to a stable
-- identity — (cabinet_instance_id, row_index, col_index, sort_order) — instead
-- of a hard FK to face_zones(id) ON DELETE CASCADE. The cabinet resolver
-- deletes & recreates face_zones with fresh UUIDs on every resolve, which would
-- otherwise cascade-wipe every hinge (including y_locked ones) each time. With
-- the stable identity the resolver can MERGE: preserve locked/edited hinges and
-- regenerate the rest. `face_zone_id` is kept as a nullable convenience column
-- (ON DELETE SET NULL), refreshed by the resolver, never a delete source.
-- ============================================================================


-- ── 0. Prerequisite: handle_updated_at() ────────────────────────────────────
-- The triggers below need this function. Create it if it does not already
-- exist (CREATE OR REPLACE is a no-op if the project already defines it the
-- same way).
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ── Section 1. Extend face_zones.hinge_side to allow top / bottom ───────────
ALTER TABLE public.face_zones
  DROP CONSTRAINT IF EXISTS face_zones_hinge_side_check;

ALTER TABLE public.face_zones
  ADD CONSTRAINT face_zones_hinge_side_check
  CHECK (hinge_side = ANY (ARRAY[
    'left'::text,
    'right'::text,
    'top'::text,
    'bottom'::text
  ]));


-- ── Section 2. Alter hardware_hinges ────────────────────────────────────────
ALTER TABLE public.hardware_hinges
  -- Cup geometry
  ADD COLUMN IF NOT EXISTS cup_x_from_edge_mm   numeric NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS cup_depth_mm         numeric,

  -- Anchor holes: jsonb array of { offset_x, offset_y, diameter, depth }
  -- offset_x / offset_y measured from the cup centre (mm).
  ADD COLUMN IF NOT EXISTS anchor_holes         jsonb   NOT NULL DEFAULT '[]'::jsonb,

  -- Hinge type / mounting edge
  ADD COLUMN IF NOT EXISTS hinge_type           text    NOT NULL DEFAULT 'euro',
  ADD COLUMN IF NOT EXISTS default_hinge_edge   text    NOT NULL DEFAULT 'left',

  -- 3D model — separate cup (legacy / simple fallback)
  ADD COLUMN IF NOT EXISTS model_cup_url        text,
  ADD COLUMN IF NOT EXISTS model_cup_format     text,
  ADD COLUMN IF NOT EXISTS model_cup_scale      numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS model_cup_anchor_x   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model_cup_anchor_y   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model_cup_anchor_z   numeric NOT NULL DEFAULT 0,

  -- 3D model — combined two-part animated GLB (preferred; Section 13)
  ADD COLUMN IF NOT EXISTS model_combined_url          text,
  ADD COLUMN IF NOT EXISTS model_combined_format       text,
  ADD COLUMN IF NOT EXISTS model_combined_scale        numeric NOT NULL DEFAULT 1.0,
  -- Cached from the GLB's HingeSpec extras so the viewer need not parse binary.
  ADD COLUMN IF NOT EXISTS bore_centre_to_door_face_mm numeric,

  -- Supplier / ordering
  ADD COLUMN IF NOT EXISTS supplier_code        text,
  ADD COLUMN IF NOT EXISTS updated_at           timestamptz NOT NULL DEFAULT now();

-- Check constraints (added separately so IF NOT EXISTS columns above stay clean)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hardware_hinges_hinge_type_check') THEN
    ALTER TABLE public.hardware_hinges
      ADD CONSTRAINT hardware_hinges_hinge_type_check
      CHECK (hinge_type = ANY (ARRAY['euro'::text, 'pivot'::text, 'other'::text]));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hardware_hinges_default_hinge_edge_check') THEN
    ALTER TABLE public.hardware_hinges
      ADD CONSTRAINT hardware_hinges_default_hinge_edge_check
      CHECK (default_hinge_edge = ANY (ARRAY['left'::text, 'right'::text, 'top'::text, 'bottom'::text]));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hardware_hinges_model_cup_format_check') THEN
    ALTER TABLE public.hardware_hinges
      ADD CONSTRAINT hardware_hinges_model_cup_format_check
      CHECK (model_cup_format IS NULL OR model_cup_format = ANY (ARRAY['glb'::text, 'stl'::text, 'obj'::text]));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hardware_hinges_model_combined_format_check') THEN
    ALTER TABLE public.hardware_hinges
      ADD CONSTRAINT hardware_hinges_model_combined_format_check
      CHECK (model_combined_format IS NULL OR model_combined_format = ANY (ARRAY['glb'::text]));
  END IF;
END $$;

-- updated_at trigger (drop+recreate so re-runs are clean)
DROP TRIGGER IF EXISTS hardware_hinges_updated_at ON public.hardware_hinges;
CREATE TRIGGER hardware_hinges_updated_at
  BEFORE UPDATE ON public.hardware_hinges
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ── Section 3. New table: hardware_hinge_plates ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.hardware_hinge_plates (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  hinge_id              uuid          NOT NULL
    REFERENCES public.hardware_hinges(id) ON DELETE CASCADE,

  name                  text          NOT NULL,
  brand                 text,

  plate_type            text          NOT NULL DEFAULT 'standard'
    CONSTRAINT hardware_hinge_plates_plate_type_check
    CHECK (plate_type = ANY (ARRAY[
      'standard'::text, 'thick_door'::text, 'frame_mount'::text,
      'zero_protrusion'::text, 'other'::text
    ])),

  -- Distance from cup centre to plate mounting centre (mm).
  plate_offset_mm       numeric       NOT NULL DEFAULT 0,

  -- Plate mounting hole pattern: [{ offset_x, offset_y, diameter, depth }]
  -- offsets measured from the plate centre (mm).
  mounting_hole_pattern jsonb         NOT NULL DEFAULT '[]'::jsonb,

  -- Surfaces this plate can mount to. Drives the resolver shelf-snap logic.
  compatible_surfaces   jsonb         NOT NULL DEFAULT '["side"]'::jsonb,

  -- 3D model — the plate (separate / legacy fallback)
  model_plate_url       text,
  model_plate_format    text
    CONSTRAINT hardware_hinge_plates_model_plate_format_check
    CHECK (model_plate_format IS NULL OR model_plate_format = ANY (ARRAY['glb'::text, 'stl'::text, 'obj'::text])),
  model_plate_scale     numeric       NOT NULL DEFAULT 1.0,
  model_plate_anchor_x  numeric       NOT NULL DEFAULT 0,
  model_plate_anchor_y  numeric       NOT NULL DEFAULT 0,
  model_plate_anchor_z  numeric       NOT NULL DEFAULT 0,

  supplier_code         text,
  cost_per_unit         numeric,
  is_default            boolean       NOT NULL DEFAULT false,
  active                boolean       NOT NULL DEFAULT true,
  notes                 text,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hardware_hinge_plates_one_default
  ON public.hardware_hinge_plates (hinge_id)
  WHERE is_default = true;

ALTER TABLE public.hardware_hinge_plates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated read hardware_hinge_plates"  ON public.hardware_hinge_plates;
DROP POLICY IF EXISTS "authenticated write hardware_hinge_plates" ON public.hardware_hinge_plates;
CREATE POLICY "authenticated read hardware_hinge_plates"
  ON public.hardware_hinge_plates FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write hardware_hinge_plates"
  ON public.hardware_hinge_plates FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS hardware_hinge_plates_updated_at ON public.hardware_hinge_plates;
CREATE TRIGGER hardware_hinge_plates_updated_at
  BEFORE UPDATE ON public.hardware_hinge_plates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ── Section 4. New table: hinge_count_rules (shop-level) ────────────────────
CREATE TABLE IF NOT EXISTS public.hinge_count_rules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  max_height_mm   numeric     NOT NULL,
  hinge_count     integer     NOT NULL CHECK (hinge_count > 0),
  top_inset_mm    numeric     NOT NULL DEFAULT 100,
  bottom_inset_mm numeric     NOT NULL DEFAULT 100,
  sort_order      integer     NOT NULL DEFAULT 0,
  active          boolean     NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed defaults only if the table is empty (so re-runs don't duplicate).
INSERT INTO public.hinge_count_rules
  (max_height_mm, hinge_count, top_inset_mm, bottom_inset_mm, sort_order)
SELECT * FROM (VALUES
  (900::numeric,  2, 100::numeric, 100::numeric, 10),
  (1800::numeric, 3, 100::numeric, 100::numeric, 20),
  (2400::numeric, 4, 100::numeric, 100::numeric, 30),
  (3000::numeric, 5, 100::numeric, 100::numeric, 40)
) AS seed(max_height_mm, hinge_count, top_inset_mm, bottom_inset_mm, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.hinge_count_rules);

ALTER TABLE public.hinge_count_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated read hinge_count_rules"  ON public.hinge_count_rules;
DROP POLICY IF EXISTS "authenticated write hinge_count_rules" ON public.hinge_count_rules;
CREATE POLICY "authenticated read hinge_count_rules"
  ON public.hinge_count_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write hinge_count_rules"
  ON public.hinge_count_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS hinge_count_rules_updated_at ON public.hinge_count_rules;
CREATE TRIGGER hinge_count_rules_updated_at
  BEFORE UPDATE ON public.hinge_count_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ── Section 5. New table: hinge_instances (RE-KEYED to stable identity) ─────
CREATE TABLE IF NOT EXISTS public.hinge_instances (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stable identity of the door this hinge belongs to. face_zones get new
  -- UUIDs on every resolve, so we key on the cabinet + grid position, which
  -- are stable. The resolver merges by (cabinet_instance_id, row_index,
  -- col_index, sort_order) and preserves y_locked rows.
  cabinet_instance_id         uuid        NOT NULL
    REFERENCES public.cabinet_instances(id) ON DELETE CASCADE,
  row_index                   integer     NOT NULL,
  col_index                   integer     NOT NULL,

  -- Convenience pointer to the current face_zone row, refreshed each resolve.
  -- NOT a cascade source (SET NULL) so a face_zone delete never drops a hinge.
  face_zone_id                uuid
    REFERENCES public.face_zones(id) ON DELETE SET NULL,

  hinge_hardware_id           uuid        NOT NULL
    REFERENCES public.hardware_hinges(id),
  hinge_plate_id              uuid
    REFERENCES public.hardware_hinge_plates(id),

  hinge_edge                  text        NOT NULL DEFAULT 'left'
    CONSTRAINT hinge_instances_hinge_edge_check
    CHECK (hinge_edge = ANY (ARRAY['left'::text, 'right'::text, 'top'::text, 'bottom'::text])),

  -- Y of this hinge centre from the BOTTOM of the door (mm). Resolver-set
  -- unless y_locked, in which case the resolver never recalculates it.
  y_position_mm               numeric     NOT NULL,
  y_locked                    boolean     NOT NULL DEFAULT false,

  mounting_surface            text        NOT NULL DEFAULT 'auto'
    CONSTRAINT hinge_instances_mounting_surface_check
    CHECK (mounting_surface = ANY (ARRAY['auto'::text, 'side'::text, 'top'::text, 'bottom'::text, 'shelf'::text])),

  -- Shelf-snap tolerance (mm); only applies when mounting_surface = 'auto'
  -- and hinge_edge is top/bottom.
  shelf_snap_tolerance_mm     numeric     NOT NULL DEFAULT 3,

  -- Written by the mounting-surface resolver each resolve.
  resolved_mounting_part_table text
    CONSTRAINT hinge_instances_resolved_mounting_part_table_check
    CHECK (resolved_mounting_part_table IS NULL OR resolved_mounting_part_table = ANY (ARRAY['case_parts'::text, 'internal_parts'::text])),
  resolved_mounting_part_id   uuid,

  sort_order                  integer     NOT NULL DEFAULT 0,

  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup of all hinges on a cabinet / door.
CREATE INDEX IF NOT EXISTS hinge_instances_cabinet_idx
  ON public.hinge_instances (cabinet_instance_id);
CREATE INDEX IF NOT EXISTS hinge_instances_door_idx
  ON public.hinge_instances (cabinet_instance_id, row_index, col_index);

-- Merge key for the resolver's upsert.
CREATE UNIQUE INDEX IF NOT EXISTS hinge_instances_identity_uniq
  ON public.hinge_instances (cabinet_instance_id, row_index, col_index, sort_order);

ALTER TABLE public.hinge_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated read hinge_instances"  ON public.hinge_instances;
DROP POLICY IF EXISTS "authenticated write hinge_instances" ON public.hinge_instances;
CREATE POLICY "authenticated read hinge_instances"
  ON public.hinge_instances FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write hinge_instances"
  ON public.hinge_instances FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS hinge_instances_updated_at ON public.hinge_instances;
CREATE TRIGGER hinge_instances_updated_at
  BEFORE UPDATE ON public.hinge_instances
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ── Section 6. hinge_schedules: add default plate pairing ───────────────────
ALTER TABLE public.hinge_schedules
  ADD COLUMN IF NOT EXISTS hinge_plate_id uuid
    REFERENCES public.hardware_hinge_plates(id);


-- ── Section 7. Fix RLS on 10 tables (authenticated-only) ────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'shop_settings', 'drawer_box_methods', 'benchtop_schedule_rows',
    'job_benchtop_materials', 'room_benchtop_materials', 'benchtop_build_methods',
    'slide_schedule_entries', 'job_presets', 'parts_library', 'cabinet_custom_parts'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated all %s" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "authenticated all %s" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      t, t
    );
  END LOOP;
END $$;


-- ── Section 8. Record schema version ────────────────────────────────────────
INSERT INTO public.schema_versions (version, notes, breaking_change)
SELECT
  '0.6',
  'Hinge system: extend hardware_hinges, add hardware_hinge_plates, hinge_count_rules, hinge_instances (re-keyed to cabinet+row+col stable identity, not face_zone cascade). Extend face_zones.hinge_side to top/bottom. Add hinge_plate_id to hinge_schedules. Fix RLS on 10 tables.',
  false
WHERE NOT EXISTS (SELECT 1 FROM public.schema_versions WHERE version = '0.6');
