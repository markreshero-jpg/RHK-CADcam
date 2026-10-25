import { describe, it, expect } from 'vitest'
import { loftSlab, undersideOutline, apronStrip } from '../benchtopSlab3d'

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

describe('mitred apron (undersideOutline + apronStrip)', () => {
  const line = (a: [number, number], b: [number, number]) => ({ type: 'line' as const, p0: { x: a[0], y: a[1] }, p1: { x: b[0], y: b[1] } })
  // 1000 x 600 with an R300 corner at the top-right (y down, clockwise on screen).
  const segs = [
    line([0, 0], [700, 0]),
    { type: 'arc' as const, p0: { x: 700, y: 0 }, p1: { x: 1000, y: 300 }, rx: 300, ry: 300, sweep: 1 as const, largeArc: 0 as const },
    line([1000, 300], [1000, 600]), line([1000, 600], [0, 600]), line([0, 600], [0, 0]),
  ]

  it('sets the apron edges back by T, the corners where the offset edges meet, others straight down', () => {
    const all = new Set([0, 1, 2])   // top line + curve + right end are aprons
    const { top, bottom, start } = undersideOutline(segs, i => (all.has(i) ? 20 : 0), 24)
    expect(bottom.length).toBe(top.length)
    expect(bottom[start[0]]).toMatchObject({ x: 0, y: 20 })            // left end: no apron → only the top edge moves
    expect(bottom[start[1]].x).toBeCloseTo(700); expect(bottom[start[1]].y).toBeCloseTo(20)   // line into the arc (tangent)
    const mid = bottom[start[1] + 12]                                  // halfway round the curve: R300 → R280
    expect(Math.hypot(mid.x - 700, mid.y - 300)).toBeCloseTo(280, 0)
    expect(bottom[start[3]]).toMatchObject({ x: 980, y: 600 })        // right end set back, bottom edge not
    expect(bottom[start[4]]).toMatchObject({ x: 0, y: 600 })
  })

  it('apron strip is a closed outward-wound solid of the right size', () => {
    const { top, bottom, start } = undersideOutline(segs, i => (i === 0 ? 20 : 0), 24)
    const g = apronStrip([top[start[0]], top[start[1]]], [bottom[start[0]], bottom[start[1]]], 920, 900, 840)
    // 700 long; section = 20 x 60 below the underside + the 20 x 20 mitre half
    expect(volume(g.getAttribute('position').array)).toBeCloseTo(700 * (20 * 60 + 200), -2)
  })
})
