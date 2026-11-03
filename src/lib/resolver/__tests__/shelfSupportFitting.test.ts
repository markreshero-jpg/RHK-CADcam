import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type JointTypeOp, type Material } from '../types'
import { cabinetSeamFittings } from '../../jointDrilling'

// Shelf supports (Mark, 2026-11-03): an adj-shelf pin joint op carrying a
// fitting puts one support in the middle hole of each cluster — the hole 4
// below the shelf's underside (offset_y = T + 4).
const board: Material = { id: 'm', name: 'Board', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const support = { id: 'ssw', name: 'SSW support', colour: '#f2f2f2', model: null }
const pins = (fit: boolean): JointTypeOp => ({
  id: 'p', joint_type_id: 'p', operation_order: 0, target_part: 'part_b', machine_operation: 'drill', face: 'normal',
  tool_diameter_mm: 5, depth_mm: 12, offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: 50,
  qty: 2, spacing_mm: 100, qty2: 5, spacing2_mm: 32, router_tool_id: null, drill_id: null, auto_tool: false, notes: null,
  expressions: { spacing_mm: 'D - 100', offset_y_mm: 'T + 4' }, fitting: fit ? support : null,
} as unknown as JointTypeOp)

const cab = (fit = true): CabinetInput => ({
  id: 'c1', assembly_class: 'tall', DX: 900, DY: 2000, DZ: 520,
  has_carcass: true, has_internal: true, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, {}), top_type: 'full_top',
  face_grid: { rows: [], cols: [], zones: [] },
  internal_tree: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: false }] },
  joint_defaults: { 'adj_shelf:side': 'p' }, joint_type_ops: { p: [pins(fit)] }, joint_type_names: { p: 'Pins' },
} as CabinetInput)

describe('shelf support fittings', () => {
  it('one support per front/back set per side, 4 below the shelf underside, pointing up', () => {
    const rp = resolveCabinet(cab())
    const shelf = rp.internal_parts.find(p => p.part_type === 'adj_shelf')!
    const f = cabinetSeamFittings(rp)
    expect(f.length).toBe(4)
    for (const d of f) {
      expect(d.fitting!.kind).toBe('pin')
      expect(d.fitting!.toward).toBe('y-')
      expect(d.y).toBeCloseTo(shelf.Y - 4)
      expect(['left_side', 'right_side']).toContain(d.targetPartKey)
    }
  })

  it('no fitting on the op, no supports', () => {
    expect(cabinetSeamFittings(resolveCabinet(cab(false)))).toEqual([])
  })
})
