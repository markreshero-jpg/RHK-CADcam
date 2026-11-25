import { describe, it, expect } from 'vitest'
import { packViews } from '../shopDrawings/sheetPack'

// z_shop_drawings S4: plan + elevations on one sheet when they fit.
describe('packViews', () => {
  const GAP = 8, HEAD = 5

  it('puts a small room on one row, centred', () => {
    const p = packViews([{ key: 'plan', w: 100, h: 60 }, { key: 'w1', w: 120, h: 90 }], 400, 230, GAP, HEAD)!
    expect(p.plan.x).toBeCloseTo((400 - 228) / 2)
    expect(p.w1.x).toBeCloseTo(p.plan.x + 108)
    expect(p.plan.y).toBeCloseTo((230 - 95) / 2)
    expect(p.w1.y).toBeCloseTo(p.plan.y)
  })

  it('wraps to a second row', () => {
    const p = packViews([{ key: 'plan', w: 250, h: 80 }, { key: 'w1', w: 180, h: 90 }, { key: 'w2', w: 180, h: 90 }], 400, 230, GAP, HEAD)!
    expect(p.w1.y).toBeGreaterThan(p.plan.y)
    expect(p.w2.y).toBeCloseTo(p.w1.y)
    // rows: 85 + 8 + 95 = 188
    expect(p.plan.y).toBeCloseTo((230 - 188) / 2)
  })

  it('gives up when the rows are too tall, or a view is too wide', () => {
    expect(packViews([{ key: 'plan', w: 250, h: 120 }, { key: 'w1', w: 250, h: 120 }], 400, 230, GAP, HEAD)).toBeNull()
    expect(packViews([{ key: 'plan', w: 420, h: 50 }, { key: 'w1', w: 50, h: 50 }], 400, 230, GAP, HEAD)).toBeNull()
  })
})
