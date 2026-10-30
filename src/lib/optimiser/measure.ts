// ============================================================
// Stage 5 measure tool — snap a sheet point (mm, bottom-left origin)
// to the nearest boring-hole centre, part corner, or part / sheet
// edge. Priority: hole centre > corner > line, each within `tol` mm.
// ============================================================

import type { ShapePt } from '@/src/lib/shapePath'

export type SnapKind = 'hole' | 'corner' | 'line' | 'free'
export interface MeasureSnap { x: number; y: number; kind: SnapKind }

/** Closed loops (sheet axes, absolute mm): part outlines / rects, cutouts, sheet border. */
export interface SnapSources {
  loops: ShapePt[][]
  holes: { x: number; y: number; diameter: number }[]
}

export function snapPoint(mx: number, my: number, src: SnapSources, tol: number): MeasureSnap {
  // Boring holes: inside the hole or within tol of its centre.
  let best: MeasureSnap | null = null, bestD = Infinity
  for (const h of src.holes) {
    const d = Math.hypot(h.x - mx, h.y - my)
    if (d <= Math.max(tol, h.diameter / 2) && d < bestD) { best = { x: h.x, y: h.y, kind: 'hole' }; bestD = d }
  }
  if (best) return best

  for (const loop of src.loops) for (const p of loop) {
    const d = Math.hypot(p.x - mx, p.y - my)
    if (d <= tol && d < bestD) { best = { x: p.x, y: p.y, kind: 'corner' }; bestD = d }
  }
  if (best) return best

  for (const loop of src.loops) for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length]
    const q = nearestOnSegment(mx, my, a, b)
    const d = Math.hypot(q.x - mx, q.y - my)
    if (d <= tol && d < bestD) { best = { ...q, kind: 'line' }; bestD = d }
  }
  return best ?? { x: mx, y: my, kind: 'free' }
}

function nearestOnSegment(px: number, py: number, a: ShapePt, b: ShapePt): ShapePt {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2)) : 0
  return { x: a.x + t * dx, y: a.y + t * dy }
}

export const rectLoop = (x: number, y: number, w: number, h: number): ShapePt[] =>
  [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
