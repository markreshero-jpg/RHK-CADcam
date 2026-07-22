-- ============================================================================
-- RHK-CADcam — parts_library as the single part-naming source
-- ----------------------------------------------------------------------------
-- Idempotent. Supersedes (and drops) part_name_defaults: parts_library was
-- already seeded with the resolver vocabulary (left_side "Left Gable",
-- db_bottom "Drawer Box Bottom", kick_back…) and key is UNIQUE, so it is the
-- natural home for system-wide display names. The optimiser (normalize.ts)
-- now resolves a generated part's default label as:
--   1. cabinet_instances.part_names[source_part_key]   — one part, renamed by hand
--   2. parts_library.name where key = raw resolver key — shop-wide, live
--   3. code fallback (PART_TYPE_LABELS / humanize)
--
-- Raw resolver keys are collision-free across part kinds (bottom / db_bottom /
-- inner_drawer_bottom are distinct strings), so no namespacing is needed.
--
-- is_system marks rows whose key IS a resolver identity: the UI locks the key
-- (renaming the key would silently orphan the lookup) but the name stays
-- editable — that is the feature. Deleting/deactivating a system row is safe:
-- the label falls back to the code default.
-- ============================================================================

ALTER TABLE public.parts_library
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.parts_library.is_system IS
  'Row''s key is a resolver part identity (case/drawer-box/toekick/internal/face). '
  'Key is locked in the UI; name is the live shop-wide display name for that part type.';

-- Mark the already-seeded resolver rows.
UPDATE public.parts_library SET is_system = true WHERE key IN (
  -- carcase
  'left_side','right_side','bottom','back','full_top','front_rail','back_rail',
  -- drawer box
  'db_left_side','db_right_side','db_bottom','db_front','db_back',
  -- toe kick
  'kick_front_face','kick_sub_front','kick_back','spreader_vertical','spreader_horizontal',
  -- internal
  'adj_shelf','fixed_shelf','inner_drawer_back','inner_drawer_bottom'
);

-- Seed the resolver types that had no row yet.
INSERT INTO public.parts_library (key, name, category, material_role, is_system, description)
VALUES
  ('door',               'Door',               'doors',   'door',     true, 'Generated face panel — rename freely; other fields are informational.'),
  ('drawer_face',        'Drawer Face',        'doors',   'door',     true, 'Generated face panel — rename freely; other fields are informational.'),
  ('false_panel',        'False Panel',        'doors',   'door',     true, 'Generated face panel — rename freely; other fields are informational.'),
  ('divider',            'Divider',            'shelves', 'interior', true, 'Generated internal part — rename freely; other fields are informational.'),
  ('inner_drawer_side',  'Inner Drawer Side',  'assembly','drawerbox',true, 'Generated internal part — rename freely; other fields are informational.'),
  ('inner_drawer_front', 'Inner Drawer Front', 'assembly','drawerbox',true, 'Generated internal part — rename freely; other fields are informational.'),
  ('pull_out_bottom',    'Pull-out Bottom',    'assembly','drawerbox',true, 'Generated internal part — rename freely; other fields are informational.'),
  ('pull_out_side',      'Pull-out Side',      'assembly','drawerbox',true, 'Generated internal part — rename freely; other fields are informational.'),
  ('pull_out_back',      'Pull-out Back',      'assembly','drawerbox',true, 'Generated internal part — rename freely; other fields are informational.'),
  ('accessory',          'Accessory',          'misc',    'interior', true, 'Generated internal part — rename freely; other fields are informational.')
ON CONFLICT (key) DO UPDATE SET is_system = true;

-- One table now — the separate defaults table (added 2026-07-11) is superseded.
DROP TABLE IF EXISTS public.part_name_defaults;
