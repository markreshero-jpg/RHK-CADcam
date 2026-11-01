import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver/resolver'
import { mergeRules } from '../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material } from '../resolver/types'
import { normalisePartCutouts, holeLoop, type Cutout } from '../partCutouts'
import { cutoutsToOp, shapeFrameFor } from '../optimiser/shapes'
import { partShapes } from '../partSolids'
import { sampleOutline } from '../shapePath'

// z_rangehood R1: holes on a carcass's horizontal parts.
const board: Material = { id: 'm', name: 'B16', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const cab = (part_cutouts: Record<string, Cutout[]>) => ({
  id: 'c', assembly_class: 'wall', DX: 600, DY: 700, DZ: 330, has_carcass: true, has_internal: false, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board, toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES), top_type: 'full_top', face_grid: { rows: [], cols: [], zones: [] },
  internal_tree: { type: 'open', fittings: [] }, joint_defaults: {}, joint_type_ops: {}, joint_type_names: {},
  part_cutouts,
}) as unknown as CabinetInput

const hole = (o: Partial<Cutout> = {}): Cutout => ({
  id: 'rh', kind: 'hole', shape: 'rect', w: 500, d: 250, radius: 0,
  x: { from: 'centre', off: 0 }, y: { from: 'front', off: 30 }, depth: null, source: 'user', ...o,
})
const bbox = (pts: { x: number; y: number }[]) => ({
  x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)),
  y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)),
})

describe('part cut-outs (R1 holes)', () => {
  it('cuts a centred hole through the bottom and gives it a rectangle outline', () => {
    const rp = resolveCabinet(cab({ bottom: [hole()] }))
    const bot = rp.case_parts.find(p => p.part_key === 'bottom')!
    expect(bot.outline).toEqual([{ x: 0, y: 0 }, { x: bot.DY, y: 0 }, { x: bot.DY, y: bot.DX }, { x: 0, y: bot.DX }])
    expect(bot.cutouts).toHaveLength(1)
    expect(bot.cutouts![0].skin).toBe(0)
    const b = bbox(bot.cutouts![0].pts)
    expect(b.x1 - b.x0).toBeCloseTo(500)
    expect((b.x0 + b.x1) / 2).toBeCloseTo(bot.DY / 2)
    expect(b.y0).toBeCloseTo(30)
    expect(b.y1).toBeCloseTo(280)
    expect(rp.warnings.filter(w => w.code === 'CUTOUT_SKIPPED')).toEqual([])
    // Other parts untouched.
    expect(rp.case_parts.find(p => p.part_key === 'full_top')!.cutouts).toBeUndefined()
  })

  it('reaches the optimiser and the 3D shapes', () => {
    const rp = resolveCabinet(cab({ bottom: [hole()] }))
    const bot = rp.case_parts.find(p => p.part_key === 'bottom')!
    const op = cutoutsToOp(bot.cutouts, { frame: shapeFrameFor('case_parts', 'bottom', 'case_bottom'), DX: bot.DX, DY: bot.DY })!
    expect(op.cut_holes).toHaveLength(1)
    const b = bbox(op.cut_holes[0])
    // Op frame = DX × DY: the hole's 250 depth runs along DX, its 500 width along DY.
    expect(b.x1 - b.x0).toBeCloseTo(250)
    expect(b.y1 - b.y0).toBeCloseTo(500)
    expect(partShapes(rp).get('case_bottom')!.holes).toHaveLength(1)
  })

  it('takes formulas, pockets, rounded corners and circles', () => {
    const rp = resolveCabinet(cab({
      full_top: [
        hole({ id: 'a', w: 'cab.w - 200', d: 100, radius: 20, depth: 10 }),
        hole({ id: 'b', shape: 'circle', w: 150, x: { from: 'left', off: 20 }, y: { from: 'back', off: 20 } }),
      ],
    }))
    const top = rp.case_parts.find(p => p.part_key === 'full_top')!
    expect(top.cutouts).toHaveLength(2)
    const a = bbox(sampleOutline(top.cutouts![0].pts))
    expect(a.x1 - a.x0).toBeCloseTo(400, 0)
    expect(top.cutouts![0].skin).toBeCloseTo(6.5)
    const c = bbox(sampleOutline(top.cutouts![1].pts))
    expect(c.x0).toBeCloseTo(20, 0)
    expect(c.x1 - c.x0).toBeCloseTo(150, 0)
    expect(c.y1).toBeCloseTo(top.DX - 20, 0)
    expect(c.y1 - c.y0).toBeCloseTo(150, 0)
  })

  it('warns instead of cutting what it cannot', () => {
    const rp = resolveCabinet(cab({
      bottom: [hole({ id: 'big', w: 900 }), hole({ id: 'bad', w: 'nope.x' }), hole({ id: 'n', kind: 'notch', edge: 'back' })],
      left_side: [hole({ id: 'g' })],
    }))
    const msgs = rp.warnings.filter(w => w.code === 'CUTOUT_SKIPPED').map(w => w.message)
    expect(msgs).toHaveLength(4)
    expect(msgs.some(m => /big on bottom: runs off/.test(m))).toBe(true)
    expect(msgs.some(m => /bad on bottom: width/.test(m))).toBe(true)
    expect(msgs.some(m => /g on left_side: .*not supported/.test(m))).toBe(true)
    expect(rp.case_parts.find(p => p.part_key === 'bottom')!.cutouts).toBeUndefined()
  })
})

describe('normalisePartCutouts', () => {
  it('cleans stored jsonb', () => {
    expect(normalisePartCutouts(null)).toEqual({})
    expect(normalisePartCutouts({ bottom: 'x', top: [] })).toEqual({})
    const n = normalisePartCutouts({ bottom: [{ w: '500', d: 'cab.d - 80', depth: 0, x: { from: 'left', off: 10 } }] })
    expect(n.bottom[0]).toMatchObject({ id: 'c1', kind: 'hole', shape: 'rect', w: 500, d: 'cab.d - 80', depth: null,
      x: { from: 'left', off: 10 }, y: { from: 'centre', off: 0 }, source: 'user' })
  })

  it('rounded corners stay inside the rectangle', () => {
    const b = bbox(sampleOutline(holeLoop(10, 20, 100, 50, 'rect', 25)))
    expect(b.x0).toBeCloseTo(10); expect(b.x1).toBeCloseTo(110)
    expect(b.y0).toBeCloseTo(20); expect(b.y1).toBeCloseTo(70)
  })
})
