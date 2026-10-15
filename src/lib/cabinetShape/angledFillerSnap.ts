// ── Angled corner filler: snap into a wall corner (z_angled_filler A3) ───────
// On placement the filler sits on `wall` with its wall corner C (where its two
// backs meet) on the end of `wall` nearer the drop point, and takes the angle
// and hand from the wall joined there: θ = how far that wall turns into the
// room, `side` = the end of the cabinet it is on (in the cabinet's own frame —
// which is turned on walls whose inside face is to their right).
// Pure: returns the new footprint, box and pos, or null when there is no inside
// corner to snap to (lone wall end, outside corner, θ out of 5°–90°).

import type { CabinetInstance, Wall } from '../types'
import { wallDir, wallEnd, wallInwardNormal, dist, type Pt, type RoomRef } from '../geometry'
import { evaluateFootprint } from './footprint'
import { buildPresetFootprint, presetBox } from './presets'

const JSNAP = 5   // mm — wall ends this close are joined (as wallMitreCorners)

export interface FillerSnap {
  footprint: NonNullable<CabinetInstance['footprint']>
  dx: number
  dz: number
  pos_x: number
  pos_y: number
}

export function angledFillerSnap(
  cab: Pick<CabinetInstance, 'footprint'>, wall: Wall, walls: Wall[], ref: RoomRef, dropT: number,
): FillerSnap | null {
  const fp = cab.footprint
  if (!fp || fp.preset !== 'angled_filler' || wall.wall_type === 'island') return null
  const d = wallDir(wall)
  const perp = wallInwardNormal(wall, ref)
  const turned = d.x * perp.y - d.y * perp.x < 0
  const X = turned ? { x: -d.x, y: -d.y } : d
  const S = { x: wall.pos_x, y: wall.pos_y }, E = wallEnd(wall)
  const mid = { x: (S.x + E.x) / 2, y: (S.y + E.y) / 2 }

  // The other wall at a corner, as its direction away from the corner.
  const away = (corner: Pt): Pt | null => {
    for (const o of walls) {
      if (o.id === wall.id || o.wall_type === 'island' || o.length <= 0) continue
      const od = wallDir(o)
      if (dist(corner, { x: o.pos_x, y: o.pos_y }) < JSNAP) return od
      if (dist(corner, wallEnd(o)) < JSNAP) return { x: -od.x, y: -od.y }
    }
    return null
  }
  // Nearer end first, then the other.
  const ends = dropT <= wall.length / 2 ? [S, E] : [E, S]
  for (const corner of ends) {
    const u = away(corner)
    if (!u) continue
    const lx = u.x * X.x + u.y * X.y, ly = u.x * perp.x + u.y * perp.y
    if (ly <= 1e-6) continue                                   // outside corner
    const right = (corner.x - mid.x) * X.x + (corner.y - mid.y) * X.y > 0
    const theta = Math.round(Math.atan2(ly, right ? lx : -lx) * 1800 / Math.PI) / 10
    if (theta < 5 || theta > 90) continue
    const next = buildPresetFootprint('angled_filler', { ...fp.params, angle: theta, side: right ? 'right' : 'left' }, { w: 0, d: 0 }, fp.role_overrides)
    const box = presetBox(next)
    if (!next || !box) continue
    const C = evaluateFootprint(next, { w: box.w, d: box.d }).find(s => s.edge.id === 'back2')?.p0
    if (!C) continue
    // Local origin in plan, then pos (the wall-start end of the span).
    const o = { x: corner.x - C.x * X.x, y: corner.y - C.x * X.y }
    const pos = turned ? { x: o.x - box.w * d.x, y: o.y - box.w * d.y } : o
    return { footprint: next, dx: box.w, dz: box.d, pos_x: pos.x, pos_y: pos.y }
  }
  return null
}
