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
  ResolvedCasePart, ResolvedFaceZone, ResolvedDrawerBoxPart, ResolvedInternalPart,
} from '@/src/lib/resolver/types'

export type Axis = 'x' | 'y' | 'z'

// pos = dir * (hole[axis] − origin), constrained to [0, extent].
interface AxisMap { axis: Axis; dir: 1 | -1; origin: number; extent: number }
// upSign = which normal-face sits UP on the machine (drilled as-is, no mirror).
// The OTHER face is reached by flipping the part, so its bores mirror the height
// axis. Default '-' (front/interior face up) suits carcase + box panels; doors
// nest cup-side (back, +normal) up, so they set '+'. See projectToFrame.
export interface FootprintFrame { normal: Axis; u: AxisMap; v: AxisMap; upSign?: '+' | '-' }

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

// Door / drawer-front face: a vertical panel at the front. DX is the WIDTH
// (→cabinet X) and DY the HEIGHT (→cabinet Y); thickness→cabinet Z. X/Y are the
// left/bottom corner. u = DX so pos_x runs left→right (width), v = DY so pos_y
// runs bottom→top (height) — the panel's own upright orientation, no display
// swap needed. Nested cup-side (back, +Z) UP and drilled as-is, so +normal bores
// are NOT mirrored (upSign '+') — otherwise the hinge cluster flips across the door.
export function zoneFrame(z: ResolvedFaceZone): FootprintFrame {
  return { normal: 'z', upSign: '+', u: { axis: 'x', dir: 1, origin: z.X, extent: z.DX }, v: { axis: 'y', dir: 1, origin: z.Y, extent: z.DY } }
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

// Internal shelf / divider as a drilled (e.g. hinge-mounting) surface. A divider
// is a vertical panel — face-normal = cabinet X, like a carcase side; a shelf is
// horizontal — face-normal = cabinet Y, like the carcase bottom. DX = depth
// (cabinet Z); DY is the in-plane length (height for a divider, width for a
// shelf); DZ = thickness. Internal anchor (X,Y,Z) is the AABB min corner for
// dividers/shelves (matches intBox3). Other internal parts (drawer / pull-out
// panels, accessories) aren't mounting surfaces here → null.
export function intFrame(p: ResolvedInternalPart): FootprintFrame | null {
  switch (p.part_type) {
    case 'divider':
      return { normal: 'x', u: { axis: 'z', dir: 1, origin: p.Z, extent: p.DX }, v: { axis: 'y', dir: 1, origin: p.Y, extent: p.DY } }
    case 'adj_shelf':
    case 'fixed_shelf':
      return { normal: 'y', u: { axis: 'z', dir: 1, origin: p.Z, extent: p.DX }, v: { axis: 'x', dir: 1, origin: p.X, extent: p.DY } }
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
  // Bores entering the DOWN face (opposite upSign) are reached by flipping the
  // part, which mirrors the height axis. Bores on the UP face drill as-is.
  if (drill.axis[1] !== (frame.upSign ?? '-')) pos_x = frame.u.extent - pos_x
  return { pos_x, pos_y, output_face: FACE_FOR_AXIS[drill.axis] ?? 'top' }
}
