import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { toGenericSeamKey } from '../../cabinetSeams'
import { cabinetSeamDrills } from '../../jointDrilling'
import { DEFAULT_RULES, type CabinetInput, type ConstructionRules, type Material } from '../types'

// BOTTOM_TYPE / cabinet bottom_type: full bottom, front + back rails, or none.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const cab = (rules: Partial<ConstructionRules>, bottom_type?: CabinetInput['bottom_type'], extra: Partial<CabinetInput> = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 600, DY: 900, DZ: 580,
  has_carcass: true, has_internal: false, has_face: false, has_toekick: true,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, rules), bottom_type,
  face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
  ...extra,
})
const parts = (rules: Partial<ConstructionRules>, b?: CabinetInput['bottom_type']) => resolveCabinet(cab(rules, b)).case_parts
const keys = (rules: Partial<ConstructionRules>, b?: CabinetInput['bottom_type']) => parts(rules, b).map(p => p.part_key)

describe('BOTTOM_TYPE', () => {
  it('full (default) keeps the bottom panel', () => {
    expect(keys({})).toContain('bottom')
    expect(keys({})).not.toContain('bottom_front_rail')
  })

  it('rails: front + back rails, flat, RD deep, in the bottom plane', () => {
    const full = parts({}).find(p => p.part_key === 'bottom')!
    const ps = parts({ RD: 100 }, 'rails')
    expect(ps.some(p => p.part_key === 'bottom')).toBe(false)
    const fr = ps.find(p => p.part_key === 'bottom_front_rail')!
    const br = ps.find(p => p.part_key === 'bottom_back_rail')!
    for (const r of [fr, br]) {
      expect(r.DX).toBe(100)
      expect(r.DY).toBe(full.DY)
      expect(r.DZ).toBe(full.DZ)
      expect(r.X).toBe(full.X)
      expect(r.Y).toBe(full.Y)
      expect(r.upright).toBeUndefined()
    }
    expect(fr.Z + fr.DX).toBe(full.Z + full.DX)   // front edge = bottom's front edge
    expect(br.Z).toBe(full.Z)                      // back edge = bottom's back line
  })

  it('method rule sets it; the cabinet column overrides the method', () => {
    expect(keys({ BOTTOM_TYPE: 'rails' })).toContain('bottom_front_rail')
    expect(keys({ BOTTOM_TYPE: 'rails' }, 'full')).toContain('bottom')
  })

  it('none: no bottom parts; gables run down even with bottom_outside', () => {
    const ps = parts({ BOTTOM_JOIN: 'bottom_outside' }, 'none')
    expect(ps.some(p => p.part_key.startsWith('bottom'))).toBe(false)
    const withBottom = parts({ BOTTOM_JOIN: 'bottom_outside' }).find(p => p.part_key === 'left_side')!
    const left = ps.find(p => p.part_key === 'left_side')!
    expect(left.Y).toBe(withBottom.Y - 18)
  })

  it('rail seams fall back to the bottom panel joints', () => {
    expect(toGenericSeamKey('bottom_front_rail:left_side')).toBe('bottom:left_side')
    expect(toGenericSeamKey('bottom_back_rail:right_side')).toBe('bottom:right_side')
    expect(toGenericSeamKey('back:bottom_back_rail')).toBe('back:bottom')
  })

  it('rails drill into both gables with the bottom joint', () => {
    const ops = [{
      id: 'op1', target_part: 'part_b', face: 'normal', machine_operation: 'drill',
      tool_diameter_mm: 5, depth_mm: 15, offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: 25,
      qty: 2, spacing_mm: 30, qty2: 1, spacing2_mm: null,
      expressions: { depth_mm: 'T', offset_y_mm: 'T / 2', spacing_mm: 'D - 50' },
    }]
    const rp = resolveCabinet(cab({}, 'rails', {
      joint_defaults: { 'bottom:left_side': 'j1', 'bottom:right_side': 'j1' },
      joint_type_ops: { j1: ops as never },
      joint_type_names: { j1: 'Screw' },
    }))
    const seams = (rp.seam_joints ?? []).map(s => s.seam_key).sort()
    expect(seams).toEqual(['bottom_back_rail:left_side', 'bottom_back_rail:right_side', 'bottom_front_rail:left_side', 'bottom_front_rail:right_side'])
    const drills = cabinetSeamDrills(rp)
    // 2 holes 25 in from each end of each rail (D = the rail's 100 depth)
    for (const k of ['bottom_front_rail:left_side', 'bottom_back_rail:right_side'])
      expect(drills.filter(d => d.seamKey === k).length).toBe(2)
  })
})
