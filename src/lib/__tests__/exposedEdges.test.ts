import { describe, it, expect } from 'vitest'
import { rectEdgeSegs, coverOf } from '../exposedEdges'

// A 600 wide x 16 thick shelf with its top at y=400.
const shelf = { ex: 18, ey: 400, ew: 564, eh: 16 }

describe('rectEdgeSegs', () => {
  it('open cabinet: every edge is exposed', () => {
    const segs = rectEdgeSegs(shelf, [])
    expect(segs).toHaveLength(4)
    expect(segs.every(s => s.exposed)).toBe(true)
  })

  it('full door in front: every edge is hidden', () => {
    const door = coverOf({ ex: 1.5, ey: 718, ew: 597, eh: 718 })
    const segs = rectEdgeSegs(shelf, [door])
    expect(segs.every(s => !s.exposed)).toBe(true)
  })

  it('3 mm gap between a pair of doors stays hidden', () => {
    const l = coverOf({ ex: 1.5, ey: 718, ew: 297, eh: 718 })
    const r = coverOf({ ex: 301.5, ey: 718, ew: 297, eh: 718 })
    const segs = rectEdgeSegs(shelf, [l, r])
    expect(segs.every(s => !s.exposed)).toBe(true)
  })

  it('door on the lower half only: an upper shelf is open, a lower one hidden', () => {
    const door = coverOf({ ex: 0, ey: 300, ew: 600, eh: 300 })
    expect(rectEdgeSegs(shelf, [door]).every(s => s.exposed)).toBe(true)
    const low = { ...shelf, ey: 200 }
    expect(rectEdgeSegs(low, [door]).every(s => !s.exposed)).toBe(true)
  })

  it('gable beside a half-height door: split along its length', () => {
    const gable = { ex: 0, ey: 720, ew: 16, eh: 720 }
    const door = coverOf({ ex: 0, ey: 300, ew: 600, eh: 300 })
    const left = rectEdgeSegs(gable, [door]).filter(s => s.x1 === 0 && s.x2 === 0)
    expect(left).toEqual([
      { x1: 0, y1: 0, x2: 0, y2: 300, exposed: false },
      { x1: 0, y1: 300, x2: 0, y2: 720, exposed: true },
    ])
  })
})
