import { describe, it, expect } from 'vitest'
import type { Wall } from '../types'
import { centroid, wallInwardNormal, toDeg, dist, type Pt } from '../geometry'

function wallsFrom(pts: Pt[], opts: { closed?: boolean; reverse?: number[] } = {}): Wall[] {
  const segs: [Pt, Pt][] = []
  for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]])
  if (opts.closed) segs.push([pts[pts.length - 1], pts[0]])
  return segs.map(([a, b], i) => {
    const [s, e] = opts.reverse?.includes(i) ? [b, a] : [a, b]
    return {
      id: `w${i}`, room_id: 'r', name: `Wall ${i + 1}`, sort_order: i,
      pos_x: s.x, pos_y: s.y, length: dist(s, e), angle: toDeg(Math.atan2(e.y - s.y, e.x - s.x)),
      thickness: 90, height: null, soffit_height: null, wall_type: 'standard',
    } as unknown as Wall
  })
}

/** Inward normal as a left/right flag relative to the chain's travel a→b. */
function sideOf(w: Wall, inward: Pt, a: Pt, b: Pt): 'left' | 'right' {
  const t = { x: b.x - a.x, y: b.y - a.y }
  return (-t.y * inward.x + t.x * inward.y) > 0 ? 'left' : 'right'
}

// The "joined wall problem" drawing: a clockwise spiral whose room centroid
// falls outside some of the walls (z_walls/joined wall problem.png).
const SPIRAL: Pt[] = [
  { x: 1400, y: 2950 }, { x: 2650, y: 1750 }, { x: 5500, y: 1750 }, { x: 6900, y: 3100 },
  { x: 5300, y: 4700 }, { x: 3950, y: 4700 }, { x: 3950, y: 2900 }, { x: 4500, y: 2900 },
  { x: 4500, y: 3750 },
]

describe('wall inside face from chain winding', () => {
  it('spiral drawn clockwise: every wall keeps its thickness on the same side', () => {
    const walls = wallsFrom(SPIRAL)
    const ref = centroid(walls)
    const sides = walls.map((w, i) => sideOf(w, wallInwardNormal(w, ref), SPIRAL[i], SPIRAL[i + 1]))
    expect(new Set(sides)).toEqual(new Set(['left']))
  })

  // Walls 1–6 of that room sit elsewhere and drag the room centroid off the spiral.
  const ELSEWHERE = wallsFrom([{ x: -9000, y: 9000 }, { x: -9000, y: 12000 }, { x: -5000, y: 12000 }, { x: -5000, y: 9000 }], { closed: true })
    .map(w => ({ ...w, id: `far_${w.id}` }))

  it('other walls in the room no longer flip the spiral', () => {
    const spiral = wallsFrom(SPIRAL)
    const walls = [...ELSEWHERE, ...spiral]
    const c = centroid(walls)
    const plain = { x: c.x, y: c.y }
    // Old centroid-only rule: some walls flip back to front.
    const before = spiral.map((w, i) => sideOf(w, wallInwardNormal(w, plain), SPIRAL[i], SPIRAL[i + 1]))
    expect(new Set(before).size).toBe(2)
    const after = spiral.map((w, i) => sideOf(w, wallInwardNormal(w, c), SPIRAL[i], SPIRAL[i + 1]))
    expect(new Set(after)).toEqual(new Set(['left']))
  })

  it('walls drawn in mixed directions still follow the chain', () => {
    const walls = wallsFrom(SPIRAL, { reverse: [1, 4, 7] })
    const ref = centroid(walls)
    const sides = walls.map((w, i) => sideOf(w, wallInwardNormal(w, ref), SPIRAL[i], SPIRAL[i + 1]))
    expect(new Set(sides)).toEqual(new Set(['left']))
  })

  it('anticlockwise closed room faces inward (same as the centroid rule)', () => {
    const sq: Pt[] = [{ x: 0, y: 0 }, { x: 0, y: 3000 }, { x: 4000, y: 3000 }, { x: 4000, y: 0 }]
    const walls = wallsFrom(sq, { closed: true })
    const ref = centroid(walls)
    for (const w of walls) {
      const n = wallInwardNormal(w, ref)
      const plain = wallInwardNormal(w, { x: ref.x, y: ref.y })
      expect(n.x).toBeCloseTo(plain.x); expect(n.y).toBeCloseTo(plain.y)
    }
  })

  it('a lone straight wall falls back to the centroid rule', () => {
    const walls = wallsFrom([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 6000, y: 0 }])
    expect(centroid(walls).inward?.size).toBe(0)
  })
})
