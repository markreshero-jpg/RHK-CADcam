import { describe, it, expect } from 'vitest'
import { BoxGeometry } from 'three'
import { sliceFaces, prismFaces, geometryFaces, cabToWorld, sliceTriangles, chainPaths, trisAlongRange, type CutPlane, type P2 } from '../crossSection'
import { partPrism } from '../partSolids'

// Plane across x = at; depth u = world z (plan y), v = height.
const plane = (at: number): CutPlane => ({ o: { x: 0, y: 0 }, d: { x: 1, y: 0 }, n: { x: 0, y: 1 }, at })

const area = (l: P2[]) => Math.abs(l.reduce((s, p, i) => { const q = l[(i + 1) % l.length]; return s + p.x * q.y - q.x * p.y }, 0) / 2)
const bounds = (l: P2[]) => ({
  u0: Math.min(...l.map(p => p.x)), u1: Math.max(...l.map(p => p.x)),
  v0: Math.min(...l.map(p => p.y)), v1: Math.max(...l.map(p => p.y)),
})

describe('crossSection slicer', () => {
  it('cuts a box into its depth × height rectangle', () => {
    // 600 wide, 720 high, 560 deep box at the origin.
    const faces = prismFaces(partPrism({ x: 0, y: 0, z: 0, w: 600, h: 720, d: 560 }, 'face'))
    const loops = sliceFaces(faces, plane(300))
    expect(loops).toHaveLength(1)
    expect(area(loops[0])).toBeCloseTo(560 * 720, 3)
    expect(bounds(loops[0])).toEqual({ u0: 0, u1: 560, v0: 0, v1: 720 })
  })

  it('misses a box the plane does not reach', () => {
    const faces = prismFaces(partPrism({ x: 0, y: 0, z: 0, w: 600, h: 720, d: 560 }, 'face'))
    expect(sliceFaces(faces, plane(700))).toHaveLength(0)
    expect(sliceFaces(faces, plane(-1))).toHaveLength(0)
  })

  it('a plane on a shared face cuts exactly one of two neighbours', () => {
    const a = prismFaces(partPrism({ x: 0, y: 0, z: 0, w: 600, h: 720, d: 560 }, 'face'))
    const b = prismFaces(partPrism({ x: 600, y: 0, z: 0, w: 600, h: 720, d: 560 }, 'face'))
    const n = sliceFaces(a, plane(600)).length + sliceFaces(b, plane(600)).length
    expect(n).toBe(1)
  })

  it('a non-convex (L) profile cut through both legs gives two loops', () => {
    // A U lying in XZ (arms 100 wide), extruded 50 up; a cut along z = 200 crosses both arms.
    const u ={ outer: [[0, 0, 0], [300, 0, 0], [300, 0, 300], [200, 0, 300], [200, 0, 100], [100, 0, 100], [100, 0, 300], [0, 0, 300]] as [number, number, number][], holes: [], ext: [0, 50, 0] as [number, number, number] }
    // plane along z instead: d = +z, depth = x
    const pz: CutPlane = { o: { x: 0, y: 0 }, d: { x: 0, y: 1 }, n: { x: 1, y: 0 }, at: 200 }
    const loops = sliceFaces(prismFaces(u), pz)
    expect(loops).toHaveLength(2)
    for (const l of loops) expect(area(l)).toBeCloseTo(100 * 50, 3)
  })

  it('a cap hole comes back as an inner loop', () => {
    // 400 × 400 plate (XZ) with a 100 × 100 hole, 30 thick, cut through the hole.
    const pr = {
      outer: [[0, 0, 0], [400, 0, 0], [400, 0, 400], [0, 0, 400]] as [number, number, number][],
      holes: [[[150, 0, 150], [250, 0, 150], [250, 0, 250], [150, 0, 250]]] as [number, number, number][][],
      ext: [0, 30, 0] as [number, number, number],
    }
    const loops = sliceFaces(prismFaces(pr), plane(200))
    expect(loops).toHaveLength(2)
    const areas = loops.map(area).sort((p, q) => p - q)
    expect(areas[0]).toBeCloseTo(150 * 30, 3)
    expect(areas[1]).toBeCloseTo(150 * 30, 3)
  })

  it('slices a triangle mesh (benchtop slab path)', () => {
    const g = new BoxGeometry(1000, 40, 600)   // centred on the origin
    const loops = sliceFaces(geometryFaces(g), plane(123))
    expect(loops).toHaveLength(1)
    expect(area(loops[0])).toBeCloseTo(600 * 40, 3)
  })

  it('slices a flat triangle list (model mesh path) into one closed loop', () => {
    const g = new BoxGeometry(1000, 40, 600).toNonIndexed()
    const tris = new Float32Array(g.getAttribute('position').array)
    const paths = chainPaths(sliceTriangles(tris, plane(123)))
    expect(paths).toHaveLength(1)
    expect(paths[0].closed).toBe(true)
    expect(area(paths[0].pts)).toBeCloseTo(600 * 40, 3)
    expect(trisAlongRange(tris, { x: 0, y: 0 }, { x: 1, y: 0 })).toEqual([-500, 500])
  })

  it('an open mesh (one face of a box) cuts to an open chain', () => {
    // Two triangles: a vertical 600 × 720 sheet in the x–y plane at z = 0, cut at x = 300.
    const tris = new Float32Array([0, 0, 0, 600, 0, 0, 600, 720, 0, 0, 0, 0, 600, 720, 0, 0, 720, 0])
    const paths = chainPaths(sliceTriangles(tris, plane(300)))
    expect(paths).toHaveLength(1)
    expect(paths[0].closed).toBe(false)
    const ys = paths[0].pts.map(p => p.y).sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(0); expect(ys[ys.length - 1]).toBeCloseTo(720)
  })

  it('places cabinet coords like the 3D group (turned 180°)', () => {
    const w = cabToWorld({ x: 1000, y: 150, z: 0 }, Math.PI)
    const p = w([600, 0, 560])
    expect(p[0]).toBeCloseTo(400); expect(p[1]).toBe(150); expect(p[2]).toBeCloseTo(-560)
  })
})
