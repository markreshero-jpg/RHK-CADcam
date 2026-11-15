import { describe, it, expect } from 'vitest'
import { splashbackSupplyLines } from '../splashbackSupply'
import { rectSegments } from '../splashbackGeometry'
import type { SplashbackInstance, Wall } from '../types'

const wall = { id: 'w1', room_id: 'r1', name: 'Wall 1', pos_x: 0, pos_y: 0, angle: 0, length: 4000, thickness: 90, height: 2700, wall_type: 'standard' } as unknown as Wall
// Second wall so the room centroid sits off wall 1 (the face side).
const wall2 = { ...wall, id: 'w2', pos_y: 3000 } as unknown as Wall

const sb = (id: string, over: Partial<SplashbackInstance> = {}): SplashbackInstance => ({
  id, room_id: 'r1', label: id, wall_id: 'w1', wall_side: 'face',
  segments: rectSegments({ x0: 0, x1: 3000, z0: 920, z1: 1620 }),
  cutouts: [], offset_mm: 0, thickness_mm: null, opening_reveal_mm: 0, splashback_schedule_id: null, notes: null,
  ...over,
} as SplashbackInstance)

describe('splashback supply lines', () => {
  it('a surface piece is one order line with its size and area', () => {
    const lines = splashbackSupplyLines([sb('Splashback 1')], () => ({ name: 'SNB Arabescato', thick: 20, isBoard: false }), [wall, wall2], [])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ role: 'splashback', length: 3000, width: 700, thickness: 20, material: 'SNB Arabescato', area_m2: 2.1, outline: null, cutouts: [] })
  })

  it('board splashbacks are cut parts — not on the supply sheet', () => {
    expect(splashbackSupplyLines([sb('a')], () => ({ name: 'Whiteboard', thick: 16.5, isBoard: true }), [wall, wall2], [])).toEqual([])
  })

  it('joints split the piece; cut-outs go to the piece they sit in', () => {
    const lines = splashbackSupplyLines([sb('S', {
      joints: [1800],
      cutouts: [{ id: 'g', kind: 'gpo', x: 200, y: 100, w: 125, h: 70 }, { id: 'r', kind: 'round', x: 2500, y: 300, w: 35, h: 35 }],
    })], () => ({ name: 'Stone', thick: 20, isBoard: false }), [wall, wall2], [])
    expect(lines.map(l => [l.piece, l.length, l.width])).toEqual([[1, 1800, 700], [2, 1200, 700]])
    expect(lines[0].cutouts).toEqual([{ w: 125, h: 70, round: false }])
    expect(lines[1].cutouts).toEqual([{ w: 35, h: 35, round: true }])
    expect(lines[0].joins).toEqual([{ type: 'butt', length: 700 }])
    expect(lines[0].area_m2).toBeCloseTo((1800 * 700 - 125 * 70) / 1e6, 2)
  })

  it('a wrap-round return: its own line, and the main piece runs on to the outer corner', () => {
    const lines = splashbackSupplyLines([sb('S', { returns: [{ end: 'right', dir: 'back', length_mm: 110, join: 'mitre' }] })],
      () => ({ name: 'Stone', thick: 20, isBoard: false }), [wall, wall2], [])
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ length: 3020, width: 700, joins: [{ type: 'mitre', length: 700 }] })
    expect(lines[1]).toMatchObject({ label: 'Return – right end', length: 700, width: 110, joins: [{ type: 'mitre', length: 700 }] })
  })
})
