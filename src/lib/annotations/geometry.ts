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
export interface LineGeom  { pts: Pt[] }
export interface BoxGeom   { a: Pt; b: Pt; rot?: number }
export interface CloudGeom { pts: Pt[] }
/** Aligned (no axis): offset = signed distance (frame mm) of the dim line from p1→p2,
 *  + = left of p1→p2. Linear (A5): axis 'x' measures the horizontal span with the dim
 *  line at y = p1.y + offset; axis 'y' the vertical span at x = p1.x + offset. */
export interface DimGeom   { p1: Pt; p2: Pt; offset: number; axis?: 'x' | 'y' }
export type AnnotationGeom = TextGeom | LineGeom | BoxGeom | CloudGeom | DimGeom

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
    case 'line':
    case 'cloud':   return (geom as LineGeom).pts ?? []
    case 'rect':
    case 'ellipse': { const g = geom as BoxGeom; return [g.a, g.b, { x: g.a.x, y: g.b.y }, { x: g.b.x, y: g.a.y }] }
    case 'dim':     { const g = geom as DimGeom; const l = dimLayout(g); return [g.p1, g.p2, l.d1, l.d2] }
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
