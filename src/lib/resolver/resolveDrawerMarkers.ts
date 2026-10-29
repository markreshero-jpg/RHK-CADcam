// ============================================================
// Drawer front marker holes (z_handles D22)
// Small prick holes in the back face of each drawer front so the shop can tell
// which front is which (and which edge is the bottom) once the label is gone:
// front 1 (top) gets 1 hole, front 2 gets 2, and so on. Each column of drawers
// counts down from its own top front.
//   • 5 dia × 1 deep, drilled from the back face (never through)
//   • first hole 60 in from the LEFT edge as seen from the front, 15 up from
//     the bottom; the rest step 10 further in along the bottom
// Rule DF_MARKER (unset = on) switches it at job / room / cabinet.
// Facet fronts of shaped cabinets are skipped, like their handle holes.
// ============================================================

import type { CabinetInput, ResolvedFaceZone } from './types'

export const MARKER_DIA     = 5
export const MARKER_DEPTH   = 1
export const MARKER_INSET   = 60   // left edge (front view) → first hole centre
export const MARKER_UP      = 15   // bottom edge → hole centres
export const MARKER_SPACING = 10   // hole to hole, running inward

export function resolveDrawerMarkers(cab: CabinetInput, zones: ResolvedFaceZone[]): void {
  if (cab.rules.DF_MARKER === false) return
  const cols = new Map<number, ResolvedFaceZone[]>()
  for (const z of zones) {
    if (z.face_type !== 'drawer_face' || z.facet || z.AY) continue
    const col = cols.get(z.col_index) ?? []
    col.push(z)
    cols.set(z.col_index, col)
  }
  for (const col of cols.values()) {
    col.sort((a, b) => (b.Y + b.DY) - (a.Y + a.DY))   // top front first
    col.forEach((z, i) => {
      const holes: { x: number; y: number }[] = []
      for (let n = 0; n <= i; n++) {
        const x = MARKER_INSET + n * MARKER_SPACING
        if (x + MARKER_DIA / 2 > z.DX) break   // front too narrow for the rest
        holes.push({ x, y: MARKER_UP })
      }
      if (holes.length && MARKER_UP + MARKER_DIA / 2 <= z.DY) z.marker_holes = holes
    })
  }
}
