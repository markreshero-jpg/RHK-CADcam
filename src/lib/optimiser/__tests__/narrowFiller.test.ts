import { describe, it, expect } from 'vitest'
import { widenNarrowFiller } from '../normalize'
import type { OptiPart } from '../types'

const part = (w: number, h: number, eb = 0, extra: Partial<OptiPart> = {}) =>
  ({ w, h, thickness: 18, eb_w1: eb, eb_w2: eb, eb_h1: eb, eb_h2: 0, comment: null, ...extra }) as unknown as OptiPart

describe('narrow fillers cut at 70 (Mark 2026-11-06)', () => {
  it('a 18 filler with both long edges taped: machine cuts 70, comment gives the hand cut', () => {
    const p = part(18, 770, 1)
    widenNarrowFiller(p, 'Filler')
    expect(p.w - p.eb_w1 - p.eb_w2).toBe(70)
    expect(p.h).toBe(770)
    expect(p.comment).toBe('CUT AT 70, hand cut to 16 wide (18 after edging)')
  })
  it('untaped, a typed comment is kept after the note', () => {
    const p = part(35, 700, 0, { comment: 'scribe to wall' })
    widenNarrowFiller(p, 'Filler')
    expect(p.w).toBe(70)
    expect(p.comment).toBe('CUT AT 70, hand cut to 35 wide. scribe to wall')
  })
  it('the narrow side may be h', () => {
    const p = part(900, 40)
    widenNarrowFiller(p, 'Top filler')
    expect(p.h).toBe(70)
  })
  it('leaves 60+ wide fillers, non-fillers and shaped fillers alone', () => {
    for (const [p, n] of [[part(60, 700), 'Filler'], [part(18, 700), 'Applied Panel'], [part(18, 700, 0, { shape: {} as never }), 'Filler']] as const) {
      const w = p.w; widenNarrowFiller(p, n); expect(p.w).toBe(w); expect(p.comment).toBeNull()
    }
  })
})
