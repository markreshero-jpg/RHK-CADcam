import { supabase } from '@/src/lib/supabase'
import type { Wall, CabinetInstance } from '@/src/lib/types'
import { resolveCabinetFromDB, getCachedInput, setCachedInput, applyEdgeOverridesFromCache } from '@/src/lib/resolver/resolveCabinetFromDB'
import { resolveCabinet } from '@/src/lib/resolver/resolver'
import { persistResolved } from '@/src/lib/resolver/persistResolved'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'

const DIM_KEYS = new Set(['dx', 'dy', 'dz'])

export async function dbLoadResolvedParts(cabinetIds: string[]): Promise<Map<string, ResolvedCabinet>> {
  if (cabinetIds.length === 0) return new Map()

  const [cp, tp, ip, fr, fc, fz] = await Promise.all([
    supabase.from('case_parts').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('toekick_parts').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('internal_parts').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('face_rows').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('face_cols').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('face_zones').select('*').in('cabinet_instance_id', cabinetIds),
  ])

  const result = new Map<string, ResolvedCabinet>()
  for (const id of cabinetIds) {
    const myCase  = (cp.data ?? []).filter(p => p.cabinet_instance_id === id)
    const myTk    = (tp.data ?? []).filter(p => p.cabinet_instance_id === id)
    const myInt   = (ip.data ?? []).filter(p => p.cabinet_instance_id === id)
    const myRows  = (fr.data ?? []).filter(r => r.cabinet_instance_id === id)
    const myCols  = (fc.data ?? []).filter(c => c.cabinet_instance_id === id)
    const myZones = (fz.data ?? []).filter(z => z.cabinet_instance_id === id)

    if (myCase.length === 0 && myTk.length === 0 && myZones.length === 0) continue

    result.set(id, {
      cabinet_id: id,
      case_parts: myCase.map(p => ({
        part_key: p.part_key,
        DX: p.dx, DY: p.dy, DZ: p.dz,
        X: p.x, Y: p.y, Z: p.z,
        AX: p.ax, AY: p.ay, AZ: p.az,
        material_id: p.material_id,
        edge_band: { top: p.edge_band_top, bottom: p.edge_band_bottom, left: p.edge_band_left, right: p.edge_band_right },
      })),
      toekick_parts: myTk.map(p => ({
        part_key: p.part_key,
        sort_order: p.sort_order,
        is_detached: p.is_detached,
        DX: p.dx, DY: p.dy, DZ: p.dz,
        X: p.x, Y: p.y, Z: p.z,
        AX: p.ax, AY: p.ay, AZ: p.az,
        material_id: p.material_id,
        edge_band: { top: p.edge_band_top, bottom: p.edge_band_bottom, left: p.edge_band_left, right: p.edge_band_right },
      })),
      internal_parts: myInt.map(p => ({
        part_type: p.part_type,
        sort_order: p.sort_order,
        y_locked: p.y_locked,
        DX: p.dx, DY: p.dy, DZ: p.dz,
        X: p.x, Y: p.y, Z: p.z,
        AX: p.ax, AY: p.ay, AZ: p.az,
        material_id: p.material_id,
        // edge_band_front (DB) = right in resolver space (front DY edge)
        // edge_band_back  (DB) = left in resolver space
        edge_band: { top: p.edge_band_top, bottom: p.edge_band_bottom, left: p.edge_band_back, right: p.edge_band_front },
      })),
      face_rows: myRows.map(r => ({
        row_index: r.row_index, height: r.height, height_locked: r.height_locked,
      })),
      face_cols: myCols.map(c => ({
        col_index: c.col_index, width: c.width, width_locked: c.width_locked,
      })),
      face_zones: myZones.map(z => ({
        row_index: z.row_index, col_index: z.col_index,
        face_type: z.face_type, hinge_side: z.hinge_side ?? undefined,
        DX: z.dx, DY: z.dy, DZ: z.dz,
        X: z.x, Y: z.y, Z: z.z,
        AX: z.ax, AY: z.ay, AZ: z.az,
        material_id: z.material_id,
        edge_band: { top: z.edge_band_top, bottom: z.edge_band_bottom, left: z.edge_band_left, right: z.edge_band_right },
      })),
      drawer_stacks: [],
      seam_joints: [],
      errors: [],
      warnings: [],
    })
  }
  return result
}

export async function dbSaveWall(data: Omit<Wall, 'id' | 'created_at'>): Promise<Wall | null> {
  const { data: row, error } = await supabase.from('walls').insert(data).select().single()
  if (error) { console.error(error); return null }
  return row as Wall
}

export async function dbUpdateWall(id: string, u: Partial<Wall>) {
  const { error } = await supabase.from('walls').update(u).eq('id', id)
  if (error) console.error(error)
}

export async function dbDeleteWall(id: string) {
  const { error } = await supabase.from('walls').delete().eq('id', id)
  if (error) console.error('dbDeleteWall', error)
}

export async function dbInsertCabinet(
  data: Omit<CabinetInstance, 'id' | 'created_at' | 'updated_at'>,
): Promise<CabinetInstance | null> {
  const { data: row, error } = await supabase.from('cabinet_instances').insert(data).select().single()
  if (error) { console.error(error); return null }
  return row as CabinetInstance
}

export async function dbResolveAndPersistCabinet(id: string): Promise<ResolvedCabinet | null> {
  try { return await resolveCabinetFromDB(id) } catch (e) { console.error('resolve after save:', e); return null }
}

export async function dbUpdateCabinet(
  id: string,
  u: Partial<CabinetInstance>,
): Promise<ResolvedCabinet | null> {
  const { error } = await supabase.from('cabinet_instances').update(u).eq('id', id)
  if (error) { console.error(error); return null }

  // Fast path: dimension-only change + cached input → resolve synchronously,
  // persist in background. Eliminates ~17 Supabase round-trips per resize.
  const keys = Object.keys(u)
  const cached = keys.length > 0 && keys.every(k => DIM_KEYS.has(k)) ? getCachedInput(id) : undefined
  if (cached) {
    const updated = {
      ...cached,
      ...(u.dx !== undefined && { DX: Number(u.dx) }),
      ...(u.dy !== undefined && { DY: Number(u.dy) }),
      ...(u.dz !== undefined && { DZ: Number(u.dz) }),
    }
    setCachedInput(id, updated)
    const resolved = resolveCabinet(updated)
    applyEdgeOverridesFromCache(resolved)
    persistResolved(resolved).catch(e => console.error('persist:', e))
    return resolved
  }

  try { return await resolveCabinetFromDB(id) } catch (e) { console.error('resolve after update:', e); return null }
}

export async function dbDeleteCabinet(id: string) {
  const { error } = await supabase.from('cabinet_instances').delete().eq('id', id)
  if (error) console.error('dbDeleteCabinet', error)
}

// ── Custom Parts ──────────────────────────────────────────────────────────────

export interface CabinetCustomPart {
  id:                  string
  cabinet_instance_id: string
  part_library_id:     string
  name:                string | null
  dy:                  number
  dx:                  number
  dz:                  number
  x:                   number
  y:                   number
  z:                   number
  material_id:         string | null
  edge_top:            boolean
  edge_bottom:         boolean
  edge_left:           boolean
  edge_right:          boolean
  visible:             boolean
  sort_order:          number
}

export async function dbLoadCustomParts(cabinetId: string): Promise<CabinetCustomPart[]> {
  const { data } = await supabase
    .from('cabinet_custom_parts')
    .select('*')
    .eq('cabinet_instance_id', cabinetId)
    .order('sort_order')
  return (data ?? []) as CabinetCustomPart[]
}

export async function dbAddCustomPart(
  part: Omit<CabinetCustomPart, 'id'>,
): Promise<CabinetCustomPart | null> {
  const { data, error } = await supabase
    .from('cabinet_custom_parts')
    .insert(part)
    .select()
    .single()
  if (error) { console.error(error); return null }
  return data as CabinetCustomPart
}

export async function dbUpdateCustomPart(id: string, u: Partial<CabinetCustomPart>): Promise<void> {
  const { error } = await supabase.from('cabinet_custom_parts').update(u).eq('id', id)
  if (error) console.error(error)
}

export async function dbDeleteCustomPart(id: string): Promise<void> {
  const { error } = await supabase.from('cabinet_custom_parts').delete().eq('id', id)
  if (error) console.error(error)
}
