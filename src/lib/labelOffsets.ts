// Movable cabinet / fixture labels (Mark, 2026-10-21). Stored per item in
// `label_offsets` (cabinet_instances, room_fixtures). Absent = default spot.
//  - plan: offset from the item's plan centre in its OWN frame (x along its
//    width, y = depth toward the front), so it follows moves and rotations;
//  - elev: offset from the item's elevation box centre (x along the view, y down).
// The canvas and the printed plan / elevations read the same offsets.

export interface LabelOff { x: number; y: number }
export interface LabelOffsets { plan?: LabelOff; elev?: LabelOff }
export type LabelView = 'plan' | 'elev'

/** Offsets with one view set (or cleared with `off = null`); null when nothing is left. */
export function withLabelOff(cur: LabelOffsets | null | undefined, view: LabelView, off: LabelOff | null): LabelOffsets | null {
  const next: LabelOffsets = { ...(cur ?? {}) }
  if (off) next[view] = { x: Math.round(off.x), y: Math.round(off.y) }
  else delete next[view]
  return next.plan || next.elev ? next : null
}

/** World-space delta → the item's own frame, given its unit axes in world (u = width, v = depth). */
export function toFrame(dx: number, dy: number, u: LabelOff, v: LabelOff): LabelOff {
  return { x: dx * u.x + dy * u.y, y: dx * v.x + dy * v.y }
}
