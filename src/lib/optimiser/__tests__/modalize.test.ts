// ============================================================
// M1 — modal compaction, canned-cycle safety (defect D4).
//
// The drill emitter was always correct: it writes bare `X Y Z` repeat holes,
// exactly like the PlanIt gold reference. modalize() was injecting the `G0`
// that cancelled the cycle on the machine, because a line with no G word was
// assumed to be G0 and the cycle-opening block had just wiped modal memory.
//
// Consequence on the machine: only the first hole of each gang group is
// drilled; every later line becomes a rapid to hole depth with a stationary
// drill block. A crash, not a wrong part. Hence the hard throws.
// ============================================================

import { describe, it, expect } from 'vitest'
import { modalize } from '../gcode'
import { fixture, GOLD, BROKEN } from './fixtures'

describe('modalize — canned cycles', () => {
  // Verbatim from the drill emitter (emitGangDrilling → emitFiring).
  const firing = [
    'M88 B16',
    'G90 G0 G54 G43 H1 X12.25 Y-412. Z20.',
    'G98 G81 Z3.5 R20. F11200.',
    'X12.25 Y-182. Z3.5',
    'X70.5 Y-453.75 Z3.5',
    'X276.17 Y-453.75 Z3.5',
    'G80',
  ]

  it('leaves repeat holes as bare position words', () => {
    expect(modalize(firing)).toEqual(firing)
  })

  it('never injects a motion word inside an open cycle (D4 regression)', () => {
    const out = modalize(firing).join('\n')
    expect(out).not.toContain('G0 X12.25 Y-182.')
    // The precise line that shipped to the machine.
    expect(out).not.toContain('G0 X12.25 Y-182. Z3.5')
  })

  it('resumes compaction after G80', () => {
    const out = modalize([...firing, 'G0 X10. Y10. Z20.', 'X20. Y10. Z20.'])
    expect(out.slice(-2)).toEqual(['G0 X10. Y10. Z20.', 'X20. Y10. Z20.'])
  })

  it('throws if the emitter ever puts group-01 motion inside a cycle', () => {
    expect(() => modalize([
      'G98 G81 Z3.5 R20. F3000.',
      'G0 X12.25 Y-182. Z3.5',
      'G80',
    ])).toThrow(/group-01 motion .* inside an open canned cycle/)
  })

  it('throws on a cycle that is never cancelled', () => {
    expect(() => modalize(['G98 G81 Z3.5 R20. F3000.', 'X1. Y1. Z3.5']))
      .toThrow(/never cancelled with G80/)
  })

  it('does not mistake G04 (dwell) or G80 for a group-01 or cycle code', () => {
    expect(modalize(['G04X2.0', 'G80', 'G08 P1'])).toEqual(['G04X2.0', 'G80', 'G08 P1'])
  })
})

describe('modalize — motion mode is inherited, never invented', () => {
  it('a bare axis line inherits the current modal G', () => {
    // G1 is modal; the following Z-only line is a FEED move, not a rapid.
    const out = modalize(['G1 X10. Y10. F3000.', 'Z-5.'])
    expect(out).toEqual(['G1 X10. Y10. F3000.', 'Z-5.'])
  })

  it('passes a line through untouched when the modal G is unknown', () => {
    // The G43 line resets modal memory; nothing may be inferred after it.
    const out = modalize(['G43 H11 Z36.5', 'X100. Y200.'])
    expect(out).toEqual(['G43 H11 Z36.5', 'X100. Y200.'])
  })

  it('still compacts an unchanged motion G on ordinary routing moves', () => {
    const out = modalize([
      'G1 X379. Y-339. Z1.3 F6000.',
      'G1 X758. Y-339. Z1.3 F28000.',
      'G1 X758. Y0. Z1.3 F28000.',
    ])
    expect(out).toEqual(['G1 X379. Y-339. Z1.3 F6000.', 'X758. F28000.', 'Y0.'])
  })

  it('restates every given axis on a rapid', () => {
    const out = modalize(['G0 X10. Y20. Z30.', 'G0 X10. Y20. Z40.'])
    expect(out).toEqual(['G0 X10. Y20. Z30.', 'X10. Y20. Z40.'])
  })
})

describe('modalize — calibrated against the gold reference', () => {
  // The strongest check available: PlanIt's known-good program is already
  // modally compacted. Ours must agree with it byte-for-byte, or our idea of
  // what the controller reads has drifted from what it demonstrably accepts.
  it('is a no-op on R980101N.anc', () => {
    const gold = fixture(GOLD).split('\r\n')
    expect(modalize(gold)).toEqual(gold)
  })

  // Before the fix this same input came back with a G0 injected on 7 lines of
  // the gold file — 3 repeat holes inside canned cycles, and (worse) two
  // cutting moves in the routing section promoted to rapids mid-cut:
  //   "X0. F28000."  ->  "G0 X0. F28000."
  // Both came from `const gm = g ?? '0'`, which guessed at the motion mode.
  it('does not promote a G-less continuation line to a rapid', () => {
    const out = modalize(['G1 X379. Y-339. Z1.3 F6000.', 'X0. F28000.'])
    expect(out[1]).toBe('X0. F28000.')
    expect(out[1]).not.toMatch(/^G0/)
  })

  it('rejects the exact program that failed on the machine', () => {
    // RHK6539_Whiteboard16_01.nc is what shipped; the guard must catch it.
    expect(() => modalize(fixture(BROKEN).split('\n')))
      .toThrow(/group-01 motion .* inside an open canned cycle/)
  })
})
