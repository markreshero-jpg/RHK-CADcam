-- z_item_cad IC1 — CAD attached to library items (spec: z_item_cad/ITEM-CAD-SPEC.md).
--
-- library_cad:  the shop-wide item CAD, one row per owner + view. Items are CAD block
--               items (src/lib/annotations/blocks.ts) + an anchor, geometry in PAPER mm
--               from the anchor point, so they stay the same size on any item.
-- job_item_cad: the copy a job draws from (decision 4: library edits never change a job
--               already drawn; Update job refreshes it). Made the first time the job
--               draws that owner.
-- room_annotations: cabinet-sheet notes may now sit on the Top view as well.

create table if not exists library_cad (
  id          uuid primary key default gen_random_uuid(),
  -- 'front_type' (owner_key e.g. 'bin') | 'cabinet_def' (cabinet_definitions.id) | 'fixture_model' (later)
  owner_kind  text not null check (owner_kind in ('front_type', 'cabinet_def', 'fixture_model')),
  owner_key   text not null,
  view        text not null check (view in ('elevation', 'plan')),
  -- [{ kind, geom, text, style, anchor }] — geom in paper mm from the anchor point.
  items       jsonb not null default '[]'::jsonb,
  version     int  not null default 1,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_kind, owner_key, view)
);

alter table library_cad enable row level security;
create policy library_read on library_cad for select to authenticated using (true);
create policy admin_write  on library_cad for all    to authenticated
  using ((select is_admin())) with check ((select is_admin()));

create table if not exists job_item_cad (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  library_cad_id uuid not null references library_cad(id) on delete cascade,
  version        int  not null,
  items          jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (project_id, library_cad_id)
);

create index if not exists job_item_cad_project_idx on job_item_cad(project_id);

alter table job_item_cad enable row level security;
create policy job_access on job_item_cad for all to authenticated
  using      ((select is_admin()) or can_access_project(project_id))
  with check ((select is_admin()) or can_access_project(project_id));

alter table room_annotations drop constraint if exists room_annotations_sheet_view_check;
alter table room_annotations add constraint room_annotations_sheet_view_check
  check (sheet_view in ('front', 'side', 'top'));

comment on table library_cad  is 'Item CAD (z_item_cad): CAD notes owned by a library item (front type / cabinet definition / fixture model). Paper mm from an anchor.';
comment on table job_item_cad is 'Item CAD pinned to a job (z_item_cad decision 4). Copied from library_cad on first use; refreshed only by Update job.';
