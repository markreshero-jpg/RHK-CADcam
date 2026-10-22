// Which drawing a CAD note belongs to (z_CAD_tool frames table), and the frame each
// drawing's notes live in.
//
// plan:      room mm (the frame walls and cabinets use).
// elevation: one side (face / back) of one wall — a note shows only on the side it was
//            drawn on (Mark, 2026-10-22). x = mm along the wall as seen from that side
//            (the elevation's own x, mirrored on the back like the cabinets), y = mm
//            DOWN from the floor, so heights are negative y. y-down keeps every shape
//            helper as on the plan (no flipped frame); the CAD panel shows height up.
//            Floor-relative, so a note stays put when the wall height changes.

import type { RoomAnnotation, AnnotationView } from '@/src/lib/types'
import { IDENTITY_FRAME, type AnnotFrame } from './geometry'

export type WallSide = 'face' | 'back'
export interface AnnotOwner { view: AnnotationView; wall_id: string | null; wall_side: WallSide | null }

export const PLAN_OWNER: AnnotOwner = { view: 'plan', wall_id: null, wall_side: null }

export function elevationOwner(wallId: string, side: WallSide): AnnotOwner {
  return { view: 'elevation', wall_id: wallId, wall_side: side }
}

/** A note belongs to this drawing. Rows from before A6 have no wall_side (plan only). */
export function ownedBy(a: Pick<RoomAnnotation, 'view' | 'wall_id' | 'wall_side'>, o: AnnotOwner): boolean {
  if (a.view !== o.view) return false
  if (o.view === 'plan') return true
  return a.wall_id === o.wall_id && (a.wall_side ?? 'face') === o.wall_side
}

/** Stable key for an owner (memo / reset deps). */
export const ownerKey = (o: AnnotOwner) => `${o.view}|${o.wall_id ?? ''}|${o.wall_side ?? ''}`

/** Elevation frame: the elevation svg draws the floor at y = roomH (svg y down), the
 *  same roomH ElevationSVG uses (wall height, else room height, else 2400). */
export function elevationAnnotFrame(roomH: number): AnnotFrame {
  return { ox: 0, oy: roomH, s: 1, flipY: false }
}

export function frameForOwner(o: AnnotOwner, roomH: number): AnnotFrame {
  return o.view === 'elevation' ? elevationAnnotFrame(roomH) : IDENTITY_FRAME
}

/** The owner columns a new row takes. */
export function ownerColumns(o: AnnotOwner): Pick<RoomAnnotation, 'view' | 'wall_id' | 'cabinet_id' | 'sheet_view' | 'wall_side'> {
  return { view: o.view, wall_id: o.wall_id, cabinet_id: null, sheet_view: null, wall_side: o.wall_side }
}
