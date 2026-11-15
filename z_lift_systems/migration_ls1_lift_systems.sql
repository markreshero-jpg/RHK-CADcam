-- z_lift_systems LS1 (2026-11-14): lift system hardware library (Blum Aventos).
-- One row per orderable Lincoln Sentry line. supplier_code = LS product code
-- (what we order with), maker_code = Blum code (what Blum's docs use).
-- Mechanism rows carry the sizing ranges; `companions` lists the other LS lines
-- that go with one mechanism row ([{id, qty}]; per front = qty × qty_per_front), so the hardware list can print
-- every line. Cost 0 for now: prices come from the LS price list via RHKCRM.

create table if not exists hardware_lift_systems (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  brand          text default 'Blum',
  family         text not null default 'hk_top'
                 check (family in ('hk_top', 'hk_s', 'hk_xs', 'hf_top', 'hl_top', 'hs_top', 'hki', 'other')),
  role           text not null default 'mechanism'
                 check (role in ('mechanism', 'lever_arm', 'front_bracket', 'cabinet_fixing', 'cover_cap',
                                 'tip_on', 'opening_stop', 'hinge', 'servo', 'other')),
  supplier_code  text,            -- Lincoln Sentry product code
  maker_code     text,            -- Blum code
  lf_min         numeric,         -- power factor range (KH mm x front kg, handle x2)
  lf_max         numeric,
  kh_min         numeric,         -- cabinet height range (lever arms, family limits)
  kh_max         numeric,
  kb_max         numeric,         -- max cabinet width
  max_front_kg   numeric,
  tip_on         boolean not null default false,
  fixing         text check (fixing in ('chipboard', 'system', 'screw_on', 'edowel', 'expando', 'expando_t')),
  colour         text,            -- finish name (Silk white / Dark grey …)
  qty_per_front  numeric not null default 1,   -- sets per front (HK-XS mechanisms are each: 2)
  companions     jsonb not null default '[]'::jsonb,
  cost_per_unit  numeric not null default 0,
  is_default     boolean not null default false,
  active         boolean not null default true,
  notes          text,
  model_url      text,
  model_format   text,
  model_scale    numeric not null default 1,
  created_at     timestamptz not null default now()
);

alter table hardware_lift_systems enable row level security;
drop policy if exists library_read on hardware_lift_systems;
create policy library_read on hardware_lift_systems for select to authenticated using (true);
drop policy if exists admin_write on hardware_lift_systems;
create policy admin_write on hardware_lift_systems for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));

-- Models bucket (own policies so the shared models_admin_* ones stay untouched).
insert into storage.buckets (id, name, public) values ('lift-models', 'lift-models', true)
on conflict (id) do nothing;
drop policy if exists lift_models_public_read on storage.objects;
create policy lift_models_public_read on storage.objects for select using (bucket_id = 'lift-models');
drop policy if exists lift_models_admin_insert on storage.objects;
create policy lift_models_admin_insert on storage.objects for insert
  with check (bucket_id = 'lift-models' and (select public.is_admin()));
drop policy if exists lift_models_admin_update on storage.objects;
create policy lift_models_admin_update on storage.objects for update
  using (bucket_id = 'lift-models' and (select public.is_admin()));
drop policy if exists lift_models_admin_delete on storage.objects;
create policy lift_models_admin_delete on storage.objects for delete
  using (bucket_id = 'lift-models' and (select public.is_admin()));

-- ── Seed (LS codes checked against the LS price list 2026-08-27) ──────────────
do $$
begin
  if exists (select 1 from hardware_lift_systems) then return; end if;

  insert into hardware_lift_systems
    (family, role, supplier_code, maker_code, name, lf_min, lf_max, kh_min, kh_max, kb_max, max_front_kg, tip_on, fixing, colour, qty_per_front, notes)
  values
  -- HK top
  ('hk_top','mechanism','7102412','22K2300','HK top lift set 420-1610 chipboard', 420,1610, 205,600,1800,18, false,'chipboard',null,1,null),
  ('hk_top','mechanism','7102413','22K2310','HK top lift set 420-1610 system screw', 420,1610, 205,600,1800,18, false,'system',null,1,null),
  ('hk_top','mechanism','7102414','22K2500','HK top lift set 930-2800 chipboard', 930,2800, 205,600,1800,18, false,'chipboard',null,1,null),
  ('hk_top','mechanism','7102415','22K2510','HK top lift set 930-2800 system screw', 930,2800, 205,600,1800,18, false,'system',null,1,null),
  ('hk_top','mechanism','7102416','22K2700','HK top lift set 1730-5200 chipboard', 1730,5200, 205,600,1800,18, false,'chipboard',null,1,null),
  ('hk_top','mechanism','7102417','22K2710','HK top lift set 1730-5200 system screw', 1730,5200, 205,600,1800,18, false,'system',null,1,null),
  ('hk_top','mechanism','7102418','22K2900','HK top lift set 3200-9000 chipboard', 3200,9000, 205,600,1800,18, false,'chipboard',null,1,null),
  ('hk_top','mechanism','7102419','22K2910','HK top lift set 3200-9000 system screw', 3200,9000, 205,600,1800,18, false,'system',null,1,null),
  ('hk_top','mechanism','7102442','22K2300T','HK top TIP-ON lift set 420-1610', 420,1610, 205,600,1800,18, true,'chipboard',null,1,null),
  ('hk_top','mechanism','7102443','22K2500T','HK top TIP-ON lift set 930-2800', 930,2800, 205,600,1800,18, true,'chipboard',null,1,null),
  ('hk_top','mechanism','7102444','22K2700T','HK top TIP-ON lift set 1730-5200', 1730,5200, 205,600,1800,18, true,'chipboard',null,1,null),
  ('hk_top','mechanism','7102445','22K2900T','HK top TIP-ON lift set 3200-9000', 3200,9000, 205,600,1800,18, true,'chipboard',null,1,null),
  ('hk_top','cover_cap','7102378','22K8000','HK top cover cap set grey', null,null,null,null,null,null, false,null,'Light grey',1,null),
  ('hk_top','cover_cap','7102379','22K8000','HK top cover cap set white', null,null,null,null,null,null, false,null,'Silk white',1,null),
  ('hk_top','cover_cap','7102380','22K8000','HK top cover cap set dark grey', null,null,null,null,null,null, false,null,'Dark grey',1,null),
  ('hk_top','front_bracket','7102343','20S42E1','Aventos front bracket E-dowel (HK/HS/HL top)', null,null,null,null,null,null, false,'edowel',null,1,'Timber fronts. Shared with HF / HS / HL top.'),
  ('hk_top','front_bracket','7102344','20S42T1','Aventos front fix EXPANDO T (HK/HS/HL top)', null,null,null,null,null,null, false,'expando_t',null,1,'Thin fronts (8 mm +)'),
  ('hk_top','front_bracket','7115588','20S4200','Aventos front fixing screw-on (HK/HS/HL top)', null,null,null,null,null,null, false,'screw_on',null,1,'LS describes it as aluminium frame — check before using on timber'),
  ('hk_top','servo','7102420','23KA000','HK top SERVO-DRIVE unit', null,null,null,null,null,null, false,null,null,1,null),
  ('hk_top','servo','7102421','23K8000','HK top SERVO-DRIVE cover caps light grey', null,null,null,null,null,null, false,null,'Light grey',1,null),
  ('hk_top','servo','7102422','23K8000','HK top SERVO-DRIVE cover caps dark grey', null,null,null,null,null,null, false,null,'Dark grey',1,null),
  ('hk_top','servo','7102423','23K8000','HK top SERVO-DRIVE cover caps silk white', null,null,null,null,null,null, false,null,'Silk white',1,null),
  ('hk_top','opening_stop','7102339',null,'HK opening stop 100°', null,null,null,null,null,null, false,null,null,1,null),
  -- HK-S
  ('hk_s','mechanism','7102359','20K2B00.06','HK-S lift mech 220-500', 220,500, null,600,null,null, false,null,'Silk white',1,null),
  ('hk_s','mechanism','7102361','20K2C00.06','HK-S lift mech 400-1000', 400,1000, null,600,null,null, false,null,'Silk white',1,null),
  ('hk_s','mechanism','7102363','20K2E00.06','HK-S lift mech 960-2040', 960,2040, null,600,null,null, false,null,'Silk white',1,'LS 2040; Blum 2024 catalogue says 2215'),
  ('hk_s','mechanism','7102437','20K2B00T','HK-S TIP-ON lift mech 220-500', 220,500, null,600,null,null, true,null,'Silk white',1,null),
  ('hk_s','mechanism','7102439','20K2C00T','HK-S TIP-ON lift mech 400-1000', 400,1000, null,600,null,null, true,null,'Silk white',1,null),
  ('hk_s','mechanism','7102441','20K2E00T','HK-S TIP-ON lift mech 960-2040', 960,2040, null,600,null,null, true,null,'Silk white',1,'LS 2040; Blum 2024 catalogue says 2215'),
  ('hk_s','opening_stop','7102336','20K7A11','HK-S opening stop 75°', null,null,null,null,null,null, false,null,null,1,null),
  ('hk_s','opening_stop','7102340','20K7A41','HK-S opening stop 100°', null,null,null,null,null,null, false,null,null,1,null),
  ('hk_s','tip_on','7102280','956.1004','TIP-ON for doors 50 adjustable, silk white', null,null,null,null,null,null, true,null,'Silk white',1,null),
  ('hk_s','tip_on','7102282','956A1004','TIP-ON for doors 75 adjustable, silk white', null,null,null,null,null,null, true,null,'Silk white',1,null),
  ('hk_s','tip_on','7113519','956.1004','TIP-ON for doors 50 adjustable, carbon black', null,null,null,null,null,null, true,null,'Carbon black',1,null),
  ('hk_s','tip_on','7113520','956A1004','TIP-ON for doors 75 adjustable, carbon black', null,null,null,null,null,null, true,null,'Carbon black',1,null),
  -- HK-XS (mechanisms are each: 2 per front; needs hinges from the Hinges tab)
  ('hk_xs','mechanism','7102355','20K1101','HK-XS lift mech 200-1000', 200,1000, 240,600,null,null, false,null,null,2,'Each. Sprung hinges: 3 from KB 900 / LF 1800, 4 from KB 1200 / LF 2700'),
  ('hk_xs','mechanism','7102356','20K1301','HK-XS lift mech 500-1500', 500,1500, 240,600,null,null, false,null,null,2,'Each. Sprung hinges: 3 from KB 900 / LF 1800, 4 from KB 1200 / LF 2700'),
  ('hk_xs','mechanism','7102357','20K1501','HK-XS lift mech 800-1800', 800,1800, 240,600,null,null, false,null,null,2,'Each. Sprung hinges: 3 from KB 900 / LF 1800, 4 from KB 1200 / LF 2700'),
  ('hk_xs','mechanism','7102433','20K1101T','HK-XS TIP-ON mech 180-800', 180,800, 240,600,null,null, true,null,null,2,'Each. Unsprung hinges + TIP-ON'),
  ('hk_xs','mechanism','7102434','20K1301T','HK-XS TIP-ON mech 500-1200', 500,1200, 240,600,null,null, true,null,null,2,'Each. Unsprung hinges + TIP-ON'),
  ('hk_xs','mechanism','7102435','20K1501T','HK-XS TIP-ON mech 800-1600', 800,1600, 240,600,null,null, true,null,null,2,'Each. Unsprung hinges + TIP-ON'),
  ('hk_xs','cabinet_fixing','7102352','20K5101','HK-XS cabinet fixing screw-on', null,null,null,null,null,null, false,'screw_on',null,1,null),
  ('hk_xs','cabinet_fixing','7102354','20K51E1','HK-XS cabinet fixing EXPANDO', null,null,null,null,null,null, false,'expando',null,1,null),
  ('hk_xs','front_bracket','7102351','20K4101','HK-XS front fixing screw-on', null,null,null,null,null,null, false,'screw_on',null,1,'1 per mechanism. Assumed also for HK-S — confirm'),
  ('hk_xs','front_bracket','7102353','20K41E1','HK-XS front fixing EXPANDO', null,null,null,null,null,null, false,'expando',null,1,null),
  -- HF top (bi-fold)
  ('hf_top','mechanism','7115589','22F2500','HF top lift set 2700-13500 chipboard', 2700,13500, 480,1200,1800,null, false,'chipboard',null,1,'FG = both fronts + handles. Asymmetric: KH = upper front x 2 + gaps, taller front on top'),
  ('hf_top','mechanism','7115591','22F2510','HF top lift set 2700-13500 system screw', 2700,13500, 480,1200,1800,null, false,'system',null,1,null),
  ('hf_top','mechanism','7115590','22F2800','HF top lift set 10000-19300 chipboard', 10000,19300, 480,1200,1800,null, false,'chipboard',null,1,'LS says 19500, Blum 19300'),
  ('hf_top','mechanism','7115592','22F2810','HF top lift set 10000-19300 system screw', 10000,19300, 480,1200,1800,null, false,'system',null,1,'LS says 19500, Blum 19300'),
  ('hf_top','lever_arm','7115593','22F3200','HF top lever arm set KH 480-610', null,null, 480,610,null,null, false,null,null,1,null),
  ('hf_top','lever_arm','7115594','22F3500','HF top lever arm set KH 600-910', null,null, 600,910,null,null, false,null,null,1,null),
  ('hf_top','lever_arm','7115595','22F3900','HF top lever arm set KH 840-1200', null,null, 840,1200,null,null, false,null,null,1,null),
  ('hf_top','cover_cap','7115613','22.8000','HF/HL/HS top cover cap set light grey', null,null,null,null,null,null, false,null,'Light grey',1,null),
  ('hf_top','cover_cap','7115614','22.8000','HF/HL/HS top cover cap set silk white', null,null,null,null,null,null, false,null,'Silk white',1,null),
  ('hf_top','cover_cap','7115615','22.8000','HF/HL/HS top cover cap set dark grey', null,null,null,null,null,null, false,null,'Dark grey',1,null),
  ('hf_top','hinge','7102242','78Z550','Aventos CLIP top hinge set screw-on / E-dowel', null,null,null,null,null,null, false,'screw_on',null,1,null),
  ('hf_top','hinge','7102243','78Z553','Aventos CLIP top hinge set INSERTA / E-dowel', null,null,null,null,null,null, false,'edowel',null,1,null),
  ('hf_top','hinge','7115973','78Z553ET11','Aventos HF CLIP top hinge set EXPANDO', null,null,null,null,null,null, false,'expando',null,1,null),
  ('hf_top','hinge','7102244','78Z553E','Aventos CLIP top centre hinge E-dowel', null,null,null,null,null,null, false,'edowel',null,1,'Extra centre hinge for wide fronts'),
  ('hf_top','servo','7115616','23.A000','HF/HL/HS top SERVO-DRIVE unit', null,null,null,null,null,null, false,null,null,1,null),
  ('hf_top','servo','7115617','23.8000','HF/HL/HS top SERVO-DRIVE cover caps light grey', null,null,null,null,null,null, false,null,'Light grey',1,null),
  ('hf_top','servo','7115618','23.8000','HF/HL/HS top SERVO-DRIVE cover caps silk white', null,null,null,null,null,null, false,null,'Silk white',1,null),
  ('hf_top','servo','7115619','23.8000','HF/HL/HS top SERVO-DRIVE cover caps dark grey', null,null,null,null,null,null, false,null,'Dark grey',1,null);

  update hardware_lift_systems set brand = 'Blum';

  -- Companions: what goes with one set on one front.
  -- HK top: E-dowel front bracket set + white cover caps.
  update hardware_lift_systems m set companions = jsonb_build_array(
      jsonb_build_object('id', (select id from hardware_lift_systems where supplier_code = '7102343'), 'qty', 1),
      jsonb_build_object('id', (select id from hardware_lift_systems where supplier_code = '7102379'), 'qty', 1))
   where m.family = 'hk_top' and m.role = 'mechanism';
  -- HK-S: front fixings x2; TIP-ON versions add a TIP-ON 50 unit.
  update hardware_lift_systems m set companions = jsonb_build_array(
      jsonb_build_object('id', (select id from hardware_lift_systems where supplier_code = '7102351'), 'qty', 2))
   where m.family = 'hk_s' and m.role = 'mechanism' and not m.tip_on;
  update hardware_lift_systems m set companions = jsonb_build_array(
      jsonb_build_object('id', (select id from hardware_lift_systems where supplier_code = '7102351'), 'qty', 2),
      jsonb_build_object('id', (select id from hardware_lift_systems where supplier_code = '7102280'), 'qty', 1))
   where m.family = 'hk_s' and m.role = 'mechanism' and m.tip_on;
  -- HK-XS: per mechanism (qty_per_front 2) one cabinet fixing + one front fixing.
  update hardware_lift_systems m set companions = jsonb_build_array(
      jsonb_build_object('id', (select id from hardware_lift_systems where supplier_code = '7102352'), 'qty', 1),
      jsonb_build_object('id', (select id from hardware_lift_systems where supplier_code = '7102351'), 'qty', 1))
   where m.family = 'hk_xs' and m.role = 'mechanism';
  -- HF top: white cover caps. The lever arm set is picked by cabinet height
  -- (LS2); the arm mounts on 177H3100 hinge plates (Hinges tab); CLIP top
  -- hinges per front width.
  update hardware_lift_systems m set companions = jsonb_build_array(
      jsonb_build_object('id', (select id from hardware_lift_systems where supplier_code = '7115614'), 'qty', 1))
   where m.family = 'hf_top' and m.role = 'mechanism';
end $$;

-- LS1b: cost may be blank (unpriced), like the other hardware tables.
alter table hardware_lift_systems alter column cost_per_unit drop not null;
