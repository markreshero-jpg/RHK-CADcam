-- z_cad_layers L1 — named CAD layers (spec: z_cad_layers/CAD-LAYERS-SPEC.md).
--
-- cad_layers:     the shop-wide standard list (Settings → CAD Layers).
-- job_cad_layers: each job's own copy, made the first time the job opens. Shop edits
--                 never reach a job by themselves (Add from shop list does it).
-- room_annotations.cad_layer_id: the item's layer; null = the job's General layer.

create table if not exists cad_layers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  color       text not null default '#dc2626',
  visible     boolean not null default true,
  print       boolean not null default true,
  is_default  boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists cad_layers_one_default on cad_layers (is_default) where is_default;

alter table cad_layers enable row level security;
create policy library_read on cad_layers for select to authenticated using (true);
create policy admin_write  on cad_layers for all    to authenticated
  using ((select is_admin())) with check ((select is_admin()));

create table if not exists job_cad_layers (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  shop_layer_id uuid null references cad_layers(id) on delete set null,
  name          text not null,
  color         text not null default '#dc2626',
  visible       boolean not null default true,
  print         boolean not null default true,
  is_default    boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (project_id, shop_layer_id)
);

create index if not exists job_cad_layers_project_idx on job_cad_layers(project_id);
create unique index if not exists job_cad_layers_one_default on job_cad_layers (project_id) where is_default;

alter table job_cad_layers enable row level security;
create policy job_access on job_cad_layers for all to authenticated
  using      ((select is_admin()) or can_access_project(project_id))
  with check ((select is_admin()) or can_access_project(project_id));

alter table room_annotations
  add column if not exists cad_layer_id uuid null references job_cad_layers(id) on delete set null;

insert into cad_layers (name, color, visible, print, is_default, sort_order) values
  ('General',      '#dc2626', true, true,  true,  0),
  ('Electrical',   '#d97706', true, true,  false, 1),
  ('Plumbing',     '#2563eb', true, true,  false, 2),
  ('Gas',          '#16a34a', true, true,  false, 3),
  ('Site notes',   '#7c3aed', true, true,  false, 4),
  ('Construction', '#9ca3af', true, false, false, 5)
on conflict (name) do nothing;

comment on table cad_layers     is 'CAD layers shop list (z_cad_layers). Copied into each job on first open.';
comment on table job_cad_layers is 'A job''s CAD layers (z_cad_layers). On/off + colour + print are for the whole job.';
