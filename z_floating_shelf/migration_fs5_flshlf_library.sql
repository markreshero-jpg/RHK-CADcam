-- FS5 (2026-10-22): FLSHLF — floating shelf library row (z_floating_shelf),
-- Wall → Open Shelves. A copy of the BHSL row (wall class, no carcass / faces /
-- kick) turned into a floating shelf: 1200 wide × 250 deep, double build of the
-- exposed board (33 for 16.5 board; the height follows the built thickness),
-- both sides unseen, 30 × 10 rebates, cleats on.
INSERT INTO cabinet_definitions
SELECT (jsonb_populate_record(NULL::cabinet_definitions, to_jsonb(d) || jsonb_build_object(
  'id', gen_random_uuid(),
  'name', 'FLSHLF',
  'category_id', (SELECT c.id FROM cabinet_categories c JOIN cabinet_categories p ON p.id = c.parent_id
                  WHERE c.name = 'Open Shelves' AND p.name = 'Wall' LIMIT 1),
  'subcategory_id', NULL,
  'default_dx', 1200,
  'default_dy', 33,
  'default_dz', 250,
  'preserve_dy', true,
  'preserve_dz', true,
  'sort_order', 10,
  'custom_parts', '[]'::jsonb,
  'part_hide_views', '{}'::jsonb,
  'description', 'Floating shelf: 2 (or 3) layers of exposed board glued up, then edged with wide tape (front + seen sides). Hidden cleat in a slot along the back and unseen sides. Sits at its own height (underside defaults to the overhead bottom).',
  'bulkhead', NULL,
  'float_shelf', '{"build":"double","seen_left":false,"seen_right":false,"rebate_depth":30,"rebate_h":10,"stop":30,"strip_w":90,"strip_spacing":600,"cleat":true,"tape_id":null}'::jsonb,
  'created_at', now(),
  'updated_at', now()
))).*
FROM cabinet_definitions d
WHERE d.name = 'BHSL' AND d.bulkhead IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM cabinet_definitions WHERE name = 'FLSHLF');
