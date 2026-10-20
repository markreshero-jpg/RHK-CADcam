// Part-key classification for shaped-cabinet parts (z_cabinet_shape Phase 2).
// Every renderer that dispatches on case part_key routes the new per-edge keys
// through these, so an angled panel is never mistaken for a horizontal one.

import { edgeLabel } from './footprint'
import { curvedEndPartLabel } from '../resolver/resolveCurvedEnd'

/** Vertical per-edge panel (`side:<edge>` / `back:<edge>`), 'face' panel kind.
 *  Finger-pull backing rails (`fprail:<n>`, z_handles H6) and filler return
 *  cleats (`cleat:<edge>`, z_angled_filler) are face-kind panels with the same
 *  frame, so they ride the same path — as do the upright bulkhead parts. */
export function isShapedPanelKey(k: string): boolean {
  return k.startsWith('side:') || k.startsWith('back:') || k.startsWith('fprail:') || k.startsWith('cleat:')
    || (isBulkheadKey(k) && !BH_HORIZONTAL.has(k))
    || isCurvedEndUprightKey(k)
}

/** Bulkhead parts (z_bulkhead, resolveBulkhead). Fascia, side returns and the
 *  cleat's upright leg are face-kind panels (turned AY, as side:/back:<edge>);
 *  the bottom return, the cleat's flat leg and the shadowline strips are
 *  horizontal box-frame panels. */
export const BH_HORIZONTAL = new Set(['bh:ret_b', 'bh:cleat_h', 'bh:sl_front', 'bh:sl_ret_l', 'bh:sl_ret_r'])
export function isBulkheadKey(k: string): boolean {
  return k.startsWith('bh:')
}

/** Curved fixed-panel cabinet parts (z_curved_end, resolveCurvedEnd). The
 *  fixing panel, back and fixing blocks are face-kind panels (turned AY, as
 *  side:/back:<edge>); the formers are horizontal with outlines; the face board
 *  (crv:face) is drawn from its `wrap` plan shape. */
export function isCurvedEndKey(k: string): boolean {
  return k.startsWith('crv:')
}
export function isCurvedEndUprightKey(k: string): boolean {
  return k === 'crv:fix' || k === 'crv:back' || k.startsWith('crv:blk_')
}

/** Top rail along a front facet (`rail:<edge>`), horizontal panel kind. */
export function isShapedRailKey(k: string): boolean {
  return k.startsWith('rail:')
}

// ── Front zones on facets (Phase 3) ────────────────────────────
// The primary front keeps `zone_<r>_<c>`. Another facet's zone is
// `zone_<edge>.<r>_<c>`: the dot keeps legacy parsers (`id.slice(5).split('_')
// .map(Number)`) from reading it as a primary zone — they get NaN and match nothing.

export type ZoneRef = { row_index: number; col_index: number; facet?: string | null }

/** Lookup key for a zone within its cabinet: `r_c`, or `edge.r_c` on a facet. */
export function zoneKey(z: ZoneRef): string {
  return z.facet ? `${z.facet}.${z.row_index}_${z.col_index}` : `${z.row_index}_${z.col_index}`
}

/** Stable part id of a front zone. */
export function zonePartId(z: ZoneRef): string {
  return `zone_${zoneKey(z)}`
}

/** Inverse of zonePartId; null for anything that isn't a zone id. */
export function parseZonePartId(id: string): { facet?: string; row: number; col: number } | null {
  const m = /^zone_(?:(.+)\.)?(\d+)_(\d+)$/.exec(id)
  if (!m) return null
  return { ...(m[1] ? { facet: m[1] } : {}), row: Number(m[2]), col: Number(m[3]) }
}

/** Human label for a per-edge part, e.g. "Side (facet)". */
export function shapedPartLabel(k: string): string | null {
  const crv = curvedEndPartLabel(k)
  if (crv) return crv
  const fp =/^fprail:(\d+)$/.exec(k)
  if (fp) return `Finger Rail ${Number(fp[1]) + 1}`
  const m = /^(side|back|rail|cleat):(.+)$/.exec(k)
  if (!m) return null
  const kind = m[1] === 'side' ? 'Side' : m[1] === 'back' ? 'Back' : m[1] === 'cleat' ? 'Return Cleat' : 'Top Rail'
  return `${kind} (${m[2]})`
}

// ── Drawer hardware on facets (Phase 3b) ───────────────────────
export type StackRef = { face_zone_row: number; face_zone_col: number; facet?: string | null }

/** Lookup key of a drawer stack = its front zone's key. */
export function stackKey(s: StackRef): string {
  return zoneKey({ row_index: s.face_zone_row, col_index: s.face_zone_col, facet: s.facet })
}

/** Part id of a drawer box panel: `db_<r>_<c>_<type>`, `db_<edge>.<r>_<c>_<type>` on a facet. */
export function dbPartId(s: StackRef, partType: string): string {
  return `db_${stackKey(s)}_${partType}`
}

/** Display reference for a front zone: "R1C2", or "Angled facet R1C1" on a facet (3c). */
export function zoneRef(z: ZoneRef): string {
  const rc = `R${z.row_index + 1}C${z.col_index + 1}`
  return z.facet ? `${edgeLabel(z.facet)} ${rc}` : rc
}

/** Display reference for a drawer stack = its front zone's. */
export function stackRef(s: StackRef): string {
  return zoneRef({ row_index: s.face_zone_row, col_index: s.face_zone_col, facet: s.facet })
}
