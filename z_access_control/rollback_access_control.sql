-- Rollback for migration_access_control.sql: back to "any login (and the anon
-- key) can read and write everything". Leaves user_roles / project_access in
-- place (harmless) so roles survive a re-apply.

do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
           where schemaname = 'public'
             and tablename not in ('allowed_emails', 'user_roles', 'project_access')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
  for p in select tablename from pg_tables
           where schemaname = 'public' and rowsecurity
             and tablename not in ('allowed_emails', 'user_roles', 'project_access')
  loop
    execute format('create policy authenticated_all on public.%I for all to authenticated using (true) with check (true)', p.tablename);
    execute format('create policy anon_all on public.%I for all to anon using (true) with check (true)', p.tablename);
  end loop;
end $$;

alter view public.v_nest_parts reset (security_invoker);

drop policy if exists models_admin_insert on storage.objects;
drop policy if exists models_admin_update on storage.objects;
drop policy if exists models_admin_delete on storage.objects;
create policy models_auth_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('hinge-models', 'slide-models'));
create policy models_auth_update on storage.objects for update to authenticated
  using (bucket_id in ('hinge-models', 'slide-models'));
create policy models_auth_delete on storage.objects for delete to authenticated
  using (bucket_id in ('hinge-models', 'slide-models'));
