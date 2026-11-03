import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { FPRAIL_BOX_CLEAR } from '../resolveDrawerStack'
import {
  DEFAULT_RULES, type CabinetInput, type Material, type SlideProduct, type FaceGridInput, type HandleProductInput,
} from '../types'

// A system drawer box runs up to the sides' front edge, where a finger-pull
// backing rail sits flush — so the box top must stay under the rail
// (20 below a top-edge grip's front top). RHK6478 WIP BC-01, Mark 2026-11-03:
// 150 top front under a 60 finger gap auto-picked a 127 box 18.5 into the rail.

const board: Material = { id: 'm16', name: 'Board 16.5', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const slide = (id: string, h: number): SlideProduct => ({
  id, name: `Runner 500x${h}`, brand: 'Test', nominal_length: 500, box_height: h, side_deduction: 26,
  runner_thickness: 13, min_runner_depth: null, max_runner_depth: null, soft_close: true,
  full_extension: true, cost_per_pair: null, colour: null, model_url: null, model_format: null,
  model_scale: 1, model_anchor_x: 0, model_anchor_y: 0, model_anchor_z: 0, drill_ops: [],
})
const shark: HandleProductInput = { id: 'sn', name: 'Sharknose', grip_kind: 'sharknose', handle_type: 'other', length: null, bore_centres: null, projection: null, cost_per_unit: 0, hole_dia_mm: null, holes: [], needs_finger_gap: true, bevel_angle_deg: 45, bevel_land_mm: 2 }

const slml = (topSlide?: string): FaceGridInput => ({
  rows: [{ row_index: 0, height_locked: false }, { row_index: 1, height: 220, height_locked: true }, { row_index: 2, height: 150, height_locked: true }],
  cols: [{ col_index: 0, width_locked: false }],
  zones: [0, 1, 2].map(i => ({
    row_index: i, col_index: 0, face_type: 'drawer_face' as const,
    ...(i === 2 ? { finger_gap: 60 } : {}),
    ...(i === 2 && topSlide ? { drawer_type_config: { type: 'system' as const, slide_product_id: topSlide } } : {}),
  })),
})

const cab = (grid: FaceGridInput): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 1085, DY: 760, DZ: 630,
  has_carcass: true, has_internal: false, has_face: true, has_toekick: false,
  left_neighbour: 'end_panel', right_neighbour: 'end_panel', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 26, rules: mergeRules(DEFAULT_RULES),
  face_grid: grid,
  internal_tree: { type: 'open', fittings: [] },
  slide_products: [slide('s95', 95), slide('s127', 127), slide('s178', 178)],
  handle_schedule: { drawer: { handle: shark, offset_from_edge_mm: 0, inset_from_side_mm: null, orientation: 'horizontal' } },
  handle_products: { sn: shark },
})

describe('finger-pull drawer box stays under its backing rail', () => {
  it('auto pick takes the lower box that clears the rail', () => {
    const rp = resolveCabinet(cab(slml()))
    const top = rp.drawer_stacks.find(s => s.face_zone_row === 2)!
    const zone = rp.face_zones.find(z => z.row_index === 2)!
    const railBottom = Math.max(...rp.case_parts.filter(p => p.part_key.startsWith('fprail:')).map(p => p.Y))
    expect(railBottom).toBeCloseTo(zone.Y + zone.DY - 20)
    expect(top.box_height).toBe(95)
    expect(top.box_Y + top.box_height).toBeLessThanOrEqual(railBottom)
    expect(rp.warnings.some(w => w.code === 'DRAWER_FPRAIL_CLASH')).toBe(false)
  })

  it('lower drawers keep their boxes (the rail is above them)', () => {
    const rp = resolveCabinet(cab(slml()))
    expect(rp.drawer_stacks.find(s => s.face_zone_row === 1)!.box_height).toBe(178)
  })

  it('a forced box that reaches the rail is warned', () => {
    const rp = resolveCabinet(cab(slml('s127')))
    expect(rp.drawer_stacks.find(s => s.face_zone_row === 2)!.box_height).toBe(127)
    expect(rp.warnings.some(w => w.code === 'DRAWER_FPRAIL_CLASH')).toBe(true)
  })

  it('a box that only just meets a mid rail drops a size (5 clear, RHK6478 Kitchen 2026-11-04)', () => {
    // finger gap on every front: mid rails 20 below the lower fronts' tops
    const grid: FaceGridInput = {
      rows: [{ row_index: 0, height_locked: false }, { row_index: 1, height: 220, height_locked: true }, { row_index: 2, height: 150, height_locked: true }],
      cols: [{ col_index: 0, width_locked: false }],
      zones: [0, 1, 2].map(i => ({ row_index: i, col_index: 0, face_type: 'drawer_face' as const, finger_gap: 20 })),
    }
    const rp = resolveCabinet(cab(grid))
    const rails = rp.case_parts.filter(p => p.part_key.startsWith('fprail:')).map(p => p.Y)
    for (const s of rp.drawer_stacks) {
      const above = rails.filter(y => y > s.box_Y)
      if (above.length) expect(s.box_Y + s.box_height).toBeLessThanOrEqual(Math.min(...above) - FPRAIL_BOX_CLEAR + 1e-6)
    }
    expect(rp.warnings.some(w => w.code === 'DRAWER_FPRAIL_CLASH')).toBe(false)
  })
})
