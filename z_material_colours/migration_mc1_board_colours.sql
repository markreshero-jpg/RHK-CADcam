-- MC1: board colours. A colour is a materials row whose parent_id is its board.
-- Board-level fields are copied down by trigger so every existing materials
-- reader (resolver, optimiser, reports) keeps working off one material_id.
-- See MATERIAL-COLOURS-SPEC.md §2.

alter table materials
  add column if not exists parent_id         uuid references materials(id) on delete restrict,
  add column if not exists colour_name       text,
  add column if not exists colour_code       text,
  add column if not exists is_default_colour boolean not null default false,
  add column if not exists overridden        text[] not null default '{}';

create index if not exists materials_parent_id_idx on materials(parent_id);

-- One default colour per board.
create unique index if not exists materials_one_default_colour
  on materials(parent_id) where is_default_colour;

-- Colour rows: inherit board fields, generate "Board – Colour" name.
-- Colour-owned: colour_name/code, face/back/edge colour, has_grain,
-- grain_direction, finish, cost_per_sheet (pricing is per colour).
-- sheet_dx/dy inherit unless listed in overridden.
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
  if not ('sheet_dx' = any(new.overridden)) then new.sheet_dx := b.sheet_dx; end if;
  if not ('sheet_dy' = any(new.overridden)) then new.sheet_dy := b.sheet_dy; end if;
  return new;
end $$;

drop trigger if exists materials_colour_inherit on materials;
create trigger materials_colour_inherit
  before insert or update on materials
  for each row execute function materials_colour_inherit();

-- Board edits flow down: touching the colours re-runs the inherit trigger.
create or replace function materials_board_propagate() returns trigger
language plpgsql as $$
begin
  if new.parent_id is null then
    update materials set updated_at = now() where parent_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists materials_board_propagate on materials;
create trigger materials_board_propagate
  after update on materials
  for each row execute function materials_board_propagate();
