-- Kick face + return grain (2026-10-28): rule TOEGRAIN, default vertical. Applied.
alter table toekick_parts add column if not exists grain_direction text check (grain_direction in ('horizontal', 'vertical'));
