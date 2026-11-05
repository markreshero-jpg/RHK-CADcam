-- D26 (Mark 2026-11-05, RHK6592 broom TC-05): tall door handles at a height off the floor.
-- handle_schedule_entries.height_aff_mm = handle centre above the floor (door_tall rows); null = offset_from_edge_mm.
alter table public.handle_schedule_entries add column if not exists height_aff_mm numeric;
comment on column public.handle_schedule_entries.height_aff_mm is
  'Tall doors (D26): handle centre this high off the floor, used over offset_from_edge_mm. null = edge offset.';
-- Mark: "change this in all handle schedules for talls" -> 1000 to the centre.
update public.handle_schedule_entries set height_aff_mm = 1000 where role = 'door_tall';
