import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type JointTypeOp, type Material } from '../types'
import { buildPresetFootprint, presetBox } from '../../cabinetShape/presets'
import { caseBox, intoPartFrame, cabinetSeamDrills, casePlanCorners, isSide } from '../../jointDrilling'
import { signedArea, clipToConvex } from '../../cabinetShape/construct'
import { isShapedPanelKey } from '../../cabinetShape/partKeys'

// z_angled_filler (Mark, 2026-10-15): backs mitre 22.5° each, construction
// holes on the angled panels, kick spreaders reach the sub front.
const board: Material = { id: 'm16', name: 'Board 16', DZ: 16, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const op = (id: string, part: 'part_a' | 'part_b', offZ: number, ex: Record<string, string>): JointTypeOp => ({
  id: `${id}_${part}`, joint_type_id: id, operation_order: part === 'part_a' ? 0 : 1, target_part: part, machine_operation: 'drill', face: 'normal',
  tool_diameter_mm: 5, depth_mm: 12, offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: offZ,
  qty: 2, spacing_mm: null, qty2: 1, spacing2_mm: null, router_tool_id: null, drill_id: null, auto_tool: false, notes: null,
  expressions: ex,
})
// The shop's dynamic screw holes (part B face only), and a dowel (both parts).
const dynEx = { qty: 'Math.ceil((D - 100) / 280) + 1', depth_mm: 'T', spacing_mm: '(D - 100) / Math.ceil((D - 100) / 280)', offset_y_mm: 'T / 2' }
const OPS = {
  dyn:   [op('dyn', 'part_b', 50, dynEx)],
  dowel: [op('dowel', 'part_a', 50, { ...dynEx, depth_mm: '30' }), op('dowel', 'part_b', 50, dynEx)],
}
const defaults = (j: 'dyn' | 'dowel') => Object.fromEntries(
  ['bottom:left_side', 'bottom:right_side', 'full_top:left_side', 'full_top:right_side', 'back:left_side', 'back:right_side', 'back:bottom'].map(k => [k, j]))

function filler(side: 'left' | 'right', joint: 'dyn' | 'dowel' = 'dyn', o: Partial<CabinetInput> = {}): CabinetInput {
  const fp = buildPresetFootprint('angled_filler', { side }, { w: 0, d: 0 })!
  const box = presetBox(fp)!
  return {
    id: 'c1', assembly_class: 'base', DX: box.w, DY: 870, DZ: box.d,
    has_carcass: true, has_internal: false, has_face: true, has_toekick: true,
    left_neighbour: 'cabinet', right_neighbour: 'cabinet', exposed_interior: false,
    material: board, door_material: { ...board, id: 'd18', DZ: 18 }, shelf_material: board, exposed_material: board,
    toekick_face_material: board, toekick_interior_material: board,
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, { TOP_TYPE: 'full_top', ANGLE_JOIN: 'mitre' }),
    face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] }, footprint: fp,
    joint_defaults: defaults(joint), joint_type_ops: OPS, joint_type_names: { dyn: 'Dyn', dowel: 'Dowel' },
    ...o,
  } as CabinetInput
}

const AXIS = { 'x+': [1, 0, 0], 'x-': [-1, 0, 0], 'y+': [0, 1, 0], 'y-': [0, -1, 0], 'z+': [0, 0, 1], 'z-': [0, 0, -1] } as const

describe('angled filler carcass', () => {
  for (const side of ['right', 'left'] as const) {
    it(`${side} hand: backs mitre 22.5° each and don't overlap`, () => {
      const rp = resolveCabinet(filler(side))
      const backs = rp.case_parts.filter(p => p.part_key === 'back' || p.part_key === 'back:back2')
      expect(backs).toHaveLength(2)
      for (const b of backs) expect([b.bevel_lo ?? 0, b.bevel_hi ?? 0].filter(Boolean)).toEqual([22.5])
      const panels = rp.case_parts.filter(p => isSide(p.part_key) || p.part_key === 'back' || isShapedPanelKey(p.part_key))
        .map(p => ({ k: p.part_key, pts: casePlanCorners(p).map(q => ({ x: q.x, y: q.z })) }))
      for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++)
        expect(Math.abs(signedArea(clipToConvex(panels[i].pts, panels[j].pts))), `${panels[i].k} × ${panels[j].k}`).toBeLessThan(0.5)
    })

    it(`${side} hand: the angled side and back get their construction seams`, () => {
      const keys = resolveCabinet(filler(side)).seam_joints.map(s => s.seam_key)
      for (const k of ['bottom|side:side_b', 'full_top|side:side_b', 'back:back2|side:side_b', 'back:back2|bottom'])
        expect(keys, k).toContain(k)
    })

    for (const joint of ['dyn', 'dowel'] as const) {
      it(`${side} hand, ${joint}: every hole enters its part through a face and bores into it`, () => {
        const rp = resolveCabinet(filler(side, joint))
        const drills = cabinetSeamDrills(rp)
        const onB = drills.filter(d => d.targetPartKey === 'side:side_b')
        expect(onB.length).toBeGreaterThanOrEqual(6)       // bottom, top, back2 into the angled side
        for (const d of drills) {
          const cp = rp.case_parts.find(p => p.part_key === d.targetPartKey)!
          expect(cp, d.targetPartKey).toBeTruthy()
          const local = cp.AY ? intoPartFrame(cp, d) : d
          const b = caseBox(cp)
          const inside = (q: { x: number; y: number; z: number }, tol: number) =>
            q.x >= b.x - tol && q.x <= b.x + b.w + tol && q.y >= b.y - tol && q.y <= b.y + b.h + tol && q.z >= b.z - tol && q.z <= b.z + b.d + tol
          const v = AXIS[local.axis]
          const deeper = { x: local.x + v[0] * 2, y: local.y + v[1] * 2, z: local.z + v[2] * 2 }
          expect(inside(local, 0.5), `${d.seamKey} → ${d.targetPartKey} entry`).toBe(true)
          expect(inside(deeper, 0.01), `${d.seamKey} → ${d.targetPartKey} bores out`).toBe(true)
        }
        // No bore into the bottom / top edge along the angled side (it would be
        // at 45° to their sheet edges): only the side's face holes there.
        const angledEdge = drills.filter(d => /\|side:side_b$/.test(d.seamKey) && (d.targetPartKey === 'bottom' || d.targetPartKey === 'full_top'))
        expect(angledEdge).toEqual([])
      })
    }
  }

  it('kick end spreaders reach the sub front', () => {
    const rp = resolveCabinet(filler('right'))
    const spr = rp.toekick_parts.filter(p => p.part_key === 'spreader_vertical')
    expect(spr).toHaveLength(2)
    // kick back TI + spreader + sub front TI + kick face TF + TOESCF = the leg depth (580)
    for (const s of spr) expect(16 + s.DZ + 16 + 16 + 40).toBeCloseTo(580, 3)
  })
})
