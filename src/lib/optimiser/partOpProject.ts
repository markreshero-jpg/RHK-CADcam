// ============================================================
// Hand-added part_operations → cabinet-space markers.
//
// The cabinet 3D / elevation / room views draw holes the resolver
// computes (in cabinet space). Hand-added part_operations live only
// in the part-local (pos_x/pos_y) frame partFootprint projects INTO,
// so to show them in those views we invert that projection back to
// cabinet space, once, here — then every view renders the result via
// its own projection (SVG proj()) or directly (3D).
//
// Generated rows are skipped: the resolver already draws the same
// holes, so including them here would double-draw. Overrides (position
// nudges) are not applied — markers sit on the resolved base part.
// ============================================================

import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { caseFrame, zoneFrame, intFrame, type FootprintFrame, type Axis } from './partFootprint'
import { caseBox } from '@/src/lib/jointDrilling'
import { customExtents, type CustomOrient } from '@/src/lib/customPartBox'
import { opPartGeom } from './routes'

// The custom-part fields the projection needs (cabinet_custom_parts row or
// rp.custom_parts): min corner x/y/z in cabinet space + intrinsic dims.
export interface CustomPartGeom { id: string; orientation?: string | null; x: number; y: number; z: number; dx: number | string; dy: number | string; dz: number | string }

// Minimal shape of a part_operations row this module needs.
export interface HandOpRow {
  id: string
  source_part_key: string | null
  operation_type: string
  pos_x: number | null
  pos_y: number | null
  diameter: number | null
  width: number | null
  length: number | null
  size_dx: number | null
  size_dy: number | null
  size_dz: number | null
  depth: number | null
  pos_z: number | null
  plane_kind: string | null
  repeat_count: number | null
  repeat_spacing: number | null
  repeat_axis: string | null
  parameters: Record<string, unknown> | null
  /** Groove direction in the face, degrees from +pos_x (90 = along pos_y), as the CNC reads it. */
  angle_az?: number | null
  // Area op set by its edges instead of a centred size (routes.areaRect).
  offset_left_mm?: number | null
  offset_right_mm?: number | null
  offset_top_mm?: number | null
  offset_bottom_mm?: number | null
}

export type Pt = { x: number; y: number; z: number }

// Markers now carry `depth` (how far the op cuts along the part normal) and `dir`
// (+1/−1, the inward direction), so the views can draw a real recess/bore instead
// of a flat mark. Points sit on the op's FACE, not the mid-thickness plane.
export type CabinetOpMarker =
  | { id: string; partKey: string; kind: 'drill'; normal: Axis; radius: number; depth: number; dir: 1 | -1; holes: Pt[] }
  | { id: string; partKey: string; kind: 'groove'; normal: Axis; radius: number; depth: number; dir: 1 | -1; ends: [Pt, Pt] }
  | { id: string; partKey: string; kind: 'area'; normal: Axis; depth: number; dir: 1 | -1; corners: Pt[] }

// Cabinet-space box (centre + size) to CSG-subtract from a part so a pocket/route
// area op shows as a real recess in the material colour (§ pocket rendering). Extends
// slightly proud of the face so the cut cleanly opens the surface.
export function areaSubtraction(m: Extract<CabinetOpMarker, { kind: 'area' }>): { center: [number, number, number]; size: [number, number, number] } {
  const axes: Axis[] = ['x', 'y', 'z']
  const lo: Record<Axis, number> = { x: Infinity, y: Infinity, z: Infinity }
  const hi: Record<Axis, number> = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const c of m.corners) for (const a of axes) { lo[a] = Math.min(lo[a], c[a]); hi[a] = Math.max(hi[a], c[a]) }
  const face = lo[m.normal]                       // corners are coplanar along the normal
  const nA = face - m.dir * 1, nB = face + m.dir * m.depth   // proud → depth inward
  lo[m.normal] = Math.min(nA, nB); hi[m.normal] = Math.max(nA, nB)
  return {
    center: [(lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2],
    size: [Math.max(hi.x - lo.x, 0.1), Math.max(hi.y - lo.y, 0.1), Math.max(hi.z - lo.z, 0.1)],
  }
}

// A groove as a CSG box: its ends run along one of the part's axes (toCabinet keeps
// them axis-aligned), its width is the cutter diameter. Same proud start as areas.
export function grooveSubtraction(m: Extract<CabinetOpMarker, { kind: 'groove' }>): { center: [number, number, number]; size: [number, number, number] } {
  const axes: Axis[] = ['x', 'y', 'z']
  const lo: Record<Axis, number> = { x: Infinity, y: Infinity, z: Infinity }
  const hi: Record<Axis, number> = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const c of m.ends) for (const a of axes) { lo[a] = Math.min(lo[a], c[a]); hi[a] = Math.max(hi[a], c[a]) }
  // Across the groove (the in-plane axis the ends don't move along): the cutter width.
  for (const a of axes) if (a !== m.normal && hi[a] - lo[a] < 0.01) { lo[a] -= m.radius; hi[a] += m.radius }
  // Along the groove: the cutter's round ends reach a radius past each end point.
  for (const a of axes) if (a !== m.normal && hi[a] - lo[a] > 2 * m.radius + 0.01) { lo[a] -= m.radius; hi[a] += m.radius }
  const face = lo[m.normal]
  const nA = face - m.dir * 1, nB = face + m.dir * m.depth
  lo[m.normal] = Math.min(nA, nB); hi[m.normal] = Math.max(nA, nB)
  return {
    center: [(lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2],
    size: [Math.max(hi.x - lo.x, 0.1), Math.max(hi.y - lo.y, 0.1), Math.max(hi.z - lo.z, 0.1)],
  }
}

// A part's footprint frame + the cabinet coord of its mid-thickness plane along the
// frame normal, and its half-thickness (so callers can reach either face).
function frameFor(rp: ResolvedCabinet, key: string, customParts?: CustomPartGeom[]): { frame: FootprintFrame; nMid: number; halfThick: number } | null {
  if (key.startsWith('case_')) {
    const p = rp.case_parts.find(pp => `case_${pp.part_key}` === key)
    if (!p) return null
    const f = caseFrame(p)
    const b = caseBox(p)
    const thick = f.normal === 'x' ? b.w : f.normal === 'y' ? b.h : b.d
    const nMin = f.normal === 'x' ? b.x : f.normal === 'y' ? b.y : b.z
    return { frame: f, nMid: nMin + thick / 2, halfThick: thick / 2 }
  }
  if (key.startsWith('zone_')) {
    const [, r, c] = key.split('_')
    const z = rp.face_zones.find(zz => zz.row_index === +r && zz.col_index === +c)
    if (!z) return null
    return { frame: zoneFrame(z), nMid: z.Z + z.DZ / 2, halfThick: z.DZ / 2 }   // normal = z
  }
  if (key.startsWith('int_')) {
    const rest = key.slice(4)
    const cut = rest.lastIndexOf('_')
    const type = rest.slice(0, cut)
    const sort = Number(rest.slice(cut + 1))
    const p = rp.internal_parts.find(pp => pp.part_type === type && pp.sort_order === sort)
    if (!p) return null
    const f = intFrame(p)
    if (!f) return null
    // Divider normal = x, shelf normal = y; thickness (DZ) runs along the normal.
    const nMin = f.normal === 'x' ? p.X : p.Y
    return { frame: f, nMid: nMin + p.DZ / 2, halfThick: p.DZ / 2 }
  }
  if (key.startsWith('custom_')) {
    // Same op frame as the optimiser (shapeFrameFor 'custom_parts'): flat = a
    // horizontal panel like a bottom (pos_x = depth DX from its back, pos_y = DY
    // across), side = like a gable, front = like a door (RHK6542 WC-08 LED route).
    const cp = (customParts ?? rp.custom_parts as CustomPartGeom[] | undefined)?.find(c => `custom_${c.id}` === key)
    if (!cp) return null
    const orient = (cp.orientation ?? 'flat') as CustomOrient
    const DX = Number(cp.dx), DY = Number(cp.dy), T = Number(cp.dz)
    const e = customExtents(orient, DX, DY, T)
    const x = Number(cp.x), y = Number(cp.y), z = Number(cp.z)
    if (orient === 'side')
      return { frame: { normal: 'x', u: { axis: 'z', dir: 1, origin: z, extent: DX }, v: { axis: 'y', dir: 1, origin: y, extent: DY } }, nMid: x + e.ex / 2, halfThick: T / 2 }
    if (orient === 'front')
      return { frame: { normal: 'z', u: { axis: 'x', dir: 1, origin: x, extent: DX }, v: { axis: 'y', dir: 1, origin: y, extent: DY } }, nMid: z + e.ez / 2, halfThick: T / 2 }
    return { frame: { normal: 'y', u: { axis: 'z', dir: 1, origin: z, extent: DX }, v: { axis: 'x', dir: 1, origin: x, extent: DY } }, nMid: y + e.ey / 2, halfThick: T / 2 }
  }
  return null   // toekick / drawer-box parts: not projected yet
}

// Invert projectToFrame: part-local (pos_x, pos_y) → cabinet-space point on the plane
// `nCoord` along the frame normal. Mirror/upSign handling is intentionally omitted —
// hand ops are authored directly in the part's flat frame, not machined-face-up.
function toCabinet(frame: FootprintFrame, nCoord: number, px: number, py: number): Pt {
  const c: Record<Axis, number> = { x: 0, y: 0, z: 0 }
  c[frame.u.axis] = frame.u.origin + frame.u.dir * px
  c[frame.v.axis] = frame.v.origin + frame.v.dir * py
  c[frame.normal] = nCoord
  return { x: c.x, y: c.y, z: c.z }
}

export function handOpMarkers(rp: ResolvedCabinet, ops: HandOpRow[], customParts?: CustomPartGeom[]): CabinetOpMarker[] {
  const out: CabinetOpMarker[] = []
  const skipped: { op: HandOpRow; why: string }[] = []
  for (const op of ops) {
    if (op.parameters?.generated) continue          // resolver already draws these
    if (!op.source_part_key) { skipped.push({ op, why: 'no part key' }); continue }
    const ff = frameFor(rp, op.source_part_key, customParts)
    if (!ff) { skipped.push({ op, why: 'part not found in this cabinet' }); continue }
    const { frame, nMid, halfThick } = ff
    const px = op.pos_x ?? 0, py = op.pos_y ?? 0

    // Sit the op on its FACE, not the mid-thickness plane. Convention: face_front →
    // the +normal face, face_back → the −normal face; depth then cuts inward toward
    // the middle. pos_z shifts the start off the face. (Front/back mapping is a
    // convention — verify against a real part.)
    const faceSign = op.plane_kind === 'face_back' ? -1 : 1
    const dir: 1 | -1 = faceSign === 1 ? -1 : 1
    const nStart = nMid + faceSign * halfThick + dir * (op.pos_z ?? 0)
    const depth = Math.min(Math.max(op.depth ?? op.size_dz ?? 2, 0.5), 2 * halfThick)

    if (op.operation_type === 'drill') {
      const count = Math.max(1, op.repeat_count ?? 1)
      const step = op.repeat_spacing ?? 0
      const along = op.repeat_axis === 'along'
      const holes: Pt[] = []
      for (let i = 0; i < count; i++) {
        holes.push(toCabinet(frame, nStart, px + (along ? step * i : 0), py + (along ? 0 : step * i)))
      }
      out.push({ id: op.id, partKey: op.source_part_key, kind: 'drill', normal: frame.normal, radius: Math.max((op.diameter ?? 5) / 2, 0.5), depth, dir, holes })
    } else {
      // Grooves + area ops: the CNC's own part-local geometry (routes.opPartGeom), so a
      // view can't draw something different from what's cut (angles, edge offsets).
      const g = opPartGeom({ ...op, angle_az: op.angle_az ?? null, offset_left_mm: op.offset_left_mm ?? null, offset_right_mm: op.offset_right_mm ?? null,
        offset_top_mm: op.offset_top_mm ?? null, offset_bottom_mm: op.offset_bottom_mm ?? null }, { w: frame.u.extent, h: frame.v.extent })
      if (!g) { skipped.push({ op, why: 'no size / length' }); continue }
      if (g.kind === 'groove') {
        out.push({
          id: op.id, partKey: op.source_part_key, kind: 'groove', normal: frame.normal, radius: Math.max((op.width ?? 4) / 2, 0.5), depth, dir,
          ends: [toCabinet(frame, nStart, g.x1, g.y1), toCabinet(frame, nStart, g.x2, g.y2)],
        })
      } else {
        out.push({
          id: op.id, partKey: op.source_part_key, kind: 'area', normal: frame.normal, depth, dir,
          corners: [
            toCabinet(frame, nStart, g.x, g.y),
            toCabinet(frame, nStart, g.x + g.w, g.y),
            toCabinet(frame, nStart, g.x + g.w, g.y + g.h),
            toCabinet(frame, nStart, g.x, g.y + g.h),
          ],
        })
      }
    }
  }
  // Never drop an op silently: a route the views can't place was how the RHK6586
  // lounge LED (part key without its case_ prefix) went missing unnoticed.
  if (skipped.length) console.warn('[handOpMarkers] hand ops not drawn:', skipped.map(s => `${s.op.source_part_key} ${s.op.operation_type} (${s.why})`).join('; '))
  return out
}

/** A groove that runs along one of the cabinet's axes (a CSG box can cut it). */
export function grooveAxisAligned(m: Extract<CabinetOpMarker, { kind: 'groove' }>): boolean {
  const moves = (['x', 'y', 'z'] as const).filter(a => Math.abs(m.ends[1][a] - m.ends[0][a]) > 0.01)
  return moves.length <= 1
}
