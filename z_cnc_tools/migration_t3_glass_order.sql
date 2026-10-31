-- z_cnc_tools T3 — glass size for ordering.
-- A tool set with glass_thickness_mm set is a GLASS recipe: any door whose profile
-- op uses it is a glass door and goes on Reports → Glass Order.
--   glass size = opening (door − the op's frame offsets)
--              + the rebate (the ring step's outward offsets)
--              − 2 × glass_clearance_mm (per side)
alter table cnc_tool_sets
  add column if not exists glass_thickness_mm numeric,
  add column if not exists glass_clearance_mm numeric;

comment on column cnc_tool_sets.glass_thickness_mm is 'Set = this tool set cuts glass doors; the glass thickness to order';
comment on column cnc_tool_sets.glass_clearance_mm is 'Gap each side between the glass and the rebate wall (mm); null = 1.5';

update cnc_tool_sets set glass_thickness_mm = 6, glass_clearance_mm = 1.5 where name = 'Glass Door';
