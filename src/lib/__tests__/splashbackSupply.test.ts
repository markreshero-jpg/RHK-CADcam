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
})
