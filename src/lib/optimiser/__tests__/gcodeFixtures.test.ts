// ============================================================
// M0 — the fixtures themselves are the test harness's ground truth, so guard
// them. If git (core.autocrlf=true) or an editor ever normalises these files,
// every encoding test downstream starts passing or failing for the wrong
// reason. .gitattributes marks the directory -text; this proves it held.
// ============================================================

import { describe, it, expect } from 'vitest'
import { fixture, fixtureBytes, GOLD, BROKEN, FIXED } from './fixtures'

const crCount = (s: string) => (s.match(/\r/g) ?? []).length
const lfCount = (s: string) => (s.match(/\n/g) ?? []).length

// UTF-8 encoding of an em-dash (U+2014). Compared as BYTES so this test cannot
// itself be broken by re-encoding the test file.
const EM_DASH_UTF8 = Buffer.from([0xe2, 0x80, 0x94])

describe('gcode fixtures are byte-exact', () => {
  it('gold reference is CRLF throughout', () => {
    const g = fixture(GOLD)
    expect(lfCount(g)).toBe(142)
    expect(crCount(g)).toBe(142)
    expect(g).not.toMatch(/[^\r]\n/)   // no bare LF
  })

  it('gold reference is pure 7-bit ASCII with no BOM', () => {
    const b = fixtureBytes(GOLD)
    expect(b.subarray(0, 3).toString('hex')).not.toBe('efbbbf')
    expect(b.every(byte => byte <= 127)).toBe(true)
  })

  it('hand-fixed file is CRLF throughout', () => {
    const f = fixture(FIXED)
    expect(crCount(f)).toBe(118)
    expect(f).not.toMatch(/[^\r]\n/)
  })

  it('broken file has kept its defects — LF-only and non-ASCII', () => {
    // These assertions must FAIL to hold if the fixture gets normalised.
    const b = fixture(BROKEN)
    expect(crCount(b)).toBe(0)
    expect(lfCount(b)).toBe(119)
    expect(fixtureBytes(BROKEN).some(byte => byte > 127)).toBe(true)
  })

  it('broken file still contains the exact defects the fix targets', () => {
    expect(fixtureBytes(BROKEN).includes(EM_DASH_UTF8)).toBe(true)
    const b = fixture(BROKEN)
    expect(b).toContain('group(s)')                  // unbalanced comment brackets
    expect(b).toContain('(DIAMETER: 5..)')           // double decimal point
    expect(b).toContain('G0 X12.25 Y-182. Z3.5')     // G0 inside the canned cycle
  })

  it('gold reference has none of those defects', () => {
    expect(fixtureBytes(GOLD).includes(EM_DASH_UTF8)).toBe(false)
    const g = fixture(GOLD)
    expect(g).not.toMatch(/\(DIAMETER: [\d.]*\.\.\)/)
    // Repeat holes inside the canned cycle carry position words only.
    expect(g).toContain('G98 G81 Z-0.2 R36.5 F3000.\r\nX617.75 Y-476. Z-0.2')
  })
})
