import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type FixedShelfFitting } from '../types'

// z_ubo U2: open face cells are reported as rects, and a fixed shelf can sit on
// a face row. UBO-style grid: fixed panel / open 600 / fixed panel (bottom-up).
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const shelf = (align?: FixedShelfFitting['align_face_row']): FixedShelfFitting =>
  ({ type: 'fixed_shelf', y_locked: false, ...(align ? { align_face_row: align } : {}) })
const cab = (fittings: FixedShelfFitting[] = [], DY = 900): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 600, DY, DZ: 580,
  has_carcass: true, has_internal: true, has_face: true, has_toekick: true,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, {}),
  face_grid: {
    rows: [
      { row_index: 0, height_locked: false },
      { row_index: 1, height: 600, height_locked: true },
      { row_index: 2, height_locked: false },
    ],
    cols: [{ col_index: 0, width_locked: false }],
    zones: [
      { row_index: 0, col_index: 0, face_type: 'false_panel' },
      { row_index: 1, col_index: 0, face_type: 'open' },
      { row_index: 2, col_index: 0, face_type: 'false_panel' },
    ],
  },
  internal_tree: { type: 'open', fittings },
})

describe('open face zones', () => {
  it('reports the open cell; fronts are unchanged', () => {
    const rp = resolveCabinet(cab())
    expect(rp.face_zones.map(z => z.row_index)).toEqual([0, 2])
    expect(rp.open_zones).toHaveLength(1)
    const o = rp.open_zones![0]
    expect(o).toMatchObject({ row_index: 1, col_index: 0, DY: 600 })
    // The panels below / above share the rest equally and frame the opening.
    const [below, above] = rp.face_zones
    expect(below.DY).toBeCloseTo(above.DY, 6)
    expect(o.Y).toBeCloseTo(below.Y + below.DY + DEFAULT_RULES.GAPR, 6)
    expect(above.Y).toBeCloseTo(o.Y + o.DY + DEFAULT_RULES.GAPR, 6)
  })

  it('no open cells → no open_zones key', () => {
    const c = cab()
    c.face_grid.zones[1].face_type = 'door'
    expect(resolveCabinet(c).open_zones).toBeUndefined()
  })
})

describe('fixed shelf on a face row', () => {
  it("edge 'bottom': shelf top face = bottom of the opening, and follows it", () => {
    for (const DY of [900, 820]) {
      const rp = resolveCabinet(cab([shelf({ row_index: 1, edge: 'bottom' })], DY))
      const s = rp.internal_parts.find(p => p.part_type === 'fixed_shelf')!
      expect(s.Y + s.DZ).toBeCloseTo(rp.open_zones![0].Y, 6)
    }
  })

  it("edge 'top': shelf bottom face = top of the opening", () => {
    const rp = resolveCabinet(cab([shelf({ row_index: 1, edge: 'top' })]))
    const s = rp.internal_parts.find(p => p.part_type === 'fixed_shelf')!
    const o = rp.open_zones![0]
    expect(s.Y).toBeCloseTo(o.Y + o.DY, 6)
  })

  it('a row that is not on the front reports an error and keeps the shelf', () => {
    const rp = resolveCabinet(cab([shelf({ row_index: 7, edge: 'bottom' })]))
    expect(rp.errors.some(e => e.code === 'SHELF_FACE_ROW_MISSING')).toBe(true)
    expect(rp.internal_parts.some(p => p.part_type === 'fixed_shelf')).toBe(true)
  })
})
