-- z_fixtures P6: user-defined fixture categories ("groups") with an icon.
-- Applied live as migration `fixtures_p6_groups` (2026-10-18).
-- A group is what the library tabs / F6 picker show (Ovens, Sinks, Windows…).
-- Its `category` is the behaviour type (appliance / sink / tap / decorative /
-- opening) that items made in it get — mount, cutouts, wall hosting, layers.
-- `icon` = a key from src/components/FixtureIcon.tsx (curated Lucide set).
create table if not exists fixture_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  icon       text not null default 'Box',
  category   text not null check (category in ('appliance', 'sink', 'tap', 'decorative', 'opening')),
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
alter table fixture_groups enable row level security;
create policy library_read on fixture_groups for select to authenticated using (true);
create policy admin_write  on fixture_groups for all    to authenticated
  using ((select is_admin())) with check ((select is_admin()));

alter table fixture_catalog
  add column if not exists group_id uuid references fixture_groups(id) on delete set null;
create index if not exists fixture_catalog_group_id_idx on fixture_catalog(group_id);

insert into fixture_groups (name, icon, category, sort_order) values
  ('Ovens',       'CookingPot',     'appliance',  10),
  ('Cooktops',    'Flame',          'appliance',  20),
  ('Rangehoods',  'Fan',            'appliance',  30),
  ('Dishwashers', 'Utensils',       'appliance',  40),
  ('Fridges',     'Refrigerator',   'appliance',  50),
  ('Microwaves',  'Microwave',      'appliance',  60),
  ('Laundry',     'WashingMachine', 'appliance',  70),
  ('Sinks',       'Droplets',       'sink',       80),
  ('Taps',        'Droplet',        'tap',        90),
  ('Windows',     'Grid2x2',        'opening',   100),
  ('Doors',       'DoorOpen',       'opening',   110),
  ('Decorative',  'Flower2',        'decorative', 120);

-- Existing library rows → a group by kind / category.
update fixture_catalog c set group_id = g.id from fixture_groups g
where c.group_id is null and g.name = case
  when c.category = 'sink' then 'Sinks'
  when c.category = 'tap' then 'Taps'
  when c.category = 'decorative' then 'Decorative'
  when c.category = 'opening' and c.kind ilike '%window%' then 'Windows'
  when c.category = 'opening' then 'Doors'
  when c.kind ilike '%oven%' then 'Ovens'
  when c.kind ilike '%cooktop%' or c.kind ilike '%hob%' then 'Cooktops'
  when c.kind ilike '%rangehood%' then 'Rangehoods'
  when c.kind ilike '%dishwasher%' then 'Dishwashers'
  when c.kind ilike '%fridge%' or c.kind ilike '%freezer%' then 'Fridges'
  when c.kind ilike '%microwave%' then 'Microwaves'
  when c.kind ilike '%wash%' or c.kind ilike '%dryer%' then 'Laundry'
end;
