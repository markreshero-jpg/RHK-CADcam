// z_curved_end C9: a rangehood in a curved wall end (WCRVFIXP) — hole in the
// bottom former, a rib locked at the shelf height (none below), flue notch in
// it + the top former, ribs above notched round the flue box, the box itself.
import { describe, it, expect } from 'vitest'
import { calcCurvedEnd } from '../../curvedEnd/geometry'
import { curvedEndFootprint, curvedEndParams, DEFAULT_CURVED_END } from '../../curvedEnd/settings'
import { normaliseRangehood, type RangehoodSettings } from '../../rangehood'
import { spliceNotch } from '../../partCutouts'
import { DEFAULT_RULES, type CabinetInput, type Material } from '../types'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'

const carcass: Material = { id: 'carcass', name: 'C16', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const exposed: Material = { id: 'face', name: 'F18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const rh = normaliseRangehood({ hole: { w: 500, d: 260, setback: 40 } })!

function wcrv(rangehood: RangehoodSettings | null = rh, ce: Partial<typeof DEFAULT_CURVED_END> = {}, o: Partial<CabinetInput> = {}): CabinetInput {
  const curved_end = { ...DEFAULT_CURVED_END, ...ce }
  return {
    id: 'w1', assembly_class: 'wall', DX: 900, DY: 700, DZ: 350,
    has_carcass: false, has_internal: false, has_face: false, has_toekick: false,
    left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
    material: carcass, door_material: exposed, shelf_material: carcass, exposed_material: exposed,
    toekick_face_material: carcass, toekick_interior_material: carcass,
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    face_grid: { rows: [], cols: [], zones: [] },
    internal_tree: { type: 'open', fittings: [] },
    footprint: curvedEndFootprint(curved_end, { w: 900, d: 350 }),
    rangehood, ...o, curved_end,
  } as CabinetInput
}
const ribsOf = (rp: ReturnType<typeof resolveCabinet>) =>
  rp.case_parts.filter(p => /^crv:rib_\d+$/.test(p.part_key)).sort((a, b) => a.Y - b.Y)

describe('curved end rangehood (C9)', () => {
  it('engine: one rib locked at the shelf, none below, the kit layout untouched without it', () => {
    const base = curvedEndParams(DEFAULT_CURVED_END, { DX: 900, DY: 700, DZ: 350 }, 18, 16.5)
    expect(calcCurvedEnd(base).levels).toEqual(calcCurvedEnd({ ...base, shelfAt: undefined }).levels)
    const c = calcCurvedEnd(curvedEndParams(DEFAULT_CURVED_END, { DX: 900, DY: 700, DZ: 350 }, 18, 16.5, 0, 350))
    expect(c.levels[0]).toBe(0)
    expect(c.levels[1]).toBe(350)
    expect(c.levels.at(-1)).toBeCloseTo(700 - 16.5)
    // Above the shelf the gaps keep under the kit's limit.
    expect(c.clear).toBeLessThan(c.maxGap)
    expect(c.notes.some(n => /No ribs under the rangehood shelf/.test(n))).toBe(true)
    // A shelf that can't fit blocks, and the kit layout stays.
    const bad = calcCurvedEnd(curvedEndParams(DEFAULT_CURVED_END, { DX: 900, DY: 700, DZ: 350 }, 18, 16.5, 0, 690))
    expect(bad.warnings.some(w => /rangehood shelf/.test(w))).toBe(true)
  })

  it('cuts the hole in the bottom former, centred on the inside, set back from the face board', () => {
    const rp = resolveCabinet(wcrv())
    expect(rp.warnings.filter(w => w.code === 'RANGEHOOD' || w.code === 'CUTOUT_SKIPPED')).toEqual([])
    const bot = rp.case_parts.find(p => p.part_key === 'crv:bottom')!
    expect(bot.cutouts).toHaveLength(1)
    const xs = bot.cutouts![0].pts.map(p => bot.X + p.x), ys = bot.cutouts![0].pts.map(p => p.y)
    const centre = (16.5 + 900 - 18) / 2
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(centre)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(500)
    // y from the former's front edge (Z + DX = D − SK): hole front at D − FT − 40.
    expect(bot.Z + bot.DX - Math.min(...ys)).toBeCloseTo(350 - 18 - 40)
    expect(rp.rangehood_hole).toEqual({ x0: centre - 250, x1: centre + 250, z0: 350 - 58 - 260, z1: 292 })
  })

  it('notches the shelf rib and the top, and every rib above round the box', () => {
    const rp = resolveCabinet(wcrv())
    const ribs = ribsOf(rp)
    expect(ribs[0].Y).toBe(350)
    expect(ribs.every(r => r.Y >= 350)).toBe(true)
    const top = rp.case_parts.find(p => p.part_key === 'crv:top')!
    const depthOf = (p: typeof top) => p.DX - Math.min(...p.outline!.filter(q => q.x > 300 && q.x < 600).map(q => q.y))
    expect(depthOf(ribs[0])).toBeCloseTo(250)
    expect(depthOf(top)).toBeCloseTo(250)
    for (const r of ribs.slice(1)) expect(depthOf(r)).toBeCloseTo(250 + 16.5 + 1)
    // The curve survives the notch.
    for (const p of [ribs[0], top]) expect(p.outline!.some(q => q.b)).toBe(true)
    expect(rp.cutout_voids?.length).toBe(ribs.length + 1)
  })

  it('builds the flue box shelf → top, screwed into the rib and the top former', () => {
    const rp = resolveCabinet(wcrv())
    const shelf = ribsOf(rp)[0], top = rp.case_parts.find(p => p.part_key === 'crv:top')!
    const L = rp.case_parts.find(p => p.part_key === 'rh:flue_l')!
    const F = rp.case_parts.find(p => p.part_key === 'rh:flue_front')!
    expect(L.Y).toBe(350 + 16.5)
    expect(L.DX).toBeCloseTo(top.Y - (350 + 16.5))
    expect(L.Z).toBeCloseTo(shelf.Z + 250)
    expect(F.DY).toBe(233)
    expect(F.X + F.DY / 2).toBeCloseTo((16.5 + 900 - 18) / 2)
    expect(rp.case_parts.some(p => p.part_key === 'rh:flue_r')).toBe(true)
  })

  it('mirrors for a left-hand curve', () => {
    const rp = resolveCabinet(wcrv(rh, { hand: 'LH' }))
    expect(rp.warnings.filter(w => w.code === 'RANGEHOOD' || w.code === 'CUTOUT_SKIPPED')).toEqual([])
    const F = rp.case_parts.find(p => p.part_key === 'rh:flue_front')!
    expect(F.X + F.DY / 2).toBeCloseTo((18 + 900 - 16.5) / 2)
  })

  it('warns instead of cutting into the curve', () => {
    const off = normaliseRangehood({ hole: { w: 500, d: 260, setback: 40, offset: 250 }, flue: { offset: 330 } })!
    const rp = resolveCabinet(wcrv(off))
    const msgs = rp.warnings.filter(w => w.code === 'RANGEHOOD').map(w => w.message).join(' | ')
    expect(msgs).toMatch(/hole runs past/)
    expect(msgs).toMatch(/flue box/)
    expect(rp.case_parts.some(p => p.part_key === 'rh:flue_l')).toBe(false)
  })
})

describe('spliceNotch', () => {
  // 100 × 50 part, front-right corner rounded (front at y 0, back at y 50).
  const B = Math.tan(Math.PI / 8)
  const o = [{ x: 0, y: 0 }, { x: 80, y: 0, b: B }, { x: 100, y: 20 }, { x: 100, y: 50 }, { x: 0, y: 50 }]
  it('cuts a back notch into the straight back edge', () => {
    const n = spliceNotch(o, 100, 50, { x0: 30, x1: 60, y0: 20, y1: 51 }, 'back')!
    expect(n).toHaveLength(9)
    expect(n.filter(p => p.y === 20 && (p.x === 30 || p.x === 60))).toHaveLength(2)
    expect(n.some(p => p.b)).toBe(true)
  })
  it('refuses a notch that reaches the curve', () => {
    expect(spliceNotch(o, 100, 50, { x0: 70, x1: 99, y0: 5, y1: 51 }, 'back')).toBeNull()
  })
})
