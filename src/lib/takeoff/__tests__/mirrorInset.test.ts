// z_faced_doors F6 — inset mirror door: the pane rides on the profile op (from the
// glass-recipe tool set) and the Glass Order lists it under the set's pane type.
import { describe, it, expect } from 'vitest'
import { doorPaneRects } from '../../doorProfile'
import { buildGlassPanes, type GlassSet } from '../glass'
import type { ResolvedCabinet, ResolvedDoorProfile } from '../../resolver/types'

const profile: ResolvedDoorProfile = {
  profile_type: 'custom',
  ops: [{
    operation_type: 'pocket', depth_mm: 6.35, width_mm: null, offset_from_edge_mm: 60,
    repeat_axis: 'none', spacing_mm: null, face: 'back', tool_set_id: 'mset',
    offset_bottom_mm: 100, pane: { type: '4mm Mirror', thickness_mm: 4 },
  }],
}

describe('mirror inset door', () => {
  it('pane = door − frame offsets, flagged mirror', () => {
    const [p] = doorPaneRects(profile, { w: 330, h: 2400 })
    expect(p).toMatchObject({ x: 60, y: 100, w: 210, h: 2240, mirror: true, thickness_mm: 4 })
  })

  it('rebate + order size from the tool set rebate (F8, RHK6583 TC-02 door)', () => {
    const op = { ...profile.ops[0], offset_top_mm: 420, pane: { type: '4mm Mirror', thickness_mm: 4, clearance_mm: 1.5, rebate: { top: 8, bottom: 8, left: 8, right: 8, depth: 6 } } }
    const [p] = doorPaneRects({ ...profile, ops: [op] }, { w: 314.5, h: 2420 })
    expect(p).toMatchObject({ x: 60, y: 100, w: 194.5, h: 1900 })
    expect(p.rebate).toEqual({ x: 52, y: 92, w: 210.5, h: 1916, depth: 6 })
    expect(p.glass).toEqual({ x: 53.5, y: 93.5, w: 207.5, h: 1913 })
  })

  it('no pane on a profile without a glass recipe', () => {
    const plain = { ...profile, ops: [{ ...profile.ops[0], pane: null }] }
    expect(doorPaneRects(plain, { w: 330, h: 2400 })).toEqual([])
  })

  it('Glass Order uses the tool set pane type', () => {
    const set: GlassSet = { id: 'mset', name: 'Mirror Door', thickness: 4, clearance: 1.5, type: '4mm Mirror',
      ring: { top: -15.9, bottom: -15.9, left: -15.9, right: -15.9 } }
    const cab = { face_zones: [{ row_index: 0, col_index: 0, DX: 330, DY: 2400, door_profile: profile }], parts: [] } as unknown as ResolvedCabinet
    const panes = buildGlassPanes([{ id: 'c', room_id: 'r', label: 'TC-02' }], new Map([['c', cab]]), new Map([['mset', set]]))
    expect(panes).toHaveLength(1)
    expect(panes[0]).toMatchObject({ type: '4mm Mirror', openW: 210, openH: 2240, glassW: 238.8, glassH: 2268.8, thickness: 4 })
  })
})
