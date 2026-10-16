// ============================================================
// Part shape overrides → optimiser snapshot (phase plan O2).
//
// part_shape_overrides rows (latest revision per cabinet+part) ride into the
// snapshot on OptiPart.shape: raw segments (for exact G-code arcs, O4), the
// sampled polygon (sheet preview O3 / containment), bbox and tape length.
// Nest footprint stays the part rect — for a fresh shape the bbox EQUALS the
// part size (the shape editor writes the bbox back on save), so no nest.ts
// change is needed. A bbox that disagrees with the effective part size means
// the cabinet was resized after the shape was drawn → shape_stale: the part
// is excluded from nesting with a visible reason (locked policy: keep shape,
// flag error — never silently cut a stale shape).
// ============================================================

import { outlineSegments, sampleShapeOutline, type OutlinePt, type ShapePt, type ShapeSegmentLike } from '../shapePath'

export type ShapeMetaLike = {
  tapeLengthMM?: number | null
  bounds?: { minX: number; minY: number; maxX: number; maxY: number } | null
} & Record<string, unknown>

export interface ShapeRow {
  cabinet_id: string
  part_key: string       // stable part id — matches OptiPart.source_part_key
  revision: number
  segments: ShapeSegmentLike[]
  meta: ShapeMetaLike | null
}

/** Shared select for both loaders. */
export const SHAPE_SELECT = 'cabinet_id,part_key,revision,segments,meta'

/** cabinet_instance_id → stable part id → latest shape row */
export type ShapesByCab = Map<string, Record<string, ShapeRow>>

/** Rows MUST be ordered revision DESC — first row per (cabinet, part) wins. */
export function buildShapesByCab(rows: ShapeRow[]): ShapesByCab {
  const m: ShapesByCab = new Map()
  for (const r of rows) {
    let byPart = m.get(r.cabinet_id)
    if (!byPart) { byPart = {}; m.set(r.cabinet_id, byPart) }
    if (!(r.part_key in byPart)) byPart[r.part_key] = r
  }
  return m
}

// The snapshot-facing shape record on OptiPart.
export interface OptiShape {
  /** 'drawn' = part_shape_overrides (Shape Editor); 'resolver' = the outline a
   *  shaped cabinet / finger-pull notch writes on the part row (O2b). A drawn
   *  shape wins; a resolver shape is regenerated with the part, never stale. */
  source: 'drawn' | 'resolver'
  segments: ShapeSegmentLike[]
  polygon: ShapePt[]            // sampled outline in its SHAPE frame (mm, y-down)
  /** The same outline in the part's op frame: origin bottom-left, y UP, x along
   *  OptiPart.w, y along OptiPart.h — the frame drills / ops use (drills.ts
   *  toSheet), so the sheet preview and contour G-code place it like an op. */
  op_polygon: ShapePt[]
  bbox: { w: number; h: number }
  tape_mm: number | null        // banded-segment length at save (meta.tapeLengthMM)
  revision: number              // 0 for resolver shapes
}

// ── Shape frame → op frame (phase plan O2b "Frame findings") ────────────────
// Shapes are stored in the Part Editor's display frame (y-down). Per part kind
// the editor either swaps the in-plane axes (every non-side panel that isn't a
// front face: horizontals, backs, shaped side:/back: panels, kick boards…) or
// not (gables, dividers, doors / drawer fronts, front-standing customs), and
// mirrors drawn shapes on right-hand side twins. Inverse of usePartOps' op →
// shape mapping:
//   swap:     pos_x = DX − sy,               pos_y = sx
//   no swap:  pos_x = sx (DX − sx mirrored), pos_y = DY − sy
// Resolver outlines on side panels are written UNmirrored (x = depth from the
// back on both gables — resolveFingerRails notchPanels), so mirror applies to
// drawn shapes only.

export interface ShapeFrame { swap: boolean; mirror: boolean }

const INT_SIDE_KINDS = new Set(['divider', 'inner_drawer_side', 'pull_out_side'])
const INT_FACE_KINDS = new Set(['inner_drawer_front', 'inner_drawer_back', 'pull_out_back'])

/** Display-frame rule for a part, matching Cabinet3DView's PartMeta panelKind /
 *  dxIsWidth + PartEditor's swap / mirror. `typeKey` = case part_key, internal
 *  part_type, toe-kick part_key, drawer-box part_type; custom = orientation. */
export function shapeFrameFor(table: string, typeKey: string, partId: string): ShapeFrame {
  let kind: 'side' | 'horizontal' | 'face' = 'horizontal'
  let dxIsWidth = false
  switch (table) {
    case 'case_parts':
      kind = typeKey === 'left_side' || typeKey === 'right_side' ? 'side'
        : typeKey === 'back' || /^(side|back|fprail|cleat):/.test(typeKey) ? 'face' : 'horizontal'
      break
    case 'internal_parts':
      kind = INT_SIDE_KINDS.has(typeKey) ? 'side' : INT_FACE_KINDS.has(typeKey) ? 'face' : 'horizontal'
      break
    case 'toekick_parts':
      kind = typeKey === 'spreader_horizontal' ? 'horizontal' : typeKey === 'spreader_vertical' ? 'side' : 'face'
      break
    case 'face_zones':
      kind = 'face'; dxIsWidth = true
      break
    case 'drawer_box_parts':
      kind = typeKey === 'db_left_side' || typeKey === 'db_right_side' ? 'side' : typeKey === 'db_bottom' ? 'horizontal' : 'face'
      break
    case 'custom_parts':
      kind = typeKey === 'side' ? 'side' : typeKey === 'front' ? 'face' : 'horizontal'
      dxIsWidth = typeKey === 'front'
      break
  }
  return { swap: kind !== 'side' && !dxIsWidth, mirror: kind === 'side' && partId.includes('right_side') }
}

/** Shape-frame points → op frame of a DX × DY part (see the rule above). */
export function shapeToOpFrame(pts: ShapePt[], frame: ShapeFrame, DX: number, DY: number): ShapePt[] {
  const r = (v: number) => Math.round(v * 100) / 100
  return pts.map(p => frame.swap
    ? { x: r(DX - p.y), y: r(p.x) }
    : { x: r(frame.mirror ? DX - p.x : p.x), y: r(DY - p.y) })
}

/** Whether a shaped part nests at its full finished bbox when the profile
 *  deducts edgeband. Drawn shapes (and benchtop pieces) do — no contour EB
 *  offsetting until O5. Resolver outlines still CUT as the rectangle until O4,
 *  so they keep the ordinary cut-size nest. */
export function nestsFullSize(p: { shape?: OptiShape }): boolean {
  return p.shape?.source === 'drawn'
}

/** O3: a placed part's outline in SHEET axes (mm, y up), relative to the
 *  placement's bottom-left corner — add pl.x / pl.y (or a drag position) to
 *  draw it. Same transform as the drill holes (drills.ts toSheet + the
 *  up-face ebShift), so the outline and its holes line up. Null = no outline. */
// On a deducted blank (resolver shape, profile deducts), every outline edge
// that lies on the part's rectangle (x = 0 / w, y = 0 / h) comes in by that
// side's tape — the same deduction the rectangle cut gets — so the contour
// fits the cut-size blank the nest laid out. Inner edges (notch walls, angled
// facets) stay put: their banding is O5.
export function placedOutline(
  part: { shape?: OptiShape; w: number; h: number; eb_w1: number; eb_w2: number; eb_h1: number; eb_h2: number },
  pl: { w: number; rotated: boolean },
  deductEb: boolean,
): ShapePt[] | null {
  let poly = part.shape?.op_polygon
  if (!poly || poly.length < 3) return null
  const deducted = deductEb && !nestsFullSize(part)
  if (deducted && (part.eb_w1 || part.eb_w2 || part.eb_h1 || part.eb_h2)) {
    const T = 0.05
    const on = (a: number, b: number, v: number) => Math.abs(a - v) < T && Math.abs(b - v) < T
    poly = offsetLoop(poly, poly.map((a, i) => {
      const b = poly![(i + 1) % poly!.length]
      return on(a.x, b.x, 0) ? part.eb_w1 : on(a.x, b.x, part.w) ? part.eb_w2
        : on(a.y, b.y, 0) ? part.eb_h1 : on(a.y, b.y, part.h) ? part.eb_h2 : 0
    }))
  }
  const sx = deducted ? part.eb_w1 : 0, sy = deducted ? part.eb_h1 : 0
  return poly.map(p => {
    const ox = p.x - sx, oy = p.y - sy
    return pl.rotated ? { x: pl.w - oy, y: ox } : { x: ox, y: oy }
  })
}

/** Signed area (+ = CCW in a y-up frame). */
export function loopArea(pts: ShapePt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

/**
 * Offset each edge of a closed loop by its own distance — `d[i]` for the edge
 * pts[i] → pts[i+1], + = INTO the shape, − = out of it (either winding) — and
 * re-intersect neighbours (sharp mitred corners, which is what an outer
 * profile's tool centre needs). Duplicate points are dropped first; collinear
 * neighbours with the same offset merge, with different offsets they step.
 */
export function offsetLoop(pts: ShapePt[], d: number[] | number): ShapePt[] {
  const dist = (i: number) => typeof d === 'number' ? d : (d[i] ?? 0)
  const edges: { a: ShapePt; u: ShapePt; o: number }[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    if (l < 1e-6) continue
    edges.push({ a, u: { x: (b.x - a.x) / l, y: (b.y - a.y) / l }, o: dist(i) })
  }
  if (edges.length < 3) return pts.map(p => ({ ...p }))
  const ccw = loopArea(pts) >= 0
  // Inward normal: left of travel on a CCW loop, right on a CW one.
  const lines = edges.map(e => {
    const n = ccw ? { x: -e.u.y, y: e.u.x } : { x: e.u.y, y: -e.u.x }
    return { p: { x: e.a.x + n.x * e.o, y: e.a.y + n.y * e.o }, u: e.u, n, o: e.o }
  })
  const out: ShapePt[] = []
  for (let i = 0; i < lines.length; i++) {
    const A = lines[(i - 1 + lines.length) % lines.length], B = lines[i]
    const cross = A.u.x * B.u.y - A.u.y * B.u.x
    if (Math.abs(cross) < 1e-9) {
      // Parallel: same offset → one point; different → a step across.
      const v = edges[i].a
      if (Math.abs(A.o - B.o) > 1e-9) out.push({ x: v.x + A.n.x * A.o, y: v.y + A.n.y * A.o })
      out.push(B.p)
      continue
    }
    const s = ((B.p.x - A.p.x) * B.u.y - (B.p.y - A.p.y) * B.u.x) / cross
    out.push({ x: A.p.x + A.u.x * s, y: A.p.y + A.u.y * s })
  }
  return out
}

/**
 * Tool-centre loop for an OUTER profile: the outline grown out by the cutter
 * radius, with any recess the bit can't fit into removed (a finger-pull notch
 * relief narrower than the bit, a slot smaller than its diameter…). A plain
 * offset crosses itself there and the bit would gouge the part; instead the
 * too-small edge is dropped and its neighbours re-joined, so the bit just
 * skips the feature. `dropped` > 0 → some detail can't be cut with this bit.
 */
export function toolPathLoop(pts: ShapePt[], r: number): { pts: ShapePt[]; dropped: number } {
  // Clean: no duplicate points, no collinear same-direction joints.
  const clean: ShapePt[] = []
  for (const p of pts) {
    const q = clean[clean.length - 1]
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 1e-6) clean.push(p)
  }
  while (clean.length > 3 && Math.hypot(clean[0].x - clean[clean.length - 1].x, clean[0].y - clean[clean.length - 1].y) < 1e-6) clean.pop()
  for (let i = 0; clean.length > 3 && i < clean.length; ) {
    const a = clean[(i - 1 + clean.length) % clean.length], b = clean[i], c = clean[(i + 1) % clean.length]
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    const dt = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)
    if (Math.abs(cr) < 1e-6 && dt > 0) clean.splice(i, 1); else i++
  }
  if (clean.length < 3 || r <= 0) return { pts: clean, dropped: 0 }
  const ccw = loopArea(clean) >= 0
  type Ln = { p: ShapePt; u: ShapePt; len: number }
  let lines: Ln[] = clean.map((a, i) => {
    const b = clean[(i + 1) % clean.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
    const out = ccw ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x }   // away from the material
    return { p: { x: a.x + out.x * r, y: a.y + out.y * r }, u, len }
  })
  const meet = (A: Ln, B: Ln): ShapePt | null => {
    const cross = A.u.x * B.u.y - A.u.y * B.u.x
    if (Math.abs(cross) < 1e-9) return A.u.x * B.u.x + A.u.y * B.u.y > 0 ? B.p : null
    const s = ((B.p.x - A.p.x) * B.u.y - (B.p.y - A.p.y) * B.u.x) / cross
    return { x: A.p.x + A.u.x * s, y: A.p.y + A.u.y * s }
  }
  let dropped = 0
  for (let guard = 0; guard < clean.length && lines.length > 3; guard++) {
    const n = lines.length
    const v = lines.map((L, i) => meet(lines[(i - 1 + n) % n], L))
    // Antiparallel neighbours (a slot narrower than the bit, its floor already
    // dropped): drop the shorter wall. Else drop the most reversed edge.
    let worst = -1, worstScore = 1e-6
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      if (!v[j]) { worst = lines[i].len <= lines[j].len ? i : j; worstScore = Infinity; break }
      if (!v[i]) continue
      const back = -((v[j]!.x - v[i]!.x) * lines[i].u.x + (v[j]!.y - v[i]!.y) * lines[i].u.y)
      if (back > worstScore) { worst = i; worstScore = back }
    }
    if (worst < 0) return { pts: v as ShapePt[], dropped }
    lines = lines.filter((_, i) => i !== worst)
    dropped++
  }
  const n = lines.length
  return { pts: lines.map((L, i) => meet(lines[(i - 1 + n) % n], L) ?? L.p), dropped }
}

/** A resolver outline (closed point loop, bulged edges = true arcs) as Shape Editor segments. */
export function outlineToSegments(pts: OutlinePt[]): ShapeSegmentLike[] {
  return outlineSegments(pts)
}

/**
 * Build the OptiShape for a part + stale verdict against the part's effective
 * in-plane dims. Compared as an UNORDERED pair (0.5mm tol, same as the
 * cabinet-side shapeIsStale) — the shape frame's across/up axes map onto
 * different row axes per part kind, and toe-kick dims arrive canonicalised,
 * so pair-compare sidesteps the axis-order question entirely.
 */
//
// `op` places the outline in the part's op frame (DX / DY = the row's in-plane
// dims; `transpose` when the part nests turned, w = DY). `resolverOutline` =
// the part row's `outline` column — used only when there's no drawn shape.
export function attachShape(
  row: ShapeRow | undefined, partW: number, partH: number,
  op?: { frame: ShapeFrame; DX: number; DY: number; transpose?: boolean },
  resolverOutline?: OutlinePt[] | null,
): { shape?: OptiShape; stale: boolean } {
  const drawn = !!row && Array.isArray(row.segments) && row.segments.length > 0
  const resolver = !drawn && Array.isArray(resolverOutline) && resolverOutline.length >= 3
  if (!drawn && !resolver) return { stale: false }
  const segments = drawn ? row!.segments : outlineToSegments(resolverOutline!)
  const polygon = sampleShapeOutline(segments)
  if (polygon.length < 3) return { stale: false }
  let bw = 0, bh = 0
  for (const p of polygon) { if (p.x > bw) bw = p.x; if (p.y > bh) bh = p.y }
  const [s1, s2] = bw <= bh ? [bw, bh] : [bh, bw]
  const [p1, p2] = partW <= partH ? [partW, partH] : [partH, partW]
  const mismatch = Math.abs(s1 - p1) > 0.5 || Math.abs(s2 - p2) > 0.5
  // A resolver outline that no longer fits (hand size override on the part)
  // is dropped — the part goes back to its rectangle, as before O2b.
  if (resolver && mismatch) return { stale: false }
  const stale = drawn && mismatch
  let opPoly: ShapePt[] = []
  if (op) {
    // Resolver outlines are written unmirrored on both gables.
    const frame = drawn ? op.frame : { ...op.frame, mirror: false }
    opPoly = shapeToOpFrame(polygon, frame, op.DX, op.DY)
    if (op.transpose) opPoly = opPoly.map(p => ({ x: p.y, y: p.x }))
  }
  return {
    shape: {
      source: drawn ? 'drawn' : 'resolver',
      segments,
      polygon,
      op_polygon: opPoly,
      bbox: { w: Math.round(bw * 100) / 100, h: Math.round(bh * 100) / 100 },
      tape_mm: drawn ? row!.meta?.tapeLengthMM ?? null : null,
      revision: drawn ? row!.revision : 0,
    },
    stale,
  }
}
