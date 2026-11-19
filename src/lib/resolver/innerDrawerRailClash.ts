// ============================================================
// Inner drawer ↔ finger rail clash (Mark 2026-11-19, RHK6571 BC-09)
//
// An inner drawer sits behind a drawer front; its own front rises close to the
// finger rail above (z_handles D22–D24). If the inner front reaches into the
// rail (or its set back base piece), the drawer can't open — an ERROR, shown
// in the cabinet errors panel. Needs INNER_RAIL_CLEARANCE mm all round.
// ============================================================

import type { ResolvedInternalPart, ResolverError } from './types'
import type { FingerRail } from './resolveFingerRails'

export const INNER_RAIL_CLEARANCE = 3

/** Inner drawer fronts (box [X, X+DY] × [Y, Y+DX] × [Z−DZ, Z], as hingeClash) against the
 *  finger rails' zones (Y bottom..top, X x0..x1, Z from the rail's back face — behind any set back
 *  pocket — to the carcass front). */
export function checkInnerDrawerRailClash(rails: FingerRail[], internalParts: ResolvedInternalPart[]): ResolverError[] {
  const fronts = internalParts.filter(p => p.part_type === 'inner_drawer_front')
  if (!fronts.length || !rails.length) return []
  const c = INNER_RAIL_CLEARANCE
  const out: ResolverError[] = []
  for (const f of fronts) {
    const x0 = f.X, x1 = f.X + f.DY, y0 = f.Y, y1 = f.Y + f.DX, z0 = f.Z - f.DZ, z1 = f.Z
    for (const r of rails) {
      const rz0 = r.frontZ - (r.setback ?? 0) - r.thickness
      const hit = x0 < r.x1 && x1 > r.x0 && y0 < r.top + c && y1 > r.bottom - c && z0 < r.frontZ && z1 > rz0 - c
      if (!hit) continue
      const idx = (f.inner_drawer_index ?? 0) + 1
      const gap = y1 <= r.bottom + c ? Math.round((r.bottom - y1) * 10) / 10 : null
      out.push({
        code: 'INNER_DRAWER_RAIL_CLASH',
        message: `Inner drawer ${idx}'s front (${Math.round(y0)}–${Math.round(y1)}mm) ${gap != null && gap >= 0 ? `is only ${gap}mm under` : 'runs into'} `
          + `the finger rail at ${Math.round(r.bottom)}mm — needs ${c}mm clearance. Lower the inner drawer.`,
        part: 'inner_drawer',
      })
      break
    }
  }
  return out
}
