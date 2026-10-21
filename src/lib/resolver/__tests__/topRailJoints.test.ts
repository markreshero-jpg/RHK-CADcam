import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { cabinetSeamDrills } from '../../jointDrilling'
import { DEFAULT_RULES, type CabinetInput, type JointTypeOp, type Material } from '../types'

// Double-rail tops: the back rail fixes into the gables like the front rail.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
// "5mm Hole For Rails": 2 holes, 25 in from each end of the rail.
const railOp = {
  id: 'op1', target_part: 'part_b', face: 'normal', machine_operation: 'drill',
  tool_diameter_mm: 5, depth_mm: 15, offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: 25,
  qty: 2, spacing_mm: 30, qty2: 1, spacing2_mm: null,
  expressions: { depth_mm: 'T', offset_y_mm: 'T / 2', spacing_mm: 'D - 50' },
} as unknown as JointTypeOp

const cab = (top_type: CabinetInput['top_type'], extra: Partial<CabinetInput> = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 600, DY: 900, DZ: 580,
  has_carcass: true, has_internal: false, has_face: false, has_toekick: true,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, { RD: 100 }), top_type,
  face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
  joint_defaults: { 'top:left_side': 'rail', 'top:right_side': 'rail' },
  joint_type_ops: { rail: [railOp] }, joint_type_names: { rail: 'Rail' },
  ...extra,
})

describe('double-rail top joints', () => {
  it('both rails get seams into both gables', () => {
    const keys = resolveCabinet(cab('double_rail')).seam_joints.map(s => s.seam_key).sort()
    expect(keys).toEqual(['back_rail:left_side', 'back_rail:right_side', 'front_rail:left_side', 'front_rail:right_side'])
  })

  it('back rail follows a per-cabinet front-rail joint unless set itself', () => {
    const none = resolveCabinet(cab('double_rail', { carcase_joints: { 'front_rail:left_side': null } })).seam_joints
    expect(none.some(s => s.seam_key === 'back_rail:left_side')).toBe(false)
    const own = resolveCabinet(cab('double_rail', { carcase_joints: { 'front_rail:left_side': null, 'back_rail:left_side': 'rail' } })).seam_joints
    expect(own.some(s => s.seam_key === 'back_rail:left_side')).toBe(true)
  })

  it('rail holes sit 25 in from each end of each rail', () => {
    const rp = resolveCabinet(cab('double_rail'))
    for (const key of ['front_rail', 'back_rail']) {
      const rail = rp.case_parts.find(p => p.part_key === key)!
      const zs = cabinetSeamDrills(rp).filter(d => d.seamKey === `${key}:left_side`).map(d => d.z).sort((a, b) => a - b)
      expect(zs).toEqual([rail.Z + 25, rail.Z + rail.DX - 25])
    }
  })
})
