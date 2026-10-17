import { describe, it, expect } from 'vitest'
import type { Wall, CabinetInstance, RoomFixture, Room } from '../types'
import { centroid } from '../geometry'
import { fixtureCenter } from '../fixtureGeometry'
import { cabinetPlans, linkFor, linkedPose, followLinks, fixtureClashes, polygonsOverlap } from '../fixtureLinks'

// 4000 × 3000 room drawn clockwise in SVG coords (y down): top wall runs east.
const mkWall = (id: string, x: number, y: number, angle: number, length: number): Wall => ({
  id, room_id: 'r', pos_x: x, pos_y: y, angle, length, thickness: 100, wall_type: 'standard',
} as unknown as Wall)
const walls = [mkWall('top', 0, 0, 0, 4000), mkWall('right', 4000, 0, 90, 3000), mkWall('bottom', 4000, 3000, 180, 4000), mkWall('left', 0, 3000, 270, 3000)]
const ref = centroid(walls)
const room = { id: 'r', wall_cabinet_top: 2100 } as unknown as Room

const cab = (id: string, cls: CabinetInstance['assembly_class'], t: number, dx = 600, extra: Partial<CabinetInstance> = {}): CabinetInstance => ({
  id, room_id: 'r', wall_id: 'top', label: id.toUpperCase(), assembly_class: cls,
  pos_x: t, pos_y: 0, pos_z: 0, rotation: 0, dx, dy: cls === 'wall' ? 720 : 870, dz: cls === 'wall' ? 350 : 580,
  ...extra,
} as unknown as CabinetInstance)

const fixture = (over: Partial<RoomFixture>): RoomFixture => ({
  id: 'f', room_id: 'r', category: 'sink', kind: null, name: 'Sink', width: 500, depth: 400, height: 200,
  mount: 'benchtop', x: 0, y: 0, rotation: 0, z: 700, wall_id: 'top',
  cabinet_id: null, link_x: 0, link_z: 0, link_rot: 0, ...over,
} as unknown as RoomFixture)

describe('fixture ↔ cabinet links', () => {
  const b1 = cab('b1', 'base', 1000, 900)
  const w1 = cab('w1', 'wall', 1000, 900)
  const plans = cabinetPlans([b1, w1], walls, ref)

  it('links a benchtop item to the base cabinet under its centre, off-centre kept', () => {
    // sink 500 wide whose left edge is 150 in from the cabinet's left — not centred
    const f = fixture({ x: 1150, y: 50 })
    const l = linkFor(f, plans)
    expect(l?.cabinet_id).toBe('b1')
    expect(l?.link_x).toBeCloseTo(150 + 250)
    expect(l?.link_z).toBeCloseTo(50 + 200)
    expect(l?.link_rot).toBeCloseTo(0)
  })

  it('wall items link to wall cabinets, floor items never link', () => {
    expect(linkFor(fixture({ x: 1100, y: 0, mount: 'wall', depth: 300 }), plans)?.cabinet_id).toBe('w1')
    expect(linkFor(fixture({ x: 1100, y: 0, mount: 'floor' }), plans)).toBeNull()
    expect(linkFor(fixture({ x: 2500, y: 0 }), plans)).toBeNull()
  })

  it('follows the cabinet when it slides along the wall, keeping its offset', () => {
    const f0 = fixture({ x: 1150, y: 50 })
    const f = { ...f0, ...linkFor(f0, plans)! }
    const moved = cabinetPlans([{ ...b1, pos_x: 1600 }], walls, ref)
    const [m] = followLinks([f], moved)
    expect(m.patch.x).toBeCloseTo(1750)
    expect(m.patch.y).toBeCloseTo(50)
    // already in place → nothing to do
    expect(followLinks([{ ...f, ...m.patch }], moved)).toEqual([])
  })

  it('follows a cabinet moved to another wall (turns with it)', () => {
    const f0 = fixture({ x: 1150, y: 50 })
    const f = { ...f0, ...linkFor(f0, plans)! }
    // same cabinet on the right wall (runs south), 500 from its start
    const onRight = { ...b1, wall_id: 'right', pos_x: 4000, pos_y: 500, rotation: 90 }
    const p = cabinetPlans([onRight], walls, ref)[0]
    const pose = linkedPose(f, p, f.width, f.depth)
    expect(pose.wall_id).toBe('right')
    expect(pose.rotation).toBeCloseTo(90)
    const c = fixtureCenter({ ...pose, width: f.width, depth: f.depth })
    // centre 400 along the cabinet (south), 250 into the room (west)
    expect(c.x).toBeCloseTo(4000 - 250)
    expect(c.y).toBeCloseTo(500 + 400)
  })

  it('warns when a floor appliance overlaps a cabinet, not when it sits flush in a gap', () => {
    // b1 ends at 1900, b2 starts at 2500 → a 600 gap
    const plans2 = cabinetPlans([b1, cab('b2', 'base', 2500, 600)], walls, ref)
    const dwFlush = fixture({ id: 'dw', category: 'appliance', mount: 'floor', x: 1900, y: 0, width: 600, depth: 550, height: 820, z: 0 })
    const dwBig = { ...dwFlush, id: 'dw2', width: 620 }
    const clashes = fixtureClashes([dwFlush, dwBig], plans2, room)
    expect(clashes.has('dw')).toBe(false)
    expect(clashes.get('dw2')?.map(c => c.id)).toEqual(['b2'])
  })

  it('ignores benchtop items, the linked cabinet, and cabinets at another height', () => {
    const sink = fixture({ x: 1150, y: 50 })
    const oven = fixture({ id: 'ov', category: 'appliance', mount: 'under_bench', x: 1150, y: 0, width: 600, depth: 550, height: 600, z: 100 })
    const linkedOven = { ...oven, id: 'ov2', ...linkFor(oven, plans)! }
    // a rangehood well above the base cabinet, below the wall cabinet
    const hood = fixture({ id: 'rh', category: 'appliance', mount: 'wall', x: 1150, y: 0, width: 600, depth: 300, height: 200, z: 1100 })
    const c = fixtureClashes([sink, oven, linkedOven, hood], plans, room)
    expect(c.has('f')).toBe(false)
    expect(c.get('ov')?.map(x => x.id)).toEqual(['b1'])
    expect(c.has('ov2')).toBe(false)
    expect(c.has('rh')).toBe(false)
  })

  it('polygonsOverlap: crossing, containment, apart', () => {
    const sq = (x: number, y: number, s: number) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }]
    expect(polygonsOverlap(sq(0, 0, 10), sq(5, 5, 10))).toBe(true)
    expect(polygonsOverlap(sq(0, 0, 10), sq(2, 2, 3))).toBe(true)
    expect(polygonsOverlap(sq(0, 0, 10), sq(20, 0, 10))).toBe(false)
  })
})
