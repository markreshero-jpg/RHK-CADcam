import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules, insetReveals } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ConstructionRules, type FaceGridInput } from '../types'

// D-INS (Mark, RHK6548 FC BC-03, 2026-11-27): inset fronts sit inside the
// opening, flush with the carcass front; reveals = panel + INSGAP unless typed
// on the cabinet or the front.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const oneDoor: FaceGridInput = { rows: [{ row_index: 0, height_locked: false }], cols: [{ col_index: 0, width_locked: false }],
  zones: [{ row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'left' }] }
const cab = (own: Partial<ConstructionRules>, o: Partial<CabinetInput> = {}): CabinetInput => {
  const base = mergeRules(DEFAULT_RULES, { REVT: 3, REVB: 0 })
  return {
    id: 'c1', assembly_class: 'base', DX: 600, DY: 737, DZ: 545,
    has_carcass: true, has_internal: false, has_face: true, has_toekick: false,
    left_neighbour: 'wall', right_neighbour: 'cabinet', exposed_interior: false,
    material: board, door_material: board, shelf_material: board, exposed_material: board,
    toekick_face_material: board, toekick_interior_material: board,
    slide_side_deduction: 13, rules: mergeRules(base, own), rules_base: base, cabinet_rules: own,
    face_grid: oneDoor, internal_tree: { type: 'open', fittings: [] },
    ...o,
  }
}

describe('inset fronts', () => {
  it('panel + 2 reveals, front flush with the carcass', () => {
    const c = cab({ FACINS: 0.01, RAIL_ORIENT: 'horizontal' })
    expect(insetReveals(c, c.rules)).toEqual({ left: 20, right: 20, bottom: 20, top: 20 })
    const z = resolveCabinet(c).face_zones[0]
    expect(z.X).toBeCloseTo(20); expect(z.DX).toBeCloseTo(560)
    expect(z.Y).toBeCloseTo(20); expect(z.DY).toBeCloseTo(697)
    expect(z.Z + z.DZ).toBeCloseTo(545 - 0.01)
  })
  it('on-edge front rail: top reveal = RD + 2', () => {
    const c = cab({ FACINS: 0.01, RAIL_ORIENT: 'vertical', RD: 80 })
    expect(insetReveals(c, c.rules).top).toBe(82)
  })
  it('a reveal typed on the cabinet wins; a job reveal does not', () => {
    const z = resolveCabinet(cab({ FACINS: 0.01, RAIL_ORIENT: 'horizontal', REVB: 50 })).face_zones[0]
    expect(z.Y).toBeCloseTo(50); expect(z.DY).toBeCloseTo(737 - 50 - 20)
  })
  it('one inset front on an overlay cabinet + its own reveal', () => {
    const grid: FaceGridInput = { rows: [{ row_index: 0, height: 587, height_locked: true }, { row_index: 1, height_locked: false }],
      cols: [{ col_index: 0, width_locked: false }],
      zones: [{ row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'left', face_ins: 0.01, ins_rev: { right: 25 } },
        { row_index: 1, col_index: 0, face_type: 'open' }] }
    const c = cab({ RAIL_ORIENT: 'horizontal' }, { face_grid: grid })
    const z = resolveCabinet(c).face_zones[0]
    expect(z.X).toBeCloseTo(20)
    expect(z.X + z.DX).toBeCloseTo(600 - 25)
    expect(z.Y).toBeCloseTo(20); expect(z.DY).toBeCloseTo(567)   // row 587 from REVB 0, bottom pulled in to 20
  })
  it('overlay cabinets are unchanged', () => {
    const z = resolveCabinet(cab({})).face_zones[0]
    expect(z.Z).toBeCloseTo(547)
  })
})
