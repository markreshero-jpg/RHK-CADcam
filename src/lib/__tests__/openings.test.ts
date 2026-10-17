import { describe, it, expect } from 'vitest'
import type { Wall, RoomFixture } from '../types'
import { centroid, wallPieces, wallSpanQuad } from '../geometry'
import { snapOpening, openingSpans, openingOnWall, refitOpenings } from '../fixtureGeometry'

// 4000 × 3000 room drawn clockwise in SVG coords (y down), 100 thick walls.
const mk = (id: string, x: number, y: number, angle: number, length: number, extra: Partial<Wall> = {}): Wall => ({
  id, room_id: 'r', pos_x: x, pos_y: y, angle, length, thickness: 100, wall_type: 'standard', ...extra,
} as unknown as Wall)
const walls = [mk('top', 0, 0, 0, 4000), mk('right', 4000, 0, 90, 3000), mk('bottom', 4000, 3000, 180, 4000), mk('left', 0, 3000, 270, 3000)]
const ref = centroid(walls)
const top = walls[0]

const placed = (over: Partial<RoomFixture>): RoomFixture => ({
  id: 'o', room_id: 'r', category: 'opening', kind: 'Window', name: 'W', width: 1200, depth: 100, height: 1200,
  mount: 'wall', z: 900, hinge_side: 'left', swing: 'in', cabinet_id: null, link_x: 0, link_z: 0, link_rot: 0,
  ...over,
} as unknown as RoomFixture)

describe('openings (P5)', () => {
  it('snaps into the wall body: back on the outer face, depth = thickness, centred on the cursor', () => {
    // top wall: inside face y = 0, room is +y, outer face y = −100
    const s = snapOpening({ x: 1500, y: 200 }, 1200, walls, ref, 600)!
    expect(s.wall_id).toBe('top')
    expect(s.depth).toBe(100)
    expect(s.y).toBeCloseTo(-100)
    expect(s.x).toBeCloseTo(900)
    // cursor inside the wall body works too; outside the outer face within reach as well
    expect(snapOpening({ x: 1500, y: -50 }, 1200, walls, ref, 600)?.wall_id).toBe('top')
    expect(snapOpening({ x: 1500, y: -300 }, 1200, walls, ref, 600)?.wall_id).toBe('top')
    // far from every wall → nowhere (openings never float)
    expect(snapOpening({ x: 2000, y: 1500 }, 900, walls, ref, 600)).toBeNull()
  })

  it('skips island walls', () => {
    const isl = mk('isl', 1000, 1500, 0, 2000, { wall_type: 'island', thickness: 0 } as Partial<Wall>)
    expect(snapOpening({ x: 2000, y: 1520 }, 900, [isl], ref, 600)).toBeNull()
  })

  it('spans along the inside face, merged and clamped', () => {
    const a = snapOpening({ x: 1500, y: 100 }, 1200, walls, ref, 600)!
    const b = snapOpening({ x: 2300, y: 100 }, 800, walls, ref, 600)!
    const spans = openingSpans([placed({ ...a }), placed({ id: 'b', ...b, width: 800 })], walls, ref).get('top')!
    expect(spans).toHaveLength(1)
    expect(spans[0].t0).toBeCloseTo(900)
    expect(spans[0].t1).toBeCloseTo(2700)
  })

  it('splits the wall footprint around a span', () => {
    const pieces = wallPieces(top, walls, ref, [{ t0: 900, t1: 2100 }])
    expect(pieces).toHaveLength(2)
    expect(pieces[0][1]).toEqual({ x: 900, y: 0 })     // inside face at the left jamb
    expect(pieces[0][2].y).toBeCloseTo(-100)          // outer face
    expect(pieces[1][0]).toEqual({ x: 2100, y: 0 })
    const q = wallSpanQuad(top, walls, ref, { t0: 900, t1: 2100 })
    expect(q.map(p => [Math.round(p.x), Math.round(p.y)])).toEqual([[900, 0], [2100, 0], [2100, -100], [900, -100]])
    // no spans → the whole mitred footprint
    expect(wallPieces(top, walls, ref, [])).toHaveLength(1)
  })

  it('shows on both faces of its wall, mirrored on the back', () => {
    const o = placed({ ...snapOpening({ x: 1500, y: 100 }, 1200, walls, ref, 600)! })
    const face = openingOnWall(o, top, 'face', ref)!
    expect(face.t0).toBeCloseTo(900); expect(face.t1).toBeCloseTo(2100)
    const back = openingOnWall(o, top, 'back', ref)!
    expect(back.t0).toBeCloseTo(4000 - 2100); expect(back.t1).toBeCloseTo(4000 - 900)
    expect(openingOnWall(o, walls[1], 'face', ref)).toBeNull()
  })

  it('re-seats openings when the wall gets thicker', () => {
    const o = placed({ ...snapOpening({ x: 1500, y: 100 }, 1200, walls, ref, 600)! })
    const thick = walls.map(w => w.id === 'top' ? { ...w, thickness: 150 } : w)
    const [m] = refitOpenings([o], thick, centroid(thick))
    expect(m.patch.depth).toBe(150)
    expect(m.patch.y).toBeCloseTo(-150)
    expect(m.patch.x).toBeCloseTo(900)
    expect(refitOpenings([o], walls, ref)).toEqual([])
  })
})
