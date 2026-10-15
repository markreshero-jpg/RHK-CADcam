import { describe, it, expect } from 'vitest'
import { kickChain, kickHeightMarks, type KickSpan } from '../kickDims'

const span = (t0: number, t1: number, depth = 500): KickSpan => ({ t0, t1, depth, side: 'face' })

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
})
