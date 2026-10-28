import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { resolveKickRunParts } from '../resolveKickRun'
import { tkPlanCorners } from '../../jointDrilling'
import { DEFAULT_RULES, type CabinetInput, type ConstructionRules, type Material, type ResolvedToekickPart } from '../types'

// Kick end returns (TOERETL / TOERETR): a face board mitred 45° to the face at an
// open kick end, kick back → the face's front plane; interior boards + end
// spreaders step in by it. TOEGRAIN: face + returns grain, default vertical.
const face: Material = { id: 'face', name: 'Face 16', DZ: 16, sheet_dx: 2400, sheet_dy: 1200, has_grain: true }
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const cab = (rules: Partial<ConstructionRules>, DX = 600): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX, DY: 900, DZ: 580,
  has_carcass: false, has_internal: false, has_face: false, has_toekick: true,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: face, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, rules),
  face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
})
const plan = (p: ResolvedToekickPart) => {
  const c = tkPlanCorners(p), xs = c.map(q => q.x), zs = c.map(q => q.z)
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }
}

describe('kick returns', () => {
  it('none by default; face grain vertical', () => {
    const tk = resolveCabinet(cab({})).toekick_parts
    expect(tk.some(p => p.part_key === 'kick_return')).toBe(false)
    const f = tk.find(p => p.part_key === 'kick_front_face')!
    expect(f.grain_direction).toBe('vertical')
    expect(f.bevel_lo).toBeUndefined()
  })

  it('left return: mitred to the face, kick back to the front plane; interior steps in', () => {
    const tk = resolveCabinet(cab({ TOERETL: true, TOEGRAIN: 'horizontal' })).toekick_parts
    const f = tk.find(p => p.part_key === 'kick_front_face')!
    const ret = tk.filter(p => p.part_key === 'kick_return')
    expect(ret).toHaveLength(1)
    expect(f).toMatchObject({ X: 0, DY: 600, bevel_lo: 45, grain_direction: 'horizontal' })
    expect(f.bevel_hi).toBeUndefined()
    expect(ret[0]).toMatchObject({ DX: 150, DZ: 16, material_id: 'face', AY: -90, bevel_hi: 45, grain_direction: 'horizontal' })
    // In plan: x 0..16 (outer face on the end), z from the kick back to the face's front.
    const b = plan(ret[0])
    expect(b.x0).toBeCloseTo(0, 6); expect(b.x1).toBeCloseTo(16, 6)
    expect(b.z0).toBeCloseTo(0, 6); expect(b.z1).toBeCloseTo(f.Z + f.DZ, 6)
    for (const k of ['kick_sub_front', 'kick_back'] as const) {
      expect(tk.find(p => p.part_key === k)).toMatchObject({ X: 16, DY: 584 })
    }
    expect(Math.min(...tk.filter(p => p.part_key === 'spreader_vertical').map(p => p.X))).toBe(16)
  })

  it('right return lands on the right end', () => {
    const tk = resolveCabinet(cab({ TOERETR: true })).toekick_parts
    const f = tk.find(p => p.part_key === 'kick_front_face')!
    expect(f).toMatchObject({ bevel_hi: 45 })
    const b = plan(tk.find(p => p.part_key === 'kick_return')!)
    expect(b.x0).toBeCloseTo(584, 6); expect(b.x1).toBeCloseTo(600, 6)
    expect(b.z0).toBeCloseTo(0, 6); expect(b.z1).toBeCloseTo(f.Z + f.DZ, 6)
  })

  it('both ends on a joined run: only the end face boards are mitred', () => {
    const c = cab({ TOERETL: true, TOERETR: true }, 1200)
    const tk = resolveKickRunParts({ ...c, kick_run: { role: 'lead', members: [], max_segment_length: 700 } } as unknown as CabinetInput, c.rules).parts
    const faces = tk.filter(p => p.part_key === 'kick_front_face')
    expect(faces).toHaveLength(2)
    expect(faces[0]).toMatchObject({ bevel_lo: 45 }); expect(faces[0].bevel_hi).toBeUndefined()
    expect(faces[1]).toMatchObject({ bevel_hi: 45 }); expect(faces[1].bevel_lo).toBeUndefined()
    expect(tk.filter(p => p.part_key === 'kick_return').map(p => Math.round(plan(p).x0))).toEqual([0, 1184])
    const xs = tk.filter(p => p.part_key === 'spreader_vertical').map(p => p.X)
    expect(Math.min(...xs)).toBe(16)
    expect(Math.max(...xs)).toBe(1200 - 18 - 16)
  })
})
