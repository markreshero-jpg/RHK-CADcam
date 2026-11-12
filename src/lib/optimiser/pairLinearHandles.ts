// ============================================================
// Linear handle strips cut in pairs (z_handles D27, Mark 2026-11-12, RHK6581
// kitchen J05): "where there are more than one of the same size, pair them
// together, cut them at 80 wide, and have the short ends and two long ends
// edged". Two sharknose strips (D17) of the same length, width, board and
// thickness in a room nest as ONE PAIR_W blank, taped on all four edges. The
// shop rips it down the middle into the two strips and saws the sharknose on
// each ripped edge — so each strip ends up with tape on one long edge + both
// ends, as D17 draws it. An odd strip left over stays single (small-part rule).
// Timber pulls (D19, no tape, rebate) are never paired.
// Runs in normalizeProject before the small-part widening. The pair keeps the
// first strip's identity (uid / source row / key). Pure & framework-free.
// ============================================================

import type { OptiPart } from './types'
import type { TapeRun } from './edgebandLength'

/** Machine cut width of a paired blank (before tape). */
export const LH_PAIR_W = 80

const r1 = (n: number) => Math.round(n * 10) / 10
const baseLabel = (l: string) => l.replace(/\s*\(.*\)\s*$/, '')
const keyNo = (p: OptiPart) => Number(p.source_part_key.split(':')[1] ?? 0)

export function pairLinearHandles(parts: OptiPart[], sharknose: Set<string>, pairW = LH_PAIR_W): OptiPart[] {
  const groups = new Map<string, OptiPart[]>()
  for (const p of parts) {
    if (!sharknose.has(p.uid) || p.shape || p.cut_holes?.length || !p.output_to_cnc) continue
    const k = [p.room_id, p.material_id, p.thickness, p.grain_direction, p.grain_across ? 1 : 0,
      Math.round(Math.max(p.w, p.h) * 10), Math.round(Math.min(p.w, p.h) * 10)].join('|')
    groups.set(k, [...(groups.get(k) ?? []), p])
  }
  const replace = new Map<string, OptiPart | null>()
  for (const g of groups.values()) {
    if (g.length < 2) continue
    g.sort((a, b) => a.cabinet_label.localeCompare(b.cabinet_label, undefined, { numeric: true }) || keyNo(a) - keyNo(b))
    for (let i = 0; i + 1 < g.length; i += 2) {
      replace.set(g[i].uid, paired(g[i], g[i + 1], pairW))
      replace.set(g[i + 1].uid, null)
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

function paired(a: OptiPart, b: OptiPart, pairW: number): OptiPart {
  const longW = a.w > a.h          // length along w → long edges are h1 / h2
  const len = longW ? a.w : a.h
  const strip = longW ? a.h : a.w  // finished strip width (35)
  // Tape thickness: the strip's taped long edge (same tape goes on both long edges).
  const t = Math.max(...(longW ? [a.eb_h1, a.eb_h2, b.eb_h1, b.eb_h2] : [a.eb_w1, a.eb_w2, b.eb_w1, b.eb_w2]))
  const tEnd = Math.max(...(longW ? [a.eb_w1, a.eb_w2, b.eb_w1, b.eb_w2] : [a.eb_h1, a.eb_h2, b.eb_h1, b.eb_h2]))
  const across = r1(pairW + 2 * t)  // finished blank width — the machine cuts pairW
  const tapeId = (a.eb_tape ?? b.eb_tape ?? [])[0]?.id ?? null
  const eb_tape: TapeRun[] = [{ id: tapeId, mm: r1(2 * len + 2 * across) }]
  const sameCab = a.cabinet_label === b.cabinet_label
  const who = (p: OptiPart) => `${p.cabinet_label} ${baseLabel(p.label)}`
  const head = `PAIR: cut ${pairW} wide, edge both long edges + both ends, then rip into 2 x ${r1(strip)} strips (${who(a)} + ${who(b)}) and sharknose each ripped edge on the saw`
  const rest = [...new Set([a.comment, b.comment].flatMap(c => (c ?? '').split(' · ')).filter(Boolean))]
  return {
    ...a,
    ...(longW ? { h: across, eb_h1: t, eb_h2: t, eb_w1: tEnd, eb_w2: tEnd } : { w: across, eb_w1: t, eb_w2: t, eb_h1: tEnd, eb_h2: tEnd }),
    cabinet_label: sameCab ? a.cabinet_label : `${a.cabinet_label} + ${b.cabinet_label}`,
    label: `${baseLabel(a.label)} + ${sameCab ? baseLabel(b.label).replace(/^Linear Handle /, '') : baseLabel(b.label)} (pair)`,
    comment: [head, ...rest].join(' · '),
    eb_missing: a.eb_missing || b.eb_missing,
    eb_on: [true, true, true, true],
    eb_tape,
  }
}
