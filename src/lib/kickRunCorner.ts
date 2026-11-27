// Joined kicks round an angled corner (z_kick_join "Kick round an angled filler",
// Mark 2026-11-28). A run that ends on an angled corner filler (BFKANG, footprint
// preset angled_filler) carries on along the next wall to the cabinets that butt the
// filler's far side, and the kick assembly gets a footprint that follows the run:
// back along each wall to where the walls meet, the ends square to their walls, and
// the front along each wall's cabinet fronts joined by the filler's angled front.
// The shaped-kick resolver then mitres the faces at the filler's front corners;
// the backs are set to mitre where the walls meet. Pure — no DB.

import type { CabinetInstance, Wall } from './types'
import { cabT, cabWallPerp, cabWallSide, cabinetCornerPts, cabinetToPlan, centroid, wallDir, wallInwardNormal, type Pt } from './geometry'
import { footprintEdgesPlan, type Footprint, type FootprintSegment } from './cabinetShape/footprint'

const TOL = 3            // mm: a cabinet butts the filler / walls meet within this
const WALL_TOL = 25      // mm: wall ends count as joined within this
const MAX_LEGS = 4

export interface KickLeg { wall: Wall; members: CabinetInstance[] }

export const isAngledFiller = (c: CabinetInstance) =>
  c.footprint?.preset === 'angled_filler' || c.footprint?.from_preset === 'angled_filler'

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y
const add = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k })
const wallEnd = (w: Wall): Pt => add({ x: w.pos_x, y: w.pos_y }, wallDir(w), w.length)
const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) <= WALL_TOL

function perpOf(c: CabinetInstance, w: Wall, walls: Wall[]): Pt {
  return cabWallPerp(c, w, wallInwardNormal(w, centroid(walls)))
}

/**
 * The legs of a run starting from a straight run on one wall (`straight`, ordered along
 * it). Where an end member is an angled filler in a corner, the run carries on along the
 * wall joined there (head-to-tail walls), via `straightRun` for that wall.
 */
export function kickRunLegs(
  straight: CabinetInstance[], wall: Wall, cabinets: CabinetInstance[], walls: Wall[],
  straightRun: (c: CabinetInstance, w: Wall) => CabinetInstance[],
  eligible: (c: CabinetInstance) => boolean,
): KickLeg[] {
  const legs: KickLeg[] = [{ wall, members: straight }]
  const used = new Set(straight.map(c => c.id))
  const side = (c: CabinetInstance, w: Wall) => cabWallSide(c, w)

  // Forward: the last member is a filler at this wall's end → the wall starting there.
  for (let n = 0; n < MAX_LEGS; n++) {
    const leg = legs[legs.length - 1]
    const last = leg.members[leg.members.length - 1]
    if (!last || !isAngledFiller(last)) break
    const next = walls.find(w => w.id !== leg.wall.id && near({ x: w.pos_x, y: w.pos_y }, wallEnd(leg.wall)))
    if (!next) break
    const d = wallDir(next)
    const tmax = Math.max(...cabinetCornerPts(last, leg.wall, perpOf(last, leg.wall, walls)).map(p => dot(sub(p, { x: next.pos_x, y: next.pos_y }), d)))
    const first = cabinets.find(c => c.wall_id === next.id && !used.has(c.id) && eligible(c)
      && side(c, next) === side(last, leg.wall) && Math.abs(cabT(c, next) - tmax) <= TOL)
    if (!first) break
    const t0 = cabT(first, next)
    const members = straightRun(first, next).filter(c => !used.has(c.id) && cabT(c, next) >= t0 - TOL)
    if (!members.length) break
    members.forEach(c => used.add(c.id))
    legs.push({ wall: next, members })
  }
  // Backward: the first member is a filler at this wall's start → the wall ending there.
  for (let n = 0; n < MAX_LEGS; n++) {
    const leg = legs[0]
    const firstM = leg.members[0]
    if (!firstM || !isAngledFiller(firstM)) break
    const prev = walls.find(w => w.id !== leg.wall.id && near(wallEnd(w), { x: leg.wall.pos_x, y: leg.wall.pos_y }))
    if (!prev) break
    const d = wallDir(prev)
    const tmin = Math.min(...cabinetCornerPts(firstM, leg.wall, perpOf(firstM, leg.wall, walls)).map(p => dot(sub(p, { x: prev.pos_x, y: prev.pos_y }), d)))
    const lastM = cabinets.find(c => c.wall_id === prev.id && !used.has(c.id) && eligible(c)
      && side(c, prev) === side(firstM, leg.wall) && Math.abs(cabT(c, prev) + c.dx - tmin) <= TOL)
    if (!lastM) break
    const t1 = cabT(lastM, prev) + lastM.dx
    const members = straightRun(lastM, prev).filter(c => !used.has(c.id) && cabT(c, prev) + c.dx <= t1 + TOL)
    if (!members.length) break
    members.forEach(c => used.add(c.id))
    legs.unshift({ wall: prev, members })
  }
  return legs
}

/** Where two lines (point + direction) cross; null when parallel. */
function cross(p: Pt, d: Pt, q: Pt, e: Pt): Pt | null {
  const den = d.x * e.y - d.y * e.x
  if (Math.abs(den) < 1e-9) return null
  const t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / den
  return add(p, d, t)
}

/** The angled filler's front corners between two legs, in plan, ordered from `from`
 *  (the later leg's first front) to `to` (the earlier leg's last front), ends left out. */
function fillerFront(prev: KickLeg, next: KickLeg, walls: Wall[], from: Pt, to: Pt): Pt[] {
  const f = isAngledFiller(prev.members[prev.members.length - 1]) ? { c: prev.members[prev.members.length - 1], w: prev.wall }
    : isAngledFiller(next.members[0]) ? { c: next.members[0], w: next.wall } : null
  if (!f?.c.footprint) return []
  const toPlan = cabinetToPlan(f.c, f.w, perpOf(f.c, f.w, walls))
  const pts = footprintEdgesPlan(f.c.footprint, { w: f.c.dx, d: f.c.dz }, toPlan)
    .filter(e => e.edge.role === 'front').flatMap(e => e.pts)
  const out: Pt[] = []
  for (const p of pts) {
    if (Math.hypot(p.x - from.x, p.y - from.y) < 1 || Math.hypot(p.x - to.x, p.y - to.y) < 1) continue
    if (!out.some(q => Math.hypot(p.x - q.x, p.y - q.y) < 1)) out.push(p)
  }
  return out.sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))
}

export interface KickCornerShape {
  footprint: Footprint
  pos_x: number; pos_y: number; rotation: number; wall_id: string
  dx: number; dz: number
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * The kick assembly for a run of two or more legs: its footprint (assembly frame:
 * x along the first wall, y = depth from the back) and its box / position.
 * Null for a single leg — a straight run keeps the plain assembly.
 */
export function kickCornerShape(legs: KickLeg[], walls: Wall[]): KickCornerShape | null {
  if (legs.length < 2) return null
  // Per leg: back line (through a member's back corner, along the wall), inward
  // normal, the cabinets' span along the wall and their depth (fillers left out —
  // their angled front is the edge between two legs).
  const L = legs.map(({ wall, members }) => {
    const d = wallDir(wall)
    const ref = members.find(c => !isAngledFiller(c)) ?? members[0]
    const n = perpOf(ref, wall, walls)
    const base = { x: wall.pos_x, y: wall.pos_y }
    const off = dot(sub({ x: ref.pos_x, y: ref.pos_y }, base), n)   // back line stands this far off the wall line
    const origin = add(base, n, off)
    const body = members.filter(c => !isAngledFiller(c))
    const span = (cs: CabinetInstance[]) => ({ a: Math.min(...cs.map(c => cabT(c, wall))), b: Math.max(...cs.map(c => cabT(c, wall) + c.dx)) })
    const all = span(members), cab = span(body.length ? body : members)
    const depth = Math.max(...(body.length ? body : members).map(c => c.dz))
    return { wall, d, n, origin, all, cab, depth, at: (t: number, z = 0) => add(add(origin, d, t), n, z) }
  })
  const k = L.length - 1

  // Polygon in plan: backs (start → corners → end), the far end, the fronts back
  // (each leg's cabinets, joined by the filler fronts), the near end.
  type E = { p: Pt; id: string; role: 'back' | 'front' | 'side' }
  const ring: E[] = []
  const sfx = (i: number) => (i === 0 ? '' : String(i + 1))
  ring.push({ p: L[0].at(L[0].all.a), id: 'back', role: 'back' })
  for (let i = 0; i < k; i++) {
    const c = cross(L[i].origin, L[i].d, L[i + 1].origin, L[i + 1].d)
    if (!c) return null
    ring.push({ p: c, id: `back${sfx(i + 1)}`, role: 'back' })
  }
  ring.push({ p: L[k].at(L[k].all.b), id: 'right', role: 'side' })
  for (let i = k; i >= 0; i--) {
    const b = i === k ? L[i].all.b : L[i].cab.b
    const a = i === 0 ? L[i].all.a : L[i].cab.a
    ring.push({ p: L[i].at(b, L[i].depth), id: `front${sfx(i)}`, role: 'front' })
    if (i > 0) {
      const from = L[i].at(a, L[i].depth), to = L[i - 1].at(L[i - 1].cab.b, L[i - 1].depth)
      ring.push({ p: from, id: `filler${sfx(i - 1)}`, role: 'front' })
      // The filler's own front (BFKANG: a face in line with each wall's fronts), so the
      // kick turns where the cabinet fronts do.
      for (const p of fillerFront(legs[i - 1], legs[i], walls, from, to)) ring.push({ p, id: `filler${sfx(i - 1)}`, role: 'front' })
    }
  }
  ring.push({ p: L[0].at(L[0].all.a, L[0].depth), id: 'left', role: 'side' })
  // Straight-on points (a filler face in line with a wall's fronts) aren't corners.
  for (let i = 0; i < ring.length && ring.length > 3; ) {
    const p = ring[(i - 1 + ring.length) % ring.length].p, q = ring[i].p, r = ring[(i + 1) % ring.length].p
    const u = sub(q, p), v = sub(r, q)
    const lu = Math.hypot(u.x, u.y), lv = Math.hypot(v.x, v.y)
    if (lu < 0.5 || (lu * lv > 0 && Math.abs(u.x * v.y - u.y * v.x) / (lu * lv) < 1e-4 && dot(u, v) > 0)) {
      // The edge before now runs on through; a filler face in line with a wall's
      // fronts takes that wall front's name.
      const prev = ring[(i - 1 + ring.length) % ring.length]
      if (prev.id.startsWith('filler') && !ring[i].id.startsWith('filler')) { prev.id = ring[i].id; prev.role = ring[i].role }
      ring.splice(i, 1)
    } else i++
  }

  // Assembly frame = the first leg's first member's frame (turned like it, if it is).
  const m0 = legs[0].members[0]
  const n0 = L[0].n, d0 = L[0].d
  const turned = d0.x * n0.y - d0.y * n0.x < 0
  const X = turned ? { x: -d0.x, y: -d0.y } : d0
  const O = ring[0].p
  let pts = ring.map(e => ({ ...e, l: { x: dot(sub(e.p, O), X), y: dot(sub(e.p, O), n0) } }))
  const minX = Math.min(...pts.map(e => e.l.x)), minY = Math.min(...pts.map(e => e.l.y))
  pts = pts.map(e => ({ ...e, l: { x: r3(e.l.x - minX), y: r3(e.l.y - minY) } }))
  const dx = r3(Math.max(...pts.map(e => e.l.x))), dz = r3(Math.max(...pts.map(e => e.l.y)))

  // Edge i runs from point i to point i + 1. Keep the outline wound like a plain
  // footprint (back left → right along y = 0, front right → left).
  let segs: { p0: Pt; id: string; role: E['role'] }[] = pts.map(e => ({ p0: e.l, id: e.id, role: e.role }))
  const area = segs.reduce((s, e, i) => { const q = segs[(i + 1) % segs.length].p0; return s + e.p0.x * q.y - q.x * e.p0.y }, 0)
  if (area < 0) {
    // Reverse: edge i (p_i → p_i+1) becomes p_i+1 → p_i, same id.
    const n = segs.length
    segs = Array.from({ length: n }, (_, j) => { const i = n - 1 - j; return { p0: segs[(i + 1) % n].p0, id: segs[i].id, role: segs[i].role } })
  }
  const segments: FootprintSegment[] = segs.map(s => ({ type: 'line', p0: s.p0, edge: { id: s.id, role: s.role } }) as FootprintSegment)
  // Backs mitre where the walls meet (Mark 2026-11-28); faces mitre by default.
  const kick_joins: Footprint['kick_joins'] = {}
  for (let i = 0; i < k; i++) kick_joins[`back${sfx(i)}|back${sfx(i + 1)}`] = 'mitre'

  // pos = the cabinet-frame anchor: back-left, or (turned) the wall-start end of the span.
  const o = add(add(O, X, minX), n0, minY)
  const pos = turned ? add(o, d0, -dx) : o
  return {
    footprint: { preset: null, params: {}, segments, kick_joins, kick_spreaders: 'along_fronts' },
    pos_x: r3(pos.x), pos_y: r3(pos.y), rotation: Number(m0.rotation ?? 0), wall_id: legs[0].wall.id,
    dx, dz,
  }
}
