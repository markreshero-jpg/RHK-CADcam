import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type HandleProductInput, type ResolvedCasePart } from '../types'
import { buildPresetFootprint } from '../../cabinetShape/presets'
import { caseBoxAABB, rotEulerXYZ } from '../../jointDrilling'
import { collectDrillRows, collectNotchRoutes } from '../../optimiser/seamDrillSync'

// Mark, 2026-10-15 (BCNP with a finger pull): "the gables don't get checked
// out nor set back to allow for backing rail".
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const shark: HandleProductInput = {
  id: 'sn', name: 'Sharknose', grip_kind: 'sharknose', handle_type: 'other', length: null, bore_centres: null, projection: null,
  cost_per_unit: null, hole_dia_mm: null, holes: [], needs_finger_gap: true, bevel_angle_deg: 45, bevel_land_mm: 2,
}
const grip = { handle: shark, offset_from_edge_mm: 50, inset_from_side_mm: null, orientation: 'vertical' as const }
const lCorner = (side: 'right' | 'left', orient: 'vertical' | 'horizontal' = 'horizontal'): CabinetInput => ({
  id: 'c1', assembly_class: 'base_corner', DX: 900, DY: 870, DZ: 900,
  has_carcass: true, has_internal: false, has_face: true, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, { RAIL_ORIENT: orient }), top_type: 'front_rail',
  face_grid: { rows: [{ row_index: 0, height_locked: false }], cols: [{ col_index: 0, width_locked: false }],
    zones: [{ row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'right' }] },
  internal_tree: { type: 'open', fittings: [] },
  handle_schedule: { door_base: grip, door_wall: grip, door_tall: grip, drawer: grip },
  footprint: buildPresetFootprint('l_corner', { leg_back: 560, leg_side: 560, side }, { w: 900, d: 900 }),
})
const rails = (ps: ResolvedCasePart[]) => ps.filter(p => p.part_key.startsWith('fprail:'))
const end = (side: 'right' | 'left') => side === 'right' ? 'right_side' : 'left_side'

describe('L corner finger-pull backing rails', () => {
  for (const side of ['right', 'left'] as const) {
    it(`${side} hand: one rail per facet, 40 tall at the carcass top; one runs through the corner, one butts`, () => {
      const rs = rails(resolveCabinet(lCorner(side)).case_parts)
      expect(rs).toHaveLength(2)
      for (const r of rs) {
        expect(r.Y + r.DX).toBeCloseTo(870)
        expect(r.DX).toBeCloseTo(40)
        expect(r.DZ).toBe(18)
      }
      // End panel outer face → past the pie corner by the other rail (900 − 560 + 18),
      // and end panel outer face → the corner (900 − 560).
      expect(rs.map(r => r.DY).sort()).toEqual([340, 358])
    })

    it(`${side} hand: both end panels are notched at their front edge, rail thick × rail tall, open at the top`, () => {
      const rp = resolveCabinet(lCorner(side))
      const box = rp.case_parts.find(p => p.part_key === end(side))!
      const e2 = rp.case_parts.find(p => p.part_key === 'side:end2')!
      // Box side (side frame: x = depth from the back, front at 560).
      expect(box.outline).toEqual(expect.arrayContaining([{ x: 542, y: 0 }, { x: 542, y: 30 }, { x: 560, y: 40 }]))
      // Turned end panel (face frame): the notch at whichever end is on the facet.
      const xs = e2.outline!.filter(q => q.y === 0).map(q => q.x).sort((a, b) => a - b)
      expect(side === 'right' ? xs : xs.map(x => 560 - x).sort((a, b) => a - b)).toEqual([18, 560])
    })

    for (const orient of ['horizontal', 'vertical'] as const) {
      it(`${side} hand, ${orient} top rails: the top rails are pushed back clear of the backing rails`, () => {
        const parts = resolveCabinet(lCorner(side, orient)).case_parts
        const tops = parts.filter(p => p.part_key.startsWith('rail:'))
        expect(tops).toHaveLength(2)
        for (const a of rails(parts)) for (const b of tops) {
          const A = caseBoxAABB(a), B = caseBoxAABB(b)
          const ov = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0)
          const hit = ov(A.x, A.x + A.w, B.x, B.x + B.w) > 0.01 && ov(A.y, A.y + A.h, B.y, B.y + B.h) > 0.01 && ov(A.z, A.z + A.d, B.z, B.z + B.d) > 0.01
          expect(hit, `${a.part_key} ↔ ${b.part_key}`).toBe(false)
        }
        // The butting top rail still reaches the through one (340 = 322 + 18).
        expect(tops.map(p => p.DY).sort()).toEqual([340, 864])
      })
    }

    it(`${side} hand: CNC — a knock-in block in each end panel, notch pockets in both`, () => {
      const rp = resolveCabinet(lCorner(side))
      const blocks = collectDrillRows(rp, 'c1').rows.filter(r => r.parameters.kind === 'fprail_block')
      expect(blocks.map(b => b.source_part_key).sort()).toEqual([`case_${end(side)}`, 'case_side:end2'].sort())
      for (const b of blocks) expect(b.diameter).toBe(10)
      const routes = collectNotchRoutes(rp, 'c1', 'tool10').rows
      const notch = (k: string) => routes.find(r => r.source_part_key === k && r.parameters.kind === 'fprail_notch' && r.operation_key.startsWith('fprail_notch'))!
      // Box side frame: u = depth (rail 18 + 5 run-out), v = height (40 + 5 out the top).
      expect([notch(`case_${end(side)}`).size_dx, notch(`case_${end(side)}`).size_dy]).toEqual([23, 45])
      // Face frame: u = height, v = length along the panel.
      const n2 = notch('case_side:end2')
      expect([n2.size_dx, n2.size_dy]).toEqual([45, 23])
      expect(n2.pos_x).toBeCloseTo(870 - 40 / 2 + 5 / 2)
      // Each panel: one closed-end relief (the notch runs out the top).
      expect(routes.filter(r => r.operation_key.startsWith('fprail_relief'))).toHaveLength(2)
    })
  }

  // "finger pull rail is showing a different colour on corner cabinet" — 3D
  // paints a face-kind part's +Z face in the door colour, so like the box rails
  // local +Z must face the front.
  it('right hand: each rail’s +Z face is its front face, on the facet line', () => {
    for (const r of rails(resolveCabinet(lCorner('right')).case_parts)) {
      const at = (lz: number) => { const [x, , z] = rotEulerXYZ(0, r.AY, 0, r.DY / 2, 0, lz); return { x: r.X + x, z: r.Z + z } }
      const front = at(r.DZ), back = at(0)
      // front facet z = 560 (x 560…900), front2 x = 560 (z 560…900); the back one thickness in.
      if (Math.abs(front.z - 560) < 0.01) expect(back.z).toBeCloseTo(542)
      else { expect(front.x).toBeCloseTo(560); expect(back.x).toBeCloseTo(542) }
    }
  })

  it('a plain box with the same doors is unchanged (no shaped rails)', () => {
    const c = lCorner('right')
    const rp = resolveCabinet({ ...c, footprint: undefined, DZ: 560 })
    expect(rails(rp.case_parts).every(r => !r.fprail?.shaped)).toBe(true)
  })
})
