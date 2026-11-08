-- Dashboard "Recently worked on": latest edit per room across what the canvas
-- writes (cabinets, CAD annotations, benchtops, fixtures) plus the room itself.
-- security invoker → RLS applies as the signed-in user.
create or replace function public.room_last_activity()
returns table (room_id uuid, last_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select room_id, max(t) as last_at from (
    select id as room_id, updated_at as t from rooms
    union all select room_id, max(updated_at) from cabinet_instances  group by room_id
    union all select room_id, max(updated_at) from room_annotations   group by room_id
    union all select room_id, max(updated_at) from benchtop_instances group by room_id
    union all select room_id, max(updated_at) from room_fixtures      group by room_id
  ) x where room_id is not null group by room_id
$$;
revoke execute on function public.room_last_activity() from anon, public;
grant execute on function public.room_last_activity() to authenticated;
