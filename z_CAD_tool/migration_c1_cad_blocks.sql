-- z_CAD_tool C1 — shop-wide CAD blocks (saved groups of annotations, e.g. the
-- finishes spec block, a north arrow). Items are stored in PAPER mm relative to
-- the block's top-left so a block drops in at any annotation scale.
-- Spec: z_CAD_tool/ANNOTATION-SPEC.md "CAD blocks + live fields".

create table if not exists cad_blocks (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  -- [{ kind, geom, text, style }] — geom in paper mm from the block's top-left.
  items       jsonb not null default '[]'::jsonb,
  sort_order  int  not null default 0,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table cad_blocks enable row level security;
create policy library_read on cad_blocks for select to authenticated using (true);
create policy admin_write  on cad_blocks for all    to authenticated
  using ((select is_admin())) with check ((select is_admin()));

comment on table cad_blocks is 'Shop-wide CAD blocks (z_CAD_tool C1). Items in paper mm from the top-left; text may hold live {field} tokens.';
