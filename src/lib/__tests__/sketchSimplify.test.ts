import { describe, it, expect } from 'vitest'
import { simplifyPath } from '@/src/lib/annotations/geometry'

describe('simplifyPath (SK1 freehand sketch)', () => {
  it('drops points on a straight stroke, keeps the ends', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: i * 2, y: 0.01 * (i % 2) }))
    expect(simplifyPath(pts, 0.5)).toEqual([pts[0], pts[49]])
  })
  it('keeps the corner of an L', () => {
    const pts = [...Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: 0 })), ...Array.from({ length: 10 }, (_, i) => ({ x: 90, y: (i + 1) * 10 }))]
    const out = simplifyPath(pts, 0.5)
    expect(out).toEqual([{ x: 0, y: 0 }, { x: 90, y: 0 }, { x: 90, y: 100 }])
  })
  it('a curve keeps enough points to stay within tolerance', () => {
    const pts = Array.from({ length: 200 }, (_, i) => { const t = i / 199 * Math.PI; return { x: 100 * Math.cos(t), y: 100 * Math.sin(t) } })
    const out = simplifyPath(pts, 0.5)
    expect(out.length).toBeGreaterThan(5)
    expect(out.length).toBeLessThan(60)
  })
  it('passes short strokes through', () => {
    expect(simplifyPath([{ x: 0, y: 0 }, { x: 5, y: 5 }], 1)).toHaveLength(2)
  })
})
