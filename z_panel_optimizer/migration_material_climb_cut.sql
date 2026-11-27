-- Climb cut per material (Mark 2026-11-28). On = the router climb cuts this board
-- (outlines anticlockwise, holes clockwise); off = conventional. Everything ran
-- climb before (machine profile milling_direction = climb), so default on.
-- Colours inherit it from their board like feed_rate_pct (MC1 trigger).

alter table materials
  add column if not exists climb_cut boolean not null default true;

create or replace function materials_colour_inherit() returns trigger
language plpgsql as $$
declare b materials%rowtype;
begin
  if new.parent_id is null then
    new.is_default_colour := false;
    return new;
  end if;
  select * into b from materials where id = new.parent_id;
  if b.parent_id is not null then
    raise exception 'material colour parent must be a board (parent_id null)';
  end if;
  if coalesce(new.colour_name, '') = '' then
    raise exception 'material colour needs a colour_name';
  end if;
  new.name          := b.name || ' – ' || new.colour_name;
  new.brand         := b.brand;
  new.dz            := b.dz;
  new.cnc_tool_id   := b.cnc_tool_id;
  new.trim_top      := b.trim_top;
  new.trim_bottom   := b.trim_bottom;
  new.trim_left     := b.trim_left;
  new.trim_right    := b.trim_right;
  new.pad           := b.pad;
  new.feed_rate_pct := b.feed_rate_pct;
  new.climb_cut     := b.climb_cut;
  if not ('sheet_dx' = any(new.overridden)) then new.sheet_dx := b.sheet_dx; end if;
  if not ('sheet_dy' = any(new.overridden)) then new.sheet_dy := b.sheet_dy; end if;
  return new;
end $$;
