// ── Fixture plan geometry (z_fixtures/FIXTURES-SPEC.md) ───────────────────────
// A placed fixture stores x/y = back-left corner (plan mm) and rotation (deg).
//   a = (cos r, sin r)   width direction (left → right, looking at the front)
//   n = (−sin r, cos r)  front direction (out of the back, toward the room)
// In 3D: group at (x, z, y), rotation Y = −r, local +X = a, +Z = n.

import type { Wall, FixtureMount, RoomFixture, BenchtopInstance } from './types'
import { btSegments, outlinePoints } from './benchtopGeometry'
import { wallFrame, alongOf, offOf, type WallSide, type WallFrame } from './benchtopAnchor'
import type { Pt, WallSpan } from './geometry'

const DEG = Math.PI / 180

export type FixtureFootprint = Pick<RoomFixture, 'x' | 'y' | 'rotation' | 'width' | 'depth'>

export function fixtureAxes(rotation: number): { a: Pt; n: Pt } {
  const r = rotation * DEG
  return { a: { x: Math.cos(r), y: Math.sin(r) }, n: { x: -Math.sin(r), y: Math.cos(r) } }
}

/** [back-left, back-right, front-right, front-left] in plan. */
export function fixtureCorners(f: FixtureFootprint): [Pt, Pt, Pt, Pt] {
  const { a, n } = fixtureAxes(f.rotation)
  const bl = { x: f.x, y: f.y }
  const br = { x: bl.x + a.x * f.width, y: bl.y + a.y * f.width }
  const fr = { x: br.x + n.x * f.depth, y: br.y + n.y * f.depth }
  const fl = { x: bl.x + n.x * f.depth, y: bl.y + n.y * f.depth }
  return [bl, br, fr, fl]
}

export function fixtureCenter(f: FixtureFootprint): Pt {
  const { a, n } = fixtureAxes(f.rotation)
  return {
    x: f.x + a.x * f.width / 2 + n.x * f.depth / 2,
    y: f.y + a.y * f.width / 2 + n.y * f.depth / 2,
  }
}

/** Back-left corner that puts the footprint's centre at `c`. */
export function backLeftForCenter(c: Pt, rotation: number, width: number, depth: number): Pt {
  const { a, n } = fixtureAxes(rotation)
  return {
    x: c.x - a.x * width / 2 - n.x * depth / 2,
    y: c.y - a.y * width / 2 - n.y * depth / 2,
  }
}

/** Rotation (deg) whose front direction is `n`. */
export function rotationForFront(n: Pt): number {
  // a = (n.y, −n.x)
  const r = Math.atan2(-n.x, n.y) / DEG
  return ((Math.round(r * 1000) / 1000) % 360 + 360) % 360
}

export interface FixtureSnap {
  x: number; y: number; rotation: number
  wall_id: string | null
  /** Openings (P5): depth taken from the wall's thickness. */
  depth?: number
}

/**
 * Where a fixture lands for a cursor position: back against the nearest wall
 * face within `maxDist` (cursor's side of the wall; islands both sides), centred
 * on the cursor along the wall and kept within the wall's length. No wall in
 * range → free, centred on the cursor with `freeRotation`.
 */
export function snapFixture(
  cursor: Pt, width: number, depth: number,
  walls: Wall[], roomRef: Pt, maxDist: number, freeRotation = 0,
): FixtureSnap {
  let best: { f: WallFrame; wall: Wall; off: number } | null = null
  for (const wall of walls) {
    const face = wallFrame(wall, 'face', roomRef)
    const side: WallSide = offOf(face, cursor) >= 0 ? 'face' : 'back'
    const f = side === 'face' ? face : wallFrame(wall, 'back', roomRef)
    const t = alongOf(f, cursor)
    if (t < -width / 2 || t > f.len + width / 2) continue
    const off = offOf(f, cursor)
    if (off < 0 || off > maxDist) continue
    if (!best || off < best.off) best = { f, wall, off }
  }
  if (!best) {
    const bl = backLeftForCenter(cursor, freeRotation, width, depth)
    return { x: bl.x, y: bl.y, rotation: freeRotation, wall_id: null }
  }
  const { f, wall } = best
  const rotation = rotationForFront(f.n)
  const { a } = fixtureAxes(rotation)
  // Centre along the wall, clamped so the item stays on the wall when it fits.
  let t = alongOf(f, cursor)
  if (width <= f.len) t = Math.max(width / 2, Math.min(f.len - width / 2, t))
  const cx = f.o.x + f.d.x * t, cy = f.o.y + f.d.y * t
  return { x: cx - a.x * width / 2, y: cy - a.y * width / 2, rotation, wall_id: wall.id }
}

/**
 * Where an opening (door / window, P5) lands: IN the nearest real wall — back on
 * the outer face, front on the inside face (depth = wall thickness), centred on
 * the cursor along the wall and kept within it. The cursor may be in the wall
 * body or up to `maxDist` either side. Islands / zero-thickness walls are
 * skipped. Null = no wall in reach (openings never float free).
 */
export function snapOpening(cursor: Pt, width: number, walls: Wall[], roomRef: Pt, maxDist: number): FixtureSnap | null {
  let best: { wall: Wall; face: WallFrame; dist: number } | null = null
  for (const wall of walls) {
    const thk = Number(wall.thickness) || 0
    if (wall.wall_type === 'island' || thk <= 0) continue
    const face = wallFrame(wall, 'face', roomRef)
    const t = alongOf(face, cursor)
    if (t < -width / 2 || t > face.len + width / 2) continue
    const off = offOf(face, cursor)   // + into the room, −thk = outer face
    const dist = off > 0 ? off : off < -thk ? -thk - off : 0
    if (dist > maxDist) continue
    if (!best || dist < best.dist) best = { wall, face, dist }
  }
  if (!best) return null
  const { wall, face } = best
  const back = wallFrame(wall, 'back', roomRef)
  const rotation = rotationForFront(face.n)
  const { a } = fixtureAxes(rotation)
  let t = alongOf(face, cursor)
  if (width <= face.len) t = Math.max(width / 2, Math.min(face.len - width / 2, t))
  const cx = back.o.x + back.d.x * t, cy = back.o.y + back.d.y * t
  return { x: cx - a.x * width / 2, y: cy - a.y * width / 2, rotation, wall_id: wall.id, depth: Number(wall.thickness) }
}

/**
 * Each wall's openings as spans along it (mm from its start, on the inside
 * face), sorted, clamped to the wall and merged where they overlap.
 */
export function openingSpans(
  fixtures: Pick<RoomFixture, 'category' | 'wall_id' | 'x' | 'y' | 'rotation' | 'width' | 'depth'>[],
  walls: Wall[], roomRef: Pt,
): Map<string, WallSpan[]> {
  const out = new Map<string, WallSpan[]>()
  for (const f of fixtures) {
    if (f.category !== 'opening' || !f.wall_id) continue
    const wall = walls.find(w => w.id === f.wall_id)
    if (!wall) continue
    const face = wallFrame(wall, 'face', roomRef)
    const ts = fixtureCorners(f).map(p => alongOf(face, p))
    const t0 = Math.max(0, Math.min(...ts)), t1 = Math.min(wall.length, Math.max(...ts))
    if (t1 - t0 < 1) continue
    out.set(wall.id, [...(out.get(wall.id) ?? []), { t0, t1 }])
  }
  for (const [id, spans] of out) {
    spans.sort((p, q) => p.t0 - q.t0)
    const merged: WallSpan[] = []
    for (const s of spans) {
      const last = merged[merged.length - 1]
      if (last && s.t0 <= last.t1) last.t1 = Math.max(last.t1, s.t1)
      else merged.push({ ...s })
    }
    out.set(id, merged)
  }
  return out
}

/**
 * Openings re-seated in their wall after the wall changed (moved, turned,
 * thickness / length edits): same spot along it, depth = thickness. Only the
 * ones that moved are returned.
 */
export function refitOpenings(fixtures: RoomFixture[], walls: Wall[], roomRef: Pt): { id: string; patch: Pick<RoomFixture, 'x' | 'y' | 'rotation' | 'depth'> }[] {
  const out: { id: string; patch: Pick<RoomFixture, 'x' | 'y' | 'rotation' | 'depth'> }[] = []
  for (const f of fixtures) {
    if (f.category !== 'opening' || !f.wall_id) continue
    const wall = walls.find(w => w.id === f.wall_id)
    if (!wall) continue
    const s = snapOpening(fixtureCenter(f), f.width, [wall], roomRef, Infinity)
    if (!s || s.depth == null) continue
    const patch = { x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, rotation: Math.round(s.rotation * 1000) / 1000, depth: s.depth }
    const turn = (((patch.rotation - f.rotation) % 360) + 360) % 360
    if (Math.abs(patch.x - f.x) > 0.05 || Math.abs(patch.y - f.y) > 0.05 || Math.min(turn, 360 - turn) > 0.001 || Math.abs(patch.depth - f.depth) > 0.05) {
      out.push({ id: f.id, patch })
    }
  }
  return out
}

/**
 * An opening's place on one face of its own wall, in that elevation's x (face
 * side: along the wall; back side: mirrored), plus the hinge jamb's x. Null if
 * it isn't an opening in this wall. Openings show on BOTH faces.
 */
export function openingOnWall(
  fx: Pick<RoomFixture, 'category' | 'wall_id' | 'x' | 'y' | 'rotation' | 'width' | 'depth' | 'hinge_side'>,
  wall: Wall, side: WallSide, roomRef: Pt,
): { t0: number; t1: number; hingeT: number } | null {
  if (fx.category !== 'opening' || fx.wall_id !== wall.id) return null
  const f0 = wallFrame(wall, side, roomRef)
  const f = side === 'back'
    ? { ...f0, o: { x: f0.o.x + f0.d.x * f0.len, y: f0.o.y + f0.d.y * f0.len }, d: { x: -f0.d.x, y: -f0.d.y } }
    : f0
  const ts = fixtureCorners(fx).map(p => alongOf(f, p))
  const { a } = fixtureAxes(fx.rotation)
  const hw = fx.hinge_side === 'right' ? fx.width : 0
  const hingeT = alongOf(f, { x: fx.x + a.x * hw, y: fx.y + a.y * hw })
  return { t0: Math.min(...ts), t1: Math.max(...ts), hingeT }
}

/** Default underside height for a mount type. */
export const FIXTURE_BENCH_Z = 900
export function defaultFixtureZ(mount: FixtureMount, mountHeight: number | null): number {
  if (mount === 'benchtop') return FIXTURE_BENCH_Z
  if (mount === 'wall') return mountHeight ?? 1500
  return 0
}

/**
 * Elevation placement of a fixture on one wall face, or null when it doesn't show
 * there. Shows when it faces the viewer (front within ~45° of the face normal)
 * and its back is within `reach` of the face, overlapping the wall's length.
 * `t0`/`t1` are along the frame `f` (callers pass the mirrored frame for backs).
 */
export function fixtureOnFace(fx: FixtureFootprint, f: WallFrame, reach = 1200): { t0: number; t1: number } | null {
  const { n } = fixtureAxes(fx.rotation)
  if (n.x * f.n.x + n.y * f.n.y < 0.7) return null
  const pts = fixtureCorners(fx)
  const offs = pts.map(p => offOf(f, p))
  if (Math.min(...offs) < -50 || Math.min(...offs) > reach) return null
  const ts = pts.map(p => alongOf(f, p))
  const t0 = Math.min(...ts), t1 = Math.max(...ts)
  if (t1 <= 0 || t0 >= f.len) return null
  return { t0, t1 }
}

/** Display-layer item for each catalogue category (registry.ts, group 'fixtures'). */
export const FIXTURE_LAYER: Record<string, string> = {
  appliance:  'fixture_appliances',
  sink:       'fixture_sinks',
  tap:        'fixture_taps',
  decorative: 'fixture_decorative',
  opening:    'fixture_openings',
}
export const fixtureLayer = (category: string) => FIXTURE_LAYER[category] ?? 'fixture_appliances'

// ── Benchtop cutouts (P3) ─────────────────────────────────────────────────────
// A fixture with a cutout template cuts a hole in the benchtop holding the
// cutout's centre. Derived live (never written into benchtop.cutout_polygons),
// so the hole follows the fixture: plan + 3D + resolver all merge it in through
// withFixtureCutouts.

export type FixtureCutoutSpec = FixtureFootprint & Pick<RoomFixture,
  'cutout_shape' | 'cutout_w' | 'cutout_d' | 'cutout_radius' | 'cutout_off_x' | 'cutout_off_y'>

export function fixtureCutoutCenter(f: FixtureCutoutSpec): Pt {
  const c = fixtureCenter(f)
  const { a, n } = fixtureAxes(f.rotation)
  const u = f.cutout_off_x ?? 0, v = f.cutout_off_y ?? 0
  return { x: c.x + a.x * u + n.x * v, y: c.y + a.y * u + n.y * v }
}

const ROUND_STEPS = 32, CORNER_STEPS = 4

/** The cutout outline in plan (mm), or null when the fixture has no cutout. */
export function fixtureCutoutPolygon(f: FixtureCutoutSpec): Pt[] | null {
  const w = Number(f.cutout_w) || 0, d = Number(f.cutout_d) || 0
  if (!f.cutout_shape || w <= 0) return null
  const c = fixtureCutoutCenter(f)
  const { a, n } = fixtureAxes(f.rotation)
  const at = (u: number, v: number): Pt => ({ x: c.x + a.x * u + n.x * v, y: c.y + a.y * u + n.y * v })
  if (f.cutout_shape === 'round') {
    const r = w / 2
    return Array.from({ length: ROUND_STEPS }, (_, i) => {
      const t = (i / ROUND_STEPS) * Math.PI * 2
      return at(r * Math.cos(t), r * Math.sin(t))
    })
  }
  if (d <= 0) return null
  const hw = w / 2, hd = d / 2
  const r = Math.max(0, Math.min(Number(f.cutout_radius) || 0, hw, hd))
  if (r < 0.5) return [at(-hw, -hd), at(hw, -hd), at(hw, hd), at(-hw, hd)]
  // Rounded corners: arc centres inset by r, swept a quarter turn each.
  const corners: [number, number, number][] = [[hw - r, -hd + r, -90], [hw - r, hd - r, 0], [-hw + r, hd - r, 90], [-hw + r, -hd + r, 180]]
  const pts: Pt[] = []
  for (const [cu, cv, start] of corners) {
    for (let i = 0; i <= CORNER_STEPS; i++) {
      const t = (start + (90 * i) / CORNER_STEPS) * DEG
      pts.push(at(cu + r * Math.cos(t), cv + r * Math.sin(t)))
    }
  }
  return pts
}

export function pointInPolygon(pts: Pt[], p: Pt): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

type BtOutline = Pick<BenchtopInstance, 'segments' | 'polygon' | 'arc_segments' | 'edge_tags'>

/** Does the benchtop outline contain the plan point? */
export function benchtopContains(bt: BtOutline, p: Pt): boolean {
  const pts = outlinePoints(btSegments(bt), 16)
  return pts.length >= 3 && pointInPolygon(pts, p)
}

/** Cutout polygons the fixtures make in this benchtop (cutout centre inside its outline). */
export function benchtopFixtureCutouts(bt: BtOutline, fixtures: FixtureCutoutSpec[]): Pt[][] {
  const out: Pt[][] = []
  for (const f of fixtures) {
    const poly = fixtureCutoutPolygon(f)
    if (poly && benchtopContains(bt, fixtureCutoutCenter(f))) out.push(poly)
  }
  return out
}

/** The benchtop with its fixtures' cutouts appended — for drawing / resolving only, never saved. */
export function withFixtureCutouts<T extends BtOutline & Pick<BenchtopInstance, 'cutout_polygons'>>(bt: T, fixtures: FixtureCutoutSpec[]): T {
  const extra = benchtopFixtureCutouts(bt, fixtures)
  if (!extra.length) return bt
  return { ...bt, cutout_polygons: [...(bt.cutout_polygons ?? []), ...extra] }
}

/** The benchtop under a plan point (first match), for benchtop-mount heights. */
export function benchtopAt<T extends BtOutline>(benchtops: T[], p: Pt): T | null {
  return benchtops.find(b => benchtopContains(b, p)) ?? null
}
