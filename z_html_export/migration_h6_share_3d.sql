-- z_html_export H6: share links. Each shared room 3D is uploaded to the public
-- bucket `share-3d` at <roomId>/<token>/{model.glb, model.usdz, meta.json}.
-- The token is a random UUID, so a link can't be guessed. There is no select
-- policy: the public URL serves a file to anyone holding its link, but nobody can
-- list the bucket. Upload = anyone who can access the room; delete = admin.
insert into storage.buckets (id, name, public, file_size_limit)
values ('share-3d', 'share-3d', true, 104857600)
on conflict (id) do nothing;

drop policy if exists share_3d_room_insert on storage.objects;
create policy share_3d_room_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'share-3d'
    and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then public.can_access_room(((storage.foldername(name))[1])::uuid)
             else false end
  );
drop policy if exists share_3d_admin_delete on storage.objects;
create policy share_3d_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'share-3d' and (select public.is_admin()));
