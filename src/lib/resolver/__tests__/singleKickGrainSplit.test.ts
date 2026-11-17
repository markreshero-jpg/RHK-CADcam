import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material } from '../types'

// A standalone (not joined) kick in a grained board with vertical grain (TOEGRAIN default)
// can't be longer than the sheet width: it splits into equal pieces <= 1200, like a joined
// run (Mark 2026-11-17, RHK6468 WIR Blonde Oak kick cabinets 2202 / 1909 / ... long).
const plain: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2415, sheet_dy: 1211, has_grain: false }
const grained: Material = { ...plain, id: 'g18', name: 'Oak 18', sheet_dx: 3100, has_grain: true }
const cab = (DX: number, face: Material, rules = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX, DY: 120, DZ: 530,
  has_carcass: false, has_internal: false, has_face: false, has_toekick: true,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: plain, door_material: face, shelf_material: plain, exposed_material: face,
  toekick_face_material: face, toekick_interior_material: plain,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, rules),
  face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
})
const faces = (c: CabinetInput) => resolveCabinet(c).toekick_parts.filter(p => p.part_key === 'kick_front_face')

describe('standalone kick face grain split', () => {
  it('2202 grained, vertical grain -> 2 x 1101 end to end', () => {
    const f = faces(cab(2202, grained))
    expect(f.map(p => p.DY)).toEqual([1101, 1101])
    expect(f[1].X - f[0].X).toBeCloseTo(1101, 6)
    expect(f.every(p => p.is_detached)).toBe(true)
  })
  it('1200 or under stays one piece', () => {
    expect(faces(cab(1200, grained)).length).toBe(1)
  })
  it('plain board or horizontal grain stays one piece', () => {
    expect(faces(cab(2202, plain)).length).toBe(1)
    expect(faces(cab(2202, grained, { TOEGRAIN: 'horizontal' })).length).toBe(1)
  })
})
