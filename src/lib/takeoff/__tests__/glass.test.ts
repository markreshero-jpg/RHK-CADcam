import { describe, it, expect } from 'vitest'
import { buildGlassPanes, glassSizeLines, type GlassSet } from '../glass'
import type { ResolvedCabinet } from '../../resolver/types'

const set: GlassSet = { id: 'gs', name: 'Glass Door', thickness: 6, clearance: 1.5, ring: { top: -15.9, bottom: -15.9, left: -15.9, right: -15.9 } }
const zone = (r: number, c: number, DX: number, DY: number, toolSet: string | null, over: Record<string, number | null> = {}) => ({
  row_index: r, col_index: c, DX, DY, DZ: 18,
  door_profile: { profile_type: 'custom', ops: [{ operation_type: 'pocket', depth_mm: 6.35, width_mm: null, offset_from_edge_mm: 60, repeat_axis: 'none', spacing_mm: null,
    face: 'back', router_tool_id: null, tool_set_id: toolSet, offset_top_mm: null, offset_bottom_mm: null, offset_left_mm: null, offset_right_mm: null, ...over }] },
})
const cab = (zones: unknown[]) => ({ face_zones: zones, case_parts: [], box_parts: [], interior_parts: [] }) as unknown as ResolvedCabinet

describe('glass order', () => {
  const resolved = new Map([['c1', cab([zone(0, 0, 450, 720, 'gs'), zone(0, 1, 450, 720, 'gs')])], ['c2', cab([zone(0, 0, 600, 720, 'other')])]])
  const cabs = [{ id: 'c1', room_id: 'r', label: 'W-01' }, { id: 'c2', room_id: 'r', label: 'W-02' }]
  const panes = buildGlassPanes(cabs, resolved, new Map([['gs', set]]))

  it('glass = opening + rebate both sides − 2 × clearance', () => {
    // 450 − 120 = 330 opening; + 31.8 rebate = 361.8; − 3 = 358.8
    expect(panes[0]).toMatchObject({ openW: 330, openH: 600, glassW: 358.8, glassH: 628.8, thickness: 6, door: 'Door r1 c1' })
  })
  it('only fronts that use a glass tool set', () => {
    expect(panes).toHaveLength(2)
    expect(panes.every(p => p.cabinetLabel === 'W-01')).toBe(true)
  })
  it('per-edge frame offsets win over the edge offset', () => {
    const p = buildGlassPanes([cabs[0]], new Map([['c1', cab([zone(0, 0, 450, 720, 'gs', { offset_bottom_mm: 100 })])]]), new Map([['gs', set]]))
    expect(p[0].openH).toBe(560)
  })
  it('groups identical panes for the glazier', () => {
    expect(glassSizeLines(panes)).toEqual([{ type: 'Glass', glassW: 358.8, glassH: 628.8, thickness: 6, qty: 2, cabinets: ['W-01'] }])
  })
  it('faced doors (z_faced_doors) order their facing at the door size', () => {
    const mirror = { row_index: 0, col_index: 0, DX: 513.5, DY: 2259, DZ: 16.5, facing: { name: '4mm Mirror', thickness_mm: 4 } }
    const p = buildGlassPanes([{ id: 'm', room_id: 'r', label: 'TC-01' }], new Map([['m', cab([mirror, { ...mirror, col_index: 1 }])]]), new Map())
    expect(p).toHaveLength(2)
    expect(p[0]).toMatchObject({ type: '4mm Mirror', glassW: 513.5, glassH: 2259, thickness: 4, door: 'Door r1 c1' })
    expect(glassSizeLines(p)).toEqual([{ type: '4mm Mirror', glassW: 513.5, glassH: 2259, thickness: 4, qty: 2, cabinets: ['TC-01'] }])
  })
})
