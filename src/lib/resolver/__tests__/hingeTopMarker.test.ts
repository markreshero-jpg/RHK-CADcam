import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type HingeHardwareInput, type HingePlateInput, type Material } from '../types'
import { checkHingeShelfHoleClash } from '../hingeClash'

// Top-of-cabinet marker: 5 dia x 2 deep on the gable at the top hinge's centre,
// 16 back from the gable's front edge. Side-hung doors only.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const hinge: HingeHardwareInput = {
  id: 'h110', name: 'Blum 110', default_hinge_edge: 'left', cup_x_from_edge_mm: 22, cup_diameter: 35, cup_depth_mm: 13.5,
  anchor_holes: [], model_combined_url: null, model_combined_scale: 1, bore_centre_to_door_face_mm: null, open_angle_deg: null,
  model_arm_fold_fraction: 0.5,
}
const plate = {
  id: 'p1', plate_offset_mm: 0, model_plate_url: null, model_plate_scale: 1,
  model_plate_anchor_x: 0, model_plate_anchor_y: 0, model_plate_anchor_z: 0,
  mounting_hole_pattern: [{ offset_x: -37, offset_y: -16, diameter: 5, depth: 12 }, { offset_x: -37, offset_y: 16, diameter: 5, depth: 12 }],
} as unknown as HingePlateInput
const grid = (sides: ('left' | 'right' | 'top' | 'bottom')[]) => ({
  rows: [{ row_index: 0, height_locked: false }],
  cols: sides.map((_, i) => ({ col_index: i, width_locked: false })),
  zones: sides.map((s, i) => ({ row_index: 0, col_index: i, face_type: 'door' as const, hinge_side: s })),
})
const cab = (sides: ('left' | 'right' | 'top' | 'bottom')[]): CabinetInput => ({
  id: 'c1', assembly_class: 'tall', DX: 900, DY: 2100, DZ: 580,
  has_carcass: true, has_internal: false, has_face: true, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, { TOP_TYPE: 'full_top' }),
  hinge_hardware: hinge, hinge_plate: plate, face_grid: grid(sides), internal_tree: { type: 'open', fittings: [] },
})

const markers = (rp: ReturnType<typeof resolveCabinet>) =>
  rp.hinge_instances.flatMap(h => h.plate_drills.filter(d => d.kind === 'marker').map(d => ({ h, d })))

describe('hinge top marker', () => {
  it('one marker per side-hung door, on its top hinge, between the plate holes', () => {
    const rp = resolveCabinet(cab(['left', 'right']))
    const ms = markers(rp)
    expect(ms).toHaveLength(2)
    for (const { h, d } of ms) {
      const doorHinges = rp.hinge_instances.filter(o => o.col_index === h.col_index)
      expect(h.cup_drills[0].y).toBe(Math.max(...doorHinges.map(o => o.cup_drills[0].y)))
      const plates = h.plate_drills.filter(p => p.kind === 'plate')
      expect(d.y).toBeCloseTo((plates[0].y + plates[1].y) / 2)
      expect(d.x).toBe(plates[0].x)
      expect(d.axis).toBe(plates[0].axis)
      expect(d.radius).toBe(2.5)
      expect(d.depthLen).toBe(2)
      const gable = rp.case_parts.find(p => p.part_key === h.mount_target!.part_key)!
      expect(d.z).toBeCloseTo(gable.Z + gable.DX - 16)
    }
  })
  it('no marker on top or bottom hinged doors', () => {
    expect(markers(resolveCabinet(cab(['top'])))).toEqual([])
    expect(markers(resolveCabinet(cab(['bottom'])))).toEqual([])
  })
  it('the marker does not trip the plate clash checks', () => {
    const rp = resolveCabinet(cab(['left']))
    expect(checkHingeShelfHoleClash(rp.hinge_instances, rp.case_parts, rp.internal_parts, rp.seam_joints)).toEqual([])
  })
})
