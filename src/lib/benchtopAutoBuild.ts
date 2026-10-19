// ── Auto-build benchtops (F4 → Auto-build tops) ──────────────────────────────
// Spec: z_benchtop_builder/BENCHTOP-SPEC.md (Phase 8 — auto-build).
//
// One top per run of base cabinets, never one continuous L / U (Mark
// 2026-10-16): cabinets are grouped by wall + side (an island's two sides
// together), sorted along the wall and split into runs where a gap is too wide
// to bridge, or holds a tall cabinet / floor appliance. Each run's outline is
// the cabinets' outlines merged with the front overhang (benchtopSeed), then:
//
//   end against a wall / tall cabinet / floor appliance   no overhang
//   end meeting another run at a corner (L)               both tops run through the
//                                                         corner to the other's back
//                                                         line, then cut to the joint
//   end running into the side of another run (T)          stops at its front, butt
//   open end                                              end overhang
//
// Corners are cut with the Phase 7c joint rules (jointTops) — Mitre or Butt
// (the longer top runs through) by default, per-corner pick in the dialog.
// Pure: the dialog calls planAutoBuild live as the answers change.

import type { Pt } from './geometry'
import { centroid, cabWallPerp, cabWallSide, wallInwardNormal } from './geometry'
import type { CabinetInstance, Wall, BenchtopSegment, BenchtopInstance, RoomFixture } from './types'
import { cabinetSeedOutline, unionOutlines, simplifyLoop, type RoleEdge } from './benchtopSeed'
import { wallFrame, alongOf, offOf, type WallFrame } from './benchtopAnchor'
import { btSegments, outlinePoints } from './benchtopGeometry'
import { pieceContains } from './benchtop-resolver/pieces'
import { jointTops, planJoin, choicesFor, jointKey, type JoinChoice, type JointStep } from './benchtopJoinTops'
import { fixtureCorners } from './fixtureGeometry'

export interface AutoBuildSettings {
  /** Past the carcase front (40 handles / 25 finger pulls by default). */
  frontOverhang: number
  /** Past an open end (not against a wall, tall cabinet, appliance or another top). */
  endOverhang: number
  /** Gaps up to this wide between cabinets are bridged (a freestanding D/W). */
  bridgeGap: number
  /** Corner joint default: mitre, or butt with the longer top running through. */
  corner: 'mitre' | 'butt'
  /** Island with cabinets on one side only: the top runs this far past the back. */
  islandBackOverhang: number
  /** Leave out cabinets that already have a top over them. */
  skipCovered: boolean
}

export type EndKind = 'open' | 'wall' | 'corner' | 'tee' | 'tall' | 'appliance'

/** Per-top answers from the click-through. Unset = the general setting. */
export interface TopOverride { skip?: boolean; front?: number; left?: number; right?: number }

export interface AutoTop {
  key: string
  wallId: string
  wallName: string
  island: boolean
  cabIds: string[]
  /** Final outline (corners cut, wall edges marked). */
  segs: BenchtopSegment[]
  /** Left / right end as seen in the wall's elevation. */
  ends: [EndKind, EndKind]
  length: number
  depth: number
  skip: boolean
}

export interface AutoCorner {
  /** jointKey into the built (not skipped) tops. */
  key: string
  a: string
  b: string
  kind: 'L' | 'T'
  choices: JoinChoice[]
  choice: JoinChoice
}

export interface AutoBuildResult {
  tops: AutoTop[]
  corners: AutoCorner[]
  warnings: string[]
}

export interface AutoBuildInput {
  walls: Wall[]
  cabinets: CabinetInstance[]
  fixtures?: RoomFixture[]
  benchtops?: BenchtopInstance[]
  /** Only these cabinets (the selection); null / empty = every base cabinet in the room. */
  cabIds?: string[] | null
}

const REACH = 1500   // longest push across a corner (to the other run's far line)
const GAP_L = 150    // an end this close to another run (across it) makes a corner
const GAP_T = 50     // … and this close to the side of one makes a tee (peninsula)
const MIN_RUN = 150  // shorter runs (a lone end panel) start unticked
const NEAR = 50      // an end this close to a wall / tall cabinet / appliance abuts it

// ── Small geometry ───────────────────────────────────────────────────────────

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x
const at = (f: WallFrame, u: number, v: number): Pt => ({ x: f.o.x + f.d.x * u + f.n.x * v, y: f.o.y + f.d.y * u + f.n.y * v })
const uOf = alongOf
const vOf = offOf

function area(pts: Pt[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p.x * q.y - q.x * p.y }
  return s / 2
}

/** Closed polygon → positively wound role edges. */
function polyEdges(pts: Pt[], roles: RoleEdge['role'][]): RoleEdge[] {
  const e = pts.map((a, i) => ({ a, b: pts[(i + 1) % pts.length], role: roles[i % roles.length] }))
  return area(pts) >= 0 ? e : e.reverse().map(x => ({ a: x.b, b: x.a, role: x.role }))
}

/** Rectangle u0..u1 × v0..v1 in a frame; the v0 edge gets `backRole`. */
function frameRect(f: WallFrame, u0: number, u1: number, v0: number, v1: number, backRole: RoleEdge['role'] = 'side'): RoleEdge[] {
  return polyEdges([at(f, u0, v0), at(f, u1, v0), at(f, u1, v1), at(f, u0, v1)], [backRole, 'side', 'front', 'side'])
}

function insideRing(p: Pt, ring: Pt[]): boolean {
  let c = false
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) c = !c
  }
  return c
}

function segsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const r = sub(b, a), s = sub(d, c), den = cross(r, s)
  if (Math.abs(den) < 1e-9) return false
  const t = cross(sub(c, a), s) / den, u = cross(sub(c, a), r) / den
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6
}

/** Two polygons share some area (or one holds the other). */
function overlaps(a: Pt[], b: Pt[]): boolean {
  if (a.some(p => insideRing(p, b)) || b.some(p => insideRing(p, a))) return true
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    if (segsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true
  }
  return false
}

/** Convex polygon clipped to the half-plane keep(p) ≥ 0 (Sutherland–Hodgman). */
function clipHalf(pts: Pt[], side: (p: Pt) => number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    const sp = side(p), sq = side(q)
    if (sp >= 0) out.push(p)
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq)
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })
    }
  }
  return out
}

/** Merge consecutive straight edges that run on in line with the same wall flag. */
function mergeInLine(segs: BenchtopSegment[]): BenchtopSegment[] {
  const out = segs.slice()
  for (let i = 0; out.length > 3 && i < out.length;) {
    const e = out[i], n = out[(i + 1) % out.length]
    const u = sub(e.p1, e.p0), v = sub(n.p1, n.p0)
    const lu = Math.hypot(u.x, u.y), lv = Math.hypot(v.x, v.y)
    if (lu && lv && Math.abs(cross(u, v)) / (lu * lv) < 1e-6 && u.x * v.x + u.y * v.y > 0 && !!e.edge?.wall === !!n.edge?.wall) {
      out[i] = { ...e, p1: { ...n.p1 } }
      out.splice((i + 1) % out.length, 1)
      if (i >= out.length) i = 0
    } else i++
  }
  return out
}

// ── Runs ─────────────────────────────────────────────────────────────────────

interface RunCab { cab: CabinetInstance; wall: Wall; perp: Pt; u0: number; u1: number }

interface Run {
  key: string
  wall: Wall
  f: WallFrame
  island: boolean
  /** Island run with cabinets on one side only (its back is exposed). */
  oneSided: boolean
  cabs: RunCab[]
  /** Bridged gaps along the wall. */
  gaps: [number, number][]
  /** True when 'left' (elevation) is the frame's low-u end. */
  leftIsMin: boolean
}

/** A cabinet's or fixture's along-wall span on a frame, when it stands on that face within `reach`. */
function spanOn(f: WallFrame, pts: Pt[], reach = 1200): [number, number] | null {
  const vs = pts.map(p => vOf(f, p))
  if (Math.max(...vs) < -NEAR || Math.min(...vs) > reach) return null
  const us = pts.map(p => uOf(f, p))
  return [Math.min(...us), Math.max(...us)]
}

function cabPts(c: CabinetInstance, w: Wall, perp: Pt): Pt[] {
  return cabinetSeedOutline(c, w, perp, 0).map(e => e.a)
}

// ── Plan ─────────────────────────────────────────────────────────────────────

export function planAutoBuild(
  input: AutoBuildInput,
  s: AutoBuildSettings,
  ov: Record<string, TopOverride> = {},
  cornerPicks: Record<string, JoinChoice | undefined> = {},
): AutoBuildResult {
  const { walls, cabinets } = input
  const fixtures = input.fixtures ?? []
  const warnings: string[] = []
  const cx = centroid(walls)
  const wallById = new Map(walls.map(w => [w.id, w]))
  const perpOf = (c: CabinetInstance, w: Wall) => cabWallPerp(c, w, wallInwardNormal(w, cx))
  const only = input.cabIds?.length ? new Set(input.cabIds) : null
  const existing = (input.benchtops ?? []).map(b => btSegments(b)).filter(x => x.length >= 3)

  // Base cabinets to build over.
  const bases = cabinets.filter(c => {
    if (c.is_kick_assembly || (c.assembly_class !== 'base' && c.assembly_class !== 'base_corner')) return false
    if (only && !only.has(c.id)) return false
    const w = c.wall_id ? wallById.get(c.wall_id) : undefined
    if (!w) return false
    if (s.skipCovered && existing.length) {
      const pts = cabPts(c, w, perpOf(c, w))
      const m = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 })
      if (existing.some(segs => pieceContains(segs, m))) return false
    }
    return true
  })
  if (!bases.length) {
    warnings.push(only ? 'No base cabinets in the selection.' : s.skipCovered && existing.length
      ? 'Every base cabinet already has a top over it.' : 'No base cabinets in this room.')
    return { tops: [], corners: [], warnings }
  }

  // Tall cabinets + floor appliances stop a run; under-bench appliances are bridged.
  const talls = cabinets.filter(c => (c.assembly_class === 'tall' || c.assembly_class === 'tall_corner') && c.wall_id && wallById.has(c.wall_id))
    .map(c => { const w = wallById.get(c.wall_id!)!; return { pts: cabPts(c, w, perpOf(c, w)) } })
  const floorFx = fixtures.filter(x => x.mount === 'floor').map(x => fixtureCorners(x) as Pt[])
  const underFx = fixtures.filter(x => x.mount === 'under_bench').map(x => fixtureCorners(x) as Pt[])
  const anyIn = (f: WallFrame, list: Pt[][], u0: number, u1: number) =>
    list.some(pts => { const sp = spanOn(f, pts); return !!sp && sp[0] < u1 - 1 && sp[1] > u0 + 1 })

  // Group by wall + side (island: both sides together).
  const groups = new Map<string, RunCab[]>()
  for (const c of bases) {
    const w = wallById.get(c.wall_id!)!
    const island = w.wall_type === 'island'
    const side = cabWallSide(c, w)
    const f = wallFrame(w, island ? 'face' : side, cx)
    const perp = perpOf(c, w)
    const us = cabPts(c, w, perp).map(p => uOf(f, p))
    const k = island ? w.id : `${w.id}|${side}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push({ cab: c, wall: w, perp, u0: Math.min(...us), u1: Math.max(...us) })
  }

  const runs: Run[] = []
  for (const [k, list] of groups) {
    const w = list[0].wall
    const island = w.wall_type === 'island'
    const side = island ? 'face' : cabWallSide(list[0].cab, w)
    const f = wallFrame(w, side, cx)
    list.sort((a, b) => a.u0 - b.u0)
    let cur: RunCab[] = [], gaps: [number, number][] = [], end = -Infinity, n = 0
    const flush = () => {
      if (!cur.length) return
      const sides = new Set(cur.map(c => cabWallSide(c.cab, w)))
      runs.push({ key: `${k}#${n++}`, wall: w, f, island, oneSided: island && sides.size === 1, cabs: cur, gaps, leftIsMin: side === 'face' })
      cur = []; gaps = []
    }
    for (const c of list) {
      const gap = c.u0 - end
      if (cur.length && gap > 1) {
        const bridge = anyIn(f, underFx, end, c.u0)
          || (gap <= s.bridgeGap && !anyIn(f, talls.map(t => t.pts), end, c.u0) && !anyIn(f, floorFx, end, c.u0))
        if (bridge) gaps.push([end, c.u0])
        else flush()
      }
      cur.push(c)
      end = Math.max(end, c.u1)
    }
    flush()
  }

  // Each run's outline before ends: cabinets + bridged gaps.
  const standard = walls.filter(w => w.wall_type !== 'island')
  const faces = standard.flatMap(w => [wallFrame(w, 'face', cx), wallFrame(w, 'back', cx)])
  interface Shape { run: Run; loop: RoleEdge[]; pts: Pt[]; u0: number; u1: number; v0: number; v1: number; endV: [[number, number] | null, [number, number] | null] }
  const shapes: Shape[] = runs.map(run => {
    const o = ov[run.key] ?? {}
    const front = o.front ?? s.frontOverhang
    // Snapped to whole mm along / off the wall: neighbours placed 0.5 mm into each other
    // would leave slivers under the union tolerance and the outline wouldn't close.
    const snap = (q: Pt) => at(run.f, Math.round(uOf(run.f, q)), Math.round(vOf(run.f, q)))
    const polys = run.cabs.map(c => cabinetSeedOutline(c.cab, c.wall, c.perp, front).map(e => ({ ...e, a: snap(e.a), b: snap(e.b) }))
      .filter(e => Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) > 0.5)).filter(p => p.length >= 3)
    const vr = (p: RoleEdge[]) => { const vs = p.map(e => vOf(run.f, e.a)); return [Math.min(...vs), Math.max(...vs)] }
    for (const [g0, g1] of run.gaps) {
      // Bridge with the shallower neighbour's depth.
      const nb = polys.filter(p => p.some(e => Math.abs(uOf(run.f, e.a) - g0) < 1 || Math.abs(uOf(run.f, e.a) - g1) < 1)).map(vr)
      if (!nb.length) continue
      const v0 = Math.max(...nb.map(r => r[0])), v1 = Math.min(...nb.map(r => r[1]))
      if (v1 - v0 > 1) polys.push(frameRect(run.f, g0, g1, v0, v1, 'back'))
    }
    const loop = simplifyLoop(unionOutlines(polys))
    const pts = loop.map(e => e.a)
    const us = pts.map(p => uOf(run.f, p)), vs = pts.map(p => vOf(run.f, p))
    const u0 = Math.min(...us), u1 = Math.max(...us)
    // A straight end = the points on the extreme u line (at least 100 deep).
    const band = (u: number): [number, number] | null => {
      const v = pts.filter(p => Math.abs(uOf(run.f, p) - u) < 0.5).map(p => vOf(run.f, p))
      return v.length >= 2 && Math.max(...v) - Math.min(...v) >= 100 ? [Math.min(...v), Math.max(...v)] : null
    }
    return { run, loop, pts, u0, u1, v0: Math.min(...vs), v1: Math.max(...vs), endV: [band(u0), band(u1)] }
  })

  // ── Ends ──
  // ends[k][0] = low-u end, [1] = high-u end.
  const ends: EndKind[][] = shapes.map(() => ['open', 'open'])
  const extra: RoleEdge[][][] = shapes.map(() => [])
  const endPts = (sh: Shape, e: 0 | 1): [Pt, Pt] | null => {
    const vb = sh.endV[e]
    if (!vb) return null
    const u = e ? sh.u1 : sh.u0
    return [at(sh.run.f, u, vb[0]), at(sh.run.f, u, vb[1])]
  }
  const extended = new Set<string>()   // `${k}:${e}`
  // Push end e of top k across to the other run's far line (L) or up to its near line (T).
  const extendTo = (k: number, e: 0 | 1, j: number, isL: boolean) => {
    const sh = shapes[k], o = shapes[j]
    const vb = sh.endV[e]
    if (!vb || extended.has(`${k}:${e}`)) return
    const u = e ? sh.u1 : sh.u0, dir = e ? 1 : -1
    const box = [at(sh.run.f, u, vb[0]), at(sh.run.f, u + dir * REACH, vb[0]), at(sh.run.f, u + dir * REACH, vb[1]), at(sh.run.f, u, vb[1])]
    const mid = vOf(o.run.f, at(sh.run.f, u, (vb[0] + vb[1]) / 2))
    const fromLow = mid < (o.v0 + o.v1) / 2
    const lineV = isL ? (fromLow ? o.v1 : o.v0) : (fromLow ? o.v0 : o.v1)
    const ext = clipHalf(box, p => (fromLow ? lineV - vOf(o.run.f, p) : vOf(o.run.f, p) - lineV))
    // Only when that line actually stops it (else the other run isn't across this end).
    if (ext.length >= 3 && Math.abs(area(ext)) > 1 && Math.abs(area(ext)) < Math.abs(area(box)) - 1) {
      extra[k].push(polyEdges(ext, ['side']))
      extended.add(`${k}:${e}`)
    }
  }
  const pairs = new Map<string, 'L' | 'T'>()
  shapes.forEach((sh, k) => {
    for (const e of [0, 1] as const) {
      const ep = endPts(sh, e)
      const u = e ? sh.u1 : sh.u0, dir = e ? 1 : -1
      const vb = sh.endV[e] ?? [sh.v0, sh.v1]
      // Against a wall face.
      if (ep && faces.some(f => ep.every(p => Math.abs(vOf(f, p)) < 5 && uOf(f, p) > -5 && uOf(f, p) < f.len + 5))) { ends[k][e] = 'wall'; continue }
      // Next to a tall cabinet / floor appliance on the same face.
      const probe = (list: Pt[][]) => list.some(pts => {
        const sp = spanOn(sh.run.f, pts)
        if (!sp) return false
        const vs = pts.map(p => vOf(sh.run.f, p))
        if (Math.max(...vs) < vb[0] + 1 || Math.min(...vs) > vb[1] - 1) return false
        return e ? sp[0] >= u - 1 && sp[0] <= u + NEAR : sp[1] <= u + 1 && sp[1] >= u - NEAR
      })
      if (probe(talls.map(t => t.pts))) { ends[k][e] = 'tall'; continue }
      if (probe(floorFx)) { ends[k][e] = 'appliance'; continue }
      if (!ep) continue
      // Another run across this end (not parallel) → corner (L) or tee (T). Nearest wins.
      const probeBox = (len: number) => [at(sh.run.f, u, vb[0]), at(sh.run.f, u + dir * len, vb[0]), at(sh.run.f, u + dir * len, vb[1]), at(sh.run.f, u, vb[1])]
      const box = probeBox(GAP_L)
      const m = at(sh.run.f, u, (vb[0] + vb[1]) / 2)
      let j = -1, best = Infinity
      shapes.forEach((o, q) => {
        if (q === k || Math.abs(cross(sh.run.f.d, o.run.f.d)) < 0.2 || !overlaps(box, o.pts)) return
        const d = Math.min(...o.pts.map(p => Math.hypot(p.x - m.x, p.y - m.y)))
        if (d < best) { best = d; j = q }
      })
      if (j < 0) continue
      const o = shapes[j]
      // L when this end's band reaches past one of the other run's ends; else T.
      const bu = [box[0], box[3]].map(p => uOf(o.run.f, p))
      const isL = Math.min(...bu) < o.u0 + 1 || Math.max(...bu) > o.u1 - 1
      if (!isL && !overlaps(probeBox(GAP_T), o.pts)) continue
      extendTo(k, e, j, isL)
      ends[k][e] = isL ? 'corner' : 'tee'
      const key = k < j ? `${k}-${j}` : `${j}-${k}`
      if (pairs.get(key) !== 'T') pairs.set(key, isL ? 'L' : 'T')
    }
  })
  // Both tops of an L run through the corner: one whose probe missed is pushed
  // across now; one that already reaches the wall is a corner end too.
  for (const [key, kind] of pairs) {
    if (kind !== 'L') continue
    const [a, b] = key.split('-').map(Number)
    for (const [k, o] of [[a, b], [b, a]]) {
      const sh = shapes[k], oc = shapes[o].pts
      const c = oc.reduce((acc, p) => ({ x: acc.x + p.x / oc.length, y: acc.y + p.y / oc.length }), { x: 0, y: 0 })
      const e: 0 | 1 = Math.abs(uOf(sh.run.f, c) - sh.u0) < Math.abs(uOf(sh.run.f, c) - sh.u1) ? 0 : 1
      if (ends[k][e] === 'open') extendTo(k, e, o, true)
      if (ends[k][e] === 'wall' || ends[k][e] === 'open') ends[k][e] = 'corner'
    }
  }

  // ── Outlines ──
  const built = shapes.map((sh, k) => {
    const run = sh.run, o = ov[run.key] ?? {}
    const polys = [sh.loop, ...extra[k]]
    const leftE = run.leftIsMin ? 0 : 1
    for (const e of [0, 1] as const) {
      if (ends[k][e] !== 'open') continue
      const oh = (e === leftE ? o.left : o.right) ?? s.endOverhang
      const vb = sh.endV[e]
      if (!(oh > 0) || !vb) continue
      polys.push(e ? frameRect(run.f, sh.u1, sh.u1 + oh, vb[0], vb[1]) : frameRect(run.f, sh.u0 - oh, sh.u0, vb[0], vb[1]))
    }
    // One-sided island: exposed back, plus the seating overhang.
    if (run.oneSided && s.islandBackOverhang > 0) {
      const back = Math.abs(sh.v0) < Math.abs(sh.v1) ? sh.v0 : sh.v1
      const away = back === sh.v0 ? -s.islandBackOverhang : s.islandBackOverhang
      const lo = (ends[k][0] === 'open' && sh.endV[0] ? -((leftE === 0 ? o.left : o.right) ?? s.endOverhang) : 0)
      const hi = (ends[k][1] === 'open' && sh.endV[1] ? ((leftE === 1 ? o.left : o.right) ?? s.endOverhang) : 0)
      polys.push(frameRect(run.f, sh.u0 + Math.min(0, lo), sh.u1 + Math.max(0, hi), Math.min(back, back + away), Math.max(back, back + away)))
    }
    const loop = simplifyLoop(polys.length > 1 ? unionOutlines(polys) : sh.loop)
    if (loop.length < 3) warnings.push(`Couldn't build a top along ${run.wall.name}.`)
    const segs: BenchtopSegment[] = loop.map(e => {
      let wall = !run.island && (e.role === 'back' || e.role === 'scribe')
      // Any edge lying on a standard wall's face is a wall edge.
      if (!wall) wall = faces.some(f => [e.a, e.b].every(p => Math.abs(vOf(f, p)) < 5 && uOf(f, p) > -5 && uOf(f, p) < f.len + 5))
      return { type: 'line', p0: { ...e.a }, p1: { ...e.b }, edge: { wall } } as BenchtopSegment
    })
    return mergeInLine(segs)
  })

  // ── Corners: joints between the tops that are built ──
  const keep = shapes.map(sh => !(ov[sh.run.key]?.skip ?? sh.u1 - sh.u0 < MIN_RUN))
  const idx: number[] = []
  shapes.forEach((_, k) => { if (keep[k] && built[k].length >= 3) idx.push(k) })
  const lenOf = (k: number) => { const us = outlinePoints(built[k], 4).map(p => uOf(shapes[k].run.f, p)); return Math.max(...us) - Math.min(...us) }
  const picks: Record<string, JoinChoice> = {}
  const corners: AutoCorner[] = []
  for (let jj = 1; jj < idx.length; jj++) for (let ii = 0; ii < jj; ii++) {
    const a = idx[ii], b = idx[jj]
    const kind = pairs.get(`${Math.min(a, b)}-${Math.max(a, b)}`)
    const plan = planJoin(built[a], built[b])
    if ('error' in plan) {
      if (kind && plan.error !== 'apart') warnings.push(`Couldn't work out the corner between ${shapes[a].run.wall.name} and ${shapes[b].run.wall.name}.`)
      continue
    }
    let choices = choicesFor(plan)
    if (kind === 'T' || !kind) {
      // A tee only butts: the run whose side it meets runs through.
      const tee = choices.filter(c => c === 'butt' || (c === 'butt_a' && ends[b].includes('tee')) || (c === 'butt_b' && ends[a].includes('tee')))
      if (tee.length) choices = tee
    }
    const longer: JoinChoice = lenOf(a) >= lenOf(b) ? 'butt_a' : 'butt_b'
    const def: JoinChoice = s.corner === 'mitre' && choices.includes('mitre') ? 'mitre'
      : choices.includes(longer) ? longer : choices.includes('butt') ? 'butt' : choices[0]
    const key = jointKey(ii, jj)
    const want = cornerPicks[`${shapes[a].run.key}~${shapes[b].run.key}`]
    const choice = want && choices.includes(want) ? want : def
    picks[key] = choice
    corners.push({ key: `${shapes[a].run.key}~${shapes[b].run.key}`, a: shapes[a].run.key, b: shapes[b].run.key, kind: kind ?? 'T', choices, choice })
  }
  const cut: { tops: BenchtopSegment[][]; steps: JointStep[] } = idx.length > 1
    ? jointTops(idx.map(k => built[k]), picks) : { tops: idx.map(k => built[k]), steps: [] }
  for (const st of cut.steps) if (st.error) warnings.push(`A corner couldn't be cut (${shapes[idx[st.i]].run.wall.name} ↔ ${shapes[idx[st.j]].run.wall.name}).`)

  const tops: AutoTop[] = shapes.map((sh, k) => {
    const at_ = idx.indexOf(k)
    const segs = at_ >= 0 ? cut.tops[at_] : built[k]
    const pts = outlinePoints(segs, 4)
    const us = pts.map(p => uOf(sh.run.f, p)), vs = pts.map(p => vOf(sh.run.f, p))
    const lo = ends[k][0], hi = ends[k][1]
    return {
      key: sh.run.key, wallId: sh.run.wall.id, wallName: sh.run.wall.name, island: sh.run.island,
      cabIds: sh.run.cabs.map(c => c.cab.id), segs,
      ends: sh.run.leftIsMin ? [lo, hi] : [hi, lo],
      length: Math.round(Math.max(...us) - Math.min(...us)), depth: Math.round(Math.max(...vs) - Math.min(...vs)),
      skip: !keep[k],
    }
  })
  return { tops, corners, warnings }
}
