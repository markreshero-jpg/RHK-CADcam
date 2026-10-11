// ── Benchtop ↔ wall anchoring (Phase 3b) ─────────────────────────────────────
// Spec: z_benchtop_builder/BENCHTOP-SPEC.md (P-e anchor, P-f position, P-h).
//
// A top belongs to one wall + side (wall_id / wall_side, same meaning as a
// cabinet's). Its outline stays in the room frame; everything here measures it
// against a wall FACE LINE:
//   o = start of that face, d = wall direction, n = unit normal pointing away
//   from the wall into the space on that side.
// along(p) = (p − o)·d is the elevation x (same as cabT for a cabinet);
// off(p)   = (p − o)·n is the distance out from the face.
//
// Which walls a top touches is derived from geometry every time (wallContacts)
// rather than stored per edge — it can't go stale when a wall or top moves.

import type { Wall, BenchtopSegment } from './types'
import { wallDir, wallInwardNormal, type Pt } from './geometry'
import { outlinePoints, outwardNormal, outlineCentroid, rotateFn, translateFn, mapSegments } from './benchtopGeometry'

export type WallSide = 'face' | 'back'
export interface WallFrame { o: Pt; d: Pt; n: Pt; len: number }
export interface BtAnchor { wall_id: string; wall_side: WallSide }

const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y

export function wallFrame(wall: Wall, side: WallSide, cx: Pt): WallFrame {
  const d = wallDir(wall)
  const inward = wallInwardNormal(wall, cx.x, cx.y)
  if (side === 'face') return { o: { x: wall.pos_x, y: wall.pos_y }, d, n: inward, len: wall.length }
  // Back = the outer face, thickness out (islands: thickness 0, same line).
  const t = wall.thickness ?? 0
  return {
    o: { x: wall.pos_x - inward.x * t, y: wall.pos_y - inward.y * t },
    d, n: { x: -inward.x, y: -inward.y }, len: wall.length,
  }
}

export const alongOf = (f: WallFrame, p: Pt) => (p.x - f.o.x) * f.d.x + (p.y - f.o.y) * f.d.y
export const offOf   = (f: WallFrame, p: Pt) => (p.x - f.o.x) * f.n.x + (p.y - f.o.y) * f.n.y

// ── Contacts ─────────────────────────────────────────────────────────────────

export interface WallContact { wallId: string; side: WallSide; edge: number; t0: number; t1: number }

/** How far (mm) an edge may sit off a wall face and still count as against it. */
export const CONTACT_TOL = 10

// Straight edges lying on a wall face: within CONTACT_TOL of the face line,
// overlapping the wall's length, with the top on that face's side (the edge's
// outward normal points into the wall). Wall / exposed tags are not consulted.
export function wallContacts(segs: BenchtopSegment[], walls: Wall[], cx: Pt): WallContact[] {
  const out: WallContact[] = []
  if (segs.length < 3) return out
  segs.forEach((s, i) => {
    if (s.type !== 'line') return
    const nOut = outwardNormal(segs, i)
    for (const wall of walls) {
      for (const side of ['face', 'back'] as const) {
        const f = wallFrame(wall, side, cx)
        if (Math.abs(offOf(f, s.p0)) > CONTACT_TOL || Math.abs(offOf(f, s.p1)) > CONTACT_TOL) continue
        if (dot(nOut, f.n) > -0.9) continue
        const a = alongOf(f, s.p0), b = alongOf(f, s.p1)
        const t0 = Math.max(Math.min(a, b), 0), t1 = Math.min(Math.max(a, b), f.len)
        if (t1 - t0 < 1) continue
        out.push({ wallId: wall.id, side, edge: i, t0, t1 })
      }
    }
  })
  return out
}

// ── Anchor ───────────────────────────────────────────────────────────────────

// The wall + side a top belongs to: the face its wall edges run along longest;
// with no wall edge (island / freestanding top), the nearest wall face on the
// side the top sits.
export function autoAnchor(segs: BenchtopSegment[], walls: Wall[], cx: Pt): BtAnchor | null {
  if (!walls.length || segs.length < 3) return null
  const byFace = new Map<string, number>()
  for (const c of wallContacts(segs, walls, cx)) {
    const k = `${c.wallId}|${c.side}`
    byFace.set(k, (byFace.get(k) ?? 0) + c.t1 - c.t0)
  }
  if (byFace.size) {
    const [k] = [...byFace.entries()].sort((a, b) => b[1] - a[1])[0]
    const [wall_id, wall_side] = k.split('|') as [string, WallSide]
    return { wall_id, wall_side }
  }
  const c = outlineCentroid(segs)
  let best: (BtAnchor & { d: number }) | null = null
  for (const wall of walls) {
    for (const side of ['face', 'back'] as const) {
      const f = wallFrame(wall, side, cx)
      const off = offOf(f, c)
      if (off < 0) continue
      const t = alongOf(f, c)
      const dAlong = t < 0 ? -t : t > f.len ? t - f.len : 0
      const d = Math.hypot(dAlong, off)
      if (!best || d < best.d) best = { wall_id: wall.id, wall_side: side, d }
    }
  }
  return best && { wall_id: best.wall_id, wall_side: best.wall_side }
}

// ── Elevation visibility (P-h) ───────────────────────────────────────────────

// A top reads on its anchor elevation, on every face its edges sit against,
// and — anchored to an island — on both sides of that island.
export function btShowsOn(
  bt: { wall_id: string | null; wall_side: WallSide },
  contacts: WallContact[],
  wall: Wall,
  side: WallSide,
): boolean {
  if (bt.wall_id === wall.id && (bt.wall_side === side || wall.wall_type === 'island')) return true
  return contacts.some(c => c.wallId === wall.id && c.side === side)
}

// ── Position (P-f) ───────────────────────────────────────────────────────────

export interface BtPosition { along: number; off: number; length: number; depth: number }

/** Extent of the outline in a wall frame: start along the wall, nearest distance off the face. */
export function btPosition(segs: BenchtopSegment[], f: WallFrame): BtPosition | null {
  const pts = outlinePoints(segs)
  if (!pts.length) return null
  const as = pts.map(p => alongOf(f, p)), os = pts.map(p => offOf(f, p))
  const along = Math.min(...as), off = Math.min(...os)
  return { along, off, length: Math.max(...as) - along, depth: Math.max(...os) - off }
}

/** Translation that puts the outline's start at `along` and its back at `off`. */
export function positionFn(segs: BenchtopSegment[], f: WallFrame, target: { along?: number; off?: number }) {
  const cur = btPosition(segs, f)
  if (!cur) return null
  const da = (target.along ?? cur.along) - cur.along
  const dn = (target.off ?? cur.off) - cur.off
  return translateFn(da * f.d.x + dn * f.n.x, da * f.d.y + dn * f.n.y)
}

// Carry a top from one wall face to another, rigidly (never mirrored): turn it
// so its old face normal becomes the new one, keep its start along the wall
// (clamped to the new wall), and set its back `off` from the new face (default:
// the same distance it had from the old one).
export function reanchorFn(segs: BenchtopSegment[], from: WallFrame, to: WallFrame, off?: number) {
  const rad = Math.atan2(to.n.y, to.n.x) - Math.atan2(from.n.y, from.n.x)
  const before = btPosition(segs, from)
  if (!before) return null
  const rot = rotateFn(outlineCentroid(segs), rad)
  const after = btPosition(mapSegments(segs, rot), to)
  if (!after) return null
  const along = Math.max(0, Math.min(before.along, Math.max(0, to.len - after.length)))
  const da = along - after.along, dn = (off ?? before.off) - after.off
  const shift = translateFn(da * to.d.x + dn * to.n.x, da * to.d.y + dn * to.n.y)
  return (p: Pt) => shift(rot(p))
}

/** Is the top already on that face (touching it, or an island top beside it)? */
export function btTouches(segs: BenchtopSegment[], contacts: WallContact[], wall: Wall, side: WallSide, cx: Pt): boolean {
  if (contacts.some(c => c.wallId === wall.id && c.side === side)) return true
  if (wall.wall_type !== 'island') return false
  const pos = btPosition(segs, wallFrame(wall, side, cx))
  // Straddles or sits beside the island line, overlapping its length.
  return !!pos && pos.off < 1500 && pos.along < wall.length && pos.along + pos.length > 0
}

// ── Stretch (typed size edits) ───────────────────────────────────────────────

export type StretchEnd = 'left' | 'right' | 'both' | 'front'

// Resize a top along its anchor wall (left / right / both ends) or out from it
// (front). Every point past the halfway line on the moving side shifts by the
// change, so an L's return leg or a U's arm keeps its width and the edges in
// between just get longer. 'left' / 'right' = the END that moves.
export function stretchFn(segs: BenchtopSegment[], f: WallFrame, end: StretchEnd, delta: number) {
  const pos = btPosition(segs, f)
  if (!pos) return null
  const shift = (p: Pt, k: number, v: Pt): Pt => ({ x: p.x + v.x * k, y: p.y + v.y * k })
  if (end === 'front') {
    const mid = pos.off + pos.depth / 2
    return (p: Pt) => (offOf(f, p) > mid ? shift(p, delta, f.n) : p)
  }
  const mid = pos.along + pos.length / 2
  const right = end === 'right' ? delta : end === 'both' ? delta / 2 : 0
  const left = end === 'left' ? delta : end === 'both' ? delta / 2 : 0
  return (p: Pt) => (alongOf(f, p) > mid ? shift(p, right, f.d) : shift(p, -left, f.d))
}

/** Overhang of a top past the cabinets under it (null = no cabinets under it). */
export interface BtOverhang { left: number; right: number; front: number }

// cabs = the base cabinets on the anchor wall + side as along-wall spans with
// their depth (t, dx, dz). Only spans overlapping the top count.
export function btOverhangs(pos: BtPosition, cabs: { t: number; dx: number; dz: number }[]): BtOverhang | null {
  const under = cabs.filter(c => c.t < pos.along + pos.length - 1 && c.t + c.dx > pos.along + 1)
  if (!under.length) return null
  const start = Math.min(...under.map(c => c.t)), end = Math.max(...under.map(c => c.t + c.dx))
  const front = Math.max(...under.map(c => c.dz))
  return { left: start - pos.along, right: pos.along + pos.length - end, front: pos.off + pos.depth - front }
}
