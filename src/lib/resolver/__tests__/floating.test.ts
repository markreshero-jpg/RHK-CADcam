import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type ConstructionRules, type Material } from '../types'

// z_floating F1: FLOAT / FLOAT_BOTTOM — wall-hung, no kick, taped gable ends.
const board:   Material = { id: 'm18', name: 'Board 18',   DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const exposed: Material = { id: 'x16', name: 'Exposed 16', DZ: 16, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const cab = (rules: Partial<ConstructionRules>, over: Partial<CabinetInput> = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 600, DY: 500, DZ: 460,
  has_carcass: true, has_internal: false, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: exposed,
  toekick_face_material: board, toekick_interior_material: board,
  interior_edgeband_id: 'eb-int', exposed_edgeband_id: 'eb-exp',
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, rules),
  face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
  ...over,
})
// Shop-style method edging: gables front edge only, back untaped.
const shop: Partial<ConstructionRules> = { EDGING: { left_side: ['right'], right_side: ['right'], back: [] } }
const part = (c: CabinetInput, key: string) => resolveCabinet(c).case_parts.find(p => p.part_key === key)

describe('floating cabinets', () => {
  it('a normal carcass bottom between the gables; gables run the full height from 0', () => {
    const c = cab({ ...shop, FLOAT: true })
    expect(part(c, 'bottom')).toMatchObject({ X: 18, Y: 0, DY: 600 - 36, DZ: 18, material_id: 'm18' })
    const side = part(c, 'left_side')!
    expect(side.Y).toBe(0)
    expect(side.DY).toBe(500)
  })

  it('tapes gable tops + bottoms on top of the method edging; back keeps the method edging', () => {
    const c = cab({ ...shop, FLOAT: true })
    expect(part(c, 'left_side')!.edge_band).toMatchObject({ top: true, bottom: true, left: false, right: true })
    expect(part(c, 'right_side')!.edge_band).toMatchObject({ top: true, bottom: true, left: false, right: true })
    expect(part(c, 'back')!.edge_band).toMatchObject({ top: false, bottom: false, left: false, right: false })
  })

  it('a non-floating cabinet keeps the method edging', () => {
    const c = cab(shop)
    expect(part(c, 'left_side')!.edge_band).toMatchObject({ top: false, bottom: false, right: true })
    expect(part(c, 'back')!.edge_band.bottom).toBe(false)
  })

  it('FLOAT_BOTTOM: the carcass takes a bottom scribe of the exposed thickness for the run panel', () => {
    const c = cab({ ...shop, FLOAT: true, FLOAT_BOTTOM: true })
    expect(part(c, 'bottom')).toMatchObject({ X: 18, Y: 16, DY: 600 - 36, DZ: 18, material_id: 'm18' })
    const side = part(c, 'left_side')!
    expect(side.Y).toBe(16)
    expect(side.DY).toBe(500 - 16)
    // Gable bottoms sit on the panel, so only their tops are added.
    expect(side.edge_band).toMatchObject({ top: true, bottom: false, right: true })
  })

  it('FLOAT_BOTTOM: fronts still run to the cabinet bottom, over the panel edge', () => {
    const faced = (rules: Partial<ConstructionRules>) => resolveCabinet(cab(rules, {
      has_face: true,
      face_grid: { rows: [{ row_index: 0, height_locked: false }], cols: [{ col_index: 0, width_locked: false }], zones: [{ row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'left' }] },
    } as Partial<CabinetInput>))
    const y = (r: ReturnType<typeof resolveCabinet>) => r.face_zones[0].Y
    expect(y(faced({ FLOAT: true, FLOAT_BOTTOM: true }))).toBe(y(faced({ FLOAT: true })))
  })

  it('never builds a kick, even if has_toekick is left on', () => {
    expect(resolveCabinet(cab({ FLOAT: true }, { has_toekick: true })).toekick_parts).toEqual([])
    const side = part(cab({ FLOAT: true }, { has_toekick: true }), 'left_side')!
    expect(side.Y).toBe(0)
  })

  it('interior floor: carcass bottom top, raised by the panel scribe', () => {
    const shelf = (rules: Partial<ConstructionRules>) => resolveCabinet({
      ...cab(rules), has_internal: true,
      internal_tree: { type: 'open', fittings: [{ type: 'fixed_shelf', y_locked: false }] },
    }).internal_parts.find(p => p.part_type === 'fixed_shelf')!
    // Interior heights: normal / floating 500 − 18 − 18 = 464, + panel scribe 464 − 16 = 448.
    const normal = shelf({}), float = shelf({ FLOAT: true }), withPanel = shelf({ FLOAT: true, FLOAT_BOTTOM: true })
    expect(float.Y).toBeCloseTo(normal.Y, 0)
    expect(withPanel.Y - normal.Y).toBeCloseTo((34 + 448 / 2) - (18 + 464 / 2), 0)
  })
})

// Only hand edits (cabinet_instances.edge_overrides) re-apply after a resolve, so
// turning FLOAT on for an already-resolved cabinet tapes its gable ends.
describe('edge overrides', () => {
  it('a hand edit wins; parts without one keep the rule-driven edging', async () => {
    const { applyEdgeOverrides } = await import('../resolveCabinetFromDB')
    const resolved = resolveCabinet(cab({ ...shop, FLOAT: true }))
    applyEdgeOverrides(resolved, { case_right_side: { top: false, bottom: false, left: false, right: true } })
    const get = (k: string) => resolved.case_parts.find(p => p.part_key === k)!.edge_band
    expect(get('left_side')).toMatchObject({ top: true, bottom: true, right: true })
    expect(get('right_side')).toMatchObject({ top: false, bottom: false, right: true })
  })
})
