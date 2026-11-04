import { describe, it, expect } from 'vitest'
import { rasterPath } from '../routePatterns'

// LED groove 12 wide x 800 long running along sheet Y, 8mm cutter at 70% stepover.
describe('raster auto angle (0 / null = along the long side)', () => {
  it('runs lanes lengthways on a groove along Y', () => {
    const pts = rasterPath(100, 100, 104, 900, 5.6, 0)
    expect(pts.length).toBeLessThanOrEqual(4)                 // 1-2 long lanes, not ~140 short ones
    expect(Math.abs(pts[1].y - pts[0].y)).toBeGreaterThan(700)
  })
  it('runs lanes lengthways on a groove along X', () => {
    const pts = rasterPath(100, 100, 900, 104, 5.6, null)
    expect(pts.length).toBeLessThanOrEqual(4)
    expect(Math.abs(pts[1].x - pts[0].x)).toBeGreaterThan(700)
  })
  it('keeps an explicit angle', () => {
    const pts = rasterPath(100, 100, 104, 900, 5.6, 45)
    expect(pts.length).toBeGreaterThan(4)
  })
})
