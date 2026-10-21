-- z_shop_drawings S8 stage 2: camera angles saved from the 3D view for the shop drawings.
-- [{ id, label, eye: [x,y,z], target: [x,y,z], hiddenWallIds: [uuid] }]
alter table public.rooms add column if not exists shop_3d_shots jsonb not null default '[]'::jsonb;
