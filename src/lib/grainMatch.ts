// Grain match groups (z_grain_match/GRAIN-MATCH-SPEC.md): the fronts of a group's
// cabinets nest as one block, laid out as in elevation, with the group's grain
// direction. Membership is per cabinet (cabinet_instances.grain_match_group_id).
import type { CabinetInstance, Wall } from './types'
import { cabWallSide } from './geometry'

export type GrainMatchDirection = 'vertical' | 'horizontal'

export interface GrainMatchGroup {
  id: string
  room_id: string
  name: string            // 'GM1', 'GM2' … per room
  direction: GrainMatchDirection
  created_at: string
}

export const grainArrow = (d: GrainMatchDirection) => (d === 'horizontal' ? '↔' : '↕')

/** Next free 'GMn' name in the room. */
export function nextGrainMatchName(groups: GrainMatchGroup[]): string {
  const n = groups.reduce((m, g) => Math.max(m, Number(/^GM(\d+)$/.exec(g.name)?.[1] ?? 0)), 0)
  return `GM${n + 1}`
}

/** A cabinet whose fronts can be matched: it has a face and isn't a kick / bulkhead. */
export function hasMatchableFronts(c: CabinetInstance): boolean {
  return c.has_face && !c.is_kick_assembly && !c.bulkhead
}

/** Why these cabinets can't form (or join) one group, or null when they can. One wall, one side. */
export function grainMatchBlocker(cabs: CabinetInstance[], walls: Wall[]): string | null {
  if (!cabs.length) return 'nothing picked'
  if (cabs.some(c => !hasMatchableFronts(c))) return 'no fronts'
  const wallIds = new Set(cabs.map(c => c.wall_id))
  if (wallIds.size > 1 || !cabs[0].wall_id) return 'one wall only'
  const wall = walls.find(w => w.id === cabs[0].wall_id)
  if (!wall) return 'one wall only'
  if (new Set(cabs.map(c => cabWallSide(c, wall))).size > 1) return 'one wall side only'
  return null
}
