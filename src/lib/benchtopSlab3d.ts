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

type P = { x: number; y: number }

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
