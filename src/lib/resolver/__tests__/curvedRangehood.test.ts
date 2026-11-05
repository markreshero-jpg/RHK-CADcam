// z_curved_end C9: a rangehood in a curved wall end (WCRVFIXP) — hole in the
// bottom former, a rib locked at the shelf height (none below), flue notch in
// it, every rib above + the top former, the flue box built rib to rib.
import { describe, it, expect } from 'vitest'
import { calcCurvedEnd } from '../../curvedEnd/geometry'
import { curvedEndFootprint, curvedEndParams, DEFAULT_CURVED_END } from '../../curvedEnd/settings'
import { normaliseRangehood, type RangehoodSettings } from '../../rangehood'
import { spliceNotch } from '../../partCutouts'
import { clipOutlineX } from '../../shapePath'
import { DEFAULT_RULES, type CabinetInput, type JointTypeOp, type Material } from '../types'
import { resolveCabinet } from '../resolver'
import { resolveCurvedEnd } from '../resolveCurvedEnd'
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
  it('engine: one rib locked at the shelf, supports under it, the kit layout untouched without it', () => {
    const base = curvedEndParams(DEFAULT_CURVED_END, { DX: 900, DY: 700, DZ: 350 }, 18, 16.5)
    expect(calcCurvedEnd(base).levels).toEqual(calcCurvedEnd({ ...base, shelfAt: undefined }).levels)
    expect(calcCurvedEnd(base).shelfLevel).toBeUndefined()
    const c = calcCurvedEnd(curvedEndParams(DEFAULT_CURVED_END, { DX: 900, DY: 700, DZ: 350 }, 18, 16.5, 0, 350))
    expect(c.levels[0]).toBe(0)
    expect(c.levels[c.shelfLevel!]).toBe(350)
    expect(c.levels.at(-1)).toBeCloseTo(700 - 16.5)
    // Above the shelf the gaps keep under the kit's limit; under it too, evenly.
    expect(c.clear).toBeLessThan(c.maxGap)
    expect(c.shelfLevel).toBeGreaterThan(1)
    const under = c.levels.slice(0, c.shelfLevel! + 1)
    for (let i = 1; i < under.length; i++) {
      expect(under[i] - under[i - 1]).toBeCloseTo(350 / c.shelfLevel!)
      expect(under[i] - under[i - 1] - 16.5).toBeLessThan(c.maxGap)
    }
    expect(c.notes.some(n => /support ribs? under the rangehood shelf/.test(n))).toBe(true)
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

  it('notches the shelf rib, every rib above and the top with the flue', () => {
    const rp = resolveCabinet(wcrv())
    const ribs = ribsOf(rp)
    expect(ribs[0].Y).toBe(350)
    expect(ribs.every(r => r.Y >= 350)).toBe(true)   // the ones under are split (own test)
    const top = rp.case_parts.find(p => p.part_key === 'crv:top')!
    const depthOf = (p: typeof top) => p.DX - Math.min(...p.outline!.filter(q => q.x > 300 && q.x < 600).map(q => q.y))
    expect(depthOf(ribs[0])).toBeCloseTo(250)
    expect(depthOf(top)).toBeCloseTo(250 + 16.5)   // wall build: the top runs over the back to the wall
    for (const r of ribs.slice(1)) expect(depthOf(r)).toBeCloseTo(250)   // the flue only — the box stops at each rib
    // The curve survives the notch.
    for (const p of [ribs[0], top]) expect(p.outline!.some(q => q.b)).toBe(true)
    expect(rp.cutout_voids?.length).toBe(ribs.length + 1)
  })

  it('builds the flue box in segments rib to rib, shelf → top (RHK6581 WC-02: the front cover comes off)', () => {
    const rp = resolveCabinet(wcrv())
    const ribs = ribsOf(rp), top = rp.case_parts.find(p => p.part_key === 'crv:top')!
    expect(ribs.length).toBeGreaterThan(1)
    const lows = ribs, highs = [...ribs.slice(1), top]
    lows.forEach((lo, i) => {
      const s = i ? `_${i + 1}` : ''
      const L = rp.case_parts.find(p => p.part_key === `rh:flue_l${s}`)!
      const R = rp.case_parts.find(p => p.part_key === `rh:flue_r${s}`)!
      const F = rp.case_parts.find(p => p.part_key === `rh:flue_front${s}`)!
      for (const p of [L, R, F]) {
        expect(p.Y).toBeCloseTo(lo.Y + 16.5)
        expect(p.DX).toBeCloseTo(highs[i].Y - (lo.Y + 16.5))
      }
      expect(L.Z).toBeCloseTo(lo.Z + 250)
      expect(F.DY).toBe(233)
      expect(F.X + F.DY / 2).toBeCloseTo((16.5 + 900 - 18) / 2)
    })
    expect(rp.case_parts.filter(p => p.part_key.startsWith('rh:flue_front'))).toHaveLength(ribs.length)
  })

  it('splits the support ribs under the shelf left / right of the hole', () => {
    const rp = resolveCabinet(wcrv())
    const hole = rp.rangehood_hole!
    const L = rp.case_parts.filter(p => /^crv:rib_\d+_l$/.test(p.part_key))
    const R = rp.case_parts.filter(p => /^crv:rib_\d+_r$/.test(p.part_key))
    expect(L.length).toBeGreaterThan(0)
    expect(R.length).toBe(L.length)
    for (const p of [...L, ...R]) expect(p.Y).toBeLessThan(350)
    // No whole rib left under the shelf.
    expect(rp.case_parts.some(p => /^crv:rib_\d+$/.test(p.part_key) && p.Y < 350)).toBe(false)
    for (const p of L) {
      expect(p.X + p.DY).toBeCloseTo(hole.x0)
      expect(Math.max(...p.outline!.map(q => q.x))).toBeCloseTo(p.DY)
      expect(Math.min(...p.outline!.map(q => q.y))).toBeCloseTo(0)
      expect(Math.max(...p.outline!.map(q => q.y))).toBeCloseTo(p.DX)
    }
    for (const p of R) expect(p.X).toBeCloseTo(hole.x1)
    // RH: the right piece keeps the curve; the left one the straight fixing-panel side.
    expect(R[0].outline!.some(q => q.b)).toBe(true)
    // Seams: back trimmed to each piece, fixing panel on the left one only.
    const seams = resolveCurvedEnd(wcrv()).seams
    const key = L[0].part_key.replace(/_l$/, '')
    expect(seams.some(s => s.part_a_key === key)).toBe(false)
    const backL = seams.find(s => s.part_a_key === `${key}_l` && s.part_b_key === 'crv:back')!
    const backR = seams.find(s => s.part_a_key === `${key}_r` && s.part_b_key === 'crv:back')!
    expect(backL.geom.origin.x + backL.geom.length).toBeCloseTo(hole.x0)
    expect(backR.geom.origin.x).toBeCloseTo(hole.x1)
    expect(seams.some(s => s.part_a_key === `${key}_l` && s.part_b_key === 'crv:fix')).toBe(true)
    expect(seams.some(s => s.part_a_key === `${key}_r` && s.part_b_key === 'crv:fix')).toBe(false)
  })

  it('cuts the hole when it sits in front of where a chord would cross the curve (RHK6542 650 × 400 double)', () => {
    const rp = resolveCabinet(wcrv(normaliseRangehood({ hole: { w: 495, d: 265, setback: 50 }, shelf_h: 300 }),
      { hand: 'DOUBLE', R: 160, ribs: 1 }, { DX: 650, DY: 510, DZ: 400, footprint: curvedEndFootprint({ ...DEFAULT_CURVED_END, hand: 'DOUBLE', R: 160 }, { w: 650, d: 400 }) }))
    expect(rp.warnings.filter(w => w.code === 'RANGEHOOD')).toEqual([])
    expect(rp.case_parts.find(p => p.part_key === 'crv:bottom')!.cutouts).toHaveLength(1)
    expect(rp.case_parts.filter(p => /^crv:rib_1_[lr]$/.test(p.part_key))).toHaveLength(2)
  })

  it('rails each side of the hole, the support ribs halved into them (RHK6542 WC-01)', () => {
    const ce = { hand: 'DOUBLE' as const, R: 160, ribs: 1 }
    const cab = wcrv(normaliseRangehood({ hole: { w: 495, d: 265, setback: 50 }, shelf_h: 350 }), ce,
      { DX: 650, DY: 510, DZ: 400, footprint: curvedEndFootprint({ ...DEFAULT_CURVED_END, ...ce }, { w: 650, d: 400 }) })
    const rp = resolveCabinet(cab)
    const hole = rp.rangehood_hole!
    const part = (k: string) => rp.case_parts.find(p => p.part_key === k)!
    const L = part('crv:rh_rail_l'), R = part('crv:rh_rail_r')
    const bottom = part('crv:bottom'), shelf = rp.case_parts.find(p => p.part_key.startsWith('crv:rib_') && Math.abs(p.Y - bottom.Y - 350) < 0.01)!
    const ribsL = rp.case_parts.filter(p => /^crv:rib_\d+_l$/.test(p.part_key))
    expect(ribsL.length).toBeGreaterThan(0)
    for (const r of [L, R]) {
      expect(r.DZ).toBe(16.5)
      expect(r.DY).toBeCloseTo(70)
      expect(r.Y).toBeCloseTo(bottom.Y + 16.5)
      expect(r.Y + r.DX).toBeCloseTo(shelf.Y)
      expect(r.pockets).toHaveLength(ribsL.length)
      for (const k of r.pockets!) { expect(k.depth).toBeCloseTo(8.25); expect(k.y1 - k.y0).toBeCloseTo(16.5); expect(k.x1 - k.x0).toBeCloseTo(70) }
    }
    // Against the hole, never in it: left rail x0 − 16.5 … x0, right x1 … x1 + 16.5.
    expect(L.AY).toBe(-90); expect(L.X).toBeCloseTo(hole.x0)
    expect(R.AY).toBe(90); expect(R.X).toBeCloseTo(hole.x1)
    // Each housing at its rib's height (pocket y down from the rail top).
    for (const [k, rib] of ribsL.sort((a, b) => a.Y - b.Y).entries()) {
      const pk = [...L.pockets!].sort((a, b) => b.y0 - a.y0)[k]
      expect(L.Y + L.DX - pk.y1).toBeCloseTo(rib.Y)
    }
    // The rib's cut edge is notched back 8.25 over the rail's depth.
    const rib = ribsL[0]
    const xs = rib.outline!.map(q => q.x)
    expect(xs.some(x => Math.abs(x - (rib.DY - 8.25)) < 0.01)).toBe(true)
    // The rail sits inside the curve: its front corners are behind the rib's front there.
    const front = Math.min(L.Z + L.DY, 400)
    expect(front).toBeLessThanOrEqual(rib.Z + rib.DX + 0.01)
    expect(rp.warnings.filter(w => /rangehood rail/.test(w.message))).toEqual([])
  })

  it('fixes each segment down through the level above; only the first up through the shelf', () => {
    const one = {
      id: 'one', joint_type_id: 'one', operation_order: 0, target_part: 'part_b', machine_operation: 'drill', face: 'normal',
      tool_diameter_mm: 5, depth_mm: 16.7, offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: 0, qty: 1, spacing_mm: null, qty2: 1, spacing2_mm: null,
      router_tool_id: null, drill_id: null, auto_tool: true, notes: null, expressions: { qty: '1' },
    } as unknown as JointTypeOp
    const defaults = Object.fromEntries(['rh_flue:shelf', 'rh_flue:top', 'rh_flue:front', 'rh_flue:rib'].map(k => [k, 'one']))
    const rp = resolveCabinet(wcrv(rh, {}, { joint_defaults: defaults, joint_type_ops: { one: [one] }, joint_type_names: { one: 'screw' } } as Partial<CabinetInput>))
    const ribs = ribsOf(rp), top = rp.case_parts.find(p => p.part_key === 'crv:top')!
    const keys = rp.seam_joints.filter(s => s.declared && s.seam_key.includes('rh:flue')).map(s => s.seam_key)
    const into = (b: string) => keys.filter(k => k.startsWith('rh:flue') && k.endsWith(`|${b}`) && !k.includes('|rh:'))
    // The shelf: segment 1's three pieces only.
    expect(into(ribs[0].part_key).sort()).toEqual(['rh:flue_front', 'rh:flue_l', 'rh:flue_r'].map(k => `${k}|${ribs[0].part_key}`))
    // Each rib above + the top: the three pieces of the segment under it.
    ribs.slice(1).forEach((r, i) => expect(into(r.part_key).sort()).toEqual(['rh:flue_front', 'rh:flue_l', 'rh:flue_r'].map(k => `${k}_${i + 1 === 1 ? '' : i + 1}`.replace(/_$/, '') + `|${r.part_key}`)))
    expect(into(top.part_key)).toHaveLength(3)
    // No rib screws through the pieces any more; front → sides per segment.
    expect(keys.some(k => k.startsWith('crv:rib_'))).toBe(false)
    expect(keys.filter(k => /\|rh:flue_front/.test(k))).toHaveLength(2 * ribs.length)
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

describe('clipOutlineX', () => {
  // 100 × 50, front-right corner a quarter circle R 20 (centre 80, 20).
  const B = Math.tan(Math.PI / 8)
  const o = [{ x: 0, y: 0 }, { x: 80, y: 0, b: B }, { x: 100, y: 20 }, { x: 100, y: 50 }, { x: 0, y: 50 }]
  it('keeps the left of a line through the arc, the arc split on the circle', () => {
    const l = clipOutlineX(o, 90, 'lt')!
    expect(Math.max(...l.map(p => p.x))).toBeCloseTo(90)
    const onArc = l.find(p => p.x === 90 && p.y < 20)!
    expect(Math.hypot(onArc.x - 80, onArc.y - 20)).toBeCloseTo(20)
    expect(l.some(p => p.b)).toBe(true)
  })
  it('keeps the right piece with the rest of the arc', () => {
    const r = clipOutlineX(o, 90, 'gt')!
    expect(Math.min(...r.map(p => p.x))).toBeCloseTo(90)
    expect(r.some(p => p.b)).toBe(true)
    expect(clipOutlineX(o, 120, 'gt')).toBeNull()
  })
})

describe('wall build (WCRVFIXP: back + side blocks between the top and bottom)', () => {
  const T = 16.5
  it('runs the top / bottom to the wall and stands the back + side blocks between them', () => {
    const rp = resolveCabinet(wcrv(null, { blkS: true, blkF: true }))
    const part = (k: string) => rp.case_parts.find(p => p.part_key === k)!
    const bot = part('crv:bottom'), top = part('crv:top'), back = part('crv:back'), blk = part('crv:blk_side'), rib = part('crv:rib_1')
    expect(bot.Z).toBeCloseTo(0); expect(top.Z).toBeCloseTo(0)
    expect(Math.max(...bot.outline!.map(q => q.y))).toBeCloseTo(bot.DX)
    expect(rib.DX).toBeCloseTo(bot.DX - T)           // ribs still stop at the back
    expect(back.Y).toBeCloseTo(bot.Y + T)
    expect(back.DX).toBeCloseTo(top.Y - (bot.Y + T)) // height between them
    expect(blk.Y).toBeCloseTo(bot.Y + T)
    expect(blk.DX).toBeCloseTo(back.DX)
    // Side block notch in the ribs only; the front block stays full height.
    expect(bot.outline!.length).toBeLessThan(rib.outline!.length)
    expect(part('crv:blk_front').DX).toBeCloseTo(top.Y + T - bot.Y)
    expect(part('crv:fix').DX).toBeCloseTo(top.Y + T - bot.Y)
  })
  it('screws the back and side blocks through the bottom / top into their ends', () => {
    const seams = resolveCurvedEnd(wcrv(null, { blkS: true })).seams
    const s = (k: string) => seams.find(x => x.seam_key === k)!
    const bb = s('crv:back|crv:bottom'), bt = s('crv:back|crv:top')
    expect(bb.geom.bore_b).toEqual({ axis: 'y-', at: 16.5 })
    expect(bb.geom.origin.y).toBeCloseTo(T)
    expect(bt.geom.bore_b?.axis).toBe('y-')
    expect(s('crv:blk_side|crv:bottom').geom.bore_b?.axis).toBe('y-')
    expect(seams.some(x => x.seam_key === 'crv:bottom|crv:back')).toBe(false)
    expect(seams.some(x => x.seam_key === 'crv:rib_1|crv:back')).toBe(true)
    expect(s('crv:back|crv:fix').geom.length).toBeCloseTo(s('crv:face|crv:blk_side').geom.length)
  })
  it('leaves a base curved end on the kit build', () => {
    const rp = resolveCabinet(wcrv(null, {}, { assembly_class: 'base' }))
    const bot = rp.case_parts.find(p => p.part_key === 'crv:bottom')!, back = rp.case_parts.find(p => p.part_key === 'crv:back')!
    expect(back.Y).toBeCloseTo(bot.Y)
    expect(bot.Z).toBeCloseTo(T)
  })
})
