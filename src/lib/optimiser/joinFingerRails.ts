// ============================================================
// Finger-pull rails run the whole run (z_handles D17, Mark 2026-10-29).
// The resolver makes one rail per cabinet (fprail:<n>, through both sides'
// notches). In the shop a rail runs the full length of the cabinets added
// together, so the cut list joins rails that line up on the wall — same wall
// side, height, depth, board — end to end into one part. A run longer than
// MAX_RAIL_RUN is split at a cabinet junction (where two cabinets meet), into
// the fewest pieces that fit. A single cabinet's rail is never cut.
// Joined parts keep the first rail's identity (uid / source row / key); the
// cabinet label lists every cabinet in the run. Rails carrying a drawn shape
// or a hand size override stay as they are.
// Pure & framework-free.
// ============================================================

import type { FrontWallRect } from '../frontWallRects'
import type { OptiPart } from './types'

export const MAX_RAIL_RUN = 2400

/** Where a rail sits on its wall + its depth line, keyed by case_parts id. */
export interface RailWallRect extends FrontWallRect {
  frontLine: number   // depth of the rail's front face from the cabinet back (cab space)
}

const EPS = 0.5
const isRail = (p: OptiPart) => p.source_table === 'case_parts' && p.source_part_key.startsWith('case_fprail:')

export function joinFingerRails(parts: OptiPart[], rects: Map<string, RailWallRect>, maxRun = MAX_RAIL_RUN): OptiPart[] {
  // Lines: rails that could join — same wall side, height band, depth, board.
  const lines = new Map<string, { p: OptiPart; r: RailWallRect }[]>()
  for (const p of parts) {
    if (!isRail(p) || p.shape || p.size_overridden || !p.output_to_cnc) continue
    const r = rects.get(p.source_part_id)
    if (!r) continue
    const k = [p.room_id, r.wallId, r.side, Math.round(r.rect.y * 2), Math.round(r.rect.h * 2),
      Math.round(r.frontLine * 2), p.material_id, p.thickness].join('|')
    lines.set(k, [...(lines.get(k) ?? []), { p, r }])
  }

  const replace = new Map<string, OptiPart | null>()   // uid → joined part (first) / null (absorbed)
  for (const line of lines.values()) {
    line.sort((a, b) => a.r.rect.x - b.r.rect.x)
    // Chains of rails that touch end to end.
    const chains: typeof line[] = []
    for (const it of line) {
      const last = chains[chains.length - 1]?.at(-1)
      if (last && Math.abs(last.r.rect.x + last.r.rect.w - it.r.rect.x) < EPS) chains[chains.length - 1].push(it)
      else chains.push([it])
    }
    for (const chain of chains) {
      if (chain.length < 2) continue
      // Split at cabinet junctions: fill each piece up to maxRun.
      const pieces: typeof chain[] = [[]]
      let len = 0
      for (const it of chain) {
        const cur = pieces[pieces.length - 1]
        if (cur.length && len + it.r.rect.w > maxRun + EPS) { pieces.push([it]); len = it.r.rect.w }
        else { cur.push(it); len += it.r.rect.w }
      }
      for (const piece of pieces) {
        if (piece.length < 2) continue
        replace.set(piece[0].p.uid, joined(piece.map(i => i.p)))
        for (const it of piece.slice(1)) replace.set(it.p.uid, null)
      }
    }
  }
  if (!replace.size) return parts
  const out: OptiPart[] = []
  for (const p of parts) {
    const r = replace.get(p.uid)
    if (r === undefined) out.push(p)
    else if (r) out.push(r)
  }
  return out
}

// Rails are face-kind panels (DX = height, DY = length): the run adds up along h.
function joined(run: OptiPart[]): OptiPart {
  const first = run[0]
  const h = run.reduce((s, p) => s + p.h, 0)
  const labels = run.map(p => p.cabinet_label)
  const note = `Joined rail: ${labels.join(' + ')}`
  return {
    ...first,
    h,
    cabinet_label: labels.join('/'),
    comment: first.comment ? `${first.comment} · ${note}` : note,
    eb_tape: undefined,
  }
}
