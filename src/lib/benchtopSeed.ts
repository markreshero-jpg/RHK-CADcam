// ── New-benchtop outline from the cabinets under it (z_cabinet_shape 4c) ─────
// F4 → Draw in Shape Editor starts a top from the selected base cabinets:
// each cabinet's plan outline (its shaped footprint, else the box) with every
// FRONT edge — angled facets included — pushed out by the front overhang, then
// all of them merged into one outline. Back / scribe edges come out as wall
// edges, and so does any edge lying on a wall face (a side into a corner);
// other sides stay flush with the carcase (trim ends in the editor).
//
// Front overhang is measured from the carcase front: 40 mm when the base
// fronts carry hardware handles (door + 2 bump-on + handle clearance), 25 mm
// for finger pulls / push-to-open (3–5 mm past the fronts to get fingers under).

import type { Pt } from './geometry'
import { cabinetToPlan, wallEnd } from './geometry'
import type { CabinetInstance, Wall, BenchtopSegment } from './types'
import { canonicalSegments, insetPolygonTagged, edgeFrame } from './cabinetShape/construct'
import { withEdgeOverrides, isWallEdge, type FootprintSegment, type EdgeRole } from './cabinetShape/footprint'
import { sampleShapeOutline } from './shapePath'
import type { HandleRole, HandleScheduleEntryInput } from './resolver/types'
import { curvedEndFootprint, normaliseCurvedEnd } from './curvedEnd/settings'

export const BT_FRONT_OH_HANDLE = 40
export const BT_FRONT_OH_FINGER = 25

/** Front overhang from the room's handle schedule: any base / drawer hardware handle → 40, else 25. Nothing set → 40. */
export function btFrontOverhang(schedule: Partial<Record<HandleRole, HandleScheduleEntryInput>>): number {
  const grips = (['door_base', 'drawer'] as HandleRole[]).map(r => schedule[r]?.handle?.grip_kind).filter(Boolean)
  if (!grips.length || grips.includes('hardware')) return BT_FRONT_OH_HANDLE
  return BT_FRONT_OH_FINGER
}

export interface RoleEdge { a: Pt; b: Pt; role: EdgeRole }

const RECT_ROLES: EdgeRole[] = ['back', 'side', 'front', 'side']

/** One cabinet's outline in plan, front edges pushed out by `oh`, with the role of each edge. */
export function cabinetSeedOutline(cab: CabinetInstance, wall: Wall, perp: Pt, oh: number): RoleEdge[] {
  const w = cab.dx, d = cab.dz
  // A curved end's outline is rebuilt from its settings, so tops on ends placed
  // before its exposed straight became `front` overhang it too (z_curved_end C5).
  const crv = normaliseCurvedEnd(cab.curved_end)
  const fp = (crv ? curvedEndFootprint(crv, { w, d }) : null) ?? cab.footprint
  const segs: FootprintSegment[] = fp?.segments?.length
    ? canonicalSegments(withEdgeOverrides(fp), w, d)
    : [[0, 0, w, 0], [w, 0, w, d], [w, d, 0, d], [0, d, 0, 0]].map(([x0, y0, x1, y1], i) => ({
        type: 'line', p0: { x: x0, y: y0 }, p1: { x: x1, y: y1 }, edge: { id: `r${i}`, role: RECT_ROLES[i] },
      }) as FootprintSegment)
  if (segs.length < 3) return []
  // Roles per sub-edge (arcs sampled as insetPolygon samples them); each vertex says which sub-edge it starts.
  const roles: EdgeRole[] = []
  for (const s of segs) {
    const n = s.type === 'arc' ? sampleShapeOutline([s, { type: 'line', p0: s.p1, p1: s.p0 }]).length - 1 : 1
    // A gable scribed to the wall is a wall edge for the top, as a back is.
    for (let i = 0; i < n; i++) roles.push(isWallEdge(s.edge) ? 'back' : s.edge.role)
  }
  const { pts, sub } = insetPolygonTagged(segs, s => (s.edge.role === 'front' ? -oh : 0))
  const toPlan = cabinetToPlan(cab, wall, perp)
  const plan = pts.map(p => toPlan(p.x, p.y))
  const out = plan.map((a, i) => ({ a, b: plan[(i + 1) % plan.length], role: roles[sub[i]] }))
    .filter(e => Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) > 1e-6)
  return area(out.map(e => e.a)) >= 0 ? out : out.reverse().map(e => ({ a: e.b, b: e.a, role: e.role }))
}

function area(pts: Pt[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p.x * q.y - q.x * p.y }
  return s / 2
}

const TOL = 0.5
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x
const sub = (a: Pt, b: Pt) => ({ x: a.x - b.x, y: a.y - b.y })
const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) < TOL

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a), L2 = ab.x * ab.x + ab.y * ab.y
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / L2)) : 0
  return Math.hypot(p.x - (a.x + ab.x * t), p.y - (a.y + ab.y * t))
}

function inside(p: Pt, poly: RoleEdge[]): boolean {
  let c = false
  for (const { a, b } of poly) {
    if ((a.y > p.y) !== (b.y > p.y) && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) c = !c
  }
  return c
}

/**
 * Union of positively-wound polygons (edges carry roles) → the outer loop.
 * Every edge is split where other outlines cross or touch it; a piece is kept
 * when it lies outside every other outline. Pieces shared by two outlines
 * cancel when they run opposite ways (an internal seam) and keep once when
 * they run the same way. Holes and detached islands are dropped (largest loop wins).
 */
export function unionOutlines(polys: RoleEdge[][]): RoleEdge[] {
  const pieces: (RoleEdge & { k: number })[] = []
  polys.forEach((poly, k) => {
    for (const e of poly) {
      const d = sub(e.b, e.a), L = Math.hypot(d.x, d.y)
      const ts = [0, 1]
      polys.forEach((other, j) => {
        if (j === k) return
        for (const f of other) {
          const g = sub(f.b, f.a), den = cross(d, g)
          if (Math.abs(den) > 1e-9 * L * Math.hypot(g.x, g.y)) {
            const w = sub(f.a, e.a)
            const t = cross(w, g) / den, u = cross(w, d) / den
            if (t > 0 && t < 1 && u > -1e-9 && u < 1 + 1e-9) ts.push(t)
          } else {
            for (const p of [f.a, f.b]) if (distToSeg(p, e.a, e.b) < TOL) {
              const t = ((p.x - e.a.x) * d.x + (p.y - e.a.y) * d.y) / (L * L)
              if (t > 0 && t < 1) ts.push(t)
            }
          }
        }
      })
      ts.sort((x, y) => x - y)
      for (let i = 0; i + 1 < ts.length; i++) {
        if ((ts[i + 1] - ts[i]) * L < TOL) continue
        const a = { x: e.a.x + d.x * ts[i], y: e.a.y + d.y * ts[i] }
        const b = { x: e.a.x + d.x * ts[i + 1], y: e.a.y + d.y * ts[i + 1] }
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        let keep = true
        polys.forEach((other, j) => {
          if (!keep || j === k) return
          const on = other.find(f => distToSeg(m, f.a, f.b) < TOL)
          if (on) {
            const same = (on.b.x - on.a.x) * d.x + (on.b.y - on.a.y) * d.y > 0
            if (!same || j < k) keep = false
          } else if (inside(m, other)) keep = false
        })
        if (keep) pieces.push({ a, b, role: e.role, k })
      }
    }
  })
  // Chain pieces head-to-tail into loops.
  const used = new Set<number>()
  const loops: RoleEdge[][] = []
  for (let s = 0; s < pieces.length; s++) {
    if (used.has(s)) continue
    const loop: RoleEdge[] = []
    let i = s
    while (i >= 0 && !used.has(i)) {
      used.add(i); loop.push(pieces[i])
      const end = pieces[i].b
      i = pieces.findIndex((p, j) => !used.has(j) && near(p.a, end))
    }
    if (loop.length >= 3 && near(loop[loop.length - 1].b, loop[0].a)) loops.push(loop)
  }
  if (!loops.length) return []
  return loops.reduce((best, l) => (area(l.map(e => e.a)) > area(best.map(e => e.a)) ? l : best))
}

/** Merge consecutive collinear edges that share a wall flag. */
export function simplifyLoop(loop: RoleEdge[]): RoleEdge[] {
  const wallOf = (r: EdgeRole) => r === 'back'
  const out = loop.slice()
  let changed = true
  while (changed && out.length > 3) {
    changed = false
    for (let i = 0; i < out.length; i++) {
      const e = out[i], n = out[(i + 1) % out.length]
      const u = edgeFrame({ p0: e.a, p1: e.b }).u, v = edgeFrame({ p0: n.a, p1: n.b }).u
      if (Math.abs(cross(u, v)) < 1e-6 && u.x * v.x + u.y * v.y > 0 && wallOf(e.role) === wallOf(n.role)) {
        out[i] = { a: e.a, b: n.b, role: e.role }
        out.splice((i + 1) % out.length, 1)
        changed = true
        break
      }
    }
  }
  return out
}

/**
 * Starting outline for a new top over these cabinets (plan coords). `perpOf`
 * gives each cabinet's inward perpendicular (cabWallPerp). Null when nothing
 * usable merges into a single outline.
 */
export function benchtopSeedFromCabinets(
  cabs: { cab: CabinetInstance; wall: Wall; perp: Pt }[],
  frontOverhang: number,
): BenchtopSegment[] | null {
  const polys = cabs.map(c => cabinetSeedOutline(c.cab, c.wall, c.perp, frontOverhang)).filter(p => p.length >= 3)
  if (!polys.length) return null
  // An edge on a wall's face line (a run's end into the corner) is a wall edge too.
  const faces = [...new Set(cabs.map(c => c.wall))].map(w => ({ a: { x: w.pos_x, y: w.pos_y }, b: wallEnd(w) }))
  const onWall = (e: RoleEdge) => faces.some(f => distToSeg(e.a, f.a, f.b) < TOL && distToSeg(e.b, f.a, f.b) < TOL)
  const loop = simplifyLoop(unionOutlines(polys).map(e => (e.role !== 'back' && onWall(e) ? { ...e, role: 'back' as EdgeRole } : e)))
  if (loop.length < 3) return null
  return loop.map(e => ({
    type: 'line', p0: { ...e.a }, p1: { ...e.b },
    edge: { wall: e.role === 'back' },
  }))
}
