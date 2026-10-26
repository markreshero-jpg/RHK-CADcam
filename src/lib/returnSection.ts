// Return cabinet sections (z_section_view R1/R1a): an elevation shows the
// cabinets on its return walls side-on, as plain part outlines — everything
// between this wall's face and a cut at the depth of its own cabinets.
//
// The cut is a vertical plane parallel to the elevation face, `depth` mm out
// from it (into the room on the face side): the cross-section plane turned 90°,
// normal = the face normal n, frame u along the wall (d) — so u is the elevation
// x and v the height, no further mapping.

import type { Wall, CabinetInstance } from './types'
import type { WallFrame } from './benchtopAnchor'
import { wallEnd, dist, cabWallSide } from './geometry'
import type { CutPlane, P2 } from './crossSection'
import type { V3 } from './partSolids'
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

/** Off-face extent of a solid (distance out from this wall's face). */
function offRange(s: SectionSolid, pl: CutPlane): [number, number] {
  let lo = Infinity, hi = -Infinity
  for (const f of s.faces) for (const l of f) for (const v of l) {
    const t = (v[0] - pl.o.x) * pl.d.x + (v[2] - pl.o.y) * pl.d.y
    if (t < lo) lo = t
    if (t > hi) hi = t
  }
  return [lo, hi]
}

/** Newell normal of a loop (world coords). */
function normal(loop: V3[]): V3 {
  let x = 0, y = 0, z = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length]
    x += (a[1] - b[1]) * (a[2] + b[2])
    y += (a[2] - b[2]) * (a[0] + b[0])
    z += (a[0] - b[0]) * (a[1] + b[1])
  }
  return [x, y, z]
}

/** Convex hull (monotone chain). */
function hull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
  if (p.length < 3) return p
  const cross = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: P2[] = [], upper: P2[] = []
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q) }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q) }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** Each solid's outline seen from the cut (Mark, 2026-10-26: "show everything up
 *  to that point"): every part between the wall face and the cut depth, projected
 *  flat onto the elevation (u = elevation x, v = height). A part starting at or
 *  past the cut isn't drawn, so a cut on a joint shows the cabinet behind it whole.
 *  Board parts draw their faces that look toward the viewer (true shape, notches
 *  and all); benchtop meshes their projected hull. Loops past the wall's length
 *  (a return's back-side cabinets) are dropped. */
export function returnProjectionLoops(solids: SectionSolid[], pl: CutPlane, wallLen: number): { s: SectionSolid; loops: P2[][] }[] {
  const to2 = (v: V3): P2 => ({ x: (v[0] - pl.o.x) * pl.n.x + (v[2] - pl.o.y) * pl.n.y, y: v[1] })
  const out: { s: SectionSolid; loops: P2[][] }[] = []
  for (const s of solids) {
    const [lo, hi] = offRange(s, pl)
    if (lo >= pl.at || hi <= 0) continue
    let loops: P2[][]
    if (s.role === 'bench') {
      loops = [hull(s.faces.flatMap(f => f.flatMap(l => l.map(to2))))]
    } else {
      const seen = new Set<string>()
      loops = []
      for (const f of s.faces) {
        const nv = normal(f[0]), len = Math.hypot(nv[0], nv[1], nv[2])
        if (!len || Math.abs(nv[0] * pl.d.x + nv[2] * pl.d.y) / len < 0.05) continue   // edge-on to the viewer
        for (const l of f) {
          const q = l.map(to2)
          const k = q.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).sort().join(';')
          if (seen.has(k)) continue   // front + back caps project to the same outline
          seen.add(k); loops.push(q)
        }
      }
    }
    loops = loops.filter(l => {
      if (l.length < 3) return false
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
