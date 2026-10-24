// Curved end C8: an inside face panel on the square gable side (seen inside an
// island's knee space). The kit builds DX − panel; every part moves off the
// gable by the panel; the face board's gable end loses its tape.
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { resolveCabinet } from '../../resolver/resolver'
import { mergeRules } from '../../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ResolvedCasePart } from '../../resolver/types'
import { curvedEndFootprint, DEFAULT_CURVED_END, type CurvedEndSettings } from '../settings'

const mat = (id: string, DZ: number): Material => ({ id, name: id, DZ, sheet_dx: 2400, sheet_dy: 1200, has_grain: false })
function cab(W: number, s: Partial<CurvedEndSettings>): CabinetInput {
  const curved_end = { ...DEFAULT_CURVED_END, R: 300, ...s }
  return {
    id: 'c1', assembly_class: 'base', DX: W, DY: 900, DZ: 580,
    has_carcass: false, has_internal: false, has_face: false, has_toekick: false,
    left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
    material: mat('carcass', 16.5), door_material: mat('face', 18), shelf_material: mat('carcass', 16.5),
    exposed_material: mat('lam', 18), toekick_face_material: mat('kf', 18), toekick_interior_material: mat('ki', 16.5),
    exposed_edgeband_id: 'eb', slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
    curved_end, footprint: curvedEndFootprint(curved_end, { w: W, d: 580 }),
  }
}
const parts = (c: CabinetInput) => resolveCabinet(c).case_parts
const get = (ps: ResolvedCasePart[], k: string) => ps.find(p => p.part_key === k)!

describe('curved end inside face panel (C8)', () => {
  it('RH: panel at X 0 on the gable, everything else 18 over, built 18 narrower', () => {
    const plain = parts(cab(482, { hand: 'RH' }))          // the kit at the narrowed width
    const ps = parts(cab(500, { hand: 'RH', inner: true }))
    expect(resolveCabinet(cab(500, { hand: 'RH', inner: true })).errors).toEqual([])
    expect(get(ps, 'crv:inner')).toMatchObject({ X: 0, Z: 580, AY: 90, DX: 900, DY: 580, DZ: 18, material_id: 'lam' })
    expect(get(ps, 'crv:inner').edge_band).toMatchObject({ left: true, right: false, top: false, bottom: false })
    for (const k of ['crv:fix', 'crv:back', 'crv:bottom', 'crv:top']) expect(get(ps, k).X).toBeCloseTo(get(plain, k).X + 18)
    expect(get(ps, 'crv:face').DX).toBeCloseTo(get(plain, 'crv:face').DX)   // same blank
    expect(get(ps, 'crv:face').wrap!.pts[0].x).toBeCloseTo(get(plain, 'crv:face').wrap!.pts[0].x + 18)
  })

  it('RH: the face board gable end is no longer taped (the panel covers it)', () => {
    expect(Object.values(get(parts(cab(500, { hand: 'RH' })), 'crv:face').edge_band).some(v => v === true)).toBe(true)
    const eb = get(parts(cab(500, { hand: 'RH', inner: true })), 'crv:face').edge_band
    expect([eb.top, eb.bottom, eb.left, eb.right]).toEqual([false, false, false, false])
  })

  it('LH: panel at X = DX turned −90, the rest stays put', () => {
    const plain = parts(cab(482, { hand: 'LH' }))
    const ps = parts(cab(500, { hand: 'LH', inner: true }))
    expect(get(ps, 'crv:inner')).toMatchObject({ X: 500, Z: 0, AY: -90 })
    expect(get(ps, 'crv:inner').edge_band.right).toBe(true)
    expect(get(ps, 'crv:fix').X).toBeCloseTo(get(plain, 'crv:fix').X)
  })

  it('a double end ignores it', () => {
    const ps = parts(cab(900, { hand: 'DOUBLE', inner: true }))
    expect(ps.some(p => p.part_key === 'crv:inner')).toBe(false)
  })
})
