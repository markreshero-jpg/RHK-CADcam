// ============================================================
// Finger-pull rails run the whole run (z_handles D19, Mark 2026-10-29).
// The resolver makes one rail per cabinet (fprail:<n>, through both sides'
// notches). In the shop a rail runs the full length of the cabinets added
// together, so the cut list joins rails that line up on the wall — same wall
// side, height, depth, board — end to end into one part. A run longer than
// MAX_RAIL_RUN is split at a cabinet junction (where two cabinets meet), into
// the fewest pieces that fit. A single cabinet's rail is never cut.
// Joined parts keep the first rail's identity (uid / source row / key); the
// cabinet label lists every cabinet in the run. Rails carrying a drawn shape
// or a hand size override stay as they are.
// A set back rail's flat base piece (fpbase:, D24) runs the whole run too
// (Mark, 2026-11-11: vanity rails stretch all 3 cabinets without a join). Bases
// join only with bases.
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
const railKind = (p: OptiPart) => p.source_table !== 'case_parts' ? null
  : p.source_part_key.startsWith('case_fprail:') ? 'rail' : p.source_part_key.startsWith('case_fpbase:') ? 'base' : null

export function joinFingerRails(parts: OptiPart[], rects: Map<string, RailWallRect>, maxRun = MAX_RAIL_RUN): OptiPart[] {
  // Lines: rails that could join — same wall side, height band, depth, board.
  const lines = new Map<string, { p: OptiPart; r: RailWallRect }[]>()
  for (const p of parts) {
    const kind = railKind(p)
    if (!kind || p.shape || p.size_overridden || !p.output_to_cnc) continue
    const r = rects.get(p.source_part_id)
    if (!r) continue
    const k = [kind, p.room_id, r.wallId, r.side, Math.round(r.rect.y * 2), Math.round(r.rect.h * 2),
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
  if (!replace.size) return pairRailBases(parts)
  const out: OptiPart[] = []
  for (const p of parts) {
    const r = replace.get(p.uid)
    if (r === undefined) out.push(p)
    else if (r) out.push(r)
  }
  return pairRailBases(out)
}

// One strip for a set back rail and its base (Mark, 2026-11-11, RHK6586): "if they
// are cut at 100mm wide we can get both parts out of them". After the run joins,
// each upright pairs with a base of the same run + length (fprail:n with fpbase:n
// first) when both trim sizes plus saw allowance fit RAIL_PAIR_W; the shop rips
// the strip, then trims + tapes each piece. A pair that doesn't fit (e.g. a 73.5
// rail + 33 base) stays as two 80 strips.
export const RAIL_PAIR_W = 100
export const RAIL_PAIR_ALLOW = 10   // rip kerf + a clean-up pass on each ripped edge

const keyNo = (p: OptiPart) => Number(p.source_part_key.split(':')[1] ?? 0)

export function pairRailBases(parts: OptiPart[], stripW = RAIL_PAIR_W, allow = RAIL_PAIR_ALLOW): OptiPart[] {
  const len = (p: OptiPart) => Math.max(p.w, p.h)
  const groups = new Map<string, { rails: OptiPart[]; bases: OptiPart[] }>()
  for (const p of parts) {
    const kind = railKind(p)
    if (!kind || !p.rail_strip || p.shape || p.size_overridden || !p.output_to_cnc) continue
    const k = [p.room_id, p.cabinet_label, p.material_id, p.thickness, Math.round(len(p) * 2)].join('|')
    const g = groups.get(k) ?? { rails: [], bases: [] }
    ;(kind === 'rail' ? g.rails : g.bases).push(p)
    groups.set(k, g)
  }
  const replace = new Map<string, OptiPart | null>()
  for (const { rails, bases } of groups.values()) {
    if (!rails.length || !bases.length) continue
    rails.sort((a, b) => keyNo(a) - keyNo(b))
    const free = [...bases].sort((a, b) => keyNo(a) - keyNo(b))
    const fits = (r: OptiPart, b: OptiPart) => r.rail_strip!.trim + b.rail_strip!.trim + allow <= stripW + 1e-6
    for (const r of rails) {
      const b = free.find(b => keyNo(b) === keyNo(r) && fits(r, b)) ?? free.find(b => fits(r, b))
      if (!b) continue
      free.splice(free.indexOf(b), 1)
      replace.set(r.uid, paired(r, b, stripW))
      replace.set(b.uid, null)
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

function paired(rail: OptiPart, base: OptiPart, stripW: number): OptiPart {
  const alongW = rail.w > rail.h
  const rs = rail.rail_strip!, bs = base.rail_strip!
  const rest = (p: OptiPart) => (p.comment ?? '').split(' · ').filter(t => t && t !== p.rail_strip!.note && !t.startsWith('Joined rail base:'))
  const head = `Cut ${stripW} wide, rip into ${rail.label} + ${base.label}: rail trim to ${rs.trim}, then ${rs.tape} = ${rs.width}; base trim to ${bs.trim}, then ${bs.tape} = ${bs.width}`
  const extra = [...new Set([...rest(rail), ...rest(base)])]
  const tape = new Map<string | null, number>()
  for (const p of [rail, base]) for (const t of p.eb_tape ?? []) tape.set(t.id, (tape.get(t.id) ?? 0) + t.mm)
  const eb_tape = [...tape].map(([id, mm]) => ({ id, mm: Math.round(mm * 10) / 10 })).filter(t => t.mm > 0)
  return {
    ...rail,
    ...(alongW ? { h: stripW } : { w: stripW }),
    label: `${rail.label} + ${base.label.replace(/^Finger Rail /, '')}`,
    comment: [head, ...extra].join(' · '),
    eb_tape: eb_tape.length ? eb_tape : undefined,
    rail_strip: undefined,
  }
}

// Rails are face-kind panels (DX = height, DY = length): the run adds up along h
// — along w for a vertical-grain rail, which normalize nests turned.
// Tape: the joined rail takes every member's tape (its long edges; rail ends are
// never taped), summed per tape product. It was dropped here, so joined rails
// were missing from the edgeband report / takeoff / labels.
function joined(run: OptiPart[]): OptiPart {
  const first = run[0]
  const alongW = first.w > first.h
  const len = run.reduce((s, p) => s + (alongW ? p.w : p.h), 0)
  const labels = run.map(p => p.cabinet_label)
  const note = `${railKind(first) === 'base' ? 'Joined rail base' : 'Joined rail'}: ${labels.join(' + ')}`
  const tape = new Map<string | null, number>()
  for (const p of run) for (const t of p.eb_tape ?? []) tape.set(t.id, (tape.get(t.id) ?? 0) + t.mm)
  const eb_tape = [...tape].map(([id, mm]) => ({ id, mm: Math.round(mm * 10) / 10 })).filter(t => t.mm > 0)
  return {
    ...first,
    ...(alongW ? { w: len } : { h: len }),
    cabinet_label: labels.join('/'),
    comment: first.comment ? `${first.comment} · ${note}` : note,
    eb_tape: eb_tape.length ? eb_tape : undefined,
  }
}
