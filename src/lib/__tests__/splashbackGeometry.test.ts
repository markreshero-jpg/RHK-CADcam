import { describe, it, expect } from 'vitest'
import {
  sbReturnGeos, clipPolyX, cutoutHoles, jointXs,
  rectSegments, sbBounds, isRect, stretchEdge, defaultSplashbackRect, openingHoles, sbPlanQuad, flipForEditor, moveSegments,
} from '../splashbackGeometry'
import type { Wall } from '../types'

describe('splashback geometry', () => {
  const r = { x0: 100, x1: 3972, z0: 920, z1: 1620 }

  it('rect round-trips through bounds', () => {
    const s = rectSegments(r)
    expect(isRect(s)).toBe(true)
    expect(sbBounds(s)).toEqual(r)
  })

  it('stretches one edge and clamps at the minimum', () => {
    const s = rectSegments(r)
    expect(sbBounds(stretchEdge(s, 'top', 2000))).toEqual({ ...r, z1: 2000 })
    expect(sbBounds(stretchEdge(s, 'left', 0))).toEqual({ ...r, x0: 0 })
    expect(sbBounds(stretchEdge(s, 'right', 50))!.x1).toBe(120)   // x0 + MIN_SB
  })

  it('moves the whole outline', () => {
    expect(sbBounds(moveSegments(rectSegments(r), 10, -20))).toEqual({ x0: 110, x1: 3982, z0: 900, z1: 1600 })
  })

  it('default stops under the lowest overhead, else the ceiling', () => {
    expect(defaultSplashbackRect({ x0: 0, x1: 2000, benchTopZ: 920, ceilingZ: 2700, obstacles: [] }).z1).toBe(2700)
    const rect = defaultSplashbackRect({
      x0: 0, x1: 2000, benchTopZ: 920, ceilingZ: 2700,
      obstacles: [
        { x0: 0, x1: 900, zBot: 1620 },     // overheads
        { x0: 900, x1: 1500, zBot: 1500 },  // rangehood lower
        { x0: 2500, x1: 3000, zBot: 1000 }, // off the span
        { x0: 100, x1: 300, zBot: 1000 },   // sits on the bench — ignored
      ],
    })
    expect(rect).toEqual({ x0: 0, x1: 2000, z0: 920, z1: 1500 })
  })

  it('cuts openings clipped to the panel, grown by the reveal', () => {
    const holes = openingHoles(r, [
      { x0: 500, x1: 1500, z0: 1100, z1: 2200 },
      { x0: 5000, x1: 6000, z0: 0, z1: 2000 },
    ], 10)
    expect(holes).toEqual([{ x0: 490, x1: 1510, z0: 1090, z1: 1620 }])
  })

  it('plan band sits off the face by offset, thickness deep', () => {
    // Wall along +x from (0,0), room centroid below (+y) → face normal +y.
    const wall = { id: 'w', pos_x: 0, pos_y: 0, length: 4000, angle: 0, thickness: 90 } as unknown as Wall
    const q = sbPlanQuad({ x0: 100, x1: 1100 }, wall, 'face', { x: 2000, y: 2000 }, 5, 20)
    expect(q.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }))).toEqual([
      { x: 100, y: 5 }, { x: 1100, y: 5 }, { x: 1100, y: 25 }, { x: 100, y: 25 },
    ])
  })

  it('editor flip is its own inverse', () => {
    const s = rectSegments(r)
    expect(sbBounds(flipForEditor(flipForEditor(s)))).toEqual(r)
    expect(sbBounds(flipForEditor(s))).toEqual({ x0: 100, x1: 3972, z0: -1620, z1: -920 })
  })
})

describe('splashback S3: returns, joints, cut-outs', () => {
  const segs = rectSegments({ x0: 0, x1: 3000, z0: 920, z1: 1620 })
  const b = { x0: 0, x1: 3000, z0: 920, z1: 1620 }

  it('a mitred wrap-round return sits past the end, into the wall', () => {
    const [g] = sbReturnGeos({ segments: segs, offset_mm: 0, returns: [{ end: 'right', dir: 'back', length_mm: 140, join: 'mitre' }] }, b, 20)
    expect(g.poly).toEqual([{ x: 3000, y: 0 }, { x: 3020, y: 20 }, { x: 3020, y: -120 }, { x: 3000, y: -120 }])
    expect(g.wedge).toEqual([{ x: 3000, y: 0 }, { x: 3020, y: 20 }, { x: 3000, y: 20 }])
    expect(g.strip).toEqual({ x0: 3000, x1: 3020, z0: 920, z1: 1620 })
    expect(g.supplyLen).toBe(140)
  })

  it('a butt inside-corner return at the left end comes out toward the room', () => {
    const [g] = sbReturnGeos({ segments: segs, offset_mm: 0, returns: [{ end: 'left', dir: 'out', length_mm: 100, join: 'butt' }] }, b, 20)
    expect(g.poly).toEqual([{ x: 0, y: 20 }, { x: 0, y: 100 }, { x: 20, y: 100 }, { x: 20, y: 20 }])
    expect(g.wedge).toBeNull()
    expect(g.supplyLen).toBe(80)
  })

  it('clips an outline to an x range', () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    expect(clipPolyX(sq, 2, 6).map(p => p.x).sort()).toEqual([2, 2, 6, 6])
  })

  it('cut-outs are offsets from the piece corner; joints outside the piece are dropped', () => {
    const [h] = cutoutHoles(b, [{ id: 'a', kind: 'round', x: 100, y: 50, w: 35, h: 0 }])
    expect(h).toMatchObject({ x0: 100, x1: 135, z0: 970, z1: 1005, round: true })
    expect(jointXs({ joints: [1500, 0, 3000, 4000] }, b)).toEqual([1500])
  })
})
