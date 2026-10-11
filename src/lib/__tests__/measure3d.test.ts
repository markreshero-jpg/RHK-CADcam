import { describe, it, expect } from 'vitest'
import { BoxGeometry, Matrix4, Vector3 } from 'three'
import { measurePlanes, coplanarTriangles } from '../measure3d'

const pick = (p: [number, number, number], n: [number, number, number]) =>
  ({ point: new Vector3(...p), normal: new Vector3(...n).normalize() })

describe('measurePlanes', () => {
  it('parallel faces give the perpendicular gap, wherever each face was clicked', () => {
    // kick face at z=500 facing +z; wall face at z=0 facing +z (clicked far along x / up y)
    const m = measurePlanes(pick([100, 50, 500], [0, 0, 1]), pick([1800, 900, 0], [0, 0, 1]))
    expect(m.kind).toBe('parallel')
    expect(m.dist).toBeCloseTo(500)
    expect(m.from.toArray()).toEqual([1800, 900, 500])   // foot on plane A, square to the B pick
  })

  it('opposite-facing parallel faces still read as a gap (cabinet sides)', () => {
    const m = measurePlanes(pick([600, 300, 200], [1, 0, 0]), pick([650, 400, 250], [-1, 0, 0]))
    expect(m.kind).toBe('parallel')
    expect(m.dist).toBeCloseTo(50)
  })

  it('non-parallel faces fall back to point-to-point with components', () => {
    const m = measurePlanes(pick([0, 0, 0], [0, 1, 0]), pick([300, 400, 0], [1, 0, 0]))
    expect(m.kind).toBe('point')
    if (m.kind !== 'point') return
    expect(m.dist).toBeCloseTo(500)
    expect(m.dx).toBeCloseTo(300)
    expect(m.dz).toBeCloseTo(400)   // height = world y
    expect(m.angleDeg).toBeCloseTo(90)
  })
})

describe('coplanarTriangles', () => {
  it('returns the two triangles of the clicked box face, in world space', () => {
    const g = new BoxGeometry(100, 200, 18)
    const mw = new Matrix4().makeTranslation(1000, 0, 0)
    const tris = coplanarTriangles(g, mw, new Vector3(0, 0, 1), new Vector3(1000, 0, 9))
    expect(tris.length).toBe(2 * 9)
    for (let i = 2; i < tris.length; i += 3) expect(tris[i]).toBeCloseTo(9)
  })
})
