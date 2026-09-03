// ============================================================
// M2 — comment emission and output encoding (defects D1, D2, D3).
//
// Both defects grounded the program at load time, so these are correctness
// tests, not cosmetics. The gold reference is the calibration: whatever it
// contains, the controller demonstrably accepts.
// ============================================================

import { describe, it, expect } from 'vitest'
import { sanitiseComment, toAscii, DEFAULT_MAX_COMMENT } from '../gcode'
import { fixture, fixtureBytes, GOLD, BROKEN } from './fixtures'

const EM_DASH = '—'

describe('sanitiseComment — bracket stripping (D3)', () => {
  it('removes the stray closing bracket that alarmed the controller', () => {
    const out = sanitiseComment(`Drilling ${EM_DASH} 3 gang group(s) over 1 band(s) of 400.mm`)
    expect(out).toBe('(Drilling - 3 gang groups over 1 bands of 400.mm)')
    // Exactly one open and one close, at the ends.
    expect(out.match(/\(/g)).toHaveLength(1)
    expect(out.match(/\)/g)).toHaveLength(1)
    expect(out.startsWith('(')).toBe(true)
    expect(out.endsWith(')')).toBe(true)
  })

  it('drops brackets rather than replacing them, keeping the plural idiom readable', () => {
    expect(sanitiseComment('3 hole(s)')).toBe('(3 holes)')
  })

  it('strips a leading bracket too, even though the machine tolerates it', () => {
    // Gold ships "(JOB NUMBER (1491.5)" and runs — only a stray ')' is fatal.
    // We strip both so no comment can ever depend on that tolerance.
    expect(sanitiseComment('JOB NUMBER (1491.5')).toBe('(JOB NUMBER 1491.5)')
  })

  it('survives a hostile part label without escaping the comment', () => {
    const out = sanitiseComment('Part )G0 X0 Y0 M30 (')
    expect(out.match(/\)/g)).toHaveLength(1)
    expect(out).toBe('(Part G0 X0 Y0 M30)')
  })
})

describe('sanitiseComment — ASCII transliteration (D2)', () => {
  it('maps the em-dash that shipped in the failing file', () => {
    expect(sanitiseComment(`Roughing pass ${EM_DASH} leave onion skin`))
      .toBe('(Roughing pass - leave onion skin)')
  })

  it('maps the rest of the smart-punctuation family', () => {
    expect(sanitiseComment('a–b ‘c’ “d” e… f g'))
      .toBe(`(a-b 'c' "d" e... f g)`)
  })

  it('transliterates symbols a CAM comment plausibly carries', () => {
    expect(sanitiseComment('Ø 18° ± 0.1 2× ½'))
      .toBe('(DIA 18deg +/- 0.1 2x 1/2)')
  })

  it('drops anything with no ASCII equivalent instead of emitting bytes > 127', () => {
    const out = sanitiseComment('Part 你好 label 😀')
    expect(out).toBe('(Part label)')
    expect([...out].every(ch => ch.charCodeAt(0) <= 127)).toBe(true)
  })

  it('collapses newlines and tabs to single spaces', () => {
    expect(sanitiseComment('line one\r\nline\ttwo')).toBe('(line one line two)')
  })
})

describe('sanitiseComment — length', () => {
  it('accepts the gold reference\'s longest comment uncut', () => {
    // 78 characters of content — proof the controller limit is at least that,
    // and that the MD\'s suggested 60 would have truncated a legitimate comment.
    const longest = '$15 cancel offsets at $210 and $20 for set offsets of routers and drill blocks'
    expect(longest.length).toBe(78)
    expect(sanitiseComment(longest)).toBe(`(${longest})`)
  })

  it('truncates beyond the configured limit', () => {
    expect(sanitiseComment('x'.repeat(200)).length).toBe(DEFAULT_MAX_COMMENT + 2)
    expect(sanitiseComment('x'.repeat(200), 10)).toBe(`(${'x'.repeat(10)})`)
  })

  it('falls back to the default when given a nonsense limit', () => {
    expect(sanitiseComment('x'.repeat(200), 0).length).toBe(DEFAULT_MAX_COMMENT + 2)
  })

  it('never leaves trailing whitespace inside the brackets', () => {
    expect(sanitiseComment('word ' + 'y'.repeat(200), 5)).toBe('(word)')
  })
})

describe('toAscii — whole-program fold (D1/D2)', () => {
  it('preserves CRLF line terminators', () => {
    expect(toAscii('A\r\nB\r\n')).toBe('A\r\nB\r\n')
  })

  it('preserves tabs — the gold reference contains one and runs', () => {
    // Never drop it (that would join two words into "G0X10") and never rewrite
    // it: the controller accepts tabs, so normalising them is gratuitous.
    expect(toAscii('G0\tX10')).toBe('G0\tX10')
  })

  it('cleans template text this module did not author', () => {
    // header_template / footer_template come from the machine profile row and
    // are emitted verbatim, so they need the same fold.
    expect(toAscii(`(MATERIAL: Lx White HMR 16.5${EM_DASH})\r\n`)).toBe('(MATERIAL: Lx White HMR 16.5-)\r\n')
  })

  it('leaves the gold reference completely untouched', () => {
    const gold = fixture(GOLD)
    expect(toAscii(gold)).toBe(gold)
  })

  it('would have cleaned every non-ASCII byte out of the failing program', () => {
    expect(fixtureBytes(BROKEN).some(b => b > 127)).toBe(true)
    const folded = toAscii(fixtureBytes(BROKEN).toString('utf8'))
    expect([...folded].every(ch => ch.charCodeAt(0) <= 127)).toBe(true)
    expect(folded).toContain('(Drilling - 3 gang group(s)')
  })
})
