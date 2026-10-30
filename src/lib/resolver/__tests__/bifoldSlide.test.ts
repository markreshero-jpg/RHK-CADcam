import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { caseBox } from '../../jointDrilling'
import { DEFAULT_RULES, type CabinetInput, type ConstructionRules, type HingeHardwareInput, type Material } from '../types'

// z_bifold_slide F1: Finista BF-05 sliding bi-fold on an ordinary 2-door cabinet.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const hinge: HingeHardwareInput = {
  id: 'h110', name: 'Blum 110', default_hinge_edge: 'left', cup_x_from_edge_mm: 22, cup_diameter: 35, cup_depth_mm: 13.5,
  anchor_holes: [], model_combined_url: null, model_combined_scale: 1, bore_centre_to_door_face_mm: null, open_angle_deg: null,
  model_arm_fold_fraction: 0.5,
}
const twoDoors = {
  rows: [{ row_index: 0, height_locked: false }],
  cols: [{ col_index: 0, width_locked: false }, { col_index: 1, width_locked: false }],
  zones: [
    { row_index: 0, col_index: 0, face_type: 'door' as const, hinge_side: 'left' as const },
    { row_index: 0, col_index: 1, face_type: 'door' as const, hinge_side: 'right' as const },
  ],
}
const cab = (rules: Partial<ConstructionRules>, o: Partial<CabinetInput> = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'tall', DX: 900, DY: 2100, DZ: 580,
  has_carcass: true, has_internal: false, has_face: true, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, { TOP_TYPE: 'full_top', ...rules }),
  hinge_hardware: hinge, face_grid: twoDoors, internal_tree: { type: 'open', fittings: [] },
  ...o,
})

describe('sliding bi-fold (Finista BF-05)', () => {
  it('off by default: both doors keep their hinges, no fitting holes', () => {
    const rp = resolveCabinet(cab({}))
    expect(new Set(rp.hinge_instances.map(h => h.col_index))).toEqual(new Set([0, 1]))
    expect(rp.face_zones.some(z => z.bifold_holes || z.bifold_role)).toBe(false)
  })

  for (const hand of ['L', 'R'] as const) {
    it(`hand ${hand}: outer door hinged on the gable, leading door rides the track`, () => {
      const rp = resolveCabinet(cab({ BIFOLD: hand }))
      const [a, b] = [...rp.face_zones].sort((p, q) => p.X - q.X)
      const outer = hand === 'L' ? a : b, leading = hand === 'L' ? b : a
      expect(outer.bifold_role).toBe('outer')
      expect(leading.bifold_role).toBe('leading')
      const side = hand === 'L' ? 'left' : 'right'
      expect(outer.hinge_side).toBe(side)
      expect(leading.hinge_side).toBe(side)
      // Gable hinges only on the outer door.
      expect(rp.hinge_instances.every(h => h.col_index === outer.col_index && h.hinge_edge === side)).toBe(true)
      const nHinges = rp.hinge_instances.length
      expect(nHinges).toBe(4)   // 2100 door → 4 by the default count rules

      // Carriage: 2 × 35 cups, 22.5 in from the leading edge, 47.5 + 64 under the top.
      const top = caseBox(rp.case_parts.find(p => p.part_key === 'full_top')!)
      const carriage = leading.bifold_holes!.filter(h => h.kind === 'carriage')
      const leadX = hand === 'L' ? leading.DX - 22.5 : 22.5
      expect(carriage.map(h => [h.x, leading.Y + h.y, h.dia, h.depth])).toEqual([
        [leadX, top.y - 47.5, 35, 11.5], [leadX, top.y - 111.5, 35, 11.5],
      ])
      // Guide: above the bottom by default, 26.5 over its top face.
      const bot = caseBox(rp.case_parts.find(p => p.part_key === 'bottom')!)
      const guide = leading.bifold_holes!.filter(h => h.kind === 'guide')
      expect(guide.map(h => [h.x, leading.Y + h.y])).toEqual([[leadX, bot.y + bot.h + 26.5]])

      // Standard centre hinges: 2 Ø3 × 10 per door per hinge, B* = (32 - gap) / 2 from the joint.
      const gap = hand === 'L' ? leading.X - (outer.X + outer.DX) : outer.X - (leading.X + leading.DX)
      const bStar = (32 - gap) / 2
      for (const z of [outer, leading]) {
        const c = z.bifold_holes!.filter(h => h.kind === 'centre')
        expect(c).toHaveLength(nHinges * 2)
        expect(c.every(h => h.dia === 3 && h.depth === 10)).toBe(true)
        const fromJoint = (x: number) => (z === outer) === (hand === 'L') ? z.DX - x : x
        expect(new Set(c.map(h => fromJoint(h.x)))).toEqual(new Set([bStar]))
      }
      // Across the joint, the hole columns are 32 apart.
      const ox = outer.X + outer.bifold_holes!.find(h => h.kind === 'centre')!.x
      const lx = leading.X + leading.bifold_holes!.find(h => h.kind === 'centre')!.x
      expect(Math.abs(ox - lx)).toBeCloseTo(32, 6)
    })
  }

  it('centre hinges follow the outer door hinge heights, ±16', () => {
    const rp = resolveCabinet(cab({ BIFOLD: 'L' }))
    const outer = rp.face_zones.find(z => z.bifold_role === 'outer')!
    const ys = rp.hinge_instances.map(h => h.y_position_mm)
    const c = outer.bifold_holes!.filter(h => h.kind === 'centre').map(h => h.y).sort((p, q) => p - q)
    expect(c).toEqual(ys.flatMap(y => [y - 16, y + 16]).sort((p, q) => p - q))
  })

  it('cup centre hinges: 35 × 12 cup 22.5 from the joint + 2 × Ø10 dowels 52 apart at 28, on both doors', () => {
    const rp = resolveCabinet(cab({ BIFOLD: 'L', BIFOLD_CENTRE: 'cup' }))
    const outer = rp.face_zones.find(z => z.bifold_role === 'outer')!
    const leading = rp.face_zones.find(z => z.bifold_role === 'leading')!
    const y0 = rp.hinge_instances[0].y_position_mm
    const at = (list: typeof outer.bifold_holes, y: number) => list!.filter(h => h.kind === 'centre' && Math.abs(h.y - y) <= 26)
    expect(at(outer.bifold_holes, y0).map(h => [outer.DX - h.x, h.y - y0, h.dia, h.depth])).toEqual([
      [22.5, 0, 35, 12], [28, 26, 10, 11.5], [28, -26, 10, 11.5],
    ])
    expect(at(leading.bifold_holes, y0).map(h => [h.x, h.y - y0, h.dia, h.depth])).toEqual([
      [22.5, 0, 35, 12], [28, 26, 10, 11.5], [28, -26, 10, 11.5],
    ])
  })

  it('below bottom: guide 26.5 under the bottom; warns when the doors hang under 55', () => {
    const rp = resolveCabinet(cab({ BIFOLD: 'L', BIFOLD_BOTTOM: 'below' }))
    const leading = rp.face_zones.find(z => z.bifold_role === 'leading')!
    const bot = caseBox(rp.case_parts.find(p => p.part_key === 'bottom')!)
    const guide = leading.bifold_holes!.filter(h => h.kind === 'guide')
    // A door flush with the bottom can't take a guide under it: warned, and the hole falls off the door.
    expect(bot.y - leading.Y).toBeLessThan(55)
    expect(rp.warnings.map(w => w.code)).toEqual(expect.arrayContaining(['BIFOLD_BELOW_55', 'BIFOLD_HOLE_OFF_DOOR']))
    expect(guide).toHaveLength(0)
  })

  it('none: no guide hole', () => {
    const rp = resolveCabinet(cab({ BIFOLD: 'L', BIFOLD_BOTTOM: 'none' }))
    const leading = rp.face_zones.find(z => z.bifold_role === 'leading')!
    expect(leading.bifold_holes!.some(h => h.kind === 'guide')).toBe(false)
  })

  it('needs 2 doors: one door → warning, door left alone', () => {
    const one = { rows: twoDoors.rows, cols: [twoDoors.cols[0]], zones: [twoDoors.zones[0]] }
    const rp = resolveCabinet(cab({ BIFOLD: 'L' }, { face_grid: one }))
    expect(rp.warnings.map(w => w.code)).toContain('BIFOLD_NEEDS_2_DOORS')
    expect(rp.face_zones[0].bifold_role).toBeUndefined()
    expect(rp.hinge_instances.length).toBeGreaterThan(0)
  })

  it('over 1200 inside → width warning', () => {
    const rp = resolveCabinet(cab({ BIFOLD: 'L' }, { DX: 1300 }))
    expect(rp.warnings.map(w => w.code)).toContain('BIFOLD_WIDTH')
  })
})
