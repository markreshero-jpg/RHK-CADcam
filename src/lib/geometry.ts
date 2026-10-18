import { Wall, CabinetInstance, Room } from './types'
import { footprintOutline } from './cabinetShape/footprint'

export interface Pt { x: number; y: number }

// ── Constants ─────────────────────────────────────────────────────────────────

export const MIN_ZOOM    = 0.02
export const MAX_ZOOM    = 3
export const MIN_WALL_LEN = 10    // mm
export const SNAP_PX     = 14    // endpoint snap radius in screen pixels
export const WALL_SNAP_PX = 80   // cabinet-to-wall snap radius in screen pixels

export const CAB_FILL: Record<string, string> = {
  base: '#1e3a5f', wall: '#1a3a20', tall: '#2d1b4e',
  base_corner: '#1e3a5f', wall_corner: '#1a3a20', tall_corner: '#2d1b4e',
}
export const CAB_FILL_SEL: Record<string, string> = {
  base: '#2563eb', wall: '#16a34a', tall: '#7c3aed',
  base_corner: '#2563eb', wall_corner: '#16a34a', tall_corner: '#7c3aed',
}

// ── Cabinet collision rules ───────────────────────────────────────────────────
// Two cabinets block each other only when they physically overlap — i.e. their
// along-wall (X) ranges AND their vertical (Y) ranges both overlap. The X check
// is done by findFreeSlot / slideToFreeSlot via the `occupied` t/dx ranges; this
// module supplies the Y (vertical-extent) test, so e.g. a wall unit can slide
// over a base unit (different heights) but a tall unit blocks everything.

// Height (mm from floor) of the wall-cabinet top line — soffit if set, else the
// room's wall-cabinet-top. Matches the elevation renderer's wallCabTopFor.
// soffit_height (wall AND room level) = drop from ceiling, not height-from-floor.
export function wallCabTop(wall: Wall | null | undefined, room: Room): number {
  const soffit = wall?.soffit_height ?? room.soffit_height
  if (soffit != null) {
    const wallH = wall?.height ?? room.room_dy ?? 2400
    return wallH - soffit
  }
  return room.wall_cabinet_top ?? 2100
}

// Height (mm from floor) of a cabinet's underside — the one rule every view
// (elevation, print, section, 3D, object tree, panels) uses. Wall units hang
// down from the wall-cabinet-top line (their pos_z is only a cache of this);
// floor units sit at pos_z (0 unless raised — a kick-detached member is lifted
// by the kick height).
export function cabBottomZ(cab: CabinetInstance, room: Room, wall?: Wall | null): number {
  if (cab.assembly_class === 'wall' || cab.assembly_class === 'wall_corner') {
    return wallCabTop(wall, room) - cab.dy
  }
  return cab.pos_z ?? 0
}

// Vertical extent [bottomZ, topZ] of a cabinet given its class + height. Base and
// tall units sit on the floor; wall units hang down from the wall-cabinet-top line.
export function cabVExtent(cls: string, dy: number, wall: Wall | null | undefined, room: Room): [number, number] {
  const bottom = (cls === 'wall' || cls === 'wall_corner') ? wallCabTop(wall, room) - dy : 0
  return [bottom, bottom + dy]
}

// Do two cabinets overlap vertically? `eps` keeps a flush top/bottom touch from
// counting as an overlap.
export function cabsBlock(
  mover: { assembly_class: string; dy: number },
  obstacle: { assembly_class: string; dy: number },
  wall: Wall | null | undefined,
  room: Room,
  eps = 1,
): boolean {
  const [aB, aT] = cabVExtent(mover.assembly_class, mover.dy, wall, room)
  const [bB, bT] = cabVExtent(obstacle.assembly_class, obstacle.dy, wall, room)
  return aB < bT - eps && bB < aT - eps
}

// ── Basic math ────────────────────────────────────────────────────────────────

export function toRad(d: number) { return d * Math.PI / 180 }
export function toDeg(r: number) { return r * 180 / Math.PI }
export function dist(a: Pt, b: Pt) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) }

// ── Wall helpers ──────────────────────────────────────────────────────────────

export function wallEnd(w: Wall): Pt {
  return { x: w.pos_x + w.length * Math.cos(toRad(w.angle)), y: w.pos_y + w.length * Math.sin(toRad(w.angle)) }
}

export function wallDir(w: Wall): Pt {
  return { x: Math.cos(toRad(w.angle)), y: Math.sin(toRad(w.angle)) }
}

// Returns [insideStart, insideEnd, outsideEnd, outsideStart].
// Outside direction is a fixed convention (left-perp of travel) used for previews.
// Actual rendered walls use wallMitrePolygon which applies wallInwardNormal.
export function wallCorners(w: Wall): Pt[] {
  const d = wallDir(w)
  const e = wallEnd(w)
  const ox = d.y * w.thickness, oy = -d.x * w.thickness
  return [
    { x: w.pos_x,      y: w.pos_y      },
    { x: e.x,          y: e.y          },
    { x: e.x + ox,     y: e.y + oy     },
    { x: w.pos_x + ox, y: w.pos_y + oy },
  ]
}

export function wallPolygon(w: Wall): string {
  return wallCorners(w).map(c => `${c.x},${c.y}`).join(' ')
}

/** Room reference for deciding each wall's inside face: the wall centroid, plus
 *  (from `centroid(walls)`) the inward normal of every wall that belongs to a
 *  joined chain, taken from the chain's winding. */
export interface RoomRef extends Pt {
  inward?: Map<string, Pt>
}

export function wallInwardNormal(w: Wall, ref: RoomRef): Pt {
  const d = wallDir(w)
  // Islands have no room side, so the face direction is fixed to the left-perp of
  // the draw direction rather than derived from the centroid — otherwise placement,
  // plan render and elevation can disagree depending on where the island was drawn.
  if (w.wall_type === 'island') return { x: -d.y, y: d.x }
  const chained = ref.inward?.get(w.id)
  if (chained) return chained
  // Lone wall (or a branching / straight run): face the room centroid.
  const mid = { x: w.pos_x + w.length * 0.5 * d.x, y: w.pos_y + w.length * 0.5 * d.y }
  const p1 = { x: -d.y, y: d.x }
  return (p1.x * (ref.x - mid.x) + p1.y * (ref.y - mid.y)) >= 0 ? p1 : { x: d.y, y: -d.x }
}

export function centroid(walls: Wall[]): RoomRef {
  if (!walls.length) return { x: 0, y: 0 }
  const pts = walls.flatMap(w => [{ x: w.pos_x, y: w.pos_y }, wallEnd(w)])
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    inward: chainInwardNormals(walls),
  }
}

/**
 * Inside face of every wall in a joined chain, from the chain's winding.
 *
 * Walls joined end-to-end (open run or closed room) all keep their thickness on
 * the same side of the chain, so corners mitre instead of flipping back to front.
 * The centroid test alone gets this wrong for spiral / strongly concave shapes,
 * where the room centre falls on the outside of some walls. The winding comes
 * from the signed area of the chain's points (an open run is closed by a chord
 * from its last point to its first). Walls drawn in either direction are fine:
 * each is traversed in chain order. Branching joints (3+ walls at a point) and
 * straight runs have no winding, so their walls fall back to the centroid test.
 */
function chainInwardNormals(walls: Wall[]): Map<string, Pt> {
  const JSNAP = 5
  const ws = walls.filter(w => w.wall_type !== 'island' && w.length > 0)
  const ends = ws.map(w => [{ x: w.pos_x, y: w.pos_y }, wallEnd(w)] as const)
  // nb[i][e] = walls joined at end e (0 = start, 1 = end) of wall i, with their joined end.
  const nb = ws.map((_, i) => [0, 1].map(e => {
    const out: { j: number; ej: number }[] = []
    ws.forEach((_, j) => {
      if (j === i) return
      for (const ej of [0, 1]) if (dist(ends[i][e], ends[j][ej]) < JSNAP) out.push({ j, ej })
    })
    return out
  }))

  const result = new Map<string, Pt>()
  const seen = new Set<number>()
  for (let i0 = 0; i0 < ws.length; i0++) {
    if (seen.has(i0)) continue
    // Collect the component; bail to the centroid test if any joint branches.
    const comp: number[] = []
    const stack = [i0]
    let branching = false
    seen.add(i0)
    while (stack.length) {
      const i = stack.pop()!
      comp.push(i)
      for (const e of [0, 1]) {
        if (nb[i][e].length > 1) branching = true
        for (const { j } of nb[i][e]) if (!seen.has(j)) { seen.add(j); stack.push(j) }
      }
    }
    if (branching || comp.length < 2) continue

    // Walk from a free end (open run) or from any wall (closed loop).
    const freeStart = comp.find(i => nb[i][0].length === 0 || nb[i][1].length === 0)
    let cur = freeStart ?? comp[0]
    let enterEnd = freeStart != null && nb[cur][0].length !== 0 ? 1 : 0
    const order: { i: number; forward: boolean }[] = []
    const pts: Pt[] = []
    while (order.length < comp.length) {
      const forward = enterEnd === 0
      order.push({ i: cur, forward })
      pts.push(ends[cur][enterEnd])
      const next = nb[cur][1 - enterEnd][0]
      if (!next || order.some(o => o.i === next.j)) { pts.push(ends[cur][1 - enterEnd]); break }
      cur = next.j; enterEnd = next.ej
    }
    if (order.length !== comp.length) continue

    let area2 = 0
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length]
      area2 += a.x * b.y - b.x * a.y
    }
    // Straight (or near-straight) run: no winding to go by.
    let perim = 0
    for (const { i } of order) perim += ws[i].length
    if (Math.abs(area2) < 1e-4 * perim * perim) continue

    // y-down plan space: positive area = clockwise on screen = room on the
    // left-perp (-d.y, d.x) of the travel direction.
    const sign = area2 > 0 ? 1 : -1
    for (const { i, forward } of order) {
      const d = wallDir(ws[i])
      const t = forward ? d : { x: -d.x, y: -d.y }
      result.set(ws[i].id, { x: -t.y * sign, y: t.x * sign })
    }
  }
  return result
}

// ── Intersection helpers ──────────────────────────────────────────────────────

export function lineIntersect(p1: Pt, d1: Pt, p2: Pt, d2: Pt): Pt | null {
  const denom = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(denom) < 1e-8) return null
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y }
}

export function ptToSeg(p: Pt, a: Pt, b: Pt): { dist: number; proj: Pt } {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-10) return { dist: dist(p, a), proj: a }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  const proj = { x: a.x + t * dx, y: a.y + t * dy }
  return { dist: dist(p, proj), proj }
}

// ── Mitre polygon ─────────────────────────────────────────────────────────────
// pos_x/pos_y is the inside face start; wall body extends in the -wallInwardNormal direction.
// Miter: when two walls share an inside corner, intersect their outside face lines.

// Returns the 4 drawn footprint corners [insideStart, insideEnd, outsideEnd,
// outsideStart], with the outside corners mitred where walls share a corner.
// Empty for islands (zero thickness, no footprint).
export function wallMitreCorners(w: Wall, walls: Wall[], ref: RoomRef): Pt[] {
  if (w.wall_type === 'island') return []
  const d = wallDir(w)
  const inward = wallInwardNormal(w, ref)
  const thick = w.thickness

  const s = { x: w.pos_x, y: w.pos_y }
  const e = wallEnd(w)
  const outX = -inward.x * thick, outY = -inward.y * thick

  let pSO = { x: s.x + outX, y: s.y + outY }
  let pEO = { x: e.x + outX, y: e.y + outY }

  const JSNAP = 5

  for (const o of walls) {
    if (o.id === w.id || o.wall_type === 'island') continue
    const od = wallDir(o)
    const oInward = wallInwardNormal(o, ref)
    const oThick = o.thickness
    const oS = { x: o.pos_x, y: o.pos_y }
    const oE = wallEnd(o)
    const oOX = -oInward.x * oThick, oOY = -oInward.y * oThick

    if (dist(s, oS) < JSNAP) pSO = lineIntersect(pSO, d, { x: oS.x + oOX, y: oS.y + oOY }, od) ?? pSO
    if (dist(s, oE) < JSNAP) pSO = lineIntersect(pSO, d, { x: oE.x + oOX, y: oE.y + oOY }, od) ?? pSO
    if (dist(e, oS) < JSNAP) pEO = lineIntersect(pEO, d, { x: oS.x + oOX, y: oS.y + oOY }, od) ?? pEO
    if (dist(e, oE) < JSNAP) pEO = lineIntersect(pEO, d, { x: oE.x + oOX, y: oE.y + oOY }, od) ?? pEO
  }

  return [s, e, pEO, pSO]
}

export function wallMitrePolygon(w: Wall, walls: Wall[], ref: RoomRef): string {
  return wallMitreCorners(w, walls, ref).map(p => `${p.x},${p.y}`).join(' ')
}

// Points on a wall's inside / outside face at distance t from its start.
function wallFaceLines(w: Wall, corners: Pt[]) {
  const [s, , , pSO] = corners
  const d = wallDir(w)
  const tSO = (pSO.x - s.x) * d.x + (pSO.y - s.y) * d.y
  return {
    ins: (t: number): Pt => ({ x: s.x + d.x * t, y: s.y + d.y * t }),
    out: (t: number): Pt => ({ x: pSO.x + d.x * (t - tSO), y: pSO.y + d.y * (t - tSO) }),
  }
}

/** The wall footprint across one span (the bit under / over an opening): [insideA, insideB, outsideB, outsideA]. */
export function wallSpanQuad(w: Wall, walls: Wall[], ref: RoomRef, span: WallSpan): Pt[] {
  const c = wallMitreCorners(w, walls, ref)
  if (c.length < 4) return []
  const { ins, out } = wallFaceLines(w, c)
  return [ins(span.t0), ins(span.t1), out(span.t1), out(span.t0)]
}

/** An opening's stretch along a wall (mm from the wall start), z_fixtures P5. */
export interface WallSpan { t0: number; t1: number }

/**
 * The wall footprint split around openings: one 4-point piece [insideA, insideB,
 * outsideB, outsideA] per solid stretch. Mitred ends stay on the first / last
 * piece. `spans` must be sorted and non-overlapping (openingSpans does that).
 * No spans → the whole mitred footprint as one piece.
 */
export function wallPieces(w: Wall, walls: Wall[], ref: RoomRef, spans: WallSpan[]): Pt[][] {
  const c = wallMitreCorners(w, walls, ref)
  if (c.length < 4 || !spans.length) return c.length ? [c] : []
  const [s, e, pEO, pSO] = c
  const { ins, out } = wallFaceLines(w, c)
  const pieces: Pt[][] = []
  let from: { i: Pt; o: Pt } = { i: s, o: pSO }
  for (const sp of spans) {
    if (sp.t0 > 0.5) pieces.push([from.i, ins(sp.t0), out(sp.t0), from.o])
    from = { i: ins(sp.t1), o: out(sp.t1) }
  }
  if (spans[spans.length - 1].t1 < w.length - 0.5) pieces.push([from.i, e, pEO, from.o])
  return pieces
}

// ── Snapping ──────────────────────────────────────────────────────────────────

// Snaps to inside face corners only (the two endpoints of each wall's inside face).
export function snapEndpoint(p: Pt, walls: Wall[], radiusMm: number): Pt {
  let best = p, bestD = radiusMm
  for (const w of walls) {
    if (w.wall_type === 'island') continue
    for (const c of [{ x: w.pos_x, y: w.pos_y }, wallEnd(w)]) {
      const d = dist(p, c); if (d < bestD) { bestD = d; best = c }
    }
  }
  return best
}

export function snapAngle(start: Pt, end: Pt, stepDeg: number): Pt {
  const dx = end.x - start.x, dy = end.y - start.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return end
  const step = toRad(stepDeg)
  const snapped = Math.round(Math.atan2(dy, dx) / step) * step
  return { x: start.x + len * Math.cos(snapped), y: start.y + len * Math.sin(snapped) }
}

// ── Cabinet helpers ───────────────────────────────────────────────────────────

export function nearestWall(p: Pt, walls: Wall[], cabDX: number, maxDistMm: number): { wall: Wall; pos_x: number; pos_y: number } | null {
  let best: { wall: Wall; pos_x: number; pos_y: number; d: number } | null = null
  for (const w of walls) {
    const d = wallDir(w)
    const t = Math.max(0, Math.min(w.length - cabDX, (p.x - w.pos_x) * d.x + (p.y - w.pos_y) * d.y))
    const nx = w.pos_x + t * d.x, ny = w.pos_y + t * d.y
    const dd = dist(p, { x: nx, y: ny })
    if (dd < maxDistMm && (!best || dd < best.d)) best = { wall: w, pos_x: nx, pos_y: ny, d: dd }
  }
  return best
}

/**
 * Placement helper: fit a NEW cabinet of width `defaultDx` into the free gap that
 * contains `point` (along-wall position of the cursor). If the gap is narrower than
 * defaultDx, the returned `dx` is shrunk to exactly fill the gap so the cabinet
 * butts against both neighbours instead of overlapping. Wider gap → full width,
 * positioned near the cursor. `occupied` must already be filtered to the blocking
 * cabinets (same wall side + vertical overlap). Falls back to full width + findFreeSlot
 * when the cursor is over a cabinet or the gap is too small to be useful.
 */
const MIN_FIT_WIDTH = 50  // mm — below this, don't bother shrinking
export function fitFreeSlot(
  point: number, defaultDx: number, wallLen: number, occupied: { t: number; dx: number }[],
): { t: number; dx: number } {
  const p = Math.max(0, Math.min(wallLen, point))
  // Cursor over an existing cabinet → no gap here; keep full width, let findFreeSlot place it.
  if (occupied.some(o => p > o.t + 0.5 && p < o.t + o.dx - 0.5)) {
    return { t: findFreeSlot(p - defaultDx / 2, defaultDx, wallLen, occupied), dx: defaultDx }
  }
  let gapStart = 0, gapEnd = wallLen
  for (const o of occupied) {
    const oEnd = o.t + o.dx
    if (oEnd <= p && oEnd > gapStart) gapStart = oEnd
    if (o.t >= p && o.t < gapEnd) gapEnd = o.t
  }
  const gapWidth = gapEnd - gapStart
  if (gapWidth < MIN_FIT_WIDTH) {
    return { t: findFreeSlot(p - defaultDx / 2, defaultDx, wallLen, occupied), dx: defaultDx }
  }
  if (gapWidth >= defaultDx) {
    const t = Math.max(gapStart, Math.min(gapEnd - defaultDx, p - defaultDx / 2))
    return { t, dx: defaultDx }
  }
  // Gap narrower than the default → shrink to fill it exactly.
  return { t: gapStart, dx: gapWidth }
}

// Overlap tolerance (mm). Butted slots are computed as `o.t - dx` / `o.t + o.dx`,
// and positions come from float wall projections — without slack, rounding noise
// makes a flush slot read as overlapping and the move falls back to its origin.
const SLOT_EPS = 0.5
function slotsOverlap(t: number, dx: number, o: { t: number; dx: number }): boolean {
  return t < o.t + o.dx - SLOT_EPS && t + dx > o.t + SLOT_EPS
}

export function findFreeSlot(desired: number, dx: number, wallLen: number, occupied: { t: number; dx: number }[]): number {
  const clamped = Math.max(0, Math.min(wallLen - dx, desired))
  const conflicts = occupied.filter(o => slotsOverlap(clamped, dx, o))
  if (!conflicts.length) return clamped
  const sorted = [...conflicts].sort((a, b) => a.t - b.t)
  const leftT  = sorted[0].t - dx
  const rightT = sorted[sorted.length - 1].t + sorted[sorted.length - 1].dx
  const leftOk  = leftT >= -SLOT_EPS            && !occupied.some(o => slotsOverlap(leftT, dx, o))
  const rightOk = rightT + dx <= wallLen + SLOT_EPS && !occupied.some(o => slotsOverlap(rightT, dx, o))
  if (!leftOk && !rightOk) return clamped
  if (!leftOk)  return rightT
  if (!rightOk) return leftT
  return Math.abs(leftT - desired) <= Math.abs(rightT - desired) ? leftT : rightT
}

/**
 * Like findFreeSlot, but for MOVING an existing cabinet along its own wall.
 * Resolves an overlap by snapping to the nearest gap *in the direction the
 * cabinet is being dragged* (relative to its original slot `originalT`), so it
 * never bounces back to the starting slot. If there is no room on the drag side
 * it stays put. `occupied` must exclude the cabinet itself. When `originalT` is
 * undefined (placement / move to a different wall) it falls back to findFreeSlot.
 */
export function slideToFreeSlot(
  desired: number, dx: number, wallLen: number,
  occupied: { t: number; dx: number }[], originalT?: number,
): number {
  const clamped = Math.max(0, Math.min(wallLen - dx, desired))
  const overlaps = (t: number) => occupied.some(o => slotsOverlap(t, dx, o))
  // No overlap → drop exactly where the cursor put it (free movement within gaps).
  if (!overlaps(clamped)) return clamped
  if (originalT === undefined) return findFreeSlot(desired, dx, wallLen, occupied)

  const draggingLeft = desired < originalT
  // Candidate landings: hard against each neighbour's near edge, plus the wall ends.
  const cands = [0, wallLen - dx]
  for (const o of occupied) { cands.push(o.t - dx); cands.push(o.t + o.dx) }
  // Keep only valid slots on the drag side (never the original side → no bounce-back).
  const valid = cands.filter(t =>
    t >= -SLOT_EPS && t <= wallLen - dx + SLOT_EPS && !overlaps(t) &&
    (draggingLeft ? t < originalT : t > originalT),
  )
  if (!valid.length) return originalT
  // Snap to the gap closest to where the cursor wants it.
  valid.sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired))
  return valid[0]
}

export function cabT(cab: CabinetInstance, wall: Wall): number {
  const d = wallDir(wall)
  return (cab.pos_x - wall.pos_x) * d.x + (cab.pos_y - wall.pos_y) * d.y
}

export function cabWallPerp(cab: CabinetInstance, wall: Wall, inwardPerp: Pt): Pt {
  const diff = ((cab.rotation - wall.angle) % 360 + 360) % 360
  return diff > 90 && diff < 270 ? { x: -inwardPerp.x, y: -inwardPerp.y } : inwardPerp
}

export function cabWallSide(cab: CabinetInstance, wall: Wall): 'face' | 'back' {
  const diff = ((cab.rotation - wall.angle) % 360 + 360) % 360
  return diff > 90 && diff < 270 ? 'back' : 'face'
}

/** @deprecated use cabWallPerp */
export const islandCabPerp = cabWallPerp

// Landing point (back-left corner) for a cabinet anchored at along-wall distance `t`.
// Face-side cabinets sit on the wall's inside face. Back-side cabinets are pushed out
// by the wall thickness so their back is flush with the wall's OUTER face rather than
// overlapping the wall body. Islands (thickness 0) get no offset. ref = centroid(walls),
// the same reference wallInwardNormal uses everywhere else.
export function wallAnchorPoint(wall: Wall, t: number, back: boolean, ref: RoomRef): Pt {
  const d = wallDir(wall)
  const px = wall.pos_x + t * d.x
  const py = wall.pos_y + t * d.y
  if (!back || wall.thickness <= 0) return { x: px, y: py }
  const inward = wallInwardNormal(wall, ref)
  return { x: px - inward.x * wall.thickness, y: py - inward.y * wall.thickness }
}

// pos_x/pos_y is the cabinet's back-left corner: the wall's inside face for face-side
// cabinets, or the outer face (shifted out by wall thickness) for back-side cabinets.
// See wallAnchorPoint. The footprint extrudes dz along perp from there.
export function cabinetPolygon(cab: CabinetInstance, wall: Wall, perp: Pt): string {
  return cabinetCornerPts(cab, wall, perp).map(p => `${p.x},${p.y}`).join(' ')
}

// The cabinet's own frame in plan: `o` = local origin (back-left corner as seen
// facing the cabinet's front), `x` = local +X (left → right facing the front).
// Local +Z is always `perp`. When (wallDir, perp) is left-handed — back-side
// cabinets, and any front whose inward normal falls that way — the cabinet is
// TURNED, not mirrored: +X runs back along the wall from the span's far end.
// Matches Room3DScene's needTurn and the elevation, so shaped footprints,
// hinge sides and asymmetric parts agree across plan / 3D / elevation.
// pos_x/pos_y stays the wall-start end of the span (wall-space anchor).
export function cabinetPlanFrame(cab: CabinetInstance, wall: Wall, perp: Pt): { o: Pt; x: Pt } {
  const d = wallDir(wall)
  const turned = d.x * perp.y - d.y * perp.x < 0
  return turned
    ? { o: { x: cab.pos_x + cab.dx * d.x, y: cab.pos_y + cab.dx * d.y }, x: { x: -d.x, y: -d.y } }
    : { o: { x: cab.pos_x, y: cab.pos_y }, x: d }
}

// Cabinet-frame point (x along the width, z into the room from the back) →
// plan coordinates. The same mapping the resolved part outlines use.
export function cabinetToPlan(cab: CabinetInstance, wall: Wall, perp: Pt): (lx: number, lz: number) => Pt {
  const { o, x } = cabinetPlanFrame(cab, wall, perp)
  return (lx, lz) => ({ x: o.x + lx * x.x + lz * perp.x, y: o.y + lx * x.y + lz * perp.y })
}

// The plan-view outline points of a cabinet's footprint (same order as
// cabinetPolygon): the four box corners, or the shaped footprint
// (z_cabinet_shape/) evaluated at the cabinet's current size. Used for
// marquee hit-testing (cabinet fully inside the box).
export function cabinetCornerPts(cab: CabinetInstance, wall: Wall, perp: Pt): Pt[] {
  const toPlan = cabinetToPlan(cab, wall, perp)
  if (cab.footprint?.segments?.length) {
    const outline = footprintOutline(cab.footprint, { w: cab.dx, d: cab.dz })
    if (outline.length >= 3) return outline.map(p => toPlan(p.x, p.y))
  }
  return [toPlan(0, 0), toPlan(cab.dx, 0), toPlan(cab.dx, cab.dz), toPlan(0, cab.dz)]
}

// The stretch of the wall a cabinet stands on, as offsets from cabT(cab, wall):
// [0, dx] for a box. A shaped cabinet's is the part of its outline on the wall
// face (local y = 0) — an angled corner filler's other leg stands past the
// wall's end (z_angled_filler), so moves clamp on this, not on dx.
export function cabWallSpan(cab: CabinetInstance, wall: Wall, perp: Pt): { lo: number; hi: number } {
  if (!cab.footprint?.segments?.length) return { lo: 0, hi: cab.dx }
  const xs = footprintOutline(cab.footprint, { w: cab.dx, d: cab.dz }).filter(p => Math.abs(p.y) < 0.5).map(p => p.x)
  if (xs.length < 2) return { lo: 0, hi: cab.dx }
  const lo = Math.max(0, Math.min(...xs)), hi = Math.min(cab.dx, Math.max(...xs))
  const d = wallDir(wall)
  return d.x * perp.y - d.y * perp.x < 0 ? { lo: cab.dx - hi, hi: cab.dx - lo } : { lo, hi }
}

export function cabinetCenterPt(cab: CabinetInstance, wall: Wall, perp: Pt): Pt {
  const d = wallDir(wall)
  return {
    x: cab.pos_x + (cab.dx / 2) * d.x + (cab.dz / 2) * perp.x,
    y: cab.pos_y + (cab.dx / 2) * d.y + (cab.dz / 2) * perp.y,
  }
}

export function nextLabel(cabinets: CabinetInstance[], cls: string): string {
  const prefix = cls === 'base' ? 'BC' : cls === 'wall' ? 'WC' : cls === 'tall' ? 'TC'
    : cls === 'base_corner' ? 'BCC' : cls === 'wall_corner' ? 'WCC' : cls === 'tall_corner' ? 'TCC'
    : cls === 'filler' ? 'FL' : 'EP'
  const nums = cabinets.filter(c => c.label?.startsWith(prefix + '-')).map(c => parseInt(c.label!.slice(3)) || 0)
  return `${prefix}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, '0')}`
}

/** Fixed plan-grid spacings (mm) offered alongside 'Auto'. */
export const GRID_STEPS = [25, 50, 100, 200, 500, 1000] as const

/** Most dots we'll put in the DOM; past this the grid draws nothing. */
const MAX_GRID_DOTS = 3000

/**
 * Plan-view reference dots covering the visible area.
 * `fixedStep` in mm pins the spacing; 0 (the default) picks it from the zoom.
 */
export function gridDots(
  panX: number, panY: number, zoom: number, svgW: number, svgH: number, fixedStep = 0,
): Pt[] {
  if (!fixedStep && zoom < 0.04) return []
  const step = fixedStep || (zoom < 0.08 ? 500 : zoom < 0.15 ? 200 : zoom < 0.4 ? 100 : 50)
  const wL = Math.floor((-panX / zoom) / step) * step
  const wT = Math.floor((-panY / zoom) / step) * step
  const wR = (-panX + svgW) / zoom, wB = (-panY + svgH) / zoom
  const dots: Pt[] = []
  for (let x = wL; x <= wR + step; x += step)
    for (let y = wT; y <= wB + step; y += step)
      dots.push({ x, y })
  return dots.length <= MAX_GRID_DOTS ? dots : []
}
