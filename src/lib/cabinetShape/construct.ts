// ── Shaped-cabinet construction geometry ──────────────────────────────────────
// z_cabinet_shape Phase 2. Pure plan-view (x along the width, y = depth from
// the back) geometry the resolver builds a shaped carcass from:
//   canonicalSegments  footprint evaluated + wound so the interior is on the
//                      LEFT of every edge (left normal (-uy, ux) points in)
//   insetPolygon       the inside of the carcass: the outline pushed in by
//                      each edge's panel thickness (0 on fronts / open edges)
//   clipToRect / clipToConvex   Sutherland–Hodgman (clip region convex)
//   panelSpan          where a square-ended panel starts/stops along its edge
//                      (butt joints only — mitres/bevels are Phase 4)

import { evaluateFootprint, isDegenerate, type Footprint, type FootprintSegment } from './footprint'
import { sampleShapeOutline, type ShapePt } from '../shapePath'

const EPS = 1e-6

export function signedArea(pts: ShapePt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

/** Segments evaluated at this size, degenerate ones dropped, positive winding. */
export function canonicalSegments(fp: Footprint, w: number, d: number): FootprintSegment[] {
  const segs = evaluateFootprint(fp, { w, d }).filter(s => !isDegenerate(s))
  if (segs.length < 3) return segs
  if (signedArea(sampleShapeOutline(segs)) >= 0) return segs
  return segs.slice().reverse().map(s => ({
    ...s, p0: s.p1, p1: s.p0,
    ...(s.type === 'arc' ? { sweep: (s.sweep ? 0 : 1) as 0 | 1 } : {}),
  }))
}

export interface EdgeFrame { u: ShapePt; n: ShapePt; len: number }

/** Unit direction, inward (left) normal and length of a straight edge. */
export function edgeFrame(s: { p0: ShapePt; p1: ShapePt }): EdgeFrame {
  const dx = s.p1.x - s.p0.x, dy = s.p1.y - s.p0.y
  const len = Math.hypot(dx, dy) || 1
  const u = { x: dx / len, y: dy / len }
  return { u, n: { x: -u.y, y: u.x }, len }
}

const dot = (a: ShapePt, b: ShapePt) => a.x * b.x + a.y * b.y

/**
 * Sample the outline into sub-edges, each carrying its inset distance, and
 * offset every sub-edge inward. Consecutive offset lines meet at the new
 * vertices; parallel neighbours (arc samples, collinear runs) just take the
 * offset point. `offsetOf` gives the inset for a segment (0 = stays on the outline).
 */
export function insetPolygon(segs: FootprintSegment[], offsetOf: (s: FootprintSegment) => number): ShapePt[] {
  return insetPolygonTagged(segs, offsetOf).pts
}

// Below this turn, two edges with different insets get a step between them
// instead of a mitre — e.g. a side panel's inner face running into the
// tangent start of an open arc, whose near-parallel offset lines would
// otherwise meet hundreds of mm away (a spike to the square corner).
const BEVEL_SIN = Math.sin(10 * Math.PI / 180)

/**
 * insetPolygon, plus the sub-edge each vertex starts (`sub[i]`). Sub-edges are
 * numbered in order, arcs sampled as by sampleShapeOutline. A stepped joint
 * adds a vertex whose outgoing edge is the step; it is tagged with the edge
 * before the step.
 */
export function insetPolygonTagged(
  segs: FootprintSegment[], offsetOf: (s: FootprintSegment) => number,
): { pts: ShapePt[]; sub: number[] } {
  const sub: { a: ShapePt; b: ShapePt; o: number }[] = []
  for (const s of segs) {
    const o = offsetOf(s)
    const pts = s.type === 'arc'
      ? sampleShapeOutline([s, { type: 'line', p0: s.p1, p1: s.p0 }])
      : [s.p0, s.p1]
    for (let i = 0; i + 1 < pts.length; i++) sub.push({ a: pts[i], b: pts[i + 1], o })
  }
  const lines = sub.map(e => {
    const f = edgeFrame({ p0: e.a, p1: e.b })
    return {
      p: { x: e.a.x + f.n.x * e.o, y: e.a.y + f.n.y * e.o },
      end: { x: e.b.x + f.n.x * e.o, y: e.b.y + f.n.y * e.o },
      u: f.u, o: e.o,
    }
  })
  const pts: ShapePt[] = [], tags: number[] = []
  const n = lines.length
  for (let i = 0; i < n; i++) {
    const ia = (i - 1 + n) % n, A = lines[ia], B = lines[i]
    const cross = A.u.x * B.u.y - A.u.y * B.u.x
    const nearParallel = Math.abs(cross) < BEVEL_SIN && A.u.x * B.u.x + A.u.y * B.u.y > 0
    if (nearParallel && Math.abs(A.o - B.o) > 1e-6) {
      pts.push(A.end); tags.push(ia)
      pts.push(B.p); tags.push(i)
      continue
    }
    if (Math.abs(cross) < 1e-9) { pts.push(B.p); tags.push(i); continue }
    // A.p + A.u·s = B.p + B.u·t  → solve for s
    const s = ((B.p.x - A.p.x) * B.u.y - (B.p.y - A.p.y) * B.u.x) / cross
    pts.push({ x: A.p.x + A.u.x * s, y: A.p.y + A.u.y * s }); tags.push(i)
  }
  return { pts, sub: tags }
}

/** Clip `subject` by a convex polygon (any winding). */
export function clipToConvex(subject: ShapePt[], clip: ShapePt[]): ShapePt[] {
  const ccw = signedArea(clip) >= 0
  let out = subject
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length]
    const side = (p: ShapePt) => {
      const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
      return ccw ? c : -c
    }
    const input = out
    out = []
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length]
      const sp = side(p), sq = side(q)
      if (sp >= -EPS) out.push(p)
      if ((sp >= -EPS) !== (sq >= -EPS)) {
        const t = sp / (sp - sq)
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })
      }
    }
  }
  return dedupe(out)
}

export function clipToRect(subject: ShapePt[], x0: number, y0: number, x1: number, y1: number): ShapePt[] {
  return clipToConvex(subject, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }])
}

function dedupe(pts: ShapePt[]): ShapePt[] {
  const out: ShapePt[] = []
  for (const p of pts) {
    const q = out[out.length - 1]
    if (!q || Math.abs(p.x - q.x) > 0.01 || Math.abs(p.y - q.y) > 0.01) out.push(p)
  }
  if (out.length > 1) {
    const f = out[0], l = out[out.length - 1]
    if (Math.abs(f.x - l.x) <= 0.01 && Math.abs(f.y - l.y) <= 0.01) out.pop()
  }
  return out
}

export function bbox(pts: ShapePt[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
  return { x0, y0, x1, y1 }
}

/** True when the polygon is (to 0.5 mm) its own bounding rectangle. */
export function isBoxLike(pts: ShapePt[]): boolean {
  const b = bbox(pts)
  return Math.abs(Math.abs(signedArea(pts)) - (b.x1 - b.x0) * (b.y1 - b.y0)) < 0.5 * Math.max(1, b.x1 - b.x0 + b.y1 - b.y0)
}

/**
 * How far a square-ended panel on edge `e` must stand back from the vertex it
 * shares with neighbour `nb` (which runs AWAY from the vertex along `away`).
 *  - stops: the neighbour's panel runs through; clear its inner face.
 *  - always: keep the panel's inner face inside the outline (acute corners).
 * `away` is the panel's own direction pointing away from the vertex. `t` is
 * this panel's thickness, `tn` the neighbour panel's (default the same).
 */
export function vertexTrim(
  away: ShapePt, n: ShapePt, nbN: ShapePt, t: number, stops: boolean, tn = t,
): number {
  const k = dot(nbN, away)
  if (k <= EPS) return 0                       // reflex / parallel: nothing to clear
  const nn = dot(nbN, n)
  let s = Math.max(0, (-t * nn) / k)           // inner face meets the neighbour's outline
  if (stops) s = Math.max(s, tn / k, (tn - t * nn) / k)
  return s
}

const cross = (a: ShapePt, b: ShapePt) => a.x * b.y - a.y * b.x

/**
 * Along `away` from vertex V: where the panel face `off` in from the outline
 * (0 = outer face, t = inner face; `n` = the panel's inward normal) meets the
 * line through P along d. Parallel → 0.
 */
export function faceHit(V: ShapePt, away: ShapePt, n: ShapePt, off: number, P: ShapePt, d: ShapePt): number {
  const k = cross(away, d)
  if (Math.abs(k) < 1e-9) return 0
  const w = { x: P.x - V.x - n.x * off, y: P.y - V.y - n.y * off }
  return cross(w, d) / k
}

/** Interior angle (degrees, 0–360) at the vertex where edge `a` ends and edge `b` starts (positive winding). */
export function interiorAngle(a: { p0: ShapePt; p1: ShapePt }, b: { p0: ShapePt; p1: ShapePt }): number {
  const u = edgeFrame(a).u, v = edgeFrame(b).u
  return 180 - Math.atan2(cross(u, v), dot(u, v)) * 180 / Math.PI
}

/**
 * An angled panel end (z_cabinet_shape 4a). The end is the plane through the
 * line L; it cuts the outer face `sOut` and the inner face `sIn` along `away`
 * from the vertex. sIn > sOut = the inner face is the shorter (bevel leans in).
 *   flush  L = the neighbour's outline (a front / open edge, or the through
 *          panel of a butt): the end lies in the neighbour's outer plane
 *   stop   L = the neighbour panel's inner face (the stopping panel of a butt)
 *   mitre  L = outline vertex → inner vertex (both panels, corner line)
 */
export function angledEnd(
  kind: 'flush' | 'stop' | 'mitre',
  V: ShapePt, away: ShapePt, n: ShapePt, nb: EdgeFrame, t: number, tn = t,
): { sOut: number; sIn: number } {
  // The neighbour panel's inner face (`tn` = its thickness; this panel's is `t`).
  const inner = { x: V.x + nb.n.x * tn, y: V.y + nb.n.y * tn }
  if (kind === 'flush') return { sOut: 0, sIn: faceHit(V, away, n, t, V, nb.u) }
  if (kind === 'stop') return { sOut: faceHit(V, away, n, 0, inner, nb.u), sIn: faceHit(V, away, n, t, inner, nb.u) }
  return { sOut: 0, sIn: faceHit(V, away, n, t, inner, nb.u) }
}
