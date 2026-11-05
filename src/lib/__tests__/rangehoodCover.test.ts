import { describe, it, expect } from 'vitest'
import { rangehoodCover } from '../resolver/resolveRangehood'
import { normaliseRangehood, DEFAULT_RANGEHOOD_COVER } from '../rangehood'
import { linkedHoleCutout } from '../rangehoodLink'
import type { CabinetInput, ResolvedCasePart, ResolvedHingeInstance, ResolvedInternalPart } from '../resolver/types'

// z_rangehood R9: hood cover panel behind the doors, D notches at the hinges.
const T = 16.5
const gable = (key: 'left_side' | 'right_side', X: number): ResolvedCasePart => ({
  part_key: key, DX: 380, DY: 677, DZ: T, X, Y: 18, Z: 0, AX: 0, AY: 0, AZ: 0, material_id: 'm',
  edge_band: { top: false, bottom: false, left: false, right: false },
})
const parts = [gable('left_side', 0), gable('right_side', 600 - T)]
const cab = (cover: unknown) => ({
  DX: 600, material: { id: 'm', DZ: T }, interior_edgeband_id: 'eb',
  rangehood: normaliseRangehood({ hole: { w: 500, d: 347 }, cover }),
}) as unknown as CabinetInput
const hinge = (side: 'left_side' | 'right_side', y: number) => ({
  mount_target: { table: 'case_parts', part_key: side }, plate_drills: [{ x: 0, y: y - 16, z: 0 }, { x: 0, y: y + 16, z: 0 }], cup_drills: [],
}) as unknown as ResolvedHingeInstance

const shelfAt = (Y: number) => ({ part_type: 'fixed_shelf', sort_order: 0, Y, X: T, Z: 0, DX: 363.5, DY: 567, DZ: T }) as unknown as ResolvedInternalPart

describe('rangehood cover (R9)', () => {
  it('follows the shelf height; no shelf → shelf_h from the underside', () => {
    expect(rangehoodCover(cab({}), parts, [], [shelfAt(350)]).part!.DX).toBe(332)
    expect(rangehoodCover(cab({}), parts, []).part!.DX).toBe(350 - 18)   // DEFAULT shelf_h 350
  })

  it('normalises the cover + panel skin', () => {
    const s = normaliseRangehood({ cover: { h: 260 }, panel_skin: 0.3 })!   // a stored h (rev 20) is ignored
    expect(s.cover).toEqual(DEFAULT_RANGEHOOD_COVER)
    expect(s.panel_skin).toBe(0.3)
    expect(normaliseRangehood({})!.cover).toBeNull()
  })

  it('stands between the gables, flush with their front, from the inside bottom up to the shelf', () => {
    const { part, warnings } = rangehoodCover(cab({}), parts, [], [shelfAt(278)])
    expect(warnings).toEqual([])
    expect(part).toMatchObject({ part_key: 'rh:cover', DX: 260, DY: 600 - 2 * T, DZ: T, X: T, Y: 18, Z: 380 - T })
    expect(part!.outline).toBeUndefined()   // no hinge on it → a plain rectangle
  })

  it('D notches each hinge on it, centred on the plate, and skips hinges above it', () => {
    const { part } = rangehoodCover(cab({}), parts, [hinge('left_side', 218), hinge('right_side', 218), hinge('right_side', 600)], [shelfAt(278)])
    const o = part!.outline!
    // Face frame: y down from the top (Y 278) → hinge at 218 = 60 down; notch 20–100, 40 deep, two r15 arcs per notch.
    const right = o.filter(p => p.x > 500), left = o.filter(p => p.x < 100)
    expect(Math.min(...right.map(p => p.x))).toBeCloseTo(600 - 2 * T - 40)
    expect(Math.max(...left.map(p => p.x))).toBeCloseTo(40)
    expect(o.filter(p => p.b != null && p.b < 0)).toHaveLength(4)
    const ys = o.filter(p => Math.abs(p.x - 40) < 0.01).map(p => p.y)
    expect(Math.min(...ys)).toBeCloseTo(20 + 15)
    expect(Math.max(...ys)).toBeCloseTo(100 - 15)
  })

  it('warns when a hinge notch would run off the cover', () => {
    const { part, warnings } = rangehoodCover(cab({}), parts, [hinge('left_side', 40)], [shelfAt(278)])
    expect(part!.outline).toBeUndefined()
    expect(warnings[0].message).toMatch(/too near the cover's bottom/)
  })

  it('leaves the onion skin in the under panel hole', () => {
    const rh = normaliseRangehood({ hole: { w: 500, d: 347 }, panel_skin: 0.3 })!
    const c = linkedHoleCutout('x', { x0: 50, x1: 550, z0: 16.5, z1: 363.5 }, rh, { x: 0, z: 0, dx: 380, dy: 600, dz: 18 })
    expect(c.depth).toBeCloseTo(17.7)
    expect(linkedHoleCutout('x', { x0: 50, x1: 550, z0: 16.5, z1: 363.5 }, { ...rh, panel_skin: 0 }, { x: 0, z: 0, dx: 380, dy: 600, dz: 18 }).depth).toBeNull()
  })
})
