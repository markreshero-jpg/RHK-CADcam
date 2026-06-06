// ============================================================
// Manual-editing geometry for the optimiser canvas (Stage 5).
// Pure helpers: collision (kerf+pad aware), snap-to-nearest-valid
// position, and best-fit placement. Coordinates are sheet space
// (mm, bottom-left origin) matching NestedSheet.placements.
// ============================================================

import type { NestedSheet, Placement, SheetStock } from './nest'

export interface Rect { x: number; y: number; w: number; h: number }
const EPS = 1e-6

export function usableBounds(stock: SheetStock) {
  return {
    x0: stock.trimLeft,
    y0: stock.trimBottom,
    x1: stock.w - stock.trimRight,
    y1: stock.h - stock.trimTop,
  }
}

// Two rects are "in conflict" if they are closer than `gap` on both axes.
function conflict(a: Rect, b: Rect, gap: number): boolean {
  return !(a.x + a.w + gap <= b.x + EPS || b.x + b.w + gap <= a.x + EPS ||
           a.y + a.h + gap <= b.y + EPS || b.y + b.h + gap <= a.y + EPS)
}

function inBounds(r: Rect, stock: SheetStock): boolean {
  const u = usableBounds(stock)
  return r.x >= u.x0 - EPS && r.y >= u.y0 - EPS && r.x + r.w <= u.x1 + EPS && r.y + r.h <= u.y1 + EPS
}

function freeAt(x: number, y: number, w: number, h: number, others: Rect[], stock: SheetStock, gap: number): boolean {
  const r = { x, y, w, h }
  if (!inBounds(r, stock)) return false
  return !others.some(o => conflict(r, o, gap))
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

// Nearest collision-free spot to (desiredX, desiredY) for a w×h part, ignoring
// the part with id `ignoreUid`. Candidate positions are the cross product of
// existing part edges + the clamped desired position (grid-free). Returns null
// when the sheet has no valid spot.
export function findNearestValid(
  sheet: NestedSheet, ignoreUid: string | null, w: number, h: number,
  desiredX: number, desiredY: number, gap: number,
): { x: number; y: number } | null {
  const others: Rect[] = sheet.placements.filter(p => p.uid !== ignoreUid).map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h }))
  const u = usableBounds(sheet.stock)
  const maxX = u.x1 - w, maxY = u.y1 - h
  if (maxX < u.x0 - EPS || maxY < u.y0 - EPS) return null   // too big for the sheet

  const cx = clamp(desiredX, u.x0, maxX)
  const cy = clamp(desiredY, u.y0, maxY)
  if (freeAt(cx, cy, w, h, others, sheet.stock, gap)) return { x: cx, y: cy }

  const xs = new Set<number>([u.x0, cx])
  const ys = new Set<number>([u.y0, cy])
  for (const o of others) { xs.add(o.x + o.w + gap); ys.add(o.y + o.h + gap); xs.add(o.x); ys.add(o.y) }

  let best: { x: number; y: number; d: number } | null = null
  for (const x of xs) for (const y of ys) {
    if (x < u.x0 - EPS || y < u.y0 - EPS || x > maxX + EPS || y > maxY + EPS) continue
    if (!freeAt(x, y, w, h, others, sheet.stock, gap)) continue
    const d = (x - desiredX) ** 2 + (y - desiredY) ** 2
    if (!best || d < best.d) best = { x, y, d }
  }
  return best ? { x: best.x, y: best.y } : null
}

// Best position near sheet centre (used for paste / drag-from-pool).
export function findBestPlacement(sheet: NestedSheet, w: number, h: number, gap: number): { x: number; y: number } | null {
  const u = usableBounds(sheet.stock)
  return findNearestValid(sheet, null, w, h, (u.x0 + u.x1) / 2 - w / 2, (u.y0 + u.y1) / 2 - h / 2, gap)
}

export function sheetEfficiency(sheet: NestedSheet): number {
  const u = usableBounds(sheet.stock)
  const area = (u.x1 - u.x0) * (u.y1 - u.y0)
  if (area <= 0) return 0
  return sheet.placements.reduce((a, p) => a + p.w * p.h, 0) / area
}

export function clonePlacement(p: Placement, uid: string): Placement {
  return { ...p, uid }
}
