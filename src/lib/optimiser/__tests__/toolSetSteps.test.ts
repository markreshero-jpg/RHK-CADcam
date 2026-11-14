// ============================================================
// z_cnc_tools T2 — tool-set steps matching Cabinet Vision's shaker
// and glass sets (CV program z_panel_optimizer/R300301A.anc):
//   • square_off = corners only (wall → corner → wall, arc back round
//     the previous tool's fillet), no full lap
//   • centre-on-line outline (V chamfer)
//   • ring-band pocket (glass rebate) leaves the middle alone
//   • depth ≥ board = right through
//   • every tool cuts at its OWN feed / rpm
//   • each part's steps stay in order across tool groups
//   • a step's own depth beats the operation's
// ============================================================

import { describe, it, expect } from 'vitest'
import { generateSheetGcode, DEFAULT_POST, type SheetRoute } from '../gcode'
import { expandToolSetMember, type RouteGeom, type ToolSetMember } from '../routes'
import type { NestedSheet } from '../nest'

const sheet: NestedSheet = {
  index: 0, materialId: 'm', thickness: 18,
  stock: { w: 2415, h: 1211, trimTop: 0, trimBottom: 0, trimLeft: 0, trimRight: 0, isOffcut: false, label: null },
  placements: [],
  efficiency: 0.4,
}
const profile = { ...DEFAULT_POST, onion_skin_z: 0, through_cut_z: -0.2 }
const gen = (routes: SheetRoute[]) => generateSheetGcode({ sheet, thickness: 18, profile, drills: [], routes, toolNumber: 101, toolDiameter: 10 }).split(/\r?\n/)

// Panel: 600 x 337 at (100, 100), like the CV shaker door's panel.
const area = (over: Partial<Extract<SheetRoute, { kind: 'area' }>>): SheetRoute => ({
  kind: 'area', label: 'Door', x: 100, y: 100, w: 600, h: 337, depth: 5, clear: false,
  fillStrategy: null, rasterAngleDeg: 0, stepoverPct: 0, toolNumber: 107, toolDiameter: 6, maxDepthPerPass: 10, ...over,
})
const num = (l: string, a: string) => { const m = new RegExp(`${a}(-?[\\d.]+)`).exec(l); return m ? parseFloat(m[1]) : NaN }

describe('square_off = corner clean-up only', () => {
  const ls = gen([area({ toolNumber: 108, toolDiameter: 2, depth: 5.4, corners: { cleanupR: 3 } })])
  const arcs = ls.filter(l => /^G[23] /.test(l))

  it('does four corners, each with one arc, and no full lap', () => {
    expect(arcs).toHaveLength(4)
    // never runs along a whole side
    const g1 = ls.filter(l => l.startsWith('G1 X'))
    expect(g1.every(l => !(num(l, 'X') > 120 && num(l, 'X') < 680 && num(l, 'Y') > 120 && num(l, 'Y') < 417))).toBe(true)
  })
  it('matches CV: goes into the corner 1mm off both walls and arcs R2 back (bottom-right)', () => {
    const i = ls.findIndex(l => l.startsWith('G1 X699') && / Y101(\s|$)/.test(l))
    expect(i).toBeGreaterThan(-1)
    expect(ls[i + 1]).toMatch(/^G1 X699 Y103/)
    expect(ls[i + 2]).toMatch(/^G2 X697 Y101 I-2 J0/)
  })
  it('cuts 5.4 deep', () => {
    expect(ls.some(l => /^G1 Z-5\.40* /.test(l))).toBe(true)
  })
  it('skips (with a warning) when there is nothing bigger to clean after', () => {
    const w = gen([area({ toolNumber: 108, toolDiameter: 2, corners: { cleanupR: 0 } })])
    expect(w.some(l => l.includes('no previous step'))).toBe(true)
    expect(w.some(l => /^G[23] /.test(l))).toBe(false)
  })
})

describe('centre-on-line outline (V chamfer)', () => {
  it('puts the tool centre on the rectangle, not a radius inside', () => {
    const on = gen([area({ toolNumber: 104, toolDiameter: 50.4, depth: 1, onLine: true })])
    expect(on.some(l => /^G0 X100 Y100\b/.test(l))).toBe(true)
    const inside = gen([area({ toolNumber: 107, toolDiameter: 6 })])
    expect(inside.some(l => /^G0 X103 Y103\b/.test(l))).toBe(true)
  })
})

describe('ring-band pocket (glass rebate)', () => {
  const ls = gen([area({ toolNumber: 102, toolDiameter: 10, clear: true, ringWidth: 15.9, depth: 6.35 })])
  const start = ls.findIndex(l => l.includes('internal features'))
  const end = ls.findIndex((l, i) => i > start && l.startsWith('M05'))
  const xs = ls.slice(start, end).filter(l => l.startsWith('G1 X') || l.startsWith('G0 X')).map(l => num(l, 'X'))
  it('stays inside the band — nothing nearer the middle than 15.9 in', () => {
    // tool centre between 5 (wall lap) and 10.9 (inner lap) in from each side
    expect(xs.every(x => (x >= 105 - 1e-6 && x <= 110.9 + 1e-6) || (x >= 689.1 - 1e-6 && x <= 695 + 1e-6))).toBe(true)
  })
  it('finishes on the wall lap', () => {
    expect(xs.some(x => Math.abs(x - 105) < 1e-6)).toBe(true)
    expect(xs.some(x => Math.abs(x - 110.9) < 1e-6)).toBe(true)
  })
})

describe('through cut', () => {
  it('a depth over the board thickness breaks through by the profile overshoot', () => {
    const ls = gen([area({ toolNumber: 102, toolDiameter: 10, depth: 99, maxDepthPerPass: 20 })])
    expect(ls.some(l => /^G1 Z-18\.20* /.test(l))).toBe(true)
    expect(ls.some(l => /Z-99/.test(l))).toBe(false)
  })
})

describe('each tool cuts at its own feed and rpm', () => {
  it('uses the route bit data, not the material routing tool', () => {
    const ls = gen([area({ toolNumber: 107, toolDiameter: 6, feed: 15000, plunge: 6000, rpm: 15500 })])
    const t = ls.findIndex(l => l.startsWith('T107'))
    expect(ls.slice(t, t + 4).some(l => /S15500\b/.test(l))).toBe(true)
    expect(ls.some(l => /F15000\b/.test(l))).toBe(true)
    expect(ls.some(l => /G1 Z-5 F6000\b/.test(l))).toBe(true)
  })
})

describe('the material Feed % governs route feeds too', () => {
  const genPct = (routes: SheetRoute[], pct: number) => generateSheetGcode({ sheet, thickness: 18, profile: { ...profile, base_feed_rate: 21000, material_feed_pct: pct }, drills: [], routes, toolNumber: 101, toolDiameter: 10 }).split(/\r?\n/)
  it('a route bit at 28000 on a 75% board cuts at 21000, like the outline', () => {
    const ls = genPct([area({ toolNumber: 102, toolDiameter: 10, feed: 28000, plunge: 6000 })], 75)
    expect(ls.some(l => /F28000\b/.test(l))).toBe(false)
    expect(ls.some(l => /F21000\b/.test(l))).toBe(true)
    expect(ls.some(l => /G1 Z-5 F6000\b/.test(l))).toBe(true)   // plunge stays absolute, as on the outline
  })
  it('a tool-set step feed override is absolute, not scaled', () => {
    const ls = genPct([area({ toolNumber: 107, toolDiameter: 6, feed: 12000, feedFixed: true })], 75)
    expect(ls.some(l => /F12000\b/.test(l))).toBe(true)
  })
})

describe('step order is kept per part across tool groups', () => {
  it('a shaker’s 6mm never runs before its 40mm pocket because a glass door used the 6mm first', () => {
    const glass = (n: number, t: number, d: number) => area({ partKey: 'glass', toolNumber: t, toolDiameter: d, x: 1000 + n })
    const shaker = (t: number, d: number) => area({ partKey: 'shaker', toolNumber: t, toolDiameter: d })
    const ls = gen([glass(0, 102, 10), glass(1, 107, 6), glass(2, 101, 10), shaker(109, 40), shaker(107, 6), shaker(108, 2), shaker(104, 50.4)])
    const at = (t: number) => ls.map((l, i) => l.startsWith(`T${t} `) ? i : -1).filter(i => i >= 0)
    const shaker107 = at(107)[at(107).length - 1]
    expect(at(109)[0]).toBeLessThan(shaker107)
    expect(shaker107).toBeLessThan(at(108)[0])
  })
})

describe('expandToolSetMember', () => {
  const parent = { source_table: 'face_zones', source_cabinet_id: 'c', source_part_key: 'z', operation_type: 'route', operation_action: 'pocket',
    pos_x: 300, pos_y: 200, size_dx: 480, size_dy: 280, offset_top_mm: null, offset_bottom_mm: null, offset_left_mm: null, offset_right_mm: null,
    length: null, width: null, depth: 5, size_dz: null, fill_strategy: null, raster_angle_deg: null, raster_stepover_pct: null } as RouteGeom
  const step = (over: Partial<ToolSetMember>): ToolSetMember => ({
    operation_type: 'outline', tool_id: 't', depth_mm: null, width_mm: null, offset_top_mm: null, offset_bottom_mm: null,
    offset_left_mm: null, offset_right_mm: null, fill_strategy: null, raster_angle_deg: null, raster_stepover_pct: null, ...over })

  it('the step’s own depth beats the operation’s', () => {
    expect(expandToolSetMember(parent, step({ depth_mm: 1 }))!.depth).toBe(1)
    expect(expandToolSetMember(parent, step({}))!.depth).toBe(5)
  })
  it('square_off asks for a corner clean-up; centre / ring options carry through', () => {
    expect(expandToolSetMember(parent, step({ operation_type: 'square_off' }))!.corners_cleanup_r).toBe(0)
    expect(expandToolSetMember(parent, step({ operation_type: 'square_off', cleanup_radius_mm: 3 }))!.corners_cleanup_r).toBe(3)
    expect(expandToolSetMember(parent, step({ tool_position: 'centre' }))!.on_line).toBe(true)
    expect(expandToolSetMember(parent, step({ operation_type: 'pocket', ring_width_mm: 15.9 }))!.ring_width).toBe(15.9)
  })
  it('negative offsets grow the area outward (glass rebate from the opening line)', () => {
    const g = expandToolSetMember(parent, step({ offset_left_mm: -15.9, offset_right_mm: -15.9, offset_top_mm: -15.9, offset_bottom_mm: -15.9 }))!
    expect(g.size_dx).toBeCloseTo(511.8)
    expect(g.size_dy).toBeCloseTo(311.8)
  })
})
