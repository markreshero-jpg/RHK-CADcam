// ── Joints between benchtops (Phase 7c) ──────────────────────────────────────
// Spec: z_benchtop_builder/BENCHTOP-SPEC.md (Phase 7c — line tool + joints).
//
// Shift-click two or more tops → right-click → Join benchtops. The tops STAY
// SEPARATE benchtops (Mark 2026-10-15: "they still need to be separate benches
// just with joints on them"): each is trimmed to the joint and the edges where
// they meet become joint edges (`edge.joint` = butt / mitre — no profile, no
// tape; the resolver treats them as join edges). The user picks the joint:
//
//   touching (end to end)   the shared edge is the joint — Butt or Mitre type
//   overlapping (a corner)  Butt, A runs through  → B is cut back to A's edge
//                           Butt, B runs through  → A is cut back to B's edge
//                           Mitre                 → both cut corner to corner across the overlap
//
// Mitre across an overlap exists when the overlap holds exactly one inside
// and one outside corner of the two tops' combined outline (an L corner at any
// wall angle). Other edges keep their finish (wall / profile / tape).

import type { BenchtopSegment, BenchtopJoinLine, BenchtopJoinType } from '@/src/lib/types'
import { outlinePoints, segSamples, signedArea, nearestOnOutline } from '@/src/lib/benchtopGeometry'
import { splitIntoPieces, pieceContains } from '@/src/lib/benchtop-resolver/pieces'

type P = { x: number; y: number }
type Seg = BenchtopSegment
export interface Line { p0: P; p1: P }

const TOL = 0.5
const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y })
const cross = (a: P, b: P) => a.x * b.y - a.y * b.x
const dotp = (a: P, b: P) => a.x * b.x + a.y * b.y
const near = (a: P, b: P, tol = TOL) => Math.hypot(a.x - b.x, a.y - b.y) < tol

function distToSeg(p: P, a: P, b: P): number {
  const ab = sub(b, a), L2 = dotp(ab, ab)
  const t = L2 ? Math.max(0, Math.min(1, dotp(sub(p, a), ab) / L2)) : 0
  return Math.hypot(p.x - (a.x + ab.x * t), p.y - (a.y + ab.y * t))
}

function insideRing(p: P, ring: P[]): boolean {
  let c = false
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) c = !c
  }
  return c
}

/** The same edge run the other way (curves swap handles, arcs flip sweep). */
export function reverseSeg(s: Seg): Seg {
  const r: Seg = { ...s, p0: { ...s.p1 }, p1: { ...s.p0 } }
  if (s.type === 'curve') { r.cp1 = s.cp2 && { ...s.cp2 }; r.cp2 = s.cp1 && { ...s.cp1 } }
  if (s.type === 'arc') r.sweep = s.sweep ? 0 : 1
  return r
}

/** Outline wound with positive signed area (the union below needs one winding). */
function wound(segs: Seg[]): Seg[] {
  return signedArea(outlinePoints(segs)) >= 0 ? segs : segs.slice().reverse().map(reverseSeg)
}

type Kind = 'out' | 'in' | 'seam' | 'same'
/** otherWall: for 'same' — the other top's edge there is a wall edge. */
export interface EdgePiece { seg: Seg; kind: Kind; otherWall?: boolean }

/**
 * One top's edges cut where the other top's outline crosses them, in order,
 * each piece sorted: out = outside the other top, in = inside it, seam = on its
 * outline running the opposite way (they touch there), same = on its outline
 * running the same way (both tops' outer edge).
 */
function piecesOf(segs: Seg[], other: Seg[]): EdgePiece[] | 'curve' {
  const ring = outlinePoints(other, 24)
  // The other top's outline as straight pieces, each knowing its edge's wall flag.
  const edges = other.flatMap(o => {
    const q = [...segSamples(o, 24), o.p1]
    return q.slice(0, -1).map((a, i) => [a, q[i + 1], !!o.edge?.wall] as [P, P, boolean])
  })
  const out: EdgePiece[] = []
  for (const s of segs) {
    if (s.type !== 'line') {
      // Curves aren't cut: one wholly outside the other top stays; anything else can't merge.
      const pts = segSamples(s, 24).slice(1)
      if (pts.some(p => insideRing(p, ring) && !edges.some(([a, b]) => distToSeg(p, a, b) < TOL))) return 'curve'
      out.push({ seg: s, kind: 'out' })
      continue
    }
    const d = sub(s.p1, s.p0), L = Math.hypot(d.x, d.y)
    if (L < TOL) continue
    const ts = [0, 1]
    for (const [a, b] of edges) {
      const g = sub(b, a), den = cross(d, g)
      if (Math.abs(den) > 1e-9 * L * Math.hypot(g.x, g.y)) {
        const w = sub(a, s.p0)
        const t = cross(w, g) / den, u = cross(w, d) / den
        if (t > 0 && t < 1 && u > -1e-9 && u < 1 + 1e-9) ts.push(t)
      } else {
        for (const p of [a, b]) if (distToSeg(p, s.p0, s.p1) < TOL) {
          const t = dotp(sub(p, s.p0), d) / (L * L)
          if (t > 0 && t < 1) ts.push(t)
        }
      }
    }
    ts.sort((x, y) => x - y)
    for (let i = 0; i + 1 < ts.length; i++) {
      if ((ts[i + 1] - ts[i]) * L < TOL) continue
      const p0 = { x: s.p0.x + d.x * ts[i], y: s.p0.y + d.y * ts[i] }
      const p1 = { x: s.p0.x + d.x * ts[i + 1], y: s.p0.y + d.y * ts[i + 1] }
      const m = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
      const seg: Seg = { ...s, p0, p1 }
      const on = edges.find(([a, b]) => distToSeg(m, a, b) < TOL)
      if (on) {
        out.push({ seg, kind: dotp(sub(on[1], on[0]), d) > 0 ? 'same' : 'seam', otherWall: on[2] })
      } else {
        out.push({ seg, kind: insideRing(m, ring) ? 'in' : 'out' })
      }
    }
  }
  return out
}

const edgeKey = (s: Seg) => {
  const e = { ...(s.edge ?? {}), wall: !!s.edge?.wall } as Record<string, unknown>
  return JSON.stringify(Object.keys(e).sort().map(k => [k, e[k]]))
}

/** Merge consecutive straight edges that run on in line with the same finish. */
function simplify(loop: Seg[]): Seg[] {
  const out = loop.slice()
  let changed = true
  while (changed && out.length > 3) {
    changed = false
    for (let i = 0; i < out.length; i++) {
      const e = out[i], n = out[(i + 1) % out.length]
      if (e.type !== 'line' || n.type !== 'line') continue
      const u = sub(e.p1, e.p0), v = sub(n.p1, n.p0)
      const lu = Math.hypot(u.x, u.y), lv = Math.hypot(v.x, v.y)
      if (Math.abs(cross(u, v)) / (lu * lv) < 1e-6 && dotp(u, v) > 0 && edgeKey(e) === edgeKey(n)) {
        out[i] = { ...e, p1: { ...n.p1 } }
        out.splice((i + 1) % out.length, 1)
        changed = true
        break
      }
    }
  }
  return out
}

/** Join straight pieces that meet end to end in line into single lines. */
function mergeLines(lines: Line[]): Line[] {
  const out = lines.map(l => ({ p0: { ...l.p0 }, p1: { ...l.p1 } }))
  let changed = true
  while (changed) {
    changed = false
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = 0; j < out.length; j++) {
        if (i === j) continue
        const a = out[i], b = out[j]
        // Orient b to continue from a's end.
        const bb = near(a.p1, b.p0) ? b : near(a.p1, b.p1) ? { p0: b.p1, p1: b.p0 } : null
        if (!bb) continue
        const u = sub(a.p1, a.p0), v = sub(bb.p1, bb.p0)
        if (Math.abs(cross(u, v)) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)) > 1e-6 || dotp(u, v) <= 0) continue
        out[i] = { p0: a.p0, p1: bb.p1 }
        out.splice(j, 1)
        changed = true
        break outer
      }
    }
  }
  return out
}

export interface JoinPlan {
  /** The two tops' combined outline (positive winding). */
  segs: Seg[]
  /** Each top's edges cut and sorted against the other (A, B; positive winding). */
  pieces: [EdgePiece[], EdgePiece[]]
  /** 'touch' = the tops only share an edge; 'overlap' = one runs into the other. */
  kind: 'touch' | 'overlap'
  /** Top A's edges lying inside B (the join if A runs through), and B's inside A. */
  chainA: Line[]
  chainB: Line[]
  /** Edges the two tops share (they touch there). */
  seam: Line[]
  /** Corner-to-corner line across an L overlap, when there is one. */
  mitre: Line | null
}

export type JoinPlanError = 'apart' | 'curve' | 'shape'
export const JOIN_PLAN_ERRORS: Record<JoinPlanError, string> = {
  apart: "These tops don't touch or overlap — move one onto the other first.",
  curve: 'A curved edge runs into the other top — straighten it first.',
  shape: "Can't work out the joint for these tops.",
}

/** Chain edges head to tail into loops; the largest. Null when none closes. */
function largestLoop(segs: Seg[]): Seg[] | null {
  const used = new Set<number>()
  const loops: Seg[][] = []
  for (let s = 0; s < segs.length; s++) {
    if (used.has(s)) continue
    const loop: Seg[] = []
    let i = s
    while (i >= 0 && !used.has(i)) {
      used.add(i); loop.push(segs[i])
      const end = segs[i].p1
      i = segs.findIndex((q, j) => !used.has(j) && near(q.p0, end))
    }
    if (loop.length >= 2 && near(loop[loop.length - 1].p1, loop[0].p0)) loops.push(loop)
  }
  if (!loops.length) return null
  const area = (l: Seg[]) => signedArea(outlinePoints(l, 8))
  const best = simplify(loops.reduce((b, l) => (area(l) > area(b) ? l : b)))
  return best.length >= 3 ? best : null
}

/** How two tops meet, before the user picks the joint. */
export function planJoin(a: Seg[], b: Seg[]): JoinPlan | { error: JoinPlanError } {
  const A = wound(a), B = wound(b)
  const pa = piecesOf(A, B), pb = piecesOf(B, A)
  if (pa === 'curve' || pb === 'curve') return { error: 'curve' }
  const asLine = (p: EdgePiece): Line => ({ p0: p.seg.p0, p1: p.seg.p1 })
  const chainA = mergeLines(pa.filter(p => p.kind === 'in').map(asLine))
  const chainB = mergeLines(pb.filter(p => p.kind === 'in').map(asLine))
  const seam = mergeLines(pa.filter(p => p.kind === 'seam').map(asLine))
  if (!chainA.length && !chainB.length && !seam.length) return { error: 'apart' }

  // Combined outline: outside pieces of both; an edge both share the same way
  // once — the wall one if either is, else A's.
  const keepSame = (p: EdgePiece, first: boolean) => (first ? !!p.seg.edge?.wall || !p.otherWall : !!p.seg.edge?.wall && !p.otherWall)
  const outs = [
    ...pa.filter(p => p.kind === 'out' || (p.kind === 'same' && keepSame(p, true))),
    ...pb.filter(p => p.kind === 'out' || (p.kind === 'same' && keepSame(p, false))),
  ].map(p => p.seg)
  const segs = largestLoop(outs)
  if (!segs) return { error: 'shape' }

  // Mitre: the merged outline has exactly two corners in the overlap — the
  // inside corner (where the fronts cross) and the outside one (the wall
  // corner / outer corner). The mitre runs between them, at any wall angle.
  let mitre: Line | null = null
  if (chainA.length || chainB.length) {
    const ra = outlinePoints(A, 24), rb = outlinePoints(B, 24)
    const inOrOn = (p: P, ring: P[], segs: Seg[]) => insideRing(p, ring) || (nearestOnOutline(segs, p)?.d ?? Infinity) < 1
    // Positive winding: a left turn (cross > 0) is an outside corner.
    const turn = (k: number) => { const pv = segs[(k - 1 + segs.length) % segs.length], s = segs[k]; return cross(sub(pv.p1, pv.p0), sub(s.p1, s.p0)) }
    const corners = segs.map((s, k) => ({ p: s.p0, out: turn(k) > 0 })).filter(c => inOrOn(c.p, ra, A) && inOrOn(c.p, rb, B))
    if (corners.length === 2 && corners[0].out !== corners[1].out) mitre = { p0: { ...corners[0].p }, p1: { ...corners[1].p } }
  }
  const kind = chainA.length || chainB.length ? 'overlap' : 'touch'
  return { segs, pieces: [pa, pb], kind, chainA, chainB, seam, mitre }
}

/** The join pick for one meeting. Touching tops: 'butt' / 'mitre' only. */
export type JoinChoice = 'butt_a' | 'butt_b' | 'mitre' | 'butt'

export function choicesFor(plan: JoinPlan): JoinChoice[] {
  if (plan.kind === 'touch') return ['butt', 'mitre']
  const out: JoinChoice[] = []
  if (plan.chainA.length) out.push('butt_a')
  if (plan.chainB.length) out.push('butt_b')
  if (plan.mitre) out.push('mitre')
  return out
}

/**
 * The default pick (Mark 2026-10-15): Mitre wherever it fits. Tops touching
 * end to end in line (the shared edge's ends aren't corners of the merged
 * outline) stay Butt — a square seam can't be mitred.
 */
export function defaultChoice(plan: JoinPlan): JoinChoice {
  const ok = choicesFor(plan)
  if (plan.kind === 'touch') {
    const corner = (p: P) => plan.segs.some(s => near(s.p0, p, 1))
    return plan.seam.some(l => corner(l.p0) && corner(l.p1)) ? 'mitre' : 'butt'
  }
  return ok.includes('mitre') ? 'mitre' : ok[0]
}

/** Join lines for a pick (shared edges always join too). */
export function joinsFor(plan: JoinPlan, choice: JoinChoice): BenchtopJoinLine[] {
  const mk = (l: Line, type: BenchtopJoinType): BenchtopJoinLine => ({ p0: { ...l.p0 }, p1: { ...l.p1 }, type })
  if (plan.kind === 'touch') return plan.seam.map(l => mk(l, choice === 'mitre' ? 'mitre' : 'butt'))
  const seam = plan.seam.map(l => mk(l, 'butt'))
  if (choice === 'mitre' && plan.mitre) return [...seam, mk(plan.mitre, 'mitre')]
  const chain = choice === 'butt_b' ? plan.chainB : plan.chainA.length ? plan.chainA : plan.chainB
  return [...seam, ...chain.map(l => mk(l, 'butt'))]
}

const asJoint = (s: Seg, type: BenchtopJoinType): Seg => ({ ...s, edge: { joint: type } })

/**
 * The two tops cut to the joint (A, B — positive winding), meeting edges
 * marked `edge.joint`. Null when the pick doesn't work out.
 */
export function splitAtJoint(plan: JoinPlan, choice: JoinChoice): [Seg[], Seg[]] | null {
  const [pa, pb] = plan.pieces
  if (plan.kind === 'touch') {
    // Nothing to trim: the shared edge becomes the joint on both.
    const type: BenchtopJoinType = choice === 'mitre' ? 'mitre' : 'butt'
    const mark = (ps: EdgePiece[]) => simplify(ps.map(p => (p.kind === 'seam' ? asJoint(p.seg, type) : p.seg)))
    return [mark(pa), mark(pb)]
  }
  if (choice === 'mitre') {
    // Cut the combined outline along the mitre; each piece goes back to the top it holds most of.
    if (!plan.mitre) return null
    const pcs = splitIntoPieces(plan.segs, joinsFor(plan, 'mitre'))
    if (pcs.length !== 2) return null
    const A = pa.map(p => p.seg), B = pb.map(p => p.seg)
    const share = (segs: Seg[]) => {
      const pts = outlinePoints(segs, 8), xs = pts.map(p => p.x), ys = pts.map(p => p.y)
      const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0
      let a = 0, b = 0
      for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
        const q = { x: x0 + (w * (i + 0.5)) / 16, y: y0 + (h * (j + 0.5)) / 16 }
        if (!pieceContains(segs, q)) continue
        const inA = pieceContains(A, q), inB = pieceContains(B, q)
        if (inA && !inB) a++
        if (inB && !inA) b++
      }
      return a - b
    }
    const clean = (segs: Seg[]) => simplify(segs.map(seg => {
      const { join, ...rest } = seg as Seg & { join?: BenchtopJoinType }
      return join && !rest.edge?.joint ? asJoint(rest, join) : rest
    }))
    const [p0, p1] = pcs.map(p => clean(p.segs))
    return share(p0) >= share(p1) ? [p0, p1] : [p1, p0]
  }
  // Butt: the top that runs through keeps its outline (its edges inside the
  // other become joint edges); the other is cut back to it (A − B).
  const bOn = choice === 'butt_b'
  const [runs, cut] = bOn ? [pb, pa] : [pa, pb]
  const through = simplify(runs.map(p => (p.kind === 'in' || p.kind === 'seam' ? asJoint(p.seg, 'butt') : p.seg)))
  const trimmed = largestLoop([
    ...cut.filter(p => p.kind === 'out').map(p => p.seg),
    ...cut.filter(p => p.kind === 'seam').map(p => asJoint(p.seg, 'butt')),
    ...runs.filter(p => p.kind === 'in').map(p => asJoint(reverseSeg(p.seg), 'butt')),
  ])
  if (!trimmed) return null
  return bOn ? [trimmed, through] : [through, trimmed]
}

export interface JointStep { i: number; j: number; plan: JoinPlan | null; error?: JoinPlanError; choice: JoinChoice | null }

/** Key for one meeting's pick: the two tops' places in the pick. */
export const jointKey = (i: number, j: number) => `${i}-${j}`

/**
 * Joint every pair of picked tops that touch or overlap (in pick order: top j
 * against each top before it). `choices` holds the user's pick per meeting
 * (jointKey) — missing / unusable = the default. Tops that don't meet are
 * skipped; ok is false when no pair meets or a meeting can't be worked out.
 */
export function jointTops(
  tops: Seg[][], choices: Record<string, JoinChoice | null | undefined>,
): { tops: Seg[][]; steps: JointStep[]; ok: boolean } {
  const cur = tops.slice()
  const steps: JointStep[] = []
  let ok = true
  for (let j = 1; j < cur.length; j++) {
    for (let i = 0; i < j; i++) {
      const plan = planJoin(cur[i], cur[j])
      if ('error' in plan) {
        if (plan.error !== 'apart') { steps.push({ i, j, plan: null, error: plan.error, choice: null }); ok = false }
        continue
      }
      const want = choices[jointKey(i, j)]
      const choice = want && choicesFor(plan).includes(want) ? want : defaultChoice(plan)
      const r = splitAtJoint(plan, choice)
      if (!r) { steps.push({ i, j, plan: null, error: 'shape', choice: null }); ok = false; continue }
      steps.push({ i, j, plan, choice })
      cur[i] = r[0]; cur[j] = r[1]
    }
  }
  return { tops: cur, steps, ok: ok && steps.length > 0 }
}

// ── Line tool (Phase 7c) ─────────────────────────────────────────────────────
// Draw the back line (on the wall face, any angle), then pull a parallel line
// off it: the two lines make the rectangle.

/** Signed distance of c off the line p0→p1 (the sign says which side; lineRect takes the same sign). */
export function offsetFromLine(p0: P, p1: P, c: P): number {
  const d = sub(p1, p0), L = Math.hypot(d.x, d.y)
  return L ? cross(d, sub(c, p0)) / L : 0
}

/** Rectangle off the line p0→p1 by a signed offset (see offsetFromLine). */
export function lineRect(p0: P, p1: P, off: number): P[] {
  const d = sub(p1, p0), L = Math.hypot(d.x, d.y) || 1
  const n = { x: -d.y / L, y: d.x / L }
  const q = (p: P) => ({ x: p.x + n.x * off, y: p.y + n.y * off })
  return [{ ...p0 }, { ...p1 }, q(p1), q(p0)]
}
