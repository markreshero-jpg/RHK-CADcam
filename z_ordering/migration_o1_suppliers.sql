-- z_ordering O1 (2026-11-15): suppliers list + the same buying fields on every hardware table.
-- brand = maker; supplier_id = who we buy from; supplier_code = their code; maker_code = maker's code.
-- No stocked flag (the CRM decides) and no prices (the CRM owns them).

create table if not exists suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  account_no  text,
  crm_id      text,          -- the supplier's id in RHKCRM, for sending orders
  website     text,
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table suppliers enable row level security;
drop policy if exists library_read on suppliers;
create policy library_read on suppliers for select to authenticated using (true);
drop policy if exists admin_write on suppliers;
create policy admin_write on suppliers for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));

insert into suppliers (name, website) values
  ('Lincoln Sentry', 'https://www.lincolnsentry.com.au'),
  ('Nikpol',         'https://www.nikpol.com.au'),
  ('Furnware',       null),
  ('Handle House',   null),
  ('Momo',           null),
  ('CabinetWare',    null)
on conflict (name) do nothing;

do $$
declare t text;
begin
  foreach t in array array['hardware_hinges', 'hardware_hinge_plates', 'hardware_handles', 'hardware_slides',
                           'hardware_accessories', 'hardware_lift_systems', 'hardware_fasteners'] loop
    execute format('alter table %I add column if not exists supplier_id uuid references suppliers(id) on delete set null', t);
    execute format('alter table %I add column if not exists supplier_code text', t);
    execute format('alter table %I add column if not exists maker_code text', t);
    execute format('alter table %I add column if not exists order_uom text', t);
    execute format('alter table %I add column if not exists pack_qty numeric', t);
    execute format('create index if not exists %I on %I (supplier_id)', t || '_supplier_idx', t);
  end loop;
end $$;

-- ── Backfill ─────────────────────────────────────────────────────────────────
do $$
declare ls uuid; nk uuid; fw uuid;
begin
  select id into ls from suppliers where name = 'Lincoln Sentry';
  select id into nk from suppliers where name = 'Nikpol';
  select id into fw from suppliers where name = 'Furnware';

  update hardware_lift_systems set supplier_id = ls, order_uom = 'EA' where supplier_id is null;

  -- Hinge codes on file are Blum codes, not LS codes.
  update hardware_hinges set maker_code = supplier_code, supplier_code = null
   where supplier_code is not null and maker_code is null and brand = 'Blum';
  update hardware_hinges set supplier_id = ls where brand = 'Blum' and supplier_id is null;

  update hardware_accessories set brand = 'Finista', supplier_id = ls where brand = 'Lincoln Sentry';
  update hardware_accessories set supplier_id = ls where brand = 'Lamello' and supplier_id is null;
  update hardware_accessories set supplier_id = nk where brand = 'Nikpol' and supplier_id is null;
  update hardware_accessories set supplier_id = fw where brand = 'Furnware' and supplier_id is null;

  update hardware_slides set supplier_id = nk where brand in ('DTC', 'Nikpol') and supplier_id is null;
  update hardware_slides set supplier_id = ls where brand = 'Blum' and supplier_id is null;

  update hardware_handles h set supplier_id = s.id from suppliers s
   where s.name = h.brand and h.supplier_id is null;
end $$;
