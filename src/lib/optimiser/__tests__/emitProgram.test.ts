// ============================================================
// M2 — end-to-end emission. The unit tests cover the helpers; this asserts the
// properties that actually decide whether the EVO49 loads the file, on a whole
// posted program built through the real code path.
//
// Sheet and part match the failing job (2415 x 1211 board, 758 x 339 panel,
// 16.5mm) so the output is comparable to both reference files.
// ============================================================

import { describe, it, expect } from 'vitest'
import { generateSheetGcode, DEFAULT_POST, type PostProfile, type SheetDrill } from '../gcode'
import { validateGcode, errorsOf, warningsOf, formatFinding } from '../gcodeValidate'
import type { NestedSheet } from '../nest'
import type { DrillBlockConfig } from '../gangDrill'

const sheet: NestedSheet = {
  index: 0,
  materialId: 'mat-1',
  thickness: 16.5,
  stock: { w: 2415, h: 1211, trimTop: 0, trimBottom: 0, trimLeft: 0, trimRight: 0, isOffcut: false, label: null },
  placements: [
    { uid: 'p1', baseUid: 'parts:p1', label: 'Left Gable', x: 0, y: 872, w: 758, h: 339, rotated: false },
  ],
  efficiency: 0.21,
}

// The machine preamble/postamble live in the profile row (cnc_machine_profiles
// .header_template / .footer_template) and own the % wrapper, O-number, #1-#3
// macros and vacuum-zone subprograms. Reproduced here from the posted program
// that failed on the machine, so the test exercises the real configuration.
const HEADER = [
  '%',
  '{O}',
  '(JOB NUMBER {JOB})',
  '(MATERIAL: {MATERIAL})',
  '(LOAD: Material face UP)',
  '#1={LENGTH} (MATERIAL LENGTH)',
  '#2={WIDTH} (MATERIAL WIDTH)',
  '#3={THICKNESS} (MATERIAL THICKNESS)',
  'M98P"ZONESELECT" (VACUUM CHAMBER SELECTION)',
  'M06 (APPLY VACUUM)',
  'G04X2.0',
  'G52 X0.00 Y0.00 (Set\\Clear G52 Compensation)',
  'G0 G21 G91 G28 Z0 M95',
  'G90 G40 M22',
  'M88 B0',
  'M89 B0',
  'G08 P1',
  'M22',
].join('\n')

const FOOTER = [
  'G80',
  'G91 G28 Z0 M95',
  'G90 G40 G49 H0 M25',
  'M88 B0',
  'M89 B0',
  'G91 G28 Z0.0',
  'G90 X0. Y0.',
  'G52 X0.00 Y0.00 (cancel offsets)',
  'G08 P0',
  'M98P"ZONEDESELECT" (VACUUM CHAMBER DESELECT)',
  '/M07 (RELEASE VACUUM)',
  '/G04X1.5',
  '/M105 (PUSHING CYCLE)',
  'M30',
  '%',
].join('\n')

// Anderson EVO49-shaped profile: modal .anc dialect, top-left datum, gang drilling.
const anderson: PostProfile = {
  ...DEFAULT_POST,
  header_template: HEADER, footer_template: FOOTER,
  origin_corner: 'top_left', x_axis_direction: 'positive_right', y_axis_direction: 'positive_up',
  keep_decimal_point: true, modal_output: true,
  emit_tool_length_offset: true, emit_router_work_offset: true, tool_h_offset_delta: -90,
  // Spoilboard zero: Z0 is the table, the material top sits at `thickness`.
  // That is what makes the gold reference's numbers what they are — clearance
  // Z36.5 = 16.5 + 20, approach Z26.5 = +10, through cut Z-0.2.
  material_surface_z: 'spoilboard',
  safe_z_clearance: 20, clearance_z: 10, drill_clearance_z: 20,
  // Matches the live 'Standard' profile row.
  onion_skin_z: 1.3, through_cut_z: -0.2, ramp_in_angle: 27,
  base_feed_rate: 28000, plunge_feed_rate: 6000,
  sheet_load_pause: false, dust_extraction_enabled: false,
  // The EVO49 calls the pocket bare (no M06) and starts the spindle with M13.
  tool_change_code: 'T{n}', spindle_on_code: 'M13', router_work_offset: 'G59',
}

const block: DrillBlockConfig = {
  bankXCount: 12, bankYCount: 8, spacingMm: 32,
  xBankMcode: 'M88', yBankMcode: 'M89', sharedCorner: true,
  headOffsetXMm: 0, headOffsetYMm: -128, workOffsetCode: 'G54',
  xDiameters: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  yDiameters: [5, 5, 5, 5, 5, 5, 5, 5],
}

// A gangable row plus singles, in sheet coords inside the placed part.
const drills: SheetDrill[] = [
  { x: 12.25, y: 927, diameter: 5, depth: 13 },
  { x: 12.25, y: 1157, diameter: 5, depth: 13 },
  { x: 70.5, y: 885.25, diameter: 5, depth: 13 },
  { x: 102.5, y: 885.25, diameter: 5, depth: 13 },
  { x: 134.5, y: 885.25, diameter: 5, depth: 13 },
  { x: 745.75, y: 927, diameter: 5, depth: 13 },
]

const post = (over: Partial<PostProfile> = {}) => generateSheetGcode({
  sheet, thickness: 16.5, profile: { ...anderson, ...over }, drills,
  toolNumber: 101, toolDiameter: 10, maxDepthPerPass: 8,
  jobNumber: 'RHK6539', materialName: 'Whiteboard 16.5mm', programNumber: 'O6539',
  drillBlock: block,
})

describe('posted program — encoding (D1)', () => {
  const g = post()

  it('terminates every line with CRLF', () => {
    expect(g).not.toMatch(/[^\r]\n/)          // no bare LF
    expect(g).not.toMatch(/\r(?!\n)/)         // no bare CR
    expect(g.endsWith('\r\n')).toBe(true)
  })

  it('is pure 7-bit ASCII', () => {
    const bad = [...g].filter(ch => ch.charCodeAt(0) > 127)
    expect(bad).toEqual([])
  })

  it('has no BOM', () => {
    expect(g.charCodeAt(0)).not.toBe(0xfeff)
    expect(g.startsWith('%')).toBe(true)
  })

  it('does not depend on the host platform for its line endings', () => {
    // Regression guard: os.EOL would make this pass on Windows and fail on CI.
    expect(g.split('\r\n').length).toBe(g.split('\n').length)
  })
})

describe('posted program — comments (D2, D3)', () => {
  const g = post()
  const comments = g.split('\r\n').flatMap(l => l.match(/\([^)]*\)/g) ?? [])

  it('emits comments at all (guards against a vacuous test)', () => {
    expect(comments.length).toBeGreaterThan(3)
  })

  it('has balanced brackets on every line', () => {
    for (const line of g.split('\r\n')) {
      let depth = 0
      for (const ch of line) {
        if (ch === '(') depth++
        else if (ch === ')') depth--
        expect(depth).toBeGreaterThanOrEqual(0)   // a ')' before any '('
      }
      expect(depth).toBe(0)
    }
  })

  it('contains no nested or stray brackets inside comment content', () => {
    for (const cm of comments) {
      expect(cm.slice(1, -1)).not.toMatch(/[()]/)
    }
  })

  it('emits the drilling banner without the (s) idiom that broke it', () => {
    expect(g).toMatch(/\(Drilling - \d+ gang groups over \d+ bands of [\d.]+mm, Anderson M88\/M89\)/)
  })
})

describe('posted program — canned cycles (D4)', () => {
  const g = post()

  it('opens at least one drill cycle', () => {
    expect(g).toMatch(/G98 G81 /)
  })

  it('never emits group-01 motion between a cycle open and its G80', () => {
    let open = false
    for (const line of g.split('\r\n')) {
      if (open && /\bG0*[0-3]\b/.test(line)) throw new Error(`group-01 inside cycle: ${line}`)
      if (/\bG(?:7[346]|8[1-9])\b/.test(line)) open = true
      else if (/\bG80\b/.test(line)) open = false
    }
    expect(open).toBe(false)   // every cycle closed
  })

  it('emits repeat holes as bare position words', () => {
    const lines = g.split('\r\n')
    const i = lines.findIndex(l => l.startsWith('G98 G81 '))
    expect(i).toBeGreaterThan(-1)
    expect(lines[i + 1]).toMatch(/^X-?[\d.]+ Y-?[\d.]+ Z-?[\d.]+$/)
  })
})

describe('posted program — structure', () => {
  it('opens with % and closes with M30 then %', () => {
    const lines = post().split('\r\n').filter(l => l.length)
    expect(lines[0]).toBe('%')
    expect(lines[lines.length - 1]).toBe('%')
    expect(lines[lines.length - 2]).toBe('M30')
  })

  it('emits all drilling before any routing', () => {
    const g = post()
    // Anchor on the cycle OPEN, not on G80 — the footer template carries its
    // own trailing G80 after all routing.
    const lastDrill = g.lastIndexOf('G98 G81')
    const firstRoute = g.indexOf('T101')
    expect(lastDrill).toBeGreaterThan(-1)
    expect(firstRoute).toBeGreaterThan(-1)
    expect(lastDrill).toBeLessThan(firstRoute)
  })

  it('holds these properties with modal compaction off too', () => {
    const g = post({ modal_output: false })
    expect(g).not.toMatch(/[^\r]\n/)
    expect([...g].every(ch => ch.charCodeAt(0) <= 127)).toBe(true)
  })
})

// The point of the whole exercise: what this post-processor emits must clear
// the gate this post-processor enforces. If these ever fail, the emitter has
// regressed — the validator is calibrated against files the machine has run.
describe('posted program — passes its own validator', () => {
  it('reports zero errors with modal output on', () => {
    expect(errorsOf(validateGcode(post())).map(formatFinding)).toEqual([])
  })

  it('reports zero errors with modal output off', () => {
    expect(errorsOf(validateGcode(post({ modal_output: false }))).map(formatFinding)).toEqual([])
  })

  it('reports zero errors without a drill block (generic drilling path)', () => {
    const g = generateSheetGcode({
      sheet, thickness: 16.5, profile: anderson, drills,
      toolNumber: 101, toolDiameter: 10, maxDepthPerPass: 8,
      jobNumber: 'RHK6539', materialName: 'Whiteboard 16.5mm', programNumber: 'O6539',
    })
    expect(errorsOf(validateGcode(g)).map(formatFinding)).toEqual([])
  })

  it('reports zero errors with no drilling at all', () => {
    const g = generateSheetGcode({
      sheet, thickness: 16.5, profile: anderson, drills: [],
      toolNumber: 101, toolDiameter: 10, maxDepthPerPass: 8,
      jobNumber: 'RHK6539', materialName: 'Whiteboard 16.5mm', programNumber: 'O6539',
      drillBlock: block,
    })
    expect(errorsOf(validateGcode(g)).map(formatFinding)).toEqual([])
  })

  it('survives a hostile part label without breaking the program', () => {
    const nasty = {
      ...sheet,
      placements: [{ ...sheet.placements[0], label: 'Gable )G0 X0 Y0( — 5..' }],
    }
    const g = generateSheetGcode({
      sheet: nasty, thickness: 16.5, profile: anderson, drills,
      toolNumber: 101, toolDiameter: 10, maxDepthPerPass: 8,
      jobNumber: 'RHK6539', materialName: 'Whiteboard 16.5mm', programNumber: 'O6539',
      drillBlock: block,
    })
    expect(errorsOf(validateGcode(g)).map(formatFinding)).toEqual([])
  })

  it('no longer applies the routing feed to the drill cycle (D5)', () => {
    // Was F11200 on the cycle — the routing tool's 28000 scaled by
    // plunge_feed_pct 40%. The ROUTING section still uses a router-derived
    // plunge feed, which is correct, so this is scoped to the cycle lines.
    const g = post()
    const cycles = g.split('\r\n').filter(l => l.startsWith('G98 G81'))
    expect(cycles.length).toBeGreaterThan(0)
    expect(cycles.every(l => l.includes('F3000.'))).toBe(true)
    expect(warningsOf(validateGcode(g)).filter(f => f.check === 'V9')).toEqual([])
  })
})
