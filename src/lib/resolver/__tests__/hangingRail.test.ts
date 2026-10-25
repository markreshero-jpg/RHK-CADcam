import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { HANGING_RAIL_OVAL } from '../fittings'
import { DEFAULT_RULES, type CabinetInput, type InternalFitting, type Material } from '../types'

// HANGING_RAIL_OVAL accessory (RHK6581 Bed 2): 30 x 15 block, wall to wall,
// hanging 60 under the top of its opening unless locked.
const board: Material = { id: 'm16', name: 'Board 16.5', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const cab = (fittings: InternalFitting[]): CabinetInput => ({
  id: 'c1', assembly_class: 'tall', DX: 841, DY: 2300, DZ: 390,
  has_carcass: true, has_internal: true, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, { SCRBK: 0 }),
  face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings },
})
const rail = (fittings: InternalFitting[]) => resolveCabinet(cab(fittings)).internal_parts.filter(p => p.part_type === 'accessory')

describe('hanging rail accessory', () => {
  it('hangs 60 under the top of the opening, across the full inside width', () => {
    const [r] = rail([{ type: 'accessory', key: HANGING_RAIL_OVAL.key, y_locked: false }])
    const top = cab([]).DY - board.DZ
    expect(r.Y).toBeCloseTo(top - 60 - 30)
    expect([r.DX, r.DY, r.DZ]).toEqual([15, 841 - 2 * 16.5, 30])
  })
  it('stays at the top even with a drawer stacked in the same opening', () => {
    const ps = rail([{ type: 'inner_drawer', y_locked: false }, { type: 'accessory', key: HANGING_RAIL_OVAL.key, y_locked: false }])
    expect(ps[0].Y).toBeGreaterThan(2000)
  })
  it('a locked rail keeps its height', () => {
    expect(rail([{ type: 'accessory', key: HANGING_RAIL_OVAL.key, y_locked: true, y_position: 1714 }])[0].Y).toBe(1714)
  })
  it('unknown accessory keys emit nothing', () => {
    expect(rail([{ type: 'accessory', key: 'WINE_RACK', y_locked: false }])).toEqual([])
  })
  // z_accessories A4/A5: size + colour from the library rail.
  const products = [
    { id: 'p1', name: 'Oval 15 x 30', category: 'hanging_rail', width_mm: 15, height_mm: 30, colour: '#fff', is_default: true },
    { id: 'p2', name: 'Round 25', category: 'hanging_rail', width_mm: 25, height_mm: 25, colour: '#999', is_default: false },
  ]
  const railP = (f: InternalFitting) => resolveCabinet({ ...cab([f]), accessory_products: products }).internal_parts.filter(p => p.part_type === 'accessory')
  it('uses the default library rail when none is picked', () => {
    const [r] = railP({ type: 'accessory', key: HANGING_RAIL_OVAL.key, y_locked: false })
    expect(r.accessory).toEqual({ product_id: 'p1', name: 'Oval 15 x 30', colour: '#fff' })
  })
  it('a picked rail sets the size it draws at', () => {
    const [r] = railP({ type: 'accessory', key: HANGING_RAIL_OVAL.key, y_locked: false, product_id: 'p2' })
    expect([r.DX, r.DZ, r.accessory?.product_id]).toEqual([25, 25, 'p2'])
    expect(r.Y).toBeCloseTo(cab([]).DY - board.DZ - 60 - 25)
  })
})
