import { describe, it, expect } from 'vitest'
import { centroid, wallMitreCorners, nibsOnWall, dropWallsOnWall, wallOutline, wallBaseZ, isDropWall, polygonCentroid, wallPieces } from '../geometry'
import { detectNeighbours } from '../neighbours'
import { wallContacts } from '../benchtopAnchor'
import { segmentsFromLegacy } from '../benchtopGeometry'
import type { Wall, CabinetInstance, Room } from '../types'

// Drop / shaped nib walls (z_nib_wall N4): a curved bulkhead hanging off Wall 1, 1620 to the ceiling.
const wall = (id: string, x: number, y: number, angle: number, length: number, extra: Partial<Wall> = {}): Wall => ({
  id, room_id: 'r', name: id, sort_order: 0, length, height: null, soffit_height: null,
  angle, pos_x: x, pos_y: y, thickness: 90, wall_type: 'standard', created_at: '', ...extra,
}) as Wall
const ROOM = [wall('W1', 0, 0, 0, 3000), wall('W2', 3000, 0, 90, 3000), wall('W3', 3000, 3000, 180, 3000), wall('W4', 0, 3000, 270, 3000)]
// Band from x 500 to 2500 on W1's face, 460 deep in the middle (a trapezoid stands in for the S-curve).
const OUT = [{ x: 500, y: 0 }, { x: 900, y: 460 }, { x: 2100, y: 460 }, { x: 2500, y: 0 }]
const BH = wall('BH', 500, 0, 0, 2000, { wall_type: 'nib', thickness: 0, base_height: 1620, outline: OUT })
const WALLS = [...ROOM, BH]
const room = { id: 'r', wall_cabinet_top: 2100, room_dy: 2400, soffit_height: null } as unknown as Room

describe('drop / shaped walls', () => {
  it('reads the outline and base only on nibs', () => {
    expect(wallOutline(BH)).toHaveLength(4)
    expect(wallBaseZ(BH)).toBe(1620)
    expect(isDropWall(BH)).toBe(true)
    expect(wallOutline({ ...BH, wall_type: 'standard' })).toBeNull()
    expect(wallBaseZ({ ...BH, wall_type: 'standard' })).toBe(0)
    expect(isDropWall(wall('N', 0, 0, 90, 500, { wall_type: 'nib' }))).toBe(false)
    expect(wallOutline({ ...BH, outline: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toBeNull()
  })

  it('uses the outline as its footprint, untouched by the room walls, and never splits it', () => {
    const ref = centroid(WALLS)
    expect(wallMitreCorners(BH, WALLS, ref)).toEqual(OUT)
    expect(wallPieces(BH, WALLS, ref, [{ t0: 100, t1: 300 }])).toEqual([OUT])
    expect(centroid(WALLS).x).toBeCloseTo(centroid(ROOM).x)
  })

  it('shows as a band on the wall it faces, not as a nib strip', () => {
    const ref = centroid(WALLS)
    expect(nibsOnWall(ROOM[0], WALLS)).toHaveLength(0)
    const d = dropWallsOnWall(ROOM[0], WALLS, ref)
    expect(d).toHaveLength(1)
    expect(d[0].t0).toBeCloseTo(500); expect(d[0].t1).toBeCloseTo(2500)
    expect(dropWallsOnWall(ROOM[2], WALLS, ref)).toHaveLength(0)   // far side of the room
  })

  it('is not a side for cabinets or an edge for tops', () => {
    const cab = { id: 'c', wall_id: 'W1', pos_x: 2000, pos_y: 0, pos_z: 0, dx: 600, dz: 580, dy: 870,
      rotation: 0, footprint: null, assembly_class: 'base', has_face: true, has_carcass: true, rule_overrides: {} } as unknown as CabinetInstance
    expect(detectNeighbours([cab], WALLS, room).get('c')?.left).not.toBe('wall')
    const top = segmentsFromLegacy([{ x: 400, y: 0 }, { x: 2600, y: 0 }, { x: 2600, y: 600 }, { x: 400, y: 600 }])
    expect(wallContacts(top, WALLS, centroid(WALLS)).some(c => c.wallId === 'BH')).toBe(false)
  })

  it('centroid of a polygon', () => {
    const c = polygonCentroid([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }])
    expect(c.x).toBeCloseTo(50); expect(c.y).toBeCloseTo(25)
  })
})
