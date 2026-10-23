import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type SlideProduct, type FaceGridInput } from '../types'

// System drawer boxes sit the same height above the bottom of their own front in
// every drawer of a stack (the lowest drawer's offset over the bottom panel), so
// front holes measured up from the front bottom land the same on every box.

const board: Material = { id: 'm16', name: 'Board 16.5', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }

const slide = (id: string, h: number): SlideProduct => ({
  id, name: `Runner 500x${h}`, brand: 'Test', nominal_length: 500, box_height: h, side_deduction: 26,
  runner_thickness: 13, min_runner_depth: null, max_runner_depth: null, soft_close: true,
  full_extension: true, cost_per_pair: null, colour: null, model_url: null, model_format: null,
  model_scale: 1, model_anchor_x: 0, model_anchor_y: 0, model_anchor_z: 0, drill_ops: [],
})

const fourDrawers: FaceGridInput = {
  rows: [0, 1, 2, 3].map(i => ({ row_index: i, height_locked: false })),
  cols: [{ col_index: 0, width_locked: false }],
  zones: [0, 1, 2, 3].map(i => ({ row_index: i, col_index: 0, face_type: 'drawer_face' as const })),
}

const cab = (overrides: Partial<CabinetInput> = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 950, DY: 762, DZ: 580,
  has_carcass: true, has_internal: false, has_face: true, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 26, rules: mergeRules(DEFAULT_RULES),
  face_grid: fourDrawers,
  internal_tree: { type: 'open', fittings: [] },
  slide_products: [slide('s127', 127), slide('s178', 178)],
  ...overrides,
})

describe('system drawer boxes sit a constant height above their front', () => {
  const rp = resolveCabinet(cab())
  const zoneY = (row: number) => rp.face_zones.find(z => z.row_index === row)!.Y
  const lifts = rp.drawer_stacks.map(s => s.box_Y - zoneY(s.face_zone_row))

  it('every drawer is lifted the same as the lowest (bottom panel thickness)', () => {
    expect(rp.drawer_stacks).toHaveLength(4)
    for (const l of lifts) expect(l).toBeCloseTo(lifts[0])
    expect(lifts[0]).toBeGreaterThan(0)
  })

  it('the lift counts against the front height when picking the box', () => {
    // ~188 fronts: 178 + the lift no longer fits, so the 127 box is picked.
    for (const s of rp.drawer_stacks) expect(s.box_height).toBe(127)
  })
})
