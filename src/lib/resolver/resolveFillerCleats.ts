// ============================================================
// Return cleats behind face fillers (z_angled_filler, decision 4).
//
// With the support carcass switched off (has_carcass = false) each face filler
// (a front edge carrying `edge.filler`) gets a return cleat at its end against
// a side edge: a strip standing in the side edge's plane — outer face on the
// outline, where the neighbouring cabinet's side butts it, thickness inward —
// from the filler's back face back by `filler.cleat`, the filler's height.
// The neighbouring cabinets fix it in. With the carcass on, the filler fixes to
// the carcass and there are no cleats.
//
// `cleat:<side edge>` face-kind case part, the same frame as `side:<edge>`
// (DY length along the edge, DX height, DZ thickness inward, AY about its
// outer start corner). Hand-fixed: no seams / drilling.
// ============================================================

import type { CabinetInput, ConstructionRules, ResolvedCasePart, ResolvedFaceZone } from './types'
import type { FootprintSegment } from '../cabinetShape/footprint'
import { edgeFrame } from '../cabinetShape/construct'
import { shapedInterior } from './resolveShapedCase'
import { primaryFacetId } from './resolveShapedFace'
import { resolveFaceZ } from './mergeRules'

const NEAR = 0.5

const isSide = (s: FootprintSegment) => s.type === 'line' && s.edge.role === 'side'

export function resolveFillerCleats(cab: CabinetInput, r: ConstructionRules, zones: ResolvedFaceZone[]): ResolvedCasePart[] {
  if (cab.has_carcass) return []
  const shape = shapedInterior(cab)
  if (!shape) return []
  const { segs } = shape
  const n = segs.length
  const primary = primaryFacetId(segs, cab.DZ)
  const t = cab.material.DZ
  // The filler's back face stands this far out of the edge line (overlay).
  const ft = cab.resolved_doors?.['*']?.thickness_mm ?? cab.door_material.DZ
  const backOff = Math.max(0, resolveFaceZ(cab.DZ, ft, r) - cab.DZ)

  const out: ResolvedCasePart[] = []
  segs.forEach((s, i) => {
    if (s.type !== 'line' || s.edge.role !== 'front' || !s.edge.filler) return
    const zone = zones.find(z => (z.facet ?? primary) === s.edge.id)
    if (!zone) return
    const len = s.edge.filler.cleat
    if (!(len > 0)) return
    for (const [nb, V] of [[segs[(i - 1 + n) % n], s.p0], [segs[(i + 1) % n], s.p1]] as const) {
      if (!isSide(nb)) continue
      const f = edgeFrame(nb)
      // Along the side edge (its own direction u): the cleat's front end is the
      // filler's back face, `backOff` in front of the vertex.
      const atStart = Math.hypot(V.x - nb.p0.x, V.y - nb.p0.y) < NEAR
      const s0 = atStart ? -backOff : f.len + backOff - (backOff + len)
      const a = { x: nb.p0.x + f.u.x * s0, y: nb.p0.y + f.u.y * s0 }
      out.push({
        part_key: `cleat:${nb.edge.id}`,
        DX: zone.DY, DY: backOff + len, DZ: t,
        X: a.x, Y: zone.Y, Z: a.y,
        AX: 0, AY: Math.atan2(-f.u.y, f.u.x) * 180 / Math.PI, AZ: 0,
        material_id: cab.material.id,
        edge_band: { top: false, bottom: false, left: false, right: false },
      })
    }
  })
  return out
}
