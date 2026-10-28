import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { resolveKickRunParts } from '../resolveKickRun'
import { DEFAULT_RULES, type CabinetInput, type ConstructionRules, type Material } from '../types'

// Kick end returns (TOERETL / TOERETR): a face-board end at an open kick end,
// kick back → behind the face; interior boards + end spreaders step in by it.
const face: Material = { id: 'face', name: 'Face 16', DZ: 16, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
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

describe('kick returns', () => {
  it('none by default', () => {
    expect(resolveCabinet(cab({})).toekick_parts.some(p => p.part_key === 'kick_return')).toBe(false)
  })

  it('left return: face board at x 0, kick back to behind the face; interior steps in', () => {
    const tk = resolveCabinet(cab({ TOERETL: true })).toekick_parts
    const ret = tk.filter(p => p.part_key === 'kick_return')
    expect(ret).toHaveLength(1)
    const f = tk.find(p => p.part_key === 'kick_front_face')!
    expect(ret[0]).toMatchObject({ X: 0, Y: 0, Z: 0, DY: 16, DX: 150, material_id: 'face' })
    expect(ret[0].Z + ret[0].DZ).toBeCloseTo(f.Z, 6)          // butts the face's back
    expect(f).toMatchObject({ X: 0, DY: 600 })                 // face runs through
    expect(f.edge_band.left).toBe(true)                        // returned end taped
    expect(f.edge_band.right).toBeFalsy()
    for (const k of ['kick_sub_front', 'kick_back'] as const) {
      expect(tk.find(p => p.part_key === k)).toMatchObject({ X: 16, DY: 584 })
    }
    expect(Math.min(...tk.filter(p => p.part_key === 'spreader_vertical').map(p => p.X))).toBe(16)
  })

  it('both ends on a joined run', () => {
    const c = cab({ TOERETL: true, TOERETR: true }, 1200)
    const tk = resolveKickRunParts({ ...c, kick_run: { role: 'lead', members: [] } } as unknown as CabinetInput, c.rules).parts
    const ret = tk.filter(p => p.part_key === 'kick_return').map(p => p.X)
    expect(ret).toEqual([0, 1184])
    const sub = tk.find(p => p.part_key === 'kick_sub_front')!
    expect(sub).toMatchObject({ X: 16, DY: 1168 })
    const xs = tk.filter(p => p.part_key === 'spreader_vertical').map(p => p.X)
    expect(Math.min(...xs)).toBe(16)
    expect(Math.max(...xs)).toBe(1200 - 18 - 16)
  })
})
