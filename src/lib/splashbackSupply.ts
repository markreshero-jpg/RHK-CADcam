// Splashbacks on the Benchtop Supply sheet (z_splashback). A surface splashback
// (stone / glass / tile / mirror …) is an order item like a stone top (L5): one
// line per piece with its size, area (window + hand cut-outs taken off) and
// cut-outs. S3: slab joints split it into pieces (butt joins between them);
// each return is its own line (mitre / butt), and a 'back' return runs the
// main piece round to the outer corner (+ thickness).
// Board splashbacks are cut parts, so they're left off.

import type { RoomFixture, SplashbackInstance, Wall } from './types'
import type { SupplyLine } from './benchtop-resolver/supply'
import type { BenchtopPartJoin } from './benchtop-resolver/types'
import { centroid } from './geometry'
import { sbBounds, isRect, sbOpenings, sbAllHoles, jointXs, clipPolyX, sbReturnGeos, type SbHole } from './splashbackGeometry'
import { outlinePoints } from './benchtopGeometry'

/** What the supply line needs to know about a piece's material. */
export interface SbSupplyInfo { name: string | null; thick: number; isBoard: boolean }

const r2 = (v: number) => Math.round(v * 100) / 100

function polyArea(pts: { x: number; y: number }[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

const holeArea = (h: SbHole) => h.round ? Math.PI * ((h.x1 - h.x0) / 2) ** 2 : (h.x1 - h.x0) * (h.z1 - h.z0)

export function splashbackSupplyLines(
  splashbacks: SplashbackInstance[],
  info: (sb: SplashbackInstance) => SbSupplyInfo,
  walls: Wall[],
  fixtures: RoomFixture[],
): SupplyLine[] {
  const rc = walls.length ? centroid(walls) : { x: 0, y: 0 }
  const out: SupplyLine[] = []
  for (const sb of [...splashbacks].sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))) {
    const inf = info(sb)
    if (inf.isBoard) continue
    const b = sbBounds(sb.segments)
    const wall = walls.find(w => w.id === sb.wall_id)
    if (!b || !wall) continue
    const holes = sbAllHoles(sb, b, sbOpenings(fixtures, wall, sb.wall_side, rc))
    const pts = outlinePoints(sb.segments)
    const rets = sbReturnGeos(sb, b, inf.thick)
    // Pieces between the slab joints.
    const xs = [b.x0, ...jointXs(sb, b), b.x1]
    const n = xs.length - 1
    for (let i = 0; i < n; i++) {
      const a = xs[i], c = xs[i + 1]
      const part = n > 1 ? clipPolyX(pts, a, c) : pts
      if (part.length < 3) continue
      const pz = part.map(p => p.y)
      const z0 = Math.min(...pz), z1 = Math.max(...pz)
      // A hole belongs to the piece holding its centre.
      const mine = holes.filter(h => { const cx = (h.x0 + h.x1) / 2; return cx >= a && (cx < c || (i === n - 1 && cx <= c)) })
      const joins: BenchtopPartJoin[] = []
      if (i > 0) joins.push({ type: 'butt', length: Math.round(z1 - z0) })
      if (i < n - 1) joins.push({ type: 'butt', length: Math.round(z1 - z0) })
      // Back returns run this piece round to the outer corner.
      let len = c - a
      for (const g of rets) {
        const atEnd = (g.r.end === 'left' && i === 0) || (g.r.end === 'right' && i === n - 1)
        if (!atEnd) continue
        if (g.r.dir === 'back') len += inf.thick
        // Recorded on both pieces it joins (the totals halve them), like benchtop joins.
        joins.push({ type: g.r.join, length: Math.round(g.z1 - g.z0) })
      }
      const shaped = !isRect(sb.segments)
      out.push({
        benchtopId: sb.id, source: sb.label ?? 'Splashback', roomId: sb.room_id,
        role: 'splashback', label: n > 1 ? `Splashback – piece ${i + 1} of ${n}` : 'Splashback', piece: n > 1 ? i + 1 : null,
        length: Math.round(len), width: Math.round(z1 - z0), thickness: inf.thick, quantity: 1,
        material: inf.name ?? 'Unknown',
        area_m2: r2((polyArea(part) + (len - (c - a)) * (z1 - z0) - mine.reduce((s, h) => s + holeArea(h), 0)) / 1e6),
        // Part frame for the thumbnail: x along, y down from the top edge.
        outline: shaped ? part.map(p => ({ x: p.x - a, y: z1 - p.y })) : null,
        profiles: {},
        cutouts: mine.map(h => ({ w: Math.round(h.x1 - h.x0), h: Math.round(h.z1 - h.z0), round: !!h.round })),
        joins,
        waterfallJoin: null,
      })
    }
    for (const g of rets) {
      out.push({
        benchtopId: sb.id, source: sb.label ?? 'Splashback', roomId: sb.room_id,
        role: 'splashback', label: `Return – ${g.r.end} end`, piece: null,
        length: Math.round(g.z1 - g.z0), width: g.supplyLen, thickness: inf.thick, quantity: 1,
        material: inf.name ?? 'Unknown',
        area_m2: r2(((g.z1 - g.z0) * g.supplyLen) / 1e6),
        outline: null, profiles: {}, cutouts: [], joins: [{ type: g.r.join, length: Math.round(g.z1 - g.z0) }],
        waterfallJoin: null,
      })
    }
  }
  return out
}
