import { describe, it, expect } from 'vitest'
import type { Wall } from '../types'
import { fixtureCorners, fixtureCenter, rotationForFront, snapFixture, fixtureOnFace, fixtureAxes, fixtureCutoutPolygon, fixtureCutoutCenter, withFixtureCutouts } from '../fixtureGeometry'
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

describe('benchtop cutouts (P3)', () => {
  const sink = {
    x: 1000, y: 0, rotation: 0, width: 600, depth: 500,
    cutout_shape: 'rect' as const, cutout_w: 580, cutout_d: 480, cutout_radius: 0, cutout_off_x: 0, cutout_off_y: 0,
  }
  // 3000 × 600 top along the top wall
  const top = { segments: null, polygon: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 600 }, { x: 0, y: 600 }], arc_segments: [], edge_tags: [], cutout_polygons: [] } as never

  it('rect cutout is centred on the footprint and follows the offset + rotation', () => {
    const p = fixtureCutoutPolygon(sink)!
    expect(p).toHaveLength(4)
    expect(p[0].x).toBeCloseTo(1010); expect(p[0].y).toBeCloseTo(10)
    expect(p[2].x).toBeCloseTo(1590); expect(p[2].y).toBeCloseTo(490)
    const c = fixtureCutoutCenter({ ...sink, rotation: 90, cutout_off_y: 50 })
    // rotation 90: width runs +y, front runs −x; centre (1000 − 250, 0 + 300) then 50 forward
    expect(c.x).toBeCloseTo(700); expect(c.y).toBeCloseTo(300)
  })

  it('rounded corners and round cutouts', () => {
    expect(fixtureCutoutPolygon({ ...sink, cutout_radius: 15 })!.length).toBe(20)
    const r = fixtureCutoutPolygon({ ...sink, cutout_shape: 'round', cutout_w: 100 })!
    expect(r).toHaveLength(32)
    expect(Math.hypot(r[0].x - 1300, r[0].y - 250)).toBeCloseTo(50)
    expect(fixtureCutoutPolygon({ ...sink, cutout_shape: null })).toBeNull()
  })

  it('cuts only the benchtop under the cutout centre', () => {
    const merged = withFixtureCutouts(top, [sink]) as { cutout_polygons: unknown[] }
    expect(merged.cutout_polygons).toHaveLength(1)
    const off = withFixtureCutouts(top, [{ ...sink, y: 1500 }])
    expect(off).toBe(top)
  })
})
