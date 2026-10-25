import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { HANGING_RAIL_OVAL } from '../fittings'
import { DEFAULT_RULES, type CabinetInput, type InternalFitting, type Material } from '../types'
import { cabinetSeamDrills } from '../../jointDrilling'

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

// z_accessories A6 / A8: the rail places its supports; end supports prick the gables.
describe('hanging rail supports', () => {
  const products = [
    { id: 'r', name: 'Oval', category: 'hanging_rail', width_mm: 15, height_mm: 30, colour: '#fff', is_default: true,
      end_support_id: 'es', centre_support_id: 'cp', end_pillar_id: 'ep', max_span_mm: 1000 },
    { id: 'es', name: 'End support', category: 'rail_support', width_mm: 42, height_mm: 42, depth_mm: 16, colour: null, is_default: false, joint_id: 'j1',
      model_url: 'es.glb', model_format: 'glb', model_scale: 1000 },
    { id: 'cp', name: 'Centre pillar', category: 'rail_support', width_mm: 40, height_mm: 50, depth_mm: 40, colour: null, is_default: false },
    { id: 'ep', name: 'End pillar', category: 'rail_support', width_mm: 40, height_mm: 50, depth_mm: 40, colour: null, is_default: false },
  ]
  const op = {
    id: 'o1', joint_type_id: 'j1', operation_order: 1, target_part: 'part_a', machine_operation: 'drill', face: 'normal',
    tool_diameter_mm: 5, depth_mm: 1, offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: 10, qty: 2, spacing_mm: 32,
    qty2: 1, spacing2_mm: null, router_tool_id: null, drill_id: null, auto_tool: true, notes: null, expressions: null,
  } as const
  const run = (f: InternalFitting, DX = 841) => resolveCabinet({
    ...cab([f]), DX, accessory_products: products,
    joint_type_ops: { j1: [op] }, joint_type_names: { j1: 'Finista end support' },
  })
  const RAIL = { type: 'accessory', key: HANGING_RAIL_OVAL.key, y_locked: true, y_position: 1700 } as const
  const sups = (rp: ReturnType<typeof run>) => rp.internal_parts.filter(p => p.part_type === 'rail_support')

  it('an end support on each gable, centred on the rail, no centre pillar up to 1000; rail cut 5 short each end', () => {
    const rp = run(RAIL)
    const s = sups(rp)
    expect(s.map(p => p.accessory?.role)).toEqual(['end_support', 'end_support'])
    expect([s[0].X, s[0].Y, s[0].DZ, s[0].DY]).toEqual([16.5, 1715 - 21, 42, 16])
    expect(s[1].X + s[1].DY).toBeCloseTo(841 - 16.5)
    expect(s[0].accessory?.model).toEqual({ url: 'es.glb', format: 'glb', scale: 1000 })
    const r = rp.internal_parts.find(p => p.part_type === 'accessory')!
    expect([r.X, r.DY]).toEqual([16.5 + 5, 841 - 33 - 10])
  })
  it('a centre pillar once the rail is over 1000, hanging its 50 drop from the shelf', () => {
    const c = sups(run(RAIL, 1100)).filter(p => p.accessory?.role === 'centre_pillar')
    expect(c).toHaveLength(1)
    expect(c[0].DZ).toBe(50)
    expect(c[0].Y + c[0].DZ).toBeCloseTo(2300 - 16.5)
  })
  it('an unlocked rail with pillars hangs its centre 50 below the top', () => {
    const rp = run({ type: 'accessory', key: HANGING_RAIL_OVAL.key, y_locked: false }, 1100)
    const r = rp.internal_parts.find(p => p.part_type === 'accessory')!
    expect(r.Y + r.DZ / 2).toBeCloseTo(2300 - 16.5 - 50)
  })
  it('an end pillar: rail stops 5 past its centre', () => {
    const rp = run({ ...RAIL, supports: { left: 'end_pillar' } })
    const r = rp.internal_parts.find(p => p.part_type === 'accessory')!
    expect(r.X).toBe(16.5 + 20 - 5)
  })
  it('end pillar / none per end, and a centre count override', () => {
    const s = sups(run({ ...RAIL, supports: { left: 'end_pillar', right: 'none', centre: 2 } }))
    expect(s.map(p => p.accessory?.role)).toEqual(['end_pillar', 'centre_pillar', 'centre_pillar'])
  })
  it('end supports prick two holes 32 apart into each gable, 4 and 36 above the rail bottom, 1 deep', () => {
    const rp = run(RAIL)
    const seams = rp.seam_joints.filter(j => j.part_b_key.startsWith('int_rail_support_'))
    expect(seams.map(j => j.part_a_key)).toEqual(['left_side', 'right_side'])
    const holes = cabinetSeamDrills(rp).filter(d => d.seamKey.includes('int_rail_support_'))
    const left = holes.filter(d => d.targetPartKey === 'left_side')
    expect(left.map(d => d.y)).toEqual([1704, 1736])
    expect(left.every(d => d.x === 16.5 && d.axis === 'x-' && d.depthLen === 1 && d.radius === 2.5)).toBe(true)
    expect(holes.filter(d => d.targetPartKey === 'right_side').every(d => d.axis === 'x+')).toBe(true)
  })
  it('drilling off → no seam', () => {
    const rp = run({ ...RAIL, supports: { drill: false } })
    expect(rp.seam_joints.some(j => j.part_b_key.startsWith('int_rail_support_'))).toBe(false)
  })
})
