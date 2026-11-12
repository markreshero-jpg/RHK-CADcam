// CAD eraser (z_CAD_tool ER1). Pure. Rubs out the part of a line / arc / circle /
// box / ellipse / cloud under a round eraser dragged along a stroke; what is left
// becomes one or more pieces. Text and dimensions are not cut (delete them whole).
//
// Every shape is walked as a chain of segments, each either straight or circular
// (a bulged polyline segment, an arc, a circle). The eraser is a row of discs along
// the stroke (spaced ≤ r/2), so each segment's rubbed-out part is a union of exact
// disc intersections in its own 0..1 parameter.

import type { AnnotationKind } from '../types'
import {
  type Pt, type AnnotationGeom, type LineGeom, type BoxGeom, type ArcGeom, type CircleGeom, type CloudGeom,
  boxToPoly, bulgeArc, bulgeMid, rotatePt,
} from './geometry'

export const ERASABLE = new Set<AnnotationKind>(['line', 'arc', 'circle', 'rect', 'ellipse', 'cloud'])

export interface ErasePiece {
  kind: AnnotationKind
  geom: AnnotationGeom
  /** This piece's start / end is a cut (not the shape's own end) — its arrowhead goes. */
  cutStart: boolean
  cutEnd: boolean
}

/** One segment of the chain: straight a→b, or a circular arc (centre c, radius R,
 *  starting at angle s (rad, frame) and turning `sweep` rad, signed). */
type Seg =
  | { t: 'L'; a: Pt; b: Pt }
  | { t: 'A'; c: Pt; R: number; s: number; sweep: number }

type Iv = [number, number]

const TAU = Math.PI * 2
const segPt = (g: Seg, u: number): Pt => g.t === 'L'
  ? { x: g.a.x + (g.b.x - g.a.x) * u, y: g.a.y + (g.b.y - g.a.y) * u }
  : { x: g.c.x + g.R * Math.cos(g.s + g.sweep * u), y: g.c.y + g.R * Math.sin(g.s + g.sweep * u) }
const segLen = (g: Seg) => g.t === 'L' ? Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) : Math.abs(g.sweep) * g.R

/** The stroke as discs no further apart than r/2. */
export function strokeDiscs(stroke: Pt[], r: number): Pt[] {
  if (!stroke.length) return []
  const out: Pt[] = [stroke[0]]
  const step = Math.max(r / 2, 1e-9)
  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1], b = stroke[i]
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step)
    for (let k = 1; k <= n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n })
  }
  return out
}

/** The parts (0..1) of a segment inside any disc, merged and sorted. */
function rubbed(g: Seg, discs: Pt[], r: number): Iv[] {
  const ivs: Iv[] = []
  if (g.t === 'L') {
    const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, A = dx * dx + dy * dy
    for (const c of discs) {
      const fx = g.a.x - c.x, fy = g.a.y - c.y
      if (A < 1e-18) { if (fx * fx + fy * fy <= r * r) ivs.push([0, 1]); continue }
      const B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r
      const D = B * B - 4 * A * C
      if (D <= 0) continue
      const q = Math.sqrt(D)
      const t0 = (-B - q) / (2 * A), t1 = (-B + q) / (2 * A)
      if (t1 <= 0 || t0 >= 1) continue
      ivs.push([Math.max(0, t0), Math.min(1, t1)])
    }
  } else {
    const span = Math.abs(g.sweep), dir = Math.sign(g.sweep) || 1
    for (const c of discs) {
      const d = Math.hypot(c.x - g.c.x, c.y - g.c.y)
      if (d > g.R + r) continue
      if (d + g.R <= r) { ivs.push([0, 1]); continue }     // the whole circle is inside the disc
      if (d + r <= g.R || d < 1e-12) continue              // disc inside the circle, not touching it
      const cosH = (g.R * g.R + d * d - r * r) / (2 * g.R * d)
      if (cosH >= 1) continue
      const h = Math.acos(Math.max(-1, cosH))
      const phi = Math.atan2(c.y - g.c.y, c.x - g.c.x)
      // Angle measured from the start in the arc's turning direction, 0..TAU.
      const w = (((dir * (phi - g.s)) % TAU) + TAU) % TAU
      for (const k of [-1, 0, 1]) {
        const lo = w - h + k * TAU, hi = w + h + k * TAU
        if (hi <= 0 || lo >= span) continue
        ivs.push([Math.max(0, lo) / span, Math.min(span, hi) / span])
      }
    }
  }
  ivs.sort((p, q) => p[0] - q[0])
  const out: Iv[] = []
  for (const iv of ivs) {
    const last = out[out.length - 1]
    if (last && iv[0] <= last[1] + 1e-12) last[1] = Math.max(last[1], iv[1])
    else out.push([iv[0], iv[1]])
  }
  return out
}

/** What is left of 0..1 once the rubbed intervals go. */
function kept(rub: Iv[]): Iv[] {
  const out: Iv[] = []
  let at = 0
  for (const [a, b] of rub) { if (a > at) out.push([at, a]); at = Math.max(at, b) }
  if (at < 1) out.push([at, 1])
  return out
}

/** A run of kept segment parts, in chain order. */
type Run = { seg: number; u0: number; u1: number }[]

/** Cut a chain of segments. null = the eraser missed it. */
function cutChain(segs: Seg[], closed: boolean, discs: Pt[], r: number, minLen: number): { runs: Run[]; cutStart: boolean[]; cutEnd: boolean[] } | null {
  const per = segs.map(g => kept(rubbed(g, discs, r)))
  if (per.every(k => k.length === 1 && k[0][0] === 0 && k[0][1] === 1)) return null
  // Flatten in chain order, joining parts that run on across a segment end.
  const runs: Run[] = []
  let cur: Run | null = null
  per.forEach((ks, i) => ks.forEach(([u0, u1]) => {
    const part = { seg: i, u0, u1 }
    const last = cur?.[cur.length - 1]
    if (cur && last && last.u1 === 1 && u0 === 0 && last.seg === i - 1) cur.push(part)
    else { cur = [part]; runs.push(cur) }
  }))
  // A closed chain: the last run carries on into the first if nothing was rubbed at the seam.
  if (closed && runs.length > 1) {
    const first = runs[0][0], lastRun = runs[runs.length - 1], last = lastRun[lastRun.length - 1]
    if (first.seg === 0 && first.u0 === 0 && last.seg === segs.length - 1 && last.u1 === 1) {
      runs[0] = [...lastRun, ...runs[0]]
      runs.pop()
    }
  }
  const len = (run: Run) => run.reduce((s, p) => s + segLen(segs[p.seg]) * (p.u1 - p.u0), 0)
  const left = runs.filter(run => len(run) >= minLen)
  const n = segs.length
  return {
    runs: left,
    // Open chains: a piece that starts at the very start keeps the start arrow, etc.
    cutStart: left.map(run => closed || !(run[0].seg === 0 && run[0].u0 === 0)),
    cutEnd:   left.map(run => { const p = run[run.length - 1]; return closed || !(p.seg === n - 1 && p.u1 === 1) }),
  }
}

/** A run back to polyline points + bulges. */
function runToPoly(segs: Seg[], run: Run): { pts: Pt[]; bulges: number[] } {
  const pts: Pt[] = [segPt(segs[run[0].seg], run[0].u0)]
  const bulges: number[] = []
  for (const p of run) {
    const g = segs[p.seg]
    const a = pts[pts.length - 1], b = segPt(g, p.u1)
    pts.push(b)
    if (g.t === 'L') { bulges.push(0); continue }
    // Bulge = tan(sweep / 4); its sign is whichever side puts bulgeMid on the arc's middle.
    const mag = Math.tan(Math.abs(g.sweep) * (p.u1 - p.u0) / 4)
    const m = segPt(g, (p.u0 + p.u1) / 2), mp = bulgeMid(a, b, mag), mn = bulgeMid(a, b, -mag)
    bulges.push(Math.hypot(mp.x - m.x, mp.y - m.y) <= Math.hypot(mn.x - m.x, mn.y - m.y) ? mag : -mag)
  }
  return { pts, bulges }
}

/** A polyline's segments (bulged ones as arcs). */
function polySegs(pts: Pt[], bulges: number[] | undefined, closed: boolean): Seg[] {
  const segs: Seg[] = []
  const n = pts.length
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n], bg = bulges?.[i] ?? 0
    const arc = bg ? bulgeArc(a, b, bg) : null
    if (!arc) { segs.push({ t: 'L', a, b }); continue }
    const s = Math.atan2(a.y - arc.c.y, a.x - arc.c.x)
    const m = bulgeMid(a, b, bg)
    const theta = 4 * Math.atan(Math.abs(bg))
    // Turn the way that passes through the bulge's middle.
    const mid = Math.atan2(m.y - arc.c.y, m.x - arc.c.x)
    const w = (((mid - s) % TAU) + TAU) % TAU
    const sweep = Math.abs(w - theta / 2) < Math.abs(TAU - w - theta / 2) ? theta : -theta
    segs.push({ t: 'A', c: arc.c, R: arc.r, s, sweep })
  }
  return segs
}

/** Cloud bump side for an open piece: the original closed outline's turning sense. */
function shoelace(pts: Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y }
  return a
}

/** Rub `stroke` (frame mm, eraser radius r) out of one item. null = untouched;
 *  [] = rubbed out completely. */
export function eraseGeom(kind: AnnotationKind, geom: AnnotationGeom, stroke: Pt[], r: number): ErasePiece[] | null {
  if (!ERASABLE.has(kind) || !stroke.length || !(r > 0)) return null
  const discs = strokeDiscs(stroke, r)
  const minLen = r * 0.1
  switch (kind) {
    case 'line':
    case 'rect':
    case 'ellipse': {
      let g: LineGeom
      if (kind === 'line') g = geom as LineGeom
      else if (kind === 'rect') g = boxToPoly(geom as BoxGeom)
      else g = ellipsePoly(geom as BoxGeom)
      const pts = g.pts ?? []
      if (pts.length < 2) return null
      const segs = polySegs(pts, g.bulges, !!g.closed)
      const res = cutChain(segs, !!g.closed, discs, r, minLen)
      if (!res) return null
      return res.runs.map((run, i) => {
        const { pts, bulges } = runToPoly(segs, run)
        const lg: LineGeom = { pts }
        if (bulges.some(b => Math.abs(b) > 1e-12)) lg.bulges = bulges
        if ((geom as LineGeom).freehand) lg.freehand = true
        return { kind: 'line', geom: lg, cutStart: res.cutStart[i], cutEnd: res.cutEnd[i] }
      })
    }
    case 'cloud': {
      const g = geom as CloudGeom
      const pts = g.pts ?? []
      if (pts.length < 2) return null
      const open = !!g.open
      const segs = polySegs(pts, undefined, !open)
      const res = cutChain(segs, !open, discs, r, minLen)
      if (!res) return null
      const side: 1 | -1 = open ? (g.side ?? 1) : shoelace(pts) > 0 ? 1 : -1
      return res.runs.map((run, i) => {
        const cg: CloudGeom = { pts: runToPoly(segs, run).pts, open: true, side }
        return { kind: 'cloud', geom: cg, cutStart: res.cutStart[i], cutEnd: res.cutEnd[i] }
      })
    }
    case 'arc':
    case 'circle': {
      const g = geom as ArcGeom | CircleGeom
      const isArc = kind === 'arc'
      const a0 = isArc ? (g as ArcGeom).a0 : 0
      const sweepDeg = isArc ? ((((g as ArcGeom).a1 - a0) % 360) + 360) % 360 : 360
      const seg: Seg = { t: 'A', c: g.c, R: g.r, s: a0 * Math.PI / 180, sweep: sweepDeg * Math.PI / 180 }
      const res = cutChain([seg], !isArc, discs, r, minLen)
      if (!res) return null
      return res.runs.map((run, i) => {
        // A closed circle's run can wrap the seam (two parts): measure it end to end.
        const p0 = run[0], p1 = run[run.length - 1]
        const s0 = a0 + sweepDeg * p0.u0
        const s1 = a0 + sweepDeg * p1.u1 + (run.length > 1 ? 360 : 0)
        const ag: ArcGeom = { c: g.c, r: g.r, a0: +s0.toFixed(6), a1: +s1.toFixed(6) }
        return { kind: 'arc', geom: ag, cutStart: res.cutStart[i], cutEnd: res.cutEnd[i] }
      })
    }
  }
  return null
}

/** An ellipse (box frame, maybe turned) as a closed polyline. */
export function ellipsePoly(g: BoxGeom, n = 72): LineGeom {
  const c = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 }
  const rx = Math.abs(g.b.x - g.a.x) / 2, ry = Math.abs(g.b.y - g.a.y) / 2
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const t = i / n * TAU
    const p = { x: rx * Math.cos(t), y: ry * Math.sin(t) }
    const q = g.rot ? rotatePt(p, g.rot) : p
    pts.push({ x: c.x + q.x, y: c.y + q.y })
  }
  return { pts, closed: true }
}
