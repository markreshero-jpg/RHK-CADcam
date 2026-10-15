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

export type EdgeRole = 'back' | 'side' | 'front' | 'open' | 'scribe'
export type SideFinish = 'finished' | 'unfinished' | 'neighbour'

export const EDGE_ROLES: { value: EdgeRole; label: string }[] = [
  { value: 'back',   label: 'Back' },
  { value: 'side',   label: 'Side' },
  { value: 'front',  label: 'Front (face)' },
  { value: 'open',   label: 'Open' },
  { value: 'scribe', label: 'Scribe' },
]

// Display names for the preset edge ids (presets.ts); anything else shows its id.
const EDGE_LABELS: Record<string, string> = {
  back: 'Back', back2: 'Back (corner wall)', end: 'End', facet: 'Angled facet',
  front: 'Front', side: 'Side', curve: 'Curve', left: 'Left', right: 'Right',
  fill_a: 'Filler A', fill_b: 'Filler B', side_a: 'Side A', side_b: 'Side B',
}
export function edgeLabel(id: string): string {
  return EDGE_LABELS[id] ?? id
}

export interface FootprintEdge {
  /** Stable id. Faces and role overrides key off this, never the index. */
  id: string
  role: EdgeRole
  finish?: SideFinish
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
  /** User-chosen roles by edge id. Survives regenerating from the preset. */
  role_overrides?: Record<string, EdgeRole>
  /** Panel edges whose end is bevelled flush where it meets an angled front /
   *  open edge (z_cabinet_shape 4a). Default square; set per part by right-click. */
  flush_ends?: string[]
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

/** Apply role_overrides on top of the generated roles. */
export function withRoleOverrides(fp: Footprint): Footprint {
  const ov = fp.role_overrides
  if (!ov || Object.keys(ov).length === 0) return fp
  return { ...fp, segments: fp.segments.map(s => ov[s.edge.id] ? { ...s, edge: { ...s.edge, role: ov[s.edge.id] } } : s) }
}
