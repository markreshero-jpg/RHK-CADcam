// ============================================================
// Shape Editor reference outlines (M7c) — ghost rectangles of
// the parts neighbouring the one being shaped, so the user can
// draw against the benchtop line, the kick, the adjacent gable…
// Cabinet-Vision style. Pure projection: every part whose box
// intersects the edited part's plane slab (its thickness range
// along the frame normal) projects to an axis-aligned rectangle
// in the edited part's SHAPE frame (part-relative mm, y-down
// from the visual top, mirror-aware for right-hand twins) —
// the same frame conventions as buildShapedGeometry/edgeStrips.
// Display-only inside the ShapeEditor.
// ============================================================

import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { PanelKind } from '@/src/components/three/PartViewer'
import { caseBox, tkBox3, intBox3, zoneBox3, dbBox3, type Box3 } from '../cabinetEditSvgHelpers'
import type { CabinetCustomPart, PartPosOverrides, ShapeSegment } from '../canvasDB'
import { customExtents } from '@/src/lib/customPartBox'
import { shapePartLabel } from '../OverridesView'
import { zonePartId, dbPartId } from '@/src/lib/cabinetShape/partKeys'

export type RefOutline = { label: string; segments: ShapeSegment[] }

function applyOv(b: Box3, id: string, ov?: PartPosOverrides): Box3 {
  const o = ov?.[id]
  if (!o) return b
  return { x: b.x + o.ox, y: b.y + o.oy, z: b.z + o.oz, w: o.sw ?? b.w, h: o.sh ?? b.h, d: o.sd ?? b.d }
}

export function buildReferenceOutlines(
  rp: ResolvedCabinet,
  partId: string,
  kind: PanelKind,
  customParts?: CabinetCustomPart[],
  partOverrides?: PartPosOverrides,
): RefOutline[] {
  const all: { id: string; box: Box3 }[] = []
  for (const p of rp.case_parts)     all.push({ id: `case_${p.part_key}`,                  box: caseBox(p) })
  for (const p of rp.toekick_parts)  all.push({ id: `tk_${p.part_key}_${p.sort_order}`,    box: tkBox3(p) })
  for (const p of rp.internal_parts) all.push({ id: `int_${p.part_type}_${p.sort_order}`,  box: intBox3(p) })
  for (const z of rp.face_zones)     { if (z.face_type !== 'open') all.push({ id: zonePartId(z), box: zoneBox3(z) }) }
  for (const s of rp.drawer_stacks ?? [])
    for (const p of s.box_parts)     all.push({ id: dbPartId(s, p.part_type), box: dbBox3(p) })
  for (const cp of customParts ?? []) {
    if (!cp.visible) continue
    const { ex, ey, ez } = customExtents(cp.orientation ?? 'flat', Number(cp.dx), Number(cp.dy), Number(cp.dz))
    all.push({ id: `custom_${cp.id}`, box: { x: cp.x, y: cp.y, z: cp.z, w: ex, h: ey, d: ez } })
  }

  const boxes = all.map(e => ({ ...e, box: applyOv(e.box, e.id, partOverrides) }))
  const me = boxes.find(e => e.id === partId)
  if (!me) return []
  const B = me.box
  const mirror = kind === 'side' && partId.includes('right_side')

  // The edited part's slab along its frame normal (thickness axis) + margin —
  // attached neighbours touch it; distant parallel panels don't.
  const [n0, n1] = kind === 'side' ? [B.x, B.x + B.w] : kind === 'horizontal' ? [B.y, B.y + B.h] : [B.z, B.z + B.d]
  const MARGIN = 3

  // Cabinet point → shape frame (mm, y-down from the part's visual top).
  const proj = (x: number, y: number, z: number): { x: number; y: number } => {
    if (kind === 'side')       return { x: mirror ? B.z + B.d - z : z - B.z, y: B.y + B.h - y }
    if (kind === 'horizontal') return { x: x - B.x, y: B.z + B.d - z }
    return { x: x - B.x, y: B.y + B.h - y }
  }

  const out: RefOutline[] = []
  for (const e of boxes) {
    if (e.id === partId) continue
    const b = e.box
    const [a0, a1] = kind === 'side' ? [b.x, b.x + b.w] : kind === 'horizontal' ? [b.y, b.y + b.h] : [b.z, b.z + b.d]
    if (a1 < n0 - MARGIN || a0 > n1 + MARGIN) continue
    // Axis-aligned box → its in-plane projection is the AABB of two opposite corners.
    const pA = proj(b.x, b.y, b.z)
    const pB = proj(b.x + b.w, b.y + b.h, b.z + b.d)
    const x0 = Math.round(Math.min(pA.x, pB.x)), x1 = Math.round(Math.max(pA.x, pB.x))
    const y0 = Math.round(Math.min(pA.y, pB.y)), y1 = Math.round(Math.max(pA.y, pB.y))
    if (x1 - x0 < 1 || y1 - y0 < 1) continue
    out.push({
      label: shapePartLabel(e.id, customParts ?? []),
      segments: [
        { type: 'line', p0: { x: x0, y: y0 }, p1: { x: x1, y: y0 } },
        { type: 'line', p0: { x: x1, y: y0 }, p1: { x: x1, y: y1 } },
        { type: 'line', p0: { x: x1, y: y1 }, p1: { x: x0, y: y1 } },
        { type: 'line', p0: { x: x0, y: y1 }, p1: { x: x0, y: y0 } },
      ],
    })
  }
  return out
}
