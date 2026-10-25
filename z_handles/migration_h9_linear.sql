-- z_handles H9 (D17, 2026-10-25): linear applied strip handle.
-- A strip of the front's own board on the face of each door / drawer front,
-- sharknose edge, screwed from the back of the front. Built as case parts
-- lh:<n> (face-kind panels, like the finger rails' fprail:<n>).

alter table hardware_handles drop constraint if exists hardware_handles_grip_kind_check;
alter table hardware_handles add constraint hardware_handles_grip_kind_check
  check (grip_kind = any (array['hardware','sharknose','routed','push','rail','channel','linear']));

alter table hardware_handles
  add column if not exists strip_width_mm   numeric,   -- linear: strip width across its length (35)
  add column if not exists screw_spacing_mm numeric,   -- linear: max screw spacing along the strip (350)
  add column if not exists screw_inset_mm   numeric;   -- linear: first / last screw in from the strip ends (50)

alter table case_parts drop constraint if exists case_parts_part_key_check;
alter table case_parts add constraint case_parts_part_key_check check (
  part_key = any (array['left_side','right_side','bottom','back','full_top','front_rail','back_rail'])
  or part_key ~ '^(side|back|rail|cleat):[A-Za-z0-9_-]+$'
  or part_key ~ '^fprail:[0-9]+$'
  or part_key ~ '^lh:[0-9]+$'
  or part_key ~ '^bh:[a-z_]+$'
  or part_key ~ '^crv:[a-z0-9_]+$'
  or part_key ~ '^fs:[a-z0-9_]+$'
  or part_key ~ '^ibp:[0-9]+$'
  or part_key ~ '^split:(left_side|right_side|back|(side|back):[A-Za-z0-9_-]+):[0-9]$'
);

-- Catalogue entry: 35 strip, bevel as the existing Sharknose 38°, 4.5 screw holes.
insert into hardware_handles (name, handle_type, grip_kind, needs_finger_gap, bevel_angle_deg, bevel_land_mm,
                              strip_width_mm, screw_spacing_mm, screw_inset_mm, hole_dia_mm, holes, active, notes)
select 'Linear sharknose strip 35 (front material)', 'linear', 'linear', false, 38, 0, 35, 350, 50, 4.5, '[]'::jsonb, true,
       'Strip of the front''s own board on the face, full length, sharknose edge; screwed from the back of the front (z_handles D17)'
where not exists (select 1 from hardware_handles where grip_kind = 'linear');

-- H9b (2026-10-25): the strip's sharknose travels with the saved part, so views
-- drawn from saved parts (the room 3D view) can draw the bevel.
alter table case_parts add column if not exists lh jsonb;
comment on column case_parts.lh is 'Linear strip handle (z_handles D17): {bevel_edge, angle_deg, land} — the sharknose drawn on lh:<n> parts';
