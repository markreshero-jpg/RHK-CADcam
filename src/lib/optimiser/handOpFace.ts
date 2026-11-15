// ============================================================
// Which face a HAND-ADDED op is on, for the CNC.
//
// Generated ops carry output_face (the bore direction, pre-mirrored for the down
// face — drills.ts onDownFace). Hand ops (Part Editor, scripts) carry none: only
// plane_kind, which the views draw as face_front = the +normal face and
// face_back = the −normal face of the part's op frame (partOpProject.handOpMarkers).
// They used to cut on whatever face was up, whatever the Part Editor said — so the
// RHK6586 WC-09 under panel LED pocket (face_back = underside) was routed into
// the top, and turning the panel over to get the LED underneath put the rangehood
// hole at the wrong end (Mark, 2026-11-15).
//
// The sheet keeps the op frame's handedness (toSheet is a pure rotation), so the
// face that is UP as laid is the one the frame (u, v) reads right-handed from.
// Only parts whose frame puts the +normal face up are handled here, and only
// face_back acts (face_front is the default for a new op and is the up face on
// these parts, as it always cut). Gables / backs / shaped panels already have
// the −normal face up, doors + drawer-box parts keep today's behaviour.
//   custom flat  (u z, v x, n y)  → top up      custom front (u x, v y, n z) → front up
//   case horizontal (bottom, tops) → top up      shelves (int_adj/fixed_shelf) → top up
// ============================================================

/** +1 when the part's +normal face is up as laid, else null (not handled). */
export function handOpUpNormal(table: string, partKey: string, customOrientation?: string | null): 1 | null {
  if (table === 'custom_parts') {
    const o = customOrientation ?? 'flat'
    return o === 'flat' || o === 'front' ? 1 : null
  }
  if (table === 'case_parts') {
    // Horizontal carcass panels. Gables, backs, shaped (side:/back:) panels and
    // rails (some stand upright) are left as they are.
    return /^case_(bottom|top|full_top)(:|$)/.test(partKey) ? 1 : null
  }
  if (table === 'internal_parts') return /^int_(adj_shelf|fixed_shelf)_/.test(partKey) ? 1 : null
  return null
}

/** A hand op (no output_face) on the face that is DOWN as laid. */
export function handOpOnDownFace(op: { output_face?: string | null; plane_kind?: string | null }, upNormal: 1 | null): boolean {
  return op.output_face == null && op.plane_kind === 'face_back' && upNormal === 1
}
