// ============================================================
// Cabinet-space hole → part flat-footprint projection.
// Generalises seamDrillSync's case-part projection to every part
// the optimiser nests: case parts, face zones (doors / drawer
// fronts), and drawer-box panels.
//
// Each part is reduced to a "footprint frame": which cabinet axis
// is the panel's face-normal (the only direction we can drill on a
// flat sheet), and how the two in-plane axes (pos_x along DX, pos_y
// along DY) map back to cabinet axes — including sign, because some
// box panels run along −Z (drawer depth maps to cabinet −Z).
// Pure / framework-free.
// ============================================================

import { caseBox } from '@/src/lib/jointDrilling'
import type {
  ResolvedCasePart, ResolvedFaceZone, ResolvedDrawerBoxPart,
} from '@/src/lib/resolver/types'

export type Axis = 'x' | 'y' | 'z'

// pos = dir * (hole[axis] − origin), constrained to [0, extent].
interface AxisMap { axis: Axis; dir: 1 | -1; origin: number; extent: number }
export interface FootprintFrame { normal: Axis; u: AxisMap; v: AxisMap }

const coord = (d: { x: number; y: number; z: number }, a: Axis) => (a === 'x' ? d.x : a === 'y' ? d.y : d.z)

// Cabinet axes → part_operations.output_face vocabulary (+X=right, +Y=top, +Z=front).
const FACE_FOR_AXIS: Record<string, string> = {
  'x+': 'right', 'x-': 'left', 'y+': 'top', 'y-': 'bottom', 'z+': 'front', 'z-': 'back',
}

// ── Per-part-kind frames ──────────────────────────────────────────────────────

export function caseFrame(p: ResolvedCasePart): FootprintFrame {
  const cb = caseBox(p)   // cabinet-space AABB (min corner + extents), per-part-type remap
  switch (p.part_key) {
    case 'left_side':
    case 'right_side':
      return { normal: 'x', u: { axis: 'z', dir: 1, origin: cb.z, extent: p.DX }, v: { axis: 'y', dir: 1, origin: cb.y, extent: p.DY } }
    case 'back':
      return { normal: 'z', u: { axis: 'y', dir: 1, origin: cb.y, extent: p.DX }, v: { axis: 'x', dir: 1, origin: cb.x, extent: p.DY } }
    default: // bottom, full_top, front_rail, back_rail — horizontal panels
      return { normal: 'y', u: { axis: 'z', dir: 1, origin: cb.z, extent: p.DX }, v: { axis: 'x', dir: 1, origin: cb.x, extent: p.DY } }
  }
}

// Door / drawer-front face: a vertical panel at the front. Like the carcase back,
// DX is the HEIGHT (→cabinet Y) and DY the WIDTH (→cabinet X); thickness→cabinet Z.
// X/Y are the left/bottom corner.
export function zoneFrame(z: ResolvedFaceZone): FootprintFrame {
  return { normal: 'z', u: { axis: 'y', dir: 1, origin: z.Y, extent: z.DX }, v: { axis: 'x', dir: 1, origin: z.X, extent: z.DY } }
}

// Drawer-box panel in cabinet space. resolveDrawerStack maps box-local → cabinet
// with cabinet_Z = zone.Z − local_Z, so the box DEPTH axis (local +Z) runs along
// cabinet −Z with its origin at the part's front face (part.Z).
export function boxFrame(p: ResolvedDrawerBoxPart): FootprintFrame | null {
  switch (p.part_type) {
    case 'db_left_side':
    case 'db_right_side':   // DX=depth(−Z), DY=height(Y), thickness→X
      return { normal: 'x', u: { axis: 'z', dir: -1, origin: p.Z, extent: p.DX }, v: { axis: 'y', dir: 1, origin: p.Y, extent: p.DY } }
    case 'db_bottom':        // DX=depth(−Z), DY=width(X), thickness→Y
      return { normal: 'y', u: { axis: 'z', dir: -1, origin: p.Z, extent: p.DX }, v: { axis: 'x', dir: 1, origin: p.X, extent: p.DY } }
    case 'db_front':
    case 'db_back':          // DX=height(Y), DY=width(X), thickness→Z
      return { normal: 'z', u: { axis: 'y', dir: 1, origin: p.Y, extent: p.DX }, v: { axis: 'x', dir: 1, origin: p.X, extent: p.DY } }
    default:
      return null
  }
}

// ── Projection ────────────────────────────────────────────────────────────────

export interface Projected { pos_x: number; pos_y: number; output_face: string }

// Project a cabinet-space drill onto a part's footprint frame. Returns null when
// the bore isn't along the part's face-normal (edge/dowel hole — not flat-nest
// drillable). Mirrors the DX axis for bores entering the −normal face so the part
// is correct machined interior/hole-face up (and mirror twins come out mirrored).
export function projectToFrame(
  drill: { x: number; y: number; z: number; axis: string }, frame: FootprintFrame,
): Projected | null {
  if ((drill.axis[0] as Axis) !== frame.normal) return null
  let pos_x = frame.u.dir * (coord(drill, frame.u.axis) - frame.u.origin)
  const pos_y = frame.v.dir * (coord(drill, frame.v.axis) - frame.v.origin)
  if (drill.axis[1] === '+') pos_x = frame.u.extent - pos_x
  return { pos_x, pos_y, output_face: FACE_FOR_AXIS[drill.axis] ?? 'top' }
}
