import { describe, it, expect } from 'vitest'
import type { Wall, RoomFixture, Room } from '../types'
import { centroid, findFreeSlot } from '../geometry'
import { fixtureOccupancy, solidFixtures, bandOccupancy } from '../cabinetObstacles'
import { slideClear, fixtureCorners } from '../fixtureGeometry'

// 4000 × 3000 room drawn clockwise in SVG coords (y down); top wall's inside face is y = 0.
const mk = (id: string, x: number, y: number, angle: number, length: number): Wall => ({
  id, room_id: 'r', pos_x: x, pos_y: y, angle, length, thickness: 100, wall_type: 'standard',
} as unknown as Wall)
const walls = [mk('top', 0, 0, 0, 4000), mk('right', 4000, 0, 90, 3000), mk('bottom', 4000, 3000, 180, 4000), mk('left', 0, 3000, 270, 3000)]
const top = walls[0]
const cx = centroid(walls)
const room = { id: 'r', wall_cabinet_top: 2100 } as unknown as Room

const fx = (over: Partial<RoomFixture>): RoomFixture => ({
  id: 'dw', room_id: 'r', category: 'appliance', mount: 'floor', x: 1000, y: 0, rotation: 0,
  width: 600, depth: 600, height: 850, z: 0, wall_id: 'top', cabinet_id: null, ...over,
} as unknown as RoomFixture)

describe('appliances as obstacles', () => {
  it('a dishwasher blocks base cabinets on its wall, not wall cabinets above it', () => {
    const occ = fixtureOccupancy([fx({})], top, 'face', cx, room, { assembly_class: 'base', dy: 870, dz: 580 })
    expect(occ).toHaveLength(1)
    expect(occ[0].t).toBeCloseTo(1000)
    expect(occ[0].dx).toBeCloseTo(600)
    expect(fixtureOccupancy([fx({})], top, 'face', cx, room, { assembly_class: 'wall', dy: 720, dz: 350 })).toEqual([])
    // a base cabinet sliding along the wall now stops beside it
    expect(findFreeSlot(1300, 600, 4000, occ)).toBeCloseTo(1600)
  })

  it('sinks / taps, openings and linked items are not obstacles', () => {
    const sink = fx({ id: 's', category: 'sink', mount: 'benchtop' })
    const win = fx({ id: 'w', category: 'opening', mount: 'wall' })
    const oven = fx({ id: 'o', cabinet_id: 'ubo' })
    expect(solidFixtures([sink, win, oven, fx({})]).map(f => f.id)).toEqual(['dw'])
  })

  it('a dropped dishwasher slides off a cabinet to the nearest free gap', () => {
    // base cabinet over 1000…1600; the dishwasher was dropped at 1100…1700
    const cab = { pts: [{ x: 1000, y: 0 }, { x: 1600, y: 0 }, { x: 1600, y: 580 }, { x: 1000, y: 580 }], z0: 0, z1: 870 }
    const occ = bandOccupancy([cab], top, 'face', cx, 0, 850, 600)
    const s = slideClear({ x: 1100, y: 0, rotation: 0, wall_id: 'top' }, 600, 600, top, cx, occ, findFreeSlot)
    expect(s.x).toBeCloseTo(1600)
    // already clear → unchanged
    const s2 = slideClear({ x: 2000, y: 0, rotation: 0, wall_id: 'top' }, 600, 600, top, cx, occ, findFreeSlot)
    expect(s2.x).toBe(2000)
    expect(fixtureCorners({ ...s, width: 600, depth: 600 })[0].x).toBeCloseTo(1600)
  })
})
