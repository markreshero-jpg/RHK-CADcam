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

// A part's footprint frame + the cabinet coord of its mid-thickness plane along the
// frame normal, and its half-thickness (so callers can reach either face).
function frameFor(rp: ResolvedCabinet, key: string): { frame: FootprintFrame; nMid: number; halfThick: number } | null {
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
  return null   // toekick / drawer-box / custom parts: not projected yet
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

export function handOpMarkers(rp: ResolvedCabinet, ops: HandOpRow[]): CabinetOpMarker[] {
  const out: CabinetOpMarker[] = []
  for (const op of ops) {
    if (op.parameters?.generated) continue          // resolver already draws these
    if (!op.source_part_key) continue
    const ff = frameFor(rp, op.source_part_key)
    if (!ff) continue
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
    } else if (op.operation_type === 'groove') {
      const len = op.length ?? 0
      out.push({
        id: op.id, partKey: op.source_part_key, kind: 'groove', normal: frame.normal, radius: Math.max((op.width ?? 4) / 2, 0.5), depth, dir,
        ends: [toCabinet(frame, nStart, px, py), toCabinet(frame, nStart, px + len, py)],
      })
    } else {
      const w = op.size_dx ?? 0, h = op.size_dy ?? 0
      out.push({
        id: op.id, partKey: op.source_part_key, kind: 'area', normal: frame.normal, depth, dir,
        corners: [
          toCabinet(frame, nStart, px - w / 2, py - h / 2),
          toCabinet(frame, nStart, px + w / 2, py - h / 2),
          toCabinet(frame, nStart, px + w / 2, py + h / 2),
          toCabinet(frame, nStart, px - w / 2, py + h / 2),
        ],
      })
    }
  }
  return out
}
