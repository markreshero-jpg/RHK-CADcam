// Writes a ResolvedCabinet to Supabase.
// Deletes all existing parts for the cabinet then re-inserts.

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
  const cabId = resolved.cabinet_id

  // Delete existing parts (order matters for FKs: zones before rows/cols)
  await supabase.from('face_zones').delete().eq('cabinet_instance_id', cabId)
  await Promise.all([
    supabase.from('case_parts').delete().eq('cabinet_instance_id', cabId),
    supabase.from('toekick_parts').delete().eq('cabinet_instance_id', cabId),
    supabase.from('internal_parts').delete().eq('cabinet_instance_id', cabId),
    supabase.from('drawer_box_parts').delete().eq('cabinet_instance_id', cabId),
    supabase.from('face_rows').delete().eq('cabinet_instance_id', cabId),
    supabase.from('face_cols').delete().eq('cabinet_instance_id', cabId),
  ])

  // Insert case parts — capture ids by part_key for hinge mount resolution
  const caseIdByKey = new Map<string, string>()
  if (resolved.case_parts.length > 0) {
    const { data: insertedCase, error } = await supabase.from('case_parts').insert(
      resolved.case_parts.map(p => ({
        cabinet_instance_id: cabId,
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
      }))
    ).select('id, part_key')
    if (error) console.error('persistResolved case_parts:', error)
    for (const c of (insertedCase ?? []) as { id: string; part_key: string }[]) caseIdByKey.set(c.part_key, c.id)
  }

  // Insert toekick parts
  if (resolved.toekick_parts.length > 0) {
    const { error } = await supabase.from('toekick_parts').insert(
      resolved.toekick_parts.map(p => ({
        cabinet_instance_id: cabId,
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
      }))
    )
    if (error) console.error('persistResolved toekick_parts:', error)
  }

  // Insert internal parts — capture ids by (part_type, sort_order) for hinge mounts
  const internalIdByKey = new Map<string, string>()
  if (resolved.internal_parts.length > 0) {
    const { data: insertedInternal, error } = await supabase.from('internal_parts').insert(
      resolved.internal_parts.map(p => ({
        cabinet_instance_id: cabId,
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
      }))
    ).select('id, part_type, sort_order')
    if (error) console.error('persistResolved internal_parts:', error)
    for (const p of (insertedInternal ?? []) as { id: string; part_type: string; sort_order: number }[]) {
      internalIdByKey.set(`${p.part_type}:${p.sort_order}`, p.id)
    }
  }

  // Insert drawer box parts — cuttable box panels, one row per panel per stack,
  // keyed by (face_zone row/col, part_type) so part_operations can attach.
  const boxRows = resolved.drawer_stacks.flatMap(stack =>
    stack.box_parts.map(p => ({
      cabinet_instance_id: cabId,
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
    })))
  if (boxRows.length > 0) {
    const { error } = await supabase.from('drawer_box_parts').insert(boxRows)
    if (error) console.error('persistResolved drawer_box_parts:', error)
  }

  // Insert face rows — collect returned IDs for zone FK
  const rowIdByIndex = new Map<number, string>()
  if (resolved.face_rows.length > 0) {
    const { data: insertedRows, error } = await supabase
      .from('face_rows')
      .insert(resolved.face_rows.map(r => ({
        cabinet_instance_id: cabId,
        row_index:     r.row_index,
        height:        r.height,
        height_locked: r.height_locked,
      })))
      .select('id, row_index')
    if (error) console.error('persistResolved face_rows:', error)
    for (const r of insertedRows ?? []) rowIdByIndex.set(r.row_index, r.id)
  }

  // Insert face cols — collect returned IDs for zone FK
  const colIdByIndex = new Map<number, string>()
  if (resolved.face_cols.length > 0) {
    const { data: insertedCols, error } = await supabase
      .from('face_cols')
      .insert(resolved.face_cols.map(c => ({
        cabinet_instance_id: cabId,
        col_index:     c.col_index,
        width:         c.width,
        width_locked:  c.width_locked,
      })))
      .select('id, col_index')
    if (error) console.error('persistResolved face_cols:', error)
    for (const c of insertedCols ?? []) colIdByIndex.set(c.col_index, c.id)
  }

  // Insert face zones — capture ids by (row_index, col_index) for hinge pointer
  const zoneIdByKey = new Map<string, string>()
  if (resolved.face_zones.length > 0) {
    const { data: insertedZones, error } = await supabase.from('face_zones').insert(
      resolved.face_zones.map(z => ({
        cabinet_instance_id: cabId,
        row_id:        rowIdByIndex.get(z.row_index),
        col_id:        colIdByIndex.get(z.col_index),
        row_index:     z.row_index,
        col_index:     z.col_index,
        face_type:     z.face_type,
        dx: z.DX, dy: z.DY, dz: z.DZ,
        x:  z.X,  y:  z.Y,  z:  z.Z,
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
      }))
    ).select('id, row_index, col_index')
    if (error) console.error('persistResolved face_zones:', error)
    for (const z of (insertedZones ?? []) as { id: string; row_index: number; col_index: number }[]) {
      zoneIdByKey.set(`${z.row_index}:${z.col_index}`, z.id)
    }
  }

  // ── Hinge instances — merge by stable identity ───────────────────────────────
  // face_zones are recreated each resolve (fresh UUIDs), so hinges are keyed on
  // (cabinet, row, col, sort_order) instead. We delete stale rows then upsert the
  // resolved set. Locked rows carry their preserved placement (set by the
  // resolver), so re-writing them is idempotent.
  await persistHinges(cabId, resolved.hinge_instances, caseIdByKey, internalIdByKey, zoneIdByKey)
}

async function persistHinges(
  cabId: string,
  hinges: ResolvedCabinet['hinge_instances'],
  caseIdByKey: Map<string, string>,
  internalIdByKey: Map<string, string>,
  zoneIdByKey: Map<string, string>,
): Promise<void> {
  // Identities present this resolve.
  const liveKeys = new Set(hinges.map(h => `${h.row_index}:${h.col_index}:${h.sort_order}`))

  // Delete persisted rows no longer present (door removed / hinge count reduced).
  const { data: existing } = await supabase
    .from('hinge_instances')
    .select('id, row_index, col_index, sort_order')
    .eq('cabinet_instance_id', cabId)
  const staleIds = ((existing ?? []) as { id: string; row_index: number; col_index: number; sort_order: number }[])
    .filter(e => !liveKeys.has(`${e.row_index}:${e.col_index}:${e.sort_order}`))
    .map(e => e.id)
  if (staleIds.length > 0) {
    const { error } = await supabase.from('hinge_instances').delete().in('id', staleIds)
    if (error) console.error('persistHinges delete stale:', error)
  }

  if (hinges.length === 0) return

  const rows = hinges.map(h => {
    let table: string | null = null
    let partId: string | null = null
    if (h.mount_target?.table === 'case_parts' && h.mount_target.part_key) {
      const id = caseIdByKey.get(h.mount_target.part_key)
      if (id) { table = 'case_parts'; partId = id }
    } else if (h.mount_target?.table === 'internal_parts'
            && h.mount_target.internal_part_type != null
            && h.mount_target.internal_sort_order != null) {
      const id = internalIdByKey.get(`${h.mount_target.internal_part_type}:${h.mount_target.internal_sort_order}`)
      if (id) { table = 'internal_parts'; partId = id }
    }
    return {
      cabinet_instance_id:          cabId,
      row_index:                    h.row_index,
      col_index:                    h.col_index,
      sort_order:                   h.sort_order,
      face_zone_id:                 zoneIdByKey.get(`${h.row_index}:${h.col_index}`) ?? null,
      hinge_hardware_id:            h.hinge_hardware_id,
      hinge_plate_id:               h.hinge_plate_id,
      hinge_edge:                   h.hinge_edge,
      y_position_mm:                h.y_position_mm,
      y_locked:                     h.y_locked,
      mounting_surface:             h.mounting_surface,
      shelf_snap_tolerance_mm:      h.shelf_snap_tolerance_mm,
      resolved_mounting_part_table: table,
      resolved_mounting_part_id:    partId,
    }
  })

  const { error } = await supabase
    .from('hinge_instances')
    .upsert(rows, { onConflict: 'cabinet_instance_id,row_index,col_index,sort_order' })
  if (error) console.error('persistHinges upsert:', error)
}
