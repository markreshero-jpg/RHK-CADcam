// ── Footprint ↔ CAD line (z_cabinet_shape_edit E4b) ───────────────────────────
// Edit shape hands the cabinet's footprint to the F7 CAD tools as ONE closed
// `line` annotation in room plan mm (pts + bulges), and reads every change back
// into a footprint:
//   - edge ids carry over (shape decision 8): same vertex count = same edges in
//     order (a corner / side drag); otherwise each new edge takes the id of the
//     old edge it lies along (a split keeps the id on its longer half, the other
//     half is new), and a replacement outline (Box / offset copy) takes the id of
//     the nearest parallel old edge. Anything else is new: front / faces
//     (decision 14).
//   - vertices are re-written as formulas against their nearest box side
//     (`cab.w - 250`), so the hand-edited shape still resizes;
//   - the box (dx / dz) becomes the outline's bounding box and the cabinet's
//     origin moves with its back-left corner (`shift`, cabinet frame).
// Bulges: annotations bow + to the chord's LEFT normal; footprint / shapePath
// bulges put the arc's CENTRE there (+ = angle increasing). Same frame → opposite
// signs; a mirroring map would flip them again (cabinet frames never mirror,
// but the sign is taken from the map anyway).

import type { CabinetInstance, Wall } from '../types'
import { cabinetPlanFrame, wallDir, type Pt } from '../geometry'
import { arcGeom, bulgeArc, sampleShapeOutline, type ShapePt } from '../shapePath'
import {
  evaluateFootprint, isDegenerate, withEdgeOverrides,
  type Footprint, type FootprintDims, type FootprintEdge, type FootprintSegment,
} from './footprint'

export interface ShapeLineGeom { pts: Pt[]; bulges: number[]; closed: true }
export interface ShapeLine { geom: ShapeLineGeom; edgeIds: string[] }

/** Cabinet frame ↔ plan for one cabinet. */
export interface PlanMap {
  to: (x: number, y: number) => Pt
  from: (p: Pt) => Pt
  /** +1 when the map keeps handedness (always, for a cabinet frame), −1 if it mirrors. */
  det: 1 | -1
  /** Where the cabinet's pos_x / pos_y would have to be for its frame origin to sit at
   *  cabinet-frame point (sx, sy) with the new width dx. */
  posFor: (sx: number, sy: number, dx: number) => Pt
}

export function planMap(cab: CabinetInstance, wall: Wall, perp: Pt): PlanMap {
  const { o, x } = cabinetPlanFrame(cab, wall, perp)
  const det = x.x * perp.y - x.y * perp.x
  const to = (lx: number, lz: number) => ({ x: o.x + lx * x.x + lz * perp.x, y: o.y + lx * x.y + lz * perp.y })
  const from = (p: Pt) => {
    const dx = p.x - o.x, dy = p.y - o.y
    return { x: (dx * perp.y - dy * perp.x) / det, y: (x.x * dy - x.y * dx) / det }
  }
  // The frame origin is pos, or pos + dx·wallDir when the frame is turned (+X runs
  // back along the wall) — the same test as cabinetPlanFrame.
  const wd = wallDir(wall)
  const turned = wd.x * perp.y - wd.y * perp.x < 0
  const posFor = (sx: number, sy: number, dx: number) => {
    const n = to(sx, sy)
    return turned ? { x: n.x + dx * x.x, y: n.y + dx * x.y } : n
  }
  return { to, from, det: det < 0 ? -1 : 1, posFor }
}

// The footprint's own bulge for an arc segment (shapePath convention), 0 for a line.
function segBulge(s: FootprintSegment): number {
  if (s.type !== 'arc') return 0
  const g = arcGeom(s.p0, s.p1, s.rx ?? 0, s.ry ?? 0, s.largeArc ?? 0, s.sweep ?? 0)
  return g ? Math.tan(g.da / 4) : 0
}

/** The footprint as the closed CAD line (plan mm) + the edge id of each segment. */
export function footprintLine(fp: Footprint, dims: FootprintDims, m: PlanMap): ShapeLine {
  const segs = evaluateFootprint(withEdgeOverrides(fp), dims).filter(s => !isDegenerate(s))
  return {
    geom: {
      pts: segs.map(s => m.to(s.p0.x, s.p0.y)),
      bulges: segs.map(s => -segBulge(s) * m.det),
      closed: true,
    },
    edgeIds: segs.map(s => s.edge.id),
  }
}

const TOL = 0.5          // mm — "lies along" an old edge
const MIN_EDGE = 10      // mm
const r1 = (v: number) => Math.round(v * 10) / 10

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

/** Which old edge id each new segment keeps (null = a new edge). */
export function matchEdges(prev: ShapeLine, next: { pts: Pt[]; bulges: number[] }, replacing: boolean): (string | null)[] {
  const op = prev.geom.pts, ob = prev.geom.bulges, n = op.length
  const np = next.pts, nb = next.bulges, k = np.length
  if (!replacing && k === n) return prev.edgeIds.slice()
  const seg = (pts: Pt[], i: number) => [pts[i], pts[(i + 1) % pts.length]] as const
  const len = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)
  const same = (a: Pt, b: Pt) => len(a, b) < TOL
  // 1. A new segment lying along an old one (arcs: the same ends and bulge).
  const cand: { j: number; i: number; l: number }[] = []
  for (let j = 0; j < k; j++) {
    const [a, b] = seg(np, j)
    for (let i = 0; i < n; i++) {
      const [c, d] = seg(op, i)
      const arcN = Math.abs(nb[j] ?? 0) > 1e-9, arcO = Math.abs(ob[i] ?? 0) > 1e-9
      const hit = arcN || arcO
        ? arcN && arcO && ((same(a, c) && same(b, d) && Math.abs(nb[j] - ob[i]) < 1e-6) || (same(a, d) && same(b, c) && Math.abs(nb[j] + ob[i]) < 1e-6))
        : distToSeg(a, c, d) < TOL && distToSeg(b, c, d) < TOL && len(a, b) > 1e-6
      if (hit) cand.push({ j, i, l: len(a, b) })
    }
  }
  const out: (string | null)[] = Array(k).fill(null)
  const used = new Set<number>()
  for (const c of cand.sort((x, y) => y.l - x.l)) {
    if (out[c.j] != null || used.has(c.i)) continue
    out[c.j] = prev.edgeIds[c.i]; used.add(c.i)
  }
  // 2. A replacement outline: the nearest parallel old edge (same direction).
  if (replacing) {
    const dir = (a: Pt, b: Pt) => { const l = len(a, b) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l } }
    const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    const free: { j: number; i: number; dist: number }[] = []
    for (let j = 0; j < k; j++) {
      if (out[j] != null || Math.abs(nb[j] ?? 0) > 1e-9) continue
      const [a, b] = seg(np, j), u = dir(a, b), mj = mid(a, b)
      for (let i = 0; i < n; i++) {
        if (used.has(i) || Math.abs(ob[i] ?? 0) > 1e-9) continue
        const [c, d] = seg(op, i), v = dir(c, d)
        if (Math.abs(u.x * v.y - u.y * v.x) > 0.02) continue
        const mi = mid(c, d)
        free.push({ j, i, dist: Math.hypot(mj.x - mi.x, mj.y - mi.y) * (u.x * v.x + u.y * v.y > 0 ? 1 : 1e3) })
      }
    }
    for (const f of free.sort((x, y) => x.dist - y.dist)) {
      if (out[f.j] != null || used.has(f.i)) continue
      out[f.j] = prev.edgeIds[f.i]; used.add(f.i)
    }
  }
  return out
}

// Proper crossing of a–b and c–d (touching ends don't count).
function crosses(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b)
  return ((d1 > 1e-6 && d2 < -1e-6) || (d1 < -1e-6 && d2 > 1e-6)) && ((d3 > 1e-6 && d4 < -1e-6) || (d3 < -1e-6 && d4 > 1e-6))
}

/** Why a closed outline can't be a cabinet, or null when it can. */
export function outlineProblem(segs: FootprintSegment[]): string | null {
  if (segs.length < 3) return 'The outline needs at least three edges.'
  for (const s of segs) {
    if (Math.hypot(s.p1.x - s.p0.x, s.p1.y - s.p0.y) < MIN_EDGE) return `Edges must be at least ${MIN_EDGE} mm long.`
  }
  if (!segs.some(s => s.type === 'line' && (s.edge.role === 'side' || s.edge.role === 'back')))
    return 'The outline needs at least one side or back edge.'
  const ring = sampleShapeOutline(segs)
  const r = ring.length
  for (let i = 0; i < r; i++) for (let j = i + 2; j < r; j++) {
    if (i === 0 && j === r - 1) continue
    if (crosses(ring[i], ring[(i + 1) % r], ring[j], ring[(j + 1) % r])) return 'The outline crosses itself.'
  }
  return null
}

export interface LineToFootprint {
  fp?: Footprint
  /** New box (bounding box of the outline). */
  dx?: number
  dz?: number
  /** Cabinet-frame point the old frame origin moves to (the new back-left corner). */
  shift?: ShapePt
  /** Corner choices / facet faces left behind by edges that went. */
  dropped?: string[]
  error?: string
}

// New edges are e1, e2, … (the next free number) — shown as "Edge 1" (edgeLabel).
const newId = (taken: Set<string>) => {
  let n = 1
  while (taken.has(`e${n}`)) n++
  taken.add(`e${n}`)
  return `e${n}`
}

/** Read a changed CAD line back into a footprint (cabinet frame, ids kept). */
export function lineToFootprint(
  prevFp: Footprint, dims: FootprintDims, prev: ShapeLine,
  geom: { pts: Pt[]; bulges?: number[]; closed?: boolean }, m: PlanMap, replacing = false,
): LineToFootprint {
  if (!geom.closed) return { error: 'The outline has to stay closed — draw a closed shape (Box, or a line back to its start).' }
  const bulges = geom.pts.map((_, i) => geom.bulges?.[i] ?? 0)
  const ids = matchEdges(prev, { pts: geom.pts, bulges }, replacing)

  // Old edges (role, sub-type, scribe, filler) by id.
  const oldEdges = new Map<string, FootprintEdge>(
    evaluateFootprint(withEdgeOverrides(prevFp), dims).map(s => [s.edge.id, s.edge]),
  )
  const taken = new Set(oldEdges.keys())
  const local = geom.pts.map(m.from)
  const fb = bulges.map(b => -b * m.det)

  // Bounding box of the outline (arcs included) → the new box.
  const raw: FootprintSegment[] = local.map((p, i) => {
    const q = local[(i + 1) % local.length], b = fb[i]
    const edge: FootprintEdge = ids[i] && oldEdges.get(ids[i]!) ? { ...oldEdges.get(ids[i]!)! } : { id: newId(taken), role: 'front' }
    if (Math.abs(b) < 1e-9) return { type: 'line', p0: p, p1: q, edge }
    const r = bulgeArc(p, q, b).r
    return { type: 'arc', p0: p, p1: q, rx: r, ry: r, largeArc: Math.abs(b) > 1 ? 1 : 0, sweep: b > 0 ? 1 : 0, edge }
  })
  const ring = sampleShapeOutline(raw)
  const minX = Math.min(...ring.map(p => p.x)), minY = Math.min(...ring.map(p => p.y))
  const maxX = Math.max(...ring.map(p => p.x)), maxY = Math.max(...ring.map(p => p.y))
  const w = maxX - minX, d = maxY - minY
  if (!(w > MIN_EDGE && d > MIN_EDGE)) return { error: 'The outline is too small.' }

  // Shift to the new back-left corner; vertices as formulas off their nearest side.
  const fx = (x: number) => x < 0.05 ? '0' : Math.abs(w - x) < 0.05 ? 'cab.w' : x <= w / 2 ? String(r1(x)) : `cab.w - ${r1(w - x)}`
  const fy = (y: number) => y < 0.05 ? '0' : Math.abs(d - y) < 0.05 ? 'cab.d' : y <= d / 2 ? String(r1(y)) : `cab.d - ${r1(d - y)}`
  const segments: FootprintSegment[] = raw.map(s => {
    const p0 = { x: s.p0.x - minX, y: s.p0.y - minY }, p1 = { x: s.p1.x - minX, y: s.p1.y - minY }
    return {
      ...s, p0, p1, p0_expr: { x: fx(p0.x), y: fy(p0.y) },
      ...(s.type === 'arc' ? { r_expr: String(r1(s.rx ?? 0)), rx: s.rx, ry: s.ry } : {}),
    }
  })
  const problem = outlineProblem(segments)
  if (problem) return { error: problem }

  // Corner choices / flush ends of edges that went are dropped (shape decision 8).
  const live = new Set(segments.map(s => s.edge.id))
  const dropped: string[] = []
  const joins = Object.fromEntries(Object.entries(prevFp.joins ?? {}).filter(([k]) => {
    const ok = k.split('|').every(id => live.has(id))
    if (!ok) dropped.push(k)
    return ok
  }))
  const fp: Footprint = {
    ...prevFp,
    preset: null,
    from_preset: prevFp.from_preset ?? prevFp.preset,
    segments,
    ...(Object.keys(joins).length ? { joins } : {}),
    ...(prevFp.flush_ends?.length ? { flush_ends: prevFp.flush_ends.filter(id => live.has(id)) } : {}),
  }
  if (!Object.keys(joins).length) delete fp.joins
  // Roles now live on the edges themselves (hand-edited shape).
  delete fp.edge_overrides; delete fp.role_overrides
  return { fp, dx: r1(w), dz: r1(d), shift: { x: minX, y: minY }, dropped }
}
