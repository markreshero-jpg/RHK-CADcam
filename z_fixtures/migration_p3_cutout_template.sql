-- z_fixtures P3: benchtop cutout template + drop below benchtop top.
-- Applied live as migration `fixtures_p3_cutout_template` (2026-10-15).
-- On both the catalogue row and the placed (job) copy.
do $$
declare t text;
begin
  foreach t in array array['fixture_catalog', 'room_fixtures'] loop
    execute format($f$
      alter table %I
        add column if not exists cutout_shape  text    check (cutout_shape in ('rect', 'round')),
        add column if not exists cutout_w      numeric not null default 0,
        add column if not exists cutout_d      numeric not null default 0,
        add column if not exists cutout_radius numeric not null default 0,
        add column if not exists cutout_off_x  numeric not null default 0,
        add column if not exists cutout_off_y  numeric not null default 0,
        add column if not exists bench_drop    numeric not null default 0
    $f$, t);
  end loop;
end $$;

comment on column fixture_catalog.cutout_shape is 'Benchtop cutout: null = none, rect (cutout_w x cutout_d, corner cutout_radius) or round (diameter cutout_w)';
comment on column fixture_catalog.cutout_off_x is 'Cutout centre offset from the footprint centre along the width (+ = right, looking at the front)';
comment on column fixture_catalog.cutout_off_y is 'Cutout centre offset from the footprint centre toward the front (+ = forward)';
comment on column fixture_catalog.bench_drop  is 'Benchtop mount: how far the item''s underside sits below the benchtop top (sink bowl depth). 0 = sits on the top';
