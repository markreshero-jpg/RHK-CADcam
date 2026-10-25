// ── Shaped-cabinet corners ────────────────────────────────────────────────────
// z_cabinet_shape_edit E2. Every corner of a footprint where a choice applies,
// and the choices: panel ↔ panel (which runs through, or mitre — square
// corners too), a panel end at an angled front / open edge (square or bevelled
// flush), and two door facets at an outside corner (mitre or reveal). Stored in
// `footprint.joins`; absent = the rules' default (BACK_JOIN / ANGLE_JOIN,
// square ends, mitred doors). The legacy per-panel `flush_ends` is read where a
// corner has no entry, and folded into `joins` on the first change.

import {
  edgeLabel, edgeSub, getJoin, junctionKey, withEdgeOverrides,
  type Footprint, type FootprintEdge, type FootprintSegment, type JoinChoice,
} from './footprint'
import { canonicalSegments, edgeFrame, interiorAngle } from './construct'

const ANGLE_TOL = 0.5   // degrees — as resolveShapedCase

export type JunctionKind = 'panels' | 'panel_end' | 'facets'

export interface Junction {
  key: string
  a: FootprintEdge
  b: FootprintEdge
  kind: JunctionKind
  /** Interior angle, degrees. */
  angle: number
  /** The stored choice, if any (legacy flush_ends read in). */
  choice?: JoinChoice
}

const isPanel = (s: FootprintSegment) => s.type === 'line' && (s.edge.role === 'side' || s.edge.role === 'back')
const isEnd = (s: FootprintSegment) => s.type === 'line' && (s.edge.role === 'front' || s.edge.role === 'open')
const isDoorFront = (s: FootprintSegment) => s.type === 'line' && s.edge.role === 'front' && edgeSub(s.edge) !== 'open'
const offSquare = (a: number) => Math.abs(a - 90) > ANGLE_TOL && a < 180 - ANGLE_TOL

/** The kind of corner between two consecutive edges, or null where nothing can be chosen. */
export function junctionKind(a: FootprintSegment, b: FootprintSegment, angle: number): JunctionKind | null {
  if (angle >= 180 - ANGLE_TOL) return null                       // straight on / reflex
  if (isPanel(a) && isPanel(b)) return 'panels'
  if ((isPanel(a) && isEnd(b)) || (isEnd(a) && isPanel(b))) return offSquare(angle) ? 'panel_end' : null
  if (isDoorFront(a) && isDoorFront(b) && !a.edge.filler && !b.edge.filler) {
    const u = edgeFrame(a).u, v = edgeFrame(b).u
    return u.x * v.y - u.y * v.x > 1e-9 ? 'facets' : null        // outside corner only
  }
  return null
}

/** The stored choice at a corner, reading a legacy flush_ends entry for a panel end. */
export function storedJoin(fp: Footprint, a: FootprintSegment, b: FootprintSegment): JoinChoice | undefined {
  const j = getJoin(fp, a.edge.id, b.edge.id)
  if (j) return j
  const panel = isPanel(a) ? a : isPanel(b) ? b : null
  if (panel && (isEnd(a) || isEnd(b)) && (fp.flush_ends ?? []).includes(panel.edge.id)) return 'flush'
  return undefined
}

/** Every corner of the footprint where a choice applies, in outline order. */
export function footprintJunctions(fp: Footprint, w: number, d: number): Junction[] {
  const segs = canonicalSegments(withEdgeOverrides(fp), w, d)
  const n = segs.length
  const out: Junction[] = []
  for (let i = 0; i < n; i++) {
    const a = segs[i], b = segs[(i + 1) % n]
    const angle = interiorAngle(a, b)
    const kind = junctionKind(a, b, angle)
    if (!kind) continue
    const choice = storedJoin(fp, a, b)
    out.push({ key: junctionKey(a.edge.id, b.edge.id), a: a.edge, b: b.edge, kind, angle, ...(choice ? { choice } : {}) })
  }
  return out
}

/** The picker's options for a corner; '' = the rules' default. */
export function joinOptions(j: Junction): { value: JoinChoice | ''; label: string }[] {
  if (j.kind === 'panels') return [
    { value: '', label: 'Rule default' },
    { value: `through:${j.a.id}`, label: `Butt — ${edgeLabel(j.a.id)} runs through` },
    { value: `through:${j.b.id}`, label: `Butt — ${edgeLabel(j.b.id)} runs through` },
    { value: 'mitre', label: 'Mitre' },
  ]
  if (j.kind === 'panel_end') return [
    { value: '', label: 'Square end' },
    { value: 'flush', label: 'Bevelled flush' },
  ]
  return [
    { value: '', label: 'Mitred doors' },
    { value: 'reveal', label: 'Square doors (reveal)' },
  ]
}

/** Fold legacy flush_ends into explicit joins entries (and drop flush_ends). */
function foldFlushEnds(fp: Footprint, w: number, d: number): Footprint {
  if (!fp.flush_ends?.length) return fp
  const joins = { ...(fp.joins ?? {}) }
  for (const j of footprintJunctions(fp, w, d))
    if (j.kind === 'panel_end' && j.choice === 'flush' && !getJoin(fp, j.a.id, j.b.id)) joins[j.key] = 'flush'
  const next = { ...fp, joins }
  delete next.flush_ends
  return next
}

/** Set (or clear, with null / '') the choice at the corner `key`. */
export function withJoin(fp: Footprint, w: number, d: number, key: string, choice: JoinChoice | '' | null): Footprint {
  const next = foldFlushEnds(fp, w, d)
  const [a, b] = key.split('|')
  const joins = { ...(next.joins ?? {}) }
  delete joins[junctionKey(a, b)]; delete joins[junctionKey(b, a)]
  if (choice) joins[key] = choice
  return { ...next, joins }
}

/** The 3D right-click toggle: every angled front / open end of this panel's
 *  edge bevelled flush, or all back to square. */
export function toggleFlushEnds(fp: Footprint, w: number, d: number, edgeId: string): Footprint {
  const ends = footprintJunctions(fp, w, d).filter(j => j.kind === 'panel_end' && (j.a.id === edgeId || j.b.id === edgeId))
  const on = !ends.some(j => j.choice === 'flush')
  return ends.reduce((f, j) => withJoin(f, w, d, j.key, on ? 'flush' : null), fp)
}

