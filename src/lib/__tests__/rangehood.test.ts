import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver/resolver'
import { mergeRules } from '../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type JointTypeOp, type Material } from '../resolver/types'
import { cabinetSeamDrills, dropVoidDrills, type DrillOpPos } from '../jointDrilling'
import { normaliseRangehood, DEFAULT_RANGEHOOD, type RangehoodSettings } from '../rangehood'
import { partShapes } from '../partSolids'

// z_rangehood R5: the WRH — hole, flue notch, shelf at 350, flue box + joints.
const board: Material = { id: 'm', name: 'B16', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const dyn = {
  id: 'dyn', joint_type_id: 'dyn', operation_order: 0, target_part: 'part_b', machine_operation: 'drill', face: 'normal',
  tool_diameter_mm: 5, depth_mm: 15, offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: 50, qty: 2, spacing_mm: 150, qty2: 1, spacing2_mm: null,
  router_tool_id: null, drill_id: null, auto_tool: false, notes: null,
  expressions: { qty: 'Math.ceil((D - 100) / 280) + 1', depth_mm: 'T', spacing_mm: '(D - 100) / Math.ceil((D - 100) / 280)', offset_y_mm: 'T / 2' },
} as unknown as JointTypeOp
const RH_KEYS = ['rh_flue:shelf', 'rh_flue:top', 'rh_flue:front']
const wrh = (rangehood: RangehoodSettings | null = DEFAULT_RANGEHOOD, over: Partial<CabinetInput> = {}) => ({
  id: 'c', assembly_class: 'wall', DX: 600, DY: 720, DZ: 330, has_carcass: true, has_internal: true, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board, toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES), top_type: 'full_top', face_grid: { rows: [], cols: [], zones: [] },
  internal_tree: { type: 'open', fittings: [{ type: 'fixed_shelf', y_locked: false }] },
  joint_defaults: Object.fromEntries(RH_KEYS.map(k => [k, 'dyn'])), joint_type_ops: { dyn: [dyn] }, joint_type_names: { dyn: '5mm Dynamic Holes' },
  rangehood, ...over,
}) as unknown as CabinetInput
const withHole = normaliseRangehood({ hole: { w: 500, d: 260, setback: 40 } })!

describe('rangehood cabinet (R5)', () => {
  it('normalises the block', () => {
    expect(normaliseRangehood(null)).toBeNull()
    expect(normaliseRangehood({})).toEqual(DEFAULT_RANGEHOOD)
    expect(withHole.hole).toEqual({ w: 500, d: 260, setback: 40, offset: 0, radius: 0 })
  })

  it('puts the first fixed shelf at 350 from the underside and notches it + the top', () => {
    const rp = resolveCabinet(wrh())
    const shelf = rp.internal_parts.find(p => p.part_type === 'fixed_shelf')!
    expect(shelf.Y).toBe(350)
    const top = rp.case_parts.find(p => p.part_key === 'full_top')!
    for (const p of [shelf, top]) expect(p.outline).toHaveLength(8)
    // Notch fronts line up in cabinet space: shelf back + 250.
    const front = (p: { Z: number; DX: number; outline?: { y: number }[] }) => p.Z + p.DX - Math.min(...p.outline!.map(q => q.y).filter(y => y > 0.01))
    expect(front(shelf)).toBeCloseTo(shelf.Z + 250)
    expect(front(top)).toBeCloseTo(shelf.Z + 250)
    // No hole size yet → warns, nothing cut in the bottom.
    expect(rp.warnings.some(w => w.code === 'RANGEHOOD' && /hole size/.test(w.message))).toBe(true)
    expect(rp.case_parts.find(p => p.part_key === 'bottom')!.cutouts).toBeUndefined()
  })

  it('cuts the hole once it has a size', () => {
    const rp = resolveCabinet(wrh(withHole))
    const bot = rp.case_parts.find(p => p.part_key === 'bottom')!
    expect(bot.cutouts).toHaveLength(1)
    const ys = bot.cutouts![0].pts.map(p => p.y), xs = bot.cutouts![0].pts.map(p => p.x)
    expect(Math.min(...ys)).toBeCloseTo(40)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(500)
    expect(rp.warnings.filter(w => w.code === 'RANGEHOOD' || w.code === 'CUTOUT_SKIPPED')).toEqual([])
  })

  it('builds the flue box on the shelf up to the top', () => {
    const rp = resolveCabinet(wrh(withHole))
    const shelf = rp.internal_parts.find(p => p.part_type === 'fixed_shelf')!
    const top = rp.case_parts.find(p => p.part_key === 'full_top')!
    const L = rp.case_parts.find(p => p.part_key === 'rh:flue_l')!
    const R = rp.case_parts.find(p => p.part_key === 'rh:flue_r')!
    const F = rp.case_parts.find(p => p.part_key === 'rh:flue_front')!
    const H = top.Y - (shelf.Y + shelf.DZ)
    const cx0 = shelf.X + (shelf.DY - 200) / 2
    expect([L.DY, L.DX, L.DZ, L.X, L.Z, L.AY]).toEqual([250, H, 16.5, cx0 - 16.5, shelf.Z + 250, 90])
    expect([R.X, R.Z, R.AY]).toEqual([cx0 + 200 + 16.5, shelf.Z, -90])
    expect([F.DY, F.X, F.Z, F.AY]).toEqual([233, cx0 - 16.5, shelf.Z + 250, 0])
    // Taping: sides' front edges, the front piece's two side edges.
    expect(L.edge_band).toMatchObject({ left: true, right: false, top: false, bottom: false })
    expect(R.edge_band).toMatchObject({ left: false, right: true })
    expect(F.edge_band).toMatchObject({ left: true, right: true, top: false, bottom: false })
    expect(partShapes(rp).has('case_rh:flue_l')).toBe(false)   // plain boxes
  })

  it('screws the shelf and top into every piece, and the front into the sides', () => {
    const rp = resolveCabinet(wrh(withHole))
    const shelf = rp.internal_parts.find(p => p.part_type === 'fixed_shelf')!
    const top = rp.case_parts.find(p => p.part_key === 'full_top')!
    expect(rp.seam_joints.filter(s => s.declared).map(s => s.seam_key).sort()).toEqual([
      'rh:flue_front|full_top', 'rh:flue_front|int_fixed_shelf_0', 'rh:flue_l|full_top', 'rh:flue_l|int_fixed_shelf_0',
      'rh:flue_l|rh:flue_front', 'rh:flue_r|full_top', 'rh:flue_r|int_fixed_shelf_0', 'rh:flue_r|rh:flue_front',
    ])
    const drills = cabinetSeamDrills(rp)
    const inShelf = drills.filter(d => d.targetPartKey === 'int_fixed_shelf_0')
    expect(inShelf).toHaveLength(6)                                  // 2 per piece
    expect(inShelf.every(d => d.axis === 'y+' && d.y === shelf.Y && d.depthLen === 16.5)).toBe(true)
    const inTop = drills.filter(d => d.targetPartKey === 'full_top')
    expect(inTop.filter(d => d.seamKey?.startsWith('rh:'))).toHaveLength(6)
    expect(inTop.filter(d => d.seamKey?.startsWith('rh:')).every(d => d.axis === 'y-' && d.y === top.Y + top.DZ)).toBe(true)
    // Left side holes sit mid-thickness over the side, 50 in from each end.
    const L = rp.case_parts.find(p => p.part_key === 'rh:flue_l')!
    const lHoles = inShelf.filter(d => d.seamKey === 'rh:flue_l|int_fixed_shelf_0')
    expect(lHoles.map(d => d.x)).toEqual([L.X + 8.25, L.X + 8.25])
    expect(lHoles.map(d => d.z).sort((a, b) => a - b)).toEqual([shelf.Z + 50, shelf.Z + 200])
    // Front piece → sides: bored back from its front face.
    const fr = drills.filter(d => d.targetPartKey === 'rh:flue_front')
    expect(fr).toHaveLength(4)
    expect(fr.every(d => d.axis === 'z-' && Math.abs(d.z - (shelf.Z + 250 + 16.5)) < 0.01)).toBe(true)
  })

  it('drops joint holes that run into the notch', () => {
    const rp = resolveCabinet(wrh(withHole))
    const v = rp.cutout_voids!
    expect(v.length).toBe(2)   // shelf + top
    const shelf = rp.internal_parts.find(p => p.part_type === 'fixed_shelf')!
    const mid = shelf.X + shelf.DY / 2, y = shelf.Y + shelf.DZ / 2
    const d = (x: number, axis: DrillOpPos['axis'], z: number): DrillOpPos => ({ x, y, z, axis, radius: 2.5, depthLen: 16.5, targetPartKey: 'k' } as DrillOpPos)
    // A back panel screw into the shelf's back edge behind the notch: gone; one beside it: kept.
    const back = d(mid, 'z+', shelf.Z - 16.5), beside = d(shelf.X + 30, 'z+', shelf.Z - 16.5)
    expect(dropVoidDrills([back, beside], v)).toEqual([beside])
  })

  it('warns and builds no box without a fixed shelf', () => {
    const rp = resolveCabinet(wrh(withHole, { internal_tree: { type: 'open', fittings: [] } } as Partial<CabinetInput>))
    expect(rp.warnings.some(w => /needs a fixed shelf/.test(w.message))).toBe(true)
    expect(rp.case_parts.some(p => p.part_key.startsWith('rh:'))).toBe(false)
    expect(rp.case_parts.find(p => p.part_key === 'bottom')!.cutouts).toHaveLength(1)
  })

  it('a plain wall cabinet is untouched', () => {
    const rp = resolveCabinet(wrh(null))
    expect(rp.case_parts.some(p => p.part_key.startsWith('rh:'))).toBe(false)
    expect(rp.cutout_voids).toBeUndefined()
  })
})
