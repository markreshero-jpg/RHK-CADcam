import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { handleRotatedBounds, handleFitOffset, handleModelEuler, lengthScale, looksLikeMetres, handleHolePattern } from '../handleModelFit'

const box = (w: number, h: number, d: number, at: [number, number, number] = [0, 0, 0]) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d))
  m.position.set(...at)
  return m
}
const base = { model_scale: 1, model_rot_x: 0, model_rot_y: 0, model_rot_z: 0, model_off_x: 0, model_off_y: 0, model_off_z: 0 }

describe('handle model fitting (z_handles H8)', () => {
  it('centres on the hole midpoint in X/Y and sits the back on the door face', () => {
    // A 160 × 12 × 30 bar modelled off-centre and floating in front of its origin.
    const obj = box(160, 12, 30, [40, -5, 50])
    const nat = handleRotatedBounds(obj, 0, 0, 0)
    const [x, y, z] = handleFitOffset(nat, base)
    expect(x).toBeCloseTo(-40)
    expect(y).toBeCloseTo(5)
    expect(z).toBeCloseTo(-(50 - 15))
  })

  it('applies scale before aligning, then adds the nudges', () => {
    const obj = box(0.16, 0.012, 0.03, [0, 0, 0.015])   // exported in metres
    const nat = handleRotatedBounds(obj, 0, 0, 0)
    const [x, y, z] = handleFitOffset(nat, { ...base, model_scale: 1000, model_off_x: 2, model_off_z: -1 })
    expect(x).toBeCloseTo(2)
    expect(y).toBeCloseTo(0)
    expect(z).toBeCloseTo(-1)   // min z already 0 → only the nudge
  })

  it('rot Z 90 turns a handle modelled along Y onto X', () => {
    const nat = handleRotatedBounds(box(12, 160, 30), 0, 0, 90)
    const sz = nat.getSize(new THREE.Vector3())
    expect(sz.x).toBeCloseTo(160)
    expect(sz.y).toBeCloseTo(12)
    expect(sz.z).toBeCloseTo(30)
  })

  it('rot X runs first: tip a Z-up export, then turn it', () => {
    // Z-up export: bar along X, projection along Y (should be Z), height along Z.
    const nat = handleRotatedBounds(box(160, 30, 12), 90, 0, 90)
    const sz = nat.getSize(new THREE.Vector3())
    // tip X 90: (160, 12, 30); then Z 90 swaps X/Y: (12, 160, 30)
    expect(sz.x).toBeCloseTo(12)
    expect(sz.y).toBeCloseTo(160)
    expect(sz.z).toBeCloseTo(30)
    // same order as the render group uses
    const e = handleModelEuler(90, 0, 90)
    expect(e.order).toBe('ZYX')
  })

  it('length scale and metres detection', () => {
    expect(lengthScale(0.16, 160)).toBeCloseTo(1000)
    expect(lengthScale(160, null)).toBeNull()
    expect(looksLikeMetres({ x: 0.16, y: 0.012, z: 0.03 }, 1)).toBe(true)
    expect(looksLikeMetres({ x: 160, y: 12, z: 30 }, 1)).toBe(false)
    expect(looksLikeMetres({ x: 0.16, y: 0.012, z: 0.03 }, 1000)).toBe(false)
  })

  it('hole pattern matches the resolver', () => {
    expect(handleHolePattern({ bore_centres: 128 })).toEqual([{ x: -64, y: 0 }, { x: 64, y: 0 }])
    expect(handleHolePattern({ bore_centres: null })).toEqual([{ x: 0, y: 0 }])
    expect(handleHolePattern({ holes: [{ offset_x: -10, offset_y: 3 }], bore_centres: 128 })).toEqual([{ x: -10, y: 3 }])
  })
})

describe('finishLook', () => {
  it('maps common finishes, falls back to grey metal', async () => {
    const { finishLook } = await import('../handleModelFit')
    expect(finishLook('Matt Black').color).toBe('#27272a')
    expect(finishLook('Brushed Nickel').color).toBe('#a8a29e')
    expect(finishLook(null).color).toBe('#9ca3af')
  })
})
