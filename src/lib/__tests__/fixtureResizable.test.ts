import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { readFileSync } from 'fs'
import {
  axisMap, readStretchSpec, boxMaps, stretchedCutout, stretchedPlanShape, stretchObject, nativeTargets,
} from '../fixtureStretch'

const ZALO_X = { nominal: 0.855, bands: [[-0.3873, -0.2737], [-0.1413, -0.0277], [0.0277, 0.1413], [0.2737, 0.3873]] as [number, number][], min: 0.446 }

async function loadGlb(path: string) {
  const buf = readFileSync(path)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const gltf = await new Promise<{ scene: THREE.Object3D }>((res, rej) => new GLTFLoader().parse(ab, '', res as never, rej))
  return gltf.scene
}

describe('axisMap', () => {
  it('shares the extra length between bands and stays centred', () => {
    const m = axisMap(ZALO_X, 0.955)
    expect(m.fwd(-0.4275)).toBeCloseTo(-0.4775, 6)
    expect(m.fwd(0.4275)).toBeCloseTo(0.4775, 6)
    expect(m.fwd(0)).toBeCloseTo(0, 6)                       // centre divider stays put
    expect(m.fwd(0.2075) - m.fwd(0.0125)).toBeCloseTo(0.195 + 0.025, 6)  // half a bowl grows by one share
  })
  it('inverts', () => {
    const m = axisMap(ZALO_X, 1.1)
    for (const c of [-0.5, -0.3, -0.1, 0, 0.05, 0.2, 0.35, 0.6]) expect(m.inv(m.fwd(c))).toBeCloseTo(c, 9)
  })
  it('clamps at the minimum', () => {
    const m = axisMap(ZALO_X, 0.1)
    expect(m.fwd(0.4275) - m.fwd(-0.4275)).toBeCloseTo(0.446, 6)
  })
})

const sinkFit = (w: number) => ({
  resizable: true, width: w, depth: 450, model_scale: 1000, model_rot_x: 0, model_rot_y: 0,
  stretch: { version: 1, axes: { x: ZALO_X, z: { nominal: 0.45, bands: [[-0.0138, 0.1848]] } }, recentre: true },
})

describe('box maps / cutout / shape', () => {
  it('cutout grows with the sink and stays centred', () => {
    const before = { ...sinkFit(855), cutout_shape: 'rect' as const, cutout_w: 825, cutout_d: 420, cutout_off_x: 0, cutout_off_y: 0 }
    const c = stretchedCutout(before, sinkFit(1055))
    expect(c.cutout_w).toBeCloseTo(1025, 1)
    expect(c.cutout_off_x).toBeCloseTo(0, 1)
    // and back again
    const back = stretchedCutout({ ...sinkFit(1055), ...before, ...c, width: 1055 }, sinkFit(855))
    expect(back.cutout_w).toBeCloseTo(825, 1)
  })
  it('not resizable → no change', () => {
    expect(boxMaps({ ...sinkFit(900), resizable: false })).toBeNull()
  })
  it('plan shape box edge stays on the box edge', () => {
    const s = stretchedPlanShape({ v: 1, lines: [[[0, 0], [1, 1]]] }, sinkFit(1055))!
    expect(s.lines[0][0][0]).toBeCloseTo(0, 6)
    expect(s.lines[0][1][0]).toBeCloseTo(1, 6)
  })
})

describe('real GLBs', () => {
  for (const name of ['ABI_Ohelu_Single_380', 'ABI_Seba_Single_550', 'ABI_Zalo_Double_Bowl']) {
    it(`${name} stretches to the target and keeps clips rigid`, async () => {
      const scene = await loadGlb(`public/fixture-models/${name}.glb`)
      const spec = readStretchSpec(scene.userData.stretch)!
      expect(spec).not.toBeNull()
      const f = { resizable: true, stretch: spec, width: spec.axes.x!.nominal * 1000 + 150, depth: spec.axes.z!.nominal * 1000 + 50, model_scale: 1000 }
      const out = stretchObject(scene, spec, nativeTargets(f)!)
      const size = new THREE.Box3().setFromObject(out).getSize(new THREE.Vector3())
      expect(size.x * 1000).toBeCloseTo(f.width, 0)
      expect(size.z * 1000).toBeCloseTo(f.depth, 0)
      const clip = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o.getObjectByName('clip_0')!).getSize(new THREE.Vector3())
      expect(clip(out).x).toBeCloseTo(clip(scene).x, 6)
    })
  }
})
