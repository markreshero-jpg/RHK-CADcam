import { describe, it, expect } from 'vitest'
import { zoneSeat, zoneFollow, pickOpenZone, definitionContents, fixtureLocalBox, contentsFromFixtures, facingOutRot } from '../cabinetContents'
import { cabinetPlans, linkedPose } from '../fixtureLinks'
import { fixtureCenter } from '../fixtureGeometry'
import { centroid } from '../geometry'
import type { CabinetInstance, Room, RoomFixture, Wall } from '../types'
import type { ResolvedCabinet } from '../resolver/types'

// z_ubo U4: a fixture seated in a cabinet's open face cell.
const wall = { id: 'w1', room_id: 'r', pos_x: 0, pos_y: 0, angle: 0, length: 3000, thickness: 90, height: 2400 } as unknown as Wall
const walls = [wall,
  { ...wall, id: 'w2', pos_x: 3000, angle: 90 },
  { ...wall, id: 'w3', pos_x: 3000, pos_y: 3000, angle: 180 },
  { ...wall, id: 'w4', pos_y: 3000, angle: 270 }] as Wall[]
const room = { id: 'r', height: 2400 } as unknown as Room
const cab = { id: 'c1', wall_id: 'w1', assembly_class: 'base', pos_x: 1000, pos_y: 0, rotation: 0, dx: 600, dy: 900, dz: 580, pos_z: 0 } as unknown as CabinetInstance
const plan = cabinetPlans([cab], walls, centroid(walls))[0]
// Open cell 600 high from Y 220, fronts 18 thick at Z 582 (face plane 600).
const resolved = {
  open_zones: [{ row_index: 1, col_index: 0, X: 2, Y: 220, DX: 596, DY: 600 }],
  face_zones: [{ row_index: 0, col_index: 0, Z: 582, DZ: 18 }, { row_index: 2, col_index: 0, Z: 582, DZ: 18 }],
} as unknown as ResolvedCabinet

describe('zoneSeat', () => {
  const seat = zoneSeat(resolved, cab, plan, { row_index: 1, col_index: 0 }, 600)!

  it('centres across the cell, front flush with the face plane, records the cell bottom', () => {
    expect(seat.link_x).toBe(300)
    expect(seat.link_z).toBe(300)          // 600 face plane − 600 / 2
    expect(seat.link_zone).toEqual({ row_index: 1, col_index: 0, y: 220 })
  })

  it('faces the room like the cabinet: centre lands in the cabinet footprint, in front of the wall', () => {
    const pose = linkedPose(seat, plan, 600, 600)
    const c = fixtureCenter({ ...pose, width: 600, depth: 600 })
    expect(c.x).toBeCloseTo(1300, 1)
    expect(c.y).toBeCloseTo(300, 1)        // walls run along y = 0, room is +y
  })

  it('missing cell → null', () => {
    expect(zoneSeat(resolved, cab, plan, { row_index: 3, col_index: 0 }, 600)).toBeNull()
  })
})

describe('zoneFollow', () => {
  const seat = zoneSeat(resolved, cab, plan, { row_index: 1, col_index: 0 }, 600)!
  const fx = { id: 'f1', cabinet_id: 'c1', width: 600, depth: 600, z: 220, ...seat } as unknown as RoomFixture

  it('settled → no patch', () => {
    expect(zoneFollow([fx], [plan], new Map([['c1', resolved]]), room)).toEqual([])
  })

  it('the cell moved (e.g. kick changed) → link + height follow', () => {
    const moved = { ...resolved, open_zones: [{ ...resolved.open_zones![0], Y: 200 }] } as ResolvedCabinet
    const [p] = zoneFollow([fx], [plan], new Map([['c1', moved]]), room)
    expect(p.patch).toEqual({ link_zone: { row_index: 1, col_index: 0, y: 200 }, z: 200 })
  })

  it('no live resolve (room load) → keeps the stored seat, height from the cabinet bottom', () => {
    const raised = cabinetPlans([{ ...cab, pos_z: 140 }], walls, centroid(walls))[0]
    const [p] = zoneFollow([fx], [raised], new Map(), room)
    expect(p.patch).toEqual({ z: 360 })
  })

  it('point-linked fixtures are left alone', () => {
    expect(zoneFollow([{ ...fx, link_zone: null }], [plan], new Map([['c1', resolved]]), room)).toEqual([])
  })
})

describe('facingOutRot', () => {
  it('matches the turn zoneSeat gives a seated fixture, and adds yaw', () => {
    const seat = zoneSeat(resolved, cab, plan, { row_index: 1, col_index: 0 }, 600)!
    expect(facingOutRot(plan)).toBe(seat.link_rot)
    expect(facingOutRot(plan, 90)).toBeCloseTo((seat.link_rot + 90) % 360, 3)
  })
})

describe('fixtureLocalBox', () => {
  it('a seated oven: in the cabinet frame, facing out, on the cell bottom', () => {
    const seat = zoneSeat(resolved, cab, plan, { row_index: 1, col_index: 0 }, 600)!
    const f = { id: 'f1', cabinet_id: 'c1', width: 600, depth: 600, height: 596, z: 220, ...seat } as unknown as RoomFixture
    const b = fixtureLocalBox(f, plan, room)
    expect(b.yaw).toBe(0)
    expect(b).toMatchObject({ x0: 0, z0: 0, y0: 220, w: 600, d: 600, h: 596 })
  })
})

describe('contentsFromFixtures', () => {
  it('seated → zone anchor; position-linked → point anchor with height above the cabinet; non-catalogue skipped', () => {
    const fx = [
      { catalog_id: 'oven', link_zone: { row_index: 1, col_index: 0, y: 220 }, link_x: 300, link_z: 300, link_rot: 0, z: 220 },
      { catalog_id: 'sink', link_zone: null, link_x: 250, link_z: 280, link_rot: 0, z: 1050 },
      { catalog_id: null, link_zone: null, link_x: 0, link_z: 0, link_rot: 0, z: 0 },
    ] as unknown as RoomFixture[]
    expect(contentsFromFixtures(fx, 150)).toEqual([
      { fixture_catalog_id: 'oven', anchor: { kind: 'zone', row_index: 1, col_index: 0 } },
      { fixture_catalog_id: 'sink', anchor: { kind: 'point', link_x: 250, link_z: 280, link_rot: 0, z: 900 } },
    ])
  })
})

describe('definitionContents', () => {
  it('keeps well-formed items only', () => {
    expect(definitionContents(null)).toEqual([])
    expect(definitionContents([{ fixture_catalog_id: 'a', anchor: { kind: 'zone', row_index: 1, col_index: 0 } }, { foo: 1 }, { fixture_catalog_id: 'b' }]))
      .toHaveLength(1)
  })
})

describe('pickOpenZone (oven dropped on a tower)', () => {
  // Tower: oven opening 600 high at Y 800, compact (microwave) opening 450 at Y 1500.
  const zones = [
    { row_index: 1, col_index: 0, X: 18, Y: 800, DX: 564, DY: 600 },
    { row_index: 3, col_index: 0, X: 18, Y: 1500, DX: 564, DY: 450 },
  ]

  it('snuggest fit by height: oven → the oven opening, microwave → the compact one', () => {
    expect(pickOpenZone(zones, { width: 600, height: 596 })).toEqual({ row_index: 1, col_index: 0 })
    expect(pickOpenZone(zones, { width: 595, height: 390 })).toEqual({ row_index: 3, col_index: 0 })
  })

  it('the cell under the elevation cursor wins when it fits', () => {
    expect(pickOpenZone(zones, { width: 595, height: 390 }, 1000)).toEqual({ row_index: 1, col_index: 0 })
  })

  it('cursor over a cell it does not fit → best fit instead', () => {
    expect(pickOpenZone(zones, { width: 600, height: 596 }, 1600)).toEqual({ row_index: 1, col_index: 0 })
  })

  it('too wide or too tall, or no openings → null', () => {
    expect(pickOpenZone(zones, { width: 900, height: 596 })).toBeNull()
    expect(pickOpenZone(zones, { width: 600, height: 700 })).toBeNull()
    expect(pickOpenZone(undefined, { width: 600, height: 596 })).toBeNull()
  })
})
