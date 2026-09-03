// ============================================================
// M3 — post-export validator.
//
// The calibration test ("gold reference reports zero errors") is the important
// one: it stops the validator drifting away from what the controller actually
// tolerates. If it ever fails, fix the check, not the fixture.
// ============================================================

import { describe, it, expect } from 'vitest'
import { validateGcode, errorsOf, warningsOf, formatFinding } from '../gcodeValidate'
import { fixture, GOLD, BROKEN, FIXED } from './fixtures'

const codes = (program: string) =>
  [...new Set(errorsOf(validateGcode(program)).map(f => f.check))].sort()

describe('calibration — files the machine has actually run', () => {
  it('gold reference reports zero errors', () => {
    const errors = errorsOf(validateGcode(fixture(GOLD)))
    expect(errors.map(formatFinding)).toEqual([])
  })

  it('gold reference keeps its tolerated extra opening bracket', () => {
    // "(JOB NUMBER (1491.5)" — unbalanced, runs fine. A bracket-counting check
    // would reject it; V4 must not.
    expect(fixture(GOLD)).toContain('(JOB NUMBER (1491.5)')
    expect(errorsOf(validateGcode(fixture(GOLD))).filter(f => f.check === 'V4')).toEqual([])
  })

  it('hand-corrected file reports zero errors', () => {
    // Verified loading on the machine, so it is a second calibration point.
    expect(errorsOf(validateGcode(fixture(FIXED))).map(formatFinding)).toEqual([])
  })
})

describe('regression — the program that failed on the machine', () => {
  const findings = validateGcode(fixture(BROKEN))

  it('reports exactly V1, V2, V4 and V5', () => {
    expect(codes(fixture(BROKEN))).toEqual(['V1', 'V2', 'V4', 'V5'])
  })

  it('names the em-dash lines for V1', () => {
    const v1 = findings.filter(f => f.check === 'V1')
    expect(v1.length).toBe(3)
    expect(v1[0].text).toContain('Drilling')
  })

  it('catches the stray close bracket even though the line is bracket-balanced', () => {
    const line = '(Drilling - 3 gang group(s) over 1 band(s) of 400.mm, Anderson M88/M89)'
    expect((line.match(/\(/g) ?? []).length).toBe(3)
    expect((line.match(/\)/g) ?? []).length).toBe(3)   // balanced by count…
    expect(codes(`%\r\n${line}\r\nM30\r\n%\r\n`)).toContain('V4')   // …and still fatal
  })

  it('flags the G0 that cancelled the drill cycle', () => {
    const v5 = findings.filter(f => f.check === 'V5')
    expect(v5.length).toBeGreaterThan(0)
    expect(v5[0].text).toBe('G0 X12.25 Y-182. Z3.5')
  })

  it('warns about the router feed on the drill cycle', () => {
    const v9 = warningsOf(findings).filter(f => f.check === 'V9')
    expect(v9.length).toBeGreaterThan(0)
    expect(v9[0].text).toContain('F11200.')
  })
})

// ── Per-check units ─────────────────────────────────────────────────────────
const wrap = (...body: string[]) => ['%', 'O0001', ...body, 'M30', '%'].join('\r\n') + '\r\n'

describe('V1 — ASCII', () => {
  it('accepts a clean program', () => expect(codes(wrap('G0 X10.'))).toEqual([]))
  it('rejects a non-ASCII character', () => expect(codes(wrap('(Roughing — pass)'))).toEqual(['V1']))
})

describe('V2 — line endings', () => {
  it('rejects bare LF', () => {
    expect(codes('%\nO0001\nM30\n%\n')).toContain('V2')
  })
  it('rejects a bare CR', () => {
    expect(codes('%\r\nO0001\rG0 X1.\r\nM30\r\n%\r\n')).toContain('V2')
  })
})

describe('V3 — BOM', () => {
  it('rejects a leading byte-order mark', () => {
    expect(codes('﻿' + wrap('G0 X10.'))).toContain('V3')
  })
})

describe('V4 — comment delimiters', () => {
  it('accepts a normal comment', () => expect(codes(wrap('(DRILL TOOL: V 5MM)'))).toEqual([]))
  it('tolerates an extra opening bracket', () => expect(codes(wrap('(JOB NUMBER (1491.5)'))).toEqual([]))
  it('rejects a stray closing bracket', () => expect(codes(wrap('G0 X10.) Y20.'))).toEqual(['V4']))
  it('rejects an unterminated comment', () => expect(codes(wrap('(never closed'))).toEqual(['V4']))
})

describe('V5 / V6 — canned cycles', () => {
  it('accepts bare repeat positions', () => {
    expect(codes(wrap('G98 G81 Z-0.2 R36.5 F3000.', 'X617.75 Y-476. Z-0.2', 'G80'))).toEqual([])
  })
  it('rejects group-01 motion inside a cycle', () => {
    expect(codes(wrap('G98 G81 Z3.5 R20. F3000.', 'G0 X12.25 Y-182. Z3.5', 'G80'))).toEqual(['V5'])
  })
  it('rejects a cycle that is never cancelled', () => {
    expect(codes(wrap('G98 G81 Z3.5 R20. F3000.', 'X1. Y1. Z3.5'))).toEqual(['V6'])
  })
  it('does not mistake G04 or G08 for group-01 or a cycle', () => {
    expect(codes(wrap('G04X2.0', 'G08 P1'))).toEqual([])
  })
  it('ignores cycle-like text inside a comment', () => {
    expect(codes(wrap('(cancel with G80 when done)', 'G0 X1.'))).toEqual([])
  })
})

describe('V7 — malformed numbers', () => {
  it('rejects a double decimal point in a code word', () => {
    expect(codes(wrap('G0 X12..5 Y10.'))).toEqual(['V7'])
  })
  it('rejects a bare decimal point', () => {
    expect(codes(wrap('G0 X. Y10.'))).toEqual(['V7'])
  })
  it('accepts a trailing decimal point, which the dialect requires', () => {
    expect(codes(wrap('G0 X360. Y-339.'))).toEqual([])
  })
  it('ignores the cosmetic "5.." inside a comment', () => {
    expect(codes(wrap('(DIAMETER: 5..)'))).toEqual([])
  })
})

describe('V8 — program wrapper', () => {
  it('accepts a %-wrapped program', () => expect(codes(wrap('G0 X1.'))).toEqual([]))
  it('accepts an unwrapped program that ends with M30', () => {
    expect(codes('G21 G90 G17\r\nG0 X1.\r\nM30\r\n')).toEqual([])
  })
  it('rejects an opened wrapper that is never closed', () => {
    expect(codes('%\r\nG0 X1.\r\nM30\r\n')).toContain('V8')
  })
  it('rejects a program with no end code', () => {
    expect(codes('G21 G90 G17\r\nG0 X1.\r\n')).toContain('V8')
  })
  it('rejects an empty program', () => expect(codes('')).toContain('V8'))
})

describe('V9 / V10 — warnings do not block export', () => {
  it('warns on a router feed applied to a drill cycle', () => {
    const f = validateGcode(wrap('G98 G81 Z3.5 R20. F11200.', 'G80'))
    expect(errorsOf(f)).toEqual([])
    expect(warningsOf(f).map(x => x.check)).toEqual(['V9'])
  })
  it('accepts the gold reference drill feed', () => {
    expect(warningsOf(validateGcode(wrap('G98 G81 Z-0.2 R36.5 F3000.', 'G80')))).toEqual([])
  })
  it('warns on an over-long comment', () => {
    const f = validateGcode(wrap(`(${'x'.repeat(120)})`))
    expect(errorsOf(f)).toEqual([])
    expect(warningsOf(f).map(x => x.check)).toEqual(['V10'])
  })
  it('accepts the gold reference\'s longest comment', () => {
    const longest = '$15 cancel offsets at $210 and $20 for set offsets of routers and drill blocks'
    expect(warningsOf(validateGcode(wrap(`(${longest})`)))).toEqual([])
  })
})
