// CAD object snaps for the annotation tools (z_CAD_tool B2) — endpoint, midpoint,
// centre, intersection, perpendicular and nearest-on-edge, over whatever geometry the
// view collects (walls, cabinets, door fronts, appliances, benchtops, other notes).
// Pure: the view builds a SnapGeometry in its frame, this picks the snap.

import type { Pt } from './geometry'

export type CadSnapKind = 'end' | 'mid' | 'centre' | 'intersection' | 'perpendicular' | 'nearest'
export type CadSnapSource = 'walls' | 'cabinets' | 'fronts' | 'fixtures' | 'benchtops' | 'annotations'

export const CAD_SNAP_KINDS: { id: CadSnapKind; label: string }[] = [
  { id: 'end',           label: 'Endpoints / corners' },
  { id: 'mid',           label: 'Midpoints' },
  { id: 'centre',        label: 'Centres' },
  { id: 'intersection',  label: 'Intersections' },
  { id: 'perpendicular', label: 'Perpendicular' },
  { id: 'nearest',       label: 'Nearest on edge' },
]
export const CAD_SNAP_SOURCES: { id: CadSnapSource; label: string }[] = [
  { id: 'walls',       label: 'Walls' },
  { id: 'cabinets',    label: 'Cabinets' },
  { id: 'fronts',      label: 'Door / drawer fronts' },
  { id: 'fixtures',    label: 'Appliances & fixtures' },
  { id: 'benchtops',   label: 'Benchtops' },
  { id: 'annotations', label: 'Notes & markup' },
]

export interface CadSnapSettings {
  enabled: boolean
  kinds:   Record<CadSnapKind, boolean>
  sources: Record<CadSnapSource, boolean>
}

export const DEFAULT_CAD_SNAP: CadSnapSettings = {
  enabled: true,
  kinds:   { end: true, mid: true, centre: true, intersection: true, perpendicular: true, nearest: true },
  sources: { walls: true, cabinets: true, fronts: true, fixtures: true, benchtops: true, annotations: true },
}

export function normaliseCadSnap(raw: unknown): CadSnapSettings {
  const r = (raw ?? {}) as Partial<CadSnapSettings>
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
    kinds:   { ...DEFAULT_CAD_SNAP.kinds, ...(r.kinds ?? {}) },
    sources: { ...DEFAULT_CAD_SNAP.sources, ...(r.sources ?? {}) },
  }
}

/** One thing to snap to. `owner` = annotation id, so a note can skip its own geometry. */
export interface SnapSeg   { a: Pt; b: Pt; src: CadSnapSource; owner?: string }
export interface SnapPoint { p: Pt; kind: 'end' | 'mid' | 'centre'; src: CadSnapSource; owner?: string }
export interface SnapGeometry { segs: SnapSeg[]; points: SnapPoint[] }

export const EMPTY_SNAP_GEOMETRY: SnapGeometry = { segs: [], points: [] }

/** Add a closed / open outline: its corners (end), edge midpoints (mid) and edges. */
export function addOutline(g: SnapGeometry, pts: Pt[], src: CadSnapSource, closed: boolean, owner?: string, centre = false): void {
  const n = pts.length
  if (!n) return
  for (const p of pts) g.points.push({ p, kind: 'end', src, owner })
  const segCount = closed ? n : n - 1
  for (let i = 0; i < segCount; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    if (a.x === b.x && a.y === b.y) continue
    g.segs.push({ a, b, src, owner })
    g.points.push({ p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, kind: 'mid', src, owner })
  }
  if (centre && n >= 3) {
    const c = pts.reduce((s, p) => ({ x: s.x + p.x / n, y: s.y + p.y / n }), { x: 0, y: 0 })
    g.points.push({ p: c, kind: 'centre', src, owner })
  }
}

/** Snap targets on the shape itself while it is drawn or a vertex is dragged (the
 *  notes geometry skips it by owner id). `moving` = the point under the cursor: it is
 *  left out, and so are the segments that run into it unless keepSegs (a drawing's
 *  last point, whose segment back is already fixed). */
export function ownShapeGeometry(pts: Pt[], moving: number, closed: boolean, keepSegs = false): SnapGeometry {
  const g: SnapGeometry = { segs: [], points: [] }
  const n = pts.length
  pts.forEach((p, i) => { if (i !== moving) g.points.push({ p, kind: 'end', src: 'annotations' }) })
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const j = (i + 1) % n
    if (!keepSegs && (i === moving || j === moving)) continue
    const a = pts[i], b = pts[j]
    if (a.x === b.x && a.y === b.y) continue
    g.segs.push({ a, b, src: 'annotations' })
    g.points.push({ p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, kind: 'mid', src: 'annotations' })
  }
  return g
}

export interface CadSnapResult { pt: Pt; kind: CadSnapKind | null }

const d2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

export function closestOnSeg(p: Pt, a: Pt, b: Pt): Pt {
  const vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy
  if (!L) return a
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L))
  return { x: a.x + vx * t, y: a.y + vy * t }
}

/** Proper crossing point of two segments (null when parallel / apart). */
export function segIntersection(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y }
  const den = r.x * s.y - r.y * s.x
  if (Math.abs(den) < 1e-12) return null
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null
  return { x: a.x + r.x * t, y: a.y + r.y * t }
}

/** Foot of the perpendicular from p onto segment a–b, if it lands on the segment. */
export function perpFoot(p: Pt, a: Pt, b: Pt): Pt | null {
  const vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy
  if (!L) return null
  const t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / L
  if (t < 0 || t > 1) return null
  return { x: a.x + vx * t, y: a.y + vy * t }
}

// Point snaps beat edge snaps: a corner within reach wins over the edge running into it.
const RANK: Record<CadSnapKind, number> = { end: 0, intersection: 0, centre: 0, mid: 1, perpendicular: 2, nearest: 3 }

/** The snap for `cur` within `radius` (frame mm). prev = the previous point of the shape
 *  being drawn (perpendicular). exclude = annotation ids to ignore (the one being edited).
 *  geo may be several sets (room + notes + the shape being drawn). */
export function cadSnap(cur: Pt, geoIn: SnapGeometry | SnapGeometry[], s: CadSnapSettings, radius: number,
  prev?: Pt | null, exclude?: ReadonlySet<string>): CadSnapResult {
  if (!s.enabled) return { pt: cur, kind: null }
  const geos = Array.isArray(geoIn) ? geoIn : [geoIn]
  const r2 = radius * radius
  const allowed = (src: CadSnapSource, owner?: string) => s.sources[src] && !(owner && exclude?.has(owner))
  let best: { pt: Pt; kind: CadSnapKind; d: number } | null = null
  const offer = (pt: Pt, kind: CadSnapKind) => {
    if (!s.kinds[kind]) return
    const d = d2(pt, cur)
    if (d > r2) return
    if (!best || RANK[kind] < RANK[best.kind] || (RANK[kind] === RANK[best.kind] && d < best.d)) best = { pt, kind, d }
  }

  for (const geo of geos) for (const q of geo.points) if (allowed(q.src, q.owner)) offer(q.p, q.kind)

  // Edges near the cursor: nearest, perpendicular, and crossings between them.
  const near: SnapSeg[] = []
  for (const geo of geos) for (const sg of geo.segs) {
    if (!allowed(sg.src, sg.owner)) continue
    const c = closestOnSeg(cur, sg.a, sg.b)
    if (d2(c, cur) > r2) continue
    near.push(sg)
    offer(c, 'nearest')
    if (prev) { const f = perpFoot(prev, sg.a, sg.b); if (f) offer(f, 'perpendicular') }
  }
  if (s.kinds.intersection) {
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
      const x = segIntersection(near[i].a, near[i].b, near[j].a, near[j].b)
      if (x) offer(x, 'intersection')
    }
  }
  const b = best as { pt: Pt; kind: CadSnapKind } | null
  return b ? { pt: b.pt, kind: b.kind } : { pt: cur, kind: null }
}
