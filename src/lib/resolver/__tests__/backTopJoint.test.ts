import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { cabinetSeamDrills, caseBox } from '../../jointDrilling'
import { toGenericSeamKey } from '../../cabinetSeams'
import { DEFAULT_RULES, type CabinetInput, type ConstructionRules, type JointTypeOp, type Material } from '../types'

// back:full_top — wall / tall cabinets: the back fixes to the full top (Mark,
// 2026-11-25, RHK6563 Study WC-05: "isn't showing top construction holes into
// the back"). Inherits the back:bottom joint unless the method sets its own.
const board: Material = { id: 'm16', name: 'Board 16.5', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
// The shop's "5mm Dynamic Holes": 50 in from each end, ≤ 280 apart, through part B.
const dynOp = {
  id: 'op1', target_part: 'part_b', face: 'normal', machine_operation: 'drill',
  tool_diameter_mm: 5, depth_mm: 15, offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: 50,
  qty: 2, spacing_mm: 150, qty2: 1, spacing2_mm: null,
  expressions: { qty: 'Math.ceil((D - 100) / 280) + 1', depth_mm: 'T', spacing_mm: '(D - 100) / Math.ceil((D - 100) / 280)', offset_y_mm: 'CW / 2' },
} as unknown as JointTypeOp

const cab = (rules: Partial<ConstructionRules> = {}, over: Partial<CabinetInput> = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'wall', DX: 1544, DY: 370, DZ: 300, top_type: 'full_top',
  has_carcass: true, has_internal: false, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, { SCRBK: 0, ...rules }),
  face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
  joint_defaults: { 'back:bottom': 'dyn' },
  joint_type_ops: { dyn: [dynOp] }, joint_type_names: { dyn: '5mm Dynamic Holes' },
  ...over,
})

describe('back ↔ full top joint', () => {
  it('falls back to the back:bottom joint', () => {
    expect(toGenericSeamKey('back:full_top')).toBe('back:bottom')
    const rp = resolveCabinet(cab({ TOP_BACK_JOIN: 'sits_over_back' }))
    const sj = rp.seam_joints.find(s => s.seam_key === 'back:full_top')
    expect(sj?.joint_type_id).toBe('dyn')
    expect(sj?.source).toBe('method')
  })

  it('top over the back: holes up through the top, centred on the back, spread along it', () => {
    const rp = resolveCabinet(cab({ TOP_BACK_JOIN: 'sits_over_back' }))
    const top  = caseBox(rp.case_parts.find(p => p.part_key === 'full_top')!)
    const back = caseBox(rp.case_parts.find(p => p.part_key === 'back')!)
    const ds = cabinetSeamDrills(rp).filter(d => d.seamKey === 'back:full_top')
    const xs = ds.map(d => d.x).sort((a, b) => a - b)
    expect(ds.length).toBeGreaterThan(2)
    expect(xs[0]).toBeCloseTo(back.x + 50)
    expect(xs[xs.length - 1]).toBeCloseTo(back.x + back.w - 50)
    for (const d of ds) {
      expect(d.targetPartKey).toBe('full_top')
      expect(d.axis).toBe('y+')
      expect(d.y).toBeCloseTo(top.y)
      expect(d.depthLen).toBeCloseTo(top.h)
      expect(d.z).toBeCloseTo(back.z + back.d / 2)
    }
    // Same layout as the holes through the bottom.
    const bot = cabinetSeamDrills(rp).filter(d => d.seamKey === 'back:bottom').map(d => d.x).sort((a, b) => a - b)
    expect(xs).toEqual(bot)
  })

  it('top butting into the back: holes through the back where the top lands', () => {
    const rp = resolveCabinet(cab({ TOP_BACK_JOIN: 'butts_into_back' }))
    const top  = caseBox(rp.case_parts.find(p => p.part_key === 'full_top')!)
    const back = caseBox(rp.case_parts.find(p => p.part_key === 'back')!)
    const ds = cabinetSeamDrills(rp).filter(d => d.seamKey === 'back:full_top')
    expect(ds.length).toBeGreaterThan(2)
    for (const d of ds) {
      expect(d.targetPartKey).toBe('back')
      expect(d.axis).toBe('z-')
      expect(d.z).toBeCloseTo(back.z + back.d)
      expect(d.y).toBeCloseTo(top.y + top.h / 2)
    }
  })

  it('the method can set its own joint, and a cabinet can turn it off', () => {
    const own = resolveCabinet(cab({}, { joint_defaults: { 'back:bottom': 'dyn', 'back:full_top': 'other' }, joint_type_ops: { dyn: [dynOp], other: [dynOp] } }))
    expect(own.seam_joints.find(s => s.seam_key === 'back:full_top')?.joint_type_id).toBe('other')
    const off = resolveCabinet(cab({}, { carcase_joints: { 'back:full_top': null } }))
    expect(off.seam_joints.some(s => s.seam_key === 'back:full_top')).toBe(false)
  })

  it('no joint when the back stops short of the top (BKTOP)', () => {
    const rp = resolveCabinet(cab({ BKTOP: 200 }))
    expect(rp.seam_joints.some(s => s.seam_key === 'back:full_top')).toBe(false)
  })
})
