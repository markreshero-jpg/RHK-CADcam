import { describe, it, expect } from 'vitest'
import { nest, type NestPartInput, type SheetStock } from '../nest'

// Grained boards: parts carry h = along the grain; a 2415 × 1211 sheet laid with
// its length (grain) along W must turn them, never cut them across the grain.
const sheet = (grainAlong?: 'w' | 'h'): SheetStock => ({
  w: 2415, h: 1211, trimTop: 10, trimBottom: 10, trimLeft: 10, trimRight: 10,
  isOffcut: false, label: null, ...(grainAlong ? { grainAlong } : {}),
})
const door = (grainLock: boolean): NestPartInput => ({
  uid: 'd#0', baseUid: 'd', label: 'Door', w: 518, h: 2300, thickness: 18,
  materialId: 'oak', grainLock, priority: 0,
})
const run = (part: NestPartInput, stock: SheetStock, allowRotation = false) =>
  nest([part], { 'oak__18': { standard: stock, offcuts: [] } }, { marginByMaterial: {}, defaultMargin: 12, quality: 'fast', allowRotation })

describe('nest grain', () => {
  it('turns a tall grained door to run with a W-grain sheet', () => {
    const r = run(door(true), sheet())
    expect(r.unplaced).toHaveLength(0)
    expect(r.sheets[0].placements[0]).toMatchObject({ w: 2300, h: 518, rotated: true })
  })
  it('keeps the grained door upright on an H-grain sheet (and it does not fit)', () => {
    const r = run(door(true), sheet('h'), true)
    expect(r.unplaced).toHaveLength(1)
  })
  it('allow-rotation never overrides the grain', () => {
    const r = run({ ...door(true), w: 300, h: 500 }, sheet(), true)
    expect(r.sheets[0].placements[0]).toMatchObject({ w: 500, h: 300, rotated: true })
  })
  it('un-grained parts still nest as-is first', () => {
    const r = run({ ...door(false), w: 300, h: 500 }, sheet(), true)
    expect(r.sheets[0].placements[0].rotated).toBe(false)
  })
  // Horizontal grain match fronts (z_grain_match G3): grain along w, so the
  // nest takes the other orientation — a wide drawer front runs along a W-grain sheet as-is.
  it('a grainAcross front keeps its width along a W-grain sheet', () => {
    const r = run({ ...door(true), w: 900, h: 300, grainAcross: true }, sheet(), true)
    expect(r.sheets[0].placements[0]).toMatchObject({ w: 900, h: 300, rotated: false })
  })
  it('a grainAcross front is turned on an H-grain sheet', () => {
    const r = run({ ...door(true), w: 900, h: 300, grainAcross: true }, sheet('h'), true)
    expect(r.sheets[0].placements[0]).toMatchObject({ w: 300, h: 900, rotated: true })
  })
})
