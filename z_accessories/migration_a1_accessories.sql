-- z_accessories A1 (2026-10-25): accessories library, hanging rails first.

create table if not exists hardware_accessories (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  brand             text,
  category          text not null default 'other'
                    check (category in ('hanging_rail', 'rail_support', 'other')),
  supplier_code     text,
  profile           text,          -- hanging rail: 'oval' / 'round' / 'rect'
  width_mm          numeric,       -- across the rail (oval 15)
  height_mm         numeric,       -- up (oval 30)
  stock_length_mm   numeric,       -- bar length bought (3600)
  max_span_mm       numeric,       -- rail: longest run before a centre support
  end_support_id    uuid references hardware_accessories(id) on delete set null,
  centre_support_id uuid references hardware_accessories(id) on delete set null,
  colour            text,          -- drawn colour (3D)
  finish            text,
  material          text,
  cost_per_unit     numeric,       -- per bar / per support
  is_default        boolean not null default false,
  active            boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now()
);

alter table hardware_accessories enable row level security;
drop policy if exists library_read on hardware_accessories;
create policy library_read on hardware_accessories for select to authenticated using (true);
drop policy if exists admin_write on hardware_accessories;
create policy admin_write on hardware_accessories for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));

-- A2: the resolved accessory product travels with the saved part.
alter table internal_parts add column if not exists accessory jsonb;
comment on column internal_parts.accessory is 'Accessory product (z_accessories A5): {product_id, name, colour}';

-- Seed: Lincoln Sentry Finista oval rail + its supports.
do $$
declare es uuid; cs uuid;
begin
  if exists (select 1 from hardware_accessories where supplier_code = '7104006') then return; end if;
  insert into hardware_accessories (name, brand, category, supplier_code, notes)
    values ('Finista end support (oval 15 x 30)', 'Lincoln Sentry', 'rail_support', '1-490-112',
            'Alt code 1-490-114 (LS page does not say how they differ)') returning id into es;
  insert into hardware_accessories (name, brand, category, supplier_code)
    values ('Finista centre pillar (oval 15 x 30)', 'Lincoln Sentry', 'rail_support', '1-490-116') returning id into cs;
  insert into hardware_accessories (name, brand, category, supplier_code)
    values ('Finista end pillar (oval 15 x 30)', 'Lincoln Sentry', 'rail_support', '1-490-118');
  insert into hardware_accessories (name, brand, category, supplier_code, profile, width_mm, height_mm, stock_length_mm,
                                    end_support_id, centre_support_id, colour, finish, material, cost_per_unit, is_default, notes)
    values ('Finista oval hanging rail 15 x 30 White 3.6m', 'Lincoln Sentry', 'hanging_rail', '7104006', 'oval', 15, 30, 3600,
            es, cs, '#f4f4f2', 'White powder coat', 'Aluminium', 32.22, true,
            'Cat 1-490-110. $32.22 inc GST (retail). Marked discontinued / clearance on the LS site 2026-10-25');
end $$;
