-- z_cnc_tools T2 — tool-set steps that can match Cabinet Vision's shaker / glass sets.
--   tool_position     'inside' = tool edge on the line (default), 'centre' = tool centre on the line (V chamfer, VJ)
--   ring_width_mm     pocket step: clear only this wide a band in from the edge (glass rebate)
--   cleanup_radius_mm square_off step: corner radius to clean (null = previous step's tool radius)
-- square_off now squares out the 4 corners only (no full lap). Each step's own
-- depth beats the operation's depth (routes.ts expandToolSetMember).

alter table cnc_tool_set_operations
  add column if not exists tool_position text not null default 'inside'
    check (tool_position in ('inside', 'centre')),
  add column if not exists ring_width_mm numeric,
  add column if not exists cleanup_radius_mm numeric;
