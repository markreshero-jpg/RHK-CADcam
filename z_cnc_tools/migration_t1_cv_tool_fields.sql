-- z_cnc_tools T1 — Cabinet Vision tool fields (spin direction, through-drill
-- extra depth, drill tip / depth to shoulder, auto-select + tolerance).
-- The H register (CV HeightOffsetRegister) is deliberately NOT a column: G-code
-- always derives H = tool number + cnc_machine_profiles.tool_h_offset_delta.

alter table cnc_tools
  add column if not exists rotation text not null default 'clockwise'
    check (rotation in ('clockwise', 'anticlockwise')),
  add column if not exists through_depth_adj numeric,          -- null = machine profile |through_cut_z|
  add column if not exists auto_select boolean not null default true,
  add column if not exists select_tolerance numeric;           -- reserved for router auto-pick (mm)

alter table cnc_drills
  add column if not exists through_depth_adj numeric,          -- null = machine profile drill_through_overshoot
  add column if not exists depth_to_shoulder boolean not null default false,
  add column if not exists auto_select boolean not null default true,
  add column if not exists select_tolerance numeric;           -- null = 0.5mm snap

comment on column cnc_tools.through_depth_adj is 'mm past the board bottom on a through cut with this tool; null = machine profile';
comment on column cnc_tools.auto_select is 'May be picked automatically (pocket fallback for undrillable holes)';
comment on column cnc_drills.through_depth_adj is 'mm past the board bottom on a through hole; null = machine profile drill_through_overshoot';
comment on column cnc_drills.depth_to_shoulder is 'Blind hole depth is to the full-diameter shoulder: adds the point length (r / tan(point_angle/2))';
comment on column cnc_drills.auto_select is 'May be picked by diameter for holes with no assigned drill';
comment on column cnc_drills.select_tolerance is 'Auto-select snaps a hole within this many mm of the bit diameter; null = 0.5';
