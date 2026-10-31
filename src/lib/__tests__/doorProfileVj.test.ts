// VJ line layout cascade (z_doorFace_module): mergeVjLayout + vjLinePositions
// and the lines doorProfileCuts emits for a vj_lines profile.

import { describe, it, expect } from 'vitest'
import { mergeVjLayout, vjLinePositions, doorProfileCuts } from '../doorProfile'
import type { ResolvedDoorProfile, ResolvedProfileOp } from '../resolver/types'

const op: ResolvedProfileOp = {
  operation_type: 'route', depth_mm: 5, width_mm: 6, offset_from_edge_mm: 0,
  repeat_axis: 'x', spacing_mm: 100, face: 'front', router_tool_id: null, tool_set_id: null,
  offset_top_mm: null, offset_bottom_mm: null, offset_left_mm: null, offset_right_mm: null,
}
const vjProfile = (vj?: ResolvedDoorProfile['vj']): ResolvedDoorProfile => ({ profile_type: 'vj_lines', ops: [op], vj })
const xs = (p: ResolvedDoorProfile, w = 600, h = 700) =>
  doorProfileCuts(p, { w, h, thickness: 18 }).map(c => (c.kind === 'groove' ? Math.round(c.x1 * 100) / 100 : NaN))

describe('vjLinePositions', () => {
  it('spacing only: full boards, leftover split to the end boards (centred)', () => {
    expect(vjLinePositions(600, 0, { spacing: 100 })).toEqual([100, 200, 300, 400, 500])
    // 650: 6 boards fit → 5 lines, end boards 125
    expect(vjLinePositions(650, 0, { spacing: 100 })).toEqual([125, 225, 325, 425, 525])
  })
  it('qty only: equal boards', () => {
    expect(vjLinePositions(600, 0, { qty: 3 })).toEqual([150, 300, 450])
    expect(vjLinePositions(600, 50, { qty: 4 })).toEqual([150, 250, 350, 450])
  })
  it('qty + spacing: that many lines at that spacing, centred', () => {
    expect(vjLinePositions(600, 0, { qty: 3, spacing: 80 })).toEqual([220, 300, 380])
    expect(vjLinePositions(600, 0, { qty: 1, spacing: 80 })).toEqual([300])
  })
  it('drops lines that would fall outside the edge gaps', () => {
    expect(vjLinePositions(300, 50, { qty: 5, spacing: 100 })).toEqual([150])
  })
  it('null when neither qty nor spacing is set', () => {
    expect(vjLinePositions(600, 0, { edge_gap: 10 })).toBeNull()
  })
})

describe('mergeVjLayout', () => {
  it('null when nothing is set anywhere', () => {
    expect(mergeVjLayout(null, undefined, {})).toBeNull()
  })
  it('qty + spacing inherit as a pair — the lowest level that sets either wins both', () => {
    expect(mergeVjLayout({ spacing: 100 }, { qty: 5 })).toEqual({ qty: 5, spacing: null, edge_gap: null, direction: null })
  })
  it('edge gap and direction inherit key by key', () => {
    expect(mergeVjLayout({ spacing: 100, direction: 'horizontal' }, { edge_gap: 20 }, { qty: 4, spacing: 90 }))
      .toEqual({ qty: 4, spacing: 90, edge_gap: 20, direction: 'horizontal' })
  })
})

describe('doorProfileCuts with a VJ layout', () => {
  it('no layout = the profile op (unchanged behaviour)', () => {
    expect(xs(vjProfile())).toEqual([100, 200, 300, 400, 500])
    expect(xs(vjProfile(), 650)).toEqual([100, 200, 300, 400, 500, 600])
  })
  it('layout replaces the op spacing', () => {
    expect(xs(vjProfile({ qty: 2 }))).toEqual([200, 400])
  })
  it('horizontal direction runs lines across the door', () => {
    const cuts = doorProfileCuts(vjProfile({ qty: 1, direction: 'horizontal' }), { w: 600, h: 700, thickness: 18 })
    expect(cuts).toHaveLength(1)
    expect(cuts[0]).toMatchObject({ kind: 'groove', x1: 0, x2: 600, y1: 350, y2: 350 })
  })
  it('ignores the layout on non-VJ profiles', () => {
    const p: ResolvedDoorProfile = { profile_type: 'custom', ops: [op], vj: { qty: 2 } }
    expect(xs(p)).toEqual([100, 200, 300, 400, 500])
  })
})
