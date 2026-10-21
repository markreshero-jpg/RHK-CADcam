-- z_shop_drawings S1: company title block fields + logo bucket.

alter table public.shop_settings
  add column if not exists company_fax            text,
  add column if not exists company_logo_url       text,
  add column if not exists drawing_copyright      text,
  add column if not exists drawing_disclaimer     text    not null default 'Do not scale off this drawing.',
  add column if not exists drawing_signature_line boolean not null default true;

-- Storage: public read (logo is printed on every sheet), admin write.
-- Own policies so the shared models_admin_* policies stay untouched.
insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', true)
on conflict (id) do nothing;

drop policy if exists company_assets_public_read on storage.objects;
create policy company_assets_public_read on storage.objects
  for select using (bucket_id = 'company-assets');

drop policy if exists company_assets_admin_insert on storage.objects;
create policy company_assets_admin_insert on storage.objects for insert
  with check (bucket_id = 'company-assets' and (select public.is_admin()));

drop policy if exists company_assets_admin_update on storage.objects;
create policy company_assets_admin_update on storage.objects for update
  using (bucket_id = 'company-assets' and (select public.is_admin()));

drop policy if exists company_assets_admin_delete on storage.objects;
create policy company_assets_admin_delete on storage.objects for delete
  using (bucket_id = 'company-assets' and (select public.is_admin()));
