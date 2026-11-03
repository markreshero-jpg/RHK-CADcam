import { describe, it, expect } from 'vitest'
import { nest, type NestPartInput, type SheetStock } from '../nest'

// RHK6542 (Mark, 2026-11-03): 2400 kick faces on a 2415 × 1211 sheet with 5 trim
// were "too large" — the part gap was reserved against the far sheet edge too.
const stock: SheetStock = { w: 2415, h: 1211, trimLeft: 5, trimRight: 5, trimTop: 5, trimBottom: 5 } as SheetStock
const part = (uid: string, w: number, h: number): NestPartInput =>
  ({ uid, baseUid: uid, label: uid, w, h, thickness: 16.5, materialId: 'wb', grainLock: false, priority: 0 }) as NestPartInput
const run = (parts: NestPartInput[]) => nest(parts, { 'wb__16.5': { standard: stock, offcuts: [] } },
  { marginByMaterial: { wb: 16 }, defaultMargin: 16, quality: 'fast', allowRotation: true })

describe('nest: gap only between parts', () => {
  it('a 2400 part fits a 2405 usable sheet', () => {
    const r = run([part('k1', 2400, 80)])
    expect(r.unplaced).toHaveLength(0)
    const pl = r.sheets[0].placements[0]
    expect(Math.max(pl.x + pl.w, pl.y + pl.h)).toBeLessThanOrEqual(2410 + 1e-6)
  })
  it('a part right at the usable size fits; one over does not', () => {
    expect(run([part('a', 2405, 1201)]).unplaced).toHaveLength(0)
    expect(run([part('b', 2406, 100)]).unplaced).toHaveLength(1)
  })
  it('parts still keep the gap between each other and stay inside the trim', () => {
    const r = run([part('a', 2400, 80), part('b', 2400, 80), part('c', 2400, 80)])
    const ps = r.sheets.flatMap(s => s.placements).filter(p => r.sheets[0].placements.includes(p))
    for (const p of ps) { expect(p.x).toBeGreaterThanOrEqual(5 - 1e-6); expect(p.y).toBeGreaterThanOrEqual(5 - 1e-6); expect(p.y + p.h).toBeLessThanOrEqual(1206 + 1e-6) }
    const ys = ps.map(p => [p.y, p.y + p.h]).sort((a, b) => a[0] - b[0])
    for (let i = 1; i < ys.length; i++) expect(ys[i][0] - ys[i - 1][1]).toBeGreaterThanOrEqual(16 - 1e-6)
  })
})
