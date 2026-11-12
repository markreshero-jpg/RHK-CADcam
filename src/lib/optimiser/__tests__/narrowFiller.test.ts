import { describe, it, expect } from 'vitest'
import { widenSmallPart } from '../normalize'
import type { OptiPart } from '../types'

const part = (w: number, h: number, eb = 0, extra: Partial<OptiPart> = {}) =>
  ({ w, h, thickness: 18, eb_w1: eb, eb_w2: eb, eb_h1: eb, eb_h2: 0, comment: null, output_to_cnc: true, ...extra }) as unknown as OptiPart

describe('small parts cut at 70 (Mark 2026-11-06 fillers, 2026-11-12 all parts)', () => {
  it('a 18 filler with both long edges taped: machine cuts 70, comment gives the hand cut', () => {
    const p = part(18, 770, 1)
    widenSmallPart(p)
    expect(p.w - p.eb_w1 - p.eb_w2).toBe(70)
    expect(p.h).toBe(770)
    expect(p.comment).toBe('CUT AT 70, hand cut to 16 wide (18 after edging)')
  })
  it('untaped, a typed comment is kept after the note', () => {
    const p = part(35, 700, 0, { comment: 'scribe to wall' })
    widenSmallPart(p)
    expect(p.w).toBe(70)
    expect(p.comment).toBe('CUT AT 70, hand cut to 35 wide. scribe to wall')
  })
  it('the narrow side may be h', () => {
    const p = part(900, 40)
    widenSmallPart(p)
    expect(p.h).toBe(70)
    expect(p.comment).toBe('CUT AT 70, hand cut to 40 wide')
  })
  it('any part, not just fillers', () => {
    const p = part(50, 300)
    widenSmallPart(p)
    expect(p.w).toBe(70)
  })
  it('both sides small: cut 70 x 70, long x wide in the note', () => {
    const p = part(30, 45)
    widenSmallPart(p)
    expect([p.w, p.h]).toEqual([70, 70])
    expect(p.comment).toBe('CUT AT 70 x 70, hand cut to 45 long x 30 wide')
  })
  it('leaves 60+ parts, shaped parts, rail strips and no-CNC parts alone', () => {
    for (const p of [part(60, 700), part(18, 700, 0, { shape: {} as never }), part(18, 700, 0, { cut_holes: [[]] }),
      part(18, 700, 0, { rail_strip: {} as never }), part(18, 700, 0, { output_to_cnc: false })]) {
      const w = p.w; widenSmallPart(p); expect(p.w).toBe(w); expect(p.comment).toBeNull()
    }
  })
})
