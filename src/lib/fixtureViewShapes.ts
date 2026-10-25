// ── Fixture outlines for the cabinet edit modal's ortho views ─────────────────
// The library stores a fixture's plan + front shape traced at its catalogue
// size, front-on. Inside a cabinet the modal also needs the side, and the item
// may be stretched or turned on the cabinet — so it traces all three views
// live from the model, fitted exactly as FixtureModel draws it in 3D.
//
// Frames: item box = origin back-bottom-left, +X width, +Y up, +Z front.
// The fixture's cabinet-local box (LocalFixtureBox) is w × h × d with the
// model turned `yaw`° about its centre (three rotation.y = −yaw, like
// Cabinet3DView). Shapes come back normalised like PlanShape:
//   top   — u = x / w,  v = z / d (0 = back)       seen from above
//   front — u = x / w,  v = (h − y) / h (0 = top)  seen from the front
//   side  — u = z / d,  v = (h − y) / h            seen from the right (back on the left)

import * as THREE from 'three'
import { fittedTriangles, planShapeFromTriangles, type PlanShape } from './fixturePlanShape'
import { rotatedBounds, type FitInput } from './fixtureFit'
import { activeStretch, nativeTargets, stretchObject, type StretchFit } from './fixtureStretch'

export interface FixtureViewShapes { top: PlanShape; front: PlanShape; side: PlanShape }

export type FixtureFitLook = FitInput & StretchFit

/** Triangles of `obj` in the item box at the fixture's own size — stretched / scaled like FixtureModel's Fitted. */
export function sizedTriangles(obj: THREE.Object3D, f: FixtureFitLook): number[] {
  const spec = f.resizable ? activeStretch({ ...f, stretch: f.stretch ?? obj.userData?.stretch }) : null
  const targets = spec ? nativeTargets(f) : null
  const shaped = spec && targets ? stretchObject(obj, spec, targets) : obj
  const tris = fittedTriangles(shaped, f)
  if (!f.resizable || spec) return tris
  // No spec: width / depth scale to fill the box, about the (nudged) box centre.
  const b = rotatedBounds(shaped, f.model_rot_x, f.model_rot_y)
  if (b.isEmpty()) return tris
  const sz = b.getSize(new THREE.Vector3()), s = f.model_scale || 1
  const kx = sz.x > 0 ? f.width / (sz.x * s) : 1, kz = sz.z > 0 ? f.depth / (sz.z * s) : 1
  const cx = f.width / 2 + (f.model_off_x || 0), cz = f.depth / 2 + (f.model_off_z || 0)
  for (let i = 0; i + 2 < tris.length; i += 3) {
    tris[i] = cx + (tris[i] - cx) * kx
    tris[i + 2] = cz + (tris[i + 2] - cz) * kz
  }
  return tris
}

/**
 * Top / front / side shapes from item-box triangles (`width` × `depth` item),
 * turned `yaw`° into a w × h × d local box.
 */
export function viewShapesFromTriangles(
  tris: ArrayLike<number>, item: { width: number; depth: number },
  box: { w: number; h: number; d: number; yaw: number },
): FixtureViewShapes {
  const th = -box.yaw * Math.PI / 180, cos = Math.cos(th), sin = Math.sin(th)
  const n = tris.length - (tris.length % 9)
  const top = new Float32Array(n), front = new Float32Array(n), side = new Float32Array(n)
  for (let i = 0; i < n; i += 3) {
    const ix = tris[i] - item.width / 2, y = tris[i + 1], iz = tris[i + 2] - item.depth / 2
    const x = ix * cos + iz * sin + box.w / 2
    const z = -ix * sin + iz * cos + box.d / 2
    top[i] = x;   top[i + 1] = y;   top[i + 2] = z              // highest wins, plan x / z
    front[i] = x; front[i + 1] = z; front[i + 2] = box.h - y    // nearest the front wins
    side[i] = z;  side[i + 1] = x;  side[i + 2] = box.h - y     // nearest the right wins
  }
  // Finer grid for small items so drains / tap spouts keep their shape.
  const cell = (a: number, b: number) => Math.max(2, Math.min(6, Math.max(a, b) / 200))
  return {
    top:   planShapeFromTriangles(top, box.w, box.d, cell(box.w, box.d)),
    front: planShapeFromTriangles(front, box.w, box.h, cell(box.w, box.h), 4),
    side:  planShapeFromTriangles(side, box.d, box.h, cell(box.d, box.h), 4),
  }
}
