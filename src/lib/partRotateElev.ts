// Front-view (elevation) outline of an internal part turned by its rotate
// override (cabinet edit modal / Part Editor: part_pos_overrides oax/oay/oaz).
// Mark 2026-11-15 (RHK6468 WIR shoe shelves): tilted shelves drew flat at
// their unrotated height. The part turns about its min (back-bottom-left)
// corner like the 3D view and the joint drilling (jointDrilling.orientSeamDrills);
// the elevation draws the face of the turned box that looks most toward the
// front (+Z): a 15 deg front-down shelf shows its front edge, a shelf turned up
// 90 deg (a front rail) shows its full face.
import { internalBox, rotEulerXYZ, type PartPosOv } from './jointDrilling'
import type { ResolvedInternalPart } from './resolver/types'

export const isRotatedOv = (ov: PartPosOv | null | undefined): ov is PartPosOv =>
  !!ov && !!(ov.oax || ov.oay || ov.oaz)

type V3 = [number, number, number]
const FACES: { n: V3; c: V3[] }[] = [
  { n: [0, 0, 1],  c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] },
  { n: [0, 1, 0],  c: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [1, 0, 0],  c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]] },
]

/** Cabinet-frame (x, y) points of the turned part's front-most face, or null when
 *  the part has no rotation override (draw it the usual way). */
export function rotatedInternalFrontFace(p: ResolvedInternalPart, ov: PartPosOv | null | undefined): { x: number; y: number }[] | null {
  if (!isRotatedOv(ov)) return null
  const b = internalBox(p)
  if (!b) return null
  const rot = (v: V3) => rotEulerXYZ(ov.oax ?? 0, ov.oay ?? 0, ov.oaz ?? 0, v[0], v[1], v[2])
  let best = FACES[0], bestZ = -Infinity
  for (const f of FACES) { const z = rot(f.n)[2]; if (z > bestZ) { bestZ = z; best = f } }
  return best.c.map(([u, v, w]) => {
    const [rx, ry] = rot([u * b.w, v * b.h, w * b.d])
    return { x: b.x + (ov.ox ?? 0) + rx, y: b.y + (ov.oy ?? 0) + ry }
  })
}
