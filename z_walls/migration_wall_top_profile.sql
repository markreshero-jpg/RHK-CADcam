-- Raked / vaulted wall tops (2026-10-31, RHK9999 BBQ wall: 2614 at the left rising to 3900).
-- Points along the wall: [{ t: mm from the wall start, h: height mm }, ...]; null = flat at walls.height.
-- walls.height is kept at the highest point. Helper: src/lib/wallProfile.ts.
alter table public.walls add column if not exists top_profile jsonb;
comment on column public.walls.top_profile is
  'Raked/vaulted top: [{t, h}] along the wall (t mm from start, h mm height), straight between points, flat past the ends. Null = flat.';
