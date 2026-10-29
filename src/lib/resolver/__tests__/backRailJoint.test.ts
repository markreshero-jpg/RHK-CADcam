import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { cabinetSeamDrills, caseBox } from '../../jointDrilling'
import { DEFAULT_RULES, type CabinetInput, type ConstructionRules, type JointTypeOp, type Material } from '../types'

// back:back_rail — the back panel fixes to the back top rail's back edge
// ("5mm Dynamic Holes": 50 in from each end, ≤ 280 apart, into part B).
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const dynOp = {
  id: 'op1', target_part: 'part_b', face: 'normal', machine_operation: 'drill',
  tool_diameter_mm: 5, depth_mm: 15, offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: 50,
  qty: 2, spacing_mm: 150, qty2: 1, spacing2_mm: null,
  expressions: { qty: 'Math.ceil((D - 100) / 280) + 1', depth_mm: 'T', spacing_mm: '(D - 100) / Math.ceil((D - 100) / 280)', offset_y_mm: 'T / 2' },
} as unknown as JointTypeOp

const cab = (rules: Partial<ConstructionRules> = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 900, DY: 900, DZ: 580, top_type: 'double_rail',
  has_carcass: true, has_internal: false, has_face: false, has_toekick: true,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, { RD: 100, ...rules }),
  face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
  joint_defaults: { 'back:back_rail': 'dyn' },
  joint_type_ops: { dyn: [dynOp] }, joint_type_names: { dyn: '5mm Dynamic Holes' },
})

describe('back rail ↔ back panel joint', () => {
  it('drills the back rail\'s back edge, spread along its length', () => {
    const rp = resolveCabinet(cab())
    expect(rp.seam_joints.some(s => s.seam_key === 'back:back_rail')).toBe(true)
    const rail = caseBox(rp.case_parts.find(p => p.part_key === 'back_rail')!)
    const ds = cabinetSeamDrills(rp).filter(d => d.seamKey === 'back:back_rail')
    const xs = ds.map(d => d.x).sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(rail.x + 50)
    expect(xs[xs.length - 1]).toBeCloseTo(rail.x + rail.w - 50)
    for (const d of ds) {
      expect(d.axis).toBe('z+')
      expect(d.z).toBeCloseTo(rail.z)
      expect(d.y).toBeCloseTo(rail.y + rail.h / 2)
    }
  })

  it('rail sitting over the back drills up into its underside', () => {
    const rp = resolveCabinet(cab({ TOP_BACK_JOIN: 'sits_over_back' }))
    const ds = cabinetSeamDrills(rp).filter(d => d.seamKey === 'back:back_rail')
    expect(ds.length).toBeGreaterThan(1)
    for (const d of ds) expect(d.axis).toBe('y+')
  })
})
