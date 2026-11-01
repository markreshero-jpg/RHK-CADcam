import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type SlideDrillOp, type SlideProduct } from '../types'

// Inner drawer front-fixing holes sit where a face drawer's do relative to its
// runner (Mark, 2026-11-01, RHK6478 US Main Ensuite: they were 18.5 high).
const wb: Material = { id: 'wb', name: 'Whiteboard 16.5mm', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const frontOp = {
  id: 'f', slide_id: 'dp', operation_order: 1, target_surface: 'drawer_front', machine_operation: 'drill',
  tool_diameter_mm: 10, depth_mm: 12, along_off_mm: 32, up_off_mm: 64, qty: 2, spacing_mm: 32,
  side: 'both', repeat_axis: 'up', router_tool_id: null, drill_id: null, auto_tool: true, notes: null, expressions: null,
} as SlideDrillOp
const dp95: SlideProduct = {
  id: 'dp', name: 'Dragon Pro 400x95', brand: 'Dragon', kind: 'slide', inside_width_min: null, inside_width_max: null,
  nominal_length: 400, box_height: 95, side_deduction: 0, runner_thickness: 37.5,
  min_runner_depth: null, max_runner_depth: null, soft_close: true, full_extension: true,
  cost_per_pair: null, colour: null, model_url: null, model_format: null, model_scale: 1,
  model_anchor_x: 0, model_anchor_y: 0, model_anchor_z: 0, drill_ops: [frontOp],
} as SlideProduct

const cab: CabinetInput = {
  id: 'c', assembly_class: 'base', DX: 800, DY: 340, DZ: 476.5,
  has_carcass: true, has_internal: true, has_face: true, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: wb, door_material: wb, shelf_material: wb, exposed_material: wb,
  toekick_face_material: wb, toekick_interior_material: wb,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
  slide_products: [dp95],
  face_grid: {
    rows: [{ row_index: 0, height_locked: false }], cols: [{ col_index: 0, width_locked: false }],
    zones: [{ row_index: 0, col_index: 0, face_type: 'drawer_face', drawer_type_config: { type: 'system', slide_product_id: 'dp' } }],
  },
  internal_tree: { type: 'open', fittings: [{ type: 'inner_drawer', y_locked: true, y_position: 130, slide_product_id: 'dp', drawer_type: 'system' }] },
}

describe('inner drawer front holes', () => {
  it('match a face drawer\'s, measured from the runner', () => {
    const rp = resolveCabinet(cab)
    const faceSl = rp.drawer_stacks[0].slides.find(s => s.side === 'left')!
    const innerSl = rp.internal_slides.find(s => s.side === 'left')!
    const rel = (sl: typeof faceSl) => sl.drills.filter(d => d.surface === 'drawer_front').map(d => +(d.y - sl.Y).toFixed(1))
    expect(rel(innerSl)).toHaveLength(2)
    expect(rel(innerSl)).toEqual(rel(faceSl))
  })
})
