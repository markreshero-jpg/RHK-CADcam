// ── Benchtop slab as one solid (3D view) ─────────────────────────────────────
// Spec: z_benchtop_builder/BENCHTOP-SPEC.md (P-i, waterfall joints).
//
// The slab is lofted between two outlines with the same point count: the TOP
// face (the full outline, at topZ) and the UNDERSIDE (at `under`), where each
// mitred waterfall edge is set back by the thickness. The side wall of a
// mitred edge then IS the 45° bevel the leg meets, so the 3D view shows one
// diagonal joint — not a separate wedge piece whose own outline read as a
// butt joint as well (Mark, 2026-10-12). Every other side stays vertical.
// Cutouts go straight through.
//
// Plan (x, y) maps to world (x, height, y), as everywhere in the room view.

import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three'
import type { BenchtopSegment } from './types'
import { segPoint, segSamples, signedArea, outlinePoints } from './benchtopGeometry'

type P = { x: number; y: number }

// ── Mitred edges: the underside outline ──────────────────────────────────────
// A mitred waterfall or a mitred apron (profile generates = 'apron') sets the
// slab's underside back by `d` (the thickness) on its edge, so that side of
// the slab is the 45° bevel the leg / apron strip meets. Curved edges are
// offset point by point along their normal; where two set-back edges meet, the
// corner is the meeting point of the two offset edges (so a mitre runs into
// the corner, and an apron round an R corner follows the curve).

/** Outward unit normal of a segment at parameter t. */
function normalAt(s: BenchtopSegment, t: number, cw: boolean): P {
  const e = 1e-3
  const a = segPoint(s, Math.max(0, t - e)), b = segPoint(s, Math.min(1, t + e))
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const left = { x: (b.y - a.y) / l, y: -(b.x - a.x) / l }
  return cw ? left : { x: -left.x, y: -left.y }
}

/** The point `d` in from p along n — or, at a corner, `da` in from edge a and `db` from edge b. */
function insetCorner(p: P, na: P, da: number, nb: P, db: number): P {
  const det = na.x * nb.y - na.y * nb.x
  if (Math.abs(det) < 1e-3) {   // tangent (line into an arc) or straight on: the deeper set-back wins
    const d = Math.max(da, db)
    return { x: p.x - na.x * d, y: p.y - na.y * d }
  }
  const wx = (da * nb.y - na.y * db) / det, wy = (na.x * db - da * nb.x) / det
  return { x: p.x - wx, y: p.y - wy }
}

/**
 * The underside outline for `outlinePoints(segs, steps)` (same points, same
 * order) with each segment i set back by `setback(i)` mm (0 = straight down).
 * `start[i]` = the index of segment i's first point in both rings.
 */
export function undersideOutline(segs: BenchtopSegment[], setback: (i: number) => number, steps: number): { top: P[]; bottom: P[]; start: number[] } {
  const top = outlinePoints(segs, steps)
  const cw = signedArea(outlinePoints(segs, 8)) >= 0
  const bottom: P[] = [], start: number[] = []
  segs.forEach((s, i) => {
    start.push(bottom.length)
    const d = setback(i)
    const prev = (i - 1 + segs.length) % segs.length
    const pts = segSamples(s, steps)
    pts.forEach((p, k) => {
      if (k === 0) {
        bottom.push(insetCorner(p, normalAt(segs[prev], 1, cw), setback(prev), normalAt(s, 0, cw), d))
      } else {
        const n = normalAt(s, k / steps, cw)
        bottom.push({ x: p.x - n.x * d, y: p.y - n.y * d })
      }
    })
  })
  return { top, bottom, start }
}

/**
 * A mitred apron strip under one edge: `outer` = the edge's top-face points
 * (its samples + its end point), `inner` = the matching underside points (set
 * back by the thickness). Its outer face runs from the top surface (topZ) down
 * to `bottomZ`, its inner face from the underside (`under`) down, and its top
 * is the 45° mitre against the slab. Plan (x, y) → world (x, height, y).
 */
export function apronStrip(
  outer: P[], inner: P[], topZ: number, under: number, bottomZ: number,
  /** Built-up waterfall ends: no cap there (an apronCornerTris wedge joins on), plus the wedges' triangles. */
  opt: { capStart?: boolean; capEnd?: boolean; extra?: number[] } = {},
): BufferGeometry {
  const pos: number[] = [...(opt.extra ?? [])]
  const w = (p: P, h: number) => [p.x, h, p.y]
  const tri = (a: number[], b: number[], c: number[], dir: number[]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] >= 0) pos.push(...a, ...b, ...c)
    else pos.push(...a, ...c, ...b)
  }
  const quad = (a: number[], b: number[], c: number[], d: number[], dir: number[]) => { tri(a, b, c, dir); tri(a, c, d, dir) }
  for (let k = 0; k < outer.length - 1; k++) {
    const o0 = outer[k], o1 = outer[k + 1], i0 = inner[k], i1 = inner[k + 1]
    const out = [(o0.x + o1.x - i0.x - i1.x) / 2, 0, (o0.y + o1.y - i0.y - i1.y) / 2]   // outward, horizontal
    quad(w(o0, bottomZ), w(o1, bottomZ), w(o1, topZ), w(o0, topZ), out)                        // outer face
    quad(w(i0, bottomZ), w(i1, bottomZ), w(i1, under), w(i0, under), out.map(v => -v))         // inner face
    quad(w(o0, bottomZ), w(o1, bottomZ), w(i1, bottomZ), w(i0, bottomZ), [0, -1, 0])           // bottom
    quad(w(o0, topZ), w(o1, topZ), w(i1, under), w(i0, under), [-out[0], 1, -out[2]])        // mitre (faces up + in, under the slab)
  }
  // End caps (where the apron stops short of a non-apron edge, or meets a wall).
  const cap = (o: P, i: P, along: P) => {
    const dir = [along.x, 0, along.y]
    tri(w(o, bottomZ), w(o, topZ), w(i, under), dir)
    tri(w(o, bottomZ), w(i, under), w(i, bottomZ), dir)
  }
  const n = outer.length - 1
  if (opt.capStart !== false) cap(outer[0], inner[0], { x: outer[0].x - outer[1].x, y: outer[0].y - outer[1].y })
  if (opt.capEnd !== false) cap(outer[n], inner[n], { x: outer[n].x - outer[n - 1].x, y: outer[n].y - outer[n - 1].y })
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/**
 * Built-up waterfall corner (benchtopGeometry waterfallBuildUp): the end of a
 * mitred apron over the leg's face piece. c = the outer corner, along = unit
 * along the apron away from c, inward = unit into the top (= along the leg).
 * The wedge fills the apron's first D mm above the front-plane 45° (v = topZ − u)
 * the face piece stops at; the apron strip itself starts D along. Triangles
 * (positions) for apronStrip's `extra` — its open face is the strip's start.
 */
export function apronCornerTris(c: P, along: P, inward: P, D: number, T: number, topZ: number): number[] {
  const pt = (a: number, u: number, v: number) => [c.x + inward.x * a + along.x * u, v, c.y + inward.y * a + along.y * u]
  const F1 = pt(0, 0, topZ), F2 = pt(0, D, topZ), F3 = pt(0, D, topZ - D)
  const B1 = pt(T, T, topZ - T), B2 = pt(T, D, topZ - T), B3 = pt(T, D, topZ - D)
  const pos: number[] = []
  const tri = (a: number[], b: number[], c2: number[], dir: number[]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c2[0] - a[0], c2[1] - a[1], c2[2] - a[2]]
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] >= 0) pos.push(...a, ...b, ...c2)
    else pos.push(...a, ...c2, ...b)
  }
  const out = [-inward.x, 0, -inward.y], up = [inward.x, 1, inward.y], dn = [-along.x, -1, -along.y]
  tri(F1, F2, F3, out)                           // front face
  tri(B1, B2, B3, [inward.x, 0, inward.y])       // inner face
  tri(F1, F2, B2, up); tri(F1, B2, B1, up)       // mitre under the slab
  tri(F1, F3, B3, dn); tri(F1, B3, B1, dn)       // 45° onto the face piece
  return pos
}

function inPoly(p: P, poly: P[]): boolean {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

/**
 * top / bottom: the outer outline at the top face and the underside (same
 * length, point i ↔ point i). holes: cutouts (vertical). Returns a non-indexed
 * geometry with consistent outward winding (so drei <Edges> sees real corners only).
 */
export function loftSlab(top: P[], bottom: P[], holes: P[][], topZ: number, under: number): BufferGeometry {
  const pos: number[] = []
  // The solid's cross-section at height h: the outline blended from the
  // underside (h = under) to the top face (h = topZ), minus the cutouts.
  const solidAt = (p: P, h: number) => {
    const t = Math.min(1, Math.max(0, (h - under) / (topZ - under || 1)))
    const poly = top.map((q, i) => ({ x: bottom[i].x + (q.x - bottom[i].x) * t, y: bottom[i].y + (q.y - bottom[i].y) * t }))
    return inPoly(p, poly) && !holes.some(hl => inPoly(p, hl))
  }
  // Push a triangle, flipped if its normal doesn't point the way `outward` says.
  const tri = (a: number[], b: number[], c: number[], outward: (n: number[], m: number[]) => boolean) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
    if (outward(n, m)) pos.push(...a, ...b, ...c)
    else pos.push(...a, ...c, ...b)
  }
  const w = (p: P, h: number) => [p.x, h, p.y]

  // Caps (triangulated with the cutouts as holes).
  const cap = (outline: P[], h: number, up: boolean) => {
    const faces = ShapeUtils.triangulateShape(outline.map(p => new Vector2(p.x, p.y)), holes.map(hl => hl.map(p => new Vector2(p.x, p.y))))
    const all = [...outline, ...holes.flat()]
    for (const [i, j, k] of faces) tri(w(all[i], h), w(all[j], h), w(all[k], h), n => (up ? n[1] > 0 : n[1] < 0))
  }
  cap(top, topZ, true)
  cap(bottom, under, false)

  // Side walls (incl. the slanted mitre face): outward = a small step along the
  // face normal leaves the solid's cross-section at that height.
  const side = (n: number[], m: number[]) => {
    const l = Math.hypot(n[0], n[1], n[2]) || 1
    const step = 0.5
    return !solidAt({ x: m[0] + (n[0] / l) * step, y: m[2] + (n[2] / l) * step }, m[1] + (n[1] / l) * step)
  }
  const wall = (a0: P, a1: P, b0: P, b1: P) => {   // a = top edge, b = matching underside edge
    tri(w(a0, topZ), w(a1, topZ), w(b1, under), side)
    tri(w(a0, topZ), w(b1, under), w(b0, under), side)
  }
  for (let i = 0; i < top.length; i++) {
    const j = (i + 1) % top.length
    wall(top[i], top[j], bottom[i], bottom[j])
  }
  for (const h of holes) for (let i = 0; i < h.length; i++) {
    const j = (i + 1) % h.length
    wall(h[i], h[j], h[i], h[j])
  }

  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}
