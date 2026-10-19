// ── Per-view hidden-part filtering ──────────────────────────────────────────
// Spec: z_display_layers/PART-HIDE-SPEC.md. Removes parts the user hid for ONE
// room view (plan / elevation / 3D) from a ResolvedCabinet, so that view and its
// print report (plus dimension chains, which read the same map) skip them. This
// is the per-instance half of the display layers: a layer set hides a kind of
// part everywhere, this hides one part on one cabinet.
// Partial hides are visual only — the edit modal, cut lists, optimiser and CNC
// never filter them. Hidden in ALL three views = removed (filterRemovedParts).
// IDs match the canonical scheme used by the SVG helpers and the Parts tab:
//   case_<key> · tk_<key>_<sort> · int_<type>_<sort> · zone_<row>_<col>
//   db_<row>_<col>_<part_type> · slide_<row>_<col>_<side> · int_slide_<idx>_<side>
// Custom parts carry their own list (cabinet_custom_parts.hide_views).

import type { ResolvedCabinet, PartHideViews, PartHideView, ResolvedHingeMountTarget } from './types'
import { zonePartId, dbPartId } from '@/src/lib/cabinetShape/partKeys'

type LayerViewId = PartHideView
export const PART_HIDE_VIEWS: readonly PartHideView[] = ['plan', 'elevation', '3d']

/** Ids this filter can hide (hinges / plates aren't drawn per part in room views). */
export function isHideablePartId(id: string): boolean {
  return /^(case_|tk_|int_|zone_|db_|slide_|custom_)/.test(id)
}

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

// ── Removed parts (PART-HIDE-SPEC "Removed") ──────────────────────────────────
// Hidden in all three views = removed: not made. Off cut lists, optimiser, CNC,
// costing, and none of the drilling it causes on its neighbours. Geometry is
// untouched — consumers that make things gate on these instead.

export function isAllViews(views: readonly string[] | null | undefined): boolean {
  return !!views && PART_HIDE_VIEWS.every(v => views.includes(v))
}

/** Removed part ids (canonical scheme, incl. `custom_<id>` for custom parts). */
export function removedIdsFrom(hide: PartHideViews | null | undefined, custom: { id: string; hide_views?: string[] | null }[] = []): Set<string> {
  const R = new Set<string>()
  for (const [id, views] of Object.entries(hide ?? {})) if (isAllViews(views)) R.add(id)
  for (const p of custom) if (isAllViews(p.hide_views)) R.add(`custom_${p.id}`)
  return R
}

export function removedIds(rp: ResolvedCabinet): Set<string> {
  return removedIdsFrom(rp.part_hide_views, rp.custom_parts ?? [])
}

/** Seam joints store case parts by bare part_key ("bottom"), others by full id. */
export function seamPartId(key: string): string {
  return /^(case_|tk_|int_|zone_|db_|slide_|custom_)/.test(key) ? key : `case_${key}`
}

/** Part id of a hinge plate's mounting surface. */
export function mountTargetId(mt: ResolvedHingeMountTarget): string {
  if (mt.table === 'case_parts') return `case_${mt.part_key}`
  if (mt.table === 'internal_parts') return `int_${mt.internal_part_type}_${mt.internal_sort_order}`
  return zonePartId({ row_index: mt.row_index ?? -1, col_index: mt.col_index ?? -1, facet: mt.facet })
}

/** The cabinet as it is MADE: removed parts and everything they cause dropped
 *  (seam joints touching them, hinges of removed doors / on removed mounts).
 *  Returns `rp` untouched when nothing is removed. For cut lists, cabinet sheets
 *  and drilling — never for drawing (that's filterHiddenParts per view). */
export function filterRemovedParts(rp: ResolvedCabinet): ResolvedCabinet {
  const R = removedIds(rp)
  if (R.size === 0) return rp
  const allHidden: PartHideViews = {}
  for (const id of R) allHidden[id] = [...PART_HIDE_VIEWS]
  // Reuse the 3D filter for the part collections (all removed ids are hidden there).
  const base = filterHiddenParts({ ...rp, part_hide_views: allHidden,
    custom_parts: rp.custom_parts?.map(p => R.has(`custom_${p.id}`) ? { ...p, hide_views: [...PART_HIDE_VIEWS] } : { ...p, hide_views: [] }) }, '3d')
  return {
    ...base,
    // A removed drawer front takes its runners (and their holes) with it.
    drawer_stacks: base.drawer_stacks.map(s =>
      R.has(zonePartId({ row_index: s.face_zone_row, col_index: s.face_zone_col, facet: s.facet })) ? { ...s, slides: [] } : s),
    custom_parts: rp.custom_parts?.filter(p => !R.has(`custom_${p.id}`)),
    part_hide_views: rp.part_hide_views,
    seam_joints: rp.seam_joints.filter(j => !R.has(seamPartId(j.part_a_key)) && !R.has(seamPartId(j.part_b_key))),
    hinge_instances: rp.hinge_instances.filter(h => !R.has(zonePartId(h)) && !(h.mount_target && R.has(mountTargetId(h.mount_target)))),
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
