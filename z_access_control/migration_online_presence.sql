-- online_presence — Settings → Users "Online" column (Phase 3).
-- Every signed-in tab joins the private Realtime channel `online-users` and
-- tracks {email, path}. Private channels are authorised by RLS on
-- realtime.messages: any login may read + write presence on that one topic
-- (joining needs read, tracking needs write). No anon access.

create policy "online_presence_read" on realtime.messages
  for select to authenticated
  using (realtime.topic() = 'online-users' and extension = 'presence');

create policy "online_presence_write" on realtime.messages
  for insert to authenticated
  with check (realtime.topic() = 'online-users' and extension = 'presence');

-- Rollback:
-- drop policy "online_presence_read"  on realtime.messages;
-- drop policy "online_presence_write" on realtime.messages;
