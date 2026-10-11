-- ============================================================================
-- RHK-CADcam — Benchtop Builder Phase 1: edge profile library
-- ----------------------------------------------------------------------------
-- Idempotent (safe to re-run). Additive: one new table, one new nullable
-- column on benchtop_build_methods, starter seed rows (inserted only when the
-- table is empty). See z_benchtop_builder/BENCHTOP-SPEC.md, Phase 1.
--
-- An edge profile is applied per exposed benchtop edge (wall edges never carry
-- one). It drives display, reports/quoting (lineal metres per profile) and
-- part generation via `generates`:
--   none      — finish only
--   apron     — spawns a drop strip of apron_drop_mm along the edge (mitred apron)
--   waterfall — spawns a full-height end panel mitred to the top
-- Profiles do NOT drive CNC machining this round (spec decision 6).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.benchtop_edge_profiles (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL,
  code           text,
  category       text        NOT NULL DEFAULT 'stone'
                 CHECK (category IN ('stone', 'board', 'postform')),
  description    text,
  generates      text        NOT NULL DEFAULT 'none'
                 CHECK (generates IN ('none', 'apron', 'waterfall')),
  apron_drop_mm  numeric,     -- total visible edge height for an apron (e.g. 40)
  radius_mm      numeric,     -- arris/pencil/bullnose radius, display + notes only
  preview_svg    text,        -- optional custom cross-section; app draws a default
  sort_order     integer     NOT NULL DEFAULT 0,
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.benchtop_edge_profiles IS
  'Benchtop edge profile library (stone / board / postform). Applied per exposed '
  'benchtop edge; generates = apron|waterfall makes the resolver spawn parts.';

ALTER TABLE public.benchtop_build_methods
  ADD COLUMN IF NOT EXISTS default_edge_profile_id uuid
  REFERENCES public.benchtop_edge_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.benchtop_build_methods.default_edge_profile_id IS
  'Profile applied to exposed edges that have no explicit profile.';

-- RLS — mirrors the allow-all pattern on the other benchtop_* tables.
ALTER TABLE public.benchtop_edge_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_all_benchtop_edge_profiles ON public.benchtop_edge_profiles;
CREATE POLICY anon_all_benchtop_edge_profiles ON public.benchtop_edge_profiles
  AS PERMISSIVE FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS authenticated_all_benchtop_edge_profiles ON public.benchtop_edge_profiles;
CREATE POLICY authenticated_all_benchtop_edge_profiles ON public.benchtop_edge_profiles
  AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Starter library (only into an empty table) ──────────────────────────────
INSERT INTO public.benchtop_edge_profiles
  (name, code, category, description, generates, apron_drop_mm, radius_mm, sort_order)
SELECT * FROM (VALUES
  ('Arris / Pencil Round',  'ARR',  'stone',    'Small eased radius on the top and bottom arris.',        'none',      NULL::numeric, 3::numeric,  10),
  ('Bullnose',              'BN',   'stone',    'Full half-round across the slab thickness.',              'none',      NULL,          10,          20),
  ('Half Bullnose',         'HBN',  'stone',    'Radius on the top arris, square underneath.',             'none',      NULL,          10,          30),
  ('Bevel',                 'BEV',  'stone',    '45° bevel on the top arris.',                             'none',      NULL,          NULL,        40),
  ('Mitred Apron',          'MA',   'stone',    'Apron strip mitred to the slab edge for a thicker look.', 'apron',     40,            NULL,        50),
  ('Waterfall',             'WF',   'stone',    'Top continues down to the floor, mitred at the corner.',  'waterfall', NULL,          NULL,        60),
  ('Square Edge-Banded',    'SQ',   'board',    'Square edge finished with edge banding.',                 'none',      NULL,          NULL,       110),
  ('Radius Edge-Banded',    'RAD',  'board',    'Small radius edge finished with edge banding.',           'none',      NULL,          2,          120),
  ('Shark Nose',            'SN',   'board',    'Underside chamfer leaving a thin visible top edge.',      'none',      NULL,          NULL,       130),
  ('Board Waterfall',       'BWF',  'board',    'Board top continues down to the floor, mitred.',          'waterfall', NULL,          NULL,       140),
  ('Postformed Front',      'PF',   'postform', 'Laminate rolled over a radiused front edge.',             'none',      NULL,          NULL,       210),
  ('Square Laminate Edge',  'SLE',  'postform', 'Square edge with a laminate edge strip.',                 'none',      NULL,          NULL,       220),
  ('ABS Edged',             'ABS',  'postform', 'Square edge with ABS edging.',                            'none',      NULL,          NULL,       230)
) AS v(name, code, category, description, generates, apron_drop_mm, radius_mm, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.benchtop_edge_profiles);
