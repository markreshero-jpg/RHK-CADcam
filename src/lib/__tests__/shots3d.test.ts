import { describe, it, expect } from 'vitest'
import { autoShots, wallsBehindEye } from '../shopDrawings/shots3d'
import type { Wall, CabinetInstance } from '../types'

// z_shop_drawings S8 stage 1: one auto shot of the main run, dollhouse cut-away.
const wall = (id: string, x: number, y: number, angle: number, length: number): Wall => ({
  id, room_id: 'r', name: id, sort_order: 0, length, height: null, soffit_height: null,
  angle, pos_x: x, pos_y: y, thickness: 90, wall_type: 'standard', created_at: '',
})
// 4000 x 3000 room, walls on the inside faces, drawn clockwise from the top-left.
const ROOM = [wall('W1', 0, 0, 0, 4000), wall('W2', 4000, 0, 90, 3000), wall('W3', 4000, 3000, 180, 4000), wall('W4', 0, 3000, 270, 3000)]
const cab = (wallId: string, dx: number) => ({ id: `${wallId}-${dx}`, wall_id: wallId, dx }) as unknown as CabinetInstance

describe('auto 3D shots', () => {
  it('aims at the wall with the most cabinet run and hides the wall opposite', () => {
    const [s] = autoShots(ROOM, [cab('W2', 600), cab('W1', 900), cab('W1', 900)], 2400)
    expect(s.label).toBe('W1')
    // Target in front of W1 (y = 0 → z), the eye well out past W3 (z > 3000), raised.
    expect(s.target[2]).toBeGreaterThan(0)
    expect(s.eye[2]).toBeGreaterThan(3000)
    expect(s.eye[1]).toBeGreaterThan(s.target[1])
    expect(s.hiddenWallIds).toContain('W3')
    expect(s.hiddenWallIds).not.toContain('W1')
  })

  it('an eye inside the room hides nothing', () => {
    expect(wallsBehindEye(ROOM, 2000, 1500)).toEqual([])
  })

  it('no standard walls → no shots', () => {
    expect(autoShots([], [], 2400)).toEqual([])
  })
})
