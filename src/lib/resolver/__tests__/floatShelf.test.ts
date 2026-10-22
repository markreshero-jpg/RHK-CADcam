import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ResolvedCasePart } from '../types'
import { casePlanCorners } from '../../jointDrilling'
import { DEFAULT_FLOAT_SHELF, normaliseFloatShelf, fsTapeLength, floatShelfThickness, floatShelfPartNote, floatShelfPartLabel, type FloatShelfSettings } from '../../floatShelf'
import { collectFloatShelfPocketRoutes, CURVED_POCKET_OVERRUN } from '../../optimiser/seamDrillSync'
import { buildPersistPayload } from '../persistResolved'
import { cabsBlock } from '../../geometry'
import type { Room } from '../../types'

// z_floating_shelf FS2: glued-up boards, cleat slot, build-up strips, hand-cut cleats.
const board = (t: number, id = `m${t}`): Material => ({ id, name: `Board ${t}`, DZ: t, sheet_dx: 2400, sheet_dy: 1200, has_grain: false })
const W = 1200, D = 250, T = 16.5

function cab(s: Partial<FloatShelfSettings>, o: Partial<CabinetInput> = {}): CabinetInput {
  return {
    id: 'fs1', assembly_class: 'wall', DX: W, DY: 33, DZ: D,
    has_carcass: false, has_internal: false, has_face: false, has_toekick: false,
    left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
    material: board(16, 'carcass'), door_material: board(18, 'door'), shelf_material: board(16),
    exposed_material: board(T, 'exposed'),
    toekick_face_material: board(16), toekick_interior_material: board(16),
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    internal_tree: { type: 'open', fittings: [] },
    face_grid: { rows: [], cols: [], zones: [] },
    exposed_edgeband_id: 'eb-exposed',
    float_shelf: normaliseFloatShelf({ ...DEFAULT_FLOAT_SHELF, ...s }),
    ...o,
  }
}
const resolve = (c: CabinetInput) => resolveCabinet(c)
const get = (ps: ResolvedCasePart[], k: string) => ps.find(p => p.part_key === k)
const keys = (ps: ResolvedCasePart[]) => ps.map(p => p.part_key).sort()
function plan(p: ResolvedCasePart) {
  const c = casePlanCorners(p)
  const xs = c.map(q => q.x), zs = c.map(q => q.z)
  const r = (n: number) => Math.round(n * 1000) / 1000
  return { x0: r(Math.min(...xs)), x1: r(Math.max(...xs)), z0: r(Math.min(...zs)), z1: r(Math.max(...zs)) }
}

describe('floating shelf — double', () => {
  it('two full exposed boards, untaped, stacked; height = 2 × board', () => {
    const rp = resolve(cab({}))
    const ps = rp.case_parts
    expect(keys(ps)).toEqual(['fs:bot', 'fs:cleat_b', 'fs:cleat_l', 'fs:cleat_r', 'fs:top'])
    for (const k of ['fs:bot', 'fs:top']) {
      const p = get(ps, k)!
      expect({ DX: p.DX, DY: p.DY, DZ: p.DZ, mat: p.material_id }).toEqual({ DX: D, DY: W, DZ: T, mat: 'exposed' })
      expect(plan(p)).toEqual({ x0: 0, x1: W, z0: 0, z1: D })
      expect(p.edge_band).toMatchObject({ top: false, bottom: false, left: false, right: false })
    }
    expect(get(ps, 'fs:bot')!.Y).toBe(0)
    expect(get(ps, 'fs:top')!.Y).toBe(T)
    expect(floatShelfThickness(rp)).toBe(33)
  })

  it('both sides unseen: back slot full width + side slots stopping 30 from the front', () => {
    const p = get(resolve(cab({})).case_parts, 'fs:top')!
    expect(p.pockets).toEqual([
      { x0: 0, x1: W, y0: D - 30, y1: D, depth: 10 },
      { x0: 0, x1: 30, y0: 30, y1: D, depth: 10 },
      { x0: W - 30, x1: W, y0: 30, y1: D, depth: 10 },
    ])
  })

  it('seen side: no side slot there, back slot stops `stop` from that edge', () => {
    const p = get(resolve(cab({ seen_right: true, stop: 40 })).case_parts, 'fs:bot')!
    expect(p.pockets).toEqual([
      { x0: 0, x1: W - 40, y0: D - 30, y1: D, depth: 10 },
      { x0: 0, x1: 30, y0: 40, y1: D, depth: 10 },
    ])
  })

  it('cleats fill the 20 slot, hand cut, never on the CNC', () => {
    const rp = resolve(cab({ seen_left: true }))
    const b = get(rp.case_parts, 'fs:cleat_b')!, r = get(rp.case_parts, 'fs:cleat_r')!
    expect(get(rp.case_parts, 'fs:cleat_l')).toBeUndefined()
    expect({ Y: b.Y, DZ: b.DZ, hand: b.hand_cut }).toEqual({ Y: T - 10, DZ: 20, hand: true })
    expect(plan(b)).toEqual({ x0: 30, x1: W, z0: 0, z1: 30 })
    expect(plan(r)).toEqual({ x0: W - 30, x1: W, z0: 30, z1: D - 30 })
    const rows = buildPersistPayload(rp).case_parts
    expect(rows.find(x => x.part_key === 'fs:cleat_b')!.output_to_cnc).toBe(false)
    expect(rows.find(x => x.part_key === 'fs:top')!.output_to_cnc).toBe(true)
  })

  it('cleat toggle off: boards only', () => {
    expect(keys(resolve(cab({ cleat: false })).case_parts)).toEqual(['fs:bot', 'fs:top'])
  })
})

describe('floating shelf — triple', () => {
  it('solid: three full boards, the middle cut back round the slot, outer boards unpocketed', () => {
    const rp = resolve(cab({ build: 'triple_solid', seen_right: true }))
    const ps = rp.case_parts
    expect(get(ps, 'fs:top')!.Y).toBe(2 * T)
    expect(get(ps, 'fs:top')!.pockets).toBeUndefined()
    expect(floatShelfThickness(rp)).toBe(49.5)
    const m = get(ps, 'fs:mid')!
    expect(m.Y).toBe(T)
    expect(m.outline).toEqual([
      { x: 0, y: 0 }, { x: W, y: 0 },
      { x: W, y: D }, { x: W - 30, y: D }, { x: W - 30, y: D - 30 },
      { x: 30, y: D - 30 }, { x: 30, y: 30 }, { x: 0, y: 30 },
    ])
    // Slot = the middle layer.
    const b = get(ps, 'fs:cleat_b')!
    expect({ Y: b.Y, DZ: b.DZ }).toEqual({ Y: T, DZ: T })
  })

  it('build-up: rails, perimeter strips butting the rails, cross strips ≤ 600 centres', () => {
    const ps = resolve(cab({ build: 'triple_buildup', seen_left: true }, { DX: 1800 })).case_parts
    const mids = ps.filter(p => p.Y === T)
    const sw = 90, rd = 30
    expect(plan(get(mids, 'fs:rail_f')!)).toEqual({ x0: 0, x1: 1800, z0: D - sw, z1: D })
    // Back rail sits forward by the rebate depth; butts the seen strip, inset rd on the unseen side.
    expect(plan(get(mids, 'fs:rail_b')!)).toEqual({ x0: sw, x1: 1800 - rd, z0: rd, z1: rd + sw })
    // Seen left strip runs to the back edge; unseen right strip sits in rd, between the rails.
    expect(plan(get(mids, 'fs:strip_l')!)).toEqual({ x0: 0, x1: sw, z0: 0, z1: D - sw })
    expect(plan(get(mids, 'fs:strip_r')!)).toEqual({ x0: 1800 - rd - sw, x1: 1800 - rd, z0: rd + sw, z1: D - sw })
    const cross = mids.filter(p => p.part_key.startsWith('fs:cross_'))
    // Strip centres 45 → 1725: 1680 span → 3 bays of 560, 2 cross strips.
    expect(cross.map(p => p.part_key)).toEqual(['fs:cross_1', 'fs:cross_2'])
    expect(plan(cross[0])).toEqual({ x0: 560, x1: 650, z0: rd + sw, z1: D - sw })
    expect(ps.every(p => !p.pockets)).toBe(true)
  })
})

describe('floating shelf — CNC + notes', () => {
  it('pockets become back-face route pockets in the flat op frame, open edges overrun', () => {
    const rp = resolve(cab({ seen_right: true }))
    const { rows } = collectFloatShelfPocketRoutes(rp, 'c1', 'tool10')
    const ov = CURVED_POCKET_OVERRUN
    const top = rows.filter(r => r.source_part_key === 'case_fs:top')
    expect(top).toHaveLength(2)
    // Back slot: op x from the back edge — centred rd/2 in, overrunning past the back.
    expect(top[0]).toMatchObject({ operation_action: 'pocket', output_face: 'back', depth: 10,
      pos_x: (30 - ov) / 2, size_dx: 30 + ov, pos_y: (W - 30 - ov) / 2, size_dy: W - 30 + ov })
    expect(rows.every(r => !r.source_part_key.includes('cleat'))).toBe(true)
    expect(collectFloatShelfPocketRoutes(rp, 'c1', null)).toEqual({ rows: [], skipped: 4 })
  })

  it('notes + labels + tape run', () => {
    expect(floatShelfPartNote('fs:top')).toBe('build up then edge')
    expect(floatShelfPartNote('fs:cross_2')).toBe('build up then edge')
    expect(floatShelfPartNote('fs:cleat_b')).toMatch(/hand cut/)
    expect(floatShelfPartNote('back')).toBeNull()
    expect(floatShelfPartLabel('fs:cross_2')).toBe('Floating Shelf Cross Strip 2')
    const s = normaliseFloatShelf({ seen_left: true })!
    expect(fsTapeLength(s, 1200, 250)).toBe(1450)
  })

  it('never blocks other cabinets; blocks another shelf only at the same height', () => {
    const room = { room_dy: 2400, wall_cabinet_top: 2100 } as Room
    const shelf = { assembly_class: 'wall', dy: 33, float_shelf: {}, pos_z: 1400 }
    expect(cabsBlock(shelf, { assembly_class: 'wall', dy: 720 }, null, room)).toBe(false)
    expect(cabsBlock(shelf, { ...shelf, pos_z: 1420 }, null, room)).toBe(true)
    expect(cabsBlock(shelf, { ...shelf, pos_z: 1600 }, null, room)).toBe(false)
  })
})

describe('floating shelf — elevation height chain', () => {
  it('stacks gap + thickness per shelf above the cursor, in height order', async () => {
    const { stackShelfSegs } = await import('../../floatShelf')
    const segs: { fromY: number; toY: number; label: string }[] = []
    // Room 2570, cursor at the bench top (900); shelves 2130–2166 and 1730–1766.
    const y = stackShelfSegs(segs, 2570 - 900, 2570, [[2130, 2166], [1730, 1766]])
    expect(segs.map(s => s.label)).toEqual(['830', '36', '364', '36'])
    expect(y).toBe(2570 - 2166)
    // maxZ: only the shelves under the overheads.
    const s2: typeof segs = []
    stackShelfSegs(s2, 2570 - 900, 2570, [[2130, 2166], [1730, 1766]], 2000)
    expect(s2.map(s => s.label)).toEqual(['830', '36'])
  })
})
