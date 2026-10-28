-- Kick end returns (2026-10-28, RHK6586 kitchenette): new toe-kick part key.
alter table toekick_parts drop constraint toekick_parts_part_key_check;
alter table toekick_parts add constraint toekick_parts_part_key_check check (part_key = any (array[
  'kick_front_face', 'kick_sub_front', 'kick_back', 'spreader_vertical', 'spreader_horizontal', 'kick_return'
]));
