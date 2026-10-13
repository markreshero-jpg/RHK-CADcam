-- z_cabinet_shape Phase 3b — hinges + drawer boxes on facet doors.
--
-- 1. hardware_hinges.mount_angle_deg: the angle the hinge is built for, as
--    (door ↔ mounting panel angle) − 90°. 0 = ordinary hinge, 45 = a +45°
--    angled hinge for a 135° corner. The resolver picks the hinge whose angle
--    matches the panel a facet door hangs on (decision 10).
-- 2. hinge_instances.facet / drawer_box_parts.facet: '' = primary front,
--    else the footprint edge id. The hinge identity key gains the facet.
-- 3. persist_resolved_cabinet: hinges merge by (facet, row, col, sort_order)
--    and link to the zone on the same facet.

alter table hardware_hinges add column if not exists mount_angle_deg numeric not null default 0;

alter table hinge_instances  add column if not exists facet text not null default '';
alter table drawer_box_parts add column if not exists facet text not null default '';

drop index if exists hinge_instances_identity_uniq;
create unique index hinge_instances_identity_uniq
  on public.hinge_instances (cabinet_instance_id, facet, row_index, col_index, sort_order);

create or replace function persist_resolved_cabinet(p_cab uuid, p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  cab jsonb := jsonb_build_object('cabinet_instance_id', p_cab);
begin
  -- Serialise concurrent saves of the same cabinet.
  perform 1 from cabinet_instances where id = p_cab for update;
  if not found then return; end if;

  delete from face_zones       where cabinet_instance_id = p_cab;
  delete from case_parts       where cabinet_instance_id = p_cab;
  delete from toekick_parts    where cabinet_instance_id = p_cab;
  delete from internal_parts   where cabinet_instance_id = p_cab;
  delete from drawer_box_parts where cabinet_instance_id = p_cab;
  delete from face_rows        where cabinet_instance_id = p_cab;
  delete from face_cols        where cabinet_instance_id = p_cab;

  perform _persist_rows('case_parts',       (select jsonb_agg(j.value || cab) from jsonb_array_elements(p->'case_parts') j));
  perform _persist_rows('toekick_parts',    (select jsonb_agg(j.value || cab) from jsonb_array_elements(p->'toekick_parts') j));
  perform _persist_rows('internal_parts',   (select jsonb_agg(j.value || cab) from jsonb_array_elements(p->'internal_parts') j));
  perform _persist_rows('drawer_box_parts', (select jsonb_agg(j.value || cab) from jsonb_array_elements(p->'drawer_box_parts') j));
  perform _persist_rows('face_rows',        (select jsonb_agg(j.value || cab) from jsonb_array_elements(p->'face_rows') j));
  perform _persist_rows('face_cols',        (select jsonb_agg(j.value || cab) from jsonb_array_elements(p->'face_cols') j));

  perform _persist_rows('face_zones', (
    select jsonb_agg(j.value || cab || jsonb_build_object('row_id', r.id, 'col_id', c.id))
      from jsonb_array_elements(p->'face_zones') j
      left join face_rows r on r.cabinet_instance_id = p_cab
                           and r.facet = coalesce(j.value->>'facet', '')
                           and r.row_index = (j.value->>'row_index')::int
      left join face_cols c on c.cabinet_instance_id = p_cab
                           and c.facet = coalesce(j.value->>'facet', '')
                           and c.col_index = (j.value->>'col_index')::int
  ));

  -- Hinges merge by stable identity (cabinet, facet, row, col, sort_order):
  -- fronts get fresh ids every save, so locked placements live on these rows.
  delete from hinge_instances h
   where h.cabinet_instance_id = p_cab
     and not exists (
       select 1 from jsonb_array_elements(coalesce(p->'hinges', '[]'::jsonb)) hj
        where coalesce(hj.value->>'facet', '') = h.facet
          and (hj.value->>'row_index')::int = h.row_index
          and (hj.value->>'col_index')::int = h.col_index
          and (hj.value->>'sort_order')::int = h.sort_order);

  insert into hinge_instances (
    cabinet_instance_id, facet, row_index, col_index, sort_order, face_zone_id,
    hinge_hardware_id, hinge_plate_id, hinge_edge, y_position_mm, y_locked,
    mounting_surface, shelf_snap_tolerance_mm,
    resolved_mounting_part_table, resolved_mounting_part_id)
  select p_cab, coalesce(hj.value->>'facet', ''), h.row_index, h.col_index, h.sort_order,
         (select z.id from face_zones z
           where z.cabinet_instance_id = p_cab and z.facet = coalesce(hj.value->>'facet', '')
             and z.row_index = h.row_index and z.col_index = h.col_index),
         h.hinge_hardware_id, h.hinge_plate_id, h.hinge_edge, h.y_position_mm, h.y_locked,
         h.mounting_surface, h.shelf_snap_tolerance_mm,
         case when m.id is null then null else hj.value->>'mount_table' end, m.id
    from jsonb_array_elements(coalesce(p->'hinges', '[]'::jsonb)) hj
    cross join lateral jsonb_populate_record(null::hinge_instances, hj.value) h
    left join lateral (
      select cp.id from case_parts cp
       where hj.value->>'mount_table' = 'case_parts'
         and cp.cabinet_instance_id = p_cab and cp.part_key = hj.value->>'mount_part_key'
      union all
      select ip.id from internal_parts ip
       where hj.value->>'mount_table' = 'internal_parts'
         and ip.cabinet_instance_id = p_cab
         and ip.part_type = hj.value->>'mount_internal_type'
         and ip.sort_order = (hj.value->>'mount_internal_sort')::int
      limit 1
    ) m on true
  on conflict (cabinet_instance_id, facet, row_index, col_index, sort_order) do update set
    face_zone_id                 = excluded.face_zone_id,
    hinge_hardware_id            = excluded.hinge_hardware_id,
    hinge_plate_id               = excluded.hinge_plate_id,
    hinge_edge                   = excluded.hinge_edge,
    y_position_mm                = excluded.y_position_mm,
    y_locked                     = excluded.y_locked,
    mounting_surface             = excluded.mounting_surface,
    shelf_snap_tolerance_mm      = excluded.shelf_snap_tolerance_mm,
    resolved_mounting_part_table = excluded.resolved_mounting_part_table,
    resolved_mounting_part_id    = excluded.resolved_mounting_part_id;

  update cabinet_instances set resolved_drawer_hw = p->'drawer_hw' where id = p_cab;
end $$;
