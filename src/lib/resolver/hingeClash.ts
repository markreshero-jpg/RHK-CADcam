// ============================================================
// Hinge ↔ inner-drawer clash check
//
// A side/edge hinge mounts a cup in the door and an arm/boss that protrudes from
// the door back into the FRONT of the cabinet interior. An inner drawer's front
// face sits right behind the door, spanning the opening. If a hinge sits at the
// same height (and width position) as an inner drawer, the hinge body fouls the
// drawer — it can't be assembled / the drawer can't pass. This flags that.
//
// Geometry is approximate (the exact hinge body depends on the hardware), so this
// is reported as a WARNING — a "check the clearance here" heads-up, not a hard
// build error. The thresholds below are tunable.
// ============================================================

import type { ResolvedCabinet, ResolvedCasePart, ResolvedHingeInstance, ResolvedInternalPart, ResolvedSeamJoint, ResolverError } from './types'
import { cabinetSeamDrills } from '../jointDrilling'

// Keep-out around the cup bore centre (on the door back face), in mm.
const HINGE_HALF_W  = 22   // across the cabinet width (X) from the cup centre
const HINGE_HALF_H  = 32   // vertical (Y) half-extent of the hinge body
const HINGE_REACH_Z = 45   // how far the hinge body reaches back from the door into the cabinet

export function checkHingeInnerDrawerClash(
  hinges: ResolvedHingeInstance[],
  internalParts: ResolvedInternalPart[],
): ResolverError[] {
  const out: ResolverError[] = []
  if (hinges.length === 0) return out

  // Inner-drawer FRONT faces: nearest the door, full opening width, unrotated —
  // a reliable footprint to test against. (Pull-outs emit no front, so this is
  // specifically inner drawers.)
  const fronts = internalParts.filter(p => p.part_type === 'inner_drawer_front')
  if (fronts.length === 0) return out

  for (const h of hinges) {
    const cup = h.cup_drills?.[0]
    if (!cup) continue
    for (const f of fronts) {
      // Front face AABB. Cabinet3DView/ortho views anchor mesh extents as
      // [Z - DZ, Z], so the front plane (nearest the door) is at f.Z.
      const xMin = f.X, xMax = f.X + f.DY   // DY = width (cabinet X)
      const yMin = f.Y, yMax = f.Y + f.DX   // DX = height (cabinet Y)
      const zFront = f.Z

      const xHit = cup.x >= xMin - HINGE_HALF_W && cup.x <= xMax + HINGE_HALF_W
      const yHit = cup.y >= yMin - HINGE_HALF_H && cup.y <= yMax + HINGE_HALF_H
      // The hinge body reaches back from the door (cup.z) into the cabinet; it
      // fouls the drawer when that reach gets to the drawer front plane.
      const zHit = cup.z - HINGE_REACH_Z <= zFront + 2

      if (xHit && yHit && zHit) {
        const idx = (f.inner_drawer_index ?? 0) + 1
        out.push({
          code: 'HINGE_INNER_DRAWER_CLASH',
          message: `Hinge on the ${h.hinge_edge} edge (≈${Math.round(cup.y)}mm high) clashes with inner drawer ${idx} `
            + `(front spans ${Math.round(yMin)}–${Math.round(yMax)}mm). Move the hinge height, raise/lower the drawer, or add side clearance.`,
          part: 'inner_drawer',
        })
        break   // one warning per hinge is enough
      }
    }
  }
  return out
}

// ============================================================
// Hinge plate ↔ adjustable-shelf hole clash
//
// A hinge plate screws to the gable just behind the door, and its body covers
// the front column of shelf-pin holes. A pin hole under the plate means the
// plate screw lands in (or beside) a 5mm hole, so Mark wants it as an ERROR.
// The plate outline isn't in the hardware data, so it's a keep-out box around
// the plate's own screw holes (tunable below).
// ============================================================

const PLATE_PAD_Y     = 9    // plate body past its screw holes, up and down
const PLATE_PAD_BACK  = 30   // plate body behind its screw holes (into the cabinet)
const PLATE_PAD_FRONT = 15   // plate body in front of its screw holes

export interface ShelfHole { part: string; y: number; z: number; r: number }

/** Adj-shelf pin holes on the case parts, in cabinet coords. */
export function adjShelfHoles(
  caseParts: ResolvedCasePart[],
  internalParts: ResolvedInternalPart[],
  seamJoints: ResolvedSeamJoint[],
): ShelfHole[] {
  const rp = { case_parts: caseParts, internal_parts: internalParts, seam_joints: seamJoints } as ResolvedCabinet
  return cabinetSeamDrills(rp)
    .filter(d => d.seamKey.startsWith('int_adj_shelf_'))
    .map(d => ({ part: d.targetPartKey, y: d.y, z: d.z, r: d.radius }))
}

// Keep-out box (y, z) of one hinge's plate, or null when it has no plate drills.
function plateBox(h: ResolvedHingeInstance) {
  const ds = h.plate_drills ?? []
  if (!ds.length) return null
  const ys = ds.map(d => d.y), zs = ds.map(d => d.z)
  return {
    y0: Math.min(...ys) - PLATE_PAD_Y, y1: Math.max(...ys) + PLATE_PAD_Y,
    z0: Math.min(...zs) - PLATE_PAD_BACK, z1: Math.max(...zs) + PLATE_PAD_FRONT,
  }
}

/** Shelf holes on the hinge's mounting part that fall under its plate. */
export function plateHoleHits(h: ResolvedHingeInstance, holes: ShelfHole[]): ShelfHole[] {
  const b = plateBox(h)
  const part = h.mount_target && 'part_key' in h.mount_target ? h.mount_target.part_key : null
  if (!b || !part) return []
  return holes.filter(s => s.part === part
    && s.y + s.r >= b.y0 && s.y - s.r <= b.y1
    && s.z + s.r >= b.z0 && s.z - s.r <= b.z1)
}

export function checkHingeShelfHoleClash(
  hinges: ResolvedHingeInstance[],
  caseParts: ResolvedCasePart[],
  internalParts: ResolvedInternalPart[],
  seamJoints: ResolvedSeamJoint[],
): ResolverError[] {
  if (!hinges.length || !seamJoints.some(sj => sj.part_a_key.startsWith('int_adj_shelf_'))) return []
  const holes = adjShelfHoles(caseParts, internalParts, seamJoints)
  const out: ResolverError[] = []
  for (const h of hinges) {
    const hits = plateHoleHits(h, holes)
    if (!hits.length) continue
    const cupY = h.cup_drills?.[0]?.y ?? h.y_position_mm
    out.push({
      code: 'HINGE_SHELF_HOLE_CLASH',
      message: `Door [${h.row_index},${h.col_index}] hinge ${h.sort_order + 1} (≈${Math.round(cupY)}mm high) has its plate over `
        + `${hits.length} adj. shelf hole${hits.length > 1 ? 's' : ''} at ${[...new Set(hits.map(s => Math.round(s.y)))].join('/')}mm. `
        + 'Move the hinge (higher if it fits) or change the shelf drilling.',
      part: 'hinge',
    })
  }
  return out
}

// ============================================================
// Hinge plate ↔ fixed shelf
//
// A fixed shelf is screwed hard to the gable and runs to the front, so a plate
// overlapping its thickness can't be fitted at all — an ERROR. Fixed shelves
// resolve with Y = underside, DZ = thickness, X..X+DX = gable to gable.
// ============================================================

/** Fixed shelves touching the hinge's gable whose thickness falls under its plate. */
export function plateFixedShelfHits(h: ResolvedHingeInstance, internalParts: ResolvedInternalPart[]): ResolvedInternalPart[] {
  const b = plateBox(h)
  const x = h.plate_drills?.[0]?.x
  if (!b || x === undefined) return []
  return internalParts.filter(p => p.part_type === 'fixed_shelf'
    && x >= p.X - 2 && x <= p.X + p.DX + 2
    && p.Y + p.DZ >= b.y0 && p.Y <= b.y1)
}

export function checkHingeFixedShelfClash(hinges: ResolvedHingeInstance[], internalParts: ResolvedInternalPart[]): ResolverError[] {
  const out: ResolverError[] = []
  for (const h of hinges) {
    const hit = plateFixedShelfHits(h, internalParts)[0]
    if (!hit) continue
    const cupY = h.cup_drills?.[0]?.y ?? h.y_position_mm
    out.push({
      code: 'HINGE_FIXED_SHELF_CLASH',
      message: `Door [${h.row_index},${h.col_index}] hinge ${h.sort_order + 1} (≈${Math.round(cupY)}mm high) has its plate on the `
        + `fixed shelf (${Math.round(hit.Y)}–${Math.round(hit.Y + hit.DZ)}mm). Move the hinge clear of the shelf.`,
      part: 'hinge',
    })
  }
  return out
}
