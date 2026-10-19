import { describe, it, expect } from 'vitest'
import { wallAnchorPoint, cabWallGap, slideAlongWall, cabT, centroid } from '../geometry'
import type { CabinetInstance, Wall } from '../types'

// z_wot K1 — a cabinet can stand off the wall face; moves keep the gap.
const wall = (id: string, x: number, y: number, angle: number, length: number) =>
  ({ id, pos_x: x, pos_y: y, angle, length, thickness: 100 }) as Wall
// A 4000 × 3000 room drawn clockwise from the origin (y down).
const walls = [wall('a', 0, 0, 0, 4000), wall('b', 4000, 0, 90, 3000), wall('c', 4000, 3000, 180, 4000), wall('d', 0, 3000, 270, 3000)]
const ref = centroid(walls)
const cab = (p: { x: number; y: number }, rotation: number) => ({ pos_x: p.x, pos_y: p.y, rotation, dx: 600 }) as CabinetInstance

describe('wall gap', () => {
  it('stands a face-side cabinet off the wall and reads the gap back', () => {
    const p = wallAnchorPoint(walls[0], 1000, false, ref, 180)
    expect(p).toEqual({ x: 1000, y: 180 })
    expect(cabWallGap(cab(p, 0), walls[0], ref)).toBeCloseTo(180, 6)
    expect(cabWallGap(cab(wallAnchorPoint(walls[0], 1000, false, ref), 0), walls[0], ref)).toBe(0)
  })

  it('back side: past the wall thickness, gap read net of it', () => {
    const p = wallAnchorPoint(walls[0], 1000, true, ref, 50)
    expect(p.y).toBeCloseTo(-150, 6)
    expect(cabWallGap(cab(p, 180), walls[0], ref)).toBeCloseTo(50, 6)
  })

  it('sliding along the wall keeps the gap', () => {
    const c = cab(wallAnchorPoint(walls[1], 500, false, ref, 180), 90)
    const moved = cab(slideAlongWall(c, walls[1], 1500), 90)
    expect(cabT(moved, walls[1])).toBeCloseTo(1500, 6)
    expect(cabWallGap(moved, walls[1], ref)).toBeCloseTo(180, 6)
  })
})
