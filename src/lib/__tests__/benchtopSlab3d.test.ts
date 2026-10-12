import { describe, it, expect } from 'vitest'
import { loftSlab } from '../benchtopSlab3d'

// Signed volume (divergence theorem): positive only if every face winds outward.
function volume(pos: ArrayLike<number>) {
  let v = 0
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from({ length: 9 }, (_, k) => pos[i + k])
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return v
}

const RECT = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }]

describe('loftSlab (3D benchtop with mitred waterfall ends)', () => {
  it('a plain slab is area × thickness, wound outward', () => {
    const g = loftSlab(RECT, RECT, [], 920, 900)
    expect(volume(g.getAttribute('position').array)).toBeCloseTo(600_000 * 20, -2)
  })

  it('a mitred right end bevels 45° — one slanted face, no vertical joint face', () => {
    const bottom = RECT.map(p => (p.x === 1000 ? { ...p, x: 980 } : p))
    const g = loftSlab(RECT, bottom, [], 920, 900)
    const pos = g.getAttribute('position').array
    // Full volume less the 20 × 20 / 2 triangle along the 600 edge.
    expect(volume(pos)).toBeCloseTo(600_000 * 20 - 0.5 * 20 * 20 * 600, -2)
    // Faces at the right end: normals point +x and DOWN at 45° (the face sits under the top's edge) (none vertical at x = 980).
    const n = g.getAttribute('normal').array
    let slanted = 0
    for (let i = 0; i < pos.length; i += 3) {
      if (pos[i] > 979 && Math.abs(n[i] - Math.SQRT1_2) < 0.01 && Math.abs(n[i + 1] + Math.SQRT1_2) < 0.01) slanted++
    }
    expect(slanted).toBe(6)
  })

  it('a cutout goes straight through', () => {
    const hole = [{ x: 400, y: 200 }, { x: 600, y: 200 }, { x: 600, y: 400 }, { x: 400, y: 400 }]
    const g = loftSlab(RECT, RECT, [hole], 920, 900)
    expect(volume(g.getAttribute('position').array)).toBeCloseTo((600_000 - 40_000) * 20, -2)
  })
})
