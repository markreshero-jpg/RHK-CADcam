import { describe, it, expect } from 'vitest'
import type { Wall } from '../types'
import { wallEnd } from '../geometry'
import { detachedNeighbours, connectedWallIds, stretchNeighbour } from '../wallJoints'

const W = (id: string, x: number, y: number, length: number, angle: number): Wall =>
  ({ id, pos_x: x, pos_y: y, length, angle, thickness: 90, wall_type: 'standard' } as unknown as Wall)

// 4000 × 3000 room drawn as a closed loop: a → b → c → d.
const room = [W('a', 0, 0, 4000, 0), W('b', 4000, 0, 3000, 90), W('c', 4000, 3000, 4000, 180), W('d', 0, 3000, 3000, -90)]

describe('moving walls off their joints', () => {
  it('finds the walls joined to the dragged one', () => {
    expect(detachedNeighbours(room, ['b'])).toEqual([
      { id: 'a', startJoined: false, endJoined: true },
      { id: 'c', startJoined: true, endJoined: false },
    ])
    expect(detachedNeighbours(room, ['a', 'b', 'c', 'd'])).toEqual([])
  })

  it('connected set spans the whole room', () => {
    expect(connectedWallIds(room, ['b']).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('pushing a side wall out lengthens its neighbours without turning them', () => {
    const [a, , c] = room
    const sa = stretchNeighbour(a, { id: 'a', startJoined: false, endJoined: true }, 500, 0)!
    expect(sa.update.length).toBeCloseTo(4500); expect(sa.turn).toBeCloseTo(0)
    const sc = stretchNeighbour(c, { id: 'c', startJoined: true, endJoined: false }, 500, 0)!
    expect(sc.update.length).toBeCloseTo(4500); expect(sc.update.pos_x).toBeCloseTo(4500)
    // Free end of c (its end at x=0) stays put.
    expect(wallEnd({ ...c, ...sc.update } as Wall).x).toBeCloseTo(0)
  })

  it('a sideways drag turns the neighbour about its free end', () => {
    const a = room[0]
    const s = stretchNeighbour(a, { id: 'a', startJoined: false, endJoined: true }, 0, 400)!
    const moved = { ...a, ...s.update } as Wall
    expect(moved.pos_x).toBeCloseTo(0); expect(moved.pos_y).toBeCloseTo(0)
    expect(wallEnd(moved).x).toBeCloseTo(4000); expect(wallEnd(moved).y).toBeCloseTo(400)
    // Riders keep their distance from the free end, on the turned wall line.
    const p = s.fn({ x: 4000, y: 0 })
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(4000)
    expect(Math.atan2(p.y, p.x) * 180 / Math.PI).toBeCloseTo(moved.angle)
    expect(s.turn).toBeCloseTo(moved.angle)
  })

  it('refuses to shrink a neighbour to nothing', () => {
    const a = room[0]
    expect(stretchNeighbour(a, { id: 'a', startJoined: false, endJoined: true }, -4000, 0)).toBeNull()
  })
})
