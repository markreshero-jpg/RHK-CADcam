// Cross section (z_section_view): the room's solids, in world coords, tagged with
// the display-layer item that gates them. Cabinets come from buildPartSolids
// (the 3D view's parts) placed by cabPlacement3d; added parts (end panels,
// fillers) are their boxes; benchtops are benchtopGeometries' triangles.

import type { Wall, CabinetInstance, Room, BenchtopInstance, BenchtopEdgeProfile } from './types'
import type { ResolvedCabinet } from './resolver/types'
import type { ShapeSegmentLike } from './shapePath'
import type { RoomRef } from './geometry'
import { buildPartSolids, partPrism, type SolidRole } from './partSolids'
import { prismFaces, geometryFaces, cabToWorld, type Face } from './crossSection'
import { cabPlacement3d } from './cabPlacement3d'
import { benchtopGeometries, type BtSolidInfo } from './benchtopSolids'
import { customExtents, customPanelKind, type CustomOrient } from './customPartBox'
import { casePartItem, kickPartItem, internalPartItem, faceZoneItem, drawerBoxPartItem } from './displayLayers/registry'
import { customPartItem } from './displayLayers/customPartKinds'
import { zonePartId, dbPartId } from './cabinetShape/partKeys'

export type SectionRole = SolidRole | 'custom' | 'bench'
/** key = the part-palette key the elevation colours it by (part_key / part_type / face_type). */
export interface SectionSolid { id: string; cabId?: string; item: string; role: SectionRole; key?: string; faces: Face[] }

type PosOv = Record<string, { ox: number; oy: number; oz: number; oax?: number; oay?: number; oaz?: number; sw?: number; sh?: number; sd?: number }>

/** Every part of one cabinet as a world-space solid. */
export function cabinetSectionSolids(cab: CabinetInstance, wall: Wall, rc: RoomRef, room: Room, rp: ResolvedCabinet,
  posOv?: PosOv, shapeOv?: Record<string, { segments?: ShapeSegmentLike[] }>): SectionSolid[] {
  const { originX, originZ, floorY, rotY } = cabPlacement3d(cab, wall, rc, room)
  const toWorld = cabToWorld({ x: originX, y: floorY, z: originZ }, rotY)
  const faces = (fs: Face[]) => fs.map(f => f.map(l => l.map(toWorld)))

  const item = new Map<string, string>(), key = new Map<string, string>()
  const tag = (id: string, it: string, k: string) => { item.set(id, it); key.set(id, k) }
  for (const p of rp.case_parts) tag(`case_${p.part_key}`, casePartItem(p.part_key), p.part_key)
  for (const p of rp.toekick_parts) tag(`tk_${p.part_key}_${p.sort_order}`, kickPartItem(p.part_key), p.part_key)
  for (const z of rp.face_zones) { const it = faceZoneItem(z.face_type); if (it) tag(zonePartId(z), it, z.face_type) }
  for (const p of rp.internal_parts ?? []) tag(`int_${p.part_type}_${p.sort_order}`, internalPartItem(p.part_type), p.part_type)
  for (const stk of rp.drawer_stacks ?? []) for (const p of stk.box_parts) tag(dbPartId(stk, p.part_type), drawerBoxPartItem(p.part_type), p.part_type)

  const out: SectionSolid[] = []
  for (const s of buildPartSolids(rp, posOv, shapeOv).values()) {
    const it = item.get(s.id)
    if (!it) continue
    out.push({ id: `${cab.id}:${s.id}`, cabId: cab.id, item: it, role: s.role, key: key.get(s.id), faces: faces(prismFaces(s.prism)) })
  }
  for (const p of rp.custom_parts ?? []) {
    if (!p.visible || !p.show_in_room || !(Number(p.dz) > 0)) continue
    const orient = (p.orientation ?? 'flat') as CustomOrient
    const { ex, ey, ez } = customExtents(orient, Number(p.dx), Number(p.dy), Number(p.dz))
    const pr = partPrism({ x: p.x, y: p.y, z: p.z, w: ex, h: ey, d: ez }, customPanelKind(orient))
    out.push({ id: `${cab.id}:custom_${p.id}`, cabId: cab.id, item: customPartItem(p), role: 'custom', faces: faces(prismFaces(pr)) })
  }
  return out
}

/** A benchtop's slab, legs and aprons as solids (triangles). */
export function benchtopSectionSolids(bt: BenchtopInstance, info: BtSolidInfo, profiles: Record<string, BenchtopEdgeProfile>): SectionSolid[] {
  return benchtopGeometries(bt, info, profiles).map(g => {
    const faces = geometryFaces(g.geo)
    g.geo.dispose()
    return { id: `${bt.id}:${g.key}`, item: 'benchtops', role: 'bench' as const, faces }
  })
}
