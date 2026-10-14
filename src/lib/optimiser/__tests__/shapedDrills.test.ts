import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { collectDrillRows } from '../seamDrillSync'
import { resolveCabinet } from '../../resolver/resolver'
import { mergeRules } from '../../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type HingeHardwareInput, type HingePlateInput } from '../../resolver/types'
import { buildPresetFootprint } from '../../cabinetShape/presets'
import { zoneBlank } from '../../jointDrilling'

// z_cabinet_shape 3c: CNC drilling for facet doors and plates on angled panels.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const hinge: HingeHardwareInput = {
  id: 'h', default_hinge_edge: 'left', cup_x_from_edge_mm: 22, cup_diameter: 35, cup_depth_mm: 12,
  anchor_holes: [], model_combined_url: null, model_combined_scale: 1,
  bore_centre_to_door_face_mm: null, open_angle_deg: 110, model_arm_fold_fraction: 0.5,
}
const plate: HingePlateInput = {
  id: 'p', plate_offset_mm: 37, compatible_surfaces: ['side'],
  mounting_hole_pattern: [{ offset_x: -16, offset_y: 0, diameter: 5, depth: 12 }, { offset_x: 16, offset_y: 0, diameter: 5, depth: 12 }],
  model_plate_url: null, model_plate_scale: 1, model_plate_anchor_x: 0, model_plate_anchor_y: 0, model_plate_anchor_z: 0,
}
const oneDoor = (hinge_side: 'left' | 'right') => ({
  rows: [{ row_index: 0, height_locked: false }],
  cols: [{ col_index: 0, width_locked: false }],
  zones: [{ row_index: 0, col_index: 0, face_type: 'door' as const, hinge_side }],
})
const cab = (o: Partial<CabinetInput>): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 900, DY: 870, DZ: 580,
  has_carcass: true, has_internal: false, has_face: true, has_toekick: true,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
  face_grid: oneDoor('left'), internal_tree: { type: 'open', fittings: [] },
  hinge_hardware: hinge, hinge_plate: plate,
  ...o,
})

describe('shaped cabinet drilling', () => {
  it('a mitred facet door gets its cups, on its blank, and the plates land on the end panel', () => {
    const fp = buildPresetFootprint('clipped_corner', {}, { w: 900, d: 580 })
    const rp = resolveCabinet(cab({ footprint: fp }))
    const { rows } = collectDrillRows(rp, 'c1')
    const z = rp.face_zones.find(f => f.facet === 'facet')!
    const blank = zoneBlank(z)
    const cups = rows.filter(r => r.source_part_key === 'zone_facet.0_0' && r.parameters.kind === 'hinge_cup')
    expect(cups.length).toBe(2)
    // Hinged right (toward the end panel): cup 22 in from the blank's right edge
    // (that edge is square — the mitre is on the left).
    for (const c of cups) expect(c.pos_x).toBeCloseTo(blank.width - 22, 1)
    const plates = rows.filter(r => r.source_part_key === 'case_right_side' && r.parameters.kind === 'hinge_plate')
    expect(plates.length).toBe(4)
    const side = rp.case_parts.find(p => p.part_key === 'right_side')!
    for (const p of plates) {
      expect(p.output_face).toBe('right')       // bored from the inside, like a gable plate
      expect(p.pos_x).toBeGreaterThan(0); expect(p.pos_x).toBeLessThan(side.DX)
    }
  })

  it('a door on an angled side panel drills that panel in its own frame', () => {
    const fp = buildPresetFootprint('trapezoid', { inset_l: 100, inset_r: 100 }, { w: 900, d: 580 })
    const rp = resolveCabinet(cab({ footprint: fp }))
    const { rows } = collectDrillRows(rp, 'c1')
    const plates = rows.filter(r => r.parameters.kind === 'hinge_plate')
    expect(plates.length).toBe(4)
    const panel = rp.case_parts.find(p => `case_${p.part_key}` === plates[0].source_part_key)!
    expect(panel.part_key.startsWith('side:')).toBe(true)
    for (const p of plates) {
      expect(p.output_face).toBe('back')        // the unturned panel's inner face
      expect(p.pos_x).toBeGreaterThan(0); expect(p.pos_x).toBeLessThan(panel.DX)   // height
      expect(p.pos_y).toBeGreaterThan(0); expect(p.pos_y).toBeLessThan(panel.DY)   // along the panel
    }
  })
})
