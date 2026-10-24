// Curved bulkhead (z_curved_end C7) + the bulkhead shadowline split rail
// (z_bulkhead B7): a curved end hung like a bulkhead builds the curved-end parts
// (no straight fascia), and the split rail lifts everything by its thickness and
// follows the front, the curve and the side.
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { resolveCabinet } from '../../resolver/resolver'
import { mergeRules } from '../../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ResolvedCasePart } from '../../resolver/types'
import { DEFAULT_BULKHEAD, normaliseBulkhead, type BulkheadSettings } from '../../bulkhead'
import { curvedEndFootprint, DEFAULT_CURVED_END, type CurvedEndSettings } from '../settings'
import { calcCurvedEnd, curvedEndParts } from '../geometry'
import { sampleOutline } from '../../shapePath'

const mat = (id: string, DZ: number): Material => ({ id, name: id, DZ, sheet_dx: 2400, sheet_dy: 1200, has_grain: false })
const MDF10 = mat('mdf10', 10)
const SPLIT = { on: true, width: 60, setback: 10, material_id: 'mdf10' }

function bh(over: Partial<BulkheadSettings> = {}): BulkheadSettings {
  return normaliseBulkhead({ ...DEFAULT_BULKHEAD, front: 'carcase', cleat: false, ...over })!
}

function cab(o: { W?: number; H?: number; D?: number; bulkhead?: BulkheadSettings; curved?: Partial<CurvedEndSettings> | null } = {}): CabinetInput {
  const W = o.W ?? 500, H = o.H ?? 280, D = o.D ?? 600
  const curved_end = o.curved === null ? null : { ...DEFAULT_CURVED_END, R: 370, ribs: 0, ...o.curved }
  const b = o.bulkhead ?? bh()
  return {
    id: 'c1', assembly_class: 'wall', DX: W, DY: H, DZ: D,
    has_carcass: false, has_internal: false, has_face: false, has_toekick: false,
    left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
    material: mat('carcass', 16.5), door_material: mat('face', 16.5), shelf_material: mat('carcass', 16.5),
    exposed_material: mat('face', 16.5), toekick_face_material: mat('kf', 16.5), toekick_interior_material: mat('ki', 16.5),
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
    bulkhead: b,
    ...(b.split.on ? { split_material: MDF10 } : {}),
    ...(curved_end ? { curved_end, footprint: curvedEndFootprint(curved_end, { w: W, d: D }) } : {}),
  }
}
const part = (ps: ResolvedCasePart[], k: string) => ps.find(p => p.part_key === k)

describe('straight bulkhead with a shadowline split (B7)', () => {
  it('off: no rail, the fascia is the full height from the underside', () => {
    const ps = resolveCabinet(cab({ curved: null })).case_parts
    expect(part(ps, 'bh:split')).toBeUndefined()
    expect(part(ps, 'bh:fascia')).toMatchObject({ Y: 0, DX: 280 })
  })

  it('on: a 10 rail 60 deep set back 10 from the face; everything above lifts 10 and loses 10', () => {
    const ps = resolveCabinet(cab({ curved: null, bulkhead: bh({ split: SPLIT, cleat: true }) })).case_parts
    expect(part(ps, 'bh:split')).toMatchObject({ Y: 0, DZ: 10, DX: 60, DY: 500, Z: 600 - 10 - 60, material_id: 'mdf10' })
    expect(part(ps, 'bh:fascia')).toMatchObject({ Y: 10, DX: 270 })
    expect(part(ps, 'bh:cleat_h')!.Y).toBe(10)
  })

  it('flush with the doors uses the door style thickness, not the schedule board', () => {
    // 16mm doors in a job whose door_face board is 18: front = 582 + 2 + 16 = 600.
    const c = { ...cab({ curved: null, D: 582, bulkhead: bh({ front: 'doors', split: SPLIT }) }), door_material: mat('face18', 18), door_thickness: 16 }
    const ps = resolveCabinet(c).case_parts
    expect(part(ps, 'bh:fascia')!.Z).toBeCloseTo(600)
    expect(part(ps, 'bh:split')!.Z + part(ps, 'bh:split')!.DX).toBeCloseTo(590)
  })

  it('on without a loaded board builds no rail and keeps the full height', () => {
    const c = cab({ curved: null, bulkhead: bh({ split: SPLIT }) })
    delete c.split_material
    const ps = resolveCabinet(c).case_parts
    expect(part(ps, 'bh:split')).toBeUndefined()
    expect(part(ps, 'bh:fascia')).toMatchObject({ Y: 0, DX: 280 })
  })
})

describe('curved bulkhead BHCRVFIXP (C7)', () => {
  it('builds the curved-end parts, never the straight fascia / returns / cleat', () => {
    const rp = resolveCabinet(cab({ bulkhead: bh({ cleat: true, left: { on: true, depth: 600, joint: 'mitre' } }) }))
    expect(rp.errors).toEqual([])
    const keys = rp.case_parts.map(p => p.part_key)
    expect(keys.filter(k => k.startsWith('bh:'))).toEqual([])
    expect(keys).toContain('crv:face')
    // ribs 0: top + bottom formers only
    expect(keys.filter(k => /^crv:(top|bottom|rib_)/.test(k)).sort()).toEqual(['crv:bottom', 'crv:top'])
  })

  it('with the split: the curved end is DY − rail tall and lifted by it', () => {
    const plain = resolveCabinet(cab()).case_parts
    const ps = resolveCabinet(cab({ bulkhead: bh({ split: SPLIT }) })).case_parts
    const f0 = part(plain, 'crv:face')!, f = part(ps, 'crv:face')!
    expect(f0).toMatchObject({ Y: 0, DY: 280 })        // vertical grain: DY = the height
    expect(f).toMatchObject({ Y: 10, DY: 270 })
    expect(part(ps, 'crv:top')!.Y).toBeCloseTo(part(plain, 'crv:top')!.Y)   // top stays at the ceiling
    expect(part(ps, 'crv:bottom')!.Y).toBeCloseTo(10)
  })

  it('the rail follows the front, the curve (R − setback) and the side to the wall', () => {
    const W = 500, D = 600, R = 370, sb = 10, w = 60
    const rail = part(resolveCabinet(cab({ bulkhead: bh({ split: SPLIT }) })).case_parts, 'bh:split')!
    expect(rail).toMatchObject({ X: 0, Y: 0, Z: 0, DX: D - sb, DY: W - sb, DZ: 10 })
    // Sampled outline (part frame: x across, y back from the rail's front edge).
    const pts = sampleOutline(rail.outline!, 2)
    const CX = W - R, CY = R - sb            // curve centre in the part frame
    // Every point inside the curve's quadrant is on the outer (R − sb) or inner (R − sb − w) arc.
    const radii = pts.filter(p => p.x > CX + 0.5 && p.y < CY - 0.5).map(p => Math.hypot(p.x - CX, p.y - CY))
    for (const r of radii) expect(Math.min(Math.abs(r - (R - sb)), Math.abs(r - (R - sb - w)))).toBeLessThan(0.01)
    expect(radii.filter(r => Math.abs(r - (R - sb)) < 0.01).length).toBeGreaterThan(3)
    expect(radii.filter(r => Math.abs(r - (R - sb - w)) < 0.01).length).toBeGreaterThan(3)
    // Spans the gable end to the wall.
    expect(Math.min(...pts.map(p => p.x))).toBeCloseTo(0)
    expect(Math.max(...pts.map(p => p.y))).toBeCloseTo(D - sb)
  })

  it('LH mirrors the rail and starts it at the setback', () => {
    const rail = part(resolveCabinet(cab({ bulkhead: bh({ split: SPLIT }), curved: { hand: 'LH' } })).case_parts, 'bh:split')!
    expect(rail.X).toBe(10)
    const pts = sampleOutline(rail.outline!, 2)
    // The gable end (straight front start) is now at the right (part x = W − setback).
    expect(pts.some(p => Math.abs(p.x - 490) < 0.01 && Math.abs(p.y) < 0.01)).toBe(true)
  })

  it('a double curved end with a split is an error (one curve only)', () => {
    const rp = resolveCabinet(cab({ W: 900, bulkhead: bh({ split: SPLIT }), curved: { hand: 'DOUBLE', R: 300 } }))
    expect(rp.errors.map(e => e.code)).toContain('CURVED_END')
    expect(part(rp.case_parts, 'bh:split')).toBeUndefined()
  })

  it('ribs stay editable: a typed count is honoured on the curved bulkhead', () => {
    const c = calcCurvedEnd({ W: 500, D: 600, H: 280, R: 370, FT: 16.5, T: 16.5, ribs: 1 })
    expect(curvedEndParts(c).filter(p => p.name.startsWith('Rib')).length).toBe(1)
  })
})
