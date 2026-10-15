// ── Handle model fitting (z_handles D16 / H8) ─────────────────────────────────
// Pure maths behind HandleModel: where an uploaded handle model sits.
// Handle space: origin = midpoint of the fixing holes on the door's front face,
// +X along the handle (a horizontal handle, left → right), +Y up, +Z out of
// the door. Vertical handles turn 90° about Z when placed.
//
// The model is rotated (rot_x, then rot_y, then rot_z, about fixed axes),
// scaled, then auto-aligned: bounding box centred on the origin in X / Y, back
// (min Z) on the door face. The off_* nudges move it from there.

import * as THREE from 'three'

const DEG = Math.PI / 180

export interface HandleFitInput {
  model_scale: number
  model_rot_x: number; model_rot_y: number; model_rot_z: number
  model_off_x: number; model_off_y: number; model_off_z: number
}

/** rot_x first (fixes Z-up exports), then rot_y, then rot_z — all about fixed axes. */
export function handleModelEuler(rotX: number, rotY: number, rotZ: number) {
  return new THREE.Euler((rotX || 0) * DEG, (rotY || 0) * DEG, (rotZ || 0) * DEG, 'ZYX')
}

/** Bounding box of `obj` after rotation, at scale 1. Exact for 90° steps. */
export function handleRotatedBounds(obj: THREE.Object3D, rotX: number, rotY: number, rotZ: number): THREE.Box3 {
  // Measure in the object's own space: once mounted it sits under the fit
  // group, whose rotation + scale must not leak into the bounds.
  const parent = obj.parent
  if (parent) parent.remove(obj)
  obj.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(obj)
  if (parent) parent.add(obj)
  return box.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(handleModelEuler(rotX, rotY, rotZ)))
}

/** Translation that centres the scaled model on the origin in X / Y and sits its back on Z = 0, plus nudges. */
export function handleFitOffset(native: THREE.Box3, f: HandleFitInput): [number, number, number] {
  if (native.isEmpty()) return [0, 0, 0]
  const s = f.model_scale || 1
  return [
    -((native.min.x + native.max.x) / 2) * s + (f.model_off_x || 0),
    -((native.min.y + native.max.y) / 2) * s + (f.model_off_y || 0),
    -native.min.z * s + (f.model_off_z || 0),
  ]
}

/** Scale that makes the model's X extent match the handle's length; null if either is missing. */
export function lengthScale(nativeX: number, length: number | null | undefined): number | null {
  if (!(nativeX > 0) || !length || !(length > 0)) return null
  return length / nativeX
}

/** Exports in metres come in ~1000× too small: a handle under 5 units in every direction. */
export function looksLikeMetres(native: { x: number; y: number; z: number }, scale: number): boolean {
  return Number(scale) === 1 && Math.max(native.x, native.y, native.z) > 0 && Math.max(native.x, native.y, native.z) < 5
}

/** Fixing holes in handle space (horizontal), the same pattern the resolver
 *  drills: the product's own holes, else two at ± half the bore centres, else
 *  one at the centre (knob). */
export function handleHolePattern(h: {
  holes?: { offset_x: number; offset_y: number }[] | null
  bore_centres?: number | null
}): { x: number; y: number }[] {
  if (h.holes?.length) return h.holes.map(p => ({ x: Number(p.offset_x) || 0, y: Number(p.offset_y) || 0 }))
  const half = (Number(h.bore_centres) || 0) / 2
  return half > 0 ? [{ x: -half, y: 0 }, { x: half, y: 0 }] : [{ x: 0, y: 0 }]
}

/** Display colour for single-colour models (STL / OBJ) and the stand-in bar,
 *  from the handle's free-text finish. */
export function finishLook(finish: string | null | undefined): { color: string; metalness: number; roughness: number } {
  const f = (finish ?? '').toLowerCase()
  if (/black|gunmetal|graphite/.test(f))     return { color: '#27272a', metalness: 0.5, roughness: 0.5 }
  if (/white/.test(f))                       return { color: '#f4f4f5', metalness: 0.1, roughness: 0.5 }
  if (/brass|gold|champagne/.test(f))        return { color: '#b8954f', metalness: 0.85, roughness: 0.35 }
  if (/bronze|copper|antique/.test(f))       return { color: '#7c5a3c', metalness: 0.8, roughness: 0.45 }
  if (/chrome|polish/.test(f))               return { color: '#e4e4e7', metalness: 1, roughness: 0.12 }
  if (/brush|satin|nickel|stainless|steel/.test(f)) return { color: '#a8a29e', metalness: 0.85, roughness: 0.4 }
  return { color: '#9ca3af', metalness: 0.7, roughness: 0.35 }
}
