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

// Group colours for the grain_match layer (z_grain_match G2), by GM number.
const GM_COLOURS = ['#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6', '#ef4444', '#22c55e', '#3b82f6', '#eab308']

export function grainMatchColour(g: Pick<GrainMatchGroup, 'name'>): string {
  const n = Number(/^GM(\d+)$/.exec(g.name)?.[1] ?? 1)
  return GM_COLOURS[(Math.max(1, n) - 1) % GM_COLOURS.length]
}

/** `GM1 ↕` */
export const grainMatchTag = (g: GrainMatchGroup) => `${g.name} ${grainArrow(g.direction)}`

/** Group → the member that carries its tag in a view: the leftmost by `x` (cabinets in view order). */
export function grainMatchTagCabs(cabs: CabinetInstance[], x: (c: CabinetInstance) => number): Map<string, string> {
  const best = new Map<string, { id: string; x: number }>()
  for (const c of cabs) {
    const gid = c.grain_match_group_id
    if (!gid) continue
    const cx = x(c), b = best.get(gid)
    if (!b || cx < b.x) best.set(gid, { id: c.id, x: cx })
  }
  return new Map([...best].map(([gid, b]) => [gid, b.id]))
}
