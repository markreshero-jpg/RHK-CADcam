-- 2026-11-03 (RHK6542 Study): hand operations on custom parts — e.g. the recessed LED
-- route in WC-08's under panel. The optimiser already matches part_operations to custom
-- parts by (source_table, cabinet, source_part_key = custom_<id>). Applied.
alter table part_operations drop constraint part_operations_source_table_check;
alter table part_operations add constraint part_operations_source_table_check
  check (source_table = any (array['case_parts','toekick_parts','internal_parts','face_zones','drawer_box_parts','custom_parts']));
