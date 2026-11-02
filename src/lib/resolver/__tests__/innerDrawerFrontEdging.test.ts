import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, DEFAULT_DB_RULES, type CabinetInput, type Material, type SlideProduct } from '../types'

// Inner drawer fronts are edged all 4 sides as standard; the drawer builder's
// db_front ticks on the inner method drive it (Mark, 2026-11-03).
const wb: Material = { id: 'wb', name: 'Whiteboard 16.5mm', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const dp: SlideProduct = {
  id: 'dp', name: 'Dragon Pro 400x95', brand: 'Dragon', kind: 'slide', inside_width_min: null, inside_width_max: null,
  nominal_length: 400, box_height: 95, side_deduction: 0, runner_thickness: 37.5,
  min_runner_depth: null, max_runner_depth: null, soft_close: true, full_extension: true,
  cost_per_pair: null, colour: null, model_url: null, model_format: null, model_scale: 1,
  model_anchor_x: 0, model_anchor_y: 0, model_anchor_z: 0, drill_ops: [],
} as SlideProduct
const base: CabinetInput = {
  id: 'c', assembly_class: 'tall', DX: 800, DY: 2000, DZ: 520,
  has_carcass: true, has_internal: true, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: wb, door_material: wb, shelf_material: wb, exposed_material: wb,
  toekick_face_material: wb, toekick_interior_material: wb,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES), slide_products: [dp],
  internal_tree: { type: 'open', fittings: [{ type: 'inner_drawer', y_locked: true, y_position: 16.5, slide_product_id: 'dp', drawer_type: 'system' }] },
}
const front = (cab: CabinetInput) => resolveCabinet(cab).internal_parts.find(p => p.part_type === 'inner_drawer_front')!.edge_band

describe('inner drawer front edging', () => {
  it('defaults to all 4 sides', () => {
    expect(front(base)).toMatchObject({ top: true, bottom: true, left: true, right: true })
  })
  it('follows the inner method db_front ticks from the drawer builder', () => {
    const eb = front({ ...base, inner_drawer_box_rules: { ...DEFAULT_DB_RULES, DB_EDGING: { db_front: ['top'] } } })
    expect(eb).toMatchObject({ top: true, bottom: false, left: false, right: false })
  })
})
