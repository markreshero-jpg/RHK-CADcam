import { describe, it, expect } from 'vitest'
import { buildFormulaScope, buildPartMap } from '../context'
import { evaluateFormula } from '../index'
import type { CabinetInput, ResolvedCabinet } from '../../resolver/types'

// ── Minimal fixtures ──────────────────────────────────────────
// Hand-built resolved output: a 600×720×560 base cabinet with two gables,
// a bottom, a shelf and one door zone. Values chosen so display-space
// remapping is visible (each part's DX/DY/DZ differ per axis convention).

const XF0 = { AX: 0, AY: 0, AZ: 0 }

const resolved = {
  cabinet_id: 'cab-1',
  case_parts: [
    // Gable: DX = depth 560, DY = height 570, DZ = thickness 16
    { part_key: 'left_side',  DX: 560, DY: 570, DZ: 16, X: 0,   Y: 150, Z: 0, ...XF0, material_id: 'm', edge_band: {} },
    { part_key: 'right_side', DX: 560, DY: 570, DZ: 16, X: 584, Y: 150, Z: 0, ...XF0, material_id: 'm', edge_band: {} },
    // Bottom (horizontal kind): DX = depth 560, DY = width 568, DZ = 16
    { part_key: 'bottom', DX: 560, DY: 568, DZ: 16, X: 16, Y: 150, Z: 0, ...XF0, material_id: 'm', edge_band: {} },
  ],
  toekick_parts: [
    // Kick face: DY = width, DX = height (vertical panel kind)
    { part_key: 'kick_front_face', sort_order: 0, is_detached: false, DX: 150, DY: 600, DZ: 16, X: 0, Y: 0, Z: 494, ...XF0, material_id: 'm', edge_band: {} },
  ],
  internal_parts: [
    // Shelf (horizontal kind): DX = depth, DY = width
    { part_type: 'adj_shelf', sort_order: 0, y_locked: false, DX: 500, DY: 568, DZ: 16, X: 16, Y: 400, Z: 30, ...XF0, material_id: 'm', edge_band: {} },
  ],
  internal_slides: [],
  face_rows: [], face_cols: [],
  face_zones: [
    // Door zone: dxIsWidth → DX = width 597, DY = height 567
    { row_index: 0, col_index: 0, face_type: 'door', DX: 597, DY: 567, DZ: 18, X: 1.5, Y: 151.5, Z: 560, ...XF0, material_id: 'd', edge_band: {} },
  ],
  drawer_stacks: [], seam_joints: [], hinge_instances: [],
  errors: [], warnings: [],
} as unknown as ResolvedCabinet

const input = {
  DX: 600, DY: 720, DZ: 560,
  has_toekick: true,
  rules: { TOEH: 150, SCRT: 0, SCRBT: 0, REVL: 1.5, TOP_TYPE: 'full_top' },
  material: { id: 'm', DZ: 16 },
  door_material: { id: 'd', DZ: 18 },
} as unknown as CabinetInput

const scope = buildFormulaScope(resolved, input, {
  room: { cab_depth: 570, height: 2400 },
  wall: { length: 3600, height: 2400 },
  lookupCabinet: label => (label === 'B01' ? { w: 450, h: 720, d: 560 } : undefined),
  lookupWall: name => (name === '1' ? { length: 3600 } : undefined),
})

const ev = (src: string) => {
  const r = evaluateFormula(src, scope)
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

describe('buildFormulaScope roots', () => {
  it('cab dims + kick', () => {
    expect(ev('cab.w')).toBe(600)
    expect(ev('cab.h')).toBe(720)
    expect(ev('cab.d')).toBe(560)
    expect(ev('cab.kick')).toBe(150)
  })

  it('numeric rules only — enums are excluded', () => {
    expect(ev('r.TOEH')).toBe(150)
    expect(ev('r.REVL')).toBe(1.5)
    const r = evaluateFormula('r.TOP_TYPE', scope)
    expect(r.ok).toBe(false) // string rule not exposed as a number
  })

  it('thicknesses with fallbacks', () => {
    expect(ev('t.gable')).toBe(16)
    expect(ev('t.door')).toBe(18)
    expect(ev('t.shelf')).toBe(16)  // falls back to carcass material
  })

  it('t.door follows the door style blank over the door_face board', () => {
    // A 16mm style in a room of an 18mm job: panels must size to the 16 doors made.
    const s = buildFormulaScope(resolved, { ...input, door_thickness: 16 } as CabinetInput)
    const r = evaluateFormula('cab.d + t.door + 2', s)
    expect(r.ok && r.value).toBe(560 + 16 + 2)
  })

  it('extras: room / wall scopes', () => {
    expect(ev('room.cab_depth + 20')).toBe(590)
    expect(ev('wall.length')).toBe(3600)
  })
})

describe('part() lookups in display space', () => {
  it('gable (side kind): [w,h,d] = [DZ, DY, DX]', () => {
    // w = DZ (16, thickness across the wall), h = DY (570), d = DX (560)
    expect(ev('part("left_gable").h')).toBe(570)
    expect(ev('part("left_gable").w')).toBe(16)
    expect(ev('part("left_gable").d')).toBe(560)
    expect(ev('part("left_gable").t')).toBe(16)
    expect(ev('part("left_gable").y')).toBe(150)
  })

  it('bottom (horizontal): w=DY, h=DZ, d=DX', () => {
    expect(ev('part("bottom").w')).toBe(568)
    expect(ev('part("bottom").h')).toBe(16)
    expect(ev('part("bottom").d')).toBe(560)
  })

  it('stable ids and aliases both resolve', () => {
    expect(ev('part("case_left_side").h')).toBe(570)
    expect(ev('part("int_adj_shelf_0").w')).toBe(568)
    expect(ev('part("tk_kick_front_face_0").w')).toBe(600)
    expect(ev('part("zone_0_0").w')).toBe(597)   // face zones: dxIsWidth
    expect(ev('part("zone_0_0").h')).toBe(567)
  })

  it('raw CV axes (preferred): dy = length, dx = width, dz = thickness', () => {
    // Orientation-proof — same fields for every part kind.
    expect(ev('part("left_gable").dy')).toBe(570)
    expect(ev('part("left_gable").dx')).toBe(560)
    expect(ev('part("left_gable").dz')).toBe(16)
    expect(ev('part("bottom").dy')).toBe(568)
    expect(ev('part("bottom").dz')).toBe(16)
    expect(ev('part("zone_0_0").dy')).toBe(567)   // face zone: DY = height/length
    expect(ev('part("zone_0_0").dx')).toBe(597)
  })

  it('cabinet()/wall() lookups via extras', () => {
    expect(ev('cabinet("B01").w')).toBe(450)
    expect(ev('wall("1").length')).toBe(3600)
  })

  it('realistic composite formulas', () => {
    // Shelf width from gables: cab.w - both gable thicknesses - clearance
    expect(ev('cab.w - part("left_gable").t - part("right_gable").t - 2 * r.REVL')).toBe(565)
    // Gable height from cabinet: full height minus kick
    expect(ev('cab.h - cab.kick')).toBe(570)
    expect(ev('cab.h - cab.kick = part("left_gable").h')).toBe(1)
  })
})

describe('buildPartMap ids', () => {
  it('emits the stable id scheme', () => {
    const ids = [...buildPartMap(resolved).keys()]
    expect(ids).toContain('case_left_side')
    expect(ids).toContain('case_right_side')
    expect(ids).toContain('case_bottom')
    expect(ids).toContain('tk_kick_front_face_0')
    expect(ids).toContain('int_adj_shelf_0')
    expect(ids).toContain('zone_0_0')
  })
})
