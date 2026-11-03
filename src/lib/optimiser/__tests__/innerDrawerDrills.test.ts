import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '@/src/lib/resolver/resolver'
import { mergeRules } from '@/src/lib/resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type SlideDrillOp, type SlideProduct } from '@/src/lib/resolver/types'
import { collectDrillRows } from '../seamDrillSync'

// Inner drawer runner holes reach the optimiser (Mark, 2026-11-03: front,
// bottom and back weren't drilled — rp.internal_slides was never collected).
const wb: Material = { id: 'wb', name: 'Whiteboard 16.5mm', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const op = (id: string, target_surface: string, extra: Partial<SlideDrillOp> = {}) => ({
  id, slide_id: 'dp', operation_order: 1, target_surface, machine_operation: 'drill',
  tool_diameter_mm: 5, depth_mm: 10, along_off_mm: 32, up_off_mm: 20, qty: 2, spacing_mm: 32,
  side: 'both', repeat_axis: 'up', router_tool_id: null, drill_id: null, auto_tool: true, notes: null, expressions: null,
  ...extra,
}) as SlideDrillOp
const dp: SlideProduct = {
  id: 'dp', name: 'Dragon Pro 400x95', brand: 'Dragon', kind: 'slide', inside_width_min: null, inside_width_max: null,
  nominal_length: 400, box_height: 95, side_deduction: 0, runner_thickness: 37.5,
  min_runner_depth: null, max_runner_depth: null, soft_close: true, full_extension: true,
  cost_per_pair: null, colour: null, model_url: null, model_format: null, model_scale: 1,
  model_anchor_x: 0, model_anchor_y: 0, model_anchor_z: 0,
  drill_ops: [
    op('m', 'cabinet_member', { repeat_axis: 'along', qty: 3, spacing_mm: 128, up_off_mm: 10 }),
    op('f', 'drawer_front', { tool_diameter_mm: 10, depth_mm: 12, up_off_mm: 64 }),
    op('b', 'drawer_bottom', { qty: 1, up_off_mm: 10, along_off_mm: 50 }),
    op('k', 'drawer_back', { along_off_mm: 15, up_off_mm: 15 }),
  ],
} as SlideProduct

const cab: CabinetInput = {
  id: 'c', assembly_class: 'base', DX: 800, DY: 720, DZ: 560,
  has_carcass: true, has_internal: true, has_face: true, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: wb, door_material: wb, shelf_material: wb, exposed_material: wb,
  toekick_face_material: wb, toekick_interior_material: wb,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
  slide_products: [dp],
  face_grid: {
    rows: [{ row_index: 0, height_locked: false }], cols: [{ col_index: 0, width_locked: false }],
    zones: [{ row_index: 0, col_index: 0, face_type: 'door' }],
  },
  internal_tree: { type: 'open', fittings: [{ type: 'inner_drawer', y_locked: true, y_position: 130, slide_product_id: 'dp', drawer_type: 'system' }] },
}

describe('inner drawer runner holes in the optimiser', () => {
  const rp = resolveCabinet(cab)
  const { rows } = collectDrillRows(rp, 'c')
  const on = (pred: (k: string) => boolean) => rows.filter(r => r.source_table === 'internal_parts' && pred(r.source_part_key))
  const innerHoles = rp.internal_slides.flatMap(s => s.drills)

  it('resolver gives the inner runners holes on every surface', () => {
    for (const s of ['cabinet_member', 'drawer_front', 'drawer_bottom', 'drawer_back'])
      expect(innerHoles.some(d => d.surface === s)).toBe(true)
  })
  it('front, bottom and back holes land on the inner drawer panels', () => {
    expect(on(k => k.startsWith('int_inner_drawer_front_'))).toHaveLength(4)
    expect(on(k => k.startsWith('int_inner_drawer_bottom_'))).toHaveLength(2)
    // 4 fixing holes + a top marker per runner
    expect(on(k => k.startsWith('int_inner_drawer_back_'))).toHaveLength(6)
  })
  it('front holes are on its back face', () => {
    for (const r of on(k => k.startsWith('int_inner_drawer_front_'))) expect(r.plane_kind).toBe('face_back')
  })
  it('gable holes go to both sides', () => {
    const g = rows.filter(r => r.source_table === 'case_parts' && r.operation_key.startsWith('islide_'))
    expect(g.filter(r => r.source_part_key === 'case_left_side')).toHaveLength(3)
    expect(g.filter(r => r.source_part_key === 'case_right_side')).toHaveLength(3)
  })
  it('holes sit inside each panel', () => {
    for (const r of on(k => k.startsWith('int_inner_drawer_'))) {
      const p = rp.internal_parts.find(ip => `int_${ip.part_type}_${ip.sort_order}` === r.source_part_key)!
      expect(r.pos_x).toBeGreaterThanOrEqual(0); expect(r.pos_x).toBeLessThanOrEqual(p.DX)
      expect(r.pos_y).toBeGreaterThanOrEqual(0); expect(r.pos_y).toBeLessThanOrEqual(p.DY)
    }
  })
})
