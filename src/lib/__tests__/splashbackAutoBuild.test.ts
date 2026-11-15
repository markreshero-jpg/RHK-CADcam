import { describe, it, expect } from 'vitest'
import { autoBuildSplashbacks, steppedOutline } from '../splashbackAutoBuild'
import { sbBounds } from '../splashbackGeometry'
import type { BenchtopInstance, CabinetInstance, Room, RoomFixture, SplashbackInstance, Wall } from '../types'

// 3000 square room, like the RHK6468 butler's: W1 north (east-going), W4 west (north-going).
const wall = (id: string, x: number, y: number, angle: number, length: number): Wall => ({
  id, room_id: 'r', name: id, sort_order: 0, length, height: null, soffit_height: null,
  angle, pos_x: x, pos_y: y, thickness: 90, wall_type: 'standard', created_at: '',
}) as Wall
const WALLS = [wall('W1', 0, 0, 0, 3000), wall('W2', 3000, 0, 90, 3000), wall('W3', 3000, 3000, 180, 3000), wall('W4', 0, 3000, 270, 3000)]
const room = { id: 'r', wall_cabinet_top: 2100, room_dy: 2400, soffit_height: null } as unknown as Room
const top = (id: string, poly: { x: number; y: number }[]) => ({ id, label: id, polygon: poly, segments: [], arc_segments: [], edge_tags: [] }) as unknown as BenchtopInstance
const NORTH = top('N', [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 600 }, { x: 0, y: 600 }])
const WEST = top('W', [{ x: 0, y: 600 }, { x: 600, y: 600 }, { x: 600, y: 3000 }, { x: 0, y: 3000 }])
const cab = (id: string, wallId: string, x: number, y: number, rotation: number, cls: string, dx: number, dy: number) => ({
  id, wall_id: wallId, pos_x: x, pos_y: y, pos_z: 0, rotation, assembly_class: cls, dx, dy, dz: 300, rule_overrides: {},
}) as unknown as CabinetInstance
// Overheads along W1 (wall class: 2100 top − 480 = 1620 underside); a tall at W4's south end.
const OVERHEADS = cab('OH', 'W1', 0, 0, 0, 'wall', 3000, 480)
const TALL = cab('T', 'W4', 0, 3000, 270, 'tall', 600, 2100)

const run = (extra: { cabinets?: CabinetInstance[]; fixtures?: RoomFixture[]; existing?: SplashbackInstance[] } = {}) =>
  autoBuildSplashbacks({
    walls: WALLS, room, benchtops: [NORTH, WEST], topZ: () => 920,
    cabinets: extra.cabinets ?? [OVERHEADS, TALL], fixtures: extra.fixtures ?? [], existing: extra.existing ?? [],
    thickFor: () => 20, thickOf: () => 20,
  })

describe('splashback auto-build (S4)', () => {
  it('builds one piece per wall face the tops sit against, bench to the overheads / ceiling', () => {
    const ps = run()
    const w1 = ps.find(p => p.wall_id === 'W1')!
    expect(w1.b).toEqual({ x0: 0, x1: 3000, z0: 920, z1: 1620 })
    expect(w1.skip).toBeNull()
    const w4 = ps.find(p => p.wall_id === 'W4')!
    // The tall cuts 0-600; no overheads on W4 → up to the wall top (L3).
    expect(w4.b.z1).toBe(2400)
    expect(w4.b.x0).toBe(600)
  })

  it('the shorter piece stops short at an inside corner by the other\'s thickness', () => {
    const ps = run()
    const w1 = ps.find(p => p.wall_id === 'W1')!
    const w4 = ps.find(p => p.wall_id === 'W4')!
    expect(w1.b.x0).toBe(0)
    expect(w4.b.x1).toBe(2980)
    expect(w4.notes.join(' ')).toMatch(/right end stops 20 short/)
  })

  it('steps down under a rangehood', () => {
    const hood = { id: 'H', wall_id: 'W1', category: 'rangehood', mount: 'wall', x: 1000, y: 0, rotation: 0, width: 900, depth: 500, z: 1500, height: 600 } as unknown as RoomFixture
    const w1 = run({ fixtures: [hood] }).find(p => p.wall_id === 'W1')!
    expect(w1.stepped).toBe(true)
    const tops = w1.segments.filter(s => s.p0.y === s.p1.y && s.p0.y > 920).map(s => [s.p0.y, Math.min(s.p0.x, s.p1.x), Math.max(s.p0.x, s.p1.x)])
    expect(tops).toEqual([[1620, 1900, 3000], [1500, 1000, 1900], [1620, 0, 1000]])
  })

  it('splits at a window whose sill is at the bench, drops slivers', () => {
    const win = { id: 'O', wall_id: 'W1', category: 'opening', x: 1000, y: 0, rotation: 0, width: 1960, depth: 90, z: 920, height: 700, hinge_side: 'left' } as unknown as RoomFixture
    const w1 = run({ fixtures: [win] }).filter(p => p.wall_id === 'W1').map(p => [p.b.x0, p.b.x1])
    // 2960-3000 is a 40 sliver: dropped. Now shorter than W4's 2400, so it stops short at the corner.
    expect(w1).toEqual([[20, 1000]])
  })

  it('skips a stretch already drawn, and a new piece stops short against it', () => {
    const drawn = {
      id: 'S', label: 'Splashback 1', wall_id: 'W4', wall_side: 'face',
      segments: [{ type: 'line', p0: { x: 600, y: 920 }, p1: { x: 3000, y: 920 } }, { type: 'line', p0: { x: 3000, y: 920 }, p1: { x: 3000, y: 1620 } },
        { type: 'line', p0: { x: 3000, y: 1620 }, p1: { x: 600, y: 1620 } }, { type: 'line', p0: { x: 600, y: 1620 }, p1: { x: 600, y: 920 } }],
    } as unknown as SplashbackInstance
    const ps = run({ existing: [drawn] })
    expect(ps.find(p => p.wall_id === 'W4')!.skip).toMatch(/Splashback 1/)
    const w1 = ps.find(p => p.wall_id === 'W1')!
    expect(w1.b.x0).toBe(20)
  })

  it('keeps one height where the overheads stop short of the run end', () => {
    const short = cab('OH', 'W1', 300, 0, 0, 'wall', 2700, 480)
    const w1 = run({ cabinets: [short, TALL] }).find(p => p.wall_id === 'W1')!
    expect(w1.stepped).toBe(false)
    expect(w1.b.z1).toBe(1620)
  })

  it('stepped outline is closed', () => {
    const { segs, tops } = steppedOutline(0, 1000, 900, 2400, [{ x0: 200, x1: 600, zBot: 1500 }])
    expect(tops).toEqual([2400, 1500, 2400])
    segs.forEach((s, i) => expect(s.p1).toEqual(segs[(i + 1) % segs.length].p0))
    expect(sbBounds(segs)).toEqual({ x0: 0, x1: 1000, z0: 900, z1: 2400 })
  })
})
