import { describe, it, expect } from 'vitest'
import type { Wall, RoomFixture } from '../types'
import { centroid } from '../geometry'
import { fixtureWallRef } from '../fixtureGeometry'

// 4000 × 3000 room drawn clockwise in SVG coords (y down); top wall's inside face is y = 0.
const mk = (id: string, x: number, y: number, angle: number, length: number): Wall => ({
  id, room_id: 'r', pos_x: x, pos_y: y, angle, length, thickness: 100, wall_type: 'standard',
} as unknown as Wall)
const walls = [mk('top', 0, 0, 0, 4000), mk('right', 4000, 0, 90, 3000), mk('bottom', 4000, 3000, 180, 4000), mk('left', 0, 3000, 270, 3000)]
const cx = centroid(walls)

describe('fixture wall reference', () => {
  it('backed on the wall: off 0, ends measured along the wall', () => {
    const sink = { x: 1000, y: 0, rotation: 0, width: 800, depth: 450, wall_id: 'top' } as unknown as RoomFixture
    const r = fixtureWallRef(sink, walls, cx)!
    expect(r.side).toBe('face')
    expect(r.off).toBeCloseTo(0)
    expect(r.endLeft).toBeCloseTo(1000)
    expect(r.endRight).toBeCloseTo(4000 - 1800)
  })

  it('pulled forward 50: off 50', () => {
    const sink = { x: 1000, y: 50, rotation: 0, width: 800, depth: 450, wall_id: 'top' } as unknown as RoomFixture
    expect(fixtureWallRef(sink, walls, cx)!.off).toBeCloseTo(50)
  })

  it('free-standing (no wall) has no reference', () => {
    const t = { x: 1000, y: 1000, rotation: 0, width: 800, depth: 450, wall_id: null } as unknown as RoomFixture
    expect(fixtureWallRef(t, walls, cx)).toBeNull()
  })
})
