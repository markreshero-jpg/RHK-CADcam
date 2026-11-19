import { describe, it, expect } from 'vitest'
import { straightenStroke } from '@/src/lib/annotations/geometry'

/** A wobbly hand stroke through the given corners (deterministic jitter). */
function wobble(corners: { x: number; y: number }[], amp = 1.5, step = 2) {
  const out: { x: number; y: number }[] = []
  let k = 0
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i], b = corners[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(2, Math.round(L / step))
    const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L
    for (let s = 0; s < n; s++) {
      const t = s / n, j = amp * Math.sin(k++ * 0.7)
      out.push({ x: a.x + (b.x - a.x) * t + nx * j, y: a.y + (b.y - a.y) * t + ny * j })
    }
  }
  out.push(corners[corners.length - 1])
  return out
}
const near = (a: { x: number; y: number }, b: { x: number; y: number }, tol = 3) => Math.hypot(a.x - b.x, a.y - b.y) <= tol

describe('straightenStroke (SK3 straight sketch)', () => {
  it('a slightly tilted wobbly line comes out dead level', () => {
    const r = straightenStroke(wobble([{ x: 0, y: 0 }, { x: 300, y: 12 }]), 1)
    expect(r.closed).toBe(false)
    expect(r.pts).toHaveLength(2)
    expect(Math.abs(r.pts[0].y - r.pts[1].y)).toBeLessThan(1e-6)
  })
  it('an L turns into two square legs', () => {
    const r = straightenStroke(wobble([{ x: 0, y: 0 }, { x: 400, y: 10 }, { x: 395, y: 300 }]), 1)
    expect(r.pts).toHaveLength(3)
    expect(Math.abs(r.pts[0].y - r.pts[1].y)).toBeLessThan(1e-6)
    expect(Math.abs(r.pts[1].x - r.pts[2].x)).toBeLessThan(1e-6)
  })
  it('a rough room outline closes into a square-cornered box', () => {
    const r = straightenStroke(wobble([{ x: 0, y: 0 }, { x: 500, y: 8 }, { x: 505, y: 300 }, { x: 4, y: 296 }, { x: 10, y: 12 }]), 1)
    expect(r.closed).toBe(true)
    expect(r.pts).toHaveLength(4)
    for (let i = 0; i < 4; i++) {
      const a = r.pts[i], b = r.pts[(i + 1) % 4]
      expect(Math.min(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeLessThan(1e-6)
    }
  })
  it('a 45 deg splay stays at 45 deg', () => {
    const r = straightenStroke(wobble([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 500, y: 195 }]), 1)
    expect(r.pts).toHaveLength(3)
    const a = r.pts[1], b = r.pts[2]
    expect(Math.abs(Math.abs(b.x - a.x) - Math.abs(b.y - a.y))).toBeLessThan(1e-6)
  })
  it('an odd angle (30 deg) is kept, not forced square', () => {
    const r = straightenStroke(wobble([{ x: 0, y: 0 }, { x: 400, y: 231 }]), 1)
    const ang = Math.atan2(r.pts[1].y - r.pts[0].y, r.pts[1].x - r.pts[0].x) * 180 / Math.PI
    expect(ang).toBeGreaterThan(25)
    expect(ang).toBeLessThan(35)
  })
  it('anchored start slides the first leg onto the snapped point', () => {
    const r = straightenStroke(wobble([{ x: 3, y: 4 }, { x: 400, y: 6 }, { x: 402, y: 300 }]), 1, { start: { x: 0, y: 0 } })
    expect(r.pts[0]).toEqual({ x: 0, y: 0 })
    expect(Math.abs(r.pts[1].y)).toBeLessThan(1e-6)
    expect(near(r.pts[1], { x: 401, y: 0 }, 4)).toBe(true)
  })
  it('both ends anchored on one leg joins them exactly', () => {
    const r = straightenStroke(wobble([{ x: 0, y: 0 }, { x: 300, y: 40 }]), 1, { start: { x: 0, y: 0 }, end: { x: 300, y: 40 } })
    expect(r.pts).toEqual([{ x: 0, y: 0 }, { x: 300, y: 40 }])
  })
  it('scales with zoom: same shape in drawing mm at 1 px = 20 mm', () => {
    const pts = wobble([{ x: 0, y: 0 }, { x: 400, y: 10 }, { x: 395, y: 300 }]).map(p => ({ x: p.x * 20, y: p.y * 20 }))
    expect(straightenStroke(pts, 20).pts).toHaveLength(3)
  })
})
