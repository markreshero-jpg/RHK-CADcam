// Writes a ResolvedCabinet to Supabase.
// Deletes all existing parts for the cabinet then re-inserts.

import { supabase } from '@/src/lib/supabase'
import { ResolvedCabinet } from './types'

export async function persistResolved(resolved: ResolvedCabinet): Promise<void> {
  const cabId = resolved.cabinet_id

  // Delete existing parts (order matters for FKs: zones before rows/cols)
  await supabase.from('face_zones').delete().eq('cabinet_instance_id', cabId)
  await Promise.all([
    supabase.from('case_parts').delete().eq('cabinet_instance_id', cabId),
    supabase.from('toekick_parts').delete().eq('cabinet_instance_id', cabId),
    supabase.from('internal_parts').delete().eq('cabinet_instance_id', cabId),
    supabase.from('face_rows').delete().eq('cabinet_instance_id', cabId),
    supabase.from('face_cols').delete().eq('cabinet_instance_id', cabId),
  ])

  // Insert case parts
  if (resolved.case_parts.length > 0) {
    const { error } = await supabase.from('case_parts').insert(
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
        rule_overrides:    {},
        nest_priority:     0,
        output_to_cnc:     true,
      }))
    )
    if (error) console.error('persistResolved case_parts:', error)
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
        rule_overrides:    {},
        output_to_cnc:     true,
        is_detached:       p.is_detached,
      }))
    )
    if (error) console.error('persistResolved toekick_parts:', error)
  }

  // Insert internal parts
  if (resolved.internal_parts.length > 0) {
    const { error } = await supabase.from('internal_parts').insert(
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
        rule_overrides:    {},
        output_to_cnc:     true,
      }))
    )
    if (error) console.error('persistResolved internal_parts:', error)
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

  // Insert face zones
  if (resolved.face_zones.length > 0) {
    const { error } = await supabase.from('face_zones').insert(
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
        drawerbox_overrides: {},
        rule_overrides:    {},
        output_to_cnc:     true,
        // Resolved door style output (for rendering / reports)
        door_style_id:     z.door_style_id ?? null,
        door_profile_id:   z.door_profile_id ?? null,
        door_profile:      z.door_profile ?? null,
      }))
    )
    if (error) console.error('persistResolved face_zones:', error)
  }
}
