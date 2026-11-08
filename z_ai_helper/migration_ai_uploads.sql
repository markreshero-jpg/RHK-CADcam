-- AI helper AI4 (z_ai_helper/AI-HELPER-SPEC.md): plans / site sketches attached in
-- the chat. Private bucket; files live under <project_id>/…, and only people who can
-- open that job (z_access_control can_access_project) can upload, read or remove them.
-- Uploading straight from the browser keeps big PDFs off the server route's body limit.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ai-uploads', 'ai-uploads', false, 20971520,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ai_uploads_job_read on storage.objects;
create policy ai_uploads_job_read on storage.objects for select to authenticated
  using (bucket_id = 'ai-uploads' and public.can_access_project(((storage.foldername(name))[1])::uuid));

drop policy if exists ai_uploads_job_insert on storage.objects;
create policy ai_uploads_job_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ai-uploads' and public.can_access_project(((storage.foldername(name))[1])::uuid));

drop policy if exists ai_uploads_job_delete on storage.objects;
create policy ai_uploads_job_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ai-uploads' and public.can_access_project(((storage.foldername(name))[1])::uuid));
