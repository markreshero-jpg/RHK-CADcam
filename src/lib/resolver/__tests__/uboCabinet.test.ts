import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type FaceGridInput, type Material, type Section } from '../types'

// z_ubo U3: the UBO library definition's face grid + interior + rules, exactly
// as seeded (z_ubo/migration_u3_ubo_library.sql).
const FACE_GRID = {
  cols: [{ col_index: 0, width_locked: false }],
  rows: [{ row_index: 0, height_locked: false }, { row_index: 1, height: 600, height_locked: true }, { row_index: 2, height_locked: false }],
  zones: [
    { col_index: 0, face_type: 'false_panel', row_index: 0 },
    { col_index: 0, face_type: 'open', row_index: 1 },
    { col_index: 0, face_type: 'false_panel', row_index: 2 },
  ],
} as FaceGridInput
const TREE = { type: 'open', fittings: [{ type: 'fixed_shelf', y_locked: false, align_face_row: { row_index: 1, edge: 'bottom' } }] } as Section

const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const ubo = (DY = 900): CabinetInput => ({
  id: 'ubo', assembly_class: 'base', DX: 600, DY, DZ: 580,
  has_carcass: true, has_internal: true, has_face: true, has_toekick: true,
  left_neighbour: 'cabinet', right_neighbour: 'cabinet', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, { BACK_TYPE: 'rail' }), top_type: 'front_rail',
  face_grid: FACE_GRID, internal_tree: TREE,
})

describe('UBO (under-bench oven)', () => {
  const rp = resolveCabinet(ubo())

  it('resolves cleanly', () => expect(rp.errors).toEqual([]))

  it('two equal fixed panels framing a 600 opening', () => {
    const panels = rp.face_zones
    expect(panels.map(z => z.face_type)).toEqual(['false_panel', 'false_panel'])
    expect(panels[0].DY).toBeCloseTo(panels[1].DY, 6)
    expect(rp.open_zones).toEqual([expect.objectContaining({ row_index: 1, DY: 600 })])
  })

  it('oven shelf top on the bottom of the opening, full depth to the box back', () => {
    const shelf = rp.internal_parts.filter(p => p.part_type === 'fixed_shelf')
    expect(shelf).toHaveLength(1)
    expect(shelf[0].Y + shelf[0].DZ).toBeCloseTo(rp.open_zones![0].Y, 6)
    expect(shelf[0].Z).toBe(0)
  })

  it('no back panel, one back top rail on edge', () => {
    const keys = rp.case_parts.map(p => p.part_key)
    expect(keys).not.toContain('back')
    const rails = rp.case_parts.filter(p => p.part_key === 'back_rail')
    expect(rails).toHaveLength(1)
    expect(rails[0].upright).toBe(true)
  })

  it('a shorter cabinet keeps the 600 opening; panels shrink, shelf follows', () => {
    const lo = resolveCabinet(ubo(820))
    expect(lo.errors).toEqual([])
    expect(lo.open_zones![0].DY).toBe(600)
    const s = lo.internal_parts.find(p => p.part_type === 'fixed_shelf')!
    expect(s.Y + s.DZ).toBeCloseTo(lo.open_zones![0].Y, 6)
    expect(lo.face_zones[0].DY).toBeLessThan(rp.face_zones[0].DY)
  })
})
