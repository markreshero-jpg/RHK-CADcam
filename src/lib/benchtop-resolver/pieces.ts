// ── Benchtop pieces (Phase 4) ────────────────────────────────────────────────
// Spec: z_benchtop_builder/BENCHTOP-SPEC.md (P-b joins, Phase 4).
//
// A top's outline (segments, room frame) is cut into PIECES by its join
// lines. Each piece is again a closed loop of segments; the edge created by a
// join carries `join` (butt / mitre) instead of a finish. Pure geometry — no
// materials, no DB.

import type { BenchtopSegment, BenchtopJoinLine, BenchtopJoinType } from '@/src/lib/types'
import { segPoint, segSamples, outlinePoints, signedArea, segLength } from '@/src/lib/benchtopGeometry'

type P = { x: number; y: number }
export type PieceSeg = BenchtopSegment & { join?: BenchtopJoinType }
export interface Piece { segs: PieceSeg[] }

const dist = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y)
const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const ON = 1   // mm — a join end within this of the outline is "on" it

// Parameter t of the point on segment s nearest p (sampled, then refined).
function paramOn(s: BenchtopSegment, p: P): number {
  if (s.type === 'line') {
    const dx = s.p1.x - s.p0.x, dy = s.p1.y - s.p0.y, L = dx * dx + dy * dy
    return L ? Math.max(0, Math.min(1, ((p.x - s.p0.x) * dx + (p.y - s.p0.y) * dy) / L)) : 0
  }
  let best = 0, bd = Infinity
  for (let i = 0; i <= 64; i++) { const d = dist(segPoint(s, i / 64), p); if (d < bd) { bd = d; best = i / 64 } }
  let step = 1 / 64
  for (let k = 0; k < 20; k++) {
    step /= 2
    for (const t of [best - step, best + step]) {
      if (t < 0 || t > 1) continue
      const d = dist(segPoint(s, t), p)
      if (d < bd) { bd = d; best = t }
    }
  }
  return best
}

// Split segment s at parameter t into two (curves by de Casteljau; arcs keep
// their radius, each half flagged small-arc).
function splitSeg(s: PieceSeg, t: number, at: P): [PieceSeg, PieceSeg] {
  const e = s.edge ? { ...s.edge } : undefined
  if (s.type === 'curve' && s.cp1 && s.cp2) {
    const a = lerp(s.p0, s.cp1, t), b = lerp(s.cp1, s.cp2, t), c = lerp(s.cp2, s.p1, t)
    const ab = lerp(a, b, t), bc = lerp(b, c, t)
    return [{ ...s, p1: at, cp1: a, cp2: ab, edge: e }, { ...s, p0: at, cp1: bc, cp2: c, edge: e ? { ...e } : undefined }]
  }
  if (s.type === 'arc') return [{ ...s, p1: at, largeArc: 0, edge: e }, { ...s, p0: at, largeArc: 0, edge: e ? { ...e } : undefined }]
  return [{ ...s, p1: at, edge: e }, { ...s, p0: at, edge: e ? { ...e } : undefined }]
}

// Make `p` a vertex of the loop; returns the loop and the vertex index.
function insertVertex(segs: PieceSeg[], p: P): { segs: PieceSeg[]; vi: number } | null {
  let bi = -1, bt = 0, bd = Infinity
  segs.forEach((s, i) => {
    const t = paramOn(s, p), d = dist(segPoint(s, t), p)
    if (d < bd) { bd = d; bi = i; bt = t }
  })
  if (bi < 0 || bd > ON) return null
  const s = segs[bi]
  if (dist(s.p0, p) < ON) return { segs, vi: bi }
  if (dist(s.p1, p) < ON) return { segs, vi: (bi + 1) % segs.length }
  const out = [...segs]
  out.splice(bi, 1, ...splitSeg(s, bt, p))
  return { segs: out, vi: bi + 1 }
}

// Cut one loop along the chord a→b (both on the outline). Null if they aren't.
function cutLoop(segs: PieceSeg[], a: P, b: P, type: BenchtopJoinType): [Piece, Piece] | null {
  const ia = insertVertex(segs, a)
  if (!ia) return null
  const ib = insertVertex(ia.segs, b)
  if (!ib) return null
  const loop = ib.segs
  // a's index may have shifted if b was inserted before it.
  const va = loop.findIndex(s => dist(s.p0, a) < ON)
  const vb = ib.vi
  if (va < 0 || va === vb) return null
  const n = loop.length
  const run = (from: number, to: number) => {
    const out: PieceSeg[] = []
    for (let i = from; i !== to; i = (i + 1) % n) out.push(loop[i])
    return out
  }
  const A = run(va, vb), B = run(vb, va)
  if (!A.length || !B.length) return null
  const chord = (p0: P, p1: P): PieceSeg => ({ type: 'line', p0: { ...p0 }, p1: { ...p1 }, join: type })
  return [{ segs: [...A, chord(loop[vb].p0, loop[va].p0)] }, { segs: [...B, chord(loop[va].p0, loop[vb].p0)] }]
}

// Every piece of a top. Joins are applied in order; each cuts the piece both
// its ends lie on. A join that touches no piece (stale / off the outline) is
// skipped.
export function splitIntoPieces(segs: BenchtopSegment[], joins: BenchtopJoinLine[]): Piece[] {
  let pieces: Piece[] = [{ segs: segs.map(s => ({ ...s })) }]
  for (const j of joins) {
    for (let k = 0; k < pieces.length; k++) {
      const cut = cutLoop(pieces[k].segs, j.p0, j.p1, j.type)
      if (cut) { pieces = [...pieces.slice(0, k), ...cut, ...pieces.slice(k + 1)]; break }
    }
  }
  return pieces
}

// ── Piece frame + measurements ───────────────────────────────────────────────

export interface PieceFrame {
  o: P; u: P; v: P            // origin, long axis, across
  length: number; width: number
  toLocal: (p: P) => P        // (along, across) from the piece's min corner
}

// The piece's long axis = its longest straight edge (else the x axis); the
// cut size is the extent along / across that axis.
export function pieceFrame(segs: PieceSeg[]): PieceFrame {
  let u = { x: 1, y: 0 }, best = 0
  for (const s of segs) {
    if (s.type !== 'line') continue
    const L = dist(s.p0, s.p1)
    if (L > best + 1e-6) { best = L; u = { x: (s.p1.x - s.p0.x) / L, y: (s.p1.y - s.p0.y) / L } }
  }
  // Keep axes positive-ish so labels don't flip with drawing direction.
  if (u.x < -1e-9 || (Math.abs(u.x) < 1e-9 && u.y < 0)) u = { x: -u.x, y: -u.y }
  const v = { x: -u.y, y: u.x }
  const pts = outlinePoints(segs, 16)
  const us = pts.map(p => p.x * u.x + p.y * u.y), vs = pts.map(p => p.x * v.x + p.y * v.y)
  const u0 = Math.min(...us), v0 = Math.min(...vs)
  const o = { x: u0 * u.x + v0 * v.x, y: u0 * u.y + v0 * v.y }
  return {
    o, u, v, length: Math.max(...us) - u0, width: Math.max(...vs) - v0,
    toLocal: p => ({ x: p.x * u.x + p.y * u.y - u0, y: p.x * v.x + p.y * v.y - v0 }),
  }
}

export const pieceArea = (segs: PieceSeg[]) => Math.abs(signedArea(outlinePoints(segs, 16)))

/** A plain rectangle: 4 straight edges at right angles. */
export function isRectangle(segs: PieceSeg[]): boolean {
  if (segs.length !== 4 || segs.some(s => s.type !== 'line')) return false
  return segs.every((s, i) => {
    const n = segs[(i + 1) % 4]
    const a = { x: s.p1.x - s.p0.x, y: s.p1.y - s.p0.y }, b = { x: n.p1.x - n.p0.x, y: n.p1.y - n.p0.y }
    return Math.abs(a.x * b.x + a.y * b.y) < 1e-3 * Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)
  })
}

// Inside intervals of the line across the piece at `along` (local frame) —
// one entry per run of material (an L's long run and return are separate).
export function crossIntervals(segs: PieceSeg[], f: PieceFrame, along: number): number[] {
  const pts = outlinePoints(segs, 16).map(f.toLocal)
  const hits: number[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    if ((a.x <= along) === (b.x <= along)) continue
    hits.push(a.y + (b.y - a.y) * (along - a.x) / (b.x - a.x))
  }
  hits.sort((x, y) => x - y)
  const out: number[] = []
  for (let i = 0; i + 1 < hits.length; i += 2) out.push(hits[i + 1] - hits[i])
  return out
}

export const edgeLength = (s: PieceSeg) => segLength(s)
export const pointsOf = (s: PieceSeg) => [...segSamples(s, 16), s.p1]

/** Is the point inside the piece (even-odd)? */
export function pieceContains(segs: PieceSeg[], p: P): boolean {
  const pts = outlinePoints(segs, 16)
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
