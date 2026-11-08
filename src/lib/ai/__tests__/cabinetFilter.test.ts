import { describe, it, expect } from 'vitest'
import { matchCabinets, patchFor, validateChanges, filterHasCriteria } from '../cabinetFilter'
import type { CabinetInstance, Wall } from '@/src/lib/types'

const wall = (id: string, name: string, angle = 0, x = 0, y = 0) =>
  ({ id, name, angle, pos_x: x, pos_y: y, length: 4000, sort_order: 0, wall_type: 'standard' }) as Wall
const cab = (o: Partial<CabinetInstance>) =>
  ({ id: o.label, label: 'X', assembly_class: 'base', wall_id: 'w1', pos_x: 0, pos_y: 0, pos_z: 0, dx: 600, dy: 720, dz: 580, cabinet_definition_id: 'd-b2', notes: null, ...o }) as CabinetInstance

const walls = [wall('w1', 'Wall 1'), wall('w2', 'Wall 2', 90, 4000, 0)]
const defNames = new Map([['d-b2', 'B2'], ['d-w2', 'W2']])
const cabs = [
  cab({ label: 'BC-01', pos_x: 0 }),
  cab({ label: 'BC-02', pos_x: 600, dx: 450 }),
  cab({ label: 'WC-01', assembly_class: 'wall', cabinet_definition_id: 'd-w2', pos_z: 1400, dy: 720 }),
  cab({ label: 'WC-02', assembly_class: 'wall_corner', cabinet_definition_id: 'd-w2', wall_id: 'w2', pos_x: 4000, pos_y: 300 }),
  cab({ label: 'K-01', is_kick_assembly: true, cabinet_definition_id: null }),
]
const ctx = { walls, defNames }
const labels = (xs: CabinetInstance[]) => xs.map(c => c.label)

describe('matchCabinets', () => {
  it('matches nothing without criteria', () => {
    expect(filterHasCriteria({})).toBe(false)
    expect(matchCabinets({}, cabs, ctx)).toEqual([])
  })
  it('class "wall" takes wall corners too', () => {
    expect(labels(matchCabinets({ classes: ['wall'] }, cabs, ctx))).toEqual(['WC-01', 'WC-02'])
  })
  it('filters by code, wall and numeric where', () => {
    expect(labels(matchCabinets({ codes: ['b2'] }, cabs, ctx))).toEqual(['BC-01', 'BC-02'])
    expect(labels(matchCabinets({ walls: ['wall 2'] }, cabs, ctx))).toEqual(['WC-02'])
    expect(labels(matchCabinets({ classes: ['base'], where: [{ field: 'dx', op: '<', value: 600 }] }, cabs, ctx))).toEqual(['BC-02'])
    expect(labels(matchCabinets({ walls: ['Wall 1'], where: [{ field: 'offset', op: '>=', value: 600 }] }, cabs, ctx))).toEqual(['BC-02'])
  })
  it('skips joined kicks unless named', () => {
    expect(labels(matchCabinets({ classes: ['base'] }, cabs, ctx))).not.toContain('K-01')
    expect(labels(matchCabinets({ labels: ['k-01'] }, cabs, ctx))).toEqual(['K-01'])
  })
})

describe('changes', () => {
  it('rejects unknown fields and bad sizes', () => {
    expect(validateChanges({ dy: 900 })).toEqual([])
    expect(validateChanges({ dy: -5 }).length).toBe(1)
    expect(validateChanges({ material: 'x' } as never).length).toBe(1)
  })
  it('patches only what changes', () => {
    expect(patchFor(cabs[0], { dy: 720 }, walls)).toBeNull()
    expect(patchFor(cabs[0], { dy: 900 }, walls)).toEqual({ dy: 900 })
  })
  it('scribes merge into rule_overrides; null clears back to inherited', () => {
    const c = cab({ label: 'BC-09', rule_overrides: { SCRL: 5, TOP_TYPE: 'front_rail' } })
    expect(patchFor(c, { scribes: { right: 20 } }, walls)).toEqual({ rule_overrides: { SCRL: 5, SCRR: 20, TOP_TYPE: 'front_rail' } })
    expect(patchFor(c, { scribes: { left: null } }, walls)).toEqual({ rule_overrides: { TOP_TYPE: 'front_rail' } })
    expect(patchFor(c, { scribes: { left: 5 } }, walls)).toBeNull()
    expect(validateChanges({ scribes: { side: 5 } as never }).length).toBe(1)
  })
  it('handle schedule sets or clears hardware_overrides', () => {
    const c = cab({ label: 'BC-10', hardware_overrides: { handle_offset: 30 } })
    expect(patchFor(c, { handle_schedule_id: 'hs-1' }, walls)).toEqual({ hardware_overrides: { handle_offset: 30, handle_schedule_id: 'hs-1' } })
    expect(patchFor(c, { handle_schedule_id: null }, walls)).toBeNull()
  })
  it('offset slides along the wall, keeping the distance off it', () => {
    // Wall 2 runs down from (4000,0); WC-02 sits 300 along it.
    const u = patchFor(cabs[3], { offset: 1000 }, walls)!
    expect(u.pos_x).toBeCloseTo(4000)
    expect(u.pos_y).toBeCloseTo(1000)
  })
})
