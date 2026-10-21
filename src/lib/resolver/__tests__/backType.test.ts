import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type ConstructionRules, type Material } from '../types'

// z_ubo U1: BACK_TYPE — back panel / no back / back top rail on edge.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const cab = (rules: Partial<ConstructionRules>, top_type?: CabinetInput['top_type']): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 600, DY: 900, DZ: 580,
  has_carcass: true, has_internal: false, has_face: false, has_toekick: true,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, rules), top_type,
  face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
})
const parts = (rules: Partial<ConstructionRules>, top?: CabinetInput['top_type']) => resolveCabinet(cab(rules, top)).case_parts
const keys = (rules: Partial<ConstructionRules>, top?: CabinetInput['top_type']) => parts(rules, top).map(p => p.part_key).sort()

describe('BACK_TYPE', () => {
  it('panel (default) keeps the back', () => {
    expect(keys({})).toContain('back')
    expect(keys({})).not.toContain('back_rail')
  })

  it('none: no back, nothing else added; bottom runs to the back', () => {
    expect(keys({ BACK_TYPE: 'none' })).toEqual(['bottom', 'front_rail', 'left_side', 'right_side'])
    const bottom = parts({ BACK_TYPE: 'none', BOTTOM_BACK_JOIN: 'butts_into_back' }).find(p => p.part_key === 'bottom')!
    expect(bottom.Z).toBe(0)
    expect(bottom.DX).toBe(580)
  })

  it('rail: no back panel, a back top rail on edge BKRH tall at the back', () => {
    const ps = parts({ BACK_TYPE: 'rail', BKRH: 100 })
    expect(ps.some(p => p.part_key === 'back')).toBe(false)
    const rail = ps.find(p => p.part_key === 'back_rail')!
    expect(rail.upright).toBe(true)
    expect(rail.DX).toBe(100)
    expect(rail.Z).toBe(0)
    expect(rail.Y).toBe(900 - 100)
  })

  it('rail: lower edge taped by default; an explicit EDGING.back_rail wins', () => {
    const rail = (rules: Partial<ConstructionRules>) => parts({ BACK_TYPE: 'rail', ...rules }).find(p => p.part_key === 'back_rail')!
    expect(rail({}).edge_band).toMatchObject({ top: false, bottom: true, left: false, right: false })
    expect(rail({ EDGING: { back_rail: ['top'] } }).edge_band).toMatchObject({ top: true, bottom: false })
  })

  it('no back panel: shelves run to the back of the box', () => {
    const shelf = (rules: Partial<ConstructionRules>) => resolveCabinet({
      ...cab(rules), has_internal: true,
      internal_tree: { type: 'open', fittings: [{ type: 'fixed_shelf', y_locked: false }] },
    }).internal_parts.find(p => p.part_type === 'fixed_shelf')!
    const withBack = shelf({}), none = shelf({ BACK_TYPE: 'none' }), rail = shelf({ BACK_TYPE: 'rail' })
    expect(none.Z).toBe(withBack.Z - 18)
    expect(none.DX).toBe(withBack.DX + 18)
    expect(rail.Z).toBe(none.Z)
  })

  it('flat back rail of a double-rail top: front edge taped', () => {
    const rail = parts({}, 'double_rail').find(p => p.part_key === 'back_rail')!
    expect(rail.upright).toBeUndefined()
    expect(rail.edge_band).toMatchObject({ top: true, bottom: false, left: false, right: false })
  })

  it('rail with a double-rail top: one back rail, on edge, BKRH tall', () => {
    const rails = parts({ BACK_TYPE: 'rail', BKRH: 120 }, 'double_rail').filter(p => p.part_key === 'back_rail')
    expect(rails).toHaveLength(1)
    expect(rails[0].upright).toBe(true)
    expect(rails[0].DX).toBe(120)
  })
})
