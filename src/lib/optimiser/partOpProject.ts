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
  repeat_count: number | null
  repeat_spacing: number | null
  repeat_axis: string | null
  parameters: Record<string, unknown> | null
}

export type Pt = { x: number; y: number; z: number }

export type CabinetOpMarker =
  | { id: string; kind: 'drill'; normal: Axis; radius: number; holes: Pt[] }
  | { id: string; kind: 'groove'; normal: Axis; radius: number; ends: [Pt, Pt] }
  | { id: string; kind: 'area'; normal: Axis; corners: Pt[] }

// A part's footprint frame + the cabinet coordinate of its mid-thickness plane
// along the frame normal (where we sit the marker so it's inside the panel).
function frameFor(rp: ResolvedCabinet, key: string): { frame: FootprintFrame; nMid: number } | null {
  if (key.startsWith('case_')) {
    const p = rp.case_parts.find(pp => `case_${pp.part_key}` === key)
    if (!p) return null
    const f = caseFrame(p)
    const b = caseBox(p)
    const nMid = f.normal === 'x' ? b.x + b.w / 2 : f.normal === 'y' ? b.y + b.h / 2 : b.z + b.d / 2
    return { frame: f, nMid }
  }
  if (key.startsWith('zone_')) {
    const [, r, c] = key.split('_')
    const z = rp.face_zones.find(zz => zz.row_index === +r && zz.col_index === +c)
    if (!z) return null
    return { frame: zoneFrame(z), nMid: z.Z + z.DZ / 2 }   // normal = z
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
    const nMid = f.normal === 'x' ? p.X + p.DZ / 2 : p.Y + p.DZ / 2
    return { frame: f, nMid }
  }
  return null   // toekick / drawer-box / custom parts: not projected yet
}

// Invert projectToFrame: part-local (pos_x, pos_y) → cabinet-space point on the
// mid-thickness plane. Mirror/upSign handling is intentionally omitted — hand ops
// are authored directly in the part's flat frame, not machined-face-up.
function toCabinet(frame: FootprintFrame, nMid: number, px: number, py: number): Pt {
  const c: Record<Axis, number> = { x: 0, y: 0, z: 0 }
  c[frame.u.axis] = frame.u.origin + frame.u.dir * px
  c[frame.v.axis] = frame.v.origin + frame.v.dir * py
  c[frame.normal] = nMid
  return { x: c.x, y: c.y, z: c.z }
}

export function handOpMarkers(rp: ResolvedCabinet, ops: HandOpRow[]): CabinetOpMarker[] {
  const out: CabinetOpMarker[] = []
  for (const op of ops) {
    if (op.parameters?.generated) continue          // resolver already draws these
    if (!op.source_part_key) continue
    const ff = frameFor(rp, op.source_part_key)
    if (!ff) continue
    const { frame, nMid } = ff
    const px = op.pos_x ?? 0, py = op.pos_y ?? 0

    if (op.operation_type === 'drill') {
      const count = Math.max(1, op.repeat_count ?? 1)
      const step = op.repeat_spacing ?? 0
      const along = op.repeat_axis === 'along'
      const holes: Pt[] = []
      for (let i = 0; i < count; i++) {
        holes.push(toCabinet(frame, nMid, px + (along ? step * i : 0), py + (along ? 0 : step * i)))
      }
      out.push({ id: op.id, kind: 'drill', normal: frame.normal, radius: Math.max((op.diameter ?? 5) / 2, 0.5), holes })
    } else if (op.operation_type === 'groove') {
      const len = op.length ?? 0
      out.push({
        id: op.id, kind: 'groove', normal: frame.normal, radius: Math.max((op.width ?? 4) / 2, 0.5),
        ends: [toCabinet(frame, nMid, px, py), toCabinet(frame, nMid, px + len, py)],
      })
    } else {
      const w = op.size_dx ?? 0, h = op.size_dy ?? 0
      out.push({
        id: op.id, kind: 'area', normal: frame.normal,
        corners: [
          toCabinet(frame, nMid, px - w / 2, py - h / 2),
          toCabinet(frame, nMid, px + w / 2, py - h / 2),
          toCabinet(frame, nMid, px + w / 2, py + h / 2),
          toCabinet(frame, nMid, px - w / 2, py + h / 2),
        ],
      })
    }
  }
  return out
}
