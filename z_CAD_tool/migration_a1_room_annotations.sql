-- z_CAD_tool A1 — room_annotations (CAD markup: text, text boxes, leaders, lines,
-- boxes, ellipses, clouds, manual dims) + the room's annotation scale.
-- Spec: z_CAD_tool/ANNOTATION-SPEC.md. Applied live as migration `cad_a1_room_annotations`.

create table if not exists room_annotations (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete cascade,
  view        text not null check (view in ('plan', 'elevation', 'cabinet_sheet')),
  wall_id     uuid references walls(id) on delete cascade,
  cabinet_id  uuid references cabinet_instances(id) on delete cascade,
  sheet_view  text check (sheet_view in ('front', 'side')),
  kind        text not null check (kind in ('text', 'line', 'rect', 'ellipse', 'cloud', 'dim')),
  geom        jsonb not null default '{}'::jsonb,
  text        text,
  style       jsonb not null default '{}'::jsonb,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint room_annotations_owner check (
    (view = 'plan'          and wall_id is null     and cabinet_id is null     and sheet_view is null) or
    (view = 'elevation'     and wall_id is not null and cabinet_id is null     and sheet_view is null) or
    (view = 'cabinet_sheet' and wall_id is null     and cabinet_id is not null and sheet_view is not null)
  )
);

create index if not exists room_annotations_room_idx on room_annotations(room_id);

alter table room_annotations enable row level security;
create policy job_access on room_annotations for all to authenticated
  using      ((select is_admin()) or can_access_room(room_id))
  with check ((select is_admin()) or can_access_room(room_id));

comment on table  room_annotations       is 'CAD markup printed on shop drawings (z_CAD_tool). Paper-only: never feeds parts / nest / G-code.';
comment on column room_annotations.geom  is 'Real mm in the view frame (plan: room mm; elevation: wall u/z; sheet: cabinet-local).';
comment on column room_annotations.style is 'Sizes in paper mm + colours; missing keys use defaults (src/lib/annotations/style.ts).';

alter table rooms add column if not exists annotation_scale numeric not null default 20;
comment on column rooms.annotation_scale is 'CAD annotations: canvas previews paper-mm sizes at 1:this (z_CAD_tool decision 5).';
