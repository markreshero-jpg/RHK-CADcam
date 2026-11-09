import { describe, it, expect } from 'vitest'
import { BoxGeometry, ExtrudeGeometry, Matrix4, Path, Shape, Vector2, Vector3 } from 'three'
import { measurePlanes, coplanarTriangles, boundaryEdges, faceAcrossEdge } from '../measure3d'

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

describe('boundaryEdges / faceAcrossEdge', () => {
  it('a box face has its 4 outline edges, not the diagonal', () => {
    const g = new BoxGeometry(100, 200, 18)
    const tris = coplanarTriangles(g, new Matrix4(), new Vector3(0, 0, 1), new Vector3(0, 0, 9))
    expect(boundaryEdges(tris).length).toBe(4 * 9)
  })

  it('a hole in an extruded panel gives its edges, and the hole wall across them', () => {
    const s = new Shape([new Vector2(0, 0), new Vector2(1000, 0), new Vector2(1000, 400), new Vector2(0, 400)])
    s.holes.push(new Path([new Vector2(200, 100), new Vector2(800, 100), new Vector2(800, 300), new Vector2(200, 300)]))
    const g = new ExtrudeGeometry(s, { depth: 18, bevelEnabled: false })
    const n = new Vector3(0, 0, 1)
    const tris = coplanarTriangles(g, new Matrix4(), n, new Vector3(50, 50, 18))
    const edges = boundaryEdges(tris)
    expect(edges.length).toBe(8 * 9)
    // the hole's bottom edge (y = 100): the wall across it faces up into the hole
    let found = false
    for (let i = 0; i < edges.length; i += 9) {
      const a = new Vector3(edges[i], edges[i + 1], edges[i + 2]), b = new Vector3(edges[i + 3], edges[i + 4], edges[i + 5])
      if (Math.abs(a.y - 100) > 1e-6 || Math.abs(b.y - 100) > 1e-6) continue
      const m = faceAcrossEdge(g, new Matrix4(), a, b, n, new Vector3(edges[i + 6], edges[i + 7], edges[i + 8]))
      expect(Math.abs(m.y)).toBeCloseTo(1)
      found = true
    }
    expect(found).toBe(true)
  })

  it('falls back to the square edge when the mesh has no face across', () => {
    const m = faceAcrossEdge(new BoxGeometry(1, 1, 1), new Matrix4(),
      new Vector3(500, 0, 0), new Vector3(500, 10, 0), new Vector3(0, 0, 1), new Vector3(400, 5, 0))
    expect(m.x).toBeCloseTo(1)
  })
})
