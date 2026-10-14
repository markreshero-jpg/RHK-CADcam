// ── Benchtop edge tape (R-f) ─────────────────────────────────────────────────
// Spec: z_benchtop_builder/BENCHTOP-SPEC.md (Phase 7 — edge tape).
//
// Tape is set per outline edge: `edge.edgeband_id` — undefined = the default
// (the top's schedule row tape), null = no tape, an id = that tape. Only
// in-house board tops take tape; stone / supplied tops never do.
//
// What "tape on this edge" covers depends on the edge's profile:
//   plain edge          the top's edge (worktop panel + the build-up under it)
//   apron profile       the apron strip's bottom edge
//   waterfall (butt)    the top's end, which runs over the leg
//   waterfall (mitre)   nothing — the leg meets the top at 45°; not tapeable
// A waterfall leg's two upright edges take the tape of the edges either side.
// Wall edges and join edges never take tape.

import type { BenchtopSegment, BenchtopEdge, BenchtopEdgeProfile, BenchtopBuildMethod, BenchtopScheduleRow } from '@/src/lib/types'
import { waterfallJoin, segLength } from '@/src/lib/benchtopGeometry'

type Seg = BenchtopSegment & { join?: unknown }

/** Does this top take edge tape at all? In-house tops with a board worktop only. */
export function tapeApplies(method: BenchtopBuildMethod | null, top: BenchtopScheduleRow | undefined): boolean {
  return !!method && method.construction !== 'outsourced' && !!top?.material_id
}

/** Can the user put tape on this edge? */
export function tapeable(s: Seg, prof: BenchtopEdgeProfile | undefined): boolean {
  if (s.join || s.edge?.wall) return false
  return !(prof?.generates === 'waterfall' && waterfallJoin(s) === 'mitre')
}

/** The tape on an edge after defaults; null = none. */
export function edgeTape(s: Seg, prof: BenchtopEdgeProfile | undefined, defaultTape: string | null): string | null {
  if (!tapeable(s, prof)) return null
  return s.edge?.edgeband_id !== undefined ? s.edge.edgeband_id : defaultTape
}

/** True when the edge's tape was set by hand (not the default). */
export const tapeOverridden = (s: Seg) => s.edge?.edgeband_id !== undefined

/**
 * Metres of each tape on a top, mm per tape id: every taped edge once (a
 * plain edge's tape covers the worktop and its build-up in one strip), plus
 * each waterfall leg's upright edges at `legHeight`.
 */
export function tapeTotals(
  segs: Seg[], profileOf: (s: Seg) => BenchtopEdgeProfile | undefined, defaultTape: string | null, legHeight: number,
): Map<string, number> {
  const out = new Map<string, number>()
  const add = (id: string | null, mm: number) => { if (id && mm > 0) out.set(id, (out.get(id) ?? 0) + mm) }
  const n = segs.length
  segs.forEach((s, i) => {
    const prof = profileOf(s)
    add(edgeTape(s, prof, defaultTape), segLength(s))
    if (prof?.generates === 'waterfall' && !s.edge?.wall && s.type === 'line') {
      for (const j of [(i - 1 + n) % n, (i + 1) % n]) add(edgeTape(segs[j], profileOf(segs[j]), defaultTape), legHeight)
    }
  })
  return out
}

// ── On a resolved part ───────────────────────────────────────────────────────
// Sides in the part's own frame (x = length, y = width, min corner at 0):
// x0 / xL are the ends, y0 / yW the long sides. `mm` = tape length this part
// accounts for in the totals (members under a taped edge share the worktop's
// strip, so they carry sides but no mm).
export type BtBandSide = 'x0' | 'xL' | 'y0' | 'yW'
export interface BtPartBands {
  sides: Partial<Record<BtBandSide, string>>
  mm?: Record<string, number>
}

// ── Painting edges (Edit edges mode, Phase 7b) ───────────────────────────────
// Pick a chip, click edges. Clicking an edge that already has the picked
// finish takes it back off; reset = back to the default. Pure: new segments.

const withEdge = (segs: BenchtopSegment[], idx: number[], fn: (e: BenchtopEdge) => BenchtopEdge) =>
  segs.map((s, i) => (idx.includes(i) ? { ...s, edge: fn({ ...s.edge }) } : s))

/** Set the tape on edges: id, null = none, undefined = the default. The default tape itself is stored as undefined. */
export function setTapes(segs: BenchtopSegment[], idx: number[], tape: string | null | undefined, defaultTape: string | null): BenchtopSegment[] {
  const v = tape === defaultTape ? undefined : tape
  return withEdge(segs, idx, e => { if (v === undefined) delete e.edgeband_id; else e.edgeband_id = v; return e })
}

/** Click on edge i with the tape chip `paint` (null = no chip picked). */
export function paintTape(
  segs: BenchtopSegment[], i: number, paint: string | null, defaultTape: string | null,
  profileOf: (s: BenchtopSegment) => BenchtopEdgeProfile | undefined, reset = false,
): BenchtopSegment[] {
  const s = segs[i]
  if (!s || !tapeable(s, profileOf(s))) return segs
  if (reset) return setTapes(segs, [i], undefined, defaultTape)
  const cur = edgeTape(s, profileOf(s), defaultTape)
  if (cur && cur === paint) return setTapes(segs, [i], null, defaultTape)
  if (paint) return setTapes(segs, [i], paint, defaultTape)
  return cur ? setTapes(segs, [i], null, defaultTape) : segs
}

/** Profile chips: '' = the method default, 'wall' = against a wall, else a profile id. */
export type ProfilePaint = '' | 'wall' | (string & {})

/** Set a profile chip on edges (no toggling — the quick buttons). */
export function setProfiles(segs: BenchtopSegment[], idx: number[], paint: ProfilePaint): BenchtopSegment[] {
  return withEdge(segs, idx, e => {
    if (paint === 'wall') { e.wall = true; delete e.profile_id; delete e.edgeband_id; return e }
    e.wall = false
    if (paint) e.profile_id = paint; else delete e.profile_id
    return e
  })
}

/** Click on edge i with the profile chip `paint`; the same chip again = back to the default (or off the wall). */
export function paintProfile(segs: BenchtopSegment[], i: number, paint: ProfilePaint, reset = false): BenchtopSegment[] {
  const s = segs[i]
  if (!s) return segs
  if (reset) return setProfiles(segs, [i], '')
  const wall = !!s.edge?.wall
  if (paint === 'wall') return setProfiles(segs, [i], wall ? '' : 'wall')
  if (paint && !wall && s.edge?.profile_id === paint) return setProfiles(segs, [i], '')
  return setProfiles(segs, [i], paint)
}

// Drawing colours for tapes: fixed per tape (its place in the catalogue), so
// the panel and the plan agree. The tape's own colour is often "White" /
// "Matching", so it can't tell two tapes apart.
export const TAPE_PALETTE = ['#f59e0b', '#38bdf8', '#a78bfa', '#34d399', '#f472b6', '#facc15']
export function tapeColour(id: string, catalogueIds: string[]): string {
  const k = catalogueIds.indexOf(id)
  return TAPE_PALETTE[(k < 0 ? 0 : k) % TAPE_PALETTE.length]
}
