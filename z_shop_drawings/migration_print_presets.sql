-- Reports print presets (2026-11-02): shop-wide list, one click sets a report's
-- paper / scale / layer set(s) / page per room. See app/canvas/[roomId]/PrintPresets.tsx.
alter table shop_settings add column if not exists print_presets jsonb not null default '[]'::jsonb;

-- Starter presets (layer sets by name).
update shop_settings set print_presets = jsonb_build_array(
  jsonb_build_object('id', gen_random_uuid(), 'name', 'A3 · 1:20 · Line Drawing Print', 'report', 'shop_drawings', 'paper', 'A3L', 'scale', 20,
    'sets', jsonb_build_object('plan-view-layer-set', 'Line Drawing Print', 'elevation-print-layer-set', 'Line Drawing Print', 'shop-3d-layer-set', 'Line Drawing Print')),
  jsonb_build_object('id', gen_random_uuid(), 'name', 'A4 · 1:30 · Line Drawing Print', 'report', 'shop_drawings', 'paper', 'A4L', 'scale', 30,
    'sets', jsonb_build_object('plan-view-layer-set', 'Line Drawing Print', 'elevation-print-layer-set', 'Line Drawing Print', 'shop-3d-layer-set', 'Line Drawing Print')),
  jsonb_build_object('id', gen_random_uuid(), 'name', 'A3 · 1:20 · Line Drawing Print', 'report', 'plan_view_v2', 'paper', 'A3L', 'scale', 20,
    'sets', jsonb_build_object('plan-view-layer-set', 'Line Drawing Print')),
  jsonb_build_object('id', gen_random_uuid(), 'name', 'A3 · 1:20 · Line Drawing Print', 'report', 'elevation_view_v2', 'paper', 'A3L', 'scale', 20,
    'sets', jsonb_build_object('elevation-print-layer-set', 'Line Drawing Print')),
  jsonb_build_object('id', gen_random_uuid(), 'name', 'A3 · 1:20 · Benchtops', 'report', 'benchtop_quote', 'paper', 'A3L', 'scale', 20,
    'sets', jsonb_build_object('benchtop-quote-layer-set', 'Benchtops')),
  jsonb_build_object('id', gen_random_uuid(), 'name', 'Rooms run on', 'report', 'hardware_pick', 'pagePerRoom', false),
  jsonb_build_object('id', gen_random_uuid(), 'name', 'Page per room', 'report', 'hardware_pick', 'pagePerRoom', true),
  jsonb_build_object('id', gen_random_uuid(), 'name', 'Rooms run on', 'report', 'takeoff', 'pagePerRoom', false),
  jsonb_build_object('id', gen_random_uuid(), 'name', 'Page per room', 'report', 'takeoff', 'pagePerRoom', true)
) where print_presets = '[]'::jsonb;
