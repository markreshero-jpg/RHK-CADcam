import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type JointTypeOp, type Material } from '../types'
import { buildPresetFootprint } from '../../cabinetShape/presets'
import { caseBox, internalBox, internalSeamPartKey, intoPartFrame, cabinetSeamDrills } from '../../jointDrilling'

// z_cabinet_shape L3 (Mark, 2026-10-15: "drill holes are not making it onto
// some parts"): seams on an L corner's per-edge panels, drilled in a turned frame.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
// The shop's real recipes (joint_type_operations): screws bored through the
// receiving panel's face, sized off the shared depth.
const op = (id: string, offZ: number, ex: Record<string, string>): JointTypeOp => ({
  id, joint_type_id: id, operation_order: 0, target_part: 'part_b', machine_operation: 'drill', face: 'normal',
  tool_diameter_mm: 5, depth_mm: 12, offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: offZ,
  qty: 2, spacing_mm: null, qty2: 1, spacing2_mm: null, router_tool_id: null, drill_id: null, auto_tool: false, notes: null,
  expressions: ex,
})
const ops = {
  dyn:   [op('dyn', 50, { qty: 'Math.ceil((D - 100) / 280) + 1', depth_mm: 'T', spacing_mm: '(D - 100) / Math.ceil((D - 100) / 280)', offset_y_mm: 'T / 2' })],
  rail:  [op('rail', 25, { depth_mm: 'T', offset_y_mm: 'T / 2' })],
  shelf: [{ ...op('shelf', 50, { spacing_mm: 'D - 100', offset_y_mm: 'T / 2' }), depth_mm: 12 }],
}
const defaults = {
  'bottom:left_side': 'dyn', 'bottom:right_side': 'dyn', 'back:left_side': 'dyn', 'back:right_side': 'dyn', 'back:bottom': 'dyn',
  'front_rail:left_side': 'rail', 'front_rail:right_side': 'rail', 'adj_shelf:side': 'shelf',
}
const cab = (o: Partial<CabinetInput>): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 900, DY: 870, DZ: 900,
  has_carcass: true, has_internal: true, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES), top_type: 'front_rail',
  face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: false }] },
  joint_defaults: defaults, joint_type_ops: ops, joint_type_names: { dyn: 'Dyn', rail: 'Rail', shelf: 'Shelf' },
  ...o,
} as CabinetInput)
const lCorner = (side: 'right' | 'left', orient: 'vertical' | 'horizontal' = 'vertical') => cab({
  rules: mergeRules(DEFAULT_RULES, { RAIL_ORIENT: orient }),
  footprint: buildPresetFootprint('l_corner', { leg_back: 560, leg_side: 560, side }, { w: 900, d: 900 }),
})

describe('L corner construction drilling', () => {
  for (const side of ['right', 'left'] as const) {
    it(`${side} hand: every per-edge panel joint gets a seam`, () => {
      // Which back / rail runs through follows the shape's edge order, so the
      // two back↔back and rail↔rail seams may come either way round.
      const flip: Record<string, string> = { 'back|back:back2': 'back:back2|back', 'rail:front|rail:front2': 'rail:front2|rail:front' }
      const keys = resolveCabinet(lCorner(side)).seam_joints.map(s => flip[s.seam_key] ?? s.seam_key).sort()
      const end = side === 'right' ? 'right_side' : 'left_side'
      expect(keys).toEqual([
        `back:${end}`, 'back:back2|back', 'back:back2|bottom', 'back:back2|side:end2', 'back:bottom',
        `bottom:${end}`, 'bottom|side:end2', 'int_adj_shelf_0|side:end2', 'int_adj_shelf_0|back', 'int_adj_shelf_0|back:back2', `int_adj_shelf_0:${side === 'right' ? 'right' : 'left'}`,
        `rail:front2|rail:front`, 'rail:front2|side:end2', `rail:front|${end}`,
        // The through rail runs on to the other leg's back and is fixed to it.
        side === 'right' ? 'rail:front|back:back2' : 'rail:front2|back',
      ].sort())
    })

    for (const orient of ['vertical', 'horizontal'] as const) {
      it(`${side} hand, ${orient} rails: every hole enters its part through a face and bores into it`, () => {
        const rp = resolveCabinet(lCorner(side, orient))
        const drills = cabinetSeamDrills(rp)
        expect(drills.length).toBeGreaterThan(20)
        for (const d of drills) {
          const cp = rp.case_parts.find(p => p.part_key === d.targetPartKey)
          const ip = rp.internal_parts.find(p => internalSeamPartKey(p) === d.targetPartKey)
          const local = cp ? intoPartFrame(cp, d) : d
          const b = cp ? caseBox(cp) : internalBox(ip!)!
          const inside = (q: { x: number; y: number; z: number }, tol: number) =>
            q.x >= b.x - tol && q.x <= b.x + b.w + tol && q.y >= b.y - tol && q.y <= b.y + b.h + tol && q.z >= b.z - tol && q.z <= b.z + b.d + tol
          const v = { 'x+': [1, 0, 0], 'x-': [-1, 0, 0], 'y+': [0, 1, 0], 'y-': [0, -1, 0], 'z+': [0, 0, 1], 'z-': [0, 0, -1] }[local.axis]
          const deeper = { x: local.x + v[0] * 2, y: local.y + v[1] * 2, z: local.z + v[2] * 2 }
          expect(inside(local, 0.5), `${d.seamKey} → ${d.targetPartKey} entry ${JSON.stringify(local)}`).toBe(true)
          expect(inside(deeper, 0.01), `${d.seamKey} → ${d.targetPartKey} bores out of the part`).toBe(true)
        }
        // Holes on the return leg's end panel stay within its 560.
        for (const d of drills.filter(q => q.targetPartKey === 'side:end2')) {
          expect(side === 'right' ? d.x : 900 - d.x).toBeLessThan(560)
        }
      })
    }
  }

  // Mark, 2026-10-15: "add more adj shelf holes along the 2 back edges to
  // support the shelf" — as joints, inheriting the shelf's side joint.
  for (const side of ['right', 'left'] as const) {
    it(`${side} hand: the L shelf is pinned on both backs as well as both ends`, () => {
      const rp = resolveCabinet(lCorner(side))
      const n: Record<string, number> = {}
      for (const d of cabinetSeamDrills(rp).filter(q => q.seamKey.startsWith('int_'))) n[d.targetPartKey] = (n[d.targetPartKey] ?? 0) + 1
      expect(n).toEqual({ back: 2, 'back:back2': 2, 'side:end2': 2, [side === 'right' ? 'right_side' : 'left_side']: 2 })
      // No back joint in the method → the side joint.
      for (const k of ['int_adj_shelf_0|back', 'int_adj_shelf_0|back:back2'])
        expect(rp.seam_joints.find(s => s.seam_key === k)?.joint_type_id).toBe('shelf')
    })

    // "we only need one row … it should sit in the middle of the edge length"
    it(`${side} hand: a centred single-row back joint drills one hole mid-edge on each back`, () => {
      const centre = [{ ...op('centre', 50, { offset_z_mm: 'D / 2', offset_y_mm: 'T / 2' }), qty: 1, spacing_mm: null }]
      const c = lCorner(side)
      const rp = resolveCabinet({
        ...c, joint_defaults: { ...defaults, 'adj_shelf:back': 'centre' },
        joint_type_ops: { ...ops, centre }, joint_type_names: { ...c.joint_type_names, centre: 'Centre' },
      })
      const onBacks = cabinetSeamDrills(rp).filter(q => q.seamKey.startsWith('int_') && q.targetPartKey.startsWith('back'))
      expect(onBacks.map(d => d.targetPartKey).sort()).toEqual(['back', 'back:back2'])
      // Mid-way along the edge the shelf shares with the back: 900 box → 450.
      // back:back2's edge stops the adj shelf's 1 mm pin clearance short of the
      // return leg's end panel, so its middle sits 0.5 nearer the back.
      for (const d of onBacks) {
        expect(d.targetPartKey === 'back' ? d.x : d.z).toBeCloseTo(d.targetPartKey === 'back' ? 450 : 449.5, 2)
      }
    })
  }

  // Mark, 2026-10-15: "extend the top rail through to the back of the cabinet
  // … less back.t" — not just past the pie corner.
  for (const side of ['right', 'left'] as const) for (const orient of ['vertical', 'horizontal'] as const) {
    it(`${side} hand, ${orient}: the through rail runs from the end panel to the other leg's back`, () => {
      const rp = resolveCabinet(lCorner(side, orient))
      const through = rp.case_parts.find(p => p.part_key === (side === 'right' ? 'rail:front' : 'rail:front2'))!
      const butt = rp.case_parts.find(p => p.part_key === (side === 'right' ? 'rail:front2' : 'rail:front'))!
      expect(through.DY).toBeCloseTo(900 - 18 - 18, 3)   // end panel inside face → back inside face
      expect(butt.DY).toBeCloseTo(900 - 560 - 18, 3)
    })
  }

  it('a plain box gets exactly the legacy seams', () => {
    const keys = resolveCabinet(cab({ DZ: 580 })).seam_joints.map(s => s.seam_key)
    expect(keys.some(k => k.includes('|'))).toBe(false)
    expect(keys).toContain('bottom:left_side')
  })
})
