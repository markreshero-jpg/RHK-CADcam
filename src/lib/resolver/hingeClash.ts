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

import type { ResolvedHingeInstance, ResolvedInternalPart, ResolverError } from './types'

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
