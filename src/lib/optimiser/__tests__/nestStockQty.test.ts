import { describe, it, expect } from 'vitest'
import { nest, type GroupStock, type NestPartInput, type SheetStock } from '../nest'

// Stage 3 Qty: how many full sheets and how many of each offcut are on hand.
const full: SheetStock = { w: 2400, h: 1200, trimLeft: 0, trimRight: 0, trimTop: 0, trimBottom: 0, isOffcut: false, label: null }
const offcut: SheetStock = { ...full, w: 1000, h: 1000, isOffcut: true, label: 'Offcut 1' }
const part = (uid: string, w: number, h: number): NestPartInput =>
  ({ uid, baseUid: uid, label: uid, w, h, thickness: 16.5, materialId: 'wb', grainLock: false, priority: 0 })
const fullParts = (n: number) => Array.from({ length: n }, (_, i) => part(`p${i}`, 2400, 1200))
const run = (parts: NestPartInput[], stock: GroupStock) =>
  nest(parts, { 'wb__16.5': stock }, { marginByMaterial: {}, defaultMargin: 0, quality: 'fast', allowRotation: false })

describe('stock quantities', () => {
  it('no Qty: as many full sheets as it takes', () => {
    const r = run(fullParts(5), { standard: full, offcuts: [] })
    expect(r.sheets).toHaveLength(5)
    expect(r.unplaced).toHaveLength(0)
  })

  it('stops at the full sheet Qty and reports what is left', () => {
    const r = run(fullParts(5), { standard: { ...full, qty: 3 }, offcuts: [] })
    expect(r.sheets).toHaveLength(3)
    expect(r.unplaced).toHaveLength(2)
  })

  it('Qty 0 nests on offcuts only', () => {
    const r = run([part('a', 900, 900), part('b', 900, 900)], { standard: { ...full, qty: 0 }, offcuts: [offcut] })
    expect(r.sheets).toHaveLength(1)
    expect(r.sheets[0].stock.isOffcut).toBe(true)
    expect(r.unplaced).toHaveLength(1)
  })

  it('an offcut Qty gives that many offcuts, then full sheets', () => {
    const parts = [part('a', 900, 900), part('b', 900, 900), part('c', 900, 900)]
    const r = run(parts, { standard: full, offcuts: [{ ...offcut, qty: 2 }] })
    expect(r.unplaced).toHaveLength(0)
    expect(r.sheets.filter(s => s.stock.isOffcut)).toHaveLength(2)
    expect(r.sheets.filter(s => !s.stock.isOffcut)).toHaveLength(1)
  })

  it('an offcut with no Qty counts as one', () => {
    const r = run([part('a', 900, 900), part('b', 900, 900)], { standard: { ...full, qty: 0 }, offcuts: [offcut] })
    expect(r.sheets).toHaveLength(1)
  })
})
