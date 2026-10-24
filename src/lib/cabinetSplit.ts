// ============================================================
// Cabinet height split (z_cabinet_split/CABINET-SPLIT-SPEC.md, S1).
//
// One cabinet, made in two (or three) height sections: its sides and back are
// cut at each height in `split.at` (cabinet frame, mm up from the cabinet's
// bottom). The shop cuts 3 mm below the top of a fixed shelf: the shelf stays
// with the lower section, standing 3 mm proud of the lower sides, and the upper
// sides drop over that lip. Doors are never split; nothing is drilled across a
// cut (hand fixings).
//
// The resolver stays whole — drilling is worked on the uncut sides — and the
// cut happens where parts leave for the cut list / CNC: the persist payload
// (splitCaseParts) and the drill rows (splitPieceFor). The lower piece keeps
// the part's key (edge overrides / hide ticks still match); the pieces above
// are `split:<key>:<n>`.
// ============================================================

import type { ResolvedCasePart, ResolvedInternalPart } from './resolver/types'

export interface CabinetSplit { at: number[] }

/** Default cut: this far below the top of a fixed shelf (Mark, 2026-10-24). */
export const SPLIT_LIP = 3
export const MAX_CUTS = 2
/** Parts that are cut: the two sides and the back. */
export const SPLIT_KEYS = ['left_side', 'right_side', 'back'] as const
type SplitKey = typeof SPLIT_KEYS[number]

// Tolerates partial / legacy stored values; at most MAX_CUTS, ascending, positive.
export function normaliseSplit(s: Partial<CabinetSplit> | null | undefined): CabinetSplit | null {
  if (!s || !Array.isArray(s.at)) return null
  const at = [...new Set(s.at.map(Number).filter(v => Number.isFinite(v) && v > 0))].sort((a, b) => a - b).slice(0, MAX_CUTS)
  return at.length ? { at } : null
}

/** Height range of a cut-able part in the cabinet frame. The sides run their
 *  height along DY; the back along DX (resolveCase frames). */
function heightRange(p: ResolvedCasePart): [number, number] {
  return splitBaseKey(p.part_key) === 'back' ? [p.Y, p.Y + p.DX] : [p.Y, p.Y + p.DY]
}

export const isSplitKey = (k: string): k is SplitKey => (SPLIT_KEYS as readonly string[]).includes(k)

/** Piece key: the lowest piece keeps the part's key, the n-th above is split:<key>:<n>. */
export const splitPieceKey = (key: string, n: number) => (n === 0 ? key : `split:${key}:${n}`)

/** The part a split piece came from (`split:left_side:1` → `left_side`). */
export function splitBaseKey(key: string): string {
  const m = /^split:([a-z_]+):\d$/.exec(key)
  return m ? m[1] : key
}

/** Cuts that fall inside the part (a cut at or past an end is ignored). */
function cutsIn(p: ResolvedCasePart, at: number[]): number[] {
  const [y0, y1] = heightRange(p)
  return at.filter(h => h > y0 + 1 && h < y1 - 1)
}

/**
 * The case parts as they are made: each side / back cut at every height in
 * `at` into stacked pieces. Cut ends carry no tape (the sides' `top` / `bottom`
 * flags are the ends of DY; the back's run along DX, which is never taped at a
 * cut either). Parts with no cut through them are returned unchanged.
 */
export function splitCaseParts(parts: ResolvedCasePart[], at: number[] | null | undefined): ResolvedCasePart[] {
  if (!at?.length) return parts
  const out: ResolvedCasePart[] = []
  for (const p of parts) {
    const cuts = isSplitKey(p.part_key) ? cutsIn(p, at) : []
    if (!cuts.length) { out.push(p); continue }
    const [y0, y1] = heightRange(p)
    const bounds = [y0, ...cuts, y1]
    for (let i = 0; i < bounds.length - 1; i++) {
      const lo = bounds[i], hi = bounds[i + 1], h = hi - lo
      const first = i === 0, last = i === bounds.length - 2
      out.push({
        ...p,
        part_key: splitPieceKey(p.part_key, i) as ResolvedCasePart['part_key'],
        Y: lo,
        ...(p.part_key === 'back' ? { DX: h } : { DY: h }),
        edge_band: { ...p.edge_band, ...(last ? {} : { top: false }), ...(first ? {} : { bottom: false }) },
        // Shapes / notches are drawn on the whole part; a cut piece is a plain rectangle.
        outline: undefined,
      })
    }
  }
  return out
}

/** Which piece of a cut part a cabinet-space point at height `y` lands in
 *  (pieces stack bottom-up; a point past either end takes the end piece). */
export function splitPieceFor(pieces: ResolvedCasePart[], baseKey: string, y: number): ResolvedCasePart | undefined {
  const own = pieces.filter(p => splitBaseKey(p.part_key) === baseKey).sort((a, b) => a.Y - b.Y)
  return own.find(p => y < heightRange(p)[1]) ?? own[own.length - 1]
}

/** Suggested cuts: SPLIT_LIP below the top of each fixed shelf, lowest first. */
export function splitSuggestions(internal: ResolvedInternalPart[]): { shelf: number; at: number }[] {
  return internal
    .filter(p => p.part_type === 'fixed_shelf')
    .map(p => p.Y + p.DZ - SPLIT_LIP)
    .sort((a, b) => a - b)
    .map((at, i) => ({ shelf: i + 1, at: Math.round(at * 10) / 10 }))
}
