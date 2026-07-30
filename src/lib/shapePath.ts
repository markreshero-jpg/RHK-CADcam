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
// W3C SVG spec F.6.5 conversion, then ~5° steps.
function sampleArc(p0: ShapePt, p1: ShapePt, rx: number, ry: number, largeArc: 0 | 1, sweep: 0 | 1, out: ShapePt[]) {
  rx = Math.abs(rx); ry = Math.abs(ry)
  if (!rx || !ry) { out.push(p1); return }
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
  const steps = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 36)))
  for (let i = 1; i <= steps; i++) {
    const t = a0 + (da * i) / steps
    out.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) })
  }
}

// Closed outline → polyline (last point NOT repeated as first). Lines keep
// their endpoints; arcs sample at ~5°; cubics at 16 steps.
export function sampleShapeOutline(segs: ShapeSegmentLike[]): ShapePt[] {
  const out: ShapePt[] = []
  if (segs.length === 0) return out
  out.push({ ...segs[0].p0 })
  for (const s of segs) {
    if (s.type === 'arc' && s.rx && s.ry) {
      sampleArc(s.p0, s.p1, s.rx, s.ry, s.largeArc ?? 0, s.sweep ?? 0, out)
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
  }
  // The loop is closed, so the final p1 duplicates the first point — drop it.
  const first = out[0], last = out[out.length - 1]
  if (out.length > 1 && Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01) out.pop()
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
