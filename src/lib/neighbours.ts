// Auto-detected face neighbours (z_doorFace_module/DOOR_SYSTEM_SPEC.md §Neighbours).
// What sits hard against each side of a cabinet picks its side reveal: REVL / REVR
// next to another cabinet, REVENDL / REVENDR next to an end panel, wall or nothing
// (resolveReveal). Detected in plan: a probe just past each side, near the front.
import type { CabinetInstance, NeighbourType, Room, Wall } from './types'
import { cabWallPerp, cabinetCornerPts, cabinetToPlan, cabsBlock, centroid, wallInwardNormal, wallMitreCorners, type Pt } from './geometry'

/** How far past the side the probe looks — a neighbour further off than this isn't touching. */
const PROBE = 5
/** How far behind the front the probe sits (what matters is what's beside the doors). */
const FRONT_IN = 10

export interface NeighbourPair { left: NeighbourType; right: NeighbourType }

/** A panel-only item (end panel, filler, back panel, curved fixed panel): no box, no face. */
export function isPanelItem(c: Pick<CabinetInstance, 'has_face' | 'has_carcass'>): boolean {
  return !c.has_face && !c.has_carcass
}

function inside(poly: Pt[], p: Pt): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

/**
 * Detected left / right neighbour (as seen facing the cabinet's front) of every
 * cabinet with a face. A panel item touching the side → end_panel, another
 * cabinet (fillers with a box, e.g. BFKANG, count as cabinets) → cabinet, a wall
 * body → wall, nothing → freestanding. Only items that overlap the cabinet
 * vertically count (a wall unit ignores the base below it).
 */
export function detectNeighbours(cabinets: CabinetInstance[], walls: Wall[], room: Room): Map<string, NeighbourPair> {
  const ref = centroid(walls)
  const wallById = new Map(walls.map(w => [w.id, w]))
  const others = cabinets.flatMap(c => {
    const w = c.wall_id ? wallById.get(c.wall_id) : undefined
    if (!w || c.is_kick_assembly) return []
    return [{ c, poly: cabinetCornerPts(c, w, cabWallPerp(c, w, wallInwardNormal(w, ref))) }]
  })
  const wallPolys = walls.map(w => wallMitreCorners(w, walls, ref)).filter(p => p.length >= 3)

  const out = new Map<string, NeighbourPair>()
  for (const cab of cabinets) {
    const wall = cab.wall_id ? wallById.get(cab.wall_id) : undefined
    if (!wall || !cab.has_face || cab.is_kick_assembly) continue
    const toPlan = cabinetToPlan(cab, wall, cabWallPerp(cab, wall, wallInwardNormal(wall, ref)))
    const lz = Math.max(cab.dz / 2, cab.dz - FRONT_IN)
    const probe = (p: Pt): NeighbourType => {
      let found: NeighbourType | null = null
      for (const o of others) {
        if (o.c.id === cab.id || !cabsBlock(cab, o.c, wall, room) || !inside(o.poly, p)) continue
        if (isPanelItem(o.c)) return 'end_panel'
        found = 'cabinet'
      }
      if (found) return found
      return wallPolys.some(poly => inside(poly, p)) ? 'wall' : 'freestanding'
    }
    out.set(cab.id, { left: probe(toPlan(-PROBE, lz)), right: probe(toPlan(cab.dx + PROBE, lz)) })
  }
  return out
}
