// ── Benchtop outline geometry (Phase 3) ──────────────────────────────────────
// Spec: z_benchtop_builder/BENCHTOP-SPEC.md (P-a, P-b).
//
// A benchtop outline is a closed loop of Shape Editor segments in the ROOM
// frame (mm, plan y-down). Segment i runs from vertex i to vertex i+1, so
// vertex i = segs[i].p0 = segs[i-1].p1 and "edge i" = segs[i].
//
// `segments` is the source of truth. polygon / arc_segments / edge_tags are
// derived on every write (shapeWrite) for readers that still use them
// (snapping, the Phase 2 resolver) — never edit those directly.

import type {
  BenchtopInstance, BenchtopSegment, BenchtopJoinLine, BenchtopArcSegment,
  BenchtopEdgeTag, BenchtopEdgeProfile, BenchtopJoinType,
} from './types'

export type P = { x: number; y: number }

const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const dist = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y)
const clonePt = (p: P): P => ({ x: p.x, y: p.y })

// ── Legacy ↔ segments ────────────────────────────────────────────────────────

// Build segments from the pre-Phase-3 columns (rows written before the
// migration, or a freshly drawn polygon). Quadratic arc cp → cubic curve.
export function segmentsFromLegacy(
  polygon: P[],
  arcs: BenchtopArcSegment[] = [],
  tags: BenchtopEdgeTag[] = [],
): BenchtopSegment[] {
  const n = polygon.length
  if (n < 2) return []
  return polygon.map((p0, i) => {
    const p1 = polygon[(i + 1) % n]
    const wall = tags.some(t => t.edge_index === i && t.type === 'wall')
    const arc = arcs.find(a => a.edge_index === i)
    if (!arc) return { type: 'line', p0: clonePt(p0), p1: clonePt(p1), edge: { wall } }
    const cp = { x: arc.cpx, y: arc.cpy }
    return { type: 'curve', p0: clonePt(p0), p1: clonePt(p1), cp1: lerp(p0, cp, 2 / 3), cp2: lerp(p1, cp, 2 / 3), edge: { wall } }
  })
}

// The outline of a benchtop — stored segments, else built from legacy columns.
export function btSegments(bt: Pick<BenchtopInstance, 'segments' | 'polygon' | 'arc_segments' | 'edge_tags'>): BenchtopSegment[] {
  if (bt.segments && bt.segments.length) return bt.segments
  return segmentsFromLegacy(bt.polygon ?? [], bt.arc_segments ?? [], bt.edge_tags ?? [])
}

// Derived legacy columns. A curved edge becomes a quadratic whose control
// point makes it pass through the segment's true midpoint.
export function deriveLegacy(segs: BenchtopSegment[]): Pick<BenchtopInstance, 'polygon' | 'arc_segments' | 'edge_tags'> {
  const polygon = segs.map(s => clonePt(s.p0))
  const arc_segments: BenchtopArcSegment[] = []
  const edge_tags: BenchtopEdgeTag[] = []
  segs.forEach((s, i) => {
    if (s.type !== 'line') {
      const m = segMid(s)
      arc_segments.push({ edge_index: i, cpx: 2 * m.x - (s.p0.x + s.p1.x) / 2, cpy: 2 * m.y - (s.p0.y + s.p1.y) / 2 })
    }
    if (s.edge?.wall) edge_tags.push({ edge_index: i, type: 'wall' })
  })
  return { polygon, arc_segments, edge_tags }
}

// Everything to persist after an outline change.
export function shapeWrite(segs: BenchtopSegment[]): Pick<BenchtopInstance, 'segments' | 'polygon' | 'arc_segments' | 'edge_tags'> {
  return { segments: segs, ...deriveLegacy(segs) }
}

// ── Sampling / measurement ───────────────────────────────────────────────────

// SVG arc endpoint → centre parameterisation (W3C F.6.5, φ = 0).
function arcParams(s: BenchtopSegment) {
  let rx = Math.abs(s.rx ?? 0), ry = Math.abs(s.ry ?? 0)
  if (!rx || !ry) return null
  const x1p = (s.p0.x - s.p1.x) / 2, y1p = (s.p0.y - s.p1.y) / 2
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lam > 1) { const k = Math.sqrt(lam); rx *= k; ry *= k }
  const large = s.largeArc ?? 0, sweep = s.sweep ?? 0
  const sign = large !== sweep ? 1 : -1
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const co = den === 0 ? 0 : sign * Math.sqrt(Math.max(0, num / den))
  const cxp = co * (rx * y1p) / ry, cyp = co * -(ry * x1p) / rx
  const cx = cxp + (s.p0.x + s.p1.x) / 2, cy = cyp + (s.p0.y + s.p1.y) / 2
  const a0 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx)
  const a1 = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx)
  let da = a1 - a0
  if (!sweep && da > 0) da -= 2 * Math.PI
  if (sweep && da < 0) da += 2 * Math.PI
  return { cx, cy, rx, ry, a0, da }
}

// Point at parameter t ∈ [0,1] along a segment.
export function segPoint(s: BenchtopSegment, t: number): P {
  if (s.type === 'curve' && s.cp1 && s.cp2) {
    const m = 1 - t
    return {
      x: m * m * m * s.p0.x + 3 * m * m * t * s.cp1.x + 3 * m * t * t * s.cp2.x + t * t * t * s.p1.x,
      y: m * m * m * s.p0.y + 3 * m * m * t * s.cp1.y + 3 * m * t * t * s.cp2.y + t * t * t * s.p1.y,
    }
  }
  if (s.type === 'arc') {
    const a = arcParams(s)
    if (a) { const ang = a.a0 + a.da * t; return { x: a.cx + a.rx * Math.cos(ang), y: a.cy + a.ry * Math.sin(ang) } }
  }
  return lerp(s.p0, s.p1, t)
}

export const segMid = (s: BenchtopSegment): P => segPoint(s, 0.5)

// Points along a segment, start inclusive, end exclusive.
export function segSamples(s: BenchtopSegment, steps = 16): P[] {
  if (s.type === 'line') return [clonePt(s.p0)]
  const out: P[] = []
  for (let i = 0; i < steps; i++) out.push(segPoint(s, i / steps))
  return out
}

// Closed outline as a flat point ring (curves sampled).
export function outlinePoints(segs: BenchtopSegment[], steps = 16): P[] {
  return segs.flatMap(s => segSamples(s, steps))
}

export function segLength(s: BenchtopSegment): number {
  if (s.type === 'line') return dist(s.p0, s.p1)
  let len = 0, prev = s.p0
  for (let i = 1; i <= 32; i++) { const p = segPoint(s, i / 32); len += dist(prev, p); prev = p }
  return len
}

export function signedArea(pts: P[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return a / 2
}

export function outlineCentroid(segs: BenchtopSegment[]): P {
  const pts = outlinePoints(segs, 8)
  if (!pts.length) return { x: 0, y: 0 }
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }
}

export function outlineBounds(segs: BenchtopSegment[]) {
  const pts = outlinePoints(segs)
  if (!pts.length) return null
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

// Unit normal of edge i pointing OUT of the shape (works for either winding).
export function outwardNormal(segs: BenchtopSegment[], i: number): P {
  const s = segs[i]
  const a = segPoint(s, 0.45), b = segPoint(s, 0.55)
  const l = dist(a, b) || 1
  const left = { x: (b.y - a.y) / l, y: -(b.x - a.x) / l }
  // Positive signed area in y-down = clockwise on screen → left of travel is outside.
  return signedArea(outlinePoints(segs, 8)) >= 0 ? left : { x: -left.x, y: -left.y }
}

// ── SVG ──────────────────────────────────────────────────────────────────────

export function segD(s: BenchtopSegment): string {
  if (s.type === 'curve' && s.cp1 && s.cp2) return ` C ${s.cp1.x} ${s.cp1.y} ${s.cp2.x} ${s.cp2.y} ${s.p1.x} ${s.p1.y}`
  if (s.type === 'arc' && s.rx && s.ry) return ` A ${s.rx} ${s.ry} 0 ${s.largeArc ?? 0} ${s.sweep ?? 0} ${s.p1.x} ${s.p1.y}`
  return ` L ${s.p1.x} ${s.p1.y}`
}

// Closed outline + cutout holes (render with fill-rule evenodd).
export function outlinePath(segs: BenchtopSegment[], cutouts: P[][] = []): string {
  if (!segs.length) return ''
  let d = `M ${segs[0].p0.x} ${segs[0].p0.y}`
  for (const s of segs) d += segD(s)
  d += ' Z'
  for (const cut of cutouts) {
    if (cut.length < 3) continue
    d += ` M ${cut[0].x} ${cut[0].y}`
    for (let i = 1; i < cut.length; i++) d += ` L ${cut[i].x} ${cut[i].y}`
    d += ' Z'
  }
  return d
}

// Just one edge, as an open path.
export const edgePath = (s: BenchtopSegment) => `M ${s.p0.x} ${s.p0.y}${segD(s)}`

// ── Whole-shape transforms ───────────────────────────────────────────────────

// Apply a point map to every point of the outline. A reflection reverses the
// loop direction — pass mirror=true to keep the winding (and arc sweeps) valid.
export function mapSegments(segs: BenchtopSegment[], fn: (p: P) => P, mirror = false): BenchtopSegment[] {
  const mapped = segs.map(s => {
    const o: BenchtopSegment = { ...s, p0: fn(s.p0), p1: fn(s.p1) }
    if (s.cp1) o.cp1 = fn(s.cp1)
    if (s.cp2) o.cp2 = fn(s.cp2)
    if (s.edge) o.edge = { ...s.edge }
    return o
  })
  if (!mirror) return mapped
  // Reflection flips arc sweeps; reversing the loop flips them back — so the
  // reversed segment keeps its sweep, and only p0/p1 (+ cp1/cp2) swap.
  return mapped.reverse().map(s => {
    const o: BenchtopSegment = { ...s, p0: s.p1, p1: s.p0 }
    if (s.cp1 || s.cp2) { o.cp1 = s.cp2; o.cp2 = s.cp1 }
    return o
  })
}

export const mapJoins = (joins: BenchtopJoinLine[], fn: (p: P) => P): BenchtopJoinLine[] =>
  joins.map(j => ({ ...j, p0: fn(j.p0), p1: fn(j.p1) }))

export const mapCutouts = (cuts: P[][], fn: (p: P) => P): P[][] => cuts.map(c => c.map(fn))

export const translateFn = (dx: number, dy: number) => (p: P): P => ({ x: p.x + dx, y: p.y + dy })

export function rotateFn(c: P, rad: number) {
  const cos = Math.cos(rad), sin = Math.sin(rad)
  return (p: P): P => {
    const dx = p.x - c.x, dy = p.y - c.y
    return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
  }
}

// Everything that moves with the benchtop: outline, joins, cutouts.
export function transformBenchtop(
  bt: Pick<BenchtopInstance, 'segments' | 'polygon' | 'arc_segments' | 'edge_tags' | 'joins' | 'cutout_polygons'>,
  fn: (p: P) => P,
  mirror = false,
): Pick<BenchtopInstance, 'segments' | 'polygon' | 'arc_segments' | 'edge_tags' | 'joins' | 'cutout_polygons'> {
  return {
    ...shapeWrite(mapSegments(btSegments(bt), fn, mirror)),
    joins: mapJoins(bt.joins ?? [], fn),
    cutout_polygons: mapCutouts(bt.cutout_polygons ?? [], fn),
  }
}

// ── Vertex / edge edits ──────────────────────────────────────────────────────

// Move vertex vi; curve handles next to it travel with it.
export function moveVertex(segs: BenchtopSegment[], vi: number, pt: P): BenchtopSegment[] {
  const n = segs.length
  const prev = (vi - 1 + n) % n
  const old = segs[vi].p0
  const d = { x: pt.x - old.x, y: pt.y - old.y }
  return segs.map((s, i) => {
    if (i === vi) return { ...s, p0: clonePt(pt), ...(s.cp1 ? { cp1: { x: s.cp1.x + d.x, y: s.cp1.y + d.y } } : {}) }
    if (i === prev) return { ...s, p1: clonePt(pt), ...(s.cp2 ? { cp2: { x: s.cp2.x + d.x, y: s.cp2.y + d.y } } : {}) }
    return s
  })
}

// Split edge i at its midpoint (both halves keep the edge finish).
export function splitSegment(segs: BenchtopSegment[], i: number): BenchtopSegment[] {
  const s = segs[i]
  let halves: BenchtopSegment[]
  if (s.type === 'curve' && s.cp1 && s.cp2) {
    // de Casteljau at t = 0.5
    const a = lerp(s.p0, s.cp1, 0.5), b = lerp(s.cp1, s.cp2, 0.5), c = lerp(s.cp2, s.p1, 0.5)
    const ab = lerp(a, b, 0.5), bc = lerp(b, c, 0.5), m = lerp(ab, bc, 0.5)
    halves = [{ ...s, p1: m, cp1: a, cp2: ab }, { ...s, p0: m, cp1: bc, cp2: c }]
  } else if (s.type === 'arc') {
    const m = segMid(s)
    halves = [{ ...s, p1: m, largeArc: 0 }, { ...s, p0: m, largeArc: 0 }]
  } else {
    const m = lerp(s.p0, s.p1, 0.5)
    halves = [{ ...s, p1: m }, { ...s, p0: m }]
  }
  const out = [...segs]
  out.splice(i, 1, ...halves.map(h => ({ ...h, edge: h.edge ? { ...h.edge } : undefined })))
  return out
}

// Remove vertex vi: the two edges meeting there become one straight edge
// (it keeps the finish of the edge before the vertex).
export function deleteVertex(segs: BenchtopSegment[], vi: number): BenchtopSegment[] {
  const n = segs.length
  if (n <= 3) return segs
  const prev = (vi - 1 + n) % n
  const merged: BenchtopSegment = { type: 'line', p0: segs[prev].p0, p1: segs[vi].p1, edge: segs[prev].edge }
  const out = segs.map((s, i) => (i === prev ? merged : s))
  out.splice(vi, 1)
  return out
}

// Curve handle shown on the plan: the edge's midpoint. Dragging it to h makes
// the edge a curve through h (quadratic-equivalent cubic).
export function setCurveThrough(s: BenchtopSegment, h: P): BenchtopSegment {
  const cp = { x: 2 * h.x - (s.p0.x + s.p1.x) / 2, y: 2 * h.y - (s.p0.y + s.p1.y) / 2 }
  return { type: 'curve', p0: s.p0, p1: s.p1, cp1: lerp(s.p0, cp, 2 / 3), cp2: lerp(s.p1, cp, 2 / 3), ...(s.edge ? { edge: s.edge } : {}) }
}

// Straight → outward bulge (¼ of the chord); curved → straight.
export function toggleCurve(segs: BenchtopSegment[], i: number): BenchtopSegment[] {
  const s = segs[i]
  if (s.type !== 'line') return segs.map((x, k) => (k === i ? { type: 'line', p0: x.p0, p1: x.p1, edge: x.edge } : x))
  const n = outwardNormal(segs, i)
  const len = dist(s.p0, s.p1)
  const m = lerp(s.p0, s.p1, 0.5)
  return segs.map((x, k) => (k === i ? setCurveThrough(x, { x: m.x + n.x * len * 0.25, y: m.y + n.y * len * 0.25 }) : x))
}

// Corner treatment at vertex vi between two straight edges. Returns null when
// the corner isn't two lines or is too tight for the size asked.
function cornerTrim(segs: BenchtopSegment[], vi: number, trim: (theta: number) => number) {
  const n = segs.length
  const prev = (vi - 1 + n) % n
  const a = segs[prev], b = segs[vi]
  if (a.type !== 'line' || b.type !== 'line') return null
  const v = b.p0
  const la = dist(a.p0, v), lb = dist(v, b.p1)
  if (la < 1 || lb < 1) return null
  const ua = { x: (a.p0.x - v.x) / la, y: (a.p0.y - v.y) / la }   // vertex → back along a
  const ub = { x: (b.p1.x - v.x) / lb, y: (b.p1.y - v.y) / lb }   // vertex → along b
  const theta = Math.acos(Math.max(-1, Math.min(1, ua.x * ub.x + ua.y * ub.y)))   // interior angle
  if (theta < 0.01 || theta > Math.PI - 0.01) return null
  const t = trim(theta)
  if (t >= la * 0.95 || t >= lb * 0.95) return null
  const pa = { x: v.x + ua.x * t, y: v.y + ua.y * t }
  const pb = { x: v.x + ub.x * t, y: v.y + ub.y * t }
  // Turn direction of travel a → b (y-down: cross > 0 = clockwise on screen).
  const da = { x: -ua.x, y: -ua.y }
  const cross = da.x * ub.y - da.y * ub.x
  return { prev, a, b, pa, pb, cross }
}

// True-radius fillet: an arc of radius r tangent to both edges.
export function filletVertex(segs: BenchtopSegment[], vi: number, r: number): BenchtopSegment[] {
  const c = cornerTrim(segs, vi, theta => r / Math.tan(theta / 2))
  if (!c) return segs
  const arc: BenchtopSegment = { type: 'arc', p0: c.pa, p1: c.pb, rx: r, ry: r, largeArc: 0, sweep: c.cross > 0 ? 1 : 0, edge: c.b.edge ? { ...c.b.edge } : undefined }
  return insertCorner(segs, vi, c, arc)
}

// Straight chamfer, d back from the corner along each edge.
export function chamferVertex(segs: BenchtopSegment[], vi: number, d: number): BenchtopSegment[] {
  const c = cornerTrim(segs, vi, () => d)
  if (!c) return segs
  const line: BenchtopSegment = { type: 'line', p0: c.pa, p1: c.pb, edge: c.b.edge ? { ...c.b.edge } : undefined }
  return insertCorner(segs, vi, c, line)
}

function insertCorner(segs: BenchtopSegment[], vi: number, c: NonNullable<ReturnType<typeof cornerTrim>>, corner: BenchtopSegment) {
  const out = segs.map((s, i) => (i === c.prev ? { ...s, p1: c.pa } : i === vi ? { ...s, p0: c.pb } : s))
  out.splice(vi, 0, corner)
  return out
}

// Grow (+) / shrink (−) the outline by `amount` mm. Vertices move along the
// corner bisector; curve handles follow their end's vertex; arc radii change
// by the same amount (convex corners grow, concave shrink).
export function offsetSegments(segs: BenchtopSegment[], amount: number): BenchtopSegment[] {
  const n = segs.length
  if (n < 3) return segs
  const normals = segs.map((_, i) => outwardNormal(segs, i))
  const moved = segs.map((s, i) => {
    const n1 = normals[(i - 1 + n) % n], n2 = normals[i]
    let bx = n1.x + n2.x, by = n1.y + n2.y
    const bl = Math.hypot(bx, by)
    if (bl < 0.01) return { x: s.p0.x + n2.x * amount, y: s.p0.y + n2.y * amount }
    bx /= bl; by /= bl
    const dot = n1.x * bx + n1.y * by
    const k = Math.abs(dot) > 0.05 ? amount / dot : amount * 4
    return { x: s.p0.x + bx * k, y: s.p0.y + by * k }
  })
  const area = signedArea(outlinePoints(segs, 8))
  return segs.map((s, i) => {
    const p0 = moved[i], p1 = moved[(i + 1) % n]
    const d0 = { x: p0.x - s.p0.x, y: p0.y - s.p0.y }, d1 = { x: p1.x - s.p1.x, y: p1.y - s.p1.y }
    const o: BenchtopSegment = { ...s, p0, p1 }
    if (s.cp1) o.cp1 = { x: s.cp1.x + d0.x, y: s.cp1.y + d0.y }
    if (s.cp2) o.cp2 = { x: s.cp2.x + d1.x, y: s.cp2.y + d1.y }
    if (s.type === 'arc' && s.rx) {
      // Convex arc = turns the same way as the loop.
      const convex = (s.sweep === 1) === (area >= 0)
      const r = Math.max(1, s.rx + (convex ? amount : -amount))
      o.rx = r; o.ry = r
    }
    return o
  })
}

// ── In-plan shape editing (Phase 6) ──────────────────────────────────────────

// Where the line p + t·u meets the line q + s·v (null when ~parallel).
function lineMeet(p: P, u: P, q: P, v: P): P | null {
  const den = u.x * v.y - u.y * v.x
  if (Math.abs(den) < 1e-6 * Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)) return null
  const t = ((q.x - p.x) * v.y - (q.y - p.y) * v.x) / den
  return { x: p.x + u.x * t, y: p.y + u.y * t }
}

// Push (+, outward) / pull (−) straight edge i by d mm. It stays parallel; each
// end slides along its straight neighbour's line (so the neighbours stretch
// instead of tilting). A curved / parallel neighbour: that end just moves along
// the normal (its curve handles follow).
export function pushPullEdge(segs: BenchtopSegment[], i: number, d: number): BenchtopSegment[] {
  const s = segs[i]
  if (s.type !== 'line' || !d) return segs
  const n = segs.length
  const nrm = outwardNormal(segs, i)
  const a = { x: s.p0.x + nrm.x * d, y: s.p0.y + nrm.y * d }
  const b = { x: s.p1.x + nrm.x * d, y: s.p1.y + nrm.y * d }
  const u = { x: s.p1.x - s.p0.x, y: s.p1.y - s.p0.y }
  const prev = segs[(i - 1 + n) % n], next = segs[(i + 1) % n]
  const p0 = (prev.type === 'line' && lineMeet(a, u, prev.p0, { x: prev.p1.x - prev.p0.x, y: prev.p1.y - prev.p0.y })) || a
  const p1 = (next.type === 'line' && lineMeet(b, u, next.p1, { x: next.p0.x - next.p1.x, y: next.p0.y - next.p1.y })) || b
  return moveVertex(moveVertex(segs, i, p0), (i + 1) % n, p1)
}

export type EdgeLengthKeep = 'start' | 'both' | 'end'

// Make straight edge i `len` long. keep = the end that stays put ('both' =
// grow / shrink evenly). The moving end pushes the neighbouring edge (an end
// cap moves out square, the back edge stretches with it); a curved or
// in-line neighbour just has the shared corner moved along the edge.
export function setEdgeLength(segs: BenchtopSegment[], i: number, len: number, keep: EdgeLengthKeep): BenchtopSegment[] {
  const s = segs[i]
  if (s.type !== 'line' || len < 1) return segs
  const n = segs.length
  const L0 = dist(s.p0, s.p1)
  if (L0 < 1e-6) return segs
  const delta = len - L0
  if (Math.abs(delta) < 0.01) return segs
  const u = { x: (s.p1.x - s.p0.x) / L0, y: (s.p1.y - s.p0.y) / L0 }
  // Move the end at vertex vi (i+1 = end, i = start) outward along the edge by dd.
  const moveEnd = (sg: BenchtopSegment[], atEnd: boolean, dd: number) => {
    const ni = atEnd ? (i + 1) % n : (i - 1 + n) % n
    const nb = sg[ni]
    const dir = atEnd ? u : { x: -u.x, y: -u.y }
    const nn = outwardNormal(sg, ni)
    const k = dir.x * nn.x + dir.y * nn.y
    if (nb.type === 'line' && Math.abs(k) > 0.1) return pushPullEdge(sg, ni, dd * k)
    const vi = atEnd ? (i + 1) % n : i
    const v = sg[vi].p0
    return moveVertex(sg, vi, { x: v.x + dir.x * dd, y: v.y + dir.y * dd })
  }
  if (keep === 'start') return moveEnd(segs, true, delta)
  if (keep === 'end') return moveEnd(segs, false, delta)
  return moveEnd(moveEnd(segs, true, delta / 2), false, delta / 2)
}

// Add a corner on edge i at (the projection of) pt; a curved edge splits at its
// midpoint. Both halves keep the edge's finish.
export function splitSegmentAt(segs: BenchtopSegment[], i: number, pt: P): BenchtopSegment[] {
  const s = segs[i]
  if (s.type !== 'line') return splitSegment(segs, i)
  const L2 = (s.p1.x - s.p0.x) ** 2 + (s.p1.y - s.p0.y) ** 2
  if (L2 < 1) return segs
  const t = ((pt.x - s.p0.x) * (s.p1.x - s.p0.x) + (pt.y - s.p0.y) * (s.p1.y - s.p0.y)) / L2
  if (t < 0.02 || t > 0.98) return segs
  const m = lerp(s.p0, s.p1, t)
  const out = [...segs]
  out.splice(i, 1, { ...s, p1: m, edge: s.edge ? { ...s.edge } : undefined }, { ...s, p0: m, edge: s.edge ? { ...s.edge } : undefined })
  return out
}

// The top's size across straight edge i: how far the outline reaches behind
// it, along its inward normal (front edge → depth, end edge → length). The
// stretch box shows / takes this, like a cabinet's width.
export function sizeAcross(segs: BenchtopSegment[], i: number): number {
  const s = segs[i]
  const n = outwardNormal(segs, i)
  let m = 0
  for (const p of outlinePoints(segs, 8)) m = Math.max(m, (s.p0.x - p.x) * n.x + (s.p0.y - p.y) * n.y)
  return m
}

// After a reshape, pull join ends back onto the outline (within tol mm).
export function resnapJoins(segs: BenchtopSegment[], joins: BenchtopJoinLine[], tol = 150): BenchtopJoinLine[] {
  const snap = (p: P) => { const h = nearestOnOutline(segs, p); return h && h.d <= tol ? clonePt(h.pt) : p }
  return joins.map(j => ({ ...j, p0: snap(j.p0), p1: snap(j.p1) }))
}

// ── Edge profiles ────────────────────────────────────────────────────────────

const PROFILE_PALETTE = ['#f59e0b', '#2dd4bf', '#a78bfa', '#f472b6', '#4ade80', '#60a5fa', '#fb923c', '#e879f9', '#facc15', '#38bdf8']

// Stable display colour for a profile (waterfall / apron get fixed colours so
// the part-generating finishes always read the same on the plan).
export function edgeProfileColor(p: Pick<BenchtopEdgeProfile, 'id' | 'generates'> | null | undefined): string {
  if (!p) return '#14b8a6'
  if (p.generates === 'waterfall') return '#c084fc'
  if (p.generates === 'apron') return '#f472b6'
  let h = 0
  for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) >>> 0
  return PROFILE_PALETTE[h % PROFILE_PALETTE.length]
}

// The profile an edge actually uses: its own, else the method default.
// Wall edges and joints with another top (Phase 7c) have none (P-d).
export function effectiveProfileId(s: BenchtopSegment, methodDefault: string | null | undefined): string | null {
  if (s.edge?.wall || s.edge?.joint) return null
  return s.edge?.profile_id ?? methodDefault ?? null
}

// Waterfall leg ↔ top joint. Mitre (default): the leg runs to the top surface,
// 45° joint at the corner. Butt: the top sits ON the leg — the leg stops at the
// underside and the top's end runs over it.
export const waterfallJoin = (s: BenchtopSegment): BenchtopJoinType => s.edge?.waterfall_join ?? 'mitre'

// Built-up waterfall (Mark 2026-10-29, RHK6592 "60 top"): where a waterfall
// leg's end meets a straight mitred apron deeper than the top (MA60 on a 20
// slab), that end gets a FACE piece the apron's drop wide — mitred to the leg
// (vertical 45°) and to the apron (45° in the front plane) — plus a short
// RETURN behind it, so the leg reads as thick as the apron. start = the leg's
// p0 end (meets edge i−1), end = its p1 end (edge i+1); 0 = no build-up there.
export const WATERFALL_RETURN_MM = 100
/** The edge's return length (set per waterfall edge — e.g. 300 to reach the cabinets past an island's seating overhang). */
export const waterfallReturn = (s: BenchtopSegment): number => s.edge?.waterfall_return_mm ?? WATERFALL_RETURN_MM
export interface WaterfallBuildUp { start: number; end: number; depth: number }
export function waterfallBuildUp(
  segs: BenchtopSegment[], i: number,
  profiles: Record<string, Pick<BenchtopEdgeProfile, 'generates' | 'apron_drop_mm'>>,
  defaultProfileId: string | null | undefined, T: number,
): WaterfallBuildUp {
  const n = segs.length
  const drop = (j: number) => {
    const s = segs[(j + n) % n]
    const pid = s.type === 'line' ? effectiveProfileId(s, defaultProfileId) : null
    const p = pid ? profiles[pid] : undefined
    const d = p?.generates === 'apron' ? Number(p.apron_drop_mm) || 0 : 0
    return d > T ? d : 0
  }
  const start = drop(i - 1), end = drop(i + 1)
  return { start, end, depth: Math.max(T, start, end) }
}

// ── Join lines ───────────────────────────────────────────────────────────────

// Where the line through `a` along direction `dir` crosses the outline —
// the crossing nearest `near` (ortho join drawing).
export function lineHitOnOutline(segs: BenchtopSegment[], a: P, dir: P, near: P): P | null {
  let best: P | null = null, bestD = Infinity
  for (const s of segs) {
    const pts = s.type === 'line' ? [s.p0, s.p1] : [...segSamples(s, 24), s.p1]
    for (let k = 0; k < pts.length - 1; k++) {
      const p = pts[k], q = pts[k + 1]
      const ex = q.x - p.x, ey = q.y - p.y
      const den = dir.x * ey - dir.y * ex
      if (Math.abs(den) < 1e-9) continue
      const u = ((p.x - a.x) * dir.y - (p.y - a.y) * dir.x) / den   // along edge
      if (u < 0 || u > 1) continue
      const hit = { x: p.x + ex * u, y: p.y + ey * u }
      if (dist(hit, a) < 1) continue
      const d = dist(hit, near)
      if (d < bestD) { bestD = d; best = hit }
    }
  }
  return best
}

// Nearest point on the outline to p (for snapping join ends onto edges).
export function nearestOnOutline(segs: BenchtopSegment[], p: P): { pt: P; edge: number; d: number } | null {
  let best: { pt: P; edge: number; d: number } | null = null
  segs.forEach((s, i) => {
    const pts = s.type === 'line' ? [s.p0, s.p1] : [...segSamples(s, 24), s.p1]
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1]
      const abx = b.x - a.x, aby = b.y - a.y
      const L = abx * abx + aby * aby
      const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / L)) : 0
      const q = { x: a.x + abx * t, y: a.y + aby * t }
      const d = dist(p, q)
      if (!best || d < best.d) best = { pt: q, edge: i, d }
    }
  })
  return best
}
