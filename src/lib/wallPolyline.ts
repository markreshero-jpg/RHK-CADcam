// ============================================================
// ⚠ WIP — TO BE FINISHED OR DELETED (paused 2026-05-28)
// ============================================================
// This is plan-view wall outline editing (Option B from the
// shape-editor design discussion). Scope was paused in favour
// of elevation-view wall shape editing.
//
// Decide:
//   • Finish steps 3–5 (DB save + cabinet re-anchor + modal +
//     canvas right-click wiring) and ship plan-view editing, OR
//   • Delete this file + wallPolyline.test.ts + the
//     mode='room-outline' plumbing in ShapeEditor.jsx.
//
// The ShapeEditor port itself is REUSABLE — the elevation work
// will mount it in mode='free'.
// ============================================================
//
// Wall ⇄ Editor Polyline Conversion
// ============================================================
// Pure functions that translate between the app's per-wall data
// model (pos_x/pos_y/length/angle in room mm) and the ShapeEditor's
// segment format (line p0→p1 in editor pixels, top-left origin).
//
// The editor's canvas uses 2 px = 1 mm internally; we preserve that
// here so the editor's grid and "mm" labels stay correct.
//
// On save, polylineToWalls() also returns a best-effort mapping of
// old wall IDs → new geometry so cabinets anchored to a still-extant
// wall stay anchored. The threshold for "this new segment is the
// same wall as that old wall" is intentionally generous to handle
// vertex-drag edits without losing wall identity.
// ============================================================

import type { Wall } from './types'

export const MM_TO_PX = 2

export interface Pt { x: number; y: number }
export interface LineSegment { type: 'line'; p0: Pt; p1: Pt }

/** Anything the ShapeEditor might hand back. We only round-trip 'line'. */
export type EditorSegment =
  | LineSegment
  | { type: 'arc';   p0: Pt; p1: Pt; rx?: number; ry?: number; largeArc?: 0 | 1; sweep?: 0 | 1 }
  | { type: 'curve'; p0: Pt; p1: Pt; cp1: Pt; cp2: Pt }

// ── walls → editor segments ─────────────────────────────────────

/**
 * Convert a list of straight walls into editor line segments.
 * Room (0,0) maps to editor (0,0); 1 mm = 2 px. Caller is responsible
 * for setting the editor's pan/zoom to fit the result on the canvas.
 */
export function wallsToPolyline(walls: Wall[]): LineSegment[] {
  return walls.map(w => {
    const rad = (w.angle * Math.PI) / 180
    const x0 = w.pos_x * MM_TO_PX
    const y0 = w.pos_y * MM_TO_PX
    const x1 = (w.pos_x + w.length * Math.cos(rad)) * MM_TO_PX
    const y1 = (w.pos_y + w.length * Math.sin(rad)) * MM_TO_PX
    return {
      type: 'line',
      p0: { x: Math.round(x0), y: Math.round(y0) },
      p1: { x: Math.round(x1), y: Math.round(y1) },
    }
  })
}

/** Bounding box of a wall set in editor px (useful for fit-to-view). */
export function wallsBBoxPx(walls: Wall[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!walls.length) return null
  const segs = wallsToPolyline(walls)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const s of segs) {
    for (const p of [s.p0, s.p1]) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
  }
  return { minX, minY, maxX, maxY }
}

// ── editor segments → walls (the hard part) ────────────────────

interface WallGeom { pos_x: number; pos_y: number; length: number; angle: number }

export interface PolylineSaveDiff {
  /** Existing walls whose geometry changed but identity is preserved. */
  toUpdate: Array<{ id: string } & WallGeom>
  /** Brand-new walls (no existing match). Caller assigns id/name/thickness/etc. */
  toInsert: WallGeom[]
  /** Walls present before but not in the new shape. Cabinets must be re-anchored. */
  toDelete: string[]
  /**
   * Mapping of new-segment-index → wall id (for both matched and inserted segments).
   * Inserted walls don't have ids yet; their entries are null. Caller can fill them
   * in after insert and use this map to set sort_order and re-anchor cabinets.
   */
  segmentToWallId: Array<string | null>
}

// Total endpoint drift (mm) tolerated for two segments to count as the "same wall".
// Set high enough that splitting a wall in half preserves its identity (one half
// keeps the wall id; the other becomes a new wall) — a 4000mm wall split in half
// scores 2000 against either half. Set low enough that a brand-new wall added
// elsewhere in the room can't accidentally inherit some unrelated wall's id.
const MATCH_THRESHOLD_MM = 2000

function dist(a: Pt, b: Pt): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function wallEndpoints(w: Wall): { p0: Pt; p1: Pt } {
  const rad = (w.angle * Math.PI) / 180
  return {
    p0: { x: w.pos_x, y: w.pos_y },
    p1: {
      x: w.pos_x + w.length * Math.cos(rad),
      y: w.pos_y + w.length * Math.sin(rad),
    },
  }
}

function segToWallGeom(p0: Pt, p1: Pt): WallGeom {
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  return {
    pos_x: Math.round(p0.x),
    pos_y: Math.round(p0.y),
    length: Math.round(Math.sqrt(dx * dx + dy * dy)),
    angle: Math.round((Math.atan2(dy, dx) * 180) / Math.PI * 1000) / 1000,
  }
}

/**
 * Diff a new polyline against the previous wall list.
 *
 * Matching is greedy by total endpoint distance (in either direction —
 * an edit may have flipped a wall's p0/p1). New segments below the
 * MATCH_THRESHOLD_MM stay attached to their old wall's id (which
 * preserves name, thickness, height, sort_order, and cabinet anchors).
 *
 * Non-line segments are ignored (the editor's room-outline mode
 * already hides curve/arc tools, but defending here keeps the
 * function safe to call regardless).
 */
export function polylineToWalls(newSegs: EditorSegment[], oldWalls: Wall[]): PolylineSaveDiff {
  const lineSegs = newSegs.filter((s): s is LineSegment => s.type === 'line')

  // Convert editor px → room mm.
  const candidates = lineSegs.map((s, idx) => ({
    idx,
    p0: { x: s.p0.x / MM_TO_PX, y: s.p0.y / MM_TO_PX },
    p1: { x: s.p1.x / MM_TO_PX, y: s.p1.y / MM_TO_PX },
  }))

  // Score every (oldWall, candidate) pair. Lower score = better match.
  // Score is the smaller of forward (p0→p0, p1→p1) and flipped (p0→p1, p1→p0)
  // total endpoint distance.
  interface Pair { wallId: string; candIdx: number; score: number; flipped: boolean }
  const pairs: Pair[] = []
  for (const w of oldWalls) {
    const { p0: wp0, p1: wp1 } = wallEndpoints(w)
    for (const c of candidates) {
      const forward = dist(wp0, c.p0) + dist(wp1, c.p1)
      const flipped = dist(wp0, c.p1) + dist(wp1, c.p0)
      const score = Math.min(forward, flipped)
      if (score <= MATCH_THRESHOLD_MM) {
        pairs.push({ wallId: w.id, candIdx: c.idx, score, flipped: flipped < forward })
      }
    }
  }
  pairs.sort((a, b) => a.score - b.score)

  // Greedy assignment.
  const usedWalls = new Set<string>()
  const usedCands = new Set<number>()
  const matches: Pair[] = []
  for (const p of pairs) {
    if (usedWalls.has(p.wallId) || usedCands.has(p.candIdx)) continue
    usedWalls.add(p.wallId)
    usedCands.add(p.candIdx)
    matches.push(p)
  }

  const segmentToWallId: Array<string | null> = new Array(candidates.length).fill(null)
  const toUpdate: PolylineSaveDiff['toUpdate'] = []

  for (const m of matches) {
    const c = candidates[m.candIdx]
    // Preserve the wall's facing direction: if the best match was
    // flipped, swap so the wall's p0 corresponds to its original p0.
    const p0 = m.flipped ? c.p1 : c.p0
    const p1 = m.flipped ? c.p0 : c.p1
    toUpdate.push({ id: m.wallId, ...segToWallGeom(p0, p1) })
    segmentToWallId[m.candIdx] = m.wallId
  }

  const toInsert: WallGeom[] = []
  for (const c of candidates) {
    if (usedCands.has(c.idx)) continue
    toInsert.push(segToWallGeom(c.p0, c.p1))
    // segmentToWallId[c.idx] stays null — caller fills after insert.
  }

  const toDelete = oldWalls.filter(w => !usedWalls.has(w.id)).map(w => w.id)

  return { toUpdate, toInsert, toDelete, segmentToWallId }
}
