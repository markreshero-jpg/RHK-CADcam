import { describe, it, expect } from 'vitest'
import {
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
