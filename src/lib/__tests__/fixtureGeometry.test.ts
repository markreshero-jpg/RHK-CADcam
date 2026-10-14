import { describe, it, expect } from 'vitest'
import type { Wall } from '../types'
import { fixtureCorners, fixtureCenter, rotationForFront, snapFixture, fixtureOnFace, fixtureAxes } from '../fixtureGeometry'
import { wallFrame } from '../benchtopAnchor'

// A 4000 × 3000 room drawn clockwise in SVG coords (y down): top wall runs east.
const mk = (id: string, x: number, y: number, angle: number, length: number): Wall => ({
  id, room_id: 'r', pos_x: x, pos_y: y, angle, length, thickness: 100, wall_type: 'standard',
} as unknown as Wall)
const walls = [mk('top', 0, 0, 0, 4000), mk('right', 4000, 0, 90, 3000), mk('bottom', 4000, 3000, 180, 4000), mk('left', 0, 3000, 270, 3000)]
const room = { x: 2000, y: 1500 }

describe('fixture geometry', () => {
  it('rotation ↔ front direction round-trips', () => {
    for (const r of [0, 90, 180, 270, 37]) {
      const { n } = fixtureAxes(r)
      expect(rotationForFront(n)).toBeCloseTo(r)
    }
  })

  it('snaps back against the top wall, facing into the room', () => {
    const s = snapFixture({ x: 1000, y: 200 }, 600, 600, walls, room, 500)
    expect(s.wall_id).toBe('top')
    const fx = { ...s, width: 600, depth: 600 }
    const [bl, br, fr] = fixtureCorners(fx)
    expect(bl.y).toBeCloseTo(0); expect(br.y).toBeCloseTo(0)   // back on the wall face
    expect(fr.y).toBeCloseTo(600)                                // front into the room
    expect(fixtureCenter(fx).x).toBeCloseTo(1000)                // centred on cursor
  })

  it('clamps to the wall length near a corner', () => {
    const s = snapFixture({ x: 3950, y: 100 }, 600, 600, walls, room, 500)
    const xs = fixtureCorners({ ...s, width: 600, depth: 600 }).map(p => p.x)
    expect(Math.max(...xs)).toBeCloseTo(4000)
  })

  it('snaps to the right wall facing west', () => {
    const s = snapFixture({ x: 3800, y: 1500 }, 600, 600, walls, room, 500)
    expect(s.wall_id).toBe('right')
    const { n } = fixtureAxes(s.rotation)
    expect(n.x).toBeCloseTo(-1)
  })

  it('floats free in the middle of the room', () => {
    const s = snapFixture({ x: 2000, y: 1500 }, 800, 400, walls, room, 500)
    expect(s.wall_id).toBeNull()
    expect(fixtureCenter({ ...s, width: 800, depth: 400 }).x).toBeCloseTo(2000)
  })

  it('shows on the elevation it backs onto, not the opposite wall', () => {
    const s = snapFixture({ x: 1000, y: 200 }, 600, 600, walls, room, 500)
    const fx = { ...s, width: 600, depth: 600 }
    const on = fixtureOnFace(fx, wallFrame(walls[0], 'face', room))
    expect(on?.t0).toBeCloseTo(700); expect(on?.t1).toBeCloseTo(1300)
    expect(fixtureOnFace(fx, wallFrame(walls[2], 'face', room))).toBeNull()
  })
})
