// ============================================================
// M4 — drill feed (D5), number formatting (D7), file extension (D8) and the
// retract plane (D9) — plus the depth-datum bug D9 was masking.
//
// Numbers are checked against the gold reference, which drills a 16.5mm panel:
//   G98 G81 Z-0.2 R36.5 F3000.   through hole  (16.7 deep)
//   G98 G81 Z4.5  R36.5 F3000.   12mm hole
//   G98 G81 Z4.   R36.5 F3000.   12.5mm hole
// R is always thickness + 20; Z is absolute with the table at 0.
// ============================================================

import { describe, it, expect } from 'vitest'
import { generateSheetGcode, gcodeFileName, DEFAULT_POST, type PostProfile, type SheetDrill } from '../gcode'
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

// Spoilboard zero, like the Anderson: Z0 is the table, material top is at 16.5.
const profile: PostProfile = {
  ...DEFAULT_POST,
  material_surface_z: 'spoilboard', keep_decimal_point: true, modal_output: true,
  origin_corner: 'top_left', base_feed_rate: 28000, plunge_feed_rate: 6000,
  sheet_load_pause: false, dust_extraction_enabled: false,
}

const gen = (drills: SheetDrill[], over: Partial<PostProfile> = {}) => generateSheetGcode({
  sheet, thickness: THICKNESS, profile: { ...profile, ...over }, drills,
  toolNumber: 101, toolDiameter: 10, drillBlock: block,
})

const cycles = (g: string) => g.split('\r\n').filter(l => l.startsWith('G98 G81'))

describe('D9 + depth datum — drill Z matches the gold reference', () => {
  it('puts the retract plane at thickness + clearance', () => {
    const g = gen([{ x: 100, y: 900, diameter: 5, depth: 12 }])
    expect(cycles(g)[0]).toContain('R36.5')   // 16.5 + 20, exactly as gold
  })

  it('measures hole depth from the material surface, not the retract plane', () => {
    // A 12mm hole in a 16.5mm panel plunges to Z4.5 — gold's own number.
    // The old form gave rapid - depth = 20 - 12 = Z8., a 8.5mm hole.
    const g = gen([{ x: 100, y: 900, diameter: 5, depth: 12 }])
    expect(cycles(g)[0]).toBe('G98 G81 Z4.5 R36.5 F3000.')
  })

  it('drills a through hole actually through', () => {
    // 16.7 deep = thickness + 0.2 overshoot -> Z-0.2, gold's through-hole value.
    // Previously Z3.5: it stopped 3.5mm short and never broke through.
    const g = gen([{ x: 100, y: 900, diameter: 5, depth: 16.7 }])
    expect(cycles(g)[0]).toBe('G98 G81 Z-0.2 R36.5 F3000.')
  })

  it('keeps the retract plane correct at a different thickness', () => {
    const g = generateSheetGcode({
      sheet: { ...sheet, thickness: 18 }, thickness: 18, profile, drillBlock: block,
      drills: [{ x: 100, y: 900, diameter: 5, depth: 12 }], toolNumber: 101,
    })
    expect(cycles(g)[0]).toBe('G98 G81 Z6. R38. F3000.')   // 18+20, 18-12
  })

  it('honours the absolute escape hatch for the old behaviour', () => {
    const g = gen([{ x: 100, y: 900, diameter: 5, depth: 12 }],
      { drill_retract_mode: 'absolute', drill_rapid_z: 20 })
    expect(cycles(g)[0]).toBe('G98 G81 Z8. R20. F3000.')
  })
})

describe('D5 — drill feed', () => {
  it('uses the machine drill feed, not the routing tool feed', () => {
    // base_feed_rate 28000 x plunge_feed_pct 40% = the F11200 that reached the
    // drill block. Scoped to the CYCLE line: the routing section legitimately
    // still uses a router-derived plunge feed.
    const g = gen([{ x: 100, y: 900, diameter: 5, depth: 12 }])
    expect(cycles(g)[0]).toContain('F3000.')
    expect(cycles(g).some(l => l.includes('F11200'))).toBe(false)
  })

  it('is unaffected by the routing tool feed changing', () => {
    const a = cycles(gen([{ x: 100, y: 900, diameter: 5, depth: 12 }], { base_feed_rate: 9000 }))[0]
    const b = cycles(gen([{ x: 100, y: 900, diameter: 5, depth: 12 }], { base_feed_rate: 28000 }))[0]
    expect(a).toBe(b)
  })

  it('applies to the generic single-spindle path too', () => {
    const g = generateSheetGcode({
      sheet, thickness: THICKNESS, profile, toolNumber: 101,
      drills: [{ x: 100, y: 900, diameter: 5, depth: 12 }],   // no drillBlock
    })
    // The plunge to depth is the drilling feed; only the routing section may
    // use a router-derived one.
    const plunge = g.split('\r\n').filter(l => /^G1 Z/.test(l))
    expect(plunge.length).toBeGreaterThan(0)
    expect(plunge.every(l => l.includes('F3000.'))).toBe(true)
  })
})

describe('D7 — number formatting', () => {
  const g = gen([{ x: 100, y: 900, diameter: 5, depth: 12 }])

  it('emits the diameter comment with a single decimal point', () => {
    expect(g).toContain('(DIAMETER: 5.)')
    expect(g).not.toContain('5..')
  })

  it('emits the tool comment with no decimal point, like the gold reference', () => {
    expect(g).toContain('(DRILL TOOL: V 5MM)')
    expect(g).not.toContain('V 5.MM')
  })

  it('keeps a fractional diameter readable', () => {
    // The bit has to actually be in the block, or no gang forms and no
    // DRILL TOOL comment is emitted at all.
    const h = generateSheetGcode({
      sheet, thickness: THICKNESS, profile, toolNumber: 101,
      drillBlock: { ...block, xDiameters: Array(12).fill(3.5) },
      drills: [{ x: 100, y: 900, diameter: 3.5, depth: 12 }],
    })
    expect(h).toContain('(DRILL TOOL: V 3.5MM)')
    expect(h).toContain('(DIAMETER: 3.5)')
  })

  it('never produces a double decimal point in any code word', () => {
    for (const line of g.split('\r\n')) {
      const code = line.replace(/\([^)]*\)/g, '')
      for (const tok of code.match(/[A-Za-z][-+]?[\d.]*/g) ?? []) {
        expect((tok.match(/\./g) ?? []).length).toBeLessThanOrEqual(1)
      }
    }
  })

  it('still keeps the trailing point on coordinates, which the dialect needs', () => {
    expect(g).toMatch(/X\d+\./)
  })
})

describe('D8 — file extension', () => {
  const base = { batch: false, jobNumber: 'RHK6539', dateStr: '20260902', materialCode: 'Whiteboard', sheetNumber: 1 }

  it('defaults to the machine convention, .anc', () => {
    expect(gcodeFileName(base)).toBe('RHK6539_Whiteboard_01.anc')
  })

  it('takes the extension from the profile', () => {
    expect(gcodeFileName({ ...base, ext: 'nc' })).toBe('RHK6539_Whiteboard_01.nc')
  })

  it('strips a leading dot rather than doubling it', () => {
    expect(gcodeFileName({ ...base, ext: '.anc' })).toBe('RHK6539_Whiteboard_01.anc')
  })

  it('falls back rather than emitting a name ending in a bare dot', () => {
    expect(gcodeFileName({ ...base, ext: '///' })).toBe('RHK6539_Whiteboard_01.nc')
  })

  it('is carried on batch names too', () => {
    expect(gcodeFileName({ ...base, batch: true })).toBe('BATCH_20260902_Whiteboard_01.anc')
  })
})
