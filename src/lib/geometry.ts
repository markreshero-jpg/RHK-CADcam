import { Wall, CabinetInstance } from './types'

export interface Pt { x: number; y: number }

// ── Constants ─────────────────────────────────────────────────────────────────

export const MIN_ZOOM    = 0.02
export const MAX_ZOOM    = 3
export const MIN_WALL_LEN = 10    // mm
export const SNAP_PX     = 14    // endpoint snap radius in screen pixels
export const WALL_SNAP_PX = 80   // cabinet-to-wall snap radius in screen pixels

export const CAB_FILL: Record<string, string> = {
  base: '#1e3a5f', wall: '#1a3a20', tall: '#2d1b4e',
  base_corner: '#1e3a5f', wall_corner: '#1a3a20', tall_corner: '#2d1b4e',
}
export const CAB_FILL_SEL: Record<string, string> = {
  base: '#2563eb', wall: '#16a34a', tall: '#7c3aed',
  base_corner: '#2563eb', wall_corner: '#16a34a', tall_corner: '#7c3aed',
}

// ── Cabinet collision rules ───────────────────────────────────────────────────
// Base and wall units sit at different heights so they never physically conflict.
// Tall units run full height and block both. Everything else blocks same-class.
function cabTypeGroup(cls: string): 'base' | 'wall' | 'tall' {
  if (cls === 'base' || cls === 'base_corner') return 'base'
  if (cls === 'wall' || cls === 'wall_corner') return 'wall'
  return 'tall'
}
export function cabBlocks(mover: string, obstacle: string): boolean {
  const m = cabTypeGroup(mover), o = cabTypeGroup(obstacle)
  return !((m === 'base' && o === 'wall') || (m === 'wall' && o === 'base'))
}

// ── Basic math ────────────────────────────────────────────────────────────────

export function toRad(d: number) { return d * Math.PI / 180 }
export function toDeg(r: number) { return r * 180 / Math.PI }
export function dist(a: Pt, b: Pt) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) }

// ── Wall helpers ──────────────────────────────────────────────────────────────

export function wallEnd(w: Wall): Pt {
  return { x: w.pos_x + w.length * Math.cos(toRad(w.angle)), y: w.pos_y + w.length * Math.sin(toRad(w.angle)) }
}

export function wallDir(w: Wall): Pt {
  return { x: Math.cos(toRad(w.angle)), y: Math.sin(toRad(w.angle)) }
}

// Returns [insideStart, insideEnd, outsideEnd, outsideStart].
// Outside direction is a fixed convention (left-perp of travel) used for previews.
// Actual rendered walls use wallMitrePolygon which applies wallInwardNormal.
export function wallCorners(w: Wall): Pt[] {
  const d = wallDir(w)
  const e = wallEnd(w)
  const ox = d.y * w.thickness, oy = -d.x * w.thickness
  return [
    { x: w.pos_x,      y: w.pos_y      },
    { x: e.x,          y: e.y          },
    { x: e.x + ox,     y: e.y + oy     },
    { x: w.pos_x + ox, y: w.pos_y + oy },
  ]
}

export function wallPolygon(w: Wall): string {
  return wallCorners(w).map(c => `${c.x},${c.y}`).join(' ')
}

export function wallInwardNormal(w: Wall, cx: number, cy: number): Pt {
  const d = wallDir(w)
  const mid = { x: w.pos_x + w.length * 0.5 * d.x, y: w.pos_y + w.length * 0.5 * d.y }
  const p1 = { x: -d.y, y: d.x }
  return (p1.x * (cx - mid.x) + p1.y * (cy - mid.y)) >= 0 ? p1 : { x: d.y, y: -d.x }
}

export function centroid(walls: Wall[]): Pt {
  if (!walls.length) return { x: 0, y: 0 }
  const pts = walls.flatMap(w => [{ x: w.pos_x, y: w.pos_y }, wallEnd(w)])
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }
}

// ── Intersection helpers ──────────────────────────────────────────────────────

export function lineIntersect(p1: Pt, d1: Pt, p2: Pt, d2: Pt): Pt | null {
  const denom = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(denom) < 1e-8) return null
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y }
}

export function ptToSeg(p: Pt, a: Pt, b: Pt): { dist: number; proj: Pt } {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-10) return { dist: dist(p, a), proj: a }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  const proj = { x: a.x + t * dx, y: a.y + t * dy }
  return { dist: dist(p, proj), proj }
}

// ── Mitre polygon ─────────────────────────────────────────────────────────────
// pos_x/pos_y is the inside face start; wall body extends in the -wallInwardNormal direction.
// Miter: when two walls share an inside corner, intersect their outside face lines.

export function wallMitrePolygon(w: Wall, walls: Wall[], cx: number, cy: number): string {
  if (w.wall_type === 'island') return ''
  const d = wallDir(w)
  const inward = wallInwardNormal(w, cx, cy)
  const thick = w.thickness

  const s = { x: w.pos_x, y: w.pos_y }
  const e = wallEnd(w)
  const outX = -inward.x * thick, outY = -inward.y * thick

  let pSO = { x: s.x + outX, y: s.y + outY }
  let pEO = { x: e.x + outX, y: e.y + outY }

  const JSNAP = 5

  for (const o of walls) {
    if (o.id === w.id || o.wall_type === 'island') continue
    const od = wallDir(o)
    const oInward = wallInwardNormal(o, cx, cy)
    const oThick = o.thickness
    const oS = { x: o.pos_x, y: o.pos_y }
    const oE = wallEnd(o)
    const oOX = -oInward.x * oThick, oOY = -oInward.y * oThick

    if (dist(s, oS) < JSNAP) pSO = lineIntersect(pSO, d, { x: oS.x + oOX, y: oS.y + oOY }, od) ?? pSO
    if (dist(s, oE) < JSNAP) pSO = lineIntersect(pSO, d, { x: oE.x + oOX, y: oE.y + oOY }, od) ?? pSO
    if (dist(e, oS) < JSNAP) pEO = lineIntersect(pEO, d, { x: oS.x + oOX, y: oS.y + oOY }, od) ?? pEO
    if (dist(e, oE) < JSNAP) pEO = lineIntersect(pEO, d, { x: oE.x + oOX, y: oE.y + oOY }, od) ?? pEO
  }

  return [s, e, pEO, pSO].map(p => `${p.x},${p.y}`).join(' ')
}

// ── Snapping ──────────────────────────────────────────────────────────────────

// Snaps to inside face corners only (the two endpoints of each wall's inside face).
export function snapEndpoint(p: Pt, walls: Wall[], radiusMm: number): Pt {
  let best = p, bestD = radiusMm
  for (const w of walls) {
    if (w.wall_type === 'island') continue
    for (const c of [{ x: w.pos_x, y: w.pos_y }, wallEnd(w)]) {
      const d = dist(p, c); if (d < bestD) { bestD = d; best = c }
    }
  }
  return best
}

export function snapAngle(start: Pt, end: Pt, stepDeg: number): Pt {
  const dx = end.x - start.x, dy = end.y - start.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return end
  const step = toRad(stepDeg)
  const snapped = Math.round(Math.atan2(dy, dx) / step) * step
  return { x: start.x + len * Math.cos(snapped), y: start.y + len * Math.sin(snapped) }
}

// ── Cabinet helpers ───────────────────────────────────────────────────────────

export function nearestWall(p: Pt, walls: Wall[], cabDX: number, maxDistMm: number): { wall: Wall; pos_x: number; pos_y: number } | null {
  let best: { wall: Wall; pos_x: number; pos_y: number; d: number } | null = null
  for (const w of walls) {
    const d = wallDir(w)
    const t = Math.max(0, Math.min(w.length - cabDX, (p.x - w.pos_x) * d.x + (p.y - w.pos_y) * d.y))
    const nx = w.pos_x + t * d.x, ny = w.pos_y + t * d.y
    const dd = dist(p, { x: nx, y: ny })
    if (dd < maxDistMm && (!best || dd < best.d)) best = { wall: w, pos_x: nx, pos_y: ny, d: dd }
  }
  return best
}

export function findFreeSlot(desired: number, dx: number, wallLen: number, occupied: { t: number; dx: number }[]): number {
  const clamped = Math.max(0, Math.min(wallLen - dx, desired))
  const conflicts = occupied.filter(o => clamped < o.t + o.dx && clamped + dx > o.t)
  if (!conflicts.length) return clamped
  const sorted = [...conflicts].sort((a, b) => a.t - b.t)
  const leftT  = sorted[0].t - dx
  const rightT = sorted[sorted.length - 1].t + sorted[sorted.length - 1].dx
  const leftOk  = leftT >= 0            && !occupied.some(o => leftT  < o.t + o.dx && leftT  + dx > o.t)
  const rightOk = rightT + dx <= wallLen && !occupied.some(o => rightT < o.t + o.dx && rightT + dx > o.t)
  if (!leftOk && !rightOk) return clamped
  if (!leftOk)  return rightT
  if (!rightOk) return leftT
  return Math.abs(leftT - desired) <= Math.abs(rightT - desired) ? leftT : rightT
}

export function cabT(cab: CabinetInstance, wall: Wall): number {
  const d = wallDir(wall)
  return (cab.pos_x - wall.pos_x) * d.x + (cab.pos_y - wall.pos_y) * d.y
}

export function islandCabPerp(cab: CabinetInstance, wall: Wall, inwardPerp: Pt): Pt {
  if (wall.wall_type !== 'island') return inwardPerp
  const diff = ((cab.rotation - wall.angle) % 360 + 360) % 360
  return diff > 90 && diff < 270 ? { x: -inwardPerp.x, y: -inwardPerp.y } : inwardPerp
}

// pos_x/pos_y is now the inside face; cabinets start there with no perpendicular offset.
export function cabinetPolygon(cab: CabinetInstance, wall: Wall, perp: Pt): string {
  const d = wallDir(wall)
  const ax = cab.pos_x, ay = cab.pos_y
  const bx = ax + cab.dx * d.x,    by = ay + cab.dx * d.y
  const cx = bx + cab.dz * perp.x, cy = by + cab.dz * perp.y
  const ex = ax + cab.dz * perp.x, ey = ay + cab.dz * perp.y
  return `${ax},${ay} ${bx},${by} ${cx},${cy} ${ex},${ey}`
}

export function cabinetCenterPt(cab: CabinetInstance, wall: Wall, perp: Pt): Pt {
  const d = wallDir(wall)
  return {
    x: cab.pos_x + (cab.dx / 2) * d.x + (cab.dz / 2) * perp.x,
    y: cab.pos_y + (cab.dx / 2) * d.y + (cab.dz / 2) * perp.y,
  }
}

export function nextLabel(cabinets: CabinetInstance[], cls: string): string {
  const prefix = cls === 'base' ? 'BC' : cls === 'wall' ? 'WC' : cls === 'tall' ? 'TC'
    : cls === 'base_corner' ? 'BCC' : cls === 'wall_corner' ? 'WCC' : cls === 'tall_corner' ? 'TCC' : 'EP'
  const nums = cabinets.filter(c => c.label?.startsWith(prefix + '-')).map(c => parseInt(c.label!.slice(3)) || 0)
  return `${prefix}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, '0')}`
}

export function gridDots(panX: number, panY: number, zoom: number, svgW: number, svgH: number): Pt[] {
  if (zoom < 0.04) return []
  const step = zoom < 0.08 ? 500 : zoom < 0.15 ? 200 : zoom < 0.4 ? 100 : 50
  const wL = Math.floor((-panX / zoom) / step) * step
  const wT = Math.floor((-panY / zoom) / step) * step
  const wR = (-panX + svgW) / zoom, wB = (-panY + svgH) / zoom
  const dots: Pt[] = []
  for (let x = wL; x <= wR + step; x += step)
    for (let y = wT; y <= wB + step; y += step)
      dots.push({ x, y })
  return dots.length <= 3000 ? dots : []
}
