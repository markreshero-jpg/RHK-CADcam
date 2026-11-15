// Auto-build splashbacks from the tops (z_splashback S4).
//
// Per wall face a top's wall edges sit against: a piece along that stretch of
// the face, from the bench surface up to the lowest overheads' underside / drop
// bulkhead over the run — else the wall top (L3) — one height, as a click in
// Draw Splashback gives. A wall-hung fixture lower than that (a rangehood) steps
// it down over its own width only, so a piece can be a stepped outline. A tall cabinet / appliance standing through the band, or a window
// whose sill sits at the bench (L2), splits the run; a window higher up stays a
// live hole as when drawn by hand. Slivers under MIN_WIDTH are dropped.
//
// Inside corners: where two pieces meet, the shorter one stops short by the
// longer one's thickness (the longer runs through); a piece that meets one
// already drawn always stops short. A stretch of a face that already has a
// splashback is skipped (never replaces hand-drawn pieces).
//
// Everything is in each wall's ELEVATION frame (x as seen on that side, z up),
// the frame splashback segments are stored in.

import type { BenchtopInstance, BenchtopSegment, CabinetInstance, Room, RoomFixture, SplashbackInstance, Wall } from './types'
import type { Pt } from './geometry'
import { cabBottomZ, cabT, cabWallSide, centroid, dropWallsOnWall, wallBaseZ } from './geometry'
import { btSegments } from './benchtopGeometry'
import { alongOf, offOf, wallContacts, type WallSide } from './benchtopAnchor'
import { elevationFrame, fixtureCorners } from './fixtureGeometry'
import { sbBounds, sbOpenings, type SbRect } from './splashbackGeometry'

/** Narrowest piece auto-build makes (mm); narrower leftovers are dropped. */
export const MIN_WIDTH = 100
/** Something starting this far above the bench counts as over it (an obstacle), lower = standing through it. */
const CLEAR = 150
/** A window whose sill is within this of the bench splits the run (L2). */
const SILL_AT_BENCH = 50
const TOL = 15

export interface AutoSbPiece {
  key: string
  wall_id: string
  wall_side: WallSide
  wallName: string
  segments: BenchtopSegment[]
  b: SbRect
  /** Stepped top (more than one height). */
  stepped: boolean
  /** Why it isn't built (already drawn there); null = build. */
  skip: string | null
  /** Plain-English notes for the dialog (corner stops, splits). */
  notes: string[]
}

type Span = { x0: number; x1: number }
/** Something over the bench; local = a fixture that only steps the top down over its width. */
type Obstacle = Span & { zBot: number; local?: boolean }

const merge = (spans: Span[], gap = 5): Span[] => {
  const s = [...spans].sort((a, b) => a.x0 - b.x0)
  const out: Span[] = []
  for (const r of s) {
    const last = out[out.length - 1]
    if (last && r.x0 <= last.x1 + gap) last.x1 = Math.max(last.x1, r.x1)
    else out.push({ ...r })
  }
  return out
}

/** spans − cuts. */
function subtract(spans: Span[], cuts: Span[]): Span[] {
  let cur = spans
  for (const c of cuts) {
    cur = cur.flatMap(s => {
      if (c.x1 <= s.x0 || c.x0 >= s.x1) return [s]
      const out: Span[] = []
      if (c.x0 > s.x0) out.push({ x0: s.x0, x1: c.x0 })
      if (c.x1 < s.x1) out.push({ x0: c.x1, x1: s.x1 })
      return out
    })
  }
  return cur
}

/** Stepped outline over [x0, x1] from z0: each top step from the lowest obstacle over it. */
export function steppedOutline(x0: number, x1: number, z0: number, ceiling: number, obstacles: Obstacle[]): { segs: BenchtopSegment[]; tops: number[] } {
  const xs = [x0, x1, ...obstacles.flatMap(o => [o.x0, o.x1])].filter(x => x >= x0 && x <= x1)
  const cuts = [...new Set(xs.map(x => Math.round(x)))].sort((a, b) => a - b)
  const steps: { x0: number; x1: number; z: number }[] = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1]
    if (b - a < 1) continue
    let z = ceiling
    for (const o of obstacles) if (Math.min(b, o.x1) - Math.max(a, o.x0) > 1 && o.zBot > z0 + CLEAR && o.zBot < z) z = o.zBot
    const last = steps[steps.length - 1]
    if (last && Math.abs(last.z - z) < 0.5) last.x1 = b
    else steps.push({ x0: a, x1: b, z })
  }
  // Bottom left → right, then the top back right → left (anticlockwise, y up).
  const pts: Pt[] = [{ x: x0, y: z0 }, { x: x1, y: z0 }]
  for (const s of [...steps].reverse()) {
    const prev = pts[pts.length - 1]
    if (Math.abs(prev.y - s.z) > 0.5) pts.push({ x: s.x1, y: s.z })
    pts.push({ x: s.x0, y: s.z })
  }
  const segs: BenchtopSegment[] = pts.map((p, i) => ({ type: 'line', p0: p, p1: pts[(i + 1) % pts.length] }))
  return { segs, tops: steps.map(s => s.z) }
}

/** Plan point of elevation x on a wall face (the face line). */
const planAt = (wall: Wall, side: WallSide, ref: Pt, x: number): Pt => {
  const f = elevationFrame(wall, side, ref)
  return { x: f.o.x + f.d.x * x, y: f.o.y + f.d.y * x }
}

export function autoBuildSplashbacks(args: {
  walls: Wall[]
  room: Room
  cabinets: CabinetInstance[]
  fixtures: RoomFixture[]
  benchtops: BenchtopInstance[]
  /** Bench surface height of a top (underside + thickness). */
  topZ: (bt: BenchtopInstance) => number
  existing: SplashbackInstance[]
  /** Panel thickness a new piece on this face would get (its material), for corner stops. */
  thickFor: (wallId: string, side: WallSide) => number
  /** Thickness of an existing piece. */
  thickOf: (sb: SplashbackInstance) => number
}): AutoSbPiece[] {
  const { walls, room, cabinets, fixtures, benchtops, existing } = args
  const ref = centroid(walls)

  // 1. Bench stretches per wall face, by bench height.
  const runs = new Map<string, { wall: Wall; side: WallSide; z0: number; spans: Span[] }>()
  for (const bt of benchtops) {
    const segs = btSegments(bt)
    if (segs.length < 3) continue
    const z0 = Math.round(args.topZ(bt))
    for (const c of wallContacts(segs, walls, ref)) {
      const wall = walls.find(w => w.id === c.wallId)
      if (!wall) continue
      const x0 = c.side === 'back' ? wall.length - c.t1 : c.t0
      const x1 = c.side === 'back' ? wall.length - c.t0 : c.t1
      const k = `${wall.id}|${c.side}|${z0}`
      const r = runs.get(k) ?? { wall, side: c.side, z0, spans: [] }
      r.spans.push({ x0, x1 })
      runs.set(k, r)
    }
  }

  const pieces: (AutoSbPiece & { thick: number })[] = []
  for (const { wall, side, z0, spans } of runs.values()) {
    const ef = elevationFrame(wall, side, ref)
    const ceiling = Number(wall.height) || Number(room.room_dy) || 2400
    const isBack = side === 'back'
    const blockers: Span[] = []
    const obstacles: Obstacle[] = []
    const classify = (x0: number, x1: number, zb: number, zt: number, local = false) => {
      if (zt <= z0 + CLEAR) return                         // under / at the bench (base cabinets, sinks)
      if (zb < z0 + CLEAR) blockers.push({ x0, x1 })       // stands through the band: talls, fridge
      else obstacles.push({ x0, x1, zBot: zb, local })     // hangs over it: overheads, rangehood
    }
    for (const c of cabinets) {
      if (c.wall_id !== wall.id || cabWallSide(c, wall) !== side) continue
      const t = cabT(c, wall)
      const x0 = isBack ? wall.length - t - c.dx : t
      const zb = cabBottomZ(c, room, wall)
      classify(x0, x0 + c.dx, zb, zb + c.dy)
    }
    for (const f of fixtures) {
      if (f.wall_id !== wall.id || f.category === 'opening') continue
      const mount = (f as { mount?: string | null }).mount
      if (mount === 'benchtop' || f.category === 'sink' || f.category === 'tap') continue
      const ts = fixtureCorners(f).map(p => alongOf(ef, p))
      // Only things against this face (not across an island).
      const offs = fixtureCorners(f).map(p => offOf(ef, p))
      if (Math.min(...offs) > 900 || Math.max(...offs) < -TOL) continue
      const zb = Number(f.z) || 0
      classify(Math.min(...ts), Math.max(...ts), zb, zb + (Number(f.height) || 0), true)
    }
    if (!isBack) for (const d of dropWallsOnWall(wall, walls, ref, 50)) obstacles.push({ x0: d.t0, x1: d.t1, zBot: wallBaseZ(d.nib) })
    const notes: string[] = []
    for (const o of sbOpenings(fixtures, wall, side, ref)) {
      if (o.z0 <= z0 + SILL_AT_BENCH && o.z1 > z0 + CLEAR) blockers.push({ x0: o.x0, x1: o.x1 })
    }

    const runSpans = merge(spans.map(s => ({ x0: Math.max(0, s.x0), x1: Math.min(wall.length, s.x1) })))
    const cut = merge(blockers, 0)
    const parts = subtract(runSpans, cut).filter(s => s.x1 - s.x0 >= 1)
    for (const s of parts) {
      const x0 = Math.round(s.x0), x1 = Math.round(s.x1)
      if (x1 - x0 < MIN_WIDTH) continue
      // One height: the lowest overheads / bulkhead over the run, else the wall top.
      let base = ceiling
      for (const o of obstacles) if (!o.local && Math.min(x1, o.x1) - Math.max(x0, o.x0) > 1 && o.zBot > z0 + CLEAR && o.zBot < base) base = o.zBot
      const { segs, tops } = steppedOutline(x0, x1, z0, base, obstacles.filter(o => o.local))
      const b = sbBounds(segs)!
      const here = existing.filter(e => e.wall_id === wall.id && e.wall_side === side)
      const clash = here.find(e => { const eb = sbBounds(e.segments); return !!eb && Math.min(eb.x1, x1) - Math.max(eb.x0, x0) > 1 })
      const split = runSpans.some(r => r.x0 < x0 - 1 || r.x1 > x1 + 1) && cut.some(c => Math.abs(c.x1 - x0) < 2 || Math.abs(c.x0 - x1) < 2)
      pieces.push({
        key: `${wall.id}|${side}|${x0}|${z0}`, wall_id: wall.id, wall_side: side, wallName: wall.name ?? 'Wall',
        segments: segs, b, stepped: tops.length > 1,
        skip: clash ? `already has ${clash.label ?? 'a splashback'}` : null,
        notes: [...notes, ...(split ? ['stops at a tall / window'] : [])],
        thick: args.thickFor(wall.id, side),
      })
    }
  }

  // 2. Inside corners: the shorter of two meeting pieces stops short by the other's thickness.
  const len = (p: { b: SbRect }) => p.b.x1 - p.b.x0
  const wallOf = (id: string) => walls.find(w => w.id === id)!
  type Other = { wall_id: string; wall_side: WallSide; b: SbRect; thick: number; fixed: boolean; name: string; key: string }
  const others: Other[] = [
    ...pieces.filter(p => !p.skip).map(p => ({ wall_id: p.wall_id, wall_side: p.wall_side, b: p.b, thick: p.thick, fixed: false, name: p.wallName, key: p.key })),
    ...existing.flatMap(e => {
      const b = sbBounds(e.segments)
      const w = walls.find(x => x.id === e.wall_id)
      return b && w ? [{ wall_id: e.wall_id, wall_side: e.wall_side as WallSide, b, thick: args.thickOf(e), fixed: true, name: w.name ?? 'Wall', key: e.id }] : []
    }),
  ]
  const trims = new Map<string, { left: number; right: number; notes: string[] }>()
  for (const p of pieces) {
    if (p.skip) continue
    const w = wallOf(p.wall_id)
    for (const end of ['left', 'right'] as const) {
      const P = planAt(w, p.wall_side, ref, end === 'left' ? p.b.x0 : p.b.x1)
      for (const o of others) {
        if (o.key === p.key || o.wall_id === p.wall_id) continue
        const ow = wallOf(o.wall_id)
        const of = elevationFrame(ow, o.wall_side, ref)
        if (Math.abs(offOf(of, P)) > TOL) continue
        const ox = alongOf(of, P)
        if (ox < o.b.x0 - TOL || ox > o.b.x1 + TOL) continue
        // Same heights overlap? (a piece above / below doesn't meet it)
        if (Math.min(o.b.z1, p.b.z1) - Math.max(o.b.z0, p.b.z0) < 1) continue
        const yields = o.fixed || len(o) > len(p) || (len(o) === len(p) && o.key < p.key)
        if (!yields) continue
        const t = trims.get(p.key) ?? { left: 0, right: 0, notes: [] }
        t[end] = Math.max(t[end], o.thick)
        t.notes.push(`${end} end stops ${o.thick} short at the corner (${o.name}${o.fixed ? ', drawn' : ''} runs through)`)
        trims.set(p.key, t)
      }
    }
  }

  return pieces.map(full => {
    const p: AutoSbPiece = { key: full.key, wall_id: full.wall_id, wall_side: full.wall_side, wallName: full.wallName, segments: full.segments, b: full.b, stepped: full.stepped, skip: full.skip, notes: full.notes }
    const t = trims.get(p.key)
    if (!t) return p
    const x0 = p.b.x0 + t.left, x1 = p.b.x1 - t.right
    const segs = p.segments.map(s => ({
      ...s,
      p0: { x: Math.abs(s.p0.x - p.b.x0) < 0.5 ? x0 : Math.abs(s.p0.x - p.b.x1) < 0.5 ? x1 : s.p0.x, y: s.p0.y },
      p1: { x: Math.abs(s.p1.x - p.b.x0) < 0.5 ? x0 : Math.abs(s.p1.x - p.b.x1) < 0.5 ? x1 : s.p1.x, y: s.p1.y },
    }))
    return { ...p, segments: segs, b: sbBounds(segs)!, notes: [...p.notes, ...t.notes] }
  })
}
