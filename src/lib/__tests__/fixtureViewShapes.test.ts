import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { viewShapesFromTriangles, sizedTriangles } from '../fixtureViewShapes'

// Item box 600 w × 400 d: a 600×400×50 slab with a 100×100 post (300 high) at the back-left.
function boxTris(x0: number, y0: number, z0: number, w: number, h: number, d: number): number[] {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed()
  g.translate(x0 + w / 2, y0 + h / 2, z0 + d / 2)
  return Array.from(g.attributes.position.array as Float32Array)
}
const tris = [...boxTris(0, 0, 0, 600, 50, 400), ...boxTris(0, 0, 0, 100, 300, 100)]
const bounds = (lines: [number, number][][]) => {
  const pts = lines.flat()
  return { u0: Math.min(...pts.map(p => p[0])), u1: Math.max(...pts.map(p => p[0])),
           v0: Math.min(...pts.map(p => p[1])), v1: Math.max(...pts.map(p => p[1])) }
}

describe('viewShapesFromTriangles', () => {
  it('traces top / front / side of an unturned item', () => {
    const s = viewShapesFromTriangles(tris, { width: 600, depth: 400 }, { w: 600, h: 300, d: 400, yaw: 0 })
    for (const v of [s.top, s.front, s.side]) {
      const b = bounds(v.lines)
      expect(b.u0).toBeLessThan(0.03); expect(b.u1).toBeGreaterThan(0.97)
    }
    // Front: the post reaches the top on the left only.
    const tops = s.front.lines.flat().filter(p => p[1] < 0.05)
    expect(Math.max(...tops.map(p => p[0]))).toBeLessThan(0.2)
    // Side (back on the left): the post is at the back.
    const sideTops = s.side.lines.flat().filter(p => p[1] < 0.05)
    expect(Math.max(...sideTops.map(p => p[0]))).toBeLessThan(0.3)
  })

  it('turns the item the same way three does (rotation.y = −yaw)', () => {
    const yaw = 90
    const o = new THREE.Object3D(); o.rotation.y = -yaw * Math.PI / 180; o.updateMatrixWorld()
    const post = new THREE.Vector3(50 - 300, 0, 50 - 200).applyMatrix4(o.matrixWorld)   // post centre, item-centred
    const s = viewShapesFromTriangles(tris, { width: 600, depth: 400 }, { w: 400, h: 300, d: 600, yaw })
    const want = { u: (post.x + 200) / 400, v: (post.z + 300) / 600 }
    // The post is a plateau contour in the top view: its points cluster round `want`.
    const near = s.top.lines.filter(l => l.every(([u, v]) => Math.abs(u - want.u) < 0.2 && Math.abs(v - want.v) < 0.15))
    expect(near.length).toBeGreaterThan(0)
  })
})

describe('sizedTriangles', () => {
  it('scales a resizable model without a spec to fill the box', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 50, 100))
    const t = sizedTriangles(mesh, { width: 300, depth: 200, height: 50, model_scale: 1, model_rot_x: 0, model_rot_y: 0,
      model_off_x: 0, model_off_y: 0, model_off_z: 0, resizable: true, stretch: null })
    const xs = t.filter((_, i) => i % 3 === 0), zs = t.filter((_, i) => i % 3 === 2)
    expect(Math.min(...xs)).toBeCloseTo(0); expect(Math.max(...xs)).toBeCloseTo(300)
    expect(Math.min(...zs)).toBeCloseTo(0); expect(Math.max(...zs)).toBeCloseTo(200)
  })
})
