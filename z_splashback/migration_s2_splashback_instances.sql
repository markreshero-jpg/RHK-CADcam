-- Splashback S2: the splashback pieces in a room. See SPLASHBACK-SPEC.md.
--
-- segments = Shape Editor outline in the wall ELEVATION frame of (wall_id,
-- wall_side): x = elevation x as seen on that side (back side mirrored),
-- y = height above the floor (up). Wall openings cut it live (L2), grown by
-- opening_reveal_mm. thickness_mm null = from the panel material.
--
-- Rollback: drop table if exists public.splashback_instances;

create table if not exists public.splashback_instances (
  id                     uuid primary key default gen_random_uuid(),
  room_id                uuid not null references public.rooms(id) on delete cascade,
  label                  text,
  wall_id                uuid not null references public.walls(id) on delete cascade,
  wall_side              text not null default 'face' check (wall_side in ('face', 'back')),
  segments               jsonb not null default '[]'::jsonb,
  cutouts                jsonb not null default '[]'::jsonb,
  offset_mm              numeric not null default 0,
  thickness_mm           numeric,
  opening_reveal_mm      numeric not null default 0,
  splashback_schedule_id uuid references public.splashback_schedules(id) on delete set null,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists splashback_instances_room_idx on public.splashback_instances(room_id);
create index if not exists splashback_instances_wall_idx on public.splashback_instances(wall_id);

alter table public.splashback_instances enable row level security;
drop policy if exists job_access on public.splashback_instances;
create policy job_access on public.splashback_instances for all
  using ((select public.is_admin()) or public.can_access_room(room_id))
  with check ((select public.is_admin()) or public.can_access_room(room_id));
