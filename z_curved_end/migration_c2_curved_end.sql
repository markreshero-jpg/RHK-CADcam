-- C2 (2026-10-20): curved fixed-panel cabinets (z_curved_end/CURVED-END-SPEC.md).
-- A non-null `curved_end` jsonb marks a definition / instance as a curved end
-- and holds its settings (hand, radius, skin, overhangs, scribes, blocks, rib
-- cut-outs, grain). Generated case parts use `crv:<part>` keys; the face board
-- carries its bent plan shape in case_parts.wrap.
alter table public.cabinet_definitions add column if not exists curved_end jsonb;
alter table public.cabinet_instances   add column if not exists curved_end jsonb;
alter table public.case_parts          add column if not exists wrap jsonb;

alter table public.case_parts drop constraint case_parts_part_key_check;
alter table public.case_parts add constraint case_parts_part_key_check check (
  part_key = any (array['left_side','right_side','bottom','back','full_top','front_rail','back_rail'])
  or part_key ~ '^(side|back|rail|cleat):[A-Za-z0-9_-]+$'
  or part_key ~ '^fprail:[0-9]+$'
  or part_key ~ '^bh:[a-z_]+$'
  or part_key ~ '^crv:[a-z0-9_]+$'
);

-- Library rows: BCRVFIXP / WCRVFIXP / TCRVFIXP under each class's End Panels.
-- No carcass / internals / face / kick: resolveCurvedEnd builds every part from
-- `curved_end`; placement builds the plan footprint from it. Height and depth
-- cascade like any cabinet of the class. Hand = the sidebar dropdown (RH default).
with tpl(name, cls, parent, dx, dy, dz, src) as (values
  ('BCRVFIXP', 'base', 'Base', 300, 900,  580, 'B1D'),
  ('WCRVFIXP', 'wall', 'Wall', 300, 700,  350, 'W1D'),
  ('TCRVFIXP', 'tall', 'Tall', 300, 2100, 580, 'T2D'))
INSERT INTO cabinet_definitions (name, assembly_class, construction_method_id, default_dx, default_dy, default_dz,
  has_carcass, has_internal, has_face, has_toekick, top_type, toe_type, face_grid, internal_grid, rule_overrides,
  is_library_item, active, category_id, subcategory_id, carcase_joints, material_overrides, hardware_overrides,
  toekick_overrides, drawerbox_overrides, exposed_interior, description, sort_order, no_cnc, custom_parts,
  preserve_dx, preserve_dy, preserve_dz, footprint, faces, curved_end)
SELECT t.name, t.cls, s.construction_method_id, t.dx, t.dy, t.dz,
  false, false, false, false, s.top_type, s.toe_type, '{}'::jsonb, NULL, '{}'::jsonb,
  true, true,
  (SELECT c.id FROM cabinet_categories c JOIN cabinet_categories p ON p.id = c.parent_id
    WHERE c.name = 'End Panels' AND p.name = t.parent LIMIT 1),
  NULL, '{}'::jsonb, s.material_overrides, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, false,
  'Curved fixed-panel cabinet: a face board pocketed to a thin skin so it bends round the curve, glued and screwed to shaped formers, with a fixing panel, back and optional fixing blocks. Curve right / left / both in the sidebar.',
  0, false, '[]'::jsonb,
  false, false, false, NULL, NULL,
  '{"hand":"RH","R":150,"SK":2,"OG":0,"OL":0,"OR":0,"SBK":0,"SBT":0,"STP":0,"lighten":false,"B":60,"onion":false,"OS":0.3,"blkS":false,"blkF":false,"grain":"vertical"}'::jsonb
FROM tpl t JOIN cabinet_definitions s ON s.name = t.src
WHERE NOT EXISTS (SELECT 1 FROM cabinet_definitions d WHERE d.name = t.name);
