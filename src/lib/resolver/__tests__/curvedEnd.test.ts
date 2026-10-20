// Curved end C2: engine parts → cabinet-frame case parts (resolveCurvedEnd).
// The shapes themselves are proven against the kit fixtures (curvedEnd/__tests__);
// this checks the placement: every part lands where the kit's plan puts it,
// for RH, LH (mirrored) and DOUBLE.
import { describe, it, expect } from 'vitest'
import { calcCurvedEnd, CURVED_END_DEFAULTS, type CurvedEndParams } from '../../curvedEnd/geometry'
import { curvedEndCaseParts, curvedEndPartLabel } from '../resolveCurvedEnd'
import { caseBoxAABB, casePlanCorners } from '../../jointDrilling'
import { isShapedPanelKey } from '../../cabinetShape/partKeys'
import { curvedEndFootprint, normaliseCurvedEnd, curvedEndCode, DEFAULT_CURVED_END } from '../../curvedEnd/settings'
import { footprintOutline } from '../../cabinetShape/footprint'
import { DEFAULT_RULES, type CabinetInput, type Material, type ResolvedCasePart } from '../types'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { buildPersistPayload } from '../persistResolved'

const parts = (p: Partial<CurvedEndParams>, grain: 'vertical' | 'horizontal' = 'vertical') =>
  curvedEndCaseParts(calcCurvedEnd(p), 'face', 'carcass', grain)
const byKey = (ps: ResolvedCasePart[]) => Object.fromEntries(ps.map(q => [q.part_key, q]))
const r1 = (v: number) => Math.round(v * 10) / 10 + 0   // + 0: no -0
// [x0, x1, z0, z1] of a part's plan bounds
const plan = (q: ResolvedCasePart) => { const b = caseBoxAABB(q); return [r1(b.x), r1(b.x + b.w), r1(b.z), r1(b.z + b.d)] }

describe('curved end case parts', () => {
  const { W, D, H, FT, T, SK } = CURVED_END_DEFAULTS   // 170 × 500 × 500, R150, FT 18, T 16.5, SK 2

  it('RH: keys, materials and the flat face board blank', () => {
    const ps = parts({ hand: 'RH' }), k = byKey(ps)
    expect(ps.map(q => q.part_key)).toEqual(['crv:face', 'crv:fix', 'crv:back', 'crv:bottom', 'crv:rib_1', 'crv:rib_2', 'crv:top'])
    expect(k['crv:face'].material_id).toBe('face')
    expect(ps.filter(q => q.part_key !== 'crv:face').every(q => q.material_id === 'carcass')).toBe(true)
    // vertical grain: DY (with the grain) = height, DX = the flat wrap length
    expect([k['crv:face'].DX, k['crv:face'].DY, k['crv:face'].DZ]).toEqual([605.62, H, FT])
    const hz = byKey(parts({ hand: 'RH' }, 'horizontal'))['crv:face']
    expect([hz.DX, hz.DY]).toEqual([H, 605.62])
    expect(hz.grain_direction).toBe('horizontal')
  })

  it('RH: every part sits where the kit plan puts it', () => {
    const k = byKey(parts({ hand: 'RH' }))
    expect(plan(k['crv:face'])).toEqual([0, W, 0, D])                  // wrap fills the box
    expect(plan(k['crv:fix'])).toEqual([0, T, 0, D - FT])              // neighbour side, behind the face board
    expect(plan(k['crv:back'])).toEqual([T, W - FT, 0, T])             // at the wall
    expect(plan(k['crv:bottom'])).toEqual([T, W - SK, T, D - SK])      // formers: inside the skin
    expect(k['crv:top'].Y).toBeCloseTo(H - T, 6)
    expect(k['crv:rib_1'].Y).toBeCloseTo((H - T) / 3, 6)
    // the formers' outlines are horizontal-frame (front at y 0): the arc corner is at the front right
    const corners = casePlanCorners(k['crv:bottom'])
    expect(Math.max(...corners.map(q => q.z))).toBeCloseTo(D - SK, 6)
    expect(corners.some(q => q.x > W - SK - 1 && q.z > D - 150)).toBe(true)
    expect(isShapedPanelKey('crv:fix') && isShapedPanelKey('crv:back') && !isShapedPanelKey('crv:bottom') && !isShapedPanelKey('crv:face')).toBe(true)
  })

  it('LH mirrors every part across the width', () => {
    const rh = byKey(parts({ hand: 'RH', blkS: true, blkF: true, W: 450, D: 600, H: 900 }))
    const lh = byKey(parts({ hand: 'LH', blkS: true, blkF: true, W: 450, D: 600, H: 900 }))
    expect(Object.keys(lh).sort()).toEqual(Object.keys(rh).sort())
    for (const key of Object.keys(rh)) {
      const [a0, a1, z0, z1] = plan(rh[key]), [b0, b1, y0, y1] = plan(lh[key])
      expect([b0, b1, y0, y1], key).toEqual([r1(450 - a1), r1(450 - a0), z0, z1])
    }
  })

  it('DOUBLE: no fixing panel, a side block each side, symmetric formers', () => {
    const k = byKey(parts({ hand: 'DOUBLE', W: 1000, D: 500, H: 720, blkS: true, blkF: true }))
    expect(k['crv:fix']).toBeUndefined()
    expect(plan(k['crv:blk_side_l'])).toEqual([FT, FT + T, T, T + 100])
    expect(plan(k['crv:blk_side_r'])).toEqual([1000 - FT - T, 1000 - FT, T, T + 100])
    expect(plan(k['crv:blk_front'])).toEqual([450, 550, 500 - FT - T, 500 - FT])
    expect(plan(k['crv:bottom'])).toEqual([SK, 1000 - SK, T, 500 - SK])
    expect(plan(k['crv:face'])).toEqual([0, 1000, 0, 500])
  })

  it('scribes and overhangs: carcass short of the wall and up off the floor; face board past the wall', () => {
    const k = byKey(parts({ hand: 'RH', W: 220, D: 560, H: 720, OG: 25, OR: 40, SBK: 20, SBT: 50, STP: 15 }))
    expect(plan(k['crv:back'])).toEqual([T, 220 - FT, 20, 20 + T])
    expect(k['crv:bottom'].Y).toBe(50)
    expect(plan(k['crv:face'])).toEqual([-25, 220, -40, 560])     // trimmed after glue-up
  })

  it('labels, code suffix, settings and the plan footprint', () => {
    expect(curvedEndPartLabel('crv:rib_3')).toBe('Curved End Rib 3')
    expect(curvedEndPartLabel('crv:face')).toBe('Curved Face Board')
    expect(curvedEndCode('BCRVFIXP', 'LH')).toBe('BCRVFIXP/L')
    expect(curvedEndCode('BCRVFIXP/L', 'DOUBLE')).toBe('BCRVFIXP/2')
    expect(normaliseCurvedEnd({ hand: 'LH', R: -5 } as never)).toMatchObject({ hand: 'LH', R: 150, SK: 2, grain: 'vertical' })
    // RH: curve at the front right (frame y = depth from the back)
    const rh = footprintOutline(curvedEndFootprint({ hand: 'RH', R: 150 }, { w: 300, d: 580 })!, { w: 300, d: 580 })
    expect(rh.some(q => Math.abs(q.x - 300) < 1e-6 && Math.abs(q.y - 580) < 1e-6)).toBe(false)
    expect(rh.some(q => Math.abs(q.x) < 1e-6 && Math.abs(q.y - 580) < 1e-6)).toBe(true)
    const lh = footprintOutline(curvedEndFootprint({ hand: 'LH', R: 150 }, { w: 300, d: 580 })!, { w: 300, d: 580 })
    expect(lh.some(q => Math.abs(q.x - 300) < 1e-6 && Math.abs(q.y - 580) < 1e-6)).toBe(true)
    // half-round double: both corners curved, the zero-length front dropped
    const hr = footprintOutline(curvedEndFootprint({ hand: 'DOUBLE', R: 150 }, { w: 300, d: 500 })!, { w: 300, d: 500 })
    expect(Math.max(...hr.map(q => q.y))).toBeCloseTo(500, 6)
    expect(hr.some(q => Math.abs(q.x) < 1e-6 && Math.abs(q.y - 500) < 1e-6)).toBe(false)
  })
})

// ── Whole resolver: a placed BCRVFIXP (no carcass / face / kick flags; footprint
// = plan outline only) gets exactly the curved end's parts, and the face board's
// wrap reaches the persist payload.

const carcass: Material = { id: 'mel', name: 'White 16.5', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const exposed: Material = { id: 'oak', name: 'Oak 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: true }

function crvCab(o: Partial<CabinetInput> = {}): CabinetInput {
  const curved_end = { ...DEFAULT_CURVED_END, ...(o.curved_end ?? {}) }
  return {
    id: 'c1', assembly_class: 'base', DX: 300, DY: 900, DZ: 580,
    has_carcass: false, has_internal: false, has_face: false, has_toekick: false,
    left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
    material: carcass, door_material: exposed, shelf_material: carcass, exposed_material: exposed,
    toekick_face_material: carcass, toekick_interior_material: carcass,
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    face_grid: { rows: [], cols: [], zones: [] },
    internal_tree: { type: 'open', fittings: [] },
    footprint: curvedEndFootprint(curved_end, { w: 300, d: 580 }),
    ...o,
    curved_end,
  }
}

describe('resolveCabinet with a curved end', () => {
  it('builds only the curved end parts, from the shop materials', () => {
    const res = resolveCabinet(crvCab())
    expect(res.errors).toEqual([])
    expect(res.case_parts.map(p => p.part_key)).toEqual(['crv:face', 'crv:fix', 'crv:back', 'crv:bottom',
      'crv:rib_1', 'crv:rib_2', 'crv:rib_3', 'crv:rib_4', 'crv:top'])   // 900 high: 5 gaps of 160 (kit case 05)
    expect(res.toekick_parts).toEqual([])
    expect(res.face_zones).toEqual([])
    const face = res.case_parts[0]
    expect([face.material_id, face.DZ]).toEqual(['oak', 18])
    expect(res.case_parts.slice(1).every(p => p.material_id === 'mel' && p.DZ === 16.5)).toBe(true)
    const row = buildPersistPayload(res).case_parts[0] as Record<string, unknown>
    expect(row.wrap).toEqual(face.wrap)
    expect(row.grain_direction).toBe('vertical')
  })

  it('kit warnings block (errors); skin outside 2–3 mm is a warning', () => {
    expect(resolveCabinet(crvCab({ DX: 160 })).errors.map(e => e.code)).toEqual(['CURVED_END'])
    const thick = resolveCabinet(crvCab({ curved_end: { ...DEFAULT_CURVED_END, SK: 4 } }))
    expect(thick.errors).toEqual([])
    expect(thick.warnings.map(e => e.code)).toContain('CURVED_END_NOTE')
  })
})

describe('curved end: rib count and gable edging (Mark, 2026-10-20)', () => {
  it('a typed rib count replaces the auto rule; too few is a note, too many blocks', () => {
    const auto = calcCurvedEnd({ H: 900 })
    expect(auto.gaps - 1).toBe(4)
    const two = calcCurvedEnd({ H: 900, ribs: 2 })
    expect([two.gaps, Math.round(two.pitch * 100) / 100]).toEqual([3, Math.round((900 - 16.5) / 3 * 100) / 100])
    expect(two.notes[0]).toMatch(/2 ribs leave .* between supports/)
    expect(two.warnings).toEqual([])
    expect(parts({ H: 900, ribs: 0 }).map(q => q.part_key)).toEqual(['crv:face', 'crv:fix', 'crv:back', 'crv:bottom', 'crv:top'])
    expect(calcCurvedEnd({ H: 900, ribs: 6 }).notes).toEqual([])     // more than auto: fine
    expect(calcCurvedEnd({ H: 300, ribs: 30 }).warnings[0]).toMatch(/Too many ribs/)
  })

  it('only the gable end that butts the next cabinet is taped', () => {
    const k = (p: Partial<CurvedEndParams>, g: 'vertical' | 'horizontal' = 'vertical') =>
      curvedEndCaseParts(calcCurvedEnd(p), 'face', 'carcass', g, 'eb1').find(q => q.part_key === 'crv:face')!.edge_band
    expect(k({ hand: 'RH' })).toEqual({ top: false, bottom: true, left: false, right: false, id: 'eb1' })    // x = 0 of the blank
    expect(k({ hand: 'LH' }, 'horizontal')).toEqual({ top: false, bottom: false, left: true, right: false, id: 'eb1' })  // y = 0
    expect(k({ hand: 'RH', OG: 25 })).toMatchObject({ top: false, bottom: false, left: false, right: false })   // trimmed on site
    expect(k({ hand: 'DOUBLE', W: 600 })).toMatchObject({ top: false, bottom: false, left: false, right: false })
  })
})
