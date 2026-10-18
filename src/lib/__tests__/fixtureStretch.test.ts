import { describe, it, expect } from 'vitest'
import type { Wall, RoomFixture } from '../types'
import { centroid } from '../geometry'
import { stretchPatch, stretchBounds, elevationFrame, elevLeftSide, snapOpening } from '../fixtureGeometry'

// 4000 × 3000 room drawn clockwise in SVG coords (y down); top wall's inside face is y = 0.
const mk = (id: string, x: number, y: number, angle: number, length: number): Wall => ({
  id, room_id: 'r', pos_x: x, pos_y: y, angle, length, thickness: 100, wall_type: 'standard',
} as unknown as Wall)
const walls = [mk('top', 0, 0, 0, 4000), mk('right', 4000, 0, 90, 3000), mk('bottom', 4000, 3000, 180, 4000), mk('left', 0, 3000, 270, 3000)]
const ref = centroid(walls)
const free = { lo: -Infinity, hi: Infinity }

// A 600-wide dishwasher backed on the top wall at t = 1000…1600 (rotation 0: width runs +x, front +y).
const dw = { x: 1000, y: 0, rotation: 0, width: 600, depth: 600, height: 850, z: 0, wall_id: 'top' } as unknown as RoomFixture
const box = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]

describe('fixture stretching (P7)', () => {
  it('right edge follows the cursor, left edge stays', () => {
    expect(stretchPatch(dw, 'right', { p: { x: 1650, y: 300 } }, free)).toEqual({ width: 650 })
  })

  it('left edge moves the corner, right edge stays', () => {
    const p = stretchPatch(dw, 'left', { p: { x: 950, y: 300 } }, free)!
    expect(p.width).toBe(650)
    expect(p.x).toBe(950)
    expect(p.x! + p.width!).toBe(1600)
  })

  it('front sets the depth; top / bottom set height and sill (head stays)', () => {
    expect(stretchPatch(dw, 'front', { p: { x: 1300, y: 640 } }, free)).toEqual({ depth: 640 })
    expect(stretchPatch(dw, 'top', { z: 900 }, free, 10)).toEqual({ height: 900 })
    const win = { ...dw, z: 900, height: 1200 }
    expect(stretchPatch(win, 'bottom', { z: 1000 }, free, 10)).toEqual({ z: 1000, height: 1100 })
  })

  it('stops at the neighbouring cabinet and at the wall ends', () => {
    // base cabinet 1600…2200 to the right; another 400…1000 to the left
    const b = stretchBounds(dw, walls, ref, [box(1600, 0, 2200, 580), box(400, 0, 1000, 580)])
    expect(b.hi).toBeCloseTo(600)   // can't grow right at all
    expect(b.lo).toBeCloseTo(0)     // nor left
    expect(stretchPatch(dw, 'right', { p: { x: 1900, y: 300 } }, b)).toEqual({ width: 600 })
    // nothing beside it: the wall ends limit it (0 … 4000)
    const w = stretchBounds(dw, walls, ref, [])
    expect(w.lo).toBeCloseTo(-1000)
    expect(w.hi).toBeCloseTo(3000)
  })

  it('ignores obstacles outside its depth band (e.g. a wall cabinet above is filtered by height, a far one by depth)', () => {
    const b = stretchBounds(dw, walls, ref, [box(1700, 800, 2200, 1200)])
    expect(b.hi).toBeCloseTo(3000)
  })

  it('elevation left handle maps to the right fixture edge on the back face', () => {
    const top = walls[0]
    const face = elevationFrame(top, 'face', ref), back = elevationFrame(top, 'back', ref)
    expect(elevLeftSide(0, face)).toBe('left')
    expect(elevLeftSide(0, back)).toBe('right')
    // an opening in the top wall faces the room: its width runs with the face elevation
    const o = snapOpening({ x: 1500, y: 100 }, 1200, walls, ref, 600)!
    expect(elevLeftSide(o.rotation, face)).toBe('left')
  })
})
