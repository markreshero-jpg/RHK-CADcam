import { describe, it, expect } from 'vitest'
import { declutterPlanLabels } from '../labelDeclutter'
import type { Wall, CabinetInstance } from '../types'

// Plan label declutter (Mark 2026-11-20): WUP under panel name over the WC name.
const wall = (id: string, x: number, y: number, angle: number, length: number): Wall => ({
  id, room_id: 'r', name: id, sort_order: 0, length, height: null, soffit_height: null,
  angle, pos_x: x, pos_y: y, thickness: 90, wall_type: 'standard', created_at: '',
})
const ROOM = [wall('W1', 0, 0, 0, 3000), wall('W2', 3000, 0, 90, 3000), wall('W3', 3000, 3000, 180, 3000), wall('W4', 0, 3000, 270, 3000)]
const cab = (id: string, label: string, x: number, dx: number, dz: number, extra: Partial<CabinetInstance> = {}) =>
  ({ id, label, wall_id: 'W1', pos_x: x, pos_y: 0, dx, dz, dy: 700, rotation: 0, footprint: null, assembly_class: 'wall', ...extra }) as unknown as CabinetInstance

describe('declutterPlanLabels', () => {
  it('moves the WC name back toward the wall, leaves the under panel', () => {
    const wc = cab('wc', 'WC-01', 600, 600, 300)
    const up = cab('up', 'WUP-01', 0, 1800, 280, { rule_overrides: { UNDER_PANEL: true } } as Partial<CabinetInstance>)
    const moves = declutterPlanLabels([wc, up], ROOM, { scale: 20 })
    expect(moves.map(m => m.id)).toEqual(['wc'])
    expect(moves[0].off.x).toBe(0)
    expect(moves[0].off.y).toBeLessThan(0)                // toward the wall
    expect(150 + moves[0].off.y).toBeGreaterThan(0)       // still inside the 300 deep cabinet
    expect(moves[0].clear).toBe(true)
  })
  it('leaves names that do not touch, and hand-moved names', () => {
    const a = cab('a', 'WC-01', 0, 600, 300), b = cab('b', 'WC-02', 1200, 600, 300)
    expect(declutterPlanLabels([a, b], ROOM)).toEqual([])
    const wc = cab('wc', 'WC-01', 600, 600, 300, { label_offsets: { plan: { x: 0, y: 40 } } })
    const up = cab('up', 'WUP-01', 0, 1800, 280, { rule_overrides: { UNDER_PANEL: true } } as Partial<CabinetInstance>)
    expect(declutterPlanLabels([wc, up], ROOM)).toEqual([])
  })
})
