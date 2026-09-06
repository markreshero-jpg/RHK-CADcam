// ============================================================
// Mid-program tool changes. Every tool call — pocket bits, internal-feature
// bits and the perimeter bit — goes through one section helper, so they all
// get the shape the reference programs use.
//
// From R940102Z (T104 -> T102), the target for a router-to-router change:
//   G80 / G17 G91 G28 Z0 M95 / M22      close the outgoing section
//   (ROUTE TOOL #102:   COLOURBOARD 10MM)
//   (DIAMETER: 10.)
//   G0 G59 G90 X2192. Y-984.49          current position, in the new offset
//   T102
//   G0 G59 G90 X705.9 Y-609.49 M13 S18000
//   G43 H12 Z38.
//   G0 Z28.
// ============================================================

import { describe, it, expect } from 'vitest'
import { generateSheetGcode, DEFAULT_POST, type PostProfile, type SheetDrill, type SheetRoute } from '../gcode'
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

// Gang-drilled holes, a hole no drill can make (pocket-routed with T102), an
// internal groove on T109, and the perimeter on T101 — four tools in one sheet.
const drills: SheetDrill[] = [
  { x: 12.25, y: 927, diameter: 5, depth: 12 },
  { x: 70.5, y: 885.25, diameter: 5, depth: 12 },
  { x: 102.5, y: 885.25, diameter: 5, depth: 12 },
  { x: 300, y: 1000, diameter: 35, depth: 12, pocket: { toolNumber: 102, toolDiameter: 10 } },
]

const routes: SheetRoute[] = [
  { kind: 'groove', label: 'Back groove', x1: 100, y1: 950, x2: 600, y2: 950,
    width: 6, depth: 8, toolNumber: 109, toolDiameter: 6, maxDepthPerPass: 4 },
]

const gen = (over: Partial<PostProfile> = {}) => generateSheetGcode({
  sheet, thickness: THICKNESS, profile: { ...profile, ...over }, drills, routes,
  toolNumber: 101, toolDiameter: 10, maxDepthPerPass: 8, drillBlock: block,
  toolNames: { 101: 'OUTLINE 10MM', 102: 'POCKET 10MM', 109: '6MM SLOTTER' },
})

const L = () => gen().split('\r\n')
const callIdx = (lines: string[], t: string) => lines.findIndex(l => l === t)

describe('every tool in the program gets a proper tool-change block', () => {
  const lines = L()

  it('calls all three routing tools', () => {
    expect(callIdx(lines, 'T102')).toBeGreaterThan(-1)   // pocket
    expect(callIdx(lines, 'T109')).toBeGreaterThan(-1)   // groove
    expect(callIdx(lines, 'T101')).toBeGreaterThan(-1)   // perimeter
  })

  for (const [tool, h] of [['T102', 12], ['T109', 19], ['T101', 11]] as const) {
    it(`${tool} restates position, calls the tool, then moves with the spindle`, () => {
      const i = callIdx(lines, tool)
      expect(lines[i - 1]).toMatch(/^G0 G59 G90 X-?[\d.]+ Y-?[\d.]+$/)
      expect(lines[i + 1]).toMatch(/^G0 G59 G90 X-?[\d.]+ Y-?[\d.]+ M13 S\d+$/)
      expect(lines[i + 2]).toBe(`G43 H${h} Z36.5`)
      expect(lines[i + 3]).toMatch(/^G0 Z-?[\d.]+$/)
    })
  }

  it('names every tool and its diameter', () => {
    const g = gen()
    expect(g).toContain('(ROUTE TOOL #102: POCKET 10MM)')
    expect(g).toContain('(ROUTE TOOL #109: 6MM SLOTTER)')
    expect(g).toContain('(ROUTE TOOL #101: OUTLINE 10MM)')
  })
})

describe('work offset — the bug this refactor closed', () => {
  it('puts every routing section on the router work offset, not the drill block one', () => {
    // Pockets and internal features previously emitted a bare tool change with
    // no work offset at all, so after gang drilling switched to G54 they would
    // cut in the DRILL BLOCK's offset.
    const lines = L()
    for (const tool of ['T102', 'T109', 'T101']) {
      const i = callIdx(lines, tool)
      expect(lines[i - 1]).toContain('G59')
      expect(lines[i + 1]).toContain('G59')
    }
  })

  it('omits the work offset when the profile does not ask for one', () => {
    const g = generateSheetGcode({
      sheet, thickness: THICKNESS, drills: [], routes, toolNumber: 101, toolDiameter: 10,
      profile: { ...profile, emit_router_work_offset: false },
    })
    expect(g).not.toContain('G59')
  })
})

describe('sections are closed before the next tool is called', () => {
  const lines = L()

  it('closes each outgoing routing section the way the reference does', () => {
    // Every tool call after the first is preceded by G80 / home Z / M22.
    for (const tool of ['T109', 'T101']) {
      const i = callIdx(lines, tool)
      const before = lines.slice(0, i).filter(l => l.length)
      expect(before.slice(-6, -3)).toEqual(['G80', 'G17 G91 G28 Z0 M95', 'M22'])
    }
  })

  it('closes with the reference shape and nothing else', () => {
    // No spindle stop inside a routing section: the close (G80 / home Z / M22)
    // IS the ending, exactly as the reference programs do it. The generic
    // single-spindle drilling path and the fallback footer still stop the
    // spindle — only the router sections were doubling up.
    const i = callIdx(lines, 'T109')
    expect(lines.slice(0, i)).not.toContain('M05')
  })

  it('does not close a routing section that was never opened', () => {
    // The drilling section emits its own close; the first routing tool must not
    // add a second one on top of it.
    const i = callIdx(lines, 'T102')
    const before = lines.slice(0, i).filter(l => l.length)
    expect(before.filter(l => l === 'G17 G91 G28 Z0 M95')).toHaveLength(1)
  })

  it('separates every section with blank lines', () => {
    for (const tool of ['T102', 'T109', 'T101']) {
      const i = lines.findIndex(l => l === tool)
      const banner = lines.slice(0, i).map((l, k) => l.startsWith('(ROUTE TOOL') ? k : -1).filter(k => k >= 0).pop()!
      expect(lines[banner - 1]).toBe('')
      expect(lines[banner - 2]).toBe('')
    }
  })
})

describe('head tracking across tool changes', () => {
  it('each tool change starts from where the previous section finished', () => {
    // Checked with modal compaction OFF so every motion line carries both axes.
    // Under compaction a feed move may drop an unchanged axis, so "the last line
    // mentioning X and Y" is not the last position.
    const lines = gen({ modal_output: false }).split('\r\n')
    for (const tool of ['T109', 'T101']) {
      const i = lines.findIndex(l => l === tool)
      const park = /^G0 G59 G90 X(-?[\d.]+) Y(-?[\d.]+)$/.exec(lines[i - 1])!
      const prev = lines.slice(0, i - 1).filter(l => /X-?[\d.]+ Y-?[\d.]+/.test(l)).pop()!
      const m = /X(-?[\d.]+) Y(-?[\d.]+)/.exec(prev)!
      expect(Number(park[1])).toBeCloseTo(Number(m[1]), 3)
      expect(Number(park[2])).toBeCloseTo(Number(m[2]), 3)
    }
  })
})

describe('the multi-tool program still validates', () => {
  it('reports zero errors', () => {
    expect(errorsOf(validateGcode(gen())).map(formatFinding)).toEqual([])
  })

  it('reports zero errors with modal compaction off', () => {
    expect(errorsOf(validateGcode(gen({ modal_output: false }))).map(formatFinding)).toEqual([])
  })

  it('is still CRLF and 7-bit ASCII throughout', () => {
    const g = gen()
    expect(g).not.toMatch(/[^\r]\n/)
    expect([...g].every(ch => ch.charCodeAt(0) <= 127)).toBe(true)
  })

  it('keeps all drilling before all routing', () => {
    const g = gen()
    expect(g.lastIndexOf('G98 G81')).toBeLessThan(g.indexOf('T102'))
  })
})
