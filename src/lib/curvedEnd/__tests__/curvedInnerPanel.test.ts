// Curved end C8: an inside face panel on the square gable side (seen inside an
// island's knee space). The kit builds DX − panel − scribe; every part moves
// off the gable by that; the panel sits behind the face board, whose gable end
// runs over the panel's front edge to the cabinet edge (taped).
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { resolveCabinet } from '../../resolver/resolver'
import { mergeRules } from '../../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ResolvedCasePart } from '../../resolver/types'
import { caseBoxAABB } from '../../jointDrilling'
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
const r1 = (v: number) => Math.round(v * 10) / 10 + 0
const plan = (q: ResolvedCasePart) => { const b = caseBoxAABB(q); return [r1(b.x), r1(b.x + b.w), r1(b.z), r1(b.z + b.d)] }
const faceX = (q: ResolvedCasePart) => { const xs = q.wrap!.pts.map(p => p.x); return [r1(Math.min(...xs)), r1(Math.max(...xs))] }

describe('curved end inside face panel (C8)', () => {
  for (const S of [0, 10]) it(`RH, gable scribe ${S}: panel set in ${S} behind the face board, the rest ${18 + S} over`, () => {
    const plain = parts(cab(482 - S, { hand: 'RH' }))      // the kit at the narrowed width
    const ps = parts(cab(500, { hand: 'RH', inner: true, OG: S }))
    expect(resolveCabinet(cab(500, { hand: 'RH', inner: true, OG: S })).errors).toEqual([])
    expect(get(ps, 'crv:inner')).toMatchObject({ AY: 90, DX: 900, DY: 562, DZ: 18, material_id: 'lam' })
    expect(plan(get(ps, 'crv:inner'))).toEqual([S, S + 18, 0, 562])          // stops behind the face board
    expect(Object.values(get(ps, 'crv:inner').edge_band).some(v => v === true)).toBe(false)
    for (const k of ['crv:fix', 'crv:back', 'crv:bottom', 'crv:top']) expect(get(ps, k).X).toBeCloseTo(get(plain, k).X + 18 + S)
    expect(plan(get(ps, 'crv:fix'))[0]).toBeCloseTo(S + 18)                  // fixing panel against the inside panel
    // the face board runs over the panel to the cabinet's gable edge: blank longer by panel + scribe
    expect(faceX(get(ps, 'crv:face'))).toEqual([0, 500])
    expect(get(ps, 'crv:face').DX).toBeCloseTo(get(plain, 'crv:face').DX + 18 + S)
  })

  it('RH: the face board gable end is taped (it covers the panel edge), even past the fixing panel', () => {
    for (const OG of [0, 10]) {
      const eb = get(parts(cab(500, { hand: 'RH', inner: true, OG })), 'crv:face').edge_band
      expect([eb.top, eb.bottom, eb.left, eb.right]).toEqual([false, true, false, false])
    }
  })

  it('LH (BC-03 J05): panel at X = DX − scribe turned −90, face board out to DX', () => {
    const plain = parts(cab(470, { hand: 'LH' }))
    const ps = parts(cab(500, { hand: 'LH', inner: true, OG: 12 }))
    expect(get(ps, 'crv:inner')).toMatchObject({ X: 488, Z: 0, AY: -90 })
    expect(plan(get(ps, 'crv:inner'))).toEqual([470, 488, 0, 562])
    expect(get(ps, 'crv:fix').X).toBeCloseTo(get(plain, 'crv:fix').X)
    expect(plan(get(ps, 'crv:fix'))[1]).toBeCloseTo(470)
    expect(faceX(get(ps, 'crv:face'))).toEqual([0, 500])
  })

  it('a double end ignores it', () => {
    const ps = parts(cab(900, { hand: 'DOUBLE', inner: true }))
    expect(ps.some(p => p.part_key === 'crv:inner')).toBe(false)
  })
})
