// ============================================================
// 6th face layout (z_part_view two-sided spec §0). Program A trims 5mm off the
// outside long edge (away from the Y fence) and the X0 end; the sheet is then
// flipped over the long edge and those trimmed edges go into the fences for
// program Z. So a two-sided sheet's parts belong against the TRIMMED edges, sat
// exactly on the trim lines (Mark, 2026-11-05): the trim cut is their finished
// edge, and after the flip they're at X0 / Y0 for program Z, like any sheet.
//
// The nest packs from the fence corner, so a two-sided sheet's layout is turned
// over top-to-bottom (each part keeps its own orientation; only positions move)
// and then shifted onto the trim lines. Idempotent: an anchored sheet is left
// as it is. Pure.
// ============================================================

import type { NestResult, NestedSheet } from './nest'
import { SIXTH_FACE_TRIM, type PostProfile } from './gcode'

type Datum = Pick<PostProfile, 'origin_corner'>
const EPS = 1e-6

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS

export function anchorSixthFaceSheet(sheet: NestedSheet, datum: Datum, trim = SIXTH_FACE_TRIM): NestedSheet {
  const pls = sheet.placements
  if (!pls.length) return sheet
  const W = sheet.stock.w, H = sheet.stock.h
  const xAtW = datum.origin_corner === 'top_right' || datum.origin_corner === 'bottom_right'
  const yAtH = datum.origin_corner === 'top_left' || datum.origin_corner === 'top_right'
  const box = (ps: typeof pls) => ({
    x0: Math.min(...ps.map(p => p.x)), x1: Math.max(...ps.map(p => p.x + p.w)),
    y0: Math.min(...ps.map(p => p.y)), y1: Math.max(...ps.map(p => p.y + p.h)),
  })
  let b = box(pls)
  // Distance from the layout to the outside long edge vs the fence edge.
  const toOutside = yAtH ? b.y0 : H - b.y1
  const toFence = yAtH ? H - b.y1 : b.y0
  // Turning the layout over only moves rectangles; true-shape nests whose boxes
  // interlock can't be turned without re-nesting, so they're only shifted.
  const interlocked = pls.some((p, i) => pls.some((q, j) => j > i && overlaps(p, q)))
  let out = pls
  if (toOutside > toFence + EPS && !interlocked) {
    out = pls.map(p => ({ ...p, y: H - p.y - p.h }))
    b = box(out)
  }
  const dx = xAtW ? (W - trim) - b.x1 : trim - b.x0
  const dy = yAtH ? trim - b.y0 : (H - trim) - b.y1
  if (out === pls && Math.abs(dx) < EPS && Math.abs(dy) < EPS) return sheet
  // Never push a part off the sheet's far side.
  if (b.x0 + dx < -EPS || b.x1 + dx > W + EPS || b.y0 + dy < -EPS || b.y1 + dy > H + EPS) return sheet
  return { ...sheet, placements: out.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })) }
}

/** The nest with every two-sided sheet anchored; the same object when nothing moved. */
export function anchorSixthFace(nest: NestResult, twoSided: (s: NestedSheet) => boolean, datum: Datum, trim = SIXTH_FACE_TRIM): NestResult {
  let changed = false
  const sheets = nest.sheets.map(s => {
    if (!twoSided(s)) return s
    const a = anchorSixthFaceSheet(s, datum, trim)
    if (a !== s) changed = true
    return a
  })
  return changed ? { ...nest, sheets } : nest
}
