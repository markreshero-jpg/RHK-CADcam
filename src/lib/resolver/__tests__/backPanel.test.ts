import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material } from '../types'
import { caseBoxAABB } from '../../jointDrilling'
import { normaliseBackPanel, backPanelPieces, backPanelPartLabel, type BackPanelSettings } from '../../backPanel'
import { buildPersistPayload } from '../persistResolved'
import { normalizeProject } from '../../optimiser/normalize'

// z_island_back_panel: exposed board on an island's back, split at the sheet width.
const board = (t: number, id = `m${t}`): Material => ({ id, name: `Board ${t}`, DZ: t, sheet_dx: 2400, sheet_dy: 1200, has_grain: true })

function cab(s: Partial<BackPanelSettings>, o: Partial<CabinetInput> = {}): CabinetInput {
  return {
    id: 'ibp1', assembly_class: 'base', DX: 2500, DY: 900, DZ: 18,
    has_carcass: false, has_internal: false, has_face: false, has_toekick: false,
    left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
    material: board(16, 'carcass'), door_material: board(18, 'door'), shelf_material: board(16),
    exposed_material: board(18, 'exposed'),
    toekick_face_material: board(16), toekick_interior_material: board(16),
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    internal_tree: { type: 'open', fittings: [] },
    face_grid: { rows: [], cols: [], zones: [] },
    exposed_edgeband_id: 'eb-exposed',
    back_panel: normaliseBackPanel({ mount: 'floor', sheet_w: 1200, ...s }),
    ...o,
  }
}
const parts = (c: CabinetInput) => resolveCabinet(c).case_parts

describe('island back panel', () => {
  it('pieces: equal, never wider than the sheet; exactly a sheet is one piece', () => {
    expect(backPanelPieces(1200, 1200)).toBe(1)
    expect(backPanelPieces(1201, 1200)).toBe(2)
    expect(backPanelPieces(2500, 1200)).toBe(3)
    expect(backPanelPieces(2500, 1300)).toBe(2)
  })

  it('floor: equal pieces of exposed board across the width, floor to cabinet height', () => {
    const ps = parts(cab({}))
    expect(ps.map(p => p.part_key)).toEqual(['ibp:1', 'ibp:2', 'ibp:3'])
    const boxes = ps.map(p => { const b = caseBoxAABB(p); return { x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.h, z0: b.z, z1: b.z + b.d } })
    const r = (n: number) => Math.round(n * 10) / 10 + 0
    expect(boxes.map(b => [r(b.x0), r(b.x1)])).toEqual([[0, 833.3], [833.3, 1666.7], [1666.7, 2500]])
    for (const b of boxes) expect([r(b.y0), r(b.y1), r(b.z0), r(b.z1)]).toEqual([0, 900, 0, 18])
    for (const p of ps) {
      expect({ mat: p.material_id, DZ: p.DZ, grain: p.grain_direction }).toEqual({ mat: 'exposed', DZ: 18, grain: 'vertical' })
      // Taped all round incl. joins; the floor edge raw.
      expect(p.edge_band).toMatchObject({ top: true, bottom: false, left: true, right: true, id: 'eb-exposed' })
    }
  })

  it('kick: starts at kick height, bottom edge taped', () => {
    const ps = parts(cab({ mount: 'kick', sheet_w: 1300 }))
    expect(ps).toHaveLength(2)
    const b = caseBoxAABB(ps[0])
    expect([b.y, b.y + b.h]).toEqual([DEFAULT_RULES.TOEH, 900])
    expect(ps[0].edge_band.bottom).toBe(true)
  })

  it('nest: turned so the grain runs up, tape turning with it', () => {
    const rp = resolveCabinet(cab({}, { DX: 1000 }))
    const row = { ...buildPersistPayload(rp).case_parts[0], id: 'r1', cabinet_instance_id: 'c1' }
    const { parts: op } = normalizeProject(
      { id: 'p', name: 'P', job_number: null }, [{ id: 'room', name: 'Room' }],
      [{ id: 'c1', label: 'IBPF-01', assembly_class: 'base', room_id: 'room' }],
      [row], [], [], [], [], new Map(), [], new Map([['eb-exposed', 1]]))
    expect({ w: op[0].w, h: op[0].h, label: op[0].label }).toEqual({ w: 1000, h: 900, label: 'Island Back Panel 1' })
    // w = width: both ends taped; h = height: top taped, floor edge raw.
    expect([op[0].eb_w1, op[0].eb_w2, op[0].eb_h1, op[0].eb_h2].sort()).toEqual([0, 1, 1, 1])
    expect(op[0].eb_h1 + op[0].eb_h2).toBe(1)
  })

  it('labels', () => {
    expect(backPanelPartLabel('ibp:2')).toBe('Island Back Panel 2')
    expect(backPanelPartLabel('fs:top')).toBeNull()
  })
})
