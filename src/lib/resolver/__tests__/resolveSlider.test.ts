import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { sliderProfiles, sliderCuts } from '../sliderSC'
import { DEFAULT_RULES, type CabinetInput, type ConstructionRules, type HingeHardwareInput, type Material, type HandleProductInput } from '../types'

// z_slider_sc S2: Häfele Slider SC doors on a face-only recess item.
const board: Material = { id: 'm16', name: 'Board 16', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const hinge: HingeHardwareInput = {
  id: 'h110', name: 'Blum 110', default_hinge_edge: 'left', cup_x_from_edge_mm: 22, cup_diameter: 35, cup_depth_mm: 13.5,
  anchor_holes: [], model_combined_url: null, model_combined_scale: 1, bore_centre_to_door_face_mm: null, open_angle_deg: null,
  model_arm_fold_fraction: 0.5,
}
const bar160: HandleProductInput = { id: 'h160', name: 'D Handle 160', grip_kind: 'hardware', handle_type: 'bar', length: 180, bore_centres: 160, projection: 30, cost_per_unit: 5, hole_dia_mm: null, holes: [], needs_finger_gap: false, bevel_angle_deg: null, bevel_land_mm: null }
const handles = { door_tall: { handle: bar160, offset_from_edge_mm: 50, inset_from_side_mm: 50, orientation: 'vertical' as const } }
const doorsGrid = (n: number) => ({
  rows: [{ row_index: 0, height_locked: false }],
  cols: Array.from({ length: n }, (_, i) => ({ col_index: i, width_locked: false })),
  zones: Array.from({ length: n }, (_, i) => ({ row_index: 0, col_index: i, face_type: 'door' as const, hinge_side: 'left' as const })),
})
const cab = (rules: Partial<ConstructionRules>, n = 2, o: Partial<CabinetInput> = {}): CabinetInput => ({
  id: 's1', assembly_class: 'tall', DX: 2400, DY: 2400, DZ: 600,
  has_carcass: false, has_internal: false, has_face: true, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, rules),
  hinge_hardware: hinge, handle_schedule: handles, face_grid: doorsGrid(n), internal_tree: { type: 'open', fittings: [] },
  ...o,
} as CabinetInput)

describe('Slider SC resolver', () => {
  it('off without SLIDER: ordinary hinged doors', () => {
    const rp = resolveCabinet(cab({}))
    expect(rp.slider).toBeUndefined()
    expect(rp.hinge_instances.length).toBeGreaterThan(0)
  })

  it('2 door handle: panels sized by the formula, on tracks 39 apart, no hinges or handles', () => {
    const rp = resolveCabinet(cab({ SLIDER: '2' }))
    expect(rp.slider).toMatchObject({ layout: '2', stile: 'handle', finish: 'silver', rail: 'lip', icw: 2400, ih: 2400, front: 600 })
    expect(rp.hinge_instances).toEqual([])
    const [a, b] = [...rp.face_zones].sort((p, q) => p.X - q.X)
    expect(a.DX).toBe((2400 - 92) / 2)
    expect(a.DY).toBe(2345)
    expect(a.X).toBeCloseTo(37.8)
    expect(b.X + b.DX).toBeCloseTo(2400 - 37.8)
    expect([a.slider_track, b.slider_track]).toEqual([0, 1])
    expect(a.handle).toBeNull()
    // Board centred on its track: front 34.5 back, back 73.5 back from the opening front.
    expect(a.Z + a.DZ / 2).toBeCloseTo(600 - 34.5)
    expect(b.Z + b.DZ / 2).toBeCloseTo(600 - 73.5)
    expect(rp.warnings.filter(w => w.code.startsWith('SLIDER'))).toEqual([])
  })

  it('3 door triple slimline: stepped tracks, 6 spacer lift', () => {
    const rp = resolveCabinet(cab({ SLIDER: '3T', SLIDER_STILE: 'slimline', SLIDER_FINISH: 'black' }, 3, { DX: 3000 }))
    const z = [...rp.face_zones].sort((p, q) => p.X - q.X)
    expect(z.map(q => q.slider_track)).toEqual([0, 1, 2])
    expect(z[0].DX).toBeCloseTo((3000 + 120 - 21) / 3)
    expect(z[0].Y).toBe(15 + 6)
    expect(z[0].DY).toBe(2400 - 67)
  })

  it('wrong door count: warning, doors left alone', () => {
    const rp = resolveCabinet(cab({ SLIDER: '3' }, 2))
    expect(rp.slider).toBeUndefined()
    expect(rp.warnings.map(w => w.code)).toContain('SLIDER_NEEDS_DOORS')
  })

  it('pieces: guide + rail + 4 per door; tracks run the opening width', () => {
    const rp = resolveCabinet(cab({ SLIDER: '2' }))
    const pcs = sliderProfiles(rp.slider!, rp.face_zones)
    expect(pcs.length).toBe(2 + 4 * 2)
    expect(pcs.filter(p => p.role === 'guide' || p.role === 'rail').every(p => p.length === 2400)).toBe(true)
    const guide = pcs.find(p => p.role === 'guide')!
    expect(Math.max(...guide.pts.map(p => p[1]))).toBe(2400)   // fixed to the head of the opening
    expect(sliderCuts(2400, 2400, { layout: '2', stile: 'handle', finish: 'silver', railLip: true }).length).toBe(4)
  })
})
