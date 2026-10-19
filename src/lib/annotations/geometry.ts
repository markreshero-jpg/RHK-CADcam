// CAD annotation geometry (z_CAD_tool/ANNOTATION-SPEC.md). Pure — shared by the
// canvas, the printed reports and (A7) cabinet sheets so they all draw alike.
//
// Two spaces:
//   frame  real mm in the view's frame (plan: room mm; elevation: wall u / z up;
//          sheet: cabinet-local). This is what geom stores.
//   svg    the drawing's SVG units. AnnotFrame maps frame → svg; `paper` (svg units
//          per paper mm) turns style sizes into drawing sizes.

import type { AnnotationKind } from '../types'
import type { ArrowType } from './style'

export interface Pt { x: number; y: number }

/** text: `at` = top-left of the text block (svg orientation), rot in degrees.
 *  width (paper mm) makes it a TEXT BOX — lines wrap to it; absent = point text.
 *  height (paper mm, B1): the box's drawn height — it still grows to fit the text. */
export interface TextGeom  { at: Pt; rot?: number; width?: number; height?: number; leader?: Pt[] }
/** bulges (B4b): per segment, 0 = straight, else an arc (see bulgeMid). closed: the last
 *  point joins back to the first (a closed outline drawn with lines). */
export interface LineGeom  { pts: Pt[]; bulges?: number[]; closed?: boolean }
export interface BoxGeom   { a: Pt; b: Pt; rot?: number }
export interface CloudGeom { pts: Pt[] }
/** Aligned (no axis): offset = signed distance (frame mm) of the dim line from p1→p2,
 *  + = left of p1→p2. Linear (A5): axis 'x' measures the horizontal span with the dim
 *  line at y = p1.y + offset; axis 'y' the vertical span at x = p1.x + offset. */
export interface DimGeom   { p1: Pt; p2: Pt; offset: number; axis?: 'x' | 'y' }
/** B3. Arc: centre, radius, and the angles it runs between — from a0 to a1 in degrees,
 *  svg orientation (increasing = clockwise on screen). Circle: centre + radius. */
export interface ArcGeom    { c: Pt; r: number; a0: number; a1: number }
export interface CircleGeom { c: Pt; r: number }
export type AnnotationGeom = TextGeom | LineGeom | BoxGeom | CloudGeom | DimGeom | ArcGeom | CircleGeom

/** frame → svg: svg = (ox + s·x, oy ± s·y). flipY for frames whose y runs up (elevation). */
export interface AnnotFrame { ox: number; oy: number; s: number; flipY: boolean }
export const IDENTITY_FRAME: AnnotFrame = { ox: 0, oy: 0, s: 1, flipY: false }

export function mapPt(f: AnnotFrame, p: Pt): Pt {
  return { x: f.ox + f.s * p.x, y: f.oy + (f.flipY ? -1 : 1) * f.s * p.y }
}
/** Frame rotation (deg) as drawn in svg. */
export function mapRot(f: AnnotFrame, rot: number | undefined): number {
  return (f.flipY ? -1 : 1) * (rot ?? 0)
}

// ── Layer items (display layers, Annotations group) ──────────────────────────

export function annotLayerItem(kind: AnnotationKind): 'annot_text' | 'annot_dims' | 'annot_markup' {
  return kind === 'text' ? 'annot_text' : kind === 'dim' ? 'annot_dims' : 'annot_markup'
}

// ── Vectors ──────────────────────────────────────────────────────────────────

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k })
const len = (a: Pt) => Math.hypot(a.x, a.y)
const unit = (a: Pt): Pt => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l } }
const f2 = (n: number) => +n.toFixed(3)
const P = (p: Pt) => `${f2(p.x)} ${f2(p.y)}`

export function rotatePt(p: Pt, deg: number): Pt {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

// ── Arrowheads ───────────────────────────────────────────────────────────────

export interface ArrowShape {
  d:      string
  filled: boolean
  /** Distance to pull the line end back from the tip so it doesn't poke through. */
  trim:   number
}

/** Arrowhead at `tip`, pointing away from `from`. size = head length (svg units). */
export function arrowHead(tip: Pt, from: Pt, type: ArrowType, size: number): ArrowShape | null {
  if (type === 'none' || size <= 0) return null
  const u = unit(sub(tip, from))           // along the line, towards the tip
  const n = { x: -u.y, y: u.x }
  const back = sub(tip, mul(u, size))
  const hw = size * 0.33
  switch (type) {
    case 'closed':
    case 'closed_open': {
      const b1 = add(back, mul(n, hw)), b2 = sub(back, mul(n, hw))
      return { d: `M${P(tip)}L${P(b1)}L${P(b2)}Z`, filled: type === 'closed', trim: size }
    }
    case 'open': {
      const b1 = add(back, mul(n, hw * 1.2)), b2 = sub(back, mul(n, hw * 1.2))
      return { d: `M${P(b1)}L${P(tip)}L${P(b2)}`, filled: false, trim: 0 }
    }
    case 'dot':
    case 'dot_open': {
      const r = size * 0.25
      return { d: circlePath(tip, r), filled: type === 'dot', trim: type === 'dot_open' ? r : 0 }
    }
    case 'tick': {
      const t = unit(add(u, n))                // 45° to the line
      const h = size * 0.45
      return { d: `M${P(sub(tip, mul(t, h)))}L${P(add(tip, mul(t, h)))}`, filled: false, trim: 0 }
    }
    case 'square': {
      const h = size * 0.2
      const c = [add(add(tip, mul(u, h)), mul(n, h)), add(sub(tip, mul(u, h)), mul(n, h)),
                 sub(sub(tip, mul(u, h)), mul(n, h)), sub(add(tip, mul(u, h)), mul(n, h))]
      return { d: `M${c.map(P).join('L')}Z`, filled: true, trim: 0 }
    }
  }
  return null
}

export function circlePath(c: Pt, r: number): string {
  return `M${f2(c.x - r)} ${f2(c.y)}a${f2(r)} ${f2(r)} 0 1 0 ${f2(2 * r)} 0a${f2(r)} ${f2(r)} 0 1 0 ${f2(-2 * r)} 0Z`
}

/** Pull `p` back towards `toward` by d (for trimming line ends under closed heads). */
export function trimEnd(p: Pt, toward: Pt, d: number): Pt {
  if (d <= 0) return p
  const v = sub(toward, p), l = len(v)
  return l <= d ? toward : add(p, mul(v, d / l))
}

// ── Text measuring + layout ──────────────────────────────────────────────────
// Arial/Helvetica advance widths (em) by character class — close enough that the
// canvas, the PDF and wrapping agree to a few %. Reports render Arial, Helvetica.

const NARROW = new Set("iIl.,:;'|!jft()[] ")
const WIDE = new Set('mwMW@')
function charEm(ch: string, bold: boolean): number {
  let w: number
  if (NARROW.has(ch)) w = ch === ' ' ? 0.278 : 0.29
  else if (WIDE.has(ch)) w = 0.86
  else if (ch >= '0' && ch <= '9') w = 0.556
  else if (ch >= 'A' && ch <= 'Z') w = 0.68
  else w = 0.53
  return bold ? w * 1.07 : w
}

/** Width of one line (same units as size). */
export function textWidth(str: string, size: number, bold = false): number {
  let em = 0
  for (const ch of str) em += charEm(ch, bold)
  return em * size
}

/** Split on newlines; with maxWidth, word-wrap each paragraph (a word longer than the
 *  box sits on its own line). */
export function wrapText(text: string, size: number, bold: boolean, maxWidth?: number): string[] {
  const paras = text.replace(/\r\n?/g, '\n').split('\n')
  if (!maxWidth || maxWidth <= 0) return paras
  const out: string[] = []
  for (const para of paras) {
    const words = para.split(/ +/)
    let line = ''
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (line && textWidth(next, size, bold) > maxWidth) { out.push(line); line = w }
      else line = next
    }
    out.push(line)
  }
  return out
}

export interface TextBlock {
  lines:     string[]
  /** Baseline y of each line from the block top. */
  baselines: number[]
  w:         number
  h:         number
  /** y of the first line's middle (leader attach height). */
  midFirst:  number
}

/** Layout in "size" units (paper mm × whatever the caller scales by). */
export function layoutText(text: string, size: number, opts: { bold?: boolean; lineSpacing?: number; width?: number; height?: number } = {}): TextBlock {
  const lines = wrapText(text, size, !!opts.bold, opts.width)
  const lh = size * (opts.lineSpacing ?? 1.3)
  const baselines = lines.map((_, i) => size * 0.9 + i * lh)
  const w = opts.width ?? Math.max(0, ...lines.map(l => textWidth(l, size, !!opts.bold)))
  const h = Math.max(size * 1.15 + (lines.length - 1) * lh, opts.height ?? 0)
  return { lines, baselines, w, h, midFirst: size * 0.55 }
}

/** Where a leader meets its text: middle of the first line, on whichever side (left /
 *  right, outside the padding) is nearer the leader's last point. Local block coords. */
export function leaderAttachLocal(block: TextBlock, pad: number, lastLocal: Pt): Pt {
  const left = { x: -pad, y: block.midFirst }, right = { x: block.w + pad, y: block.midFirst }
  return len(sub(lastLocal, left)) <= len(sub(lastLocal, right)) ? left : right
}

// ── Revision cloud ───────────────────────────────────────────────────────────

/** Closed scalloped path through svg-space points; bumps bulge outward, each about
 *  `bump` long along the edge. */
export function cloudPath(pts: Pt[], bump: number): string {
  if (pts.length < 3 || bump <= 0) return ''
  // Shoelace in svg coords (y down): > 0 = clockwise on screen → outward is the left of
  // each edge, which a sweep-1 arc bulges towards.
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    area += a.x * b.y - b.x * a.y
  }
  const sweep = area > 0 ? 1 : 0
  let d = `M${P(pts[0])}`
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    const L = len(sub(b, a))
    if (L === 0) continue
    const n = Math.max(1, Math.round(L / bump))
    const step = L / n, r = step * 0.62
    for (let k = 1; k <= n; k++) {
      const q = add(a, mul(sub(b, a), k / n))
      d += `A${f2(r)} ${f2(r)} 0 0 ${sweep} ${P(q)}`
    }
  }
  return d + 'Z'
}

// ── Manual dimension ─────────────────────────────────────────────────────────

export interface DimLayout {
  /** dimension line ends (frame mm) */
  d1: Pt; d2: Pt
  /** unit normal (frame) the dim line was pushed along */
  n: Pt
  /** measured length, frame mm */
  value: number
}

export function dimLayout(g: DimGeom): DimLayout {
  if (g.axis === 'x') {
    const y = g.p1.y + g.offset
    return { d1: { x: g.p1.x, y }, d2: { x: g.p2.x, y }, n: { x: 0, y: Math.sign(g.offset) || 1 }, value: Math.abs(g.p2.x - g.p1.x) }
  }
  if (g.axis === 'y') {
    const x = g.p1.x + g.offset
    return { d1: { x, y: g.p1.y }, d2: { x, y: g.p2.y }, n: { x: Math.sign(g.offset) || 1, y: 0 }, value: Math.abs(g.p2.y - g.p1.y) }
  }
  const u = unit(sub(g.p2, g.p1))
  const n = { x: -u.y, y: u.x }
  return {
    d1: add(g.p1, mul(n, g.offset)),
    d2: add(g.p2, mul(n, g.offset)),
    n, value: len(sub(g.p2, g.p1)),
  }
}

/** Text angle (deg, svg) for a line a→b, flipped so it never reads upside down.
 *  Range [-90, 90): vertical text reads bottom-to-top, as on drawings. */
export function readableAngle(a: Pt, b: Pt): number {
  let ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
  if (ang >= 90) ang -= 180
  else if (ang < -90) ang += 180
  return ang
}

/** The measured value, unless overridden. `<>` in an override stands for the value
 *  ("<> TBC" → "600 TBC"). */
export function dimText(value: number, override: string | null | undefined): string {
  const v = String(Math.round(value))
  if (!override?.trim()) return v
  return override.includes('<>') ? override.split('<>').join(v) : override
}

/** Offset that puts a dim's line through `cur` (see DimGeom). */
export function dimOffsetFor(g: Pick<DimGeom, 'p1' | 'p2' | 'axis'>, cur: Pt): number {
  if (g.axis === 'x') return cur.y - g.p1.y
  if (g.axis === 'y') return cur.x - g.p1.x
  const u = unit(sub(g.p2, g.p1))
  return (cur.x - g.p1.x) * -u.y + (cur.y - g.p1.y) * u.x
}

/** Linear dims pick their axis from where the line is pulled, like CAD's DIMLINEAR:
 *  pulled above / below the two points = horizontal, beside them = vertical. */
export function dimAxisFor(p1: Pt, p2: Pt, cur: Pt, prev: 'x' | 'y' = 'x'): 'x' | 'y' {
  const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x)
  const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y)
  const outX = cur.x < minX ? minX - cur.x : cur.x > maxX ? cur.x - maxX : 0
  const outY = cur.y < minY ? minY - cur.y : cur.y > maxY ? cur.y - maxY : 0
  if (outY > 0 && outX === 0) return 'x'
  if (outX > 0 && outY === 0) return 'y'
  if (outX === 0 && outY === 0) return prev
  return outY >= outX ? 'x' : 'y'
}

// ── Bounds (report viewBox) ──────────────────────────────────────────────────

/** Frame points an annotation covers. Text blocks need `paperToFrame` (frame mm per
 *  paper mm) to size the box. */
export function annotationFramePoints(kind: AnnotationKind, geom: AnnotationGeom, text: string | null, size: number, paperToFrame: number): Pt[] {
  switch (kind) {
    case 'text': {
      const g = geom as TextGeom
      const b = layoutText(text ?? '', size, { width: g.width, height: g.height })
      const w = b.w * paperToFrame, h = b.h * paperToFrame
      const corners = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
        .map(c => add(g.at, rotatePt(c, g.rot ?? 0)))
      return [...corners, ...(g.leader ?? [])]
    }
    case 'line':    { const g = geom as LineGeom; return sampleBulged(g.pts ?? [], g.bulges, !!g.closed) }
    case 'cloud':   return (geom as LineGeom).pts ?? []
    case 'rect':
    case 'ellipse': { const g = geom as BoxGeom; return [g.a, g.b, { x: g.a.x, y: g.b.y }, { x: g.b.x, y: g.a.y }] }
    case 'dim':     { const g = geom as DimGeom; const l = dimLayout(g); return [g.p1, g.p2, l.d1, l.d2] }
    case 'arc':     return arcSample(geom as ArcGeom, 16)
    case 'circle':  { const g = geom as CircleGeom; return [{ x: g.c.x - g.r, y: g.c.y - g.r }, { x: g.c.x + g.r, y: g.c.y + g.r }] }
  }
}

// ── Editing helpers (A2) ─────────────────────────────────────────────────────

/** svg → frame (inverse of mapPt). */
export function unmapPt(f: AnnotFrame, p: Pt): Pt {
  return { x: (p.x - f.ox) / f.s, y: (f.flipY ? -1 : 1) * (p.y - f.oy) / f.s }
}

/** Move every point of a geometry by (dx, dy) frame mm. */
export function translateGeom(kind: AnnotationKind, geom: AnnotationGeom, dx: number, dy: number): AnnotationGeom {
  const t = (p: Pt): Pt => ({ x: p.x + dx, y: p.y + dy })
  switch (kind) {
    case 'text':    { const g = geom as TextGeom; return { ...g, at: t(g.at), leader: g.leader?.map(t) } }
    case 'line':
    case 'cloud':   { const g = geom as LineGeom; return { ...g, pts: (g.pts ?? []).map(t) } }
    case 'rect':
    case 'ellipse': { const g = geom as BoxGeom; return { ...g, a: t(g.a), b: t(g.b) } }
    case 'dim':     { const g = geom as DimGeom; return { ...g, p1: t(g.p1), p2: t(g.p2) } }
    case 'arc':
    case 'circle':  { const g = geom as ArcGeom | CircleGeom; return { ...g, c: t(g.c) } }
  }
}

export interface Box { minX: number; minY: number; maxX: number; maxY: number }

export function boundsOf(pts: Pt[]): Box | null {
  if (!pts.length) return null
  return {
    minX: Math.min(...pts.map(p => p.x)), minY: Math.min(...pts.map(p => p.y)),
    maxX: Math.max(...pts.map(p => p.x)), maxY: Math.max(...pts.map(p => p.y)),
  }
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

/** The text block's outline (incl. background padding) as 4 frame corners, clockwise
 *  from the top-left. paperToFrame = frame mm per paper mm. */
export function textCorners(g: TextGeom, block: TextBlock, pad: number, paperToFrame: number): Pt[] {
  const k = paperToFrame
  return [
    { x: -pad, y: -pad }, { x: block.w + pad, y: -pad },
    { x: block.w + pad, y: block.h + pad }, { x: -pad, y: block.h + pad },
  ].map(c => add(g.at, rotatePt(mul(c, k), g.rot ?? 0)))
}

/** Snap an angle (deg) to the nearest quarter turn when within `tol` degrees. */
export function snapQuarter(deg: number, tol = 4): number {
  const n = ((deg % 360) + 360) % 360
  for (const q of [0, 90, 180, 270, 360]) if (Math.abs(n - q) <= tol) return q % 360
  return Math.round(n * 10) / 10
}

/** Line drawing (A3): with no snap target, lock the segment from `prev` to the nearest
 *  `step`° direction when within `tol`° of it (length kept). */
export function angleSnap(prev: Pt, p: Pt, step = 15, tol = 4): Pt {
  const v = sub(p, prev), L = len(v)
  if (L === 0) return p
  const ang = Math.atan2(v.y, v.x) * 180 / Math.PI
  const near = Math.round(ang / step) * step
  if (Math.abs(ang - near) > tol) return p
  const r = near * Math.PI / 180
  return { x: prev.x + Math.cos(r) * L, y: prev.y + Math.sin(r) * L }
}

/** Drop consecutive points closer than `eps` (a double-click's repeat click). */
export function dedupePts(pts: Pt[], eps: number): Pt[] {
  const out: Pt[] = []
  for (const p of pts) if (!out.length || len(sub(p, out[out.length - 1])) > eps) out.push(p)
  return out
}

/** Where a new leader's text goes: just right of the landing point, first line centred
 *  on it. Frame mm; size / paperToFrame as for the block. */
export function leaderTextAt(landing: Pt, tip: Pt, size: number, paperToFrame: number): Pt {
  const block = layoutText('M', size)
  const right = landing.x >= tip.x
  const gap = 1.5 * paperToFrame
  return { x: right ? landing.x + gap : landing.x - gap - block.w * 4 * paperToFrame, y: landing.y - block.midFirst * paperToFrame }
}

// ── Boxes (A4) ───────────────────────────────────────────────────────────────

/** The 4 corners of an (unrotated) box geom, in order a, (b.x,a.y), b, (a.x,b.y). */
export function boxCorners(g: BoxGeom): Pt[] {
  return [g.a, { x: g.b.x, y: g.a.y }, g.b, { x: g.a.x, y: g.b.y }]
}

/** Move corner i (boxCorners order) to p; the opposite corner stays put. */
export function setBoxCorner(g: BoxGeom, i: number, p: Pt): BoxGeom {
  switch (i) {
    case 0:  return { ...g, a: p }
    case 1:  return { ...g, a: { x: g.a.x, y: p.y }, b: { x: p.x, y: g.b.y } }
    case 2:  return { ...g, b: p }
    default: return { ...g, a: { x: p.x, y: g.a.y }, b: { x: g.b.x, y: p.y } }
  }
}

/** A rectangle as a closed point list (rectangular revision cloud). */
export function rectPts(a: Pt, b: Pt): Pt[] {
  return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]
}

// ── Measuring (B2b) ──────────────────────────────────────────────────────────

/** Drawing-convention angle of a→b in degrees: 0 = right, counter-clockwise as seen on
 *  screen (svg y runs down), 0–360. */
export function segAngle(a: Pt, b: Pt): number {
  const deg = Math.atan2(-(b.y - a.y), b.x - a.x) * 180 / Math.PI
  return ((deg % 360) + 360) % 360
}

/** b moved along a→b so the segment is `length` long (a zero segment goes right). */
export function withLength(a: Pt, b: Pt, length: number): Pt {
  const v = sub(b, a), L = len(v)
  const u = L ? mul(v, 1 / L) : { x: 1, y: 0 }
  return add(a, mul(u, length))
}

/** b turned about a to the drawing-convention angle `deg`, length kept. */
export function withAngle(a: Pt, b: Pt, deg: number): Pt {
  const L = len(sub(b, a)), r = deg * Math.PI / 180
  return { x: a.x + Math.cos(r) * L, y: a.y - Math.sin(r) * L }
}

/** A box resized to w × h, its first corner fixed (directions kept). */
export function withBoxSize(g: BoxGeom, w: number, h: number): BoxGeom {
  const sx = g.b.x >= g.a.x ? 1 : -1, sy = g.b.y >= g.a.y ? 1 : -1
  return { ...g, b: { x: g.a.x + sx * w, y: g.a.y + sy * h } }
}

export const segLength = (a: Pt, b: Pt) => len(sub(b, a))

// ── Arcs + circles (B3) ──────────────────────────────────────────────────────

/** Angle of p seen from c, degrees, svg orientation (0 = right, increasing clockwise on screen). */
export function angOf(c: Pt, p: Pt): number {
  return Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI
}
/** How far (degrees, 0–360) the arc runs from a0 to a1. */
export function sweepOf(a0: number, a1: number): number {
  return (((a1 - a0) % 360) + 360) % 360
}
export function arcPoint(g: Pick<ArcGeom, 'c' | 'r'>, deg: number): Pt {
  const r = deg * Math.PI / 180
  return { x: g.c.x + g.r * Math.cos(r), y: g.c.y + g.r * Math.sin(r) }
}
export const arcStart = (g: ArcGeom) => arcPoint(g, g.a0)
export const arcEnd   = (g: ArcGeom) => arcPoint(g, g.a1)
export const arcMid   = (g: ArcGeom) => arcPoint(g, g.a0 + sweepOf(g.a0, g.a1) / 2)
export const arcLength = (g: ArcGeom) => g.r * sweepOf(g.a0, g.a1) * Math.PI / 180

/** Circle through three points (null when they're in a line). */
export function circumcentre(a: Pt, b: Pt, c: Pt): Pt | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-9) return null
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  }
}

/** The arc from p1 to p3 passing through pm (3-point arc). */
export function arcFrom3(p1: Pt, pm: Pt, p3: Pt): ArcGeom | null {
  const c = circumcentre(p1, pm, p3)
  if (!c) return null
  const r = len(sub(p1, c))
  const a1 = angOf(c, p1), am = angOf(c, pm), a3 = angOf(c, p3)
  return sweepOf(a1, am) < sweepOf(a1, a3) ? { c, r, a0: a1, a1: a3 } : { c, r, a0: a3, a1: a1 }
}

/** Centre, start, end — the arc runs anticlockwise on screen from start to end (CAD default). */
export function arcFromCentre(c: Pt, start: Pt, end: Pt): ArcGeom | null {
  const r = len(sub(start, c))
  if (r < 1e-9) return null
  return { c, r, a0: angOf(c, end), a1: angOf(c, start) }
}

/** Two ends + radius: the shorter arc, bulging towards `side`. A radius under half the
 *  chord becomes a half circle. */
export function arcFromEndsRadius(p1: Pt, p2: Pt, r: number, side: Pt): ArcGeom | null {
  const L = len(sub(p2, p1))
  if (L < 1e-9) return null
  const rr = Math.max(r, L / 2)
  const m = mul(add(p1, p2), 0.5)
  const u = unit(sub(p2, p1))
  let n = { x: -u.y, y: u.x }
  if ((side.x - m.x) * n.x + (side.y - m.y) * n.y < 0) n = mul(n, -1)
  const h = Math.sqrt(Math.max(0, rr * rr - (L / 2) ** 2))
  return arcFrom3(p1, add(m, mul(n, rr - h)), p2)
}

/** Points along an arc (n segments). */
export function arcSample(g: ArcGeom, n = 24): Pt[] {
  const sw = sweepOf(g.a0, g.a1)
  return Array.from({ length: n + 1 }, (_, i) => arcPoint(g, g.a0 + sw * i / n))
}
export function circleSample(g: CircleGeom, n = 48): Pt[] {
  return Array.from({ length: n }, (_, i) => arcPoint(g, 360 * i / n))
}

/** SVG path for an arc through a frame (flipY mirrors the turn direction). */
export function arcSvgPath(f: AnnotFrame, g: ArcGeom): string {
  const s = mapPt(f, arcStart(g)), e = mapPt(f, arcEnd(g))
  const sw = sweepOf(g.a0, g.a1), r = g.r * f.s
  return `M${P(s)}A${f2(r)} ${f2(r)} 0 ${sw > 180 ? 1 : 0} ${f.flipY ? 0 : 1} ${P(e)}`
}

// ── Offset + side drag (B4) ──────────────────────────────────────────────────
// Sign convention: for polylines / clouds, + = the left-hand normal of each segment
// (n = (-u.y, u.x) in svg coords). For boxes / ellipses / circles / arcs, + = outward.
// offsetDistanceFor returns the signed distance that puts the copy through the cursor.

/** Crossing point of two infinite lines (null when parallel). */
export function lineIntersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r = sub(b, a), s = sub(d, c)
  const den = r.x * s.y - r.y * s.x
  if (Math.abs(den) < 1e-9) return null
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den
  return add(a, mul(r, t))
}

const leftN = (a: Pt, b: Pt): Pt => { const u = unit(sub(b, a)); return { x: -u.y, y: u.x } }

/** Polyline / polygon offset by d. Corners are mitred along each side's direction where
 *  they meet; where a side meets an arc tangentially (a fillet) the point just moves
 *  along the shared normal, so arcs stay concentric (bulges are unchanged). */
export function offsetPolyline(pts: Pt[], d: number, closed: boolean, bulges?: number[]): Pt[] {
  const n = pts.length
  if (n < 2) return pts
  const segCount = closed ? n : n - 1
  const bulge = (i: number) => bulges?.[i] ?? 0
  const tStart = (i: number) => bulgeTangent(pts[i], pts[(i + 1) % n], bulge(i), false)
  const tEnd   = (i: number) => bulgeTangent(pts[i], pts[(i + 1) % n], bulge(i), true)
  const nrm = (t: Pt): Pt => ({ x: -t.y, y: t.x })
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const v = pts[i]
    const inSeg = closed ? (i - 1 + segCount) % segCount : i - 1
    const hasIn = closed || i > 0, hasOut = closed || i < segCount
    const tin = hasIn ? tEnd(inSeg) : null, tout = hasOut ? tStart(i) : null
    if (tin && tout) {
      const pin = add(v, mul(nrm(tin), d)), pout = add(v, mul(nrm(tout), d))
      const cross = tin.x * tout.y - tin.y * tout.x
      out.push(Math.abs(cross) < 1e-6 ? pout : (lineIntersect(pin, add(pin, tin), pout, add(pout, tout)) ?? pout))
    } else out.push(add(v, mul(nrm((tout ?? tin)!), d)))
  }
  return out
}

/** Signed distance from p to the nearest segment (left normal = +). */
export function signedDistToPolyline(pts: Pt[], closed: boolean, p: Pt): number {
  let best = Infinity, sign = 1
  const n = pts.length
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    const v = sub(b, a), L2 = v.x * v.x + v.y * v.y
    if (!L2) continue
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * v.x + (p.y - a.y) * v.y) / L2))
    const q = add(a, mul(v, t))
    const dd = len(sub(p, q))
    if (dd < best) { best = dd; const nn = leftN(a, b); sign = (p.x - a.x) * nn.x + (p.y - a.y) * nn.y >= 0 ? 1 : -1 }
  }
  return Number.isFinite(best) ? best * sign : 0
}

/** Point p in a box's own (unturned, centred) frame. */
function boxLocal(g: BoxGeom, p: Pt): Pt {
  const c = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 }
  return rotatePt(sub(p, c), -(g.rot ?? 0))
}

export type OffsetKind = 'line' | 'cloud' | 'rect' | 'ellipse' | 'circle' | 'arc'
export const OFFSETTABLE = new Set<string>(['line', 'cloud', 'rect', 'ellipse', 'circle', 'arc'])

/** Signed offset distance that puts the copy through `p`. */
export function offsetDistanceFor(kind: OffsetKind, geom: AnnotationGeom, p: Pt): number {
  switch (kind) {
    case 'line':  { const g = geom as LineGeom; return signedDistToPolyline(sampleBulged(g.pts ?? [], g.bulges, !!g.closed), !!g.closed, p) }
    case 'cloud': return signedDistToPolyline((geom as LineGeom).pts ?? [], true, p)
    case 'rect': {
      const g = geom as BoxGeom, l = boxLocal(g, p)
      return Math.max(Math.abs(l.x) - Math.abs(g.b.x - g.a.x) / 2, Math.abs(l.y) - Math.abs(g.b.y - g.a.y) / 2)
    }
    case 'ellipse': {
      const g = geom as BoxGeom, l = boxLocal(g, p)
      const rx = Math.abs(g.b.x - g.a.x) / 2, ry = Math.abs(g.b.y - g.a.y) / 2
      const t = Math.atan2(l.y, l.x)
      const rAt = rx && ry ? (rx * ry) / Math.hypot(ry * Math.cos(t), rx * Math.sin(t)) : 0
      return len(l) - rAt
    }
    case 'circle':
    case 'arc': { const g = geom as CircleGeom; return len(sub(p, g.c)) - g.r }
  }
}

/** The parallel copy at signed distance d (null when it would collapse). */
export function offsetGeom(kind: OffsetKind, geom: AnnotationGeom, d: number): AnnotationGeom | null {
  switch (kind) {
    case 'line':  { const g = geom as LineGeom; return { ...g, pts: offsetPolyline(g.pts ?? [], d, !!g.closed, g.bulges) } }
    case 'cloud': return { pts: offsetPolyline((geom as LineGeom).pts ?? [], d, true) }
    case 'rect':
    case 'ellipse': {
      const g = geom as BoxGeom
      const c = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 }
      const hw = Math.abs(g.b.x - g.a.x) / 2 + d, hh = Math.abs(g.b.y - g.a.y) / 2 + d
      if (hw <= 0 || hh <= 0) return null
      return { ...g, a: { x: c.x - hw, y: c.y - hh }, b: { x: c.x + hw, y: c.y + hh } }
    }
    case 'circle':
    case 'arc': {
      const g = geom as CircleGeom
      return g.r + d > 0 ? { ...g, r: g.r + d } : null
    }
  }
}

/** Slide side i (pts[i] to pts[i+1]) by d along its left normal; the sides either side
 *  keep their direction and stretch to meet it (like pushing a wall). */
export function moveEdge(pts: Pt[], i: number, d: number, closed: boolean): Pt[] {
  const n = pts.length, j = (i + 1) % n
  if (n < 2 || (!closed && i >= n - 1)) return pts
  const m = mul(leftN(pts[i], pts[j]), d)
  const a2 = add(pts[i], m), b2 = add(pts[j], m)
  const out = [...pts]
  const hasPrev = closed || i > 0, hasNext = closed || j < n - 1
  const pi = (i - 1 + n) % n, nj = (j + 1) % n
  out[i] = (hasPrev && n > 2 && lineIntersect(pts[pi], pts[i], a2, b2)) || a2
  out[j] = (hasNext && n > 2 && lineIntersect(pts[j], pts[nj], a2, b2)) || b2
  return out
}

/** Signed push of side i that brings it through p (left normal = +). */
export function edgeDistanceFor(pts: Pt[], i: number, p: Pt): number {
  const a = pts[i], b = pts[(i + 1) % pts.length], nn = leftN(a, b)
  return (p.x - a.x) * nn.x + (p.y - a.y) * nn.y
}

// ── Polyline bulges + corners (B4b) ──────────────────────────────────────────
// A line segment pts[i] → pts[i+1] can be an arc: bulges[i] = tan(θ/4) (θ = the arc's
// included angle). + bulges towards the segment's left normal n = (-u.y, u.x) (svg
// coords). Fillets live inside the polyline this way, so offsets / snaps / lengths
// still treat the line as one thing.

/** The arc's middle point for a bulged segment (the chord's middle when bulge = 0). */
export function bulgeMid(a: Pt, b: Pt, bulge: number): Pt {
  const m = mul(add(a, b), 0.5)
  return bulge ? add(m, mul(leftN(a, b), bulge * len(sub(b, a)) / 2)) : m
}

/** Unit direction of travel at the start (or end) of a possibly bulged segment. */
export function bulgeTangent(a: Pt, b: Pt, bulge: number, atEnd: boolean): Pt {
  const u = unit(sub(b, a))
  if (!bulge) return u
  const half = 2 * Math.atan(bulge) * 180 / Math.PI   // θ/2
  return rotatePt(u, atEnd ? -half : half)
}

/** Centre + radius of a bulged segment (null when straight). */
export function bulgeArc(a: Pt, b: Pt, bulge: number): { c: Pt; r: number } | null {
  if (!bulge) return null
  const c = circumcentre(a, bulgeMid(a, b, bulge), b)
  return c ? { c, r: len(sub(a, c)) } : null
}

/** Length along a segment (arc length when bulged). */
export function bulgeSegLength(a: Pt, b: Pt, bulge: number): number {
  const L = len(sub(b, a))
  if (!bulge) return L
  const theta = 4 * Math.atan(Math.abs(bulge))
  return theta / (2 * Math.sin(theta / 2)) * L
}

/** Points along a polyline with its arcs sampled (closed: no repeated first point). */
export function sampleBulged(pts: Pt[], bulges: number[] | undefined, closed: boolean, perArc = 12): Pt[] {
  const n = pts.length
  if (n < 2 || !bulges?.some(Boolean)) return pts
  const out: Pt[] = []
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n], bg = bulges[i] ?? 0
    out.push(a)
    const arc = bulgeArc(a, b, bg)
    if (!arc) continue
    const a0 = angOf(arc.c, a), sw = 4 * Math.atan(bg) * 180 / Math.PI   // signed sweep, svg degrees
    for (let k = 1; k < perArc; k++) out.push(arcPoint(arc, a0 - sw * k / perArc))
  }
  if (!closed) out.push(pts[n - 1])
  return out
}

/** SVG path for a polyline with bulges, from already-mapped points. flipY: the frame
 *  mirrors y, which swaps which side an arc bulges. */
export function bulgedPath(svgPts: Pt[], bulges: number[] | undefined, closed: boolean, flipY = false): string {
  const n = svgPts.length
  if (!n) return ''
  let d = `M${P(svgPts[0])}`
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = svgPts[i], b = svgPts[(i + 1) % n]
    const bg = (bulges?.[i] ?? 0) * (flipY ? -1 : 1)
    if (!bg) { d += `L${P(b)}`; continue }
    const L = len(sub(b, a)), theta = 4 * Math.atan(Math.abs(bg))
    const r = L / (2 * Math.sin(theta / 2))
    d += `A${f2(r)} ${f2(r)} 0 ${Math.abs(bg) > 1 ? 1 : 0} ${bg > 0 ? 0 : 1} ${P(b)}`
  }
  return closed ? d + 'Z' : d
}

/** Index of the segment nearest p (arcs sampled). */
export function nearestSegIndex(pts: Pt[], bulges: number[] | undefined, closed: boolean, p: Pt): number {
  const n = pts.length
  let best = Infinity, idx = 0
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const seg = sampleBulged([pts[i], pts[(i + 1) % n]], [bulges?.[i] ?? 0], false)
    for (let k = 0; k < seg.length - 1; k++) {
      const a = seg[k], b = seg[k + 1], v = sub(b, a), L2 = v.x * v.x + v.y * v.y
      const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * v.x + (p.y - a.y) * v.y) / L2)) : 0
      const dd = len(sub(p, add(a, mul(v, t))))
      if (dd < best) { best = dd; idx = i }
    }
  }
  return idx
}

export interface Poly { pts: Pt[]; bulges?: number[]; closed?: boolean }

const segCountOf = (p: Poly) => p.closed ? p.pts.length : p.pts.length - 1
const bulgesFull = (p: Poly) => Array.from({ length: segCountOf(p) }, (_, i) => p.bulges?.[i] ?? 0)
/** Drop an all-zero bulge list so plain lines stay plain. */
const tidy = (p: Poly): Poly => {
  const b = bulgesFull(p)
  return { pts: p.pts, ...(b.some(Boolean) ? { bulges: b } : {}), ...(p.closed ? { closed: true } : {}) }
}

/** Corner i: the two straight sides meeting there, as unit directions away from it. */
function cornerSides(p: Poly, i: number): { v: Pt; u1: Pt; u2: Pt; l1: number; l2: number } | null {
  const n = p.pts.length, segs = bulgesFull(p)
  if (!p.closed && (i <= 0 || i >= n - 1)) return null
  const pi = (i - 1 + n) % n, ni = (i + 1) % n
  if (segs[(i - 1 + segs.length) % segs.length] || segs[i % segs.length]) return null   // an arc side
  const v = p.pts[i], a = p.pts[pi], b = p.pts[ni]
  const l1 = len(sub(a, v)), l2 = len(sub(b, v))
  if (l1 < 1e-9 || l2 < 1e-9) return null
  return { v, u1: mul(sub(a, v), 1 / l1), u2: mul(sub(b, v), 1 / l2), l1, l2 }
}

/** Round corner i with radius r (null if it doesn't fit, the corner is straight-through,
 *  or a side is already an arc). */
export function filletAt(p: Poly, i: number, r: number): Poly | null {
  const cs = cornerSides(p, i)
  if (!cs || r <= 0) return null
  const cos = Math.max(-1, Math.min(1, cs.u1.x * cs.u2.x + cs.u1.y * cs.u2.y))
  const phi = Math.acos(cos)
  if (phi < 1e-3 || Math.PI - phi < 1e-3) return null
  const t = r / Math.tan(phi / 2)
  if (t > cs.l1 + 1e-9 || t > cs.l2 + 1e-9) return null
  const t1 = add(cs.v, mul(cs.u1, t)), t2 = add(cs.v, mul(cs.u2, t))
  const m = mul(add(t1, t2), 0.5), nn = leftN(t1, t2)
  const bulge = Math.tan((Math.PI - phi) / 4) * (((cs.v.x - m.x) * nn.x + (cs.v.y - m.y) * nn.y) >= 0 ? 1 : -1)
  return spliceCorner(p, i, [t1, t2], bulge)
}

/** Cut corner i back d1 along the incoming side and d2 along the outgoing side. */
export function chamferAt(p: Poly, i: number, d1: number, d2: number): Poly | null {
  const cs = cornerSides(p, i)
  if (!cs || d1 <= 0 || d2 <= 0 || d1 > cs.l1 + 1e-9 || d2 > cs.l2 + 1e-9) return null
  return spliceCorner(p, i, [add(cs.v, mul(cs.u1, d1)), add(cs.v, mul(cs.u2, d2))], 0)
}

/** Replace corner i with two points and the segment between them. */
function spliceCorner(p: Poly, i: number, two: [Pt, Pt], bulge: number): Poly {
  const segs = bulgesFull(p)
  const pts = [...p.pts.slice(0, i), two[0], two[1], ...p.pts.slice(i + 1)]
  // segment i-1 (into the corner) keeps its bulge; the new piece is i; the old seg i shifts on.
  const nb = [...segs.slice(0, i), bulge, ...segs.slice(i)]
  if (p.closed && i === 0) {   // corner 0: the closing segment (last) still ends at the new first point
    return tidy({ pts, bulges: nb, closed: true })
  }
  return tidy({ pts, bulges: nb, closed: p.closed })
}

/** Apply a corner op at every corner it fits (last to first, so indices hold). */
export function allCorners(p: Poly, op: (q: Poly, i: number) => Poly | null): Poly {
  let q = p
  for (let i = p.pts.length - 1; i >= 0; i--) q = op(q, i) ?? q
  return q
}

/** The same polyline drawn the other way (bulges reverse and flip sign). */
export function reversePoly(p: Poly): Poly {
  const segs = bulgesFull(p)
  if (p.closed) return tidy({ pts: [p.pts[0], ...p.pts.slice(1).reverse()], bulges: [...segs].reverse().map(b => -b), closed: true })
  return tidy({ pts: [...p.pts].reverse(), bulges: [...segs].reverse().map(b => -b) })
}

/** Join two open polylines end to end: A's `aEnd` meets B's `bEnd` (merged when they
 *  touch, else bridged with a straight segment). */
export function joinPolys(A: Poly, aEnd: 'start' | 'end', B: Poly, bEnd: 'start' | 'end', eps: number): Poly {
  const a = aEnd === 'end' ? A : reversePoly(A)
  const b = bEnd === 'start' ? B : reversePoly(B)
  const touch = len(sub(a.pts[a.pts.length - 1], b.pts[0])) <= eps
  const pts = [...a.pts, ...(touch ? b.pts.slice(1) : b.pts)]
  const bulges = [...bulgesFull(a), ...(touch ? [] : [0]), ...bulgesFull(b)]
  return tidy({ pts, bulges })
}

/** Which end of an open polyline is nearer p. */
export function nearerEnd(p: Poly, q: Pt): 'start' | 'end' {
  return len(sub(p.pts[0], q)) <= len(sub(p.pts[p.pts.length - 1], q)) ? 'start' : 'end'
}

/** Two separate open lines picked near their ends: trim / extend both end sides to where
 *  they cross and join them there. Returns the joined line and the corner's index (for a
 *  fillet / chamfer to follow), or null if the end sides are parallel or arcs. */
export function cornerJoin(A: Poly, B: Poly, pickA: Pt, pickB: Pt): { poly: Poly; corner: number } | null {
  if (A.closed || B.closed || A.pts.length < 2 || B.pts.length < 2) return null
  const endSeg = (p: Poly, end: 'start' | 'end') => end === 'start' ? [p.pts[0], p.pts[1], 0] as const : [p.pts[p.pts.length - 1], p.pts[p.pts.length - 2], p.pts.length - 2] as const
  // the end to move = the end of the line nearer the other line's pick
  const aEnd = nearerEnd(A, pickB), bEnd = nearerEnd(B, pickA)
  const [a0, a1, ai] = endSeg(A, aEnd), [b0, b1, bi] = endSeg(B, bEnd)
  if (bulgesFull(A)[ai] || bulgesFull(B)[bi]) return null
  const x = lineIntersect(a0, a1, b0, b1)
  if (!x) return null
  const moveEnd = (p: Poly, end: 'start' | 'end'): Poly => {
    const pts = [...p.pts]
    pts[end === 'start' ? 0 : pts.length - 1] = x
    return { ...p, pts }
  }
  const poly = joinPolys(moveEnd(A, aEnd), aEnd, moveEnd(B, bEnd), bEnd, 1e-6)
  return { poly, corner: A.pts.length - 1 }
}

/** A box as a closed polyline (its corners turned with it). */
export function boxToPoly(g: BoxGeom): Poly {
  const c = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 }
  const corners = boxCorners(g).map(p => g.rot ? add(c, rotatePt(sub(p, c), g.rot)) : p)
  return { pts: corners, closed: true }
}
