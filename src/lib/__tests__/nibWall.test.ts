import { describe, it, expect } from 'vitest'
import { centroid, wallMitreCorners, wallInwardNormal, nibsOnWall, nearestWall } from '../geometry'
import { detectNeighbours } from '../neighbours'
import { returnWallsOf } from '../returnSection'
import type { Wall, CabinetInstance, Room } from '../types'

// Nib walls (z_nib_wall): a 90 stub off Wall 1's inside face, 500 into a 3 m room.
const wall = (id: string, x: number, y: number, angle: number, length: number, wall_type: Wall['wall_type'] = 'standard'): Wall => ({
  id, room_id: 'r', name: id, sort_order: 0, length, height: null, soffit_height: null,
  angle, pos_x: x, pos_y: y, thickness: 90, wall_type, created_at: '',
}) as Wall
const ROOM = [wall('W1', 0, 0, 0, 3000), wall('W2', 3000, 0, 90, 3000), wall('W3', 3000, 3000, 180, 3000), wall('W4', 0, 3000, 270, 3000)]
const NIB = wall('N1', 1800, 0, 90, 500, 'nib')
const WALLS = [...ROOM, NIB]
const room = { id: 'r', wall_cabinet_top: 2100, room_dy: 2400, soffit_height: null } as unknown as Room
const cab = (id: string, t: number, dx: number) => ({ id, wall_id: 'W1', pos_x: t, pos_y: 0, pos_z: 0, dx, dz: 480, dy: 870,
  rotation: 0, footprint: null, assembly_class: 'base', has_face: true, has_carcass: true, rule_overrides: {} } as unknown as CabinetInstance)

describe('nib walls', () => {
  it('leave the room centre and the outline facing alone', () => {
    const a = centroid(ROOM), b = centroid(WALLS)
    expect(b.x).toBeCloseTo(a.x); expect(b.y).toBeCloseTo(a.y)
    expect(wallInwardNormal(ROOM[0], b)).toEqual(wallInwardNormal(ROOM[0], a))
  })
  it('are a 90 rectangle centred on their line, and the main wall keeps its corners', () => {
    const ref = centroid(WALLS)
    const c = wallMitreCorners(NIB, WALLS, ref)
    const xs = c.map(p => p.x).sort((p, q) => p - q), ys = c.map(p => p.y).sort((p, q) => p - q)
    expect(xs[0]).toBeCloseTo(1755); expect(xs[3]).toBeCloseTo(1845)
    expect(ys[0]).toBeCloseTo(0); expect(ys[3]).toBeCloseTo(500)
    expect(wallMitreCorners(ROOM[0], WALLS, ref)).toEqual(wallMitreCorners(ROOM[0], ROOM, centroid(ROOM)))
  })
  it('are found on their main wall at their centre, never as returns', () => {
    expect(nibsOnWall(ROOM[0], WALLS).map(n => [n.nib.id, n.t])).toEqual([['N1', 1800]])
    expect(nibsOnWall(ROOM[1], WALLS)).toEqual([])
    expect(returnWallsOf(ROOM[0], WALLS)).toEqual({ left: ROOM[3], right: ROOM[1] })
  })
  it('count as a wall for a cabinet butted against them', () => {
    const n = detectNeighbours([cab('A', 1155, 600), cab('B', 1845, 600)], WALLS, room)
    expect(n.get('A')?.right).toBe('wall')
    expect(n.get('B')?.left).toBe('wall')
  })
  it('never take a cabinet being placed', () => {
    expect(nearestWall({ x: 1800, y: 300 }, WALLS, 600, 400)?.wall.id).toBe('W1')
  })
})
