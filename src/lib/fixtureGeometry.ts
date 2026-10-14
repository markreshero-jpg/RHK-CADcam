// ── Fixture plan geometry (z_fixtures/FIXTURES-SPEC.md) ───────────────────────
// A placed fixture stores x/y = back-left corner (plan mm) and rotation (deg).
//   a = (cos r, sin r)   width direction (left → right, looking at the front)
//   n = (−sin r, cos r)  front direction (out of the back, toward the room)
// In 3D: group at (x, z, y), rotation Y = −r, local +X = a, +Z = n.

import type { Wall, FixtureMount, RoomFixture } from './types'
import { wallFrame, alongOf, offOf, type WallSide, type WallFrame } from './benchtopAnchor'
import type { Pt } from './geometry'

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
}
export const fixtureLayer = (category: string) => FIXTURE_LAYER[category] ?? 'fixture_appliances'
