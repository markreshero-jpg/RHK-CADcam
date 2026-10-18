import { describe, it, expect } from 'vitest'
import type { Wall, RoomFixture } from '../types'
import { centroid } from '../geometry'
import { fixtureChainSpans } from '../fixtureGeometry'

const mk = (id: string, x: number, y: number, angle: number, length: number): Wall => ({
  id, room_id: 'r', pos_x: x, pos_y: y, angle, length, thickness: 100, wall_type: 'standard',
} as unknown as Wall)
const walls = [mk('top', 0, 0, 0, 4000), mk('right', 4000, 0, 90, 3000), mk('bottom', 4000, 3000, 180, 4000), mk('left', 0, 3000, 270, 3000)]
const cx = centroid(walls)
const fx = (o: Partial<RoomFixture>) => ({
  id: 'f', x: 1200, y: 0, rotation: 0, width: 600, depth: 600, height: 850, z: 0,
  category: 'appliance', mount: 'floor', wall_id: 'top', cabinet_id: null, ...o,
}) as RoomFixture

describe('appliances in the dimension rows', () => {
  it('dishwasher → floor row, rangehood → wall row, along the wall', () => {
    const s = fixtureChainSpans([fx({}), fx({ id: 'rh', mount: 'wall', z: 1500, x: 2000, width: 900, depth: 400 })], walls[0], cx)
    expect(s).toEqual([
      expect.objectContaining({ side: 'face', row: 'floor' }),
      expect.objectContaining({ side: 'face', row: 'wall' }),
    ])
    expect(s[0].t).toBeCloseTo(1200); expect(s[0].dx).toBeCloseTo(600)
    expect(s[1].t).toBeCloseTo(2000); expect(s[1].dx).toBeCloseTo(900)
  })
  it('sinks, openings, linked items and other walls are left out', () => {
    expect(fixtureChainSpans([
      fx({ mount: 'benchtop', category: 'sink' }), fx({ category: 'opening' }),
      fx({ cabinet_id: 'c1' }), fx({ wall_id: 'right' }),
    ], walls[0], cx)).toHaveLength(0)
  })
})
