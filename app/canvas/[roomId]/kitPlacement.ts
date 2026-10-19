// Kit placement (z_wot K3): one library pick drops every member of the
// definition's kit as its own cabinet. Pure layout lives in src/lib/cabinetKit.ts;
// this loads each member's definition + cascade, lays the kit out, then inserts,
// copies parts (+ drilling / comments) and resolves each member in order.

import { supabase } from '@/src/lib/supabase'
import type { CabinetDefinition, CabinetInstance, Room, Wall } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { layoutKit, kitMemberT, type CabinetKit, type KitMember, type KitMemberEnv } from '@/src/lib/cabinetKit'
import { resolveClassDims, type ClassDimContext } from '@/src/lib/resolver/resolveClassDims'
import { loadCabinetInputFromRow } from '@/src/lib/resolver/loadCabinetInput'
import { buildFormulaScope } from '@/src/lib/formula/context'
import { wallAnchorPoint, wallCabTop, wallDir, wallInwardNormal, type RoomRef } from '@/src/lib/geometry'
import {
  buildInstanceFromDefinition, dbInsertCabinet, dbInsertCustomPartsSnapshot, dbApplyDefinitionPartData,
  dbResolveAndPersistCabinet,
} from './canvasDB'

type InstanceRow = Omit<CabinetInstance, 'id' | 'created_at' | 'updated_at'>

const EMPTY_RESOLVED = { case_parts: [], toekick_parts: [], internal_parts: [], face_zones: [] } as unknown as ResolvedCabinet

export interface KitPlaceArgs {
  kit: CabinetKit
  /** The definition carrying the kit, and its (possibly panel-edited) draft = the 'self' member. */
  selfDef: CabinetDefinition
  selfDraft: InstanceRow
  room: Room
  dims: ClassDimContext
  wall: Wall
  ref: RoomRef
  /** Along-wall start of the kit (its left end, or right end on a turned side). */
  t0: number
  back: boolean
  /** Next free label for a class, given the cabinets inserted so far. */
  nextLabel: (placed: CabinetInstance[], cls: string) => string
}

export interface KitPlaced { cabinet: CabinetInstance; resolved: ResolvedCabinet | null }

export async function dbPlaceKit(a: KitPlaceArgs): Promise<{ placed: KitPlaced[]; errors: string[] }> {
  const names = [...new Set(a.kit.members.filter(m => m.def !== 'self').map(m => m.def))]
  const { data: defRows } = names.length
    ? await supabase.from('cabinet_definitions').select('*').in('name', names).eq('is_library_item', true).eq('active', true)
    : { data: [] }
  const defs = new Map(((defRows ?? []) as CabinetDefinition[]).map(d => [d.name, d]))
  const errors: string[] = names.filter(n => !defs.has(n)).map(n => `Library cabinet "${n}" not found`)
  const members = a.kit.members.filter(m => m.def === 'self' || defs.has(m.def))

  const rotation = a.back ? a.wall.angle + 180 : a.wall.angle
  const rowFor = (m: KitMember): { def: CabinetDefinition; row: InstanceRow } => {
    if (m.def === 'self') return { def: a.selfDef, row: a.selfDraft }
    const def = defs.get(m.def)!
    const { dy, dz } = resolveClassDims(def.assembly_class, a.dims)
    return { def, row: buildInstanceFromDefinition(def, {
      room_id: a.room.id, wall_id: a.wall.id, label: def.name, pos_x: 0, pos_y: 0, rotation, cascade_dy: dy, cascade_dz: dz,
    }) }
  }
  const built = new Map(members.map(m => [m.key, rowFor(m)]))

  // Each member's own cascade (thicknesses / rules) for its formulas.
  const envs = new Map<string, KitMemberEnv>()
  await Promise.all(members.map(async m => {
    const { row } = built.get(m.key)!
    const input = await loadCabinetInputFromRow({ ...row, id: `__kit_${m.key}` }, { persisted: false })
    const roots = buildFormulaScope(EMPTY_RESOLVED, input).roots as { t: Record<string, number>; r: Record<string, number> }
    envs.set(m.key, { size: { dx: row.dx, dy: row.dy, dz: row.dz }, t: roots.t, r: roots.r })
  }))
  const cls = (c: string) => resolveClassDims(c, a.dims)
  const tall = cls('tall'), base = cls('base'), wcab = cls('wall')
  const layout = layoutKit({ members }, m => envs.get(m.key)!, {
    tall: { h: tall.dy, d: tall.dz }, base: { h: base.dy, d: base.dz },
    wallcab: { h: wcab.dy, d: wcab.dz, top: wallCabTop(a.wall, a.room) },
  })
  errors.push(...layout.errors)

  // Turned frame (cabinetPlanFrame): local +X runs back along the wall.
  const d = wallDir(a.wall), inw = wallInwardNormal(a.wall, a.ref)
  const perp = a.back ? { x: -inw.x, y: -inw.y } : inw
  const turned = d.x * perp.y - d.y * perp.x < 0

  const placed: KitPlaced[] = []
  for (const p of layout.placed) {
    const m = members.find(x => x.key === p.key)!
    const { def, row } = built.get(m.key)!
    const t = kitMemberT(a.t0, layout.width, p, turned)
    const pos = wallAnchorPoint(a.wall, t, a.back, a.ref, p.gap)
    const isWall = row.assembly_class === 'wall' || row.assembly_class === 'wall_corner'
    const data: InstanceRow = {
      ...row,
      room_id: a.room.id, wall_id: a.wall.id, rotation,
      label: a.nextLabel(placed.map(x => x.cabinet), row.assembly_class),
      pos_x: pos.x, pos_y: pos.y,
      // Wall units hang from the wall-cabinet top (pos_z is only a cache there).
      pos_z: isWall ? wallCabTop(a.wall, a.room) - p.dy : p.y,
      dx: p.dx, dy: p.dy, dz: p.dz,
      ...(m.top_type ? { top_type: m.top_type } : {}),
      ...(m.neighbours ? { left_neighbour_type: m.neighbours[0], right_neighbour_type: m.neighbours[1] } : {}),
      rule_overrides: { ...(row.rule_overrides ?? {}), ...p.rules },
    }
    const cabinet = await dbInsertCabinet(data)
    if (!cabinet) { errors.push(`${m.key}: insert failed`); continue }
    // Definition parts first (its drilling / comments point at them by index), then the kit's extras.
    const ids = await dbInsertCustomPartsSnapshot(cabinet.id, [
      ...((def.custom_parts ?? []) as Record<string, unknown>[]),
      ...(m.parts ?? []).map((cp, i) => ({ ...cp, sort_order: (def.custom_parts?.length ?? 0) + i })),
    ])
    await dbApplyDefinitionPartData(def, cabinet.id, ids)
    const resolved = await dbResolveAndPersistCabinet(cabinet.id)
    placed.push({ cabinet, resolved })
  }
  return { placed, errors }
}
