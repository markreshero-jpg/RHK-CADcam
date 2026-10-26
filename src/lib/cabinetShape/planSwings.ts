// Plan door swings + drawer lines for shaped cabinets (z_cabinet_shape 3c).
// A plain cabinet draws them from its face grid on the straight front; a shaped
// one has fronts on several facets, so they come from the resolved zones,
// turned onto their facet. Everything here is cabinet-local plan (x along the
// width, z toward the room) — callers map it to plan / report space.

import type { ResolvedFaceZone } from '../resolver/types'
import { turnPoint, turnDir } from '../resolver/hardwareTurn'
import { zoneKey } from './partKeys'

export type LocalPt = { x: number; z: number }

/** A door swing: closed leaf hinge → free, arc to `end` (15° open). */
export interface LocalSwing { key: string; hinge: LocalPt; free: LocalPt; end: LocalPt; r: number }

/** A drawer line along a front: stepped out along `out` and inset along `along` per `step` (see drawerLineOffset). */
export interface LocalDrawerLine { key: string; a: LocalPt; b: LocalPt; out: LocalPt; along: LocalPt; step: number }

const OPEN = 15 * Math.PI / 180

/** Drawer line spacing in real mm, so the marks stay fixed on the cabinet at any zoom
 *  or print scale: `step` × 40 out past `clear` (the benchtop overhang, see benchReach),
 *  `step` × 30 in from each end, never shorter than 40% of the front (deep stacks on
 *  narrow fronts). */
export function drawerLineOffset(step: number, width: number, clear = 0): { off: number; ins: number } {
  return { off: clear + step * 40, ins: Math.max(0, Math.min(step * 30, width * 0.3)) }
}

export type PlanPt = { x: number; y: number }

function inside(poly: PlanPt[], p: PlanPt): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

/** How far benchtop outlines (plan rings) reach past a front a→b along unit `out` —
 *  0 when no top sits over it. Sampled across the front so a top over part of it counts. */
export function benchReach(tops: PlanPt[][], a: PlanPt, b: PlanPt, out: PlanPt): number {
  let best = 0
  for (const t of [0.1, 0.5, 0.9]) {
    // 1mm back inside the front, so a top flush with the face still counts
    const o = { x: a.x + (b.x - a.x) * t - out.x, y: a.y + (b.y - a.y) * t - out.y }
    for (const poly of tops) {
      if (poly.length < 3 || !inside(poly, o)) continue
      let s = Infinity
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const e = { x: poly[i].x - poly[j].x, y: poly[i].y - poly[j].y }
        const den = out.x * e.y - out.y * e.x
        if (Math.abs(den) < 1e-9) continue
        const w = { x: poly[j].x - o.x, y: poly[j].y - o.y }
        const r = (w.x * e.y - w.y * e.x) / den, u = (w.x * out.y - w.y * out.x) / den
        if (r > 0 && u >= 0 && u <= 1) s = Math.min(s, r)
      }
      if (s < Infinity) best = Math.max(best, s - 1)
    }
  }
  return best
}

function frontEdge(z: ResolvedFaceZone): { l: LocalPt; r: LocalPt; out: LocalPt } {
  const t = z.AY ? { AY: z.AY, X: z.X, Y: z.Y, Z: z.Z } : undefined
  const zf = z.Z + z.DZ
  const [lx, , lz] = turnPoint(t, z.X, 0, zf)
  const [rx, , rz] = turnPoint(t, z.X + z.DX, 0, zf)
  const [ox, , oz] = turnDir(t, 0, 0, 1)
  return { l: { x: lx, z: lz }, r: { x: rx, z: rz }, out: { x: ox, z: oz } }
}

export function shapedFrontMarks(zones: ResolvedFaceZone[]): { swings: LocalSwing[]; drawers: LocalDrawerLine[] } {
  const swings: LocalSwing[] = [], drawers: LocalDrawerLine[] = []
  const seen = new Set<string>()
  const colOf = (z: ResolvedFaceZone) => `${z.facet ?? ''}|${z.col_index}`

  for (const z of zones) {
    if (z.face_type !== 'door' || (z.hinge_side !== 'left' && z.hinge_side !== 'right')) continue
    if (seen.has(colOf(z))) continue   // one swing per column, as on a plain cabinet
    seen.add(colOf(z))
    const { l, r, out } = frontEdge(z)
    const [hinge, free] = z.hinge_side === 'left' ? [l, r] : [r, l]
    const len = Math.hypot(free.x - hinge.x, free.z - hinge.z) || 1
    const u = { x: (free.x - hinge.x) / len, z: (free.z - hinge.z) / len }
    swings.push({
      key: zoneKey(z), hinge, free, r: len,
      end: {
        x: hinge.x + len * (Math.cos(OPEN) * u.x + Math.sin(OPEN) * out.x),
        z: hinge.z + len * (Math.cos(OPEN) * u.z + Math.sin(OPEN) * out.z),
      },
    })
  }

  // Drawer lines: per facet column, stepped out row by row (top row first out).
  const byCol = new Map<string, ResolvedFaceZone[]>()
  for (const z of zones) {
    if (z.face_type !== 'drawer_face') continue
    const arr = byCol.get(colOf(z)) ?? []
    arr.push(z); byCol.set(colOf(z), arr)
  }
  for (const arr of byCol.values()) {
    arr.sort((a, b) => a.row_index - b.row_index)
    arr.forEach((z, i) => {
      const { l, r, out } = frontEdge(z)
      const len = Math.hypot(r.x - l.x, r.z - l.z) || 1
      drawers.push({ key: zoneKey(z), a: l, b: r, out, along: { x: (r.x - l.x) / len, z: (r.z - l.z) / len }, step: i + 1 })
    })
  }
  return { swings, drawers }
}

/** SVG arc sweep flag for an arc from `a` to `b` turning the short way about `c` (plan coords). */
export function sweepFlag(c: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): 0 | 1 {
  return (a.x - c.x) * (b.y - c.y) - (a.y - c.y) * (b.x - c.x) > 0 ? 1 : 0
}
