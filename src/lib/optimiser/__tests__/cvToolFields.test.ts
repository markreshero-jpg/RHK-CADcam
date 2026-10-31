// ============================================================
// z_cnc_tools T1 — Cabinet Vision tool fields reaching the output:
//   • drill through_depth_adj  → the bit's own through-hole overshoot
//   • drill depth_to_shoulder  → blind holes deepened by the point length
//   • drill auto_select / select_tolerance → which bit a hole snaps to
//   • router auto_select       → which bits may pocket an undrillable hole
//   • router through_depth_adj → the perimeter's break-through depth
// ============================================================

import { describe, it, expect } from 'vitest'
import { generateSheetGcode, DEFAULT_POST, type PostProfile, type SheetDrill } from '../gcode'
import { resolveDrillTool, drillTipExtra, type DrillLibItem, type RouterToolItem } from '../resolveDrillTools'
import type { NestedSheet } from '../nest'
import type { DrillBlockConfig } from '../gangDrill'

const THICKNESS = 16.5
const sheet: NestedSheet = {
  index: 0, materialId: 'mat-1', thickness: THICKNESS,
  stock: { w: 2415, h: 1211, trimTop: 0, trimBottom: 0, trimLeft: 0, trimRight: 0, isOffcut: false, label: null },
  placements: [{ uid: 'p1', baseUid: 'parts:p1', label: 'Left Gable', x: 0, y: 872, w: 758, h: 339, rotated: false }],
  efficiency: 0.21,
}
const block: DrillBlockConfig = {
  bankXCount: 12, bankYCount: 8, spacingMm: 32,
  xBankMcode: 'M88', yBankMcode: 'M89', sharedCorner: true,
  headOffsetXMm: 0, headOffsetYMm: -128, workOffsetCode: 'G54',
  xDiameters: Array(12).fill(5), yDiameters: Array(8).fill(5),
}
const profile: PostProfile = {
  ...DEFAULT_POST,
  material_surface_z: 'spoilboard', keep_decimal_point: true, modal_output: true,
  origin_corner: 'top_left', base_feed_rate: 28000, plunge_feed_rate: 6000,
  sheet_load_pause: false, dust_extraction_enabled: false, through_cut_z: -0.2, onion_skin_z: 0,
}
const gen = (drills: SheetDrill[], extra: { throughDepthAdj?: number | null } = {}) => generateSheetGcode({
  sheet, thickness: THICKNESS, profile, drills, toolNumber: 101, toolDiameter: 10, drillBlock: block, ...extra,
})
const cycles = (g: string) => g.split('\r\n').filter(l => l.startsWith('G98 G81'))

describe('drill through_depth_adj', () => {
  it('uses the machine overshoot when the bit has none', () => {
    expect(cycles(gen([{ x: 100, y: 900, diameter: 5, depth: 16.5 }]))[0]).toBe('G98 G81 Z-0.2 R36.5 F3000.')
  })
  it('uses the bit overshoot when set', () => {
    expect(cycles(gen([{ x: 100, y: 900, diameter: 5, depth: 16.5, throughAdj: 0.5 }]))[0]).toBe('G98 G81 Z-0.5 R36.5 F3000.')
  })
  it('leaves blind holes alone', () => {
    expect(cycles(gen([{ x: 100, y: 900, diameter: 5, depth: 12, throughAdj: 0.5 }]))[0]).toBe('G98 G81 Z4.5 R36.5 F3000.')
  })
})

describe('drill depth_to_shoulder', () => {
  it('works out the point length from the angle', () => {
    expect(drillTipExtra({ diameter: 5, point_angle: 90, depth_to_shoulder: true })).toBe(2.5)
    expect(drillTipExtra({ diameter: 5, point_angle: 90, depth_to_shoulder: false })).toBe(0)
    expect(drillTipExtra({ diameter: 5, point_angle: null, depth_to_shoulder: true })).toBe(0)
  })
  it('deepens a blind hole by the tip', () => {
    // 12 + 2.5 = 14.5 deep → Z2.
    expect(cycles(gen([{ x: 100, y: 900, diameter: 5, depth: 12, tipExtra: 2.5 }]))[0]).toBe('G98 G81 Z2. R36.5 F3000.')
  })
  it('never lets the tip break a blind hole through', () => {
    // 15 + 2.5 would be 17.5; capped at thickness − 0.5 = 16 → Z0.5
    expect(cycles(gen([{ x: 100, y: 900, diameter: 5, depth: 15, tipExtra: 2.5 }]))[0]).toBe('G98 G81 Z0.5 R36.5 F3000.')
  })
})

describe('drill auto_select / select_tolerance', () => {
  const lib: DrillLibItem[] = [
    { id: 'd5', name: '5mm', diameter: 5, max_depth: 35 },
    { id: 'd8', name: '8mm', diameter: 8, max_depth: 35, auto_select: false },
  ]
  const op = (diameter: number, drill_id: string | null = null) => ({ diameter, depth: 10, drill_id, auto_tool: true })

  it('skips bits switched off for auto-select', () => {
    expect(resolveDrillTool(op(8), lib).drill_id).toBeNull()
  })
  it('still uses them when the hole names them', () => {
    expect(resolveDrillTool(op(8, 'd8'), lib).drill_id).toBe('d8')
  })
  it('snaps within the default 0.5', () => {
    expect(resolveDrillTool(op(5.4), lib).drill_id).toBe('d5')
  })
  it('honours a tighter per-bit tolerance', () => {
    const tight = [{ ...lib[0], select_tolerance: 0.2 }]
    expect(resolveDrillTool(op(5.4), tight).drill_id).toBeNull()
  })
  it('carries the bit extras onto the result', () => {
    const r = resolveDrillTool(op(5), [{ ...lib[0], point_angle: 90, depth_to_shoulder: true, through_depth_adj: 0.4 }])
    expect(r.tip_extra).toBe(2.5)
    expect(r.through_adj).toBe(0.4)
  })
})

describe('router auto_select for the pocket fallback', () => {
  const tools: RouterToolItem[] = [
    { id: 'ball', diameter: 32, tool_number: 103, auto_select: false },
    { id: 't107', diameter: 6, tool_number: 107 },
    { id: 't102', diameter: 10, tool_number: 102, auto_select: false },
  ]
  it('never pockets with a bit that is switched off', () => {
    const r = resolveDrillTool({ diameter: 35, depth: 10, drill_id: null, auto_tool: true }, [], { routerTools: tools })
    expect(r.router_tool_number).toBe(107)
  })
  it('always allows the machine preferred pocket tool', () => {
    const r = resolveDrillTool({ diameter: 35, depth: 10, drill_id: null, auto_tool: true }, [], { routerTools: tools, preferredPocketToolNumber: 102 })
    expect(r.router_tool_number).toBe(102)
  })
})

describe('router through_depth_adj', () => {
  it('cuts parts out at the profile depth by default', () => {
    const g = gen([])
    expect(g).toMatch(/Z-0\.2(?!\d)/)
    expect(g).not.toMatch(/Z-1\.(?!\d)/)
  })
  it('cuts parts out at the tool depth when set', () => {
    const g = gen([], { throughDepthAdj: 1 })
    expect(g).toMatch(/Z-1\.(?!\d)/)
    expect(g).not.toMatch(/Z-0\.2(?!\d)/)
  })
})
