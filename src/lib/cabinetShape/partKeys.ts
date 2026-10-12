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

/** Human label for a per-edge part, e.g. "Side (facet)". */
export function shapedPartLabel(k: string): string | null {
  const m = /^(side|back|rail):(.+)$/.exec(k)
  if (!m) return null
  const kind = m[1] === 'side' ? 'Side' : m[1] === 'back' ? 'Back' : 'Top Rail'
  return `${kind} (${m[2]})`
}
