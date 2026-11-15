// Splashbacks on the Benchtop Supply sheet (z_splashback). A surface splashback
// (stone / glass / tile / mirror …) is an order item like a stone top (L5): one
// line per piece with its size, area (window cut-outs taken off) and cut-outs.
// Board splashbacks are cut parts, so they're left off.

import type { RoomFixture, SplashbackInstance, Wall } from './types'
import type { SupplyLine } from './benchtop-resolver/supply'
import { centroid } from './geometry'
import { sbBounds, isRect, openingHoles, sbOpenings } from './splashbackGeometry'
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
    const holes = openingHoles(b, sbOpenings(fixtures, wall, sb.wall_side, rc), Number(sb.opening_reveal_mm) || 0)
    const pts = outlinePoints(sb.segments)
    const area = polyArea(pts) - holes.reduce((s, h) => s + (h.x1 - h.x0) * (h.z1 - h.z0), 0)
    out.push({
      benchtopId: sb.id, source: sb.label ?? 'Splashback', roomId: sb.room_id,
      role: 'splashback', label: 'Splashback', piece: null,
      length: Math.round(b.x1 - b.x0), width: Math.round(b.z1 - b.z0), thickness: inf.thick, quantity: 1,
      material: inf.name ?? 'Unknown',
      area_m2: r2(area / 1e6),
      // Part frame for the thumbnail: x along, y down from the top edge.
      outline: isRect(sb.segments) ? null : pts.map(p => ({ x: p.x - b.x0, y: b.z1 - p.y })),
      profiles: {},
      cutouts: holes.map(h => ({ w: Math.round(h.x1 - h.x0), h: Math.round(h.z1 - h.z0), round: false })),
      joins: [],
      waterfallJoin: null,
    })
  }
  return out
}
