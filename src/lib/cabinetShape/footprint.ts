// ── Shaped-cabinet footprint ──────────────────────────────────────────────────
// z_cabinet_shape/CABINET-SHAPE-SPEC.md. A cabinet's plan outline as Shape
// Editor segments, in the cabinet frame: x = along the width (0 = the
// resolver's left side), y = depth (0 = back, cab.dz = front). Every edge
// carries a role. A null footprint means a plain rectangle (decision 5).
//
// `segments` are the source of truth (decision 8): `preset` / `params` are only
// a record of where the shape came from. The numbers in p0/p1/rx are a cache.
// The live values come from the per-vertex formulas (`p0_expr`), evaluated
// against the cabinet's current size, so any resize reshapes the outline
// without the caller knowing about footprints.

import { evaluateFormula } from '../formula'
import { sampleShapeOutline, type ShapePt } from '../shapePath'

// Stored footprints from before z_cabinet_shape_edit E1 may still say role
// 'scribe' — evaluateFootprint / withEdgeOverrides read it as side / scribe.
export type EdgeRole = 'back' | 'side' | 'front' | 'open'

export const EDGE_ROLES: { value: EdgeRole; label: string }[] = [
  { value: 'back',   label: 'Back' },
  { value: 'side',   label: 'Side' },
  { value: 'front',  label: 'Front (face)' },
  { value: 'open',   label: 'Open' },
]

/** What a side / back / front edge builds (z_cabinet_shape_edit decision 13).
 *  The first of each role's list is its default (= the build before E1). */
export type EdgeSub = 'faces' | 'open' | 'unfinished' | 'finished' | 'applied' | 'scribe' | 'standard'

export const EDGE_SUBS: Record<EdgeRole, { value: EdgeSub; label: string }[]> = {
  front: [{ value: 'faces', label: 'Doors / drawers' }, { value: 'open', label: 'Open (no doors)' }],
  side: [
    { value: 'unfinished', label: 'Unfinished gable' },
    { value: 'finished',   label: 'Finished gable' },
    { value: 'applied',    label: 'Applied end panel' },
    { value: 'scribe',     label: 'Scribe gable' },
  ],
  back: [
    { value: 'standard', label: 'Standard back' },
    { value: 'finished', label: 'Finished back' },
    { value: 'scribe',   label: 'Scribe back' },
  ],
  open: [],
}

/** The edge's sub-type: its role's default when unset or not valid for the role. */
export function edgeSub(e: { role: EdgeRole; sub?: EdgeSub }): EdgeSub | null {
  const list = EDGE_SUBS[e.role] ?? []
  return list.find(o => o.value === e.sub)?.value ?? list[0]?.value ?? null
}

/** A user's choice for one edge. Survives regenerating from the preset. */
export interface EdgeOverride { role: EdgeRole; sub?: EdgeSub; scribe?: number }
export type EdgeOverrides = Record<string, EdgeOverride>

/** Read an edge as stored: a legacy role 'scribe' becomes side / scribe. */
export function normaliseEdge<E extends { role: string; sub?: EdgeSub }>(e: E): Omit<E, 'role'> & { role: EdgeRole } {
  return (e.role === 'scribe' ? { ...e, role: 'side', sub: 'scribe' } : e) as Omit<E, 'role'> & { role: EdgeRole }
}

// Display names for the preset edge ids (presets.ts); anything else shows its id.
const EDGE_LABELS: Record<string, string> = {
  back: 'Back', back2: 'Back (corner wall)', end: 'End', facet: 'Angled facet',
  front: 'Front', side: 'Side', curve: 'Curve', left: 'Left', right: 'Right',
  fill_a: 'Filler A', fill_b: 'Filler B', side_a: 'Side A', side_b: 'Side B',
}
export function edgeLabel(id: string): string {
  const n = /^e(\d+)$/.exec(id)   // drawn in Edit shape (footprintCad)
  return EDGE_LABELS[id] ?? (n ? `Edge ${n[1]}` : id)
}

export interface FootprintEdge {
  /** Stable id. Faces and role overrides key off this, never the index. */
  id: string
  role: EdgeRole
  /** Sub-type (EDGE_SUBS); unset = the role's default. */
  sub?: EdgeSub
  /** Scribe allowance (mm) for sub 'scribe': the panel stands this far in from
   *  the outline. Unset = the rules' SCRL / SCRR / SCRBK on the box edges, 0 elsewhere. */
  scribe?: number
  /** A face filler strip on this front edge (z_angled_filler): one false panel
   *  whose front face is exactly `width` wide, with a return cleat `cleat` deep
   *  at its end against a side edge when the cabinet has no carcass. */
  filler?: { width: number; cleat: number }
}

/** A vertex as formulas. Scope: cab.w, cab.d, p.<param>. */
export interface VertexExpr { x: string; y: string }

export interface FootprintSegment {
  type: 'line' | 'arc'
  p0: ShapePt
  p1: ShapePt
  rx?: number
  ry?: number
  largeArc?: 0 | 1
  sweep?: 0 | 1
  /** Formula for p0. p1 is always the next segment's p0 (closed loop). */
  p0_expr?: VertexExpr
  /** Arc radius formula (circular arcs: rx = ry). */
  r_expr?: string
  edge: FootprintEdge
}

export type PresetParams = Record<string, number | string>

export interface Footprint {
  /** Preset that currently drives the shape; null once hand-edited. */
  preset: string | null
  params: PresetParams
  /** History: the preset this shape started from (survives a hand edit). */
  from_preset?: string | null
  segments: FootprintSegment[]
  /** Legacy (before E1): user-chosen roles by edge id. Read under edge_overrides. */
  role_overrides?: Record<string, EdgeRole | 'scribe'>
  /** User-chosen role / sub-type / scribe per edge id. Survives regenerating from the preset. */
  edge_overrides?: EdgeOverrides
  /** Panel edges whose end is bevelled flush where it meets an angled front /
   *  open edge (z_cabinet_shape 4a). Default square; set per part by right-click. */
  flush_ends?: string[]
  /** How the pieces meet at each corner, keyed `junctionKey(edgeA, edgeB)`
   *  (z_cabinet_shape_edit E2). Absent = the rules' default. Replaces flush_ends
   *  (still read where no entry is set). */
  joins?: Record<string, JoinChoice>
}

/** A corner choice: `through:<edge id>` = a butt with that edge's panel running
 *  through (the other stops — bevelled against it at an off-square corner);
 *  `mitre` = both bevelled on the corner line; `square` / `flush` = a panel end
 *  at an angled front / open edge; `mitre` / `reveal` between two door facets. */
export type JoinChoice = 'mitre' | 'square' | 'flush' | 'reveal' | `through:${string}`

/** The joins key for the corner between two consecutive edges (stored order). */
export function junctionKey(a: string, b: string): string {
  return `${a}|${b}`
}

/** The corner choice between edges a and b, whichever way round it was keyed. */
export function getJoin(fp: Pick<Footprint, 'joins'> | null | undefined, a: string, b: string): JoinChoice | undefined {
  return fp?.joins?.[junctionKey(a, b)] ?? fp?.joins?.[junctionKey(b, a)]
}

export interface FootprintDims { w: number; d: number }

/** Evaluate a vertex/radius formula. Numeric params go in `p`; a failure falls back. */
function evalExpr(src: string, dims: FootprintDims, params: PresetParams, fallback: number): number {
  const p: Record<string, number> = {}
  for (const [k, v] of Object.entries(params)) if (typeof v === 'number') p[k] = v
  const r = evaluateFormula(src, { roots: { cab: { w: dims.w, d: dims.d }, p } })
  return r.ok && Number.isFinite(r.value) ? r.value : fallback
}

/**
 * The footprint's segments with p0/p1/rx recomputed for this cabinet size.
 * Segments without formulas keep their cached numbers.
 */
export function evaluateFootprint(fp: Footprint, dims: FootprintDims): FootprintSegment[] {
  const segs = fp.segments.map(s => ({
    ...s,
    edge: normaliseEdge(s.edge),
    p0: s.p0_expr
      ? { x: evalExpr(s.p0_expr.x, dims, fp.params, s.p0.x), y: evalExpr(s.p0_expr.y, dims, fp.params, s.p0.y) }
      : { ...s.p0 },
  }))
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    s.p1 = { ...segs[(i + 1) % segs.length].p0 }
    if (s.type === 'arc' && s.r_expr) {
      const r = Math.max(0, evalExpr(s.r_expr, dims, fp.params, s.rx ?? 0))
      s.rx = r; s.ry = r
    }
  }
  return segs
}

const EPS = 0.01

/** A segment whose ends coincide (e.g. a radius equal to the depth). Kept in the
 *  data so its edge id survives a resize, skipped when drawing. */
export function isDegenerate(s: FootprintSegment): boolean {
  return Math.abs(s.p0.x - s.p1.x) < EPS && Math.abs(s.p0.y - s.p1.y) < EPS
}

/** Closed outline as points in the cabinet frame (arcs sampled). */
export function footprintOutline(fp: Footprint, dims: FootprintDims): ShapePt[] {
  return sampleShapeOutline(evaluateFootprint(fp, dims).filter(s => !isDegenerate(s)))
}

/** Map a cabinet-frame point to plan (room) coordinates. */
export type ToPlan = (x: number, y: number) => ShapePt

/** The outline's straight runs per edge, in plan coords, for drawing edges by role. */
export function footprintEdgesPlan(fp: Footprint, dims: FootprintDims, toPlan: ToPlan): { edge: FootprintEdge; pts: ShapePt[] }[] {
  return evaluateFootprint(fp, dims)
    .filter(s => !isDegenerate(s))
    .map(s => {
      // An arc closed by a chord back to its start samples to p0 … p1 (the
      // chord's end duplicates p0 and is dropped).
      const local = s.type === 'arc' ? sampleShapeOutline([s, { type: 'line', p0: s.p1, p1: s.p0 }]) : [s.p0, s.p1]
      return { edge: s.edge, pts: local.map(p => toPlan(p.x, p.y)) }
    })
}

/** The footprint's per-edge choices: edge_overrides, with legacy role_overrides read in under them. */
export function footprintOverrides(fp: Pick<Footprint, 'role_overrides' | 'edge_overrides'> | null | undefined): EdgeOverrides {
  const out: EdgeOverrides = {}
  for (const [id, role] of Object.entries(fp?.role_overrides ?? {})) out[id] = normaliseEdge({ role })
  return { ...out, ...(fp?.edge_overrides ?? {}) }
}

/** Apply the per-edge overrides on top of the generated edges. */
export function withEdgeOverrides(fp: Footprint): Footprint {
  const ov = footprintOverrides(fp)
  if (Object.keys(ov).length === 0) return fp
  return {
    ...fp,
    segments: fp.segments.map(s => {
      const o = ov[s.edge.id]
      if (!o) return s
      const edge: FootprintEdge = { ...s.edge, role: o.role }
      delete edge.sub; delete edge.scribe
      if (o.sub) edge.sub = o.sub
      if (o.scribe != null) edge.scribe = o.scribe
      return { ...s, edge }
    }),
  }
}

/** A wall-side edge for benchtops: a back, or a gable scribed to the wall. */
export function isWallEdge(e: { role: EdgeRole; sub?: EdgeSub }): boolean {
  return e.role === 'back' || (e.role === 'side' && e.sub === 'scribe')
}
