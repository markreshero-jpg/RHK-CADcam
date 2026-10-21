import { describe, it, expect } from 'vitest'
import { autoShots, wallsBehindEye, shotsPerSheet } from '../shopDrawings/shots3d'
import type { Wall, CabinetInstance } from '../types'

// z_shop_drawings S8: auto 3D shots — each run, islands both sides, dollhouse
// cut-away, blockers out on the floor hidden.
const wall = (id: string, x: number, y: number, angle: number, length: number, wall_type: Wall['wall_type'] = 'standard'): Wall => ({
  id, room_id: 'r', name: id, sort_order: 0, length, height: null, soffit_height: null,
  angle, pos_x: x, pos_y: y, thickness: wall_type === 'island' ? 0 : 90, wall_type, created_at: '',
})
// 4000 x 3000 room, walls on the inside faces, drawn clockwise from the top-left.
const ROOM = [wall('W1', 0, 0, 0, 4000), wall('W2', 4000, 0, 90, 3000), wall('W3', 4000, 3000, 180, 4000), wall('W4', 0, 3000, 270, 3000)]
let n = 0
const cab = (w: Wall, along: number, dx: number, extra: Partial<CabinetInstance> = {}) => {
  // Back-left corner on the wall line, facing into the room (rotation = wall angle).
  const a = w.angle * Math.PI / 180
  return { id: `c${n++}`, wall_id: w.id, pos_x: w.pos_x + Math.cos(a) * along, pos_y: w.pos_y + Math.sin(a) * along,
    dx, dz: 580, dy: 870, rotation: w.angle, footprint: null, assembly_class: 'base', ...extra } as unknown as CabinetInstance
}
const [W1, W2] = ROOM

describe('auto 3D shots', () => {
  it('one shot per run, the longest run first, opposite walls hidden', () => {
    const shots = autoShots(ROOM, [cab(W2, 0, 600), cab(W1, 0, 900), cab(W1, 900, 900)], 2400)
    expect(shots.map(s => s.label)).toEqual(['W1', 'W2'])
    const [s1] = shots
    expect(s1.eye[2]).toBeGreaterThan(3000)        // out past W3
    expect(s1.eye[1]).toBeGreaterThan(s1.target[1]) // raised
    expect(s1.hiddenWallIds).toContain('W3')
    expect(s1.hiddenWallIds).not.toContain('W1')
  })

  it('an island gets a shot from each side', () => {
    const isl = wall('I1', 1200, 1500, 0, 1800, 'island')
    const shots = autoShots([...ROOM, isl], [cab(W1, 0, 1800), cab(isl, 0, 1800)], 2400)
    const islShots = shots.filter(s => s.id.startsWith('isl-'))
    expect(islShots.map(s => s.label)).toEqual(['I1 front', 'I1 back'])
    // The two eyes are on opposite sides of the island line (z = 1500).
    expect(Math.sign(islShots[0].eye[2] - 1500)).toBe(-Math.sign(islShots[1].eye[2] - 1500))
  })

  it('an island standing between the camera and a run is hidden for that shot', () => {
    // Island across the middle of the room, in front of the W1 run.
    const isl = wall('I1', 1100, 1700, 0, 1800, 'island')
    const shots = autoShots([...ROOM, isl], [cab(W1, 0, 1800), cab(W1, 1800, 1800), cab(isl, 0, 1800)], 2400)
    const run = shots.find(s => s.label === 'W1')!
    expect(run.hiddenWallIds).toContain('I1')
  })

  it('corner units beside the run are not treated as blockers', () => {
    const shots = autoShots(ROOM, [cab(W1, 0, 2400), cab(W2, 0, 600)], 2400)
    const run = shots.find(s => s.label === 'W1')!
    expect(run.hiddenCabinetIds).toEqual([])
  })

  it('an eye inside the room hides nothing', () => {
    expect(wallsBehindEye(ROOM, 2000, 1500)).toEqual([])
  })

  it('no walls → no shots; walls but no cabinets → one view of the longest wall', () => {
    expect(autoShots([], [], 2400)).toEqual([])
    expect(autoShots(ROOM, [], 2400).map(s => s.label)).toEqual(['W1'])
  })

  it('views per sheet: 4 in a small room (< 2000mm), else 2', () => {
    expect(shotsPerSheet(ROOM)).toBe(2)
    expect(shotsPerSheet([wall('V1', 0, 0, 0, 1800), wall('V2', 1800, 0, 90, 1500)])).toBe(4)
  })
})
