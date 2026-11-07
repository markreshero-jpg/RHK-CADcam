import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import {
  DEFAULT_RULES, type CabinetInput, type Material, type SlideProduct, type FaceGridInput,
} from '../types'

// The top drawer's front runs up past the carcass top to the top reveal, so the
// front height over-states the room behind it. RHK6595 BC-05/06 (Mark 2026-11-07):
// 830 high D3, 202 top front, auto-picked a 178 box 10 into the front rail.

const board: Material = { id: 'm16', name: 'Board 16.5', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const slide = (id: string, h: number): SlideProduct => ({
  id, name: `Runner 500x${h}`, brand: 'Test', nominal_length: 500, box_height: h, side_deduction: 26,
  runner_thickness: 13, min_runner_depth: null, max_runner_depth: null, soft_close: true,
  full_extension: true, cost_per_pair: null, colour: null, model_url: null, model_format: null,
  model_scale: 1, model_anchor_x: 0, model_anchor_y: 0, model_anchor_z: 0, drill_ops: [],
})

const d3 = (topSlide?: string): FaceGridInput => ({
  rows: [{ row_index: 0, height_locked: false }, { row_index: 1, height: 323, height_locked: true }, { row_index: 2, height: 202, height_locked: true }],
  cols: [{ col_index: 0, width_locked: false }],
  zones: [0, 1, 2].map(i => ({
    row_index: i, col_index: 0, face_type: 'drawer_face' as const,
    ...(i === 2 && topSlide ? { drawer_type_config: { type: 'system' as const, slide_product_id: topSlide } } : {}),
  })),
})

const cab = (grid: FaceGridInput, top: 'front_rail' | 'full_top' | 'none' = 'front_rail'): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 711, DY: 830, DZ: 560,
  has_carcass: true, has_internal: false, has_face: true, has_toekick: false,
  left_neighbour: 'end_panel', right_neighbour: 'end_panel', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 26, rules: mergeRules({ ...DEFAULT_RULES, TOP_TYPE: top }),
  face_grid: grid,
  internal_tree: { type: 'open', fittings: [] },
  slide_products: [slide('s95', 95), slide('s127', 127), slide('s178', 178)],
})

const topUnderside = (rp: ReturnType<typeof resolveCabinet>) =>
  Math.min(...rp.case_parts.filter(p => p.part_key === 'front_rail' || p.part_key === 'full_top').map(p => p.Y))

describe('top drawer box stays under the carcass top', () => {
  for (const top of ['front_rail', 'full_top'] as const) {
    it(`auto pick clears the ${top}`, () => {
      const rp = resolveCabinet(cab(d3(), top))
      const s = rp.drawer_stacks.find(s => s.face_zone_row === 2)!
      expect(s.box_Y + s.box_height).toBeLessThanOrEqual(topUnderside(rp) + 1e-6)
      expect(s.box_height).toBe(127)
      expect(rp.warnings.some(w => w.code === 'DRAWER_TOP_CLASH')).toBe(false)
    })
  }

  it('lower drawers keep the tall box', () => {
    const rp = resolveCabinet(cab(d3()))
    expect(rp.drawer_stacks.find(s => s.face_zone_row === 1)!.box_height).toBe(178)
  })

  it('no top: nothing caps the box', () => {
    const rp = resolveCabinet(cab(d3(), 'none'))
    expect(rp.drawer_stacks.find(s => s.face_zone_row === 2)!.box_height).toBe(178)
  })

  it('a forced box into the carcass top is warned', () => {
    const rp = resolveCabinet(cab(d3('s178')))
    expect(rp.drawer_stacks.find(s => s.face_zone_row === 2)!.box_height).toBe(178)
    expect(rp.warnings.some(w => w.code === 'DRAWER_TOP_CLASH')).toBe(true)
  })
})
