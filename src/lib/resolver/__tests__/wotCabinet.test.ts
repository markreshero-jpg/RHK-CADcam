import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type FaceGridInput, type Material, type Section } from '../types'

// WOT (wall oven tower) — the seeded grid + interior (z_ubo/migration_wot_library.sql).
const FACE_GRID = {
  cols: [{ col_index: 0, width_locked: false }],
  rows: [
    { row_index: 0, height_locked: false }, { row_index: 1, height_locked: false },
    { row_index: 2, height: 600, height_locked: true }, { row_index: 3, height: 450, height_locked: true },
  ],
  zones: [
    { col_index: 0, face_type: 'drawer_face', row_index: 0 }, { col_index: 0, face_type: 'drawer_face', row_index: 1 },
    { col_index: 0, face_type: 'open', row_index: 2 }, { col_index: 0, face_type: 'open', row_index: 3 },
  ],
} as FaceGridInput
const TREE = { type: 'open', fittings: [
  { type: 'fixed_shelf', y_locked: false, align_face_row: { row_index: 2, edge: 'bottom' } },
  { type: 'fixed_shelf', y_locked: false, align_face_row: { row_index: 3, edge: 'bottom' } },
] } as Section

const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const wot = (TOEH: number): CabinetInput => ({
  id: 'wot', assembly_class: 'tall', DX: 600, DY: 1706, DZ: 580,
  has_carcass: true, has_internal: true, has_face: true, has_toekick: true,
  left_neighbour: 'cabinet', right_neighbour: 'cabinet', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, { TOEH, BACK_TYPE: 'rail' }), top_type: 'full_top',
  face_grid: FACE_GRID, internal_tree: TREE,
})

describe('WOT (wall oven tower)', () => {
  for (const TOEH of [140, 150]) {
    it(`kick ${TOEH}: oven opening at 650, 600 + 450 openings, equal drawers, shelves on the openings`, () => {
      const rp = resolveCabinet(wot(TOEH))
      expect(rp.errors.filter(e => !/SLIDE|DRAWER/.test(e.code))).toEqual([])
      const [oven, micro] = rp.open_zones!
      expect(oven).toMatchObject({ row_index: 2, DY: 600 })
      expect(oven.Y).toBeCloseTo(650, 6)
      expect(micro).toMatchObject({ row_index: 3, DY: 450 })
      const drawers = rp.face_zones.filter(z => z.face_type === 'drawer_face')
      expect(drawers).toHaveLength(2)
      expect(drawers[0].DY).toBeCloseTo(drawers[1].DY, 6)
      expect(drawers[0].DY).toBeCloseTo((650 - TOEH - 4) / 2, 6)
      const shelves = rp.internal_parts.filter(p => p.part_type === 'fixed_shelf').sort((a, b) => a.Y - b.Y)
      expect(shelves.map(s => s.Y + s.DZ)).toEqual([expect.closeTo(oven.Y, 6), expect.closeTo(micro.Y, 6)])
      expect(rp.case_parts.some(p => p.part_key === 'back')).toBe(false)
    })
  }
})
