import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { caseBox } from '../../jointDrilling'
import { bifoldTracks } from '../resolveBifold'
import { DEFAULT_RULES, type CabinetInput, type ConstructionRules, type HingeHardwareInput, type Material, type HandleProductInput, type ResolvedFaceZone, type ResolvedCasePart, type ResolvedInternalPart, type ResolverError } from '../types'

// z_bifold_slide F1: Finista BF-05 sliding bi-fold on an ordinary 2-door cabinet.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const hinge: HingeHardwareInput = {
  id: 'h110', name: 'Blum 110', default_hinge_edge: 'left', cup_x_from_edge_mm: 22, cup_diameter: 35, cup_depth_mm: 13.5,
  anchor_holes: [], model_combined_url: null, model_combined_scale: 1, bore_centre_to_door_face_mm: null, open_angle_deg: null,
  model_arm_fold_fraction: 0.5,
}
const bar160: HandleProductInput = { id: 'h160', name: 'D Handle 160', grip_kind: 'hardware', handle_type: 'bar', length: 180, bore_centres: 160, projection: 30, cost_per_unit: 5, hole_dia_mm: null, holes: [], needs_finger_gap: false, bevel_angle_deg: null, bevel_land_mm: null }
const handles = { door_tall: { handle: bar160, offset_from_edge_mm: 50, inset_from_side_mm: 50, orientation: 'vertical' as const } }
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

  for (const hand of ['L', 'R'] as const) {
    it(`hand ${hand}: one handle, on the leading door at the joint; none on the outer door`, () => {
      const plain = resolveCabinet(cab({}, { handle_schedule: handles })).face_zones
      const rp = resolveCabinet(cab({ BIFOLD: hand }, { handle_schedule: handles }))
      const outer = rp.face_zones.find(z => z.bifold_role === 'outer')!
      const leading = rp.face_zones.find(z => z.bifold_role === 'leading')!
      expect(outer.handle).toBeNull()
      expect(leading.handle).toBeTruthy()
      // Same place as that door's handle on a plain pair hinged on the leading
      // edge (L hand: the right door, plainly hinged right, handle on its left).
      const twin = plain.find(z => z.col_index === leading.col_index)!
      expect(twin.hinge_side).toBe(hand === 'L' ? 'right' : 'left')
      expect(leading.handle).toEqual(twin.handle)
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

  it('tracks: gable to gable, 22.7–40 behind the doors, 20 high; bottom per option', () => {
    for (const [bottom, n] of [['above', 2], ['below', 2], ['none', 1]] as const) {
      const rp = resolveCabinet(cab({ BIFOLD: 'L', BIFOLD_BOTTOM: bottom }))
      expect(rp.bifold).toEqual({ hand: 'L', bottom, centre: 'standard' })
      const tr = bifoldTracks(rp)
      expect(tr).toHaveLength(n)
      const box = (k: string) => caseBox(rp.case_parts.find(p => p.part_key === k)!)
      const ls = box('left_side'), rs = box('right_side'), top = box('full_top'), bot = box('bottom')
      const lead = rp.face_zones.find(z => z.bifold_role === 'leading')!
      for (const t of tr) {
        expect(t.x).toBeCloseTo(ls.x + ls.w, 6)
        expect(t.x + t.dx).toBeCloseTo(rs.x, 6)
        expect(t.z).toBeCloseTo(lead.Z - 40, 6)
        expect(t.z + t.dz).toBeCloseTo(lead.Z - 22.7, 6)
        expect(t.dy).toBe(20)
      }
      expect(tr[0]).toMatchObject({ which: 'top', y: top.y - 20, open: 'down' })
      if (bottom === 'above') expect(tr[1]).toMatchObject({ which: 'bottom', y: bot.y + bot.h, open: 'up' })
      if (bottom === 'below') expect(tr[1]).toMatchObject({ which: 'bottom', y: bot.y - 20, open: 'down' })
    }
    expect(bifoldTracks(resolveCabinet(cab({})))).toEqual([])
  })

  it('over 1200 inside → width warning', () => {
    const rp = resolveCabinet(cab({ BIFOLD: 'L' }, { DX: 1300 }))
    expect(rp.warnings.map(w => w.code)).toContain('BIFOLD_WIDTH')
  })
})

describe('sliding bi-fold in plan (folded pack)', () => {
  it('both doors folded at the hinge gable; joint arc + leading edge run', async () => {
    const { bifoldPlanMarks } = await import('../../cabinetShape/planSwings')
    const { bifoldFoldAngle } = await import('../resolveBifold')
    for (const hand of ['L', 'R'] as const) {
      const rp = resolveCabinet(cab({ BIFOLD: hand }))
      const m = bifoldPlanMarks({ dx: 900, dz: 580, rule_overrides: { BIFOLD: hand } }, rp.face_zones)!
      const pair = rp.face_zones.filter(z => z.bifold_role)
      const x0 = Math.min(...pair.map(z => z.X)), x1 = Math.max(...pair.map(z => z.X + z.DX))
      const span = x1 - x0, th = bifoldFoldAngle(span, pair[0].DZ)
      const H = hand === 'L' ? x0 : x1, s = hand === 'L' ? 1 : -1
      // Outer door starts at the hinge; the leading edge ends span·cos θ in from it.
      expect(m.doors[0][0].x).toBeCloseTo(H, 6)
      expect(m.travel[0].x).toBeCloseTo(H + s * span, 6)
      expect(m.travel[1].x).toBeCloseTo(H + s * span * Math.cos(th), 6)
      expect((m.travel[1].x - H) * s).toBeCloseTo(2 * pair[0].DZ + 4, 6)   // the pack
      // Joint: the outer door's free end = the leading door's top, out in the room.
      expect(m.doors[0][1].x).toBeCloseTo(m.doors[1][1].x, 0)
      expect(m.doors[0][1].z).toBeGreaterThan(pair[0].Z + 400)
      expect(m.arc.to).toEqual(m.doors[0][1])
    }
    expect(bifoldPlanMarks({ dx: 900, dz: 580, rule_overrides: {} })).toBeNull()
  })
})

describe('bi-fold on one row of a 2-row front (RHK6595 WC-02)', () => {
  // 711 wide column: 1000 appliance doors at the bottom, a fixed shelf, 390 PTO doors over.
  const zone = (row: number, col: number, Y: number, DY: number) =>
    ({ row_index: row, col_index: col, face_type: 'door', X: col ? 356.5 : 2, Y, Z: 502, DX: 352.5, DY, DZ: 18, hinge_side: col ? 'right' : 'left' }) as unknown as ResolvedFaceZone
  const zones = () => [zone(0, 0, 1000, 390), zone(0, 1, 1000, 390), zone(1, 0, 0, 998), zone(1, 1, 0, 998)]

  it('the pair is the tallest row of exactly 2 doors; the other row keeps its doors', async () => {
    const { bifoldPair } = await import('../resolveBifold')
    const zs = zones(), warnings: ResolverError[] = []
    const p = bifoldPair({ rules: { BIFOLD: 'L' } } as unknown as CabinetInput, zs, warnings)!
    expect(warnings).toEqual([])
    expect([p.outer.row_index, p.outer.col_index, p.leading.col_index]).toEqual([1, 0, 1])
    expect(zs.filter(z => z.row_index === 0).every(z => !z.bifold_role)).toBe(true)
  })

  it('the top track hangs under the fixed shelf over the pair, not the cabinet top', async () => {
    const { bifoldPanels } = await import('../resolveBifold')
    const top = { part_key: 'full_top', X: 0, Y: 1372, Z: 0, DX: 500, DY: 711, DZ: 18 } as unknown as ResolvedCasePart
    const bottom = { part_key: 'bottom', X: 0, Y: 0, Z: 0, DX: 500, DY: 711, DZ: 18 } as unknown as ResolvedCasePart
    const shelf = { part_type: 'fixed_shelf', sort_order: 0, X: 18, Y: 990, Z: 0, DX: 480, DY: 675, DZ: 18 } as unknown as ResolvedInternalPart
    const pair = zones().filter(z => z.row_index === 1)
    const p = bifoldPanels([top, bottom], [shelf], pair)
    expect(p.top?.y).toBe(990)
    expect(p.bottom?.y).toBe(0)
    // No shelf: the cabinet top.
    expect(bifoldPanels([top, bottom], [], pair).top?.y).toBe(1372)
  })
})
