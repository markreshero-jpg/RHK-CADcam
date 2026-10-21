-- z_shop_drawings: a short name for a placed fixture on the drawings (plan, elevation,
-- print). Null → a generic name from its kind ("Sink", "Basin", "Tap", "Oven" …).
-- `label` stays the full name used by schedules / lists.
alter table public.room_fixtures add column if not exists display_name text;
