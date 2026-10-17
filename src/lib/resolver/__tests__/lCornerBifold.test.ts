import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type HingeHardwareInput, type Material, type ResolvedFaceZone } from '../types'
import { buildPresetFootprint } from '../../cabinetShape/presets'
import { rotEulerXYZ } from '../../jointDrilling'
import { cabinetHingeDrills } from '../resolveHinges'
import { turnDrill } from '../hardwareTurn'

// z_cabinet_shape L2b: BCNP bi-fold pair. The door hinged toward the pie corner
// trails (no cups, bi-fold screw holes on its back); the other door leads with
// the 170° on its end panel and the bi-fold cups on its pie edge.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const hinge = (o: Partial<HingeHardwareInput>): HingeHardwareInput => ({
  id: 'h110', name: 'Blum 110', default_hinge_edge: 'left', cup_x_from_edge_mm: 22, cup_diameter: 35, cup_depth_mm: 13.5,
  anchor_holes: [{ offset_x: 9.5, offset_y: 22.5, diameter: 8, depth: 12 }, { offset_x: 9.5, offset_y: -22.5, diameter: 8, depth: 12 }],
  model_combined_url: null, model_combined_scale: 1, bore_centre_to_door_face_mm: null, open_angle_deg: null,
  model_arm_fold_fraction: 0.5, ...o,
})
const lead = hinge({ id: 'h170', name: 'Blum 170 INSERTA', pie_role: 'lead' })
const bifold = hinge({
  id: 'hbf', name: 'Blum 60 bi-fold knock-in', pie_role: 'bifold', cup_x_from_edge_mm: 12.5,
  door_plate_holes: [{ offset_x: 37, offset_y: 16, diameter: 5, depth: 12 }, { offset_x: 37, offset_y: -16, diameter: 5, depth: 12 }],
})
const plate = { id: 'p', plate_offset_mm: 37, compatible_surfaces: ['side' as const], model_plate_url: null, model_plate_scale: 1,
  model_plate_anchor_x: 0, model_plate_anchor_y: 0, model_plate_anchor_z: 0,
  mounting_hole_pattern: [{ offset_x: 0, offset_y: 16, diameter: 5, depth: 12 }, { offset_x: 0, offset_y: -16, diameter: 5, depth: 12 }] }
const grid = (h: 'left' | 'right') => ({ rows: [{ row_index: 0, height_locked: false }], cols: [{ col_index: 0, width_locked: false }],
  zones: [{ row_index: 0, col_index: 0, face_type: 'door' as const, hinge_side: h }] })
const cab = (side: 'left' | 'right', o: Partial<CabinetInput> = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 900, DY: 870, DZ: 900,
  has_carcass: true, has_internal: false, has_face: true, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
  hinge_hardware: hinge({}), hinge_plate: plate, pie_hinges: { lead, bifold },
  // BCNP library default (L2b): primary door hinged toward the pie corner.
  face_grid: grid('left'), internal_tree: { type: 'open', fittings: [] },
  footprint: buildPresetFootprint('l_corner', { leg_back: 560, leg_side: 560, side }, { w: 900, d: 900 }),
  ...o,
})
// Plan-view AABB of a resolved door (X / Z after its AY turn).
const box = (z: ResolvedFaceZone) => {
  const pts = ([[0, 0], [z.DX, 0], [z.DX, z.DZ], [0, z.DZ]] as const).map(([x, d]) => {
    const [rx, , rz] = rotEulerXYZ(0, z.AY, 0, x, 0, d)
    return { x: z.X + rx, y: z.Z + rz }
  })
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

describe('BCNP bi-fold pair', () => {
  for (const side of ['right', 'left'] as const) {
    it(`${side} hand: trailing door has no cups, lead carries the 170° + bi-fold`, () => {
      const rp = resolveCabinet(cab(side))
      const trailing = rp.face_zones.find(z => !z.facet)!
      const leadZone = rp.face_zones.find(z => z.facet)!
      expect(rp.hinge_instances.filter(h => !h.facet)).toHaveLength(0)
      const mine = rp.hinge_instances.filter(h => h.facet === leadZone.facet)
      const outer = mine.filter(h => h.pie === 'lead'), bf = mine.filter(h => h.pie === 'bifold')
      expect(outer).toHaveLength(2)
      expect(bf).toHaveLength(2)
      expect(outer.every(h => h.hinge_hardware_id === 'h170' && h.mount_target?.table === 'case_parts' && !!h.mount_target.part_key)).toBe(true)
      expect(bf.map(h => h.sort_order)).toEqual([100, 101])
      expect(bf.map(h => h.y_position_mm)).toEqual(outer.map(h => h.y_position_mm))
      expect(bf.every(h => h.hinge_edge !== leadZone.hinge_side && h.hinge_plate_id === null)).toBe(true)
      expect(bf[0].mount_target).toEqual({ table: 'face_zones', row_index: 0, col_index: 0 })
      expect((rp.warnings ?? []).filter(w => String(w.code).startsWith('HINGE') || w.code === 'PIE_HINGE_MISSING')).toHaveLength(0)

      // Bi-fold cup 12.5 in from the lead door's pie edge (zone frame).
      const pieX = leadZone.hinge_side === 'left' ? leadZone.X + leadZone.DX : leadZone.X
      expect(Math.abs(bf[0].cup_drills[0].x - pieX)).toBeCloseTo(12.5, 6)

      // Screw holes: Ø5 × 12, on the trailing door's back face, 37 from its pie
      // edge, ±16 about the hinge height.
      const holes = bf[0].plate_drills
      expect(holes).toHaveLength(2)
      expect(holes.every(d => d.radius === 2.5 && d.depthLen === 12 && d.axis === 'z+' && d.z === trailing.Z)).toBe(true)
      const tPie = trailing.hinge_side === 'left' ? trailing.X : trailing.X + trailing.DX
      expect(holes.every(d => Math.abs(Math.abs(d.x - tPie) - 37) < 1e-6)).toBe(true)
      expect(holes.map(d => d.y - bf[0].cup_drills[0].y).sort((a, b) => a - b)).toEqual([-16, 16])

      // World: the holes sit on the trailing door, near the pie corner, close to the bi-fold cups.
      const tb = box(trailing)
      const world = holes.map(d => turnDrill(bf[0].plate_turn, d))
      for (const w of world) {
        expect(w.x).toBeGreaterThan(tb.x0 - 0.01); expect(w.x).toBeLessThan(tb.x1 + 0.01)
        expect(w.z).toBeGreaterThan(tb.y0 - 0.01); expect(w.z).toBeLessThan(tb.y1 + 0.01)
      }
      const cupW = turnDrill(bf[0].turn, bf[0].cup_drills[0])
      expect(Math.hypot(cupW.x - world[0].x, cupW.z - world[0].z)).toBeLessThan(80)
      const outerW = turnDrill(outer[0].turn, outer[0].cup_drills[0])
      expect(Math.hypot(outerW.x - world[0].x, outerW.z - world[0].z)).toBeGreaterThan(200)
      // The overlay helper agrees.
      expect(cabinetHingeDrills(bf).some(d => d.kind === 'plate' && Math.abs(d.x - world[0].x) < 1e-6)).toBe(true)
    })
  }

  it('both doors on their end panels: two ordinary doors, no bi-fold', () => {
    const rp = resolveCabinet(cab('right', { face_grid: grid('right') }))
    expect(rp.hinge_instances).toHaveLength(4)
    expect(rp.hinge_instances.every(h => !h.pie && h.hinge_hardware_id === 'h110')).toBe(true)
  })

  it('both doors toward the corner: no lead, the old no-panel warning stays', () => {
    const rp = resolveCabinet(cab('right', { faces: { front2: grid('right') } }))
    expect(rp.hinge_instances.some(h => h.pie)).toBe(false)
    expect((rp.warnings ?? []).filter(w => w.code === 'HINGE_NO_PANEL')).toHaveLength(2)
  })

  it('library without pie hinges: default hinge on the lead, flagged', () => {
    const rp = resolveCabinet(cab('right', { pie_hinges: {} }))
    expect(rp.hinge_instances.filter(h => !h.facet)).toHaveLength(0)
    expect(rp.hinge_instances.every(h => h.hinge_hardware_id === 'h110' && h.pie === 'lead')).toBe(true)
    expect((rp.warnings ?? []).filter(w => w.code === 'PIE_HINGE_MISSING').length).toBeGreaterThan(0)
  })
})
