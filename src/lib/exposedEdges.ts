// ── Exposed edges (z_display_layers "Open parts solid") ──────────────────────
// Splits a part's elevation outline into the stretches hidden behind a front
// (door / drawer front / false panel) and the stretches seen in the open.
// Renderers draw the open stretches solid and the hidden ones in the layer's
// own style, so an open cabinet — or the open section of one — reads as solid
// boards while the parts behind doors stay dashed.
//
// Coordinates are cabinet elevation coords: x along the cabinet, y up.

export interface CoverRect { x0: number; x1: number; y0: number; y1: number }
export interface EdgeSeg { x1: number; y1: number; x2: number; y2: number; exposed: boolean }

/** Snap tolerance: an edge on a front's boundary counts as behind it. */
const EPS = 0.5
/** Open runs shorter than this on an edge that is otherwise hidden (the 2–3 mm
 *  gap between two fronts, a reveal at a cabinet end) stay hidden — they'd only
 *  print as solid ticks. Real openings (finger-pull gaps, open shelves) are wider. */
const MIN_OPEN = 6

/** Front rect in elevation coords from an { ex, ey(top), ew, eh } rect. */
export function coverOf(r: { ex: number; ey: number; ew: number; eh: number }): CoverRect {
  return { x0: r.ex, x1: r.ex + r.ew, y0: r.ey - r.eh, y1: r.ey }
}

/** Split lo..hi into hidden / open runs given the hidden intervals. */
function runs(lo: number, hi: number, hidden: [number, number][]): { a: number; b: number; exposed: boolean }[] {
  const cuts = hidden
    .map(([a, b]) => [Math.max(lo, a), Math.min(hi, b)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0])
  // Merge overlapping hidden intervals.
  const merged: [number, number][] = []
  for (const c of cuts) {
    const last = merged[merged.length - 1]
    if (last && c[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], c[1])
    else merged.push([c[0], c[1]])
  }
  const out: { a: number; b: number; exposed: boolean }[] = []
  let cur = lo
  for (const [a, b] of merged) {
    if (a > cur) out.push({ a: cur, b: a, exposed: true })
    out.push({ a, b, exposed: false })
    cur = b
  }
  if (cur < hi) out.push({ a: cur, b: hi, exposed: true })
  // Absorb short open slivers when the edge is partly hidden.
  if (out.some(r => !r.exposed)) for (const r of out) if (r.exposed && r.b - r.a < MIN_OPEN) r.exposed = false
  // Join neighbours with the same state.
  const joined: typeof out = []
  for (const r of out) {
    const last = joined[joined.length - 1]
    if (last && last.exposed === r.exposed) last.b = r.b
    else joined.push({ ...r })
  }
  return joined
}

/** The four outline edges of a part rect, each split into open / hidden runs.
 *  `r` = { ex, ey (top), ew, eh } in cabinet elevation coords. */
export function rectEdgeSegs(r: { ex: number; ey: number; ew: number; eh: number }, covers: CoverRect[]): EdgeSeg[] {
  const x0 = r.ex, x1 = r.ex + r.ew, yT = r.ey, yB = r.ey - r.eh
  const out: EdgeSeg[] = []
  const horiz = (y: number) => {
    const hidden = covers.filter(c => y >= c.y0 - EPS && y <= c.y1 + EPS).map(c => [c.x0, c.x1] as [number, number])
    for (const s of runs(x0, x1, hidden)) out.push({ x1: s.a, y1: y, x2: s.b, y2: y, exposed: s.exposed })
  }
  const vert = (x: number) => {
    const hidden = covers.filter(c => x >= c.x0 - EPS && x <= c.x1 + EPS).map(c => [c.y0, c.y1] as [number, number])
    for (const s of runs(yB, yT, hidden)) out.push({ x1: x, y1: s.a, x2: x, y2: s.b, exposed: s.exposed })
  }
  if (r.ew > 0) { horiz(yT); if (r.eh > 0) horiz(yB) }
  if (r.eh > 0) { vert(x0); if (r.ew > 0) vert(x1) }
  return out
}

/** True when any part of the rect's outline is in the open. */
export function anyExposed(segs: EdgeSeg[]): boolean {
  return segs.some(s => s.exposed)
}
