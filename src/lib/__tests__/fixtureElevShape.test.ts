import { describe, it, expect } from 'vitest'
import { elevShapeFromTriangles } from '../fixturePlanShape'

// Vertical quad facing +Z (toward the viewer) at depth z over x0…x1, y0…y1.
const face = (x0: number, y0: number, x1: number, y1: number, z: number) => [
  x0, y0, z, x1, y0, z, x1, y1, z,
  x0, y0, z, x1, y1, z, x0, y1, z,
]

describe('fixture front shape', () => {
  it('outline + a recessed door panel, v measured down from the top', () => {
    // 600 wide × 800 high front at z 600, with a panel set back 20 over x 100…500, y 100…700
    const tris = [
      ...face(0, 0, 600, 100, 600), ...face(0, 700, 600, 800, 600),
      ...face(0, 100, 100, 700, 600), ...face(500, 100, 600, 700, 600),
      ...face(100, 100, 500, 700, 580),
    ]
    const s = elevShapeFromTriangles(tris, 600, 800)
    expect(s.lines).toHaveLength(2)
    const inner = s.lines
      .map(l => ({ v0: Math.min(...l.map(p => p[1])), v1: Math.max(...l.map(p => p[1])), u0: Math.min(...l.map(p => p[0])) }))
      .sort((a, b) => b.u0 - a.u0)[0]
    // y 700 (top of panel) → 100 down from the top; y 100 → 700 down
    expect(inner.v0 * 800).toBeCloseTo(100, -1)
    expect(inner.v1 * 800).toBeCloseTo(700, -1)
  })
})
