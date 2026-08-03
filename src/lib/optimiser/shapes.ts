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

import { sampleShapeOutline, type ShapePt, type ShapeSegmentLike } from '../shapePath'

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
  segments: ShapeSegmentLike[]
  polygon: ShapePt[]            // sampled outline, part-local mm, y-down
  bbox: { w: number; h: number }
  tape_mm: number | null        // banded-segment length at save (meta.tapeLengthMM)
  revision: number
}

/**
 * Build the OptiShape for a part + stale verdict against the part's effective
 * in-plane dims. Compared as an UNORDERED pair (0.5mm tol, same as the
 * cabinet-side shapeIsStale) — the shape frame's across/up axes map onto
 * different row axes per part kind, and toe-kick dims arrive canonicalised,
 * so pair-compare sidesteps the axis-order question entirely.
 */
export function attachShape(
  row: ShapeRow | undefined, partW: number, partH: number,
): { shape?: OptiShape; stale: boolean } {
  if (!row || !Array.isArray(row.segments) || row.segments.length === 0) return { stale: false }
  const polygon = sampleShapeOutline(row.segments)
  if (polygon.length < 3) return { stale: false }
  let bw = 0, bh = 0
  for (const p of polygon) { if (p.x > bw) bw = p.x; if (p.y > bh) bh = p.y }
  const [s1, s2] = bw <= bh ? [bw, bh] : [bh, bw]
  const [p1, p2] = partW <= partH ? [partW, partH] : [partH, partW]
  const stale = Math.abs(s1 - p1) > 0.5 || Math.abs(s2 - p2) > 0.5
  return {
    shape: {
      segments: row.segments,
      polygon,
      bbox: { w: Math.round(bw * 100) / 100, h: Math.round(bh * 100) / 100 },
      tape_mm: row.meta?.tapeLengthMM ?? null,
      revision: row.revision,
    },
    stale,
  }
}
