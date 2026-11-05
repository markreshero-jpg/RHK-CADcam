import { describe, it, expect } from 'vitest'
import { nest, type NestPartInput, type NestResult, type SheetStock } from '../nest'

// MaxRects packer (Flaxton kitchen, 2026-11-06): holes under/between parts
// stay usable, and the squeeze pass empties the last sheet when it can.

const stock: SheetStock = { w: 2415, h: 1211, trimLeft: 5, trimRight: 5, trimTop: 5, trimBottom: 5, isOffcut: false, label: null }
const GAP = 13
const part = (uid: string, w: number, h: number, extra: Partial<NestPartInput> = {}): NestPartInput =>
  ({ uid, baseUid: uid, label: uid, w, h, thickness: 16.5, materialId: 'wb', grainLock: false, priority: 0, ...extra })
const run = (parts: NestPartInput[], quality: 'fast' | 'balanced' | 'best' = 'balanced', allowRotation = true) =>
  nest(parts, { 'wb__16.5': { standard: stock, offcuts: [] } }, { marginByMaterial: { wb: GAP }, defaultMargin: GAP, quality, allowRotation })

// Every part once, inside the trim, at least GAP apart.
function expectValid(r: NestResult, parts: NestPartInput[]) {
  const seen = r.sheets.flatMap(s => s.placements.map(p => p.uid)).concat(r.unplaced.map(p => p.uid))
  expect([...seen].sort()).toEqual(parts.map(p => p.uid).sort())
  for (const s of r.sheets) {
    const { w, h, trimLeft, trimRight, trimTop, trimBottom } = s.stock
    for (const p of s.placements) {
      expect(p.x).toBeGreaterThanOrEqual(trimLeft - 1e-6)
      expect(p.y).toBeGreaterThanOrEqual(trimBottom - 1e-6)
      expect(p.x + p.w).toBeLessThanOrEqual(w - trimRight + 1e-6)
      expect(p.y + p.h).toBeLessThanOrEqual(h - trimTop + 1e-6)
      const src = parts.find(q => q.uid === p.uid)!
      expect(p.rotated ? [p.h, p.w] : [p.w, p.h]).toEqual([src.w, src.h])
    }
    for (let i = 0; i < s.placements.length; i++) for (let j = i + 1; j < s.placements.length; j++) {
      const a = s.placements[i], b = s.placements[j]
      const apart = a.x + a.w + GAP <= b.x + 1e-6 || b.x + b.w + GAP <= a.x + 1e-6
        || a.y + a.h + GAP <= b.y + 1e-6 || b.y + b.h + GAP <= a.y + 1e-6
      expect(apart, `${a.uid} / ${b.uid} on sheet ${s.index}`).toBe(true)
    }
  }
}

function randomParts(n: number, seed: number): NestPartInput[] {
  let a = seed
  const r = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648 }
  return Array.from({ length: n }, (_, i) => {
    const big = r() < 0.3
    return part(`p${i}`, Math.round(big ? 500 + r() * 1800 : 60 + r() * 600), Math.round(big ? 300 + r() * 600 : 60 + r() * 500))
  })
}

describe('nest packing (MaxRects)', () => {
  for (const q of ['fast', 'balanced', 'best'] as const) {
    it(`${q}: random job stays valid`, () => {
      const parts = randomParts(120, 7)
      expectValid(run(parts, q), parts)
    })
  }

  it('a small part drops into the pocket beside a tall one instead of opening a sheet', () => {
    // Sheet 1: a 2405 × 600 band and a 1200 × 588 piece leave a 1192 × 588
    // pocket on the right. A skyline packer filled it only by luck of order;
    // MaxRects keeps it as a free rect.
    const parts = [part('band', 2405, 600), part('half', 1200, 588), part('small', 1000, 500)]
    const r = run(parts, 'fast', false)
    expectValid(r, parts)
    expect(r.sheets).toHaveLength(1)
  })

  it('the squeeze empties a near-empty last sheet into the others', () => {
    // 3 sheets' worth of near-full-width strips + a few offcut-sized bits.
    const parts = [
      ...Array.from({ length: 6 }, (_, i) => part(`s${i}`, 2405, 560)),
      part('b1', 300, 30), part('b2', 400, 25), part('b3', 200, 40),
    ]
    const r = run(parts, 'balanced', false)
    expectValid(r, parts)
    expect(r.sheets).toHaveLength(3)
  })

  it('grain-locked parts keep their orientation', () => {
    const parts = Array.from({ length: 20 }, (_, i) => part(`g${i}`, 450, 720, { grainLock: true }))
    const r = run(parts, 'best')
    expectValid(r, parts)
    for (const s of r.sheets) for (const p of s.placements) expect(p).toMatchObject({ w: 720, h: 450, rotated: true })
  })

  it('higher priority parts land on the first sheet', () => {
    const parts = [...randomParts(60, 3), part('pri', 900, 400, { priority: 5 })]
    const r = run(parts, 'best')
    expectValid(r, parts)
    expect(r.sheets[0].placements.some(p => p.uid === 'pri')).toBe(true)
  })

  it('the leftover (emptiest) sheet comes last', () => {
    const r = run(randomParts(120, 11), 'balanced')
    const eff = r.sheets.map(s => s.efficiency)
    expect(eff[eff.length - 1]).toBe(Math.min(...eff))
  })
})
