// ── Waterfall legs as cabinet obstacles ──────────────────────────────────────
// Spec: z_benchtop_builder/BENCHTOP-SPEC.md (waterfall legs, P-h).
//
// A waterfall leg is a worktop-thickness panel under a waterfall edge, running
// down to the floor, INSIDE the top's outline (the edge's strip, inset by the
// top's thickness — same footprint the elevation + 3D draw). Cabinets must not
// overlap it, so place / move / stretch add each leg's along-wall range to their
// `occupied` list, the same { t, dx } shape cabinets use.

import type { Wall, Room, BenchtopInstance, BenchtopEdgeProfile } from './types'
import { cabVExtent, type Pt } from './geometry'
import { btSegments, outwardNormal, effectiveProfileId } from './benchtopGeometry'
import { wallFrame, alongOf, offOf, type WallSide } from './benchtopAnchor'

export interface WaterfallLeg {
  /** Plan footprint: edge p0, p1, then both inset by the top's thickness. */
  pts: Pt[]
  /** Leg top height above the floor (the top surface — conservative for butt). */
  topZ: number
}

/** Every waterfall leg footprint in the room. */
export function waterfallLegs(
  benchtops: BenchtopInstance[],
  info: (bt: BenchtopInstance) => { topZ: number; thick: { total: number }; defaultProfileId: string | null },
  profiles: Record<string, BenchtopEdgeProfile>,
): WaterfallLeg[] {
  const legs: WaterfallLeg[] = []
  for (const bt of benchtops) {
    const segs = btSegments(bt)
    if (segs.length < 3) continue
    const { topZ, thick, defaultProfileId } = info(bt)
    segs.forEach((s, i) => {
      const pid = effectiveProfileId(s, defaultProfileId)
      if (!pid || profiles[pid]?.generates !== 'waterfall') return
      const n = outwardNormal(segs, i)
      const inset = (p: Pt) => ({ x: p.x - n.x * thick.total, y: p.y - n.y * thick.total })
      legs.push({ pts: [s.p0, s.p1, inset(s.p1), inset(s.p0)], topZ })
    })
  }
  return legs
}

/**
 * Along-wall ranges of the legs a cabinet on `wall` / `side` would run into:
 * the leg's footprint must fall within the mover's depth off that face, and the
 * mover must reach below the leg's top (wall units hang above the benchtop).
 */
export function waterfallOccupancy(
  legs: WaterfallLeg[],
  wall: Wall,
  side: WallSide,
  cx: Pt,
  room: Room,
  mover: { assembly_class: string; dy: number; dz?: number; bulkhead?: unknown },
): { t: number; dx: number }[] {
  if (!legs.length) return []
  const [bottom] = cabVExtent(mover.assembly_class, mover.dy, wall, room, mover.bulkhead)
  const depth = mover.dz ?? 600
  const f = wallFrame(wall, side, cx)
  const out: { t: number; dx: number }[] = []
  for (const leg of legs) {
    if (bottom >= leg.topZ - 1) continue
    const offs = leg.pts.map(p => offOf(f, p))
    if (Math.max(...offs) <= 1 || Math.min(...offs) >= depth - 1) continue
    const ts = leg.pts.map(p => alongOf(f, p))
    const t0 = Math.min(...ts), t1 = Math.max(...ts)
    if (t1 <= 0 || t0 >= wall.length) continue
    out.push({ t: t0, dx: t1 - t0 })
  }
  return out
}
