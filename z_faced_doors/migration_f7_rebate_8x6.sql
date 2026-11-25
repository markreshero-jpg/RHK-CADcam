-- z_faced_doors F7 — glass / mirror rebate 8 wide x 6 deep with the 8mm Downshear (Mark 2026-11-25).
-- Was 15.9 x 6.35 with the 10mm compression. Data only: Glass Door + Mirror Door tool sets.
-- Step order unchanged: 1 rebate band, 2 square the corners, 3 cut the opening right through.

-- 1. Rebate band: 8 wide (one lap of the 8mm), 6 deep, outward from the opening line.
update cnc_tool_set_operations o
set tool_id = (select id from cnc_tools where tool_number = 'T110' and name = '8mm Downshear'),
    depth_mm = 6, ring_width_mm = 8,
    offset_top_mm = -8, offset_bottom_mm = -8, offset_left_mm = -8, offset_right_mm = -8,
    description = case when s.name = 'Mirror Door' then 'Mirror' else 'Glass' end
                  || ' rebate 8 wide x 6 deep, 8mm Downshear (outward from the opening)'
from cnc_tool_sets s
where s.id = o.tool_set_id and s.name in ('Glass Door', 'Mirror Door')
  and o.operation_type = 'pocket' and o.ring_width_mm is not null;

-- 2. Square the rebate corners: same 8 x 6 rebate, 6mm cutter takes the 8mm's R4 to R3.
update cnc_tool_set_operations o
set depth_mm = 6,
    offset_top_mm = -8, offset_bottom_mm = -8, offset_left_mm = -8, offset_right_mm = -8,
    description = 'Square the rebate corners for the '
                  || case when s.name = 'Mirror Door' then 'mirror' else 'glass' end || ' (R4 to R3)'
from cnc_tool_sets s
where s.id = o.tool_set_id and s.name in ('Glass Door', 'Mirror Door')
  and o.operation_type = 'square_off';

-- 3. Set descriptions.
update cnc_tool_sets set description =
  'All from the back: 8 x 6 rebate for 6mm glass (8mm Downshear), corners squared with the 6mm, opening cut right through. Rebate steps are offset -8 (outward) from the opening line.'
where name = 'Glass Door';
update cnc_tool_sets set description =
  'Inset mirror, all from the back: 8 x 6 rebate (8mm Downshear), corners squared with the 6mm, opening cut right through. 4mm mirror siliconed into the rebate. Rebate steps are offset -8 (outward) from the opening line.'
where name = 'Mirror Door';

-- 4. The profile rows only place the opening (the tool set does the cutting); keep their depth in step.
update door_profile_operations o set depth_mm = 6
from cnc_tool_sets s
where s.id = o.tool_set_id and s.name in ('Glass Door', 'Mirror Door') and o.depth_mm = 6.35;
