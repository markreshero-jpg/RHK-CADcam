import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver/resolver'
import { mergeRules } from '../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material } from '../resolver/types'
import { normalisePartCutouts, normaliseCutoutList, customPartCuts, cutoutPartInfo, previewCutouts, holeLoop, notchOutline, applyPartCutouts, cutoutTargets, type Cutout } from '../partCutouts'
import { buildFormulaScope } from '../formula/context'
import { attachShape, cutoutsToOp, shapeFrameFor } from '../optimiser/shapes'
import { partShapes } from '../partSolids'
import { sampleOutline, type OutlinePt } from '../shapePath'

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
    const rp = resolveCabinet(cab({ case_bottom: [hole()] }))
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
    const rp = resolveCabinet(cab({ case_bottom: [hole()] }))
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
      case_full_top: [
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
      case_bottom: [hole({ id: 'big', w: 900 }), hole({ id: 'bad', w: 'nope.x' }), hole({ id: 'n', kind: 'notch' })],
      case_left_side: [hole({ id: 'g' })],
    }))
    const msgs = rp.warnings.filter(w => w.code === 'CUTOUT_SKIPPED').map(w => w.message)
    expect(msgs).toHaveLength(4)
    expect(msgs.some(m => /n on case_bottom: pick the edge/.test(m))).toBe(true)
    expect(msgs.some(m => /big on case_bottom: runs off/.test(m))).toBe(true)
    expect(msgs.some(m => /bad on case_bottom: width/.test(m))).toBe(true)
    expect(msgs.some(m => /g on case_left_side: .*not supported/.test(m))).toBe(true)
    expect(rp.case_parts.find(p => p.part_key === 'bottom')!.cutouts).toBeUndefined()
  })
})

// z_rangehood R2: notches open to an edge, cut into the outline.
const shelfCab = (part_cutouts: Record<string, Cutout[]>) => ({
  ...cab(part_cutouts), has_internal: true,
  internal_tree: { type: 'open', fittings: [{ type: 'fixed_shelf', y_locked: false }] },
}) as unknown as CabinetInput
const notch = (o: Partial<Cutout> = {}): Cutout => ({
  id: 'flue', kind: 'notch', shape: 'rect', w: 200, d: 250, edge: 'back',
  x: { from: 'centre', off: 0 }, y: { from: 'back', off: 0 }, source: 'user', ...o,
})
const area = (pts: { x: number; y: number }[]) =>
  pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y }, 0) / 2

describe('part cut-outs (R2 notches)', () => {
  it('notches the fixed shelf and the top from the back, centred', () => {
    const rp = resolveCabinet(shelfCab({ int_fixed_shelf_0: [notch()], case_full_top: [notch()] }))
    expect(rp.warnings.filter(w => w.code === 'CUTOUT_SKIPPED')).toEqual([])
    const shelf = rp.internal_parts.find(p => p.part_type === 'fixed_shelf')!
    const top = rp.case_parts.find(p => p.part_key === 'full_top')!
    for (const p of [shelf, top]) {
      const W = p.DY, D = p.DX, o = p.outline!
      expect(o).toHaveLength(8)
      expect(area(o)).toBeCloseTo(W * D - 200 * 250)   // counter-clockwise, notch gone
      const x0 = (W - 200) / 2
      expect(o).toEqual(expect.arrayContaining([{ x: x0, y: D }, { x: x0, y: D - 250 }, { x: x0 + 200, y: D - 250 }, { x: x0 + 200, y: D }]))
    }
    expect(partShapes(rp).get('int_fixed_shelf_0')!.pts.length).toBeGreaterThanOrEqual(8)
  })

  it('holes go in after the notch, on the same outline', () => {
    const rp = resolveCabinet(cab({ case_bottom: [notch({ edge: 'front', y: { from: 'front', off: 0 }, d: 40 }), hole()] }))
    const bot = rp.case_parts.find(p => p.part_key === 'bottom')!
    expect(bot.outline).toHaveLength(8)
    expect(bot.cutouts).toHaveLength(1)
  })

  it('a corner notch, two on one edge, and side notches', () => {
    const rp = resolveCabinet(cab({ case_full_top: [
      notch({ id: 'a', w: 50, d: 50, x: { from: 'left', off: 0 } }),
      notch({ id: 'b', w: 60, d: 30, x: { from: 'right', off: 100 } }),
      notch({ id: 'c', edge: 'left', w: 20, d: 80, y: { from: 'front', off: 100 } }),
    ] }))
    expect(rp.warnings.filter(w => w.code === 'CUTOUT_SKIPPED')).toEqual([])
    const top = rp.case_parts.find(p => p.part_key === 'full_top')!
    expect(area(top.outline!)).toBeCloseTo(top.DY * top.DX - 50 * 50 - 60 * 30 - 20 * 80)
    expect(top.outline!.length).toBe(4 + 2 + 4 + 4)   // corner notch adds 2 corners
  })

  it('warns when notches would cut the part in two', () => {
    const rp = resolveCabinet(cab({ case_full_top: [notch({ id: 'a', d: 200 }), notch({ id: 'b', d: 200, edge: 'front' })] }))
    expect(rp.warnings.some(w => /cut the part in two/.test(w.message))).toBe(true)
    expect(rp.case_parts.find(p => p.part_key === 'full_top')!.outline).toBeUndefined()
  })

  it('keeps edge tags on what is left of a tagged edge', () => {
    const o = notchOutline(100, 50, [{ x: 0, y: 0, e: 'top' }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }],
      [{ x0: 40, x1: 60, y0: -1, y1: 10 }])!
    expect(o.filter(p => p.e === 'top')).toHaveLength(2)
    expect(o).toHaveLength(8)
  })
})

// z_rangehood R3: cut-outs on a flat custom part (the WUP's Under Panel).
describe('part cut-outs (R3 custom parts)', () => {
  const panel = { id: 'up', orientation: 'flat', dx: 330, dy: 1200, dz: 18 }   // 1200 long, 330 deep
  it('cuts a hole + notch into a flat custom part, in the carcass-bottom frame', () => {
    const cut = customPartCuts(panel, [hole({ x: { from: 'left', off: 50 } }), notch({ id: 'pipe', w: 60, d: 40 })])
    expect(cut.warnings).toEqual([])
    expect(cut.outline).toHaveLength(8)
    expect(area(cut.outline!)).toBeCloseTo(1200 * 330 - 60 * 40)
    expect(cut.cutouts).toHaveLength(1)
    const b = bbox(cut.cutouts![0].pts)
    expect([b.x0, b.x1, b.y0, b.y1]).toEqual([50, 550, 30, 280])
    // Optimiser: same op frame as a carcass bottom (swap), so the 250 runs along DX.
    const op = cutoutsToOp(cut.cutouts, { frame: shapeFrameFor('custom_parts', 'flat', 'custom_up'), DX: 330, DY: 1200 })!
    const ob = bbox(op.cut_holes[0])
    expect(ob.x1 - ob.x0).toBeCloseTo(250)
    expect(ob.y1 - ob.y0).toBeCloseTo(500)
    // 3D: partShapes picks the outline + hole up off the resolved custom part.
    const rp = resolveCabinet(cab({}))
    rp.custom_parts = [{ ...panel, outline: cut.outline, cutouts: cut.cutouts } as unknown as NonNullable<typeof rp.custom_parts>[number]]
    expect(partShapes(rp).get('custom_up')!.holes).toHaveLength(1)
  })

  it('no cut-outs → nothing; formulas; standing parts warn', () => {
    expect(customPartCuts(panel, [])).toEqual({ outline: null, cutouts: null, warnings: [] })
    const rp = resolveCabinet(cab({}))
    const f = customPartCuts(panel, [hole({ w: 'cab.w - 100' })], buildFormulaScope(rp, cab({})))
    expect(f.warnings).toEqual([])
    const fb = bbox(f.cutouts![0].pts)
    expect(fb.x1 - fb.x0).toBeCloseTo(500)
    const front = customPartCuts({ ...panel, orientation: 'front' }, [hole()])
    expect(front.outline).toBeNull()
    expect(front.warnings[0].message).toMatch(/not supported yet/)
  })

  // WF-L wall filler (RHK6595 WC-10, Mark 2026-11-07): a side panel 436 deep x 690
  // tall with the back-top corner notched out, leaving a 70 front leg + 70 bottom leg.
  it('notches a side part into an L, written in the gable frame', () => {
    const fil = { id: 'wfl', orientation: 'side', dx: 436, dy: 690, dz: 18 }
    const L = notch({ id: 'L', edge: 'back', w: 'cab.h - 70', d: 'cab.d - 70', x: { from: 'right', off: 0 }, y: { from: 'back', off: 0 } })
    const rp = resolveCabinet(cab({}))
    const ci = cab({})
    const scope = buildFormulaScope(rp, ci)
    const H = ci.DY, D = ci.DZ   // cab.h / cab.d
    const cut = customPartCuts({ ...fil, dx: D, dy: H }, [L], scope)
    expect(cut.warnings).toEqual([])
    expect(cut.outline).toHaveLength(6)
    expect(area(cut.outline!)).toBeCloseTo(70 * H + 70 * D - 70 * 70)
    // Gable frame: x = depth from the back, y = down from the top. The front
    // leg runs the full height at x = D − 70..D, the bottom leg the full depth.
    const b = bbox(cut.outline!)
    expect([b.x0, b.x1, b.y0, b.y1]).toEqual([0, D, 0, H])
    const has = (x: number, y: number) => cut.outline!.some(p => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01)
    expect(has(D - 70, 0)).toBe(true)        // top of the front leg, inside corner side
    expect(has(D - 70, H - 70)).toBe(true)   // the L's inside corner
    expect(has(0, H - 70)).toBe(true)        // back end of the bottom leg
    // 3D picks it up with tagged edges (front = right, bottom = bottom) for the tape.
    rp.custom_parts = [{ ...fil, dx: D, dy: H, outline: cut.outline } as unknown as NonNullable<typeof rp.custom_parts>[number]]
    const s = partShapes(rp).get('custom_wfl')!
    expect(s.edges!.some(e => e.e === 'right')).toBe(true)
    expect(s.edges!.some(e => e.e === 'bottom')).toBe(true)
    // Optimiser: side frame, no swap.
    expect(shapeFrameFor('custom_parts', 'side', 'custom_wfl').swap).toBe(false)
  })

  it('normalises the stored list', () => {
    expect(normaliseCutoutList(null)).toEqual([])
    expect(normaliseCutoutList([{ kind: 'notch', edge: 'back', w: 200, d: 250 }])[0]).toMatchObject({ id: 'c1', kind: 'notch', edge: 'back' })
  })
})

// z_rangehood R4: what the Cabinet Edit cut-outs panel reads.
describe('cut-outs editor helpers (R4)', () => {
  it('says which parts take cut-outs, and their size in the cut-out frame', () => {
    const rp = resolveCabinet(shelfCab({}))
    rp.custom_parts = [
      { id: 'up', orientation: 'flat', dx: 330, dy: 1200, dz: 18 },
      { id: 'ep', orientation: 'side', dx: 330, dy: 700, dz: 18 },
    ] as unknown as NonNullable<typeof rp.custom_parts>
    const bot = rp.case_parts.find(p => p.part_key === 'bottom')!
    expect(cutoutPartInfo(rp, 'case_bottom')).toEqual({ W: bot.DY, D: bot.DX, DZ: bot.DZ, holes: true })
    expect(cutoutPartInfo(rp, 'int_fixed_shelf_0')!.holes).toBe(false)
    expect(cutoutPartInfo(rp, 'custom_up')).toEqual({ W: 1200, D: 330, DZ: 18, holes: true })
    // Side customs take them too (WF-L): W = its height (dy), D = its depth (dx).
    expect(cutoutPartInfo(rp, 'custom_ep')).toEqual({ W: 700, D: 330, DZ: 18, holes: true })
    expect(cutoutPartInfo(rp, 'case_left_side')).toBeNull()
  })

  it('previews like the resolve cuts', () => {
    const pv = previewCutouts(600, 300, 16.5, false, [notch(), hole()])
    expect(pv.outline).toHaveLength(8)
    expect(pv.cutouts).toEqual([])
    expect(pv.warnings[0].message).toMatch(/^Cut-out rh on p: holes on this part/)
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

// z_rangehood R11: plumbing U notch in a drawer box bottom (RHK6586 vanity).
describe('part cut-outs (R11 drawer bottoms, rounded notches)', () => {
  const uNotch = (o: Partial<Cutout> = {}): Cutout => ({
    id: 'pl', kind: 'notch', shape: 'rect', w: 180, d: 210, radius: 90, edge: 'back',
    x: { from: 'centre', off: 0 }, y: { from: 'back', off: 0 }, source: 'user', ...o,
  })
  const stack = () => ({
    face_zone_row: 1, face_zone_col: 0,
    box_parts: [
      { part_type: 'db_bottom', DX: 375, DY: 592, DZ: 16.5 },
      { part_type: 'db_back', DX: 166, DY: 580, DZ: 16.5 },
    ] as { part_type: string; DX: number; DY: number; DZ: number; outline?: OutlinePt[]; cutouts?: { pts: OutlinePt[]; skin: number }[] }[],
  })

  it('targets the drawer bottom by its stack id', () => {
    const s = stack()
    const t = cutoutTargets([], [], [s])
    expect(t.map(x => x.id)).toEqual(['db_1_0_db_bottom'])
  })

  it('cuts a U from the back edge with 90 radius front corners', () => {
    const s = stack()
    const warn = applyPartCutouts(cutoutTargets([], [], [s]), { db_1_0_db_bottom: [uNotch()] })
    expect(warn).toEqual([])
    const o = s.box_parts[0].outline!
    const pts = sampleOutline(o, 1)
    const b = bbox(pts)
    expect(b).toEqual({ x0: 0, x1: 592, y0: 0, y1: 375 })
    // The U: 180 wide centred (206..386), 210 deep from the back (165..375).
    const inU = (x: number, y: number) => {
      let inside = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], c = pts[j]
        if ((a.y > y) !== (c.y > y) && x < (c.x - a.x) * (y - a.y) / (c.y - a.y) + a.x) inside = !inside
      }
      return !inside
    }
    expect(inU(296, 300)).toBe(true)        // middle of the U
    expect(inU(296, 170)).toBe(true)        // front of the round end, on the centre line
    expect(inU(296, 160)).toBe(false)       // board in front of it
    expect(inU(210, 170)).toBe(false)       // the radius leaves board in the corner
    expect(inU(200, 300)).toBe(false)       // board beside it
    // Two arcs (negative bulge = concave), meeting on the centre line (radius = half the width).
    expect(o.filter(p => p.b).map(p => Math.sign(p.b!))).toEqual([-1, -1])
    // Back edge only drawn either side of the U.
    expect(o.some(p => Math.abs(p.x - 296) < 0.01 && Math.abs(p.y - 165) < 0.01)).toBe(true)
  })

  it('reaches the 3D shapes and the optimiser frame', () => {
    const s = stack()
    applyPartCutouts(cutoutTargets([], [], [s]), { db_1_0_db_bottom: [uNotch()] })
    const rp = { case_parts: [], toekick_parts: [], face_zones: [], internal_parts: [], drawer_stacks: [s] } as unknown as Parameters<typeof partShapes>[0]
    expect(partShapes(rp).get('db_1_0_db_bottom')!.pts.length).toBeGreaterThan(8)
    expect(shapeFrameFor('drawer_box_parts', 'db_bottom', 'db_1_0_db_bottom')).toEqual(shapeFrameFor('case_parts', 'bottom', 'case_bottom'))
    // The optimiser nests it from the row's outline, U included (op frame = DX × DY).
    const op = attachShape(undefined, 375, 592, { frame: shapeFrameFor('drawer_box_parts', 'db_bottom', 'db_1_0_db_bottom'), DX: 375, DY: 592, transpose: false }, s.box_parts[0].outline!, undefined as never)
    expect(op.shape?.source).toBe('resolver')
    expect(op.shape!.op_polygon.length).toBeGreaterThan(8)
    expect(Math.min(...op.shape!.op_polygon.map(p => p.x))).toBeCloseTo(0)
    expect(cutoutPartInfo({ case_parts: [], internal_parts: [], custom_parts: [], drawer_stacks: [s] } as never, 'db_1_0_db_bottom'))
      .toEqual({ W: 592, D: 375, DZ: 16.5, holes: true })
  })

  it('a smaller radius keeps a flat run at the end; square without one', () => {
    const s = stack()
    applyPartCutouts(cutoutTargets([], [], [s]), { db_1_0_db_bottom: [uNotch({ radius: 30 })] })
    expect(s.box_parts[0].outline!.filter(p => p.b)).toHaveLength(2)
    const s2 = stack()
    applyPartCutouts(cutoutTargets([], [], [s2]), { db_1_0_db_bottom: [uNotch({ radius: 0 })] })
    expect(s2.box_parts[0].outline!.some(p => p.b)).toBe(false)
    expect(s2.box_parts[0].outline!).toHaveLength(8)
  })
})
