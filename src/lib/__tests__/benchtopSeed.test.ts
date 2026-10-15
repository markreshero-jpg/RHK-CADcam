import { describe, it, expect } from 'vitest'
import { benchtopSeedFromCabinets, btFrontOverhang, BT_FRONT_OH_HANDLE, BT_FRONT_OH_FINGER } from '../benchtopSeed'
import { centroid, cabWallPerp, wallInwardNormal } from '../geometry'
import { buildPresetFootprint } from '../cabinetShape/presets'
import type { Wall, CabinetInstance, BenchtopSegment } from '../types'
import type { HandleProductInput } from '../resolver/types'

// z_cabinet_shape 4c: a new top starts from the cabinets' real outlines.
const wall = (id: string, x: number, y: number, angle: number, length: number): Wall => ({
  id, room_id: 'r', name: id, sort_order: 0, length, height: null, soffit_height: null,
  angle, pos_x: x, pos_y: y, thickness: 90, wall_type: 'standard', created_at: '',
})
const ROOM = [wall('W1', 0, 0, 0, 3000), wall('W2', 3000, 0, 90, 3000), wall('W3', 3000, 3000, 180, 3000), wall('W4', 0, 3000, 270, 3000)]
const CX = centroid(ROOM)
const cab = (w: Wall, x: number, y: number, dx: number, dz: number, extra: Partial<CabinetInstance> = {}) => {
  const c = { id: `c${x}-${y}`, wall_id: w.id, pos_x: x, pos_y: y, dx, dz, dy: 870, rotation: w.angle, footprint: null, ...extra } as unknown as CabinetInstance
  return { cab: c, wall: w, perp: cabWallPerp(c, w, wallInwardNormal(w, CX)) }
}
const r1 = (v: number) => Math.round(v * 10) / 10
const verts = (s: BenchtopSegment[]) => s.map(e => [r1(e.p0.x), r1(e.p0.y)])
// Same outline whatever vertex it starts on.
const sameLoop = (got: number[][], want: number[][]) => {
  expect(got).toHaveLength(want.length)
  const i = got.findIndex(p => p[0] === want[0][0] && p[1] === want[0][1])
  expect(i).toBeGreaterThanOrEqual(0)
  expect([...got.slice(i), ...got.slice(0, i)]).toEqual(want)
}

describe('benchtop seed from cabinets (4c)', () => {
  it('a straight run merges into one rectangle with the front overhang; back is a wall edge', () => {
    const [W1] = ROOM
    const s = benchtopSeedFromCabinets([cab(W1, 500, 0, 600, 580), cab(W1, 1100, 0, 600, 580)], 40)!
    sameLoop(verts(s), [[500, 0], [1700, 0], [1700, 620], [500, 620]])
    expect(s.filter(e => e.edge?.wall)).toHaveLength(1)
    expect(s.find(e => e.edge?.wall)!.p0.y).toBeCloseTo(0)
  })

  it('a clipped corner keeps its facet, pushed out by the overhang', () => {
    const [W1] = ROOM
    const fp = buildPresetFootprint('clipped_corner', { clip_w: 300, clip_d: 300 }, { w: 900, d: 580 })
    const s = benchtopSeedFromCabinets([cab(W1, 0, 0, 500, 580), cab(W1, 500, 0, 900, 580, { footprint: fp })], 40)!
    const k = r1(1680 + 40 * Math.SQRT2)   // facet line x + y = 1400 + 280, out 40
    sameLoop(verts(s), [[0, 0], [1400, 0], [1400, r1(k - 1400)], [r1(k - 620), 620], [0, 620]])
  })

  it('an L across two walls merges at the corner', () => {
    const [W1, W2] = ROOM
    const s = benchtopSeedFromCabinets([cab(W1, 1000, 0, 2000, 580), cab(W2, 3000, 580, 920, 580)], 40)!
    sameLoop(verts(s), [[1000, 0], [3000, 0], [3000, 1500], [2380, 1500], [2380, 620], [1000, 620]])
    expect(s.filter(e => e.edge?.wall).length).toBe(2)
  })

  it('front overhang: hardware handles 40, finger pulls 25, nothing set 40', () => {
    const h = (grip_kind: HandleProductInput['grip_kind']) => ({ handle: { grip_kind } as HandleProductInput, offset_from_edge_mm: 50, inset_from_side_mm: null, orientation: 'horizontal' as const })
    expect(btFrontOverhang({})).toBe(BT_FRONT_OH_HANDLE)
    expect(btFrontOverhang({ door_base: h('hardware'), drawer: h('hardware') })).toBe(40)
    expect(btFrontOverhang({ door_base: h('routed'), drawer: h('channel') })).toBe(BT_FRONT_OH_FINGER)
    expect(btFrontOverhang({ door_base: h('push'), drawer: h('hardware') })).toBe(40)
  })
})
