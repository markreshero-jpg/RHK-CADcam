-- Splashback S2 gaps: splashback edits count as room activity on the dashboard.
create or replace function public.room_last_activity()
 returns table(room_id uuid, last_at timestamp with time zone)
 language sql
 stable
 set search_path to 'public'
as $function$
  select room_id, max(t) as last_at from (
    select id as room_id, updated_at as t from rooms
    union all select room_id, max(updated_at) from cabinet_instances    group by room_id
    union all select room_id, max(updated_at) from room_annotations     group by room_id
    union all select room_id, max(updated_at) from benchtop_instances   group by room_id
    union all select room_id, max(updated_at) from room_fixtures        group by room_id
    union all select room_id, max(updated_at) from splashback_instances group by room_id
  ) x where room_id is not null group by room_id
$function$;
