import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type ConstructionRules, type Material } from '../types'

// Front and back top rails each have their own on-edge / flat setting
// (RAIL_ORIENT / BACK_RAIL_ORIENT — Mark, 2026-10-29).
const board: Material = { id: 'm16', name: 'Board 16', DZ: 16, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const cab = (rules: Partial<ConstructionRules>): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 600, DY: 720, DZ: 560, top_type: 'double_rail',
  has_carcass: true, has_internal: false, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, rules),
  internal_tree: { type: 'open', fittings: [] },
})
const rails = (rules: Partial<ConstructionRules>) => {
  const ps = resolveCabinet(cab(rules)).case_parts
  return { front: ps.find(p => p.part_key === 'front_rail')!, back: ps.find(p => p.part_key === 'back_rail')! }
}

describe('top rail orientation per rail', () => {
  it('default: both flat', () => {
    const { front, back } = rails({})
    expect(front.upright).toBeFalsy(); expect(back.upright).toBeFalsy()
  })
  it('front on edge leaves the back rail flat', () => {
    const { front, back } = rails({ RAIL_ORIENT: 'vertical' })
    expect(front.upright).toBe(true); expect(back.upright).toBeFalsy()
    expect(back.Y).toBe(720 - 16)   // flat: its thickness under the top line
  })
  it('back rail on edge on its own', () => {
    const { front, back } = rails({ BACK_RAIL_ORIENT: 'vertical' })
    expect(front.upright).toBeFalsy(); expect(back.upright).toBe(true)
  })
  it('a BACK_TYPE rail back rail always stands on edge', () => {
    const { back } = rails({ BACK_TYPE: 'rail' })
    expect(back.upright).toBe(true)
  })
})
