// ── 3D plane-to-plane measure: pure geometry ──────────────────────────────────
// Used by the room 3D view's measure tool (app/canvas/[roomId]/Measure3D.tsx).
// A pick is a surface plane: a point on it plus its world-space unit normal.
// World space is the room 3D space: x = plan X, y = height, z = plan Y (mm).

import { Vector3, type BufferGeometry, type Matrix4 } from 'three'

export interface PlanePick {
  point:  Vector3
  normal: Vector3
}

export type PlaneMeasure =
  /** Parallel faces: the true perpendicular gap. `from` is the foot on plane A
   *  square to `to` (the point picked on plane B); `anchor` is the plane-A pick. */
  | { kind: 'parallel'; dist: number; from: Vector3; to: Vector3; anchor: Vector3 }
  /** Non-parallel faces: no single gap, so the straight point-to-point distance
   *  with its plan X / plan Y / height components and the angle between the faces. */
  | { kind: 'point'; dist: number; from: Vector3; to: Vector3; dx: number; dy: number; dz: number; angleDeg: number }

// Faces within half a degree of parallel measure as parallel.
const PARALLEL_COS = Math.cos(0.5 * Math.PI / 180)

export function measurePlanes(a: PlanePick, b: PlanePick): PlaneMeasure {
  const cos = Math.abs(a.normal.dot(b.normal))
  if (cos >= PARALLEL_COS) {
    const s    = b.point.clone().sub(a.point).dot(a.normal)
    const from = b.point.clone().addScaledVector(a.normal, -s)
    return { kind: 'parallel', dist: Math.abs(s), from, to: b.point.clone(), anchor: a.point.clone() }
  }
  const d = b.point.clone().sub(a.point)
  return {
    kind: 'point', dist: d.length(), from: a.point.clone(), to: b.point.clone(),
    dx: Math.abs(d.x), dy: Math.abs(d.z), dz: Math.abs(d.y),
    angleDeg: Math.acos(Math.min(1, cos)) * 180 / Math.PI,
  }
}

/** World-space triangles (flat xyz list) of `geometry` that lie on the plane
 *  through `p` with unit normal `n` — the whole flat face the cursor is over, not
 *  just the one triangle hit. `tol` is the plane-offset tolerance in mm. */
export function coplanarTriangles(
  geometry: BufferGeometry, matrixWorld: Matrix4, n: Vector3, p: Vector3, tol = 0.5,
): Float32Array {
  const pos = geometry.getAttribute('position')
  if (!pos) return new Float32Array(0)
  const idx = geometry.getIndex()
  const triCount = Math.floor((idx ? idx.count : pos.count) / 3)
  const a = new Vector3(), b = new Vector3(), c = new Vector3()
  const e1 = new Vector3(), e2 = new Vector3()
  const vert = (i: number, v: Vector3) => v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(matrixWorld)
  const out: number[] = []
  for (let t = 0; t < triCount; t++) {
    vert(3 * t, a); vert(3 * t + 1, b); vert(3 * t + 2, c)
    e1.subVectors(b, a); e2.subVectors(c, a)
    const tn = e1.cross(e2)
    const len = tn.length()
    if (len < 1e-9) continue
    if (Math.abs(tn.dot(n)) / len < 0.9999) continue
    if (Math.abs(e2.subVectors(a, p).dot(n)) > tol) continue
    out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }
  return new Float32Array(out)
}
