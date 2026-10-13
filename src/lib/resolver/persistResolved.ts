// Writes a ResolvedCabinet to Supabase in one transactional RPC: deletes all
// existing parts for the cabinet then re-inserts.

import { supabase } from '@/src/lib/supabase'
import { ResolvedCabinet } from './types'

// Per-cabinet serialization. persistResolved does a delete-then-insert across
// several tables; two overlapping calls for the SAME cabinet race (one deletes
// the rows the other just inserted), which surfaces as duplicate-key / FK errors
// on face_rows/cols/zones and the hinge upsert. Chaining calls per cabinet makes
// them run one-after-another instead of concurrently.
const persistLocks = new Map<string, Promise<void>>()

export function persistResolved(resolved: ResolvedCabinet): Promise<void> {
  const cabId = resolved.cabinet_id
  const prev = persistLocks.get(cabId) ?? Promise.resolve()
  const run = prev.catch(() => {}).then(() => doPersistResolved(resolved))
  // Tail of the chain: clears the lock once settled, unless a newer call has
  // already chained after it.
  const tracked: Promise<void> = run.catch(() => {}).finally(() => {
    if (persistLocks.get(cabId) === tracked) persistLocks.delete(cabId)
  })
  persistLocks.set(cabId, tracked)
  return run
}

async function doPersistResolved(resolved: ResolvedCabinet): Promise<void> {
  // One transactional RPC (z_resolver_persist/migration_atomic_persist.sql):
  // delete + re-insert every part table, link zones to rows/cols, merge hinges
  // and store the drawer hardware. An interrupted save leaves the previous rows
  // intact — the old client-side delete-then-insert waves could leave a carcase
  // with no fronts.
  const { error } = await supabase.rpc('persist_resolved_cabinet', {
    p_cab: resolved.cabinet_id,
    p:     buildPersistPayload(resolved),
  })
  if (error) throw new Error(`persist_resolved_cabinet: ${error.message}`)
}

// Row objects keyed by column name; cabinet_instance_id is filled in server-side.
export function buildPersistPayload(resolved: ResolvedCabinet) {
  return {
    case_parts: resolved.case_parts.map(p => ({
      part_key:        p.part_key,
      dx: p.DX, dy: p.DY, dz: p.DZ,
      x:  p.X,  y:  p.Y,  z:  p.Z,
      ax: p.AX, ay: p.AY, az: p.AZ,
      material_id:       p.material_id,
      edge_band_top:     p.edge_band.top,
      edge_band_bottom:  p.edge_band.bottom,
      edge_band_left:    p.edge_band.left,
      edge_band_right:   p.edge_band.right,
      edge_band_id:      p.edge_band.id ?? null,
      rule_overrides:    {},
      nest_priority:     0,
      output_to_cnc:     true,
      outline:           p.outline ?? null,
    })),
    toekick_parts: resolved.toekick_parts.map(p => ({
      part_key:        p.part_key,
      sort_order:      p.sort_order,
      dx: p.DX, dy: p.DY, dz: p.DZ,
      x:  p.X,  y:  p.Y,  z:  p.Z,
      ax: p.AX, ay: p.AY, az: p.AZ,
      material_id:       p.material_id,
      edge_band_top:     p.edge_band.top,
      edge_band_bottom:  p.edge_band.bottom,
      edge_band_left:    p.edge_band.left,
      edge_band_right:   p.edge_band.right,
      edge_band_id:      p.edge_band.id ?? null,
      rule_overrides:    {},
      output_to_cnc:     true,
      is_detached:       p.is_detached,
    })),
    internal_parts: resolved.internal_parts.map(p => ({
      part_type:       p.part_type,
      sort_order:      p.sort_order,
      dx: p.DX, dy: p.DY, dz: p.DZ,
      x:  p.X,  y:  p.Y,  z:  p.Z,
      ax: p.AX, ay: p.AY, az: p.AZ,
      y_locked:          p.y_locked,
      material_id:       p.material_id,
      edge_band_front:   p.edge_band.right,  // front DY edge = right in cabinet space
      edge_band_top:     p.edge_band.top,
      edge_band_bottom:  p.edge_band.bottom,
      edge_band_back:    p.edge_band.left,
      edge_band_id:      p.edge_band.id ?? null,
      rule_overrides:    {},
      output_to_cnc:     true,
      outline:           p.outline ?? null,
    })),
    // Cuttable box panels, one row per panel per stack, keyed by (face_zone
    // row/col, part_type) so part_operations can attach.
    drawer_box_parts: resolved.drawer_stacks.flatMap(stack =>
      stack.box_parts.map(p => ({
        face_zone_row: stack.face_zone_row,
        face_zone_col: stack.face_zone_col,
        part_type:     p.part_type,
        dx: p.DX, dy: p.DY, dz: p.DZ,
        x:  p.X,  y:  p.Y,  z:  p.Z,
        ax: p.AX, ay: p.AY, az: p.AZ,
        material_id:      p.material_id,
        edge_band_top:    p.edge_band.top,
        edge_band_bottom: p.edge_band.bottom,
        edge_band_left:   p.edge_band.left,
        edge_band_right:  p.edge_band.right,
        edge_band_id:     p.edge_band.id ?? null,
        output_to_cnc:    true,
      }))),
    // A shaped cabinet's facets each have their own rows/cols.
    face_rows: resolved.face_rows.map(r => ({
      facet:         r.facet ?? '',
      row_index:     r.row_index,
      height:        r.height,
      height_locked: r.height_locked,
    })),
    face_cols: resolved.face_cols.map(c => ({
      facet:         c.facet ?? '',
      col_index:     c.col_index,
      width:         c.width,
      width_locked:  c.width_locked,
    })),
    // row_id / col_id are linked server-side by (facet, index).
    face_zones: resolved.face_zones.map(z => ({
      facet:         z.facet ?? '',
      row_index:     z.row_index,
      col_index:     z.col_index,
      face_type:     z.face_type,
      dx: z.DX, dy: z.DY, dz: z.DZ,
      x:  z.X,  y:  z.Y,  z:  z.Z,
      ax: z.AX, ay: z.AY, az: z.AZ,
      bevel_l:           z.bevel_l ?? null,
      bevel_r:           z.bevel_r ?? null,
      hinge_side:        z.hinge_side ?? null,
      material_id:       z.material_id,
      edge_band_top:     z.edge_band.top,
      edge_band_bottom:  z.edge_band.bottom,
      edge_band_left:    z.edge_band.left,
      edge_band_right:   z.edge_band.right,
      edge_band_id:      z.edge_band.id ?? null,
      drawerbox_overrides: {},
      rule_overrides:    {},
      output_to_cnc:     true,
      // Resolved door style output (for rendering / reports)
      door_style_id:     z.door_style_id ?? null,
      door_profile_id:   z.door_profile_id ?? null,
      door_profile:      z.door_profile ?? null,
    })),
    // Hinges merge by stable identity (cabinet, row, col, sort_order) — fronts
    // get fresh ids every save. The zone and mounting part ids are looked up
    // server-side from the mount keys; hinges only exist on the primary facet.
    hinges: resolved.hinge_instances.map(h => ({
      row_index:               h.row_index,
      col_index:               h.col_index,
      sort_order:              h.sort_order,
      hinge_hardware_id:       h.hinge_hardware_id,
      hinge_plate_id:          h.hinge_plate_id,
      hinge_edge:              h.hinge_edge,
      y_position_mm:           h.y_position_mm,
      y_locked:                h.y_locked,
      mounting_surface:        h.mounting_surface,
      shelf_snap_tolerance_mm: h.shelf_snap_tolerance_mm,
      mount_table:             h.mount_target?.table ?? null,
      mount_part_key:          h.mount_target?.part_key ?? null,
      mount_internal_type:     h.mount_target?.internal_part_type ?? null,
      mount_internal_sort:     h.mount_target?.internal_sort_order ?? null,
    })),
    // Computed drawer hardware, so the room loads it without re-resolving
    // (dbLoadResolvedParts reads cabinet_instances.resolved_drawer_hw).
    drawer_hw: {
      drawer_stacks:   resolved.drawer_stacks,
      internal_slides: resolved.internal_slides,
    },
  }
}
