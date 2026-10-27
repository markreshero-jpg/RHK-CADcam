// ============================================================
// Benchtop quote (Reports → "Benchtop Quote", for stonemasons).
// Straight from the drawn tops — no "Resolve Parts" needed: per top its area,
// exposed edge lineal mm per profile code, wall / joint edge lengths, cutouts
// and waterfall legs. Material comes from the supply rows when they exist.
// ============================================================

import type { BenchtopInstance, BenchtopEdgeProfile } from './types'
import { btSegments, outlinePoints, signedArea, segLength, effectiveProfileId } from './benchtopGeometry'

export interface QuoteTop {
  id:         string
  name:       string
  material:   string | null
  thickness:  number | null
  area_m2:    number
  /** Exposed edges: profile code → lineal mm. Edges with no profile go under '—'. */
  profiles:   Record<string, number>
  wallMm:     number
  jointMm:    number
  cutouts:    number
  waterfalls: number
}

export interface QuoteTotals {
  area_m2:    number
  profiles:   { code: string; mm: number }[]
  cutouts:    number
  waterfalls: number
}

const r2 = (v: number) => Math.round(v * 100) / 100

export function quoteTops(
  benchtops: BenchtopInstance[],
  opts: {
    profiles?: Record<string, BenchtopEdgeProfile>
    defaultProfileId?: (bt: BenchtopInstance) => string | null
    thickness?: (bt: BenchtopInstance) => number | null
    material?: (bt: BenchtopInstance) => string | null
  } = {},
): QuoteTop[] {
  return benchtops.flatMap(bt => {
    const segs = btSegments(bt)
    if (segs.length < 2) return []
    const holes = (bt.cutout_polygons ?? []).reduce((a, c) => a + Math.abs(signedArea(c)), 0)
    const area = Math.max(0, Math.abs(signedArea(outlinePoints(segs))) - holes) / 1e6
    const def = opts.defaultProfileId?.(bt) ?? null
    const profiles: Record<string, number> = {}
    let wallMm = 0, jointMm = 0, waterfalls = 0
    for (const s of segs) {
      const len = segLength(s)
      if (s.edge?.wall) { wallMm += len; continue }
      if (s.edge?.joint) { jointMm += len; continue }
      const pid = effectiveProfileId(s, def)
      const prof = pid ? opts.profiles?.[pid] : undefined
      const code = prof ? (prof.code ?? prof.name) : '—'
      profiles[code] = (profiles[code] ?? 0) + len
      if (prof?.generates === 'waterfall') waterfalls++
    }
    return [{
      id: bt.id, name: bt.label ?? 'Benchtop',
      material: opts.material?.(bt) ?? null, thickness: opts.thickness?.(bt) ?? null,
      area_m2: r2(area), profiles, wallMm, jointMm,
      cutouts: (bt.cutout_polygons ?? []).length, waterfalls,
    }]
  })
}

export function quoteTotals(tops: QuoteTop[]): QuoteTotals {
  const prof = new Map<string, number>()
  for (const t of tops) for (const [code, mm] of Object.entries(t.profiles)) prof.set(code, (prof.get(code) ?? 0) + mm)
  return {
    area_m2: r2(tops.reduce((a, t) => a + t.area_m2, 0)),
    profiles: [...prof.entries()].map(([code, mm]) => ({ code, mm: Math.round(mm) })).sort((a, b) => a.code.localeCompare(b.code)),
    cutouts: tops.reduce((a, t) => a + t.cutouts, 0),
    waterfalls: tops.reduce((a, t) => a + t.waterfalls, 0),
  }
}

/** "PE 2.41 · SQ 0.60" — lineal metres per profile code. */
export const profilesText = (p: Record<string, number>) =>
  Object.entries(p).sort(([a], [b]) => a.localeCompare(b)).map(([c, mm]) => `${c} ${(mm / 1000).toFixed(2)}`).join(' · ')
