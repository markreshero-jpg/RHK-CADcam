import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material } from '../types'

const board: Material = { id: 'm16', name: 'Board 16', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }

// RHK6586 robe KICK 1: straight back, then the 45 wall; face scribes 10 into it,
// frame stays 16 off the wall.
const S2 = Math.SQRT2, X1 = 1857 + 10 * S2, D = 682, W = X1 + D
const footprint = { preset: null, params: {}, segments: [
  { type: 'line' as const, p0: { x: 0, y: 0 }, p1: { x: X1, y: 0 }, edge: { id: 'back', role: 'back' as const } },
  { type: 'line' as const, p0: { x: X1, y: 0 }, p1: { x: W, y: D }, edge: { id: 'angle', role: 'back' as const, kick_inset: 26 } },
  { type: 'line' as const, p0: { x: W, y: D }, p1: { x: 0, y: D }, edge: { id: 'front', role: 'front' as const } },
  { type: 'line' as const, p0: { x: 0, y: D }, p1: { x: 0, y: 0 }, edge: { id: 'left', role: 'side' as const } },
] }

const kick = (faceMax: number | null, sub: number[]) => resolveCabinet({
  id: 'k', assembly_class: 'base', DX: W, DY: 100, DZ: D,
  has_carcass: false, has_internal: false, has_face: false, has_toekick: true,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: { ...board, has_grain: !!faceMax, sheet_dy: faceMax ?? 1200, sheet_dx: 2400 },
  toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
  face_grid: { rows: [], cols: [], zones: [] },
  internal_tree: { type: 'open', fittings: [] },
  footprint,
  kick_run: { role: 'assembly', max_segment_length: null, split_mode: 'manual', face_splits: null, sub_splits: sub, members: [] } as unknown as CabinetInput['kick_run'],
}).toekick_parts

describe('joined kick with a shaped assembly', () => {
  const parts = kick(1200, [1857])
  const of = (k: string) => parts.filter(p => p.part_key === k)
  const faceFront = D - DEFAULT_RULES.TOESCF

  it('face runs straight on to the wall line, in pieces, bevelled only at the wall end', () => {
    const f = of('kick_front_face').sort((a, b) => a.X - b.X)
    expect(f.length).toBe(3)
    expect(f.reduce((a, p) => a + p.DY, 0)).toBeCloseTo(X1 + faceFront, 2)
    expect(f.every(p => Math.abs(p.AY) < 1e-6)).toBe(true)
    expect(f[2].bevel_hi).toBeTruthy()
    expect(f[0].bevel_hi ?? f[1].bevel_hi).toBeUndefined()
  })

  it('sub front splits at the seam and stops short of the wall', () => {
    const s = of('kick_sub_front').sort((a, b) => a.X - b.X)
    expect(s.length).toBe(2)
    expect(s[0].DY).toBeCloseTo(1857, 2)
    expect(s[1].X + s[1].DY).toBeLessThan(1857 + D)
  })

  it('a kick back follows the angle, its outer face 16 off the wall', () => {
    const backs = of('kick_back')
    expect(backs.length).toBe(2)
    const ang = backs.find(p => Math.abs(p.AY) > 1)!
    expect(Math.abs(ang.AY)).toBeCloseTo(45, 2)
    // Wall = y = x - 1857: perpendicular distance of the board's start corner.
    expect(Math.abs(ang.X - 1857 - ang.Z) / S2).toBeCloseTo(16, 1)
  })
})
