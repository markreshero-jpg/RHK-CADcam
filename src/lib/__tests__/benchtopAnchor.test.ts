import { describe, it, expect } from 'vitest'
import {
  wallFrame, wallContacts, autoAnchor, btShowsOn, btPosition, positionFn, reanchorFn, btTouches, stretchFn, btOverhangs,
} from '../benchtopAnchor'
import { segmentsFromLegacy, mapSegments, outlineBounds, outlinePoints, signedArea } from '../benchtopGeometry'
import { centroid } from '../geometry'
import type { Wall } from '../types'

// 3000 × 3000 room, walls drawn clockwise on screen; W1 = top wall, face y = 0.
const wall = (id: string, x: number, y: number, angle: number, length: number, extra: Partial<Wall> = {}): Wall => ({
  id, room_id: 'r', name: id, sort_order: 0, length, height: null, soffit_height: null,
  angle, pos_x: x, pos_y: y, thickness: 90, wall_type: 'standard', created_at: '', ...extra,
})
const ROOM = [wall('W1', 0, 0, 0, 3000), wall('W2', 3000, 0, 90, 3000), wall('W3', 3000, 3000, 180, 3000), wall('W4', 0, 3000, 270, 3000)]
const ISLAND = wall('I', 1000, 1500, 0, 1200, { thickness: 0, wall_type: 'island' })
const CX = centroid(ROOM)
const poly = (pts: [number, number][]) => segmentsFromLegacy(pts.map(([x, y]) => ({ x, y })))

const STRAIGHT = poly([[500, 0], [2000, 0], [2000, 600], [500, 600]])
const L_TOP = poly([[1000, 0], [3000, 0], [3000, 1500], [2400, 1500], [2400, 600], [1000, 600]])

describe('wall frames', () => {
  it('face normal points into the room, back face sits a thickness out', () => {
    const f = wallFrame(ROOM[0], 'face', CX)
    expect(f.n.y).toBeCloseTo(1)
    const b = wallFrame(ROOM[0], 'back', CX)
    expect(b.n.y).toBeCloseTo(-1)
    expect(b.o.y).toBeCloseTo(-90)
  })
})

describe('contacts + anchor', () => {
  it('finds the edge along a wall face', () => {
    const c = wallContacts(STRAIGHT, ROOM, CX)
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ wallId: 'W1', side: 'face', edge: 0, t0: 500, t1: 2000 })
  })

  it('an L touches both walls and anchors to the longer run', () => {
    const c = wallContacts(L_TOP, ROOM, CX)
    expect(new Set(c.map(x => x.wallId))).toEqual(new Set(['W1', 'W2']))
    expect(autoAnchor(L_TOP, ROOM, CX)).toEqual({ wall_id: 'W1', wall_side: 'face' })
  })

  it('an island top anchors to the island side it sits on', () => {
    const top = poly([[900, 1000], [2300, 1000], [2300, 1800], [900, 1800]])   // centroid y 1400 → back side
    expect(wallContacts(top, [...ROOM, ISLAND], CX)).toHaveLength(0)
    expect(autoAnchor(top, [...ROOM, ISLAND], CX)).toEqual({ wall_id: 'I', wall_side: 'back' })
  })

  it('shows on every face it touches, and both sides of an island anchor', () => {
    const c = wallContacts(L_TOP, ROOM, CX)
    const bt = { wall_id: 'W1', wall_side: 'face' as const }
    expect(btShowsOn(bt, c, ROOM[0], 'face')).toBe(true)
    expect(btShowsOn(bt, c, ROOM[1], 'face')).toBe(true)
    expect(btShowsOn(bt, c, ROOM[2], 'face')).toBe(false)
    expect(btShowsOn(bt, c, ROOM[0], 'back')).toBe(false)
    const isl = { wall_id: 'I', wall_side: 'face' as const }
    expect(btShowsOn(isl, [], ISLAND, 'back')).toBe(true)
  })
})

describe('position', () => {
  it('measures start along the wall and distance off the face', () => {
    expect(btPosition(STRAIGHT, wallFrame(ROOM[0], 'face', CX))).toEqual({ along: 500, off: 0, length: 1500, depth: 600 })
  })

  it('typed position translates the top', () => {
    const f = wallFrame(ROOM[0], 'face', CX)
    const moved = mapSegments(STRAIGHT, positionFn(STRAIGHT, f, { along: 800, off: 20 })!)
    expect(outlineBounds(moved)).toMatchObject({ minX: 800, minY: 20, maxX: 2300, maxY: 620 })
  })

  it('re-anchoring carries the top rigidly onto the other wall', () => {
    const from = wallFrame(ROOM[0], 'face', CX), to = wallFrame(ROOM[1], 'face', CX)
    const moved = mapSegments(STRAIGHT, reanchorFn(STRAIGHT, from, to)!)
    const b = outlineBounds(moved)!
    expect(b.minX).toBeCloseTo(2400); expect(b.maxX).toBeCloseTo(3000)
    expect(b.minY).toBeCloseTo(500);  expect(b.maxY).toBeCloseTo(2000)
    // Not mirrored: winding unchanged.
    expect(Math.sign(signedArea(outlinePoints(moved)))).toBe(Math.sign(signedArea(outlinePoints(STRAIGHT))))
    expect(wallContacts(moved, ROOM, CX).map(c => c.wallId)).toEqual(['W2'])
  })

  it('re-anchoring can set the distance off the new face', () => {
    const away = mapSegments(STRAIGHT, p => ({ x: p.x, y: p.y + 400 }))   // 400 off W1
    const to = wallFrame(ROOM[1], 'face', CX)
    const moved = mapSegments(away, reanchorFn(away, wallFrame(ROOM[0], 'face', CX), to, 0)!)
    expect(btPosition(moved, to)?.off).toBeCloseTo(0)
    const kept = mapSegments(away, reanchorFn(away, wallFrame(ROOM[0], 'face', CX), to)!)
    expect(btPosition(kept, to)?.off).toBeCloseTo(400)
  })

  it('knows when a top already sits on a face', () => {
    const c = wallContacts(L_TOP, ROOM, CX)
    expect(btTouches(L_TOP, c, ROOM[1], 'face', CX)).toBe(true)
    expect(btTouches(L_TOP, c, ROOM[2], 'face', CX)).toBe(false)
  })
})

describe('stretch + overhangs', () => {
  const f = () => wallFrame(ROOM[0], 'face', CX)
  const len = (segs: typeof STRAIGHT) => btPosition(segs, f())!
  it('grows the chosen end only', () => {
    const r = len(mapSegments(STRAIGHT, stretchFn(STRAIGHT, f(), 'right', 200)!))
    expect(r).toMatchObject({ along: 500, length: 1700 })
    const l = len(mapSegments(STRAIGHT, stretchFn(STRAIGHT, f(), 'left', 200)!))
    expect(l).toMatchObject({ along: 300, length: 1700 })
    const b = len(mapSegments(STRAIGHT, stretchFn(STRAIGHT, f(), 'both', 200)!))
    expect(b).toMatchObject({ along: 400, length: 1700 })
  })
  it('front moves the front edge, back stays on the wall', () => {
    expect(len(mapSegments(STRAIGHT, stretchFn(STRAIGHT, f(), 'front', -50)!))).toMatchObject({ off: 0, depth: 550 })
  })
  it('an L keeps its return-leg width when lengthened', () => {
    const moved = mapSegments(L_TOP, stretchFn(L_TOP, f(), 'left', 300)!)
    expect(outlineBounds(moved)).toMatchObject({ minX: 700, maxX: 3000 })
    // leg along W2 still 600 wide (x 2400..3000)
    expect(moved.some(s => Math.abs(s.p0.x - 2400) < 1e-6)).toBe(true)
  })
  it('measures overhang past the cabinets underneath', () => {
    const pos = btPosition(STRAIGHT, f())!   // 500..2000, depth 600
    expect(btOverhangs(pos, [{ t: 520, dx: 900, dz: 580 }, { t: 1420, dx: 560, dz: 560 }])).toEqual({ left: 20, right: 20, front: 20 })
    expect(btOverhangs(pos, [{ t: 2500, dx: 600, dz: 580 }])).toBeNull()
  })
})
