// Plan label declutter (Mark 2026-11-20): cabinet names that print on top of
// each other — e.g. a WUP under panel's name over the WC above it — get pulled
// apart. The under panel keeps its spot; the other cabinet's name moves back
// toward the wall, staying inside its own footprint. The result is a normal
// label_offsets.plan (same as dragging the name), so it stays editable / resettable.
//
// Works in the printed plan's terms (PlanViewReportSVG): name only, font
// 3.5 paper mm, default spot just inside the front edge.

import type { CabinetInstance, Wall } from './types'
import type { LabelOff } from './labelOffsets'
import { cabinetToPlan, cabWallPerp, centroid, wallInwardNormal } from './geometry'

type Pt = { x: number; y: number }
export interface DeclutterOpts { scale?: number; gap?: number }
export interface DeclutterMove { id: string; label: string; off: LabelOff; clear: boolean; with: string[] }

interface Lbl { cab: CabinetInstance; at: (z: number) => Pt; z: number; w: number; fixed: boolean; under: boolean }

/** Plan text box (axis-aligned, plan coords) for a name of `n` characters at `p`. */
function box(p: Pt, w: number, h: number) { return { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - h / 2, y1: p.y + h / 2 } }
function hit(a: ReturnType<typeof box>, b: ReturnType<typeof box>) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1 }

export function declutterPlanLabels(cabinets: CabinetInstance[], walls: Wall[], opts: DeclutterOpts = {}): DeclutterMove[] {
  const cx = centroid(walls)
  const P = opts.scale ?? 20
  const fs = 3.5 * P                       // PlanViewReportSVG cabinet label font
  const gap = opts.gap ?? 0.2 * fs
  const h = fs + gap
  const lbls: Lbl[] = []
  for (const cab of cabinets) {
    if (!cab.label || cab.is_kick_assembly) continue
    const wall = walls.find(w => w.id === cab.wall_id)
    if (!wall) continue
    const perp = cabWallPerp(cab, wall, wallInwardNormal(wall, cx))
    const toPlan = cabinetToPlan(cab, wall, perp)
    const own = cab.label_offsets?.plan
    const z = own ? cab.dz / 2 + own.y : Math.max(cab.dz / 2, cab.dz - fs * 0.9)
    const x = own ? cab.dx / 2 + own.x : cab.dx / 2
    lbls.push({
      cab, at: zz => toPlan(x, zz), z,
      w: cab.label.length * fs * 0.62 + gap,
      fixed: !!own,                         // moved by hand: leave it
      under: !!cab.rule_overrides?.UNDER_PANEL,
    })
  }
  const boxOf = (l: Lbl, z = l.z) => box(l.at(z), l.w, h)
  const clashes = (l: Lbl, z: number) => lbls.some(o => o !== l && hit(boxOf(l, z), boxOf(o)))
  const moves: DeclutterMove[] = []
  // Under panels and hand-moved names stay; everything else may step back.
  const movable = lbls.filter(l => !l.fixed && !l.under)
  for (const l of movable) {
    if (!clashes(l, l.z)) continue
    const others = lbls.filter(o => o !== l && hit(boxOf(l), boxOf(o))).map(o => o.cab.label!)
    // As far back toward the wall as is clear (the name's box inside the cabinet
    // depth) — clears both the printed spot (front edge) and the canvas spot (centre).
    // Nothing clear: the back-most spot.
    const minZ = Math.min(l.z, h / 2)
    let best = minZ, clear = false
    for (let z = minZ; z < l.z; z += 5) {
      if (!clashes(l, z)) { best = z; clear = true; break }
    }
    if (best === l.z) continue
    l.z = best
    moves.push({ id: l.cab.id, label: l.cab.label!, off: { x: 0, y: Math.round(best - l.cab.dz / 2) }, clear, with: others })
  }
  return moves
}
