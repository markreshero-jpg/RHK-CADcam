// Shop drawings, several views on one sheet (z_shop_drawings S4): the plan and
// the elevations share a page when they all fit at their own scales.
// Sizes and positions are paper mm.

export interface PackItem { key: string; w: number; h: number }

/**
 * Lays the views out in rows, in order, inside an areaW × areaH drawing area.
 * `head` is the room kept above each view for its caption. Rows are centred
 * across, the block is centred down, views in a row line up along their tops.
 * Returns each view's top-left (of its caption) from the area's corner, or null
 * when they don't all fit.
 */
export function packViews(items: PackItem[], areaW: number, areaH: number, gap: number, head: number): Record<string, { x: number; y: number }> | null {
  if (items.length === 0) return null
  const EPS = 0.01
  const rows: { items: PackItem[]; w: number; h: number }[] = []
  for (const it of items) {
    if (it.w > areaW + EPS) return null
    const row = rows[rows.length - 1]
    if (row && row.w + gap + it.w <= areaW + EPS) {
      row.items.push(it)
      row.w += gap + it.w
      row.h = Math.max(row.h, it.h + head)
    } else {
      rows.push({ items: [it], w: it.w, h: it.h + head })
    }
  }
  const totalH = rows.reduce((s, r) => s + r.h, 0) + gap * (rows.length - 1)
  if (totalH > areaH + EPS) return null
  const out: Record<string, { x: number; y: number }> = {}
  let y = (areaH - totalH) / 2
  for (const row of rows) {
    let x = (areaW - row.w) / 2
    for (const it of row.items) {
      out[it.key] = { x, y }
      x += it.w + gap
    }
    y += row.h + gap
  }
  return out
}
