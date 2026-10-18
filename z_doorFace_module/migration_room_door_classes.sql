-- Room-level per-class door style + colour (mirrors projects.base/wall/tall_door_*).
-- Cascade per class: zone → room class → room default (door_style_override_id)
-- → job class → job default. See DOOR_SYSTEM_SPEC.md §6.
alter table rooms
  add column if not exists base_door_style_id  uuid references door_styles(id) on delete set null,
  add column if not exists wall_door_style_id  uuid references door_styles(id) on delete set null,
  add column if not exists tall_door_style_id  uuid references door_styles(id) on delete set null,
  add column if not exists base_door_colour_id uuid references door_schedule_materials(id) on delete set null,
  add column if not exists wall_door_colour_id uuid references door_schedule_materials(id) on delete set null,
  add column if not exists tall_door_colour_id uuid references door_schedule_materials(id) on delete set null;
