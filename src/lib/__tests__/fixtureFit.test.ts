import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { rotatedBounds, fitOffset, fitScale } from '../fixtureFit'

const box = (w: number, h: number, d: number, at: [number, number, number] = [0, 0, 0]) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d))
  m.position.set(...at)
  return m
}
const base = { model_scale: 1, model_rot_x: 0, model_rot_y: 0, model_off_x: 0, model_off_y: 0, model_off_z: 0 }

describe('fixture model fitting', () => {
  it('centres in X/Z and stands on Y=0', () => {
    const obj = box(500, 800, 400, [100, 50, -30])
    const f = { ...base, width: 600, depth: 600, height: 850 }
    const nat = rotatedBounds(obj, 0, 0)
    const [x, y, z] = fitOffset(nat, f)
    // model centre (100, 50, -30); min y = 50 - 400 = -350
    expect(x).toBeCloseTo(300 - 100)
    expect(y).toBeCloseTo(350)
    expect(z).toBeCloseTo(300 + 30)
  })

  it('tip X 270 turns a Z-up export upright', () => {
    // Z-up export: 600 wide, 850 tall along Z, 580 deep along Y
    const obj = box(600, 580, 850)
    const nat = rotatedBounds(obj, 270, 0)
    const sz = nat.getSize(new THREE.Vector3())
    expect(sz.x).toBeCloseTo(600)
    expect(sz.y).toBeCloseTo(850)
    expect(sz.z).toBeCloseTo(580)
  })

  it('ignores the parent group transform once mounted', () => {
    const obj = box(100, 200, 300)
    const parent = new THREE.Group()
    parent.rotation.set(Math.PI / 2, 0, 0); parent.scale.setScalar(1000)
    parent.add(obj)
    const sz = rotatedBounds(obj, 0, 90).getSize(new THREE.Vector3())
    expect(sz.x).toBeCloseTo(300)
    expect(sz.y).toBeCloseTo(200)
    expect(sz.z).toBeCloseTo(100)
    expect(obj.parent).toBe(parent)
  })

  it('applies scale and nudges', () => {
    const nat = rotatedBounds(box(0.6, 0.85, 0.6), 0, 0)   // metres export
    const f = { ...base, width: 600, depth: 600, height: 850, model_scale: 1000, model_off_x: 5 }
    expect(fitOffset(nat, f)).toEqual([expect.closeTo(305), expect.closeTo(425), expect.closeTo(300)])
  })

  it('fit scale keeps the model inside every side', () => {
    expect(fitScale({ x: 0.6, y: 0.9, z: 0.5 }, { width: 600, depth: 600, height: 850 })).toBeCloseTo(850 / 0.9)
    expect(fitScale({ x: 0, y: 0, z: 0 }, { width: 600, depth: 600, height: 850 })).toBeNull()
  })
})
