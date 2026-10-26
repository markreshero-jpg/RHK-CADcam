// Return cabinet sections (z_section_view R1): an elevation shows the cabinets on
// its return walls cut through, side-on, at the depth of its own cabinets.
//
// The cut is a vertical plane parallel to the elevation face, `depth` mm out
// from it (into the room on the face side). Solids on the return walls (the walls
// joined to this one's ends) are sliced with the cross-section slicer turned 90°:
// the plane's normal is the face normal n, and the section frame's u runs along
// the wall (d) — so u is the elevation x and v the height, no further mapping.

import type { Wall, CabinetInstance } from './types'
import type { WallFrame } from './benchtopAnchor'
import { wallEnd, dist, cabWallSide } from './geometry'
import { sliceFaces, type CutPlane, type P2 } from './crossSection'
import type { SectionSolid } from './crossSectionRoom'

/** How close (mm) a wall end must be to count as joined (as the return-wall slabs). */
export const RETURN_TOL = 50

/** The walls joined to this wall's start (left) and end (right); islands never. */
export function returnWallsOf(wall: Wall, walls: Wall[]): { left: Wall | null; right: Wall | null } {
  const wS = { x: wall.pos_x, y: wall.pos_y }
  const wE = wallEnd(wall)
  let left: Wall | null = null, right: Wall | null = null
  for (const w of walls) {
    if (w.id === wall.id || w.wall_type === 'island') continue
    const s = { x: w.pos_x, y: w.pos_y }, e = wallEnd(w)
    if (!left  && (dist(s, wS) < RETURN_TOL || dist(e, wS) < RETURN_TOL)) left  = w
    if (!right && (dist(s, wE) < RETURN_TOL || dist(e, wE) < RETURN_TOL)) right = w
  }
  return { left, right }
}

/** Default cut depth when the wall has no cabinets of its own. */
export const RETURN_CUT_DEFAULT = 600

/** Where the returns are cut: the depth of this wall's deepest cabinet on that
 *  side (Mark, 2026-10-26: "if wall 1's cabinets are 600 deep, cut the returns at
 *  600"). End panels / fillers / scribes (< 100 wide), kick runs and the special
 *  kinds (bulkheads, floating shelves, back panels) don't set it. */
export function returnCutDepth(wall: Wall, side: 'face' | 'back', cabinets: CabinetInstance[]): number {
  let d = 0
  for (const c of cabinets) {
    if (c.wall_id !== wall.id || cabWallSide(c, wall) !== side) continue
    if (c.is_kick_assembly || c.bulkhead || c.float_shelf || c.back_panel || c.dx < 100) continue
    if (c.dz > d) d = c.dz
  }
  return d > 0 ? d : RETURN_CUT_DEFAULT
}

/** The cut plane for an elevation frame: normal = the face normal, at `depth`. */
export function returnCutPlane(frame: WallFrame, depth: number): CutPlane {
  return { o: frame.o, d: frame.n, n: frame.d, at: depth }
}

/** Off-face extent of a face set — quick reject before slicing. */
function offRange(s: SectionSolid, pl: CutPlane): [number, number] {
  let lo = Infinity, hi = -Infinity
  for (const f of s.faces) for (const l of f) for (const v of l) {
    const t = (v[0] - pl.o.x) * pl.d.x + (v[2] - pl.o.y) * pl.d.y
    if (t < lo) lo = t
    if (t > hi) hi = t
  }
  return [lo, hi]
}

/** Each solid's cut loops (u = elevation x, v = height), kept only where they
 *  fall within the wall's length — a return's outside face (its back-side
 *  cabinets) sits past the wall end and isn't part of this elevation. */
export function returnSectionLoops(solids: SectionSolid[], pl: CutPlane, wallLen: number): { s: SectionSolid; loops: P2[][] }[] {
  const out: { s: SectionSolid; loops: P2[][] }[] = []
  for (const s of solids) {
    const [lo, hi] = offRange(s, pl)
    if (pl.at < lo || pl.at > hi) continue
    const loops = sliceFaces(s.faces, pl).filter(l => {
      let x0 = Infinity, x1 = -Infinity
      for (const p of l) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x }
      return x1 > 0.5 && x0 < wallLen - 0.5
    })
    if (loops.length) out.push({ s, loops })
  }
  return out
}

/** SVG path in elevation coords (y down from the ceiling line: y = roomH − height). */
export function elevLoopsPath(loops: P2[][], roomH: number): string {
  return loops.map(l => 'M' + l.map(p => `${p.x.toFixed(1)},${(roomH - p.y).toFixed(1)}`).join('L') + 'Z').join('')
}

/** chainPaths output → elevation-coords path (closed loops only, or open only). */
export function elevChainPath(paths: { pts: P2[]; closed: boolean }[], closed: boolean, roomH: number): string {
  return paths.filter(p => p.closed === closed)
    .map(l => 'M' + l.pts.map(p => `${p.x.toFixed(1)},${(roomH - p.y).toFixed(1)}`).join('L') + (closed ? 'Z' : '')).join('')
}
