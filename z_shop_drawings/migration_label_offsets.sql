-- Movable cabinet / fixture labels (Mark, 2026-10-21).
-- { plan?: {x, y}, elev?: {x, y} } — the label's offset in mm from the item's
-- centre: plan in the item's own frame (x along its width, y = depth toward
-- the front), elevation in elevation mm (x along the wall view, y down).
-- Absent = the default label position.
alter table cabinet_instances add column if not exists label_offsets jsonb;
alter table room_fixtures     add column if not exists label_offsets jsonb;
