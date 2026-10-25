-- z_item_cad IC2 — Hide item CAD on one placed cabinet (spec: z_item_cad/ITEM-CAD-SPEC.md).
-- Owner ids ('front_type:bin', 'cabinet_def:<id>') whose library notes this cabinet
-- doesn't draw. Detach = copy the notes onto the cabinet as its own + hide the owner.

alter table cabinet_instances add column if not exists item_cad_hidden text[] not null default '{}';

comment on column cabinet_instances.item_cad_hidden is 'Item CAD owners (kind:key) hidden on this cabinet (z_item_cad IC2).';
