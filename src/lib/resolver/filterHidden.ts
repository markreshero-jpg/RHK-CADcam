// ── Hidden-part filtering ───────────────────────────────────────────────────
// Removes user-hidden parts from a ResolvedCabinet so every consumer (modal
// viewers, canvas plan/elevation, printed reports, cut lists) excludes them.
// IDs match the canonical scheme used by the SVG helpers and the Parts tab:
//   case_<key> · tk_<key>_<sort> · int_<type>_<sort> · zone_<row>_<col>
//   db_<row>_<col>_<part_type> · slide_<row>_<col>_<side> · int_slide_<idx>_<side>
// Custom parts are NOT handled here — they use cabinet_custom_parts.visible.

import type { ResolvedCabinet } from './types'

// Returns a shallow-cloned cabinet with hidden parts stripped. `hidden` overrides
// rp.hidden_parts (so a live UI set can be applied without re-resolving). Returns
// the original object untouched when nothing is hidden.
export function filterHiddenParts(rp: ResolvedCabinet, hidden?: readonly string[]): ResolvedCabinet {
  const ids = hidden ?? rp.hidden_parts ?? []
  if (ids.length === 0) return rp
  const H = new Set(ids)

  return {
    ...rp,
    case_parts:     rp.case_parts.filter(p => !H.has(`case_${p.part_key}`)),
    toekick_parts:  rp.toekick_parts.filter(p => !H.has(`tk_${p.part_key}_${p.sort_order}`)),
    internal_parts: rp.internal_parts.filter(p => !H.has(`int_${p.part_type}_${p.sort_order}`)),
    face_zones:     rp.face_zones.filter(z => !H.has(`zone_${z.row_index}_${z.col_index}`)),
    drawer_stacks:  (rp.drawer_stacks ?? []).map(s => ({
      ...s,
      box_parts: s.box_parts.filter(p => !H.has(`db_${s.face_zone_row}_${s.face_zone_col}_${p.part_type}`)),
      slides:    s.slides.filter(sl => !H.has(`slide_${s.face_zone_row}_${s.face_zone_col}_${sl.side}`)),
    })),
    internal_slides: (rp.internal_slides ?? []).filter(sl => !H.has(`int_slide_${sl.inner_drawer_index ?? 0}_${sl.side}`)),
  }
}
