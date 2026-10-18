// ── Per-view hidden-part filtering ──────────────────────────────────────────
// Spec: z_display_layers/PART-HIDE-SPEC.md. Removes parts the user hid for ONE
// room view (plan / elevation / 3D) from a ResolvedCabinet, so that view and its
// print report (plus dimension chains, which read the same map) skip them. This
// is the per-instance half of the display layers: a layer set hides a kind of
// part everywhere, this hides one part on one cabinet.
// Visual only — the edit modal, cut lists, optimiser and CNC never filter.
// IDs match the canonical scheme used by the SVG helpers and the Parts tab:
//   case_<key> · tk_<key>_<sort> · int_<type>_<sort> · zone_<row>_<col>
//   db_<row>_<col>_<part_type> · slide_<row>_<col>_<side> · int_slide_<idx>_<side>
// Custom parts carry their own list (cabinet_custom_parts.hide_views).

import type { ResolvedCabinet, PartHideViews, PartHideView } from './types'
import { zonePartId, dbPartId } from '@/src/lib/cabinetShape/partKeys'

type LayerViewId = PartHideView
export const PART_HIDE_VIEWS: readonly PartHideView[] = ['plan', 'elevation', '3d']

/** Part ids hidden in `view` (custom parts excluded). */
export function hiddenIdsFor(hide: PartHideViews | undefined, view: LayerViewId): Set<string> {
  const H = new Set<string>()
  for (const [id, views] of Object.entries(hide ?? {})) if (views?.includes(view)) H.add(id)
  return H
}

// Returns a shallow-cloned cabinet with the view's hidden parts stripped, or the
// original object untouched when nothing is hidden in that view.
export function filterHiddenParts(rp: ResolvedCabinet, view: LayerViewId): ResolvedCabinet {
  const H = hiddenIdsFor(rp.part_hide_views, view)
  const custom = rp.custom_parts
  const customHidden = !!custom?.some(p => p.hide_views?.includes(view))
  if (H.size === 0 && !customHidden) return rp

  return {
    ...rp,
    case_parts:     rp.case_parts.filter(p => !H.has(`case_${p.part_key}`)),
    toekick_parts:  rp.toekick_parts.filter(p => !H.has(`tk_${p.part_key}_${p.sort_order}`)),
    internal_parts: rp.internal_parts.filter(p => !H.has(`int_${p.part_type}_${p.sort_order}`)),
    face_zones:     rp.face_zones.filter(z => !H.has(zonePartId(z))),
    drawer_stacks:  (rp.drawer_stacks ?? []).map(s => ({
      ...s,
      box_parts: s.box_parts.filter(p => !H.has(dbPartId(s, p.part_type))),
      slides:    s.slides.filter(sl => !H.has(`slide_${s.face_zone_row}_${s.face_zone_col}_${sl.side}`)),
    })),
    internal_slides: (rp.internal_slides ?? []).filter(sl => !H.has(`int_slide_${sl.inner_drawer_index ?? 0}_${sl.side}`)),
    ...(customHidden ? { custom_parts: custom!.filter(p => !p.hide_views?.includes(view)) } : {}),
  }
}

/** The whole resolved map filtered for one view (`showHidden` = the "Show hidden
 *  parts" override in the Layers menu: return the map as-is). */
export function filterHiddenMap(m: Map<string, ResolvedCabinet>, view: LayerViewId, showHidden = false): Map<string, ResolvedCabinet> {
  if (showHidden) return m
  const out = new Map<string, ResolvedCabinet>()
  for (const [id, r] of m) out.set(id, filterHiddenParts(r, view))
  return out
}
