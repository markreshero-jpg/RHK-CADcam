// ── Shaped kick: edge types + corners ─────────────────────────────────────────
// z_kick_join "Kick edges + corners — KE1". The kick's own version of the cabinet's
// edge types and junctions.ts. Each edge has a kick type (defaulting from the
// cabinet edge's role) and each corner where a choice applies can be set by hand.
// Kept apart from `footprint.joins`: a carcass mitre and a kick mitre are
// different decisions. Unset = what resolveShapedKick has always built.

import {
  edgeLabel, getJoin, junctionKey, withEdgeOverrides,
  type EdgeRole, type Footprint, type FootprintEdge, type JoinChoice, type KickEdgeChoice, type KickEdgeType,
} from './footprint'
import { canonicalSegments, interiorAngle } from './construct'

const ANGLE_TOL = 0.5   // degrees — as junctions.ts

export const KICK_EDGE_TYPES: { value: KickEdgeType; label: string; tip: string }[] = [
  { value: 'face',      label: 'Face',      tip: 'Kick face with a sub front behind it' },
  { value: 'face_only', label: 'Face only', tip: 'Kick face with no frame behind it' },
  { value: 'back',      label: 'Back',      tip: 'Kick back' },
  { value: 'side',      label: 'Side',      tip: 'End spreader, nothing seen' },
  { value: 'none',      label: 'None',      tip: 'Nothing on this edge' },
]

export function defaultKickType(role: EdgeRole): KickEdgeType {
  return role === 'front' || role === 'open' ? 'face' : role === 'back' ? 'back' : 'side'
}

/** The kick type of an edge: the hand-set one, else from the cabinet edge's role. */
export function kickEdgeType(fp: Pick<Footprint, 'kick_edges'>, e: Pick<FootprintEdge, 'id' | 'role'>): KickEdgeType {
  return fp.kick_edges?.[e.id]?.type ?? defaultKickType(e.role)
}

/** The kick frame's extra setback on this edge (the face still runs on to it). */
export function kickInset(fp: Pick<Footprint, 'kick_edges'>, e: Pick<FootprintEdge, 'id' | 'kick_inset'>): number {
  return fp.kick_edges?.[e.id]?.inset ?? e.kick_inset ?? 0
}

export type KickJunctionKind = 'faces' | 'backs' | 'face_back' | 'face_end'

const isFace = (t: KickEdgeType) => t === 'face' || t === 'face_only'
const isEnd = (t: KickEdgeType) => t === 'side' || t === 'none'

/** The kind of kick corner between two edge types, or null where nothing can be chosen. */
export function kickJunctionKind(a: KickEdgeType, b: KickEdgeType, angle: number): KickJunctionKind | null {
  if (Math.abs(angle - 180) <= ANGLE_TOL) return null              // straight on
  if (isFace(a) && isFace(b)) return 'faces'
  if (a === 'back' && b === 'back') return 'backs'
  if ((isFace(a) && b === 'back') || (a === 'back' && isFace(b))) return 'face_back'
  if ((isFace(a) && isEnd(b)) || (isEnd(a) && isFace(b)))
    return Math.abs(angle - 90) > ANGLE_TOL && angle < 180 ? 'face_end' : null
  return null
}

export interface KickJunction {
  key: string
  a: FootprintEdge
  b: FootprintEdge
  kind: KickJunctionKind
  /** Interior angle, degrees. */
  angle: number
  /** The corner, cabinet frame. */
  at: { x: number; y: number }
  choice?: JoinChoice
}

export const getKickJoin = (fp: Pick<Footprint, 'kick_joins'>, a: string, b: string) =>
  getJoin({ joins: fp.kick_joins }, a, b)

/** Every corner of the kick where a choice applies, in outline order. */
export function kickJunctions(fp: Footprint, w: number, d: number): KickJunction[] {
  const segs = canonicalSegments(withEdgeOverrides(fp), w, d)
  const out: KickJunction[] = []
  segs.forEach((a, i) => {
    const b = segs[(i + 1) % segs.length]
    const angle = interiorAngle(a, b)
    const kind = kickJunctionKind(kickEdgeType(fp, a.edge), kickEdgeType(fp, b.edge), angle)
    if (!kind) return
    const choice = getKickJoin(fp, a.edge.id, b.edge.id)
    out.push({ key: junctionKey(a.edge.id, b.edge.id), a: a.edge, b: b.edge, kind, angle, at: { ...a.p1 }, ...(choice ? { choice } : {}) })
  })
  return out
}

/** The picker's options for a kick corner; '' = what the kick does by default. */
export function kickJoinOptions(j: KickJunction): { value: JoinChoice | ''; label: string }[] {
  const through = [
    { value: `through:${j.a.id}` as JoinChoice, label: `Butt — ${edgeLabel(j.a.id)} runs through` },
    { value: `through:${j.b.id}` as JoinChoice, label: `Butt — ${edgeLabel(j.b.id)} runs through` },
  ]
  if (j.kind === 'faces') return [{ value: '', label: 'Mitre (default)' }, ...through]
  if (j.kind === 'backs') return [{ value: '', label: 'Default butt' }, ...through, { value: 'mitre', label: 'Mitre' }]
  if (j.kind === 'face_back') return [{ value: '', label: 'Default' }, ...through]
  return [{ value: '', label: 'Bevelled flush (default)' }, { value: 'square', label: 'Square end' }]
}

/** Set (or clear, with '') the choice at the kick corner `key`. */
export function withKickJoin(fp: Footprint, key: string, choice: JoinChoice | ''): Footprint {
  const [a, b] = key.split('|')
  const kick_joins = { ...(fp.kick_joins ?? {}) }
  delete kick_joins[junctionKey(a, b)]; delete kick_joins[junctionKey(b, a)]
  if (choice) kick_joins[key] = choice
  const next: Footprint = { ...fp, kick_joins }
  if (!Object.keys(kick_joins).length) delete next.kick_joins
  return next
}

/** Change one edge's kick choice. A new type clears that edge's corners: their options change with it. */
export function withKickEdge(fp: Footprint, id: string, patch: KickEdgeChoice): Footprint {
  const merged: KickEdgeChoice = { ...fp.kick_edges?.[id], ...patch }
  if (merged.type == null) delete merged.type
  if (merged.inset == null) delete merged.inset
  const kick_edges = { ...(fp.kick_edges ?? {}) }
  if (Object.keys(merged).length) kick_edges[id] = merged; else delete kick_edges[id]
  const next: Footprint = { ...fp, kick_edges }
  if (!Object.keys(kick_edges).length) delete next.kick_edges
  if ('type' in patch && fp.kick_joins) {
    const kick_joins = Object.fromEntries(Object.entries(fp.kick_joins).filter(([k]) => !k.split('|').includes(id)))
    if (Object.keys(kick_joins).length) next.kick_joins = kick_joins; else delete next.kick_joins
  }
  return next
}
