// Splashback geometry (z_splashback S2).
//
// A splashback's outline is Shape Editor segments in its wall ELEVATION frame:
//   x = elevation x as seen on that side (face: along the wall from its start;
//       back: mirrored, from the far end) — the same x ElevationSVG draws with,
//   y = height above the floor (UP).
// elevationFrame(wall, side) maps x to plan: p = o + d·x; n points off the face
// toward the viewer, so the panel's back sits at offset_mm and its front at
// offset_mm + thickness.

import type { BenchtopSegment, RoomFixture, Wall } from './types'
import type { Pt } from './geometry'
import { elevationFrame, openingOnWall } from './fixtureGeometry'
import { mapSegments, outlinePath, outlinePoints } from './benchtopGeometry'
import type { WallSide } from './benchtopAnchor'

export interface SbRect { x0: number; x1: number; z0: number; z1: number }

/** Smallest splashback edge (mm). */
export const MIN_SB = 20

/** Rectangle outline, anticlockwise in the y-up frame: bottom, right, top, left. */
export function rectSegments(r: SbRect): BenchtopSegment[] {
  const a = { x: r.x0, y: r.z0 }, b = { x: r.x1, y: r.z0 }, c = { x: r.x1, y: r.z1 }, d = { x: r.x0, y: r.z1 }
  return [
    { type: 'line', p0: a, p1: b },
    { type: 'line', p0: b, p1: c },
    { type: 'line', p0: c, p1: d },
    { type: 'line', p0: d, p1: a },
  ]
}

export function sbBounds(segs: BenchtopSegment[]): SbRect | null {
  const pts = outlinePoints(segs)
  if (!pts.length) return null
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...ys), z1: Math.max(...ys) }
}

/** True when the outline is a plain axis-aligned rectangle (edge handles apply). */
export function isRect(segs: BenchtopSegment[]): boolean {
  if (segs.length !== 4 || segs.some(s => s.type !== 'line')) return false
  return segs.every(s => Math.abs(s.p0.x - s.p1.x) < 0.01 || Math.abs(s.p0.y - s.p1.y) < 0.01)
}

export type SbEdge = 'left' | 'right' | 'bottom' | 'top'

/**
 * Move one side of the outline to `value` (x for left / right, height for
 * bottom / top). Every point sitting on that side moves with it, so a shaped
 * outline keeps its shape and only its extreme edge travels. Clamped so the
 * outline never gets thinner than MIN_SB.
 */
export function stretchEdge(segs: BenchtopSegment[], edge: SbEdge, value: number): BenchtopSegment[] {
  const b = sbBounds(segs)
  if (!b) return segs
  const tol = 0.5
  let v = value
  if (edge === 'left')   v = Math.min(v, b.x1 - MIN_SB)
  if (edge === 'right')  v = Math.max(v, b.x0 + MIN_SB)
  if (edge === 'bottom') v = Math.min(v, b.z1 - MIN_SB)
  if (edge === 'top')    v = Math.max(v, b.z0 + MIN_SB)
  const fn = (p: Pt): Pt => {
    if (edge === 'left'   && Math.abs(p.x - b.x0) < tol) return { x: v, y: p.y }
    if (edge === 'right'  && Math.abs(p.x - b.x1) < tol) return { x: v, y: p.y }
    if (edge === 'bottom' && Math.abs(p.y - b.z0) < tol) return { x: p.x, y: v }
    if (edge === 'top'    && Math.abs(p.y - b.z1) < tol) return { x: p.x, y: v }
    return p
  }
  return mapSegments(segs, fn)
}

/** Shift the whole outline by dx along the wall and dz up. */
export const moveSegments = (segs: BenchtopSegment[], dx: number, dz: number) =>
  mapSegments(segs, p => ({ x: p.x + dx, y: p.y + dz }))

// ── Default size (L3) ────────────────────────────────────────────────────────

/** Something above the bench a splashback stops under: overheads, rangehood, bulkhead. */
export interface SbObstacle { x0: number; x1: number; zBot: number }

/**
 * Default rectangle over a bench: from the bench top up to the lowest thing
 * above it that overlaps the span (overheads' underside, rangehood, bulkhead),
 * else the ceiling / wall top (decision L3). Obstacles lower than 150 above the
 * bench (e.g. an appliance sitting on it) are ignored.
 */
export function defaultSplashbackRect(args: {
  x0: number; x1: number; benchTopZ: number; ceilingZ: number; obstacles: SbObstacle[]
}): SbRect {
  const { x0, x1, benchTopZ, ceilingZ } = args
  let top = ceilingZ
  for (const o of args.obstacles) {
    const overlap = Math.min(x1, o.x1) - Math.max(x0, o.x0)
    if (overlap > 1 && o.zBot > benchTopZ + 150 && o.zBot < top) top = o.zBot
  }
  return { x0, x1, z0: benchTopZ, z1: Math.max(top, benchTopZ + MIN_SB) }
}

// ── Openings (L2: stop at the window) ────────────────────────────────────────

/**
 * Wall openings (windows / doors) that cut the splashback, each grown by the
 * reveal and clipped to the splashback's bounds — drawn as holes. An opening
 * that covers the whole height splits the panel visually; S3 will turn these
 * into real cut-outs for the quote.
 */
export function openingHoles(b: SbRect, openings: SbRect[], reveal = 0): SbRect[] {
  const out: SbRect[] = []
  for (const o of openings) {
    const r = { x0: Math.max(b.x0, o.x0 - reveal), x1: Math.min(b.x1, o.x1 + reveal), z0: Math.max(b.z0, o.z0 - reveal), z1: Math.min(b.z1, o.z1 + reveal) }
    if (r.x1 - r.x0 > 1 && r.z1 - r.z0 > 1) out.push(r)
  }
  return out
}

/** Wall openings on one wall side as elevation rects (x as seen, z = sill → head). */
export function sbOpenings(fixtures: RoomFixture[], wall: Wall, side: WallSide, roomRef: Pt): SbRect[] {
  return fixtures.flatMap(f => {
    const o = openingOnWall(f, wall, side, roomRef)
    if (!o) return []
    const z0 = Number(f.z) || 0
    return [{ x0: o.t0, x1: o.t1, z0, z1: z0 + Number(f.height) }]
  })
}

const rectRing = (r: SbRect): Pt[] => [{ x: r.x0, y: r.z0 }, { x: r.x1, y: r.z0 }, { x: r.x1, y: r.z1 }, { x: r.x0, y: r.z1 }]

/** SVG path in elevation svg coords (y = roomH − height), holes included (evenodd). */
export function sbElevPath(segs: BenchtopSegment[], holes: SbRect[], roomH: number): string {
  const flip = (p: Pt) => ({ x: p.x, y: roomH - p.y })
  return outlinePath(mapSegments(segs, flip, true), holes.map(h => rectRing(h).map(flip)))
}

// ── Plan + 3D placement ──────────────────────────────────────────────────────

/** The splashback's frame on its wall side: x → plan via o + d·x, n = off the face. */
export const sbFrame = (wall: Wall, side: WallSide, roomRef: Pt) => elevationFrame(wall, side, roomRef)

/** Plan footprint: the band from x0 to x1, offset_mm off the face, thickness deep. */
export function sbPlanQuad(b: Pick<SbRect, 'x0' | 'x1'>, wall: Wall, side: WallSide, roomRef: Pt, offset: number, thick: number): Pt[] {
  const f = sbFrame(wall, side, roomRef)
  const at = (x: number, off: number) => ({ x: f.o.x + f.d.x * x + f.n.x * off, y: f.o.y + f.d.y * x + f.n.y * off })
  return [at(b.x0, offset), at(b.x1, offset), at(b.x1, offset + thick), at(b.x0, offset + thick)]
}

/** Shape Editor works y-down: flip in (and back out with the same call). */
export const flipForEditor = (segs: BenchtopSegment[]) => mapSegments(segs, p => ({ x: p.x, y: -p.y }), true)
