// Part-key classification for shaped-cabinet parts (z_cabinet_shape Phase 2).
// Every renderer that dispatches on case part_key routes the new per-edge keys
// through these, so an angled panel is never mistaken for a horizontal one.

/** Vertical per-edge panel (`side:<edge>` / `back:<edge>`), 'face' panel kind. */
export function isShapedPanelKey(k: string): boolean {
  return k.startsWith('side:') || k.startsWith('back:')
}

/** Top rail along a front facet (`rail:<edge>`), horizontal panel kind. */
export function isShapedRailKey(k: string): boolean {
  return k.startsWith('rail:')
}

// ── Front zones on facets (Phase 3) ────────────────────────────
// The primary front keeps `zone_<r>_<c>`. Another facet's zone is
// `zone_<edge>.<r>_<c>`: the dot keeps legacy parsers (`id.slice(5).split('_')
// .map(Number)`) from reading it as a primary zone — they get NaN and match nothing.

type ZoneRef = { row_index: number; col_index: number; facet?: string | null }

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
  const m = /^(side|back|rail):(.+)$/.exec(k)
  if (!m) return null
  const kind = m[1] === 'side' ? 'Side' : m[1] === 'back' ? 'Back' : 'Top Rail'
  return `${kind} (${m[2]})`
}
