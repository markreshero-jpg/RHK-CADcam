// Where each front sits on its wall, in elevation coordinates (z_grain_match G4):
// x along the wall as the elevation draws it (left → right, the back side
// mirrored), y up from the floor. The same maths as ElevationSVG
// (elevX + zoneElevRect, cabBottomZ), so a grain-matched block nests laid out
// exactly as the fronts hang.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CabinetInstance, Room, Wall } from './types'
import { cabBottomZ, cabT, cabWallSide } from './geometry'

export interface WallRect { x: number; y: number; w: number; h: number }

export interface FrontWallRect {
  rect: WallRect
  cabinetId: string
  wallId: string
  side: 'face' | 'back'
}

/** A front's rect: zone x / y (cabinet space, y up from the cabinet's underside) and its size. */
export function frontWallRect(
  cab: CabinetInstance, wall: Wall, room: Room,
  zone: { x: number; y: number; dx: number; dy: number },
): FrontWallRect {
  const side = cabWallSide(cab, wall)
  const t = cabT(cab, wall)
  const x0 = side === 'back' ? wall.length - t - cab.dx : t
  return {
    rect: { x: x0 + zone.x, y: cabBottomZ(cab, room, wall) + zone.y, w: zone.dx, h: zone.dy },
    cabinetId: cab.id, wallId: wall.id, side,
  }
}

/**
 * Wall rects for the finger-pull rails (case_parts fprail:<n>) of `cabIds`, keyed
 * by case_parts.id, for joining rails along a run (z_handles D19). Rails are
 * face-kind panels: DX = height, DY = width; frontLine = z + DZ.
 */
export async function loadRailWallRects(sb: SupabaseClient, cabIds: string[]): Promise<Map<string, FrontWallRect & { frontLine: number }>> {
  const out = new Map<string, FrontWallRect & { frontLine: number }>()
  if (!cabIds.length) return out
  const { data: rails } = await sb.from('case_parts').select('id,cabinet_instance_id,x,y,z,dx,dy,dz')
    .in('cabinet_instance_id', cabIds).like('part_key', 'fprail:%')
  const rows = (rails ?? []) as { id: string; cabinet_instance_id: string; x: number; y: number; z: number; dx: number; dy: number; dz: number }[]
  if (!rows.length) return out
  const { data: cabs } = await sb.from('cabinet_instances').select('*').in('id', [...new Set(rows.map(r => r.cabinet_instance_id))])
  const list = (cabs ?? []) as CabinetInstance[]
  const wallIds = [...new Set(list.map(c => c.wall_id).filter((w): w is string => !!w))]
  const [{ data: walls }, { data: rooms }] = await Promise.all([
    sb.from('walls').select('*').in('id', wallIds),
    sb.from('rooms').select('*').in('id', [...new Set(list.map(c => c.room_id))]),
  ])
  const wallById = new Map(((walls ?? []) as Wall[]).map(w => [w.id, w]))
  const roomById = new Map(((rooms ?? []) as Room[]).map(r => [r.id, r]))
  const cabById = new Map(list.map(c => [c.id, c]))
  for (const r of rows) {
    const cab = cabById.get(r.cabinet_instance_id)
    const wall = cab?.wall_id ? wallById.get(cab.wall_id) : undefined
    const room = cab ? roomById.get(cab.room_id) : undefined
    if (!cab || !wall || !room) continue
    const fr = frontWallRect(cab, wall, room, { x: Number(r.x), y: Number(r.y), dx: Number(r.dy), dy: Number(r.dx) })
    out.set(r.id, { ...fr, frontLine: Number(r.z) + Number(r.dz) })
  }
  return out
}

/**
 * Wall rects for the fronts (face_zones) of grain-matched cabinets among `cabIds`,
 * keyed by face_zones.id. Shaped-cabinet facet fronts and turned (AY) fronts are
 * left out — they don't hang flat in one elevation.
 */
export async function loadFrontWallRects(sb: SupabaseClient, cabIds: string[]): Promise<Map<string, FrontWallRect>> {
  const out = new Map<string, FrontWallRect>()
  if (!cabIds.length) return out
  const { data: cabs } = await sb.from('cabinet_instances').select('*')
    .in('id', cabIds).not('grain_match_group_id', 'is', null)
  const grouped = (cabs ?? []) as CabinetInstance[]
  if (!grouped.length) return out
  const wallIds = [...new Set(grouped.map(c => c.wall_id).filter((w): w is string => !!w))]
  const roomIds = [...new Set(grouped.map(c => c.room_id))]
  const [{ data: walls }, { data: rooms }, { data: zones }] = await Promise.all([
    sb.from('walls').select('*').in('id', wallIds),
    sb.from('rooms').select('*').in('id', roomIds),
    sb.from('face_zones').select('id,cabinet_instance_id,x,y,dx,dy,facet,ay').in('cabinet_instance_id', grouped.map(c => c.id)),
  ])
  const wallById = new Map(((walls ?? []) as Wall[]).map(w => [w.id, w]))
  const roomById = new Map(((rooms ?? []) as Room[]).map(r => [r.id, r]))
  const cabById = new Map(grouped.map(c => [c.id, c]))
  for (const z of (zones ?? []) as { id: string; cabinet_instance_id: string; x: number; y: number; dx: number; dy: number; facet: string | null; ay: number | null }[]) {
    if (z.facet || Number(z.ay ?? 0)) continue
    const cab = cabById.get(z.cabinet_instance_id)
    const wall = cab?.wall_id ? wallById.get(cab.wall_id) : undefined
    const room = cab ? roomById.get(cab.room_id) : undefined
    if (!cab || !wall || !room) continue
    out.set(z.id, frontWallRect(cab, wall, room, { x: Number(z.x), y: Number(z.y), dx: Number(z.dx), dy: Number(z.dy) }))
  }
  return out
}
