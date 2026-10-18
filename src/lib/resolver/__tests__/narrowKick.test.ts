import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material } from '../types'

// A kick narrower than the 100mm spreader brace (e.g. a 70mm BFK filler) gets
// its boards only — no spreaders or braces.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const cab = (DX: number): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX, DY: 900, DZ: 580,
  has_carcass: false, has_internal: false, has_face: false, has_toekick: true,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, {}),
  face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
})

const keys = (DX: number) => resolveCabinet(cab(DX)).toekick_parts.map(p => p.part_key)

describe('narrow toe kick', () => {
  it('under 100mm wide: kick boards, no spreaders', () => {
    expect(keys(70).sort()).toEqual(['kick_back', 'kick_front_face', 'kick_sub_front'])
  })

  it('100mm and wider keeps its spreaders', () => {
    expect(keys(100)).toContain('spreader_vertical')
    expect(keys(450)).toContain('spreader_horizontal')
  })
})
