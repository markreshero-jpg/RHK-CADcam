import { describe, it, expect } from 'vitest'
import { planShapeFromTriangles, planShapePath } from '../fixturePlanShape'

// Flat quad at height y over x0…x1 × z0…z1, as two triangles.
const quad = (x0: number, z0: number, x1: number, z1: number, y: number) => [
  x0, y, z0, x1, y, z0, x1, y, z1,
  x0, y, z0, x1, y, z1, x0, y, z1,
]
const bounds = (l: [number, number][]) => ({
  u0: Math.min(...l.map(p => p[0])), u1: Math.max(...l.map(p => p[0])),
  v0: Math.min(...l.map(p => p[1])), v1: Math.max(...l.map(p => p[1])),
})

describe('fixture plan shape', () => {
  it('a box gives just its outline', () => {
    const s = planShapeFromTriangles(quad(0, 0, 600, 600, 850), 600, 600)
    expect(s.lines).toHaveLength(1)
    const b = bounds(s.lines[0])
    expect(b.u0).toBeCloseTo(0, 1); expect(b.u1).toBeCloseTo(1, 1)
    expect(b.v0).toBeCloseTo(0, 1); expect(b.v1).toBeCloseTo(1, 1)
  })

  it('a sink gives the rim outline plus the bowl edge', () => {
    // 600 × 500 rim at 200, bowl 100…500 × 100…400 down at 10
    const tris = [
      ...quad(0, 0, 600, 100, 200), ...quad(0, 400, 600, 500, 200),
      ...quad(0, 100, 100, 400, 200), ...quad(500, 100, 600, 400, 200),
      ...quad(100, 100, 500, 400, 10),
    ]
    const s = planShapeFromTriangles(tris, 600, 500)
    expect(s.lines).toHaveLength(2)
    const inner = s.lines.map(bounds).sort((a, b) => (a.u1 - a.u0) - (b.u1 - b.u0))[0]
    expect(inner.u0 * 600).toBeCloseTo(100, -1)
    expect(inner.u1 * 600).toBeCloseTo(500, -1)
    expect(inner.v0 * 500).toBeCloseTo(100, -1)
    expect(inner.v1 * 500).toBeCloseTo(400, -1)
  })

  it('a model smaller than its box is outlined where it is', () => {
    const s = planShapeFromTriangles(quad(100, 50, 300, 250, 100), 400, 300)
    const b = bounds(s.lines[0])
    expect(b.u0 * 400).toBeCloseTo(100, -1)
    expect(b.u1 * 400).toBeCloseTo(300, -1)
    expect(planShapePath(s, 400, 300)).toMatch(/^M/)
  })
})
