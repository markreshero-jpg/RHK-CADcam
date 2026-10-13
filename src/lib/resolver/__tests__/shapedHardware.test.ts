import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import {
  DEFAULT_RULES, type CabinetInput, type Material, type SlideProduct, type HingeHardwareInput,
  type HingePlateInput, type FaceGridInput,
} from '../types'
import { buildPresetFootprint } from '../../cabinetShape/presets'
import { turnPoint } from '../resolveShapedHardware'
import { shapedInterior } from '../resolveShapedCase'

const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }

const slide = (id: string, nl: number): SlideProduct => ({
  id, name: `Runner ${nl}`, brand: 'Test', nominal_length: nl, box_height: 86, side_deduction: 26,
  runner_thickness: 13, min_runner_depth: null, max_runner_depth: null, soft_close: true,
  full_extension: true, cost_per_pair: null, colour: null, model_url: null, model_format: null,
  model_scale: 1, model_anchor_x: 0, model_anchor_y: 0, model_anchor_z: 0, drill_ops: [],
})

const hinge = (id: string, angle = 0): HingeHardwareInput => ({
  id, default_hinge_edge: 'left', cup_x_from_edge_mm: 22, cup_diameter: 35, cup_depth_mm: 12,
  anchor_holes: [], model_combined_url: null, model_combined_scale: 1,
  bore_centre_to_door_face_mm: null, open_angle_deg: 110, model_arm_fold_fraction: 0.5,
  mount_angle_deg: angle,
})
const plate: HingePlateInput = {
  id: 'p', plate_offset_mm: 37, compatible_surfaces: ['side'],
  mounting_hole_pattern: [{ offset_x: -16, offset_y: 0, diameter: 5, depth: 12 }, { offset_x: 16, offset_y: 0, diameter: 5, depth: 12 }],
  model_plate_url: null, model_plate_scale: 1, model_plate_anchor_x: 0, model_plate_anchor_y: 0, model_plate_anchor_z: 0,
}

const grid = (types: ('door' | 'drawer_face')[], hinges: ('left' | 'right')[] = []): FaceGridInput => ({
  rows: types.map((_, i) => ({ row_index: i, height_locked: false })),
  cols: [{ col_index: 0, width_locked: false }],
  zones: types.map((t, i) => ({ row_index: i, col_index: 0, face_type: t, ...(t === 'door' ? { hinge_side: hinges[i] ?? 'left' } : {}) })),
})
const twoDoors: FaceGridInput = {
  rows: [{ row_index: 0, height_locked: false }],
  cols: [{ col_index: 0, width_locked: false }, { col_index: 1, width_locked: false }],
  zones: [
    { row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'left' },
    { row_index: 0, col_index: 1, face_type: 'door', hinge_side: 'right' },
  ],
}

function cab(overrides: Partial<CabinetInput> = {}): CabinetInput {
  return {
    id: 'c1', assembly_class: 'base', DX: 900, DY: 870, DZ: 580,
    has_carcass: true, has_internal: false, has_face: true, has_toekick: true,
    left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
    material: board, door_material: board, shelf_material: board, exposed_material: board,
    toekick_face_material: board, toekick_interior_material: board,
    slide_side_deduction: 26, rules: mergeRules(DEFAULT_RULES),
    face_grid: twoDoors,
    internal_tree: { type: 'open', fittings: [] },
    slide_products: [slide('s300', 300), slide('s500', 500)],
    hinge_hardware: hinge('std'), hinge_plate: plate,
    ...overrides,
  }
}

// Is (x, z) inside the cabinet's inner polygon (plan x, y = cabinet X, Z)?
function inside(poly: { x: number; y: number }[], x: number, z: number, tol = 0.5) {
  let w = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > z) !== (b.y > z) && x < (b.x - a.x) * (z - a.y) / (b.y - a.y) + a.x) w = !w
  }
  if (w) return true
  // On an edge counts as inside.
  return poly.some((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.y) * (b.y - a.y)) / (L * L)))
    return Math.hypot(a.x + t * (b.x - a.x) - x, a.y + t * (b.y - a.y) - z) < tol
  })
}

describe('shaped hardware: rectangle footprint matches the plain cabinet', () => {
  const fp = buildPresetFootprint('trapezoid', { inset_l: 0, inset_r: 0 }, { w: 900, d: 580 })!

  it('drawers', () => {
    const g = grid(['drawer_face', 'drawer_face', 'drawer_face'])
    const plain = resolveCabinet(cab({ face_grid: g }))
    const shaped = resolveCabinet(cab({ face_grid: g, footprint: fp }))
    expect(shaped.errors).toEqual([])
    expect(shaped.drawer_stacks.length).toBe(3)
    shaped.drawer_stacks.forEach((s, i) => {
      const p = plain.drawer_stacks[i]
      expect(s.turn).toBeUndefined()
      expect(s.box_X).toBeCloseTo(p.box_X, 6)
      expect(s.box_width).toBeCloseTo(p.box_width, 6)
      expect(s.box_depth).toBe(p.box_depth)
      expect(s.slides.map(x => x.X)).toEqual(p.slides.map(x => x.X))
    })
    expect(shaped.warnings.filter(w => w.code === 'DRAWER_RUNNER_PACKER')).toEqual([])
  })

  it('hinges', () => {
    const plain = resolveCabinet(cab())
    const shaped = resolveCabinet(cab({ footprint: fp }))
    expect(shaped.hinge_instances.length).toBe(plain.hinge_instances.length)
    shaped.hinge_instances.forEach((h, i) => {
      const p = plain.hinge_instances[i]
      expect(h.mount_target).toEqual(p.mount_target)
      expect(h.mount_angle_deg).toBeUndefined()
      h.plate_drills.forEach((d, k) => {
        expect(d.x).toBeCloseTo(p.plate_drills[k].x, 6)
        expect(d.z).toBeCloseTo(p.plate_drills[k].z, 6)
        expect(d.axis).toBe(p.plate_drills[k].axis)
      })
    })
  })
})

describe('shaped hardware: clipped corner', () => {
  const fp = buildPresetFootprint('clipped_corner', { clip_w: 300, clip_d: 300 }, { w: 900, d: 580 })!

  it('the facet door hangs on the end panel with a +45° hinge, flagged when the library has none', () => {
    const res = resolveCabinet(cab({ footprint: fp, face_grid: grid(['door'], ['left']) }))
    const fh = res.hinge_instances.filter(h => h.facet === 'facet')
    expect(fh.length).toBe(2)
    for (const h of fh) {
      expect(h.hinge_edge).toBe('right')
      expect(h.mount_angle_deg).toBeCloseTo(45, 6)
      expect(h.angle_matched).toBe(false)
      expect(h.mount_target).toEqual({ table: 'case_parts', part_key: 'right_side' })
      expect(h.turn?.AY).toBeCloseTo(res.face_zones.find(z => z.facet === 'facet')!.AY, 6)
      // Plate bores sit on the end panel's inner face (x = DX - T) once turned.
      for (const d of h.plate_drills) {
        const [x] = turnPoint(h.turn, d.x, d.y, d.z)
        expect(x).toBeCloseTo(900 - 18, 6)
        expect(d.dir).toBeDefined()
      }
    }
    expect(res.warnings.some(w => w.code === 'HINGE_ANGLE_MISSING')).toBe(true)
  })

  it('picks a matching angled hinge from the library', () => {
    const res = resolveCabinet(cab({ footprint: fp, face_grid: grid(['door']), angled_hinges: [hinge('a45', 45)] }))
    const fh = res.hinge_instances.filter(h => h.facet === 'facet')
    expect(fh.every(h => h.hinge_hardware_id === 'a45' && h.angle_matched)).toBe(true)
    expect(res.hinge_instances.filter(h => !h.facet).every(h => h.hinge_hardware_id === 'std')).toBe(true)
    expect(res.warnings.some(w => w.code === 'HINGE_ANGLE_MISSING')).toBe(false)
  })

  it('a door hinged on the mitred corner is flagged', () => {
    const res = resolveCabinet(cab({ footprint: fp }))   // primary col 1 hinges right = the mitre
    expect(res.warnings.some(w => w.code === 'HINGE_NO_PANEL' && w.message.includes('[0,1]'))).toBe(true)
    expect(res.hinge_instances.filter(h => !h.facet && h.col_index === 1).every(h => h.mount_target === null)).toBe(true)
  })

  it('facet drawers stay inside the carcass and clash with the main drawers behind the corner', () => {
    const g = grid(['drawer_face', 'drawer_face'])
    const res = resolveCabinet(cab({ footprint: fp, face_grid: g, faces: { facet: g } }))
    const facet = res.drawer_stacks.filter(s => s.facet === 'facet')
    expect(facet.length).toBe(2)
    const inner = shapedInterior(cab({ footprint: fp }))!.inner
    for (const s of res.drawer_stacks) {
      for (const [x, z] of [[s.box_X, s.box_Z], [s.box_X + s.box_width, s.box_Z],
        [s.box_X, s.box_Z + s.box_depth], [s.box_X + s.box_width, s.box_Z + s.box_depth]]) {
        const [X, , Z] = turnPoint(s.turn, x, 0, z)
        // Front corners sit at the door back plane, in front of the carcass;
        // the back corners must be inside.
        if (z === s.box_Z) expect(inside(inner, X, Z)).toBe(true)
      }
    }
    expect(res.warnings.some(w => w.code === 'DRAWER_FACET_CLASH')).toBe(true)
    // The mitred end of the facet has no panel: the runner needs a packer.
    expect(res.warnings.some(w => w.code === 'DRAWER_RUNNER_PACKER' && w.message.includes('facet'))).toBe(true)
  })
})

describe('shaped hardware: trapezoid', () => {
  it('drawer boxes narrow to fit between the angled sides', () => {
    const fp = buildPresetFootprint('trapezoid', { inset_l: 100, inset_r: 100 }, { w: 900, d: 580 })!
    const g = grid(['drawer_face', 'drawer_face'])
    const res = resolveCabinet(cab({ footprint: fp, face_grid: g }))
    const plain = resolveCabinet(cab({ face_grid: g }))
    const inner = shapedInterior(cab({ footprint: fp }))!.inner
    for (const s of res.drawer_stacks) {
      expect(s.box_width).toBeLessThan(plain.drawer_stacks[0].box_width - 150)
      for (const x of [s.box_X - 13, s.box_X + s.box_width + 13])
        for (const z of [s.box_Z, Math.min(s.box_Z + s.box_depth, 580)])
          expect(inside(inner, x, z)).toBe(true)
    }
    expect(res.warnings.filter(w => w.code === 'DRAWER_RUNNER_PACKER').length).toBe(2)   // one per side, not per drawer
  })
})
