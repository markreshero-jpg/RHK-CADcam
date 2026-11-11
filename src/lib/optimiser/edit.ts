// ============================================================
// Manual-editing geometry for the optimiser canvas (Stage 5).
// Pure helpers: collision (kerf+pad aware), snap-to-nearest-valid
// position, and best-fit placement. Coordinates are sheet space
// (mm, bottom-left origin) matching NestedSheet.placements.
// ============================================================

import type { NestedSheet, Placement, SheetStock } from './nest'

export interface Rect { x: number; y: number; w: number; h: number }
type Pt = { x: number; y: number }
/** A part's true outline, placement-local (relative to its bottom-left), sheet axes. */
export type Loop = Pt[]
/** True shapes for the snap (Mark, 2026-11-11, RHK6595 WC-07 L filler): a shaped
 *  part only blocks where its outline is, so a part can drop into an L's empty
 *  corner. outlineOf = a placed part's outline (null = its rectangle); moving =
 *  the dragged part's own outline as it will sit. */
export interface ShapeOpts { outlineOf?: (p: Placement) => Loop | null; moving?: Loop | null }
type Body = Rect & { loop?: Pt[] }   // loop = outline in SHEET coords
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
function rectConflict(a: Rect, b: Rect, gap: number): boolean {
  return !(a.x + a.w + gap <= b.x + EPS || b.x + b.w + gap <= a.x + EPS ||
           a.y + a.h + gap <= b.y + EPS || b.y + b.h + gap <= a.y + EPS)
}

const rectPts = (r: Rect): Pt[] => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }]

function ptSeg(p: Pt, s: Pt, t: Pt): number {
  const vx = t.x - s.x, vy = t.y - s.y, L = vx * vx + vy * vy
  const k = L > 0 ? Math.max(0, Math.min(1, ((p.x - s.x) * vx + (p.y - s.y) * vy) / L)) : 0
  return Math.hypot(p.x - s.x - k * vx, p.y - s.y - k * vy)
}

// Shortest distance between segments ab and cd (0 when they cross).
function segDist(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const cross = (o: Pt, p: Pt, q: Pt) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x)
  const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0
  return Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b))
}

function inside(p: Pt, poly: Pt[]): boolean {
  let r = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) r = !r
  }
  return r
}

// Two outlines closer than `gap` anywhere (one inside the other counts)?
function polyConflict(A: Pt[], B: Pt[], gap: number): boolean {
  if (inside(A[0], B) || inside(B[0], A)) return true
  for (let i = 0; i < A.length; i++) {
    const a = A[i], b = A[(i + 1) % A.length]
    for (let j = 0; j < B.length; j++) {
      if (segDist(a, b, B[j], B[(j + 1) % B.length]) < gap - 1e-3) return true
    }
  }
  return false
}

// Rectangles first (cheap); true outlines only when one side has one.
function conflict(a: Body, b: Body, gap: number): boolean {
  if (!rectConflict(a, b, gap)) return false
  if (!a.loop && !b.loop) return true
  return polyConflict(a.loop ?? rectPts(a), b.loop ?? rectPts(b), gap)
}

function inBounds(r: Rect, stock: SheetStock): boolean {
  const u = usableBounds(stock)
  return r.x >= u.x0 - EPS && r.y >= u.y0 - EPS && r.x + r.w <= u.x1 + EPS && r.y + r.h <= u.y1 + EPS
}

function freeAt(x: number, y: number, w: number, h: number, others: Body[], stock: SheetStock, gap: number, moving?: Loop | null): boolean {
  const r: Body = { x, y, w, h, ...(moving ? { loop: moving.map(p => ({ x: x + p.x, y: y + p.y })) } : {}) }
  if (!inBounds(r, stock)) return false
  return !others.some(o => conflict(r, o, gap))
}

function bodies(sheet: NestedSheet, ignore: string | null | ReadonlySet<string>, shapes: ShapeOpts): Body[] {
  const skip = (uid: string) => (typeof ignore === 'string' || ignore == null ? uid === ignore : ignore.has(uid))
  return sheet.placements.filter(p => !skip(p.uid)).map(p => {
    const loop = shapes.outlineOf?.(p)
    return { x: p.x, y: p.y, w: p.w, h: p.h, ...(loop && loop.length >= 3 ? { loop: loop.map(q => ({ x: p.x + q.x, y: p.y + q.y })) } : {}) }
  })
}

const movingLoop = (shapes: ShapeOpts) => (shapes.moving && shapes.moving.length >= 3 ? shapes.moving : null)

/** Is a w×h part (outline shapes.moving) clear at exactly (x, y)? */
export function isFreeAt(
  sheet: NestedSheet, ignore: string | null | ReadonlySet<string>, w: number, h: number,
  x: number, y: number, gap: number, shapes: ShapeOpts = {},
): boolean {
  return freeAt(x, y, w, h, bodies(sheet, ignore, shapes), sheet.stock, gap, movingLoop(shapes))
}

// Nearest collision-free spot to (desiredX, desiredY) for a w×h part, ignoring
// the part(s) `ignore` (one uid, or a grain match block's members). Candidate positions are the cross product of
// existing part edges + the clamped desired position (grid-free). Returns null
// when the sheet has no valid spot.
export function findNearestValid(
  sheet: NestedSheet, ignore: string | null | ReadonlySet<string>, w: number, h: number,
  desiredX: number, desiredY: number, gap: number, shapes: ShapeOpts = {},
): { x: number; y: number } | null {
  const others = bodies(sheet, ignore, shapes)
  const moving = movingLoop(shapes)
  const u = usableBounds(sheet.stock)
  const maxX = u.x1 - w, maxY = u.y1 - h
  if (maxX < u.x0 - EPS || maxY < u.y0 - EPS) return null   // too big for the sheet

  const cx = clamp(desiredX, u.x0, maxX)
  const cy = clamp(desiredY, u.y0, maxY)
  if (freeAt(cx, cy, w, h, others, sheet.stock, gap, moving)) return { x: cx, y: cy }

  // Every edge a part can butt against: the sheet's usable edges, and each other
  // part's four sides at the gap (right of / above it AND left of / below it, so
  // a part dropped just short of a neighbour lands beside it, not across the sheet).
  const xs = new Set<number>([u.x0, maxX, cx])
  const ys = new Set<number>([u.y0, maxY, cy])
  for (const o of others) {
    xs.add(o.x + o.w + gap); xs.add(o.x - w - gap); xs.add(o.x); xs.add(o.x + o.w - w)
    ys.add(o.y + o.h + gap); ys.add(o.y - h - gap); ys.add(o.y); ys.add(o.y + o.h - h)
  }
  // True shapes near the drop: line any outline corner of a neighbour up with
  // any corner of the moving part (at the gap, or flush), so a part can tuck
  // into an L's empty corner, or an L can wrap round a part.
  if (moving || others.some(o => o.loop)) {
    const R = Math.max(w, h) + 2 * gap
    const own = moving ?? rectPts({ x: 0, y: 0, w, h })
    const mx = [...new Set(own.map(p => p.x))], my = [...new Set(own.map(p => p.y))]
    for (const o of others) {
      if (o.x > cx + w + R || o.x + o.w < cx - R || o.y > cy + h + R || o.y + o.h < cy - R) continue
      const pts = o.loop ?? rectPts(o)
      for (const ox of new Set(pts.map(p => p.x))) for (const m of mx) { xs.add(ox - m + gap); xs.add(ox - m - gap); xs.add(ox - m) }
      for (const oy of new Set(pts.map(p => p.y))) for (const m of my) { ys.add(oy - m + gap); ys.add(oy - m - gap); ys.add(oy - m) }
    }
  }

  // Nearest first; the first clear spot wins.
  const cands: { x: number; y: number; d: number }[] = []
  for (const x of xs) for (const y of ys) {
    if (x < u.x0 - EPS || y < u.y0 - EPS || x > maxX + EPS || y > maxY + EPS) continue
    cands.push({ x, y, d: (x - desiredX) ** 2 + (y - desiredY) ** 2 })
  }
  cands.sort((a, b) => a.d - b.d)
  for (const c of cands) if (freeAt(c.x, c.y, w, h, others, sheet.stock, gap, moving)) return { x: c.x, y: c.y }
  return null
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

// Best position near sheet centre (used for paste / drag-from-pool).
export function findBestPlacement(sheet: NestedSheet, w: number, h: number, gap: number, shapes: ShapeOpts = {}): { x: number; y: number } | null {
  const u = usableBounds(sheet.stock)
  return findNearestValid(sheet, null, w, h, (u.x0 + u.x1) / 2 - w / 2, (u.y0 + u.y1) / 2 - h / 2, gap, shapes)
}

export function sheetEfficiency(sheet: NestedSheet): number {
  const u = usableBounds(sheet.stock)
  const area = (u.x1 - u.x0) * (u.y1 - u.y0)
  if (area <= 0) return 0
  return sheet.placements.reduce((a, p) => a + placedArea(p), 0) / area
}

// A paired part counts its real outline: its rectangle overlaps its partner's.
export const placedArea = (p: Pick<Placement, 'w' | 'h' | 'trueArea'>) => p.trueArea ?? p.w * p.h

export function clonePlacement(p: Placement, uid: string): Placement {
  return { ...p, uid }
}
