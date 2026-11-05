import { describe, it, expect } from 'vitest'
import { kickChain, kickHeightMarks, kickRuns, type KickSpan } from '../kickDims'

const span = (t0: number, t1: number, depth = 500, top = 100): KickSpan => ({ t0, t1, depth, top, side: 'face' })

describe('kickChain', () => {
  it('measures kicks, the gaps between them and to the wall ends', () => {
    expect(kickChain([span(100, 700), span(1300, 2000)], 2400)).toEqual([
      { from: 0, to: 100, label: 100 },
      { from: 100, to: 700, label: 600 },
      { from: 700, to: 1300, label: 600 },
      { from: 1300, to: 2000, label: 700 },
      { from: 2000, to: 2400, label: 400 },
    ])
  })

  it('labels to 0.1 mm like the other dimension rows', () => {
    expect(kickChain([span(16.5, 1216.25)], 1800).map(s => s.label)).toEqual([16.5, 1199.8, 583.8])
  })

  it('keeps butting kicks as separate boards and merges overlaps', () => {
    expect(kickChain([span(0, 600), span(600, 1200)], 1200).map(s => s.label)).toEqual([600, 600])
    expect(kickChain([span(0, 700), span(600, 1200)], 1200).map(s => s.label)).toEqual([1200])
  })

  it('is empty with no kicks', () => {
    expect(kickChain([], 3000)).toEqual([])
  })
})

describe('kickHeightMarks', () => {
  it('one mark for a run of butting kicks at the same height', () => {
    expect(kickHeightMarks([
      { x0: 600, x1: 1200, top: 150 },
      { x0: 0, x1: 600, top: 150 },
    ])).toEqual([{ x: 0, top: 150 }])
  })

  it('a new mark where the height changes or after a gap', () => {
    expect(kickHeightMarks([
      { x0: 0, x1: 600, top: 150 },
      { x0: 600, x1: 1200, top: 120 },
      { x0: 1800, x1: 2400, top: 120 },
    ])).toEqual([{ x: 0, top: 150 }, { x: 600, top: 120 }, { x: 1800, top: 120 }])
  })

  it('an end panel gap (18) between kicks of one height keeps one mark', () => {
    expect(kickHeightMarks([
      { x0: 30, x1: 630, top: 100 },
      { x0: 648, x1: 1648, top: 100 },
    ])).toEqual([{ x: 30, top: 100 }])
  })
})

describe('kickRuns', () => {
  it('joins butting kicks of the same height + depth, splits on a change or a gap', () => {
    expect(kickRuns([span(0, 600), span(600, 1200), span(1200, 1800, 560), span(2000, 2600, 560)])).toEqual([
      { t0: 0, t1: 1200, top: 100, depth: 500 },
      { t0: 1200, t1: 1800, top: 100, depth: 560 },
      { t0: 2000, t1: 2600, top: 100, depth: 560 },
    ])
    expect(kickRuns([span(0, 600), span(600, 1200, 500, 150)]).map(r => r.top)).toEqual([100, 150])
  })
})
