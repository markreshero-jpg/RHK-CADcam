import { describe, it, expect } from 'vitest'
import type { Wall, RoomFixture } from '../types'
import { centroid, wallMitreCorners } from '../geometry'
import { fixtureClearances } from '../fixtureGeometry'

// 4000 × 3000 room drawn clockwise in SVG coords (y down); top wall's inside face is y = 0.
const mk = (id: string, x: number, y: number, angle: number, length: number): Wall => ({
  id, room_id: 'r', pos_x: x, pos_y: y, angle, length, thickness: 100, wall_type: 'standard',
} as unknown as Wall)
const walls = [mk('top', 0, 0, 0, 4000), mk('right', 4000, 0, 90, 3000), mk('bottom', 4000, 3000, 180, 4000), mk('left', 0, 3000, 270, 3000)]
const cx = centroid(walls)
const wallPolys = walls.map(w => wallMitreCorners(w, walls, cx))
const box = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]

// Dishwasher 600 × 600 backed on the top wall at x 1000…1600.
const dw = { x: 1000, y: 0, rotation: 0, width: 600, depth: 600, wall_id: 'top' } as unknown as RoomFixture

describe('fixture clearances', () => {
  it('gap to the cabinet on each side, to the far wall in front, none behind (wall-backed)', () => {
    const c = fixtureClearances(dw, walls, cx, [box(400, 0, 950, 580), box(1650, 0, 2250, 580), ...wallPolys])
    expect(c.left).toBe(50)
    expect(c.right).toBe(50)
    expect(c.front).toBe(3000 - 600)
    expect(c.back).toBeUndefined()
  })

  it('nothing beside it: measures to the wall ends', () => {
    const c = fixtureClearances(dw, walls, cx, wallPolys)
    expect(c.left).toBe(1000)
    expect(c.right).toBe(4000 - 1600)
  })

  it('touching neighbours show no dim', () => {
    const c = fixtureClearances(dw, walls, cx, [box(400, 0, 1000, 580), box(1600, 0, 2200, 580), ...wallPolys])
    expect(c.left).toBeUndefined()
    expect(c.right).toBeUndefined()
  })
})
