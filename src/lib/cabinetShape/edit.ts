// ── Shaped-cabinet edits (z_cabinet_shape_edit) ───────────────────────────────
// Pure footprint changes shared by the cabinet panel's Shape section and the
// plan-view Edit shape mode, so both write the same thing.

import {
  evaluateFootprint, footprintOverrides, withEdgeOverrides,
  type EdgeOverride, type Footprint, type FootprintDims,
} from './footprint'
import { buildPresetFootprint, withShapeChoices } from './presets'

/** The footprint with one edge's type / sub-type / scribe changed. A new type
 *  starts on its default sub-type. A preset rebuilds (keeping its corner
 *  choices); a hand-edited shape takes the change on the edge itself. */
export function withEdgeChoice(fp: Footprint, dims: FootprintDims, edgeId: string, patch: Partial<EdgeOverride>): Footprint {
  const cur = evaluateFootprint(withEdgeOverrides(fp), dims).find(s => s.edge.id === edgeId)?.edge
  if (!cur) return fp
  const next: EdgeOverride = { role: cur.role, sub: cur.sub, scribe: cur.scribe, ...patch }
  if (patch.role && patch.role !== cur.role) { delete next.sub; delete next.scribe }
  if (next.sub !== 'scribe') delete next.scribe
  if (next.sub == null) delete next.sub
  if (next.scribe == null) delete next.scribe
  const edge_overrides = { ...footprintOverrides(fp), [edgeId]: next }
  if (fp.preset) {
    const rebuilt = withShapeChoices(fp, buildPresetFootprint(fp.preset, fp.params, dims, edge_overrides))
    if (rebuilt) return rebuilt
  }
  const base: Footprint = { ...fp, edge_overrides }
  delete base.role_overrides
  return withEdgeOverrides(base)
}

/** A rectangle cabinet's footprint — the start for Edit shape on a plain box. */
export function rectangleFootprint(dims: FootprintDims): Footprint {
  return buildPresetFootprint('rectangle', {}, dims)!
}
