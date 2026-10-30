// Joint connectors on the hardware list (z_joints C4): one Cabineo per set of
// the joint's fitting-carrying op, counted off a real resolved cabinet.
import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../../resolver/resolver'
import { mergeRules } from '../../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type JointTypeOp, type Material, type ResolvedCabinet } from '../../resolver/types'
import { buildHardware, type TakeoffCab } from '../hardware'

const board: Material = { id: 'm16', name: 'Board 16', DZ: 16, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const Q = 'Math.ceil((D - 100) / 280) + 1', SPC = '(D - 100) / Math.ceil((D - 100) / 280)'
const fitting = { id: 'cab12', name: 'Lamello Cabineo 12, collar on surface', colour: null, model: null }
const pocket = {
  id: 'op1', target_part: 'part_a', face: 'inside', machine_operation: 'drill',
  tool_diameter_mm: 15, depth_mm: 11, offset_x_mm: 14.8, offset_y_mm: 0, offset_z_mm: 50,
  qty: 2, spacing_mm: 150, qty2: 3, spacing2_mm: 11.2, expressions: { qty: Q, spacing_mm: SPC }, fitting,
} as unknown as JointTypeOp
const screw = {
  id: 'op2', target_part: 'part_b', face: 'normal', machine_operation: 'drill', stopped: true,
  tool_diameter_mm: 5, depth_mm: 12, offset_x_mm: 0, offset_y_mm: 5, offset_z_mm: 50,
  qty: 2, spacing_mm: 150, qty2: 1, spacing2_mm: null, expressions: { qty: Q, spacing_mm: SPC, offset_y_mm: 'IN ? 5 : CW - 5' },
} as unknown as JointTypeOp

const cab: CabinetInput = {
  id: 'c1', assembly_class: 'base', DX: 600, DY: 720, DZ: 560, top_type: 'double_rail',
  has_carcass: true, has_internal: false, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, {}),
  face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
  joint_defaults: { 'bottom:left_side': 'cab' },
  joint_type_ops: { cab: [pocket, screw] }, joint_type_names: { cab: 'Lamello Cabineo 12 - inside' },
}

describe('connectors on the hardware list', () => {
  it('counts one Cabineo per set on the joint', () => {
    const rp: ResolvedCabinet = resolveCabinet(cab)
    const cabs = [{ id: 'c1', room_id: 'r1', label: 'B1', is_kick_assembly: false }] as unknown as TakeoffCab[]
    const P = { hinges: new Map(), plates: new Map(), slides: new Map(), handles: new Map(),
      accessories: new Map([['cab12', { name: 'Lamello Cabineo 12, collar on surface', brand: 'Lamello', code: null }]]) }
    const hw = buildHardware(['r1'], cabs, new Map([['c1', rp]]), P)
    const line = hw.rooms[0].lines.find(l => l.group === 'Connectors')!
    // Bottom ↔ left gable only, ~560 deep: 3 sets at ≤ 280.
    expect(line.qty).toBe(3)
    expect(line).toMatchObject({ name: 'Lamello Cabineo 12, collar on surface', brand: 'Lamello', unit: 'ea' })
    expect(line.cabinets).toEqual([{ label: 'B1', qty: line.qty }])
    expect(hw.totals.find(l => l.group === 'Connectors')!.qty).toBe(line.qty)
  })
})
