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

// at: height cuts (sides + back). back_x: width cuts through the back only
// (cabinet frame x from the cabinet's left) — a back too wide for one grained
// sheet with the grain up it is made in pieces and joined (Mark, RHK6542 WC-04,
// 2026-11-03). A width-cut back is not also cut in height.
export interface CabinetSplit { at: number[]; back_x?: number[] }

/** Default cut: this far below the top of a fixed shelf (Mark, 2026-10-24). */
export const SPLIT_LIP = 3
export const MAX_CUTS = 2
/** Parts that are cut: the two sides and the back — and on a shaped cabinet its
 *  per-edge side / back panels (side:<edge>, back:<edge>). */
export const SPLIT_KEYS = ['left_side', 'right_side', 'back'] as const
const isShapedUpright = (k: string) => /^(side|back):[A-Za-z0-9_-]+$/.test(k)

// Tolerates partial / legacy stored values; at most MAX_CUTS, ascending, positive.
const cleanCuts = (v: unknown): number[] => Array.isArray(v)
  ? [...new Set(v.map(Number).filter(n => Number.isFinite(n) && n > 0))].sort((a, b) => a - b).slice(0, MAX_CUTS)
  : []
export function normaliseSplit(s: Partial<CabinetSplit> | null | undefined): CabinetSplit | null {
  if (!s) return null
  const at = cleanCuts(s.at), back_x = cleanCuts(s.back_x)
  if (!at.length && !back_x.length) return null
  return back_x.length ? { at, back_x } : { at }
}

/** Width cuts that fall inside the plain back (it runs along DY from X). */
function backXCutsIn(p: ResolvedCasePart, backX: number[] | null | undefined): number[] {
  if (p.part_key !== 'back' || !backX?.length) return []
  return backX.filter(x => x > p.X + 1 && x < p.X + p.DY - 1)
}

/** True when this piece key belongs to a back that was cut across its width. */
export const isWidthCut = (key: string, backX: number[] | null | undefined): boolean =>
  splitBaseKey(key) === 'back' && !!backX?.length

/** Where a cut-able part really sits, bottom → top, in the cabinet frame. The
 *  sides run their height along DY from Y. The back runs along DX and sits on
 *  the bottom: its stored Y is one board (DZ, the bottom's thickness) below
 *  it — caseBox draws it at Y + DZ — so its real span starts there. */
export function splitPieceRange(p: ResolvedCasePart): [number, number] {
  const base = splitBaseKey(p.part_key)
  // Shaped per-edge panels are face-kind: height along DX from Y (caseBox).
  if (isShapedUpright(base)) return [p.Y, p.Y + p.DX]
  if (base !== 'back') return [p.Y, p.Y + p.DY]
  const y0 = p.Y + p.DZ
  return [y0, y0 + p.DX]
}

export const isSplitKey = (k: string): boolean => (SPLIT_KEYS as readonly string[]).includes(k) || isShapedUpright(k)

/** Piece key: the lowest piece keeps the part's key, the n-th above is split:<key>:<n>. */
export const splitPieceKey = (key: string, n: number) => (n === 0 ? key : `split:${key}:${n}`)

/** The part a split piece came from (`split:left_side:1` → `left_side`,
 *  `split:back:back2:1` → `back:back2`). */
export function splitBaseKey(key: string): string {
  const m = /^split:(.+):\d$/.exec(key)
  return m ? m[1] : key
}

/** Cuts that fall inside the part (a cut at or past an end is ignored). */
function cutsIn(p: ResolvedCasePart, at: number[]): number[] {
  const [y0, y1] = splitPieceRange(p)
  return at.filter(h => h > y0 + 1 && h < y1 - 1)
}

/**
 * The case parts as they are made: each side / back cut at every height in
 * `at` into stacked pieces. Cut ends carry no tape (the sides' `top` / `bottom`
 * flags are the ends of DY; the back's run along DX, which is never taped at a
 * cut either). Parts with no cut through them are returned unchanged.
 */
export function splitCaseParts(parts: ResolvedCasePart[], at: number[] | null | undefined, backX?: number[] | null): ResolvedCasePart[] {
  if (!at?.length && !backX?.length) return parts
  const out: ResolvedCasePart[] = []
  for (const p of parts) {
    // Width cut through the back: pieces side by side, left → right. The cut
    // edges are the DY ends (left / right flags) and carry no tape.
    const xc = backXCutsIn(p, backX)
    if (xc.length) {
      const bounds = [p.X, ...xc, p.X + p.DY]
      for (let i = 0; i < bounds.length - 1; i++) {
        const first = i === 0, last = i === bounds.length - 2
        out.push({ ...p, part_key: splitPieceKey(p.part_key, i) as ResolvedCasePart['part_key'],
          X: bounds[i], DY: bounds[i + 1] - bounds[i],
          edge_band: { ...p.edge_band, ...(last ? {} : { right: false }), ...(first ? {} : { left: false }) },
          outline: undefined })
      }
      continue
    }
    const cuts = isSplitKey(p.part_key) && at?.length ? cutsIn(p, at) : []
    if (!cuts.length) { out.push(p); continue }
    const [y0, y1] = splitPieceRange(p)
    const bounds = [y0, ...cuts, y1]
    for (let i = 0; i < bounds.length - 1; i++) {
      const lo = bounds[i], hi = bounds[i + 1], h = hi - lo
      const first = i === 0, last = i === bounds.length - 2
      out.push({
        ...p,
        part_key: splitPieceKey(p.part_key, i) as ResolvedCasePart['part_key'],
        // A back piece keeps the back's frame (stored one board below where it sits).
        ...(p.part_key === 'back' ? { Y: lo - p.DZ, DX: h } : isShapedUpright(p.part_key) ? { Y: lo, DX: h } : { Y: lo, DY: h }),
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
export function splitPieceFor(pieces: ResolvedCasePart[], baseKey: string, y: number, x?: number): ResolvedCasePart | undefined {
  const all = pieces.filter(p => splitBaseKey(p.part_key) === baseKey)
  // A width-cut back's pieces sit side by side: pick by x.
  if (x != null && all.length > 1 && all.some(p => Math.abs(p.X - all[0].X) > 0.01)) {
    const byX = [...all].sort((a, b) => a.X - b.X)
    return byX.find(p => x < p.X + p.DY) ?? byX[byX.length - 1]
  }
  const own = all.sort((a, b) => a.Y - b.Y)
  return own.find(p => y < splitPieceRange(p)[1]) ?? own[own.length - 1]
}

/** Suggested cuts: SPLIT_LIP below the top of each fixed shelf, lowest first. */
export function splitSuggestions(internal: ResolvedInternalPart[]): { shelf: number; at: number }[] {
  return internal
    .filter(p => p.part_type === 'fixed_shelf')
    .map(p => p.Y + p.DZ - SPLIT_LIP)
    .sort((a, b) => a - b)
    .map((at, i) => ({ shelf: i + 1, at: Math.round(at * 10) / 10 }))
}

/** The parts a set of pieces was cut from, with how many pieces each was cut
 *  into (`left_side` → 2 when `split:left_side:1` is there). */
export function cutBaseKeys(keys: string[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const k of keys) {
    if (!k.startsWith('split:')) continue
    const base = splitBaseKey(k), n = Number(k.slice(-1)) + 1
    out.set(base, Math.max(out.get(base) ?? 0, n))
  }
  return out
}

/** Where a piece sits in its cut part: 'bottom' (the part's own key), 'top'
 *  (the highest piece), 'mid' (between, on a two-cut part); null when the part
 *  wasn't cut. `cut` is cutBaseKeys over the cabinet's piece keys. */
export function splitPiecePosition(key: string, cut: Map<string, number>, backX?: number[] | null): 'bottom' | 'mid' | 'top' | 'left' | 'right' | null {
  const base = splitBaseKey(key)
  const count = cut.get(base)
  if (!count) return null
  const across = isWidthCut(key, backX)
  if (base === key) return across ? 'left' : 'bottom'
  return Number(key.slice(-1)) === count - 1 ? (across ? 'right' : 'top') : 'mid'
}

/** Name suffix for a piece: " (split bottom)" / " (split mid)" / " (split top)"
 *  on the pieces of a cut part (Mark, 2026-10-31), "" for a part that wasn't cut. */
export function splitPieceSuffix(key: string, cut: Map<string, number>, backX?: number[] | null): string {
  const pos = splitPiecePosition(key, cut, backX)
  return pos ? ` (split ${pos})` : ''
}

/** The part comment on a cut piece — "SPLIT - BOTTOM" / "- MID" / "- TOP" — so
 *  the label and cut list say which piece it is; null for a part that wasn't cut. */
export function splitPieceNote(key: string, cut: Map<string, number>, backX?: number[] | null): string | null {
  const pos = splitPiecePosition(key, cut, backX)
  if (!pos) return null
  // Width-cut back pieces are joined edge to edge on the job.
  return isWidthCut(key, backX) ? `SPLIT - ${pos.toUpperCase()} · JOIN TOGETHER` : `SPLIT - ${pos.toUpperCase()}`
}
