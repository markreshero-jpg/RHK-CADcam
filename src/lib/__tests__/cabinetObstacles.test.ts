import { describe, it, expect } from 'vitest'
import { crossWallCabinetOccupancy } from '../cabinetObstacles'
import { centroid } from '../geometry'
import { buildPresetFootprint } from '../cabinetShape/presets'
import type { Wall, Room, CabinetInstance } from '../types'

// Mark, 2026-10-15: a cabinet placed beside the L corner's return leg (on the
// other wall) "can't recognise where it stops and … can overlap it".
const wall = (id: string, x: number, y: number, angle: number, length: number): Wall => ({
  id, room_id: 'r', name: id, sort_order: 0, length, height: null, soffit_height: null,
  angle, pos_x: x, pos_y: y, thickness: 90, wall_type: 'standard', created_at: '',
})
// W1 along +x from (0,0); W4 runs down the x = 0 side from (0,3000) to the W1 corner.
const ROOM = [wall('W1', 0, 0, 0, 3000), wall('W2', 3000, 0, 90, 3000), wall('W3', 3000, 3000, 180, 3000), wall('W4', 0, 3000, 270, 3000)]
const CX = centroid(ROOM)
const room = { room_dy: 2400, wall_cabinet_top: 2100, soffit_height: null } as unknown as Room
const W1 = ROOM[0], W4 = ROOM[3]

const cab = (o: Partial<CabinetInstance>): CabinetInstance => ({
  id: 'c', wall_id: 'W1', assembly_class: 'base', pos_x: 0, pos_y: 0, rotation: 0,
  dx: 600, dy: 870, dz: 560, is_kick_assembly: false, footprint: null, ...o,
} as unknown as CabinetInstance)
// Right-hand L in the W1/W4 corner: its return leg (560 wide) runs 900 along W4.
const bcnp = cab({ id: 'bcnp', dx: 900, dz: 900,
  footprint: buildPresetFootprint('l_corner', { leg_back: 560, leg_side: 560, side: 'right' }, { w: 900, d: 900 }) })
const base = { assembly_class: 'base', dy: 870, dz: 560 }

describe('crossWallCabinetOccupancy', () => {
  it('the L corner blocks the 900 of the other wall its return leg covers', () => {
    const occ = crossWallCabinetOccupancy([bcnp], ROOM, W4, 'face', CX, room, base)
    expect(occ).toHaveLength(1)
    expect(occ[0].t).toBeCloseTo(2100)   // W4 is 3000 long, measured from its far end
    expect(occ[0].dx).toBeCloseTo(900)
  })

  it('a plain corner box blocks only its own depth on the other wall', () => {
    const occ = crossWallCabinetOccupancy([cab({ id: 'b1' })], ROOM, W4, 'face', CX, room, base)
    expect(occ).toEqual([{ t: expect.closeTo(3000 - 560), dx: expect.closeTo(560) }])
  })

  it('wall units clear base units; cabinets on the mover\'s own wall are left to the usual list', () => {
    expect(crossWallCabinetOccupancy([bcnp], ROOM, W4, 'face', CX, room, { assembly_class: 'wall', dy: 720, dz: 350 })).toEqual([])
    expect(crossWallCabinetOccupancy([bcnp], ROOM, W1, 'face', CX, room, base)).toEqual([])
    expect(crossWallCabinetOccupancy([bcnp], ROOM, W4, 'face', CX, room, { ...base, id: 'bcnp' })).toEqual([])
  })

  it('a cabinet away from the corner blocks nothing on the other wall', () => {
    expect(crossWallCabinetOccupancy([cab({ id: 'far', pos_x: 1500 })], ROOM, W4, 'face', CX, room, base)).toEqual([])
  })
})
