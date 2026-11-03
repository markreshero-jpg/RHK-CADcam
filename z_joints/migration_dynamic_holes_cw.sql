-- 5mm Dynamic Holes: hole centred on part A's edge (CW), not half the drilled part (T). Applied 2026-11-03.
update joint_type_operations set expressions = jsonb_set(expressions, '{offset_y_mm}', '"CW / 2"')
where id = '023c1625-0473-49e1-8ccf-01ee99b57ebf';
