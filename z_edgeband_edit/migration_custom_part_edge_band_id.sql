-- Applied 2026-11-08. A custom part can name its own tape (38 wide on 33 glued-up panels, RHK6586). Null = tape borrowed from its board, as before.
alter table public.cabinet_custom_parts add column if not exists edge_band_id uuid references public.edge_banding(id) on delete set null;
