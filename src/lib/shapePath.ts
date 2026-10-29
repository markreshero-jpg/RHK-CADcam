// ── Part shape outline geometry ───────────────────────────────────────────────
// Shared by the Part Editor ortho views (SVG path), the part/cabinet 3D views
// (sampled polyline → line loop / extrusion), and op-vs-outline containment
// checks. Segments are the ShapeEditor emit format (see canvasDB.ShapeSegment),
// typed structurally here so src/lib doesn't import from the app layer:
// part-relative mm, y-down, ordered CCW, consecutive endpoints exactly equal.

export type ShapePt = { x: number; y: number }

export type ShapeSegmentLike = {
  type: string
  p0: ShapePt
  p1: ShapePt
  cp1?: ShapePt
  cp2?: ShapePt
  rx?: number
  ry?: number
  largeArc?: 0 | 1
  sweep?: 0 | 1
}

const f = (n: number) => Math.round(n * 100) / 100

// Exact SVG path (arcs stay arcs, beziers stay beziers). Renders directly in
// the ortho views — their SVG frame is the shape frame (mm, y-down).
export function shapeToSvgPath(segs: ShapeSegmentLike[]): string {
  if (segs.length === 0) return ''
  const parts: string[] = [`M ${f(segs[0].p0.x)} ${f(segs[0].p0.y)}`]
  for (const s of segs) {
    if (s.type === 'arc' && s.rx && s.ry) {
      parts.push(`A ${f(s.rx)} ${f(s.ry)} 0 ${s.largeArc ?? 0} ${s.sweep ?? 0} ${f(s.p1.x)} ${f(s.p1.y)}`)
    } else if (s.type === 'curve' && s.cp1 && s.cp2) {
      parts.push(`C ${f(s.cp1.x)} ${f(s.cp1.y)} ${f(s.cp2.x)} ${f(s.cp2.y)} ${f(s.p1.x)} ${f(s.p1.y)}`)
    } else {
      parts.push(`L ${f(s.p1.x)} ${f(s.p1.y)}`)
    }
  }
  parts.push('Z')
  return parts.join(' ')
}

// SVG endpoint-parameterised arc (φ=0 — the ShapeEditor emits axis-aligned
// arcs) → sampled points appended to `out`, excluding p0, including p1.
// W3C SVG spec F.6.5 conversion, then ~5° steps (`stepRad`).
function sampleArc(p0: ShapePt, p1: ShapePt, rx: number, ry: number, largeArc: 0 | 1, sweep: 0 | 1, out: ShapePt[], stepRad = Math.PI / 36) {
  const g = arcGeom(p0, p1, rx, ry, largeArc, sweep)
  if (!g) { out.push(p1); return }
  const steps = Math.max(2, Math.ceil(Math.abs(g.da) / stepRad))
  for (let i = 1; i <= steps; i++) {
    const t = g.a0 + (g.da * i) / steps
    out.push({ x: g.cx + g.rx * Math.cos(t), y: g.cy + g.ry * Math.sin(t) })
  }
}

/** Centre, (scaled-up) radii, start angle and signed sweep of an SVG arc; null when a radius is 0. */
export function arcGeom(p0: ShapePt, p1: ShapePt, rx: number, ry: number, largeArc: 0 | 1, sweep: 0 | 1) {
  rx = Math.abs(rx); ry = Math.abs(ry)
  if (!rx || !ry) return null
  const x1p = (p0.x - p1.x) / 2
  const y1p = (p0.y - p1.y) / 2
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s }
  const sign = largeArc !== sweep ? 1 : -1
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const co = den === 0 ? 0 : sign * Math.sqrt(Math.max(0, num / den))
  const cxp = co * (rx * y1p) / ry
  const cyp = co * -(ry * x1p) / rx
  const cx = cxp + (p0.x + p1.x) / 2
  const cy = cyp + (p0.y + p1.y) / 2
  const a0 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx)
  const a1 = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx)
  let da = a1 - a0
  if (!sweep && da > 0) da -= 2 * Math.PI
  if (sweep && da < 0) da += 2 * Math.PI
  return { cx, cy, rx, ry, a0, da }
}

// Closed outline → polyline (last point NOT repeated as first). Lines keep
// their endpoints; arcs sample at ~5°; cubics at 16 steps. `edgeSeg`, when
// given, is filled with the segment index of each output edge (point i → i+1).
export function sampleShapeOutline(segs: ShapeSegmentLike[], arcStepDeg = 5, edgeSeg?: number[]): ShapePt[] {
  const out: ShapePt[] = []
  if (segs.length === 0) return out
  out.push({ ...segs[0].p0 })
  for (const [k, s] of segs.entries()) {
    const from = out.length
    if (s.type === 'arc' && s.rx && s.ry) {
      sampleArc(s.p0, s.p1, s.rx, s.ry, s.largeArc ?? 0, s.sweep ?? 0, out, arcStepDeg * Math.PI / 180)
    } else if (s.type === 'curve' && s.cp1 && s.cp2) {
      const { p0, p1, cp1, cp2 } = s
      for (let i = 1; i <= 16; i++) {
        const t = i / 16, m = 1 - t
        out.push({
          x: m * m * m * p0.x + 3 * m * m * t * cp1.x + 3 * m * t * t * cp2.x + t * t * t * p1.x,
          y: m * m * m * p0.y + 3 * m * m * t * cp1.y + 3 * m * t * t * cp2.y + t * t * t * p1.y,
        })
      }
    } else {
      out.push({ ...s.p1 })
    }
    // Each point this segment added ends one of its edges.
    if (edgeSeg) for (let j = from; j < out.length; j++) edgeSeg[j - 1] = k
  }
  // The loop is closed, so the final p1 duplicates the first point — drop it.
  const first = out[0], last = out[out.length - 1]
  if (out.length > 1 && Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01) out.pop()
  if (edgeSeg) edgeSeg.length = out.length
  return out
}

// ── Part outlines with true arcs ─────────────────────────────────────────────
// A resolver part outline (case_parts / internal_parts `outline`) is a closed
// point loop. A point may carry `b`, the bulge of the edge from it to the next
// point (the DXF convention): b = tan(θ/4), θ = the arc's signed sweep, + = the
// angle increasing in the outline's own frame (SVG sweep-flag 1). No `b` = a
// straight edge, so rows written before arcs read as before.
// `e` (O5) = which of the part's edge-band flags the edge from this point takes
// (shaped horizontals: their fronts, sides and back no longer sit on the
// bounding rectangle). No `e` = the optimiser falls back to the rectangle side
// the edge lies on.
export type EdgeTag = 'top' | 'bottom' | 'left' | 'right'
export type OutlinePt = ShapePt & { b?: number; e?: EdgeTag }

const hasBulge = (p: OutlinePt) => typeof p.b === 'number' && Math.abs(p.b) > 1e-9

/** Centre and radius of the arc p → q with bulge b. */
export function bulgeArc(p: ShapePt, q: ShapePt, b: number): { c: ShapePt; r: number } {
  const dx = q.x - p.x, dy = q.y - p.y
  const chord = Math.hypot(dx, dy) || 1e-9
  // Centre sits off the chord midpoint along its left normal (−dy, dx) for b > 0.
  const k = (1 - b * b) / (4 * b)
  return {
    c: { x: (p.x + q.x) / 2 - dy * k, y: (p.y + q.y) / 2 + dx * k },
    r: chord * (1 + b * b) / (4 * Math.abs(b)),
  }
}

/** Each edge-tagged edge of an outline as a polyline (arcs sampled every
 *  `stepDeg`), with its tag — where the 3D view draws a shaped part's tape.
 *  An untagged straight edge takes the rectangle side it lies on (x = 0 left,
 *  x = max right, y = 0 top, y = max bottom), inner edges none — as the
 *  optimiser classifies them (notched gables: the front runs carry the tape,
 *  the notch sides don't). */
export function outlineEdges(pts: OutlinePt[], stepDeg = 5): { pts: ShapePt[]; e: EdgeTag }[] {
  const out: { pts: ShapePt[]; e: EdgeTag }[] = []
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const on = (a: number, b: number, v: number) => Math.abs(a - v) < 0.05 && Math.abs(b - v) < 0.05
  pts.forEach((a, i) => {
    const q = pts[(i + 1) % pts.length]
    const e: EdgeTag | undefined = a.e ?? (hasBulge(a) ? undefined
      : on(a.x, q.x, x0) ? 'left' : on(a.x, q.x, x1) ? 'right' : on(a.y, q.y, y0) ? 'top' : on(a.y, q.y, y1) ? 'bottom' : undefined)
    if (!e) return
    if (!hasBulge(a)) { out.push({ pts: [{ x: a.x, y: a.y }, { x: q.x, y: q.y }], e }); return }
    const { c, r } = bulgeArc(a, q, a.b!)
    const a0 = Math.atan2(a.y - c.y, a.x - c.x), sweep = 4 * Math.atan(a.b!)
    const n = Math.max(1, Math.ceil(Math.abs(sweep) * 180 / Math.PI / stepDeg))
    out.push({
      pts: Array.from({ length: n + 1 }, (_, k) => k === 0 ? { x: a.x, y: a.y } : k === n ? { x: q.x, y: q.y }
        : { x: c.x + r * Math.cos(a0 + sweep * k / n), y: c.y + r * Math.sin(a0 + sweep * k / n) }),
      e,
    })
  })
  return out
}

/** Outline → Shape Editor segments (bulged edges become arcs). */
export function outlineSegments(pts: OutlinePt[]): ShapeSegmentLike[] {
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length]
    const p0 = { x: p.x, y: p.y }, p1 = { x: q.x, y: q.y }
    if (!hasBulge(p)) return { type: 'line', p0, p1 }
    const r = bulgeArc(p, q, p.b!).r
    return { type: 'arc', p0, p1, rx: r, ry: r, largeArc: Math.abs(p.b!) > 1 ? 1 : 0, sweep: p.b! > 0 ? 1 : 0 }
  })
}

/** Plain point loop (arcs sampled every `stepDeg`) for clipping, extrusion, containment. */
export function sampleOutline(pts: OutlinePt[], stepDeg = 5): ShapePt[] {
  if (!pts.some(hasBulge)) return pts.map(p => ({ x: p.x, y: p.y }))
  return sampleShapeOutline(outlineSegments(pts), stepDeg)
}

/** Map every point; a reflection (`reflect`) turns each arc the other way. */
export function mapOutline(pts: OutlinePt[], f: (p: ShapePt) => ShapePt, reflect: boolean): OutlinePt[] {
  return pts.map(p => {
    const q = f(p)
    const o: OutlinePt = hasBulge(p) ? { x: q.x, y: q.y, b: reflect ? -p.b! : p.b! } : { x: q.x, y: q.y }
    if (p.e) o.e = p.e
    return o
  })
}

/** The same loop run backwards (each bulge moves to the edge's new start, negated). */
export function reverseOutline(pts: OutlinePt[]): OutlinePt[] {
  const n = pts.length
  return pts.map((_, k) => {
    const p = pts[n - 1 - k], e = pts[(2 * n - 2 - k) % n]
    const o: OutlinePt = hasBulge(e) ? { x: p.x, y: p.y, b: -e.b! } : { x: p.x, y: p.y }
    if (e.e) o.e = e.e
    return o
  })
}

export interface Circle { c: ShapePt; r: number }

const turnSweep = (P: ShapePt, Q: ShapePt, c: ShapePt, ccw: boolean) => {
  const a0 = Math.atan2(P.y - c.y, P.x - c.x), a1 = Math.atan2(Q.y - c.y, Q.x - c.x)
  const span = (d: number) => ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  return ccw ? span(a1 - a0) : -span(a0 - a1)
}

/**
 * Restore true arcs on a polygon that was sampled from arcs and then clipped
 * (shaped-cabinet bottoms, tops, rails, shelves): each run of short edges whose
 * ends lie on one of `circles` becomes one bulged edge. A run's end is snapped
 * onto the circle along its straight neighbour — a clip line cuts a sampled
 * chord, a hair inside the true circle. Nothing on a circle → plain points.
 */
export function restoreArcs(poly: ShapePt[], circles: Circle[]): OutlinePt[] {
  const n = poly.length
  const plain = poly.map(p => ({ x: p.x, y: p.y }))
  if (!circles.length || n < 3) return plain
  // Sampling is 5°, so a sampled chord sits ≤ r·(1 − cos 2.5°) ≈ 0.001·r inside.
  const tol = (C: Circle) => 0.002 * C.r + 0.05
  const on = (p: ShapePt, C: Circle) => Math.abs(Math.hypot(p.x - C.c.x, p.y - C.c.y) - C.r) <= tol(C)
  const ec = plain.map((a, i) => {
    const b = plain[(i + 1) % n]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    return circles.findIndex(C => len > 1e-6 && len <= 0.2 * C.r && on(a, C) && on(b, C))
  })
  // Start at a run boundary; one circle all the way round isn't a part outline.
  const s = ec.findIndex((c, i) => c !== ec[(i - 1 + n) % n])
  if (s < 0) return plain
  const pts = plain.map(p => ({ ...p }))
  const snap = (i: number, other: number, C: Circle) => {
    const P = pts[i], A = pts[other]
    if (Math.abs(Math.hypot(P.x - C.c.x, P.y - C.c.y) - C.r) < 1e-6) return
    const L = Math.hypot(P.x - A.x, P.y - A.y)
    if (L > 1e-6) {
      // |A + u·t − c| = r, root nearest P (t = L).
      const u = { x: (P.x - A.x) / L, y: (P.y - A.y) / L }
      const w = { x: A.x - C.c.x, y: A.y - C.c.y }
      const bq = u.x * w.x + u.y * w.y, cq = w.x * w.x + w.y * w.y - C.r * C.r
      const disc = bq * bq - cq
      if (disc >= 0) {
        const r1 = -bq - Math.sqrt(disc), r2 = -bq + Math.sqrt(disc)
        const t = Math.abs(r1 - L) < Math.abs(r2 - L) ? r1 : r2
        if (Math.abs(t - L) <= tol(C)) { P.x = A.x + u.x * t; P.y = A.y + u.y * t; return }
      }
    }
    const d = Math.hypot(P.x - C.c.x, P.y - C.c.y) || 1
    P.x = C.c.x + (P.x - C.c.x) * C.r / d; P.y = C.c.y + (P.y - C.c.y) * C.r / d
  }
  const out: { i: number; b?: number }[] = []
  for (let k = 0; k < n; ) {
    const i = (s + k) % n, ci = ec[i]
    if (ci < 0) { out.push({ i }); k++; continue }
    let m = k
    while (m + 1 < n && ec[(s + m + 1) % n] === ci) m++
    const iq = (s + m + 1) % n, C = circles[ci]
    if (ec[(i - 1 + n) % n] < 0) snap(i, (i - 1 + n) % n, C)
    if (ec[iq] < 0) snap(iq, (iq + 1) % n, C)
    const P = pts[i], nx = pts[(i + 1) % n]
    const ccw = (P.x - C.c.x) * (nx.y - P.y) - (P.y - C.c.y) * (nx.x - P.x) > 0
    out.push({ i, b: Math.tan(turnSweep(P, pts[iq], C.c, ccw) / 4) })
    k = m + 1
  }
  return out.map(o => (o.b ? { x: pts[o.i].x, y: pts[o.i].y, b: o.b } : { x: pts[o.i].x, y: pts[o.i].y }))
}

/** One move of a fitted loop: a straight edge, or an arc about `c`. */
export interface LoopMove { a: ShapePt; b: ShapePt; arc?: { c: ShapePt; ccw: boolean } }

/**
 * Fit arcs to a closed point loop with no record of where they came from (the
 * contour G-code's tool-centre loop): a run of ≥ 3 edges turning gently (each
 * ≤ 12°, one way) whose points all lie within `tol` of the circle through its
 * first, middle and last points becomes one arc — its ends exactly on it.
 * Square corners, beziers and plain polygons stay straight. A loop with no
 * sharp corner to start from comes back all straight.
 */
export function fitLoopArcs(loop: ShapePt[], tol = 0.025): LoopMove[] {
  const n = loop.length
  const lines = (pts: ShapePt[]) => pts.map((a, i) => ({ a, b: pts[(i + 1) % pts.length] }))
  if (n < 4) return lines(loop)
  const turn = (i: number) => {
    const a = loop[(i - 1 + n) % n], b = loop[i], c = loop[(i + 1) % n]
    const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y
    return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  }
  const GENTLE = 12 * Math.PI / 180
  const t0 = loop.map((_, i) => turn(i))
  const start = t0.findIndex(t => Math.abs(t) > GENTLE)
  if (start < 0) return lines(loop)
  const pts = [...loop.slice(start), ...loop.slice(0, start)]
  const tv = [...t0.slice(start), ...t0.slice(0, start)]
  const at = (i: number) => pts[i % n]
  const circle3 = (p: ShapePt, q: ShapePt, r: ShapePt): Circle | null => {
    const d = 2 * (p.x * (q.y - r.y) + q.x * (r.y - p.y) + r.x * (p.y - q.y))
    if (Math.abs(d) < 1e-9) return null
    const p2 = p.x * p.x + p.y * p.y, q2 = q.x * q.x + q.y * q.y, r2 = r.x * r.x + r.y * r.y
    const c = { x: (p2 * (q.y - r.y) + q2 * (r.y - p.y) + r2 * (p.y - q.y)) / d, y: (p2 * (r.x - q.x) + q2 * (p.x - r.x) + r2 * (q.x - p.x)) / d }
    const rad = Math.hypot(p.x - c.x, p.y - c.y)
    return rad < 1e5 ? { c, r: rad } : null
  }
  // Edges i..j (points i..j+1, j+1 may be n = back to the start).
  const fit = (i: number, j: number): Circle | null => {
    const sign = Math.sign(tv[i + 1])
    for (let v = i + 1; v <= j; v++) if (Math.abs(tv[v]) > GENTLE || Math.abs(tv[v]) < 1e-6 || Math.sign(tv[v]) !== sign) return null
    const C = circle3(at(i), at((i + j + 1) >> 1), at(j + 1))
    if (!C) return null
    for (let v = i; v <= j + 1; v++) if (Math.abs(Math.hypot(at(v).x - C.c.x, at(v).y - C.c.y) - C.r) > tol) return null
    return C
  }
  const out: LoopMove[] = []
  for (let i = 0; i < n; ) {
    let C = i + 2 < n ? fit(i, i + 2) : null
    if (!C) { out.push({ a: at(i), b: at(i + 1) }); i++; continue }
    let j = i + 2
    for (let next: Circle | null; j + 1 < n && (next = fit(i, j + 1)); j++) C = next
    out.push({ a: at(i), b: at(j + 1), arc: { c: C.c, ccw: tv[i + 1] > 0 } })
    i = j + 1
  }
  return out
}

// Ray-cast point-in-polygon (even-odd), with an optional boundary tolerance so
// points sitting ON an outline edge (edge-plane ops) count as inside.
export function pointInShape(p: ShapePt, poly: ShapePt[], tolMM = 0): boolean {
  if (poly.length < 3) return true
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  if (inside || tolMM <= 0) return inside
  // Boundary tolerance: nearest distance to any polygon edge.
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    const ex = a.x + t * dx - p.x, ey = a.y + t * dy - p.y
    if (ex * ex + ey * ey <= tolMM * tolMM) return true
  }
  return false
}
