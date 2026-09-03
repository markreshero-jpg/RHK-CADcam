// ============================================================
// M5 — section structure, tool change (D6) and through-hole overshoot.
//
// The gold reference's tool change is the target shape:
//   G0 G59 G90 X80.5 Y-325.75            current position, in the NEW offset
//   T101                                  call the tool
//   G0 G59 G90 X429.4 Y-340. M13 S18000   move to lead-in, spindle up
//   G43 H11 Z36.5                         length offset at safe Z
//   G0 Z26.5                              drop to the approach plane
//
// That first line is NOT a fixed park position. Across the reference programs
// it is always exactly where the previous operation left the head, restated in
// the incoming tool's work offset:
//   R940103Z router->router   X2367.97 Y-811.99  ->  X2367.97 Y-811.99  (zero)
//   R940102Z drill->router    X33.5 Y-1102.49    ->  X33.5 Y-910.49     (Y+192)
// So its real job is to establish G59/G90/rapid before the T-word, not to move.
// ============================================================

import { describe, it, expect } from 'vitest'
import { generateSheetGcode, DEFAULT_POST, type PostProfile, type SheetDrill } from '../gcode'
import { validateGcode, errorsOf, formatFinding } from '../gcodeValidate'
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

// Mirrors the live 'Standard' machine profile row.
const profile: PostProfile = {
  ...DEFAULT_POST,
  material_surface_z: 'spoilboard', keep_decimal_point: true, modal_output: true,
  origin_corner: 'top_left', safe_z_clearance: 20, clearance_z: 10, drill_clearance_z: 20,
  onion_skin_z: 1.3, through_cut_z: -0.2, ramp_in_angle: 27,
  base_feed_rate: 28000, plunge_feed_rate: 6000, drill_feed_rate: 3000,
  tool_change_code: 'T{n}', spindle_on_code: 'M13', router_work_offset: 'G59',
  emit_tool_length_offset: true, emit_router_work_offset: true, tool_h_offset_delta: -90,
  sheet_load_pause: false, dust_extraction_enabled: false,
}

const drills: SheetDrill[] = [
  { x: 12.25, y: 927, diameter: 5, depth: 12 },
  { x: 70.5, y: 885.25, diameter: 5, depth: 12 },
  { x: 102.5, y: 885.25, diameter: 5, depth: 12 },
  { x: 134.5, y: 885.25, diameter: 5, depth: 12 },
]

const gen = (over: Partial<PostProfile> = {}, extra: Record<string, unknown> = {}) =>
  generateSheetGcode({
    sheet, thickness: THICKNESS, profile: { ...profile, ...over }, drills,
    toolNumber: 101, toolDiameter: 10, maxDepthPerPass: 8, drillBlock: block,
    toolName: 'OUTLINE 10MM 3-FLUTE COMPRESSION', ...extra,
  })

const lines = (g: string) => g.split('\r\n')

describe('D6 — tool change follows the gold reference', () => {
  const L = lines(gen())
  const t = L.findIndex(l => l === 'T101')

  it('calls the tool', () => expect(t).toBeGreaterThan(-1))

  it('restates a position in the new work offset before the T-word', () => {
    expect(L[t - 1]).toMatch(/^G0 G59 G90 X-?[\d.]+ Y-?[\d.]+$/)
  })

  it('names exactly where the drill block left the head, in the router frame', () => {
    // The line covers no distance: the head is already at that physical point.
    // The drill block reads it in its own frame (G54 + head offset); the router
    // reads the same point without the offset. That difference is the entire
    // content of the move, and it is why a router-to-router change is zero.
    const park = /^G0 G59 G90 X(-?[\d.]+) Y(-?[\d.]+)$/.exec(L[t - 1])!
    // Last gang positioning block before the tool change.
    const lastPos = L.slice(0, t).filter(l => l.startsWith('G90 G0 G54 ')).pop()!
    const m = /X(-?[\d.]+) Y(-?[\d.]+)/.exec(lastPos)!
    expect(Number(park[1])).toBeCloseTo(Number(m[1]) - block.headOffsetXMm, 3)
    expect(Number(park[2])).toBeCloseTo(Number(m[2]) - block.headOffsetYMm, 3)
  })

  it('moves to the lead-in with the spindle start in the same block', () => {
    expect(L[t + 1]).toMatch(/^G0 G59 G90 X-?[\d.]+ Y-?[\d.]+ M13 S\d+$/)
  })

  it('applies the length offset at safe Z, then drops to the approach plane', () => {
    expect(L[t + 2]).toBe('G43 H11 Z36.5')
    expect(L[t + 3]).toBe('G0 Z26.5')
  })

  it('cuts from the lead-in it just moved to', () => {
    // The move folded into the tool-change block must be the same point the
    // ramp starts from — no second approach move, and no silent teleport.
    const leadIn = /X(-?[\d.]+) Y(-?[\d.]+)/.exec(L[t + 1])!
    const firstCut = L.slice(t + 4).find(l => l.startsWith('G1 '))!
    expect(firstCut).toMatch(/^G1 X-?[\d.]+ Y-?[\d.]+ Z-?[\d.]+ F\d/)
    expect(Number(leadIn[1])).not.toBeNaN()
    // and nothing repositions in between
    expect(L.slice(t + 4, L.indexOf(firstCut)).filter(l => /^G0 X/.test(l))).toEqual([])
  })

  it('omits the line when nothing ran before the tool change', () => {
    // No drilling means no established position to restate.
    const M = lines(generateSheetGcode({
      sheet, thickness: THICKNESS, profile, drills: [], toolNumber: 101,
      toolDiameter: 10, maxDepthPerPass: 8, drillBlock: block, toolName: 'OUTLINE 10MM',
    }))
    const i = M.findIndex(l => l === 'T101')
    expect(M[i - 1]).toBe('(DIAMETER: 10.)')
    expect(M[i + 1]).toMatch(/M13 S\d+$/)   // still gets to work with the spindle on
  })

  it('names the tool and its diameter in separate comments', () => {
    const g = gen()
    expect(g).toContain('(ROUTE TOOL #101: OUTLINE 10MM 3-FLUTE COMPRESSION)')
    expect(g).toContain('(DIAMETER: 10.)')
  })

  it('omits the tool comment when no name is known', () => {
    const g = generateSheetGcode({
      sheet, thickness: THICKNESS, profile, drills, toolNumber: 101,
      toolDiameter: 10, maxDepthPerPass: 8, drillBlock: block,
    })
    expect(g).not.toContain('ROUTE TOOL')
    expect(g).toContain('(DIAMETER: 10.)')
  })
})

describe('drilling section structure', () => {
  const L = lines(gen())

  it('homes Z once after all drilling, not after every gang firing', () => {
    expect(L.filter(l => l === 'G17 G91 G28 Z0 M95')).toHaveLength(1)
  })

  it('enables the banks once, not per firing', () => {
    expect(L.filter(l => l === 'M23')).toHaveLength(1)
    expect(L.filter(l => l === 'M21')).toHaveLength(1)
  })

  it('still cancels every canned cycle', () => {
    const opens = L.filter(l => l.startsWith('G98 G81')).length
    expect(opens).toBeGreaterThan(1)                 // more than one firing
    expect(L.filter(l => l === 'G80').length).toBeGreaterThanOrEqual(opens)
  })

  it('closes the drilling section before the tool change', () => {
    expect(L.indexOf('G17 G91 G28 Z0 M95')).toBeLessThan(L.indexOf('T101'))
  })

  it('separates drilling from routing with blank lines', () => {
    const i = L.findIndex(l => l.startsWith('(ROUTE TOOL'))
    expect(i).toBeGreaterThan(0)
    expect(L[i - 1]).toBe('')
    expect(L[i - 2]).toBe('')
  })

  it('puts a blank line between gang groups', () => {
    const g80s = L.map((l, i) => l === 'G80' ? i : -1).filter(i => i >= 0)
    expect(g80s.length).toBeGreaterThan(1)
    expect(L[g80s[0] + 1]).toBe('')
  })

  it('never prefixes a line number to a blank separator', () => {
    const M = lines(gen({ line_numbers_enabled: true }))
    expect(M.filter(l => /^N\d+\s*$/.test(l))).toEqual([])
  })
})

describe('through-hole overshoot', () => {
  const cycles = (g: string) => lines(g).filter(l => l.startsWith('G98 G81'))
  const through: SheetDrill[] = [{ x: 100, y: 900, diameter: 5, depth: THICKNESS }]

  it('adds the overshoot to a hole drilled the full thickness', () => {
    const g = generateSheetGcode({
      sheet, thickness: THICKNESS, profile, drills: through, toolNumber: 101, drillBlock: block,
    })
    expect(cycles(g)[0]).toBe('G98 G81 Z-0.2 R36.5 F3000.')   // gold's through-hole value
  })

  it('leaves blind holes at their exact depth', () => {
    const g = generateSheetGcode({
      sheet, thickness: THICKNESS, profile, toolNumber: 101, drillBlock: block,
      drills: [{ x: 100, y: 900, diameter: 5, depth: 12 }],
    })
    expect(cycles(g)[0]).toBe('G98 G81 Z4.5 R36.5 F3000.')    // 16.5 - 12, no overshoot
  })

  it('is configurable and can be switched off', () => {
    const g = generateSheetGcode({
      sheet, thickness: THICKNESS, profile: { ...profile, drill_through_overshoot: 0 },
      drills: through, toolNumber: 101, drillBlock: block,
    })
    expect(cycles(g)[0]).toBe('G98 G81 Z0. R36.5 F3000.')
  })

  it('treats a hole asked slightly deeper than the panel as through, not deeper still', () => {
    const g = generateSheetGcode({
      sheet, thickness: THICKNESS, profile, toolNumber: 101, drillBlock: block,
      drills: [{ x: 100, y: 900, diameter: 5, depth: 20 }],
    })
    expect(cycles(g)[0]).toBe('G98 G81 Z-0.2 R36.5 F3000.')
  })
})

describe('the restructured program still validates', () => {
  it('reports zero errors', () => {
    expect(errorsOf(validateGcode(gen())).map(formatFinding)).toEqual([])
  })

  it('reports zero errors on the generic drilling path', () => {
    const g = generateSheetGcode({
      sheet, thickness: THICKNESS, profile, drills, toolNumber: 101,
      toolDiameter: 10, maxDepthPerPass: 8, toolName: 'OUTLINE 10MM',
    })
    expect(errorsOf(validateGcode(g)).map(formatFinding)).toEqual([])
  })

  it('reports zero errors with no drilling', () => {
    const g = generateSheetGcode({
      sheet, thickness: THICKNESS, profile, drills: [], toolNumber: 101,
      toolDiameter: 10, drillBlock: block, toolName: 'OUTLINE 10MM',
    })
    expect(errorsOf(validateGcode(g)).map(formatFinding)).toEqual([])
  })
})
