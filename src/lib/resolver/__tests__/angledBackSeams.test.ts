import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type JointTypeOp, type Material } from '../types'
import { cabinetSeamDrills } from '../../jointDrilling'

// RHK6581 J04 TC-08 (Mark, 2026-10-25: "the drilling etc doesn't work"): an
// open tall with its back-right corner clipped — a straight back, then a second
// back at 30° running to a short right gable. Holes follow the angled edges;
// the angled panel-to-panel joints are flagged for fixing by hand.
const board: Material = { id: 'm', name: 'B16', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const dyn = {
  id: 'dyn', joint_type_id: 'dyn', operation_order: 0, target_part: 'part_b', machine_operation: 'drill', face: 'normal',
  tool_diameter_mm: 5, depth_mm: 12, offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: 50, qty: 2, spacing_mm: null, qty2: 1, spacing2_mm: null,
  router_tool_id: null, drill_id: null, auto_tool: false, notes: null,
  expressions: { qty: 'Math.ceil((D - 100) / 280) + 1', depth_mm: 'T', spacing_mm: '(D - 100) / Math.ceil((D - 100) / 280)', offset_y_mm: 'T / 2' },
} as unknown as JointTypeOp
const keys = ['bottom:left_side', 'bottom:right_side', 'back:left_side', 'back:right_side', 'back:bottom', 'full_top:left_side', 'full_top:right_side', 'fixed_shelf:side']
const seg = (x0: number, y0: number, x1: number, y1: number, id: string, role: string) =>
  ({ p0: { x: x0, y: y0 }, p1: { x: x1, y: y1 }, edge: { id, role }, type: 'line' })
const cab = {
  id: 'c', assembly_class: 'tall', DX: 796, DY: 2370, DZ: 400, has_carcass: true, has_internal: true, has_face: false, has_toekick: true,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board, toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES), top_type: 'full_top', face_grid: { rows: [], cols: [], zones: [] },
  internal_tree: { type: 'open', fittings: [1, 2, 3, 4, 5].map(() => ({ type: 'fixed_shelf', y_locked: false })) },
  joint_defaults: Object.fromEntries(keys.map(k => [k, 'dyn'])), joint_type_ops: { dyn: [dyn] }, joint_type_names: { dyn: 'Dyn' },
  footprint: { segments: [
    seg(0, 0, 359, 0, 'back', 'back'), seg(359, 0, 796, 257, 'back2', 'back'), seg(796, 257, 796, 400, 'end', 'side'),
    seg(796, 400, 0, 400, 'front', 'front'), seg(0, 400, 0, 0, 'side', 'side'),
  ] },
} as unknown as CabinetInput

const rp = resolveCabinet(cab)
const drills = cabinetSeamDrills(rp)
const at = (key: string) => drills.filter(d => d.seamKey === key)
// Inner face of the angled back in plan: z on that line at x.
const back2 = rp.case_parts.find(p => p.part_key === 'back:back2')!
const slope = Math.tan(-back2.AY * Math.PI / 180)

describe('angled back (clipped corner) drilling', () => {
  it('no seam between the straight back and a gable it never reaches', () => {
    expect(rp.seam_joints.some(s => s.seam_key === 'back:right_side')).toBe(false)
    expect(at('back:left_side').length).toBeGreaterThan(0)
  })

  it('the angled back on the bottom: holes follow its line', () => {
    const hs = at('back:back2|bottom')
    expect(hs.length).toBe(3)
    const zs = hs.map(d => d.z)
    expect(new Set(zs.map(Math.round)).size).toBe(3)
    // Consecutive holes climb at the back's angle.
    const s = [...hs].sort((a, b) => a.x - b.x)
    expect((s[2].z - s[0].z) / (s[2].x - s[0].x)).toBeCloseTo(slope, 2)
  })

  it('fixed shelves drill through both backs along their edges', () => {
    for (let i = 0; i < 5; i++) {
      expect(at(`int_fixed_shelf_${i}|back`).length).toBeGreaterThan(0)
      const hs = at(`int_fixed_shelf_${i}|back:back2`)
      expect(hs.length).toBeGreaterThan(0)
      const s = [...hs].sort((a, b) => a.x - b.x)
      expect((s[s.length - 1].z - s[0].z) / (s[s.length - 1].x - s[0].x)).toBeCloseTo(slope, 2)
    }
  })

  it('angled panel-to-panel joints: no holes, flagged hand-fix', () => {
    const hf = rp.warnings.filter(w => w.code === 'HAND_FIX_JOINT')
    expect(hf.map(w => w.part).sort()).toEqual(['back:back2|right_side', 'back|back:back2'])
    expect(hf.find(w => w.part === 'back|back:back2')!.message).toContain('30°')
    expect(rp.seam_joints.some(s => /back:back2\|right_side|right_side\|back:back2|back\|back:back2|back:back2\|back$/.test(s.seam_key))).toBe(false)
  })
})
