// Bottom panel (z_floating F7): one exposed panel (a BBP) under a run of base
// cabinets. The carcasses over it take a plain bottom scribe (their own SCRBT
// rule) of its thickness; their fronts don't scribe, so they run down over its
// edge. Nothing here is floating-specific — any base run can sit on one.
import type { CabinetInstance, Room, Wall } from './types'
import { cabBottomZ, toRad } from './geometry'

/** The run's bottom panel itself — never blocks, never a dim-chain segment. */
export const isBottomPanel = (c: Pick<CabinetInstance, 'rule_overrides'>) => !!c.rule_overrides?.UNDER_PANEL

/** A base carcass that can sit on a bottom panel. */
export const isRunCarcass = (c: CabinetInstance) =>
  c.has_carcass && !c.is_kick_assembly && !isBottomPanel(c)
  && (c.assembly_class === 'base' || c.assembly_class === 'base_corner')

export type BottomPanelRun = {
  /** Left-most carcass in its own frame: the panel takes its pos + rotation. */
  anchor: CabinetInstance
  carcasses: CabinetInstance[]
  dx: number
  dz: number
  /** Floor → panel underside: the lowest carcass bottom (above any kick). */
  z: number
}

// Along a cabinet's own width direction (its local +X).
const along = (c: CabinetInstance) => {
  const a = toRad(c.rotation)
  return c.pos_x * Math.cos(a) + c.pos_y * Math.sin(a)
}
const sameDir = (a: CabinetInstance, b: CabinetInstance) =>
  Math.abs(((a.rotation - b.rotation) % 360 + 540) % 360 - 180) < 0.5

/** The panel for these cabinets, or why there isn't one. `kickOf` = the kick
 *  height under a carcass's box (0 when it has none). */
export function bottomPanelRun(
  sel: CabinetInstance[], room: Room, walls: Wall[], kickOf: (c: CabinetInstance) => number,
): BottomPanelRun | string {
  const carcasses = sel.filter(isRunCarcass)
  if (!carcasses.length) return 'Select one or more base cabinets for the bottom panel.'
  const first = carcasses[0]
  if (carcasses.some(c => c.wall_id !== first.wall_id || !sameDir(c, first)))
    return 'Pick cabinets on one wall, facing the same way.'
  const anchor = carcasses.reduce((a, c) => along(c) < along(a) ? c : a)
  const lo = along(anchor)
  const hi = Math.max(...carcasses.map(c => along(c) + c.dx))
  const wall = walls.find(w => w.id === first.wall_id)
  return {
    anchor, carcasses,
    dx: Math.round(hi - lo),
    dz: Math.max(...carcasses.map(c => c.dz)),
    z: Math.min(...carcasses.map(c => cabBottomZ(c, room, wall) + kickOf(c))),
  }
}

/** Carcasses scribed over this panel (same wall + direction, overlapping it,
 *  bottom scribe = its thickness) — their scribe goes when the panel does. */
export function carcassesOverPanel(panel: CabinetInstance, cabinets: CabinetInstance[]): CabinetInstance[] {
  const lo = along(panel), hi = lo + panel.dx
  return cabinets.filter(c => isRunCarcass(c) && c.wall_id === panel.wall_id && sameDir(c, panel)
    && along(c) < hi - 0.5 && along(c) + c.dx > lo + 0.5
    && Math.abs(Number(c.rule_overrides?.SCRBT ?? NaN) - panel.dy) < 0.5)
}

/** rule_overrides without the bottom-panel scribe. */
export function withoutScribe(ro: CabinetInstance['rule_overrides']) {
  const next = { ...(ro ?? {}) }
  delete next.SCRBT
  return next
}
