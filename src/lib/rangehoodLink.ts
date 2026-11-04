// WUP takes the rangehood hole (z_rangehood R6). An under panel finds the
// rangehood cabinets sitting on it (same wall + side, overlapping it, bottom
// scribe = its thickness — carcassesOverPanel) and cuts each one's hole in its
// Under Panel, mapped through plan space so the two always line up. Generated
// on every resolve of the panel (source `linked`), never stored.
import type { CabinetInstance, Wall } from './types'
import type { Cutout } from './partCutouts'
import { carcassesOverPanel } from './underPanel'
import { centroid, wallInwardNormal, cabWallPerp, cabinetToPlan, cabinetPlanFrame } from './geometry'
import { normaliseRangehood, type RangehoodSettings } from './rangehood'

/** The hole in a cabinet's own frame: X across, Z from the back (wall) forward. */
export type HoleRect = { x0: number; x1: number; z0: number; z1: number }

/** A rect in one cabinet's frame → another's, through plan space. */
export function mapHoleRect(r: HoleRect, from: CabinetInstance, to: CabinetInstance, wall: Wall, walls: Wall[]): HoleRect {
  const ref = centroid(walls)
  const inward = wallInwardNormal(wall, ref)
  const toPlan = cabinetToPlan(from, wall, cabWallPerp(from, wall, inward))
  const perp = cabWallPerp(to, wall, inward)
  const { o, x } = cabinetPlanFrame(to, wall, perp)
  const local = (lx: number, lz: number) => {
    const p = toPlan(lx, lz), dx = p.x - o.x, dy = p.y - o.y
    return { x: dx * x.x + dy * x.y, z: dx * perp.x + dy * perp.y }
  }
  const a = local(r.x0, r.z0), b = local(r.x1, r.z1)
  const r2 = (v: number) => Math.round(v * 100) / 100
  return { x0: r2(Math.min(a.x, b.x)), x1: r2(Math.max(a.x, b.x)), z0: r2(Math.min(a.z, b.z)), z1: r2(Math.max(a.z, b.z)) }
}

/** A flat custom part's box in its cabinet's frame (customExtents 'flat'). */
type FlatPart = { x: number; z: number; dx: number; dy: number }

/** The hole as a cut-out on the panel's flat part (x from its left, y back from its front edge). */
export function linkedHoleCutout(id: string, r: HoleRect, rh: RangehoodSettings, part: FlatPart): Cutout {
  const r2 = (v: number) => Math.round(v * 100) / 100
  return {
    id: `rh_link_${id}`, kind: 'hole', shape: 'rect', source: 'linked', depth: null,
    w: r2(r.x1 - r.x0), d: r2(r.z1 - r.z0), radius: rh.hole.radius,
    x: { from: 'left', off: r2(r.x0 - part.x) },
    y: { from: 'front', off: r2(part.z + part.dx - r.z1) },
  }
}

/** The rangehood cabinets sitting on this under panel. */
export function rangehoodsOverPanel(panel: CabinetInstance, cabinets: CabinetInstance[]): CabinetInstance[] {
  return carcassesOverPanel(panel, cabinets).filter(c => !!normaliseRangehood(c.rangehood))
}

/** Each rangehood over the panel → its hole in the panel's frame. `holeOf`
 *  gives the WRH's resolved `rangehood_hole` (its own frame; null = none) —
 *  set whether or not it has a bottom. */
export function panelRangehoodHoles(
  panel: CabinetInstance, cabinets: CabinetInstance[], wall: Wall, walls: Wall[],
  holeOf: (c: CabinetInstance) => HoleRect | null,
): { cab: CabinetInstance; rect: HoleRect; rh: RangehoodSettings }[] {
  const out: { cab: CabinetInstance; rect: HoleRect; rh: RangehoodSettings }[] = []
  for (const c of rangehoodsOverPanel(panel, cabinets)) {
    const rh = normaliseRangehood(c.rangehood)!
    const own = holeOf(c)
    if (own) out.push({ cab: c, rect: mapHoleRect(own, c, panel, wall, walls), rh })
  }
  return out
}

/** What re-cuts a panel: the rangehoods on its wall (where they sit, their size,
 *  scribe, hole). The canvas re-resolves the panel when this changes. */
export function panelLinkSignature(panel: CabinetInstance, cabinets: CabinetInstance[]): string {
  return JSON.stringify(cabinets
    .filter(c => c.id !== panel.id && c.wall_id === panel.wall_id && !!normaliseRangehood(c.rangehood))
    .map(c => [c.id, c.pos_x, c.pos_y, c.pos_z, c.rotation, c.dx, c.dy, c.dz, c.rule_overrides ?? null, c.rangehood])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
}
