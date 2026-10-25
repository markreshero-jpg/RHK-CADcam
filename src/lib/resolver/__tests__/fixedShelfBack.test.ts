import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type ConstructionRules, type JointTypeOp, type Material } from '../types'
import { cabinetSeamDrills } from '../../jointDrilling'

// Fixed shelves screw into the back as well as the gables (Mark, 2026-10-25:
// "fixed shelves don't have construction holes into backs"). The CM key
// fixed_shelf:back falls back to the shelf's side joint.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
// 5mm dynamic holes: 50 in from each end, ~280 apart, bored through part B's face.
const dyn: JointTypeOp = {
  id: 'dyn', joint_type_id: 'dyn', operation_order: 0, target_part: 'part_b', machine_operation: 'drill', face: 'normal',
  tool_diameter_mm: 5, depth_mm: 12, offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: 50,
  qty: 2, spacing_mm: null, qty2: 1, spacing2_mm: null, router_tool_id: null, drill_id: null, auto_tool: false, notes: null,
  expressions: { qty: 'Math.ceil((D - 100) / 280) + 1', depth_mm: 'T', spacing_mm: '(D - 100) / Math.ceil((D - 100) / 280)', offset_y_mm: 'T / 2' },
} as unknown as JointTypeOp

const cab = (o: Partial<CabinetInput> = {}, rules: Partial<ConstructionRules> = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'upper', DX: 900, DY: 720, DZ: 330,
  has_carcass: true, has_internal: true, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, rules), top_type: 'full_top',
  face_grid: { rows: [], cols: [], zones: [] },
  internal_tree: { type: 'open', fittings: [{ type: 'fixed_shelf', y_locked: false }] },
  joint_defaults: { 'fixed_shelf:side': 'dyn' }, joint_type_ops: { dyn: [dyn] }, joint_type_names: { dyn: 'Dyn 5mm' },
  ...o,
} as CabinetInput)

const backSeam = (c: CabinetInput) => resolveCabinet(c).seam_joints.find(s => s.seam_key === 'int_fixed_shelf_0|back')

describe('fixed shelf into the back', () => {
  it('inherits the side joint and drills through the back into the shelf', () => {
    const rp = resolveCabinet(cab())
    const sj = rp.seam_joints.find(s => s.seam_key === 'int_fixed_shelf_0|back')!
    expect(sj.joint_type_id).toBe('dyn')
    const shelf = rp.internal_parts.find(p => p.part_type === 'fixed_shelf')!
    const drills = cabinetSeamDrills(rp).filter(d => d.seamKey === sj.seam_key)
    const intoBack = drills.filter(d => d.targetPartKey === 'back')
    expect(intoBack.length).toBe(Math.ceil((shelf.DY - 100) / 280) + 1)
    for (const d of intoBack) {
      expect(d.y).toBeCloseTo(shelf.Y + shelf.DZ / 2)
      expect(d.x).toBeGreaterThan(shelf.X)
      expect(d.x).toBeLessThan(shelf.X + shelf.DY)
    }
    // Side seams are untouched.
    expect(rp.seam_joints.some(s => s.seam_key === 'int_fixed_shelf_0:left')).toBe(true)
  })

  it('its own CM joint wins over the side joint', () => {
    const sj = backSeam(cab({ joint_defaults: { 'fixed_shelf:side': 'dyn', 'fixed_shelf:back': 'other' }, joint_type_ops: { dyn: [dyn], other: [dyn] } }))
    expect(sj?.joint_type_id).toBe('other')
  })

  it('a per-cabinet null suppresses it', () => {
    expect(backSeam(cab({ carcase_joints: { 'int_fixed_shelf_0|back': null } }))).toBeUndefined()
  })

  it('no seam when the shelf is set back off the back, or there is no back', () => {
    expect(backSeam(cab({}, { FIXSB_B: 10 }))).toBeUndefined()
    expect(backSeam(cab({}, { BACK_TYPE: 'none' }))).toBeUndefined()
  })

  it('adjustable shelves never pin into a plain back', () => {
    const rp = resolveCabinet(cab({
      internal_tree: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: false }] },
      joint_defaults: { 'adj_shelf:side': 'dyn', 'adj_shelf:back': 'dyn' },
    }))
    expect(rp.seam_joints.some(s => s.seam_key.endsWith('|back'))).toBe(false)
  })
})
