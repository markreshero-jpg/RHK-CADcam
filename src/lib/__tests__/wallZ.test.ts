import { describe, it, expect } from 'vitest'
import { cabBottomZ, cabsBlock, wallZOf } from '../geometry'
import type { CabinetInstance, Room } from '../types'

// Rule WALLZ: a wall unit standing at its own height instead of hanging from the
// wall-cabinet-top line (RHK6595: bi-fold cupboard on the 950 bench, a 390 cabinet over it).
const room = { wall_cabinet_top: 2340 } as unknown as Room
const wc = (dy: number, rule_overrides: Record<string, unknown> = {}) =>
  ({ assembly_class: 'wall', dy, pos_z: 0, rule_overrides }) as unknown as CabinetInstance

describe('wall unit own height (WALLZ)', () => {
  it('hangs from the top line by default', () => {
    expect(cabBottomZ(wc(1000), room)).toBe(1340)
    expect(wallZOf(wc(1000))).toBeNull()
  })
  it('sits at WALLZ when set', () => {
    expect(cabBottomZ(wc(1000, { WALLZ: 950 }), room)).toBe(950)
  })
  it('the cupboard on the bench and the cabinet over it no longer clash', () => {
    const over = wc(390)                         // 1950 – 2340
    expect(cabsBlock(wc(1000), over, null, room)).toBe(true)                 // both hanging: overlap
    expect(cabsBlock(wc(1000, { WALLZ: 950 }), over, null, room)).toBe(false) // 950 – 1950: touching only
  })
  it('only a number counts', () => {
    expect(wallZOf(wc(1000, { WALLZ: '950' }))).toBeNull()
  })
})

// Base / tall units clash at their real elevation (RHK6563 Laundry BC-10, 1676
// tall at 117, standing on plinth pieces BC-08 0–100.5 and BC-09 100.5–117).
describe('base units at their elevation', () => {
  const base = (dy: number, pos_z: number) => ({ assembly_class: 'base', dy, pos_z, rule_overrides: {} }) as unknown as CabinetInstance
  it('a cabinet on the plinth does not clash with the plinth', () => {
    expect(cabsBlock(base(1676, 117), base(100.5, 0), null, room)).toBe(false)
    expect(cabsBlock(base(1676, 117), base(16.5, 100.5), null, room)).toBe(false)
  })
  it('two floor cabinets still clash', () => {
    expect(cabsBlock(base(763, 117), base(763, 117), null, room)).toBe(true)
    expect(cabsBlock(base(763, 0), base(100.5, 0), null, room)).toBe(true)
  })
})
