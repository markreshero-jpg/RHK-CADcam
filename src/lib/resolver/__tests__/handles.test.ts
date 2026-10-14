import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import {
  DEFAULT_RULES, type CabinetInput, type Material, type HandleProductInput,
  type HandleScheduleEntryInput, type HandleRole,
} from '../types'

const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const bar160: HandleProductInput = { id: 'h160', name: 'D Handle 160', grip_kind: 'hardware', handle_type: 'bar', length: 180, bore_centres: 160, projection: 30, cost_per_unit: 5, hole_dia_mm: null, holes: [], needs_finger_gap: false, bevel_angle_deg: null, bevel_land_mm: null }
const bar320: HandleProductInput = { ...bar160, id: 'h320', name: 'D Handle 320', length: 340, bore_centres: 320 }
const pto: HandleProductInput = { id: 'pto', name: 'Push to open', grip_kind: 'push', handle_type: 'other', length: null, bore_centres: null, projection: null, cost_per_unit: 8, hole_dia_mm: null, holes: [], needs_finger_gap: false, bevel_angle_deg: null, bevel_land_mm: null }

const schedule: Partial<Record<HandleRole, HandleScheduleEntryInput>> = {
  door_base: { handle: bar160, offset_from_edge_mm: 50, inset_from_side_mm: 50, orientation: 'vertical' },
  door_wall: { handle: bar160, offset_from_edge_mm: 50, inset_from_side_mm: 50, orientation: 'vertical' },
  door_tall: { handle: pto,    offset_from_edge_mm: 50, inset_from_side_mm: null, orientation: 'vertical' },
  drawer:    { handle: bar160, offset_from_edge_mm: 50, inset_from_side_mm: null, orientation: 'horizontal' },
}

const twoDoors = {
  rows: [{ row_index: 0, height_locked: false }],
  cols: [{ col_index: 0, width_locked: false }, { col_index: 1, width_locked: false }],
  zones: [
    { row_index: 0, col_index: 0, face_type: 'door' as const, hinge_side: 'left' as const },
    { row_index: 0, col_index: 1, face_type: 'door' as const, hinge_side: 'right' as const },
  ],
}

function cab(overrides: Partial<CabinetInput> = {}): CabinetInput {
  return {
    id: 'c1', assembly_class: 'base', DX: 900, DY: 900, DZ: 580,
    has_carcass: true, has_internal: false, has_face: true, has_toekick: true,
    left_neighbour: 'wall', right_neighbour: 'cabinet', exposed_interior: false,
    material: board, door_material: board, shelf_material: board, exposed_material: board,
    toekick_face_material: board, toekick_interior_material: board,
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    face_grid: twoDoors,
    internal_tree: { type: 'open', fittings: [] },
    handle_schedule: schedule,
    handle_products: { h160: bar160, h320: bar320, pto },
    ...overrides,
  }
}

describe('resolveHandles', () => {
  it('base doors: vertical bar, top hole 50 down, 50 in from the non-hinged edge', () => {
    const [left, right] = resolveCabinet(cab()).face_zones
    // Left door hinged left → handle near its right edge.
    expect(left.handle).toMatchObject({ handle_id: 'h160', role: 'door_base', grip_edge: 'top', orientation: 'vertical' })
    expect(left.handle!.x).toBeCloseTo(left.DX - 50)
    expect(left.handle!.y).toBeCloseTo(left.DY - 50 - 80)   // centre = nearest hole + half the bore centres
    // Right door hinged right → handle near its left edge.
    expect(right.handle!.x).toBeCloseTo(50)
  })

  it('wall doors mirror: grip edge bottom, nearest hole 50 up', () => {
    const [left] = resolveCabinet(cab({ assembly_class: 'wall', has_toekick: false })).face_zones
    expect(left.handle).toMatchObject({ role: 'door_wall', grip_edge: 'bottom' })
    expect(left.handle!.y).toBeCloseTo(50 + 80)
  })

  it('tall doors get push-to-open with no position', () => {
    const [left] = resolveCabinet(cab({ assembly_class: 'tall', DY: 2100 })).face_zones
    expect(left.handle).toMatchObject({ handle_id: 'pto', grip_kind: 'push', role: 'door_tall', x: null, y: null })
  })

  it('drawers: horizontal bar centred, 50 down from the top', () => {
    const grid = {
      rows: [{ row_index: 0, height_locked: false }, { row_index: 1, height_locked: false }],
      cols: [{ col_index: 0, width_locked: false }],
      zones: [
        { row_index: 0, col_index: 0, face_type: 'drawer_face' as const },
        { row_index: 1, col_index: 0, face_type: 'drawer_face' as const },
      ],
    }
    const zones = resolveCabinet(cab({ face_grid: grid })).face_zones
    for (const z of zones) {
      expect(z.handle).toMatchObject({ role: 'drawer', orientation: 'horizontal' })
      expect(z.handle!.x).toBeCloseTo(z.DX / 2)
      expect(z.handle!.y).toBeCloseTo(z.DY - 50)
    }
  })

  it('a zone override wins over the schedule', () => {
    const grid = { ...twoDoors, zones: [{ ...twoDoors.zones[0], handle_id: 'h320' }, twoDoors.zones[1]] }
    const [left, right] = resolveCabinet(cab({ face_grid: grid })).face_zones
    expect(left.handle).toMatchObject({ handle_id: 'h320', source: 'zone' })
    expect(right.handle).toMatchObject({ handle_id: 'h160', source: 'schedule' })
  })

  it('holes: bar = two holes at the bore centres along the handle; push = none', () => {
    const [left] = resolveCabinet(cab()).face_zones
    const h = left.handle!
    // Vertical bar: holes share x, sit ±80 about the centre; the top one 50 down.
    expect(h.holes).toHaveLength(2)
    expect(h.holes.map(p => p.x)).toEqual([h.x, h.x])
    expect(Math.max(...h.holes.map(p => p.y))).toBeCloseTo(left.DY - 50)
    expect(h.hole_dia).toBe(5)

    const [tall] = resolveCabinet(cab({ assembly_class: 'tall', DY: 2100 })).face_zones
    expect(tall.handle!.holes).toEqual([])
  })

  it('knob (no bore centres) drills one centre hole', () => {
    const knob: HandleProductInput = { ...bar160, id: 'k', bore_centres: null, length: 30, hole_dia_mm: 4.5 }
    const sched = { ...schedule, door_base: { ...schedule.door_base!, handle: knob } }
    const [left] = resolveCabinet(cab({ handle_schedule: sched })).face_zones
    expect(left.handle!.holes).toEqual([{ x: left.handle!.x, y: left.handle!.y }])
    expect(left.handle!.hole_dia).toBe(4.5)
  })

  it('HANDLE_DRILL=false (job/room/cabinet rule) keeps the handle but drops its holes', () => {
    const [left] = resolveCabinet(cab({ rules: mergeRules(DEFAULT_RULES, { HANDLE_DRILL: false }) })).face_zones
    expect(left.handle).toMatchObject({ handle_id: 'h160', drilled: false })
    expect(left.handle!.x).not.toBeNull()
    expect(left.handle!.holes).toEqual([])
  })

  it('a front can switch drilling back on (or off) over the rule', () => {
    const grid = { ...twoDoors, zones: [{ ...twoDoors.zones[0], handle_drill: true }, { ...twoDoors.zones[1], handle_drill: false }] }
    const [left, right] = resolveCabinet(cab({ face_grid: grid, rules: mergeRules(DEFAULT_RULES, { HANDLE_DRILL: false }) })).face_zones
    expect(left.handle!.holes).toHaveLength(2)
    expect(left.handle!.drilled).toBe(true)
    expect(right.handle!.holes).toEqual([])
    const [onByDefault] = resolveCabinet(cab()).face_zones
    expect(onByDefault.handle!.drilled).toBe(true)
  })

  describe('sharknose + finger gap (H3)', () => {
    const shark: HandleProductInput = { ...pto, id: 'sn', name: 'Sharknose 45°', grip_kind: 'sharknose', needs_finger_gap: true, bevel_angle_deg: 45, bevel_land_mm: 2 }
    const sharkSched = {
      ...schedule,
      door_base: { ...schedule.door_base!, handle: shark },
      door_wall: { ...schedule.door_wall!, handle: shark },
      drawer:    { ...schedule.drawer!, handle: shark },
    }
    const threeDrawers = {
      rows: [0, 1, 2].map(i => ({ row_index: i, height_locked: false })),
      cols: [{ col_index: 0, width_locked: false }],
      zones: [0, 1, 2].map(i => ({ row_index: i, col_index: 0, face_type: 'drawer_face' as const })),
    }

    it('drawers: 20mm under the carcass top and between every drawer', () => {
      const c = cab({ face_grid: threeDrawers, handle_schedule: sharkSched })
      const zones = resolveCabinet(c).face_zones.sort((a, b) => a.row_index - b.row_index)
      const top = zones[2]
      expect(c.DY - (top.Y + top.DY)).toBeCloseTo(20)              // finger gap at the top
      expect(zones[1].Y - (zones[0].Y + zones[0].DY)).toBeCloseTo(20)
      expect(zones[2].Y - (zones[1].Y + zones[1].DY)).toBeCloseTo(20)
      expect(top.handle).toMatchObject({ grip_kind: 'sharknose', finger_gap: true, x: null, holes: [] })
      expect(top.handle!.bevel!.run).toBeCloseTo(18 - 2)            // 45°: run = thickness − land
    })

    it('FPGAP follows rule overrides (job / room / cabinet)', () => {
      const c = cab({ face_grid: threeDrawers, handle_schedule: sharkSched, rules: mergeRules(DEFAULT_RULES, { FPGAP: 25 }) })
      const top = resolveCabinet(c).face_zones.find(z => z.row_index === 2)!
      expect(c.DY - (top.Y + top.DY)).toBeCloseTo(25)
    })

    it('base doors drop FPGAP below the carcass top; wall doors rise FPGAP above the bottom', () => {
      const base = resolveCabinet(cab({ handle_schedule: sharkSched })).face_zones[0]
      expect(900 - (base.Y + base.DY)).toBeCloseTo(20)
      const wall = resolveCabinet(cab({ assembly_class: 'wall', has_toekick: false, handle_schedule: sharkSched })).face_zones[0]
      expect(wall.Y).toBeCloseTo(20)
      expect(wall.handle!.grip_edge).toBe('bottom')
    })

    it('backing rails: one per finger gap, 5 up / 20 gap / 20 down, notched into both sides (H6)', () => {
      const rp = resolveCabinet(cab({ face_grid: threeDrawers, handle_schedule: sharkSched }))
      const zones = rp.face_zones.sort((a, b) => a.row_index - b.row_index)
      const rails = rp.case_parts.filter(p => p.part_key.startsWith('fprail:')).sort((a, b) => a.Y - b.Y)
      expect(rails).toHaveLength(3)                                  // two between drawers + the top gap
      // Between drawers 0 and 1: 20 below drawer 0's top, 5 above drawer 1's bottom.
      const r0 = rails[0], d0top = zones[0].Y + zones[0].DY
      expect(r0.Y).toBeCloseTo(d0top - 20)
      expect(r0.DX).toBeCloseTo(45)                                  // DX = height
      expect(r0.Y + r0.DX).toBeCloseTo(zones[1].Y + 5)
      expect(r0.DY).toBe(900)                                        // full carcass width
      expect(r0.DZ).toBe(18)
      // Top rail clamps to the carcass top: 20 + 20 = 40 tall.
      const top = rails[2]
      expect(top.Y + top.DX).toBeCloseTo(900)
      expect(top.DX).toBeCloseTo(40)
      // Sides carry the notches in their outlines.
      const side = rp.case_parts.find(p => p.part_key === 'left_side')!
      expect(side.outline?.length).toBeGreaterThan(4)
      // Notch = rail thickness; closed ends get a RAILCUT (5) deeper relief.
      expect(side.outline!.some(q => Math.abs(q.x - (side.DX - 18)) < 0.01)).toBe(true)
      expect(side.outline!.some(q => Math.abs(q.x - (side.DX - 18 - 5)) < 0.01)).toBe(true)
      // Rails carry their grain (horizontal by default) + machining settings.
      expect(r0.grain_direction).toBe('horizontal')
      expect(r0.fprail).toEqual({ cut: 5, blockSetback: 15, blockDia: 10, blockDepth: 12 })
    })

    it('top backing rail pushes the carcass front rail back by its thickness; grain can run vertical', () => {
      const plain = resolveCabinet(cab({ face_grid: threeDrawers, top_type: 'front_rail' })).case_parts.find(p => p.part_key === 'front_rail')!
      const rp = resolveCabinet(cab({ face_grid: threeDrawers, handle_schedule: sharkSched, top_type: 'front_rail',
        rules: mergeRules(DEFAULT_RULES, { RAILGRAIN: 'vertical' }) }))
      const pushed = rp.case_parts.find(p => p.part_key === 'front_rail')!
      expect(pushed.Z).toBeCloseTo(plain.Z - 18)
      expect(rp.case_parts.find(p => p.part_key.startsWith('fprail:'))!.grain_direction).toBe('vertical')
    })

    it('FPRAIL=false (or bar handles) → no rails, plain sides', () => {
      const off = resolveCabinet(cab({ face_grid: threeDrawers, handle_schedule: sharkSched, rules: mergeRules(DEFAULT_RULES, { FPRAIL: false }) }))
      expect(off.case_parts.some(p => p.part_key.startsWith('fprail:'))).toBe(false)
      const bars = resolveCabinet(cab({ face_grid: threeDrawers }))
      expect(bars.case_parts.some(p => p.part_key.startsWith('fprail:'))).toBe(false)
      expect(bars.case_parts.find(p => p.part_key === 'left_side')!.outline).toBeUndefined()
    })

    it('bar handles keep the normal reveals', () => {
      const zones = resolveCabinet(cab({ face_grid: threeDrawers })).face_zones.sort((a, b) => a.row_index - b.row_index)
      expect(900 - (zones[2].Y + zones[2].DY)).toBeCloseTo(DEFAULT_RULES.REVT)
      expect(zones[1].Y - (zones[0].Y + zones[0].DY)).toBeCloseTo(DEFAULT_RULES.GAPR)
    })
  })

  it('no schedule row → no handle', () => {
    const [left] = resolveCabinet(cab({ handle_schedule: {} })).face_zones
    expect(left.handle).toBeNull()
  })
})
