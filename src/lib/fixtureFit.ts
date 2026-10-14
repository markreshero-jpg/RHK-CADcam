// ── Fixture model fitting (z_fixtures/FIXTURES-SPEC.md, decision 4) ───────────
// Pure maths behind FixtureModel: where an uploaded model sits inside its item
// box. Item box: origin back-bottom-left, +X width, +Y up, +Z toward the front.

import * as THREE from 'three'

const DEG = Math.PI / 180

export interface FitInput {
  width: number; depth: number; height: number
  model_scale: number
  model_rot_x: number; model_rot_y: number
  model_off_x: number; model_off_y: number; model_off_z: number
}

/** rot_x applied first (fixes Z-up exports), then rot_y. */
export function modelEuler(rotX: number, rotY: number) {
  return new THREE.Euler((rotX || 0) * DEG, (rotY || 0) * DEG, 0, 'YXZ')
}

/** Bounding box of `obj` after rotation, at scale 1. Exact for 90° steps. */
export function rotatedBounds(obj: THREE.Object3D, rotX: number, rotY: number): THREE.Box3 {
  // Measure in the object's own space — once mounted it sits under the fit
  // group, whose (old) rotation + scale must not leak into the bounds.
  const parent = obj.parent
  if (parent) parent.remove(obj)
  obj.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(obj)
  if (parent) parent.add(obj)
  return box.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(modelEuler(rotX, rotY)))
}

/** Translation that centres the scaled model in X/Z and stands it on Y = 0, plus nudges. */
export function fitOffset(native: THREE.Box3, f: FitInput): [number, number, number] {
  if (native.isEmpty()) return [0, 0, 0]
  const s = f.model_scale || 1
  return [
    f.width / 2 - ((native.min.x + native.max.x) / 2) * s + (f.model_off_x || 0),
    -native.min.y * s + (f.model_off_y || 0),
    f.depth / 2 - ((native.min.z + native.max.z) / 2) * s + (f.model_off_z || 0),
  ]
}

/** Largest scale that keeps the model inside width × height × depth. */
export function fitScale(native: { x: number; y: number; z: number }, f: { width: number; depth: number; height: number }) {
  const s = Math.min(
    native.x > 0 ? f.width  / native.x : Infinity,
    native.y > 0 ? f.height / native.y : Infinity,
    native.z > 0 ? f.depth  / native.z : Infinity,
  )
  return isFinite(s) && s > 0 ? s : null
}
