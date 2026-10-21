// Automatic 3D camera shots for the shop drawings (z_shop_drawings S8).
// World frame = Room3DScene's: x = plan x, z = plan y, y = up (mm).
// Each shot looks at a subject from a raised 3/4 angle. Any perimeter wall the
// camera stands behind (outside its room side) is hidden for that shot — the
// dollhouse cut-away — which also drops that wall's cabinets and tops.
import type { Wall, CabinetInstance } from '../types'
import { centroid, wallEnd, wallInwardNormal } from '../geometry'

export interface Shot3D {
  id: string
  label: string
  eye: [number, number, number]
  target: [number, number, number]
  hiddenWallIds: string[]
}

const FOV_V = 40   // matches Room3DScene's camera
const ASPECT = 4 / 3

/** Cabinet run length along each wall (face side + back side). */
function runLength(w: Wall, cabinets: CabinetInstance[]): number {
  return cabinets.filter(c => c.wall_id === w.id).reduce((s, c) => s + c.dx, 0)
}

/** Perimeter walls whose room side the eye is NOT on — they'd block the view. */
export function wallsBehindEye(walls: Wall[], eyeX: number, eyeZ: number): string[] {
  const rc = centroid(walls)
  return walls.filter(w => {
    if (w.wall_type !== 'standard') return false
    const n = wallInwardNormal(w, rc)
    return (eyeX - w.pos_x) * n.x + (eyeZ - w.pos_y) * n.y < 0
  }).map(w => w.id)
}

/** A raised 3/4 view square-on to a wall run, swung `swingDeg` toward its end. */
function shotForWall(w: Wall, walls: Wall[], roomH: number, swingDeg: number, id: string, label: string): Shot3D {
  const rc = centroid(walls)
  const n = wallInwardNormal(w, rc)
  const e = wallEnd(w)
  const len = Math.max(w.length, 1200)
  // Aim at the middle of the run, a little in front of it, at bench-ish height.
  const tx = (w.pos_x + e.x) / 2 + n.x * 300, tz = (w.pos_y + e.y) / 2 + n.y * 300
  const ty = Math.min(roomH * 0.42, 1100)
  // Back off far enough for the run (plus margin) to fill the frame's width.
  const tanH = Math.tan((FOV_V / 2) * Math.PI / 180) * ASPECT
  const dist = Math.max((len * 0.62) / tanH, (roomH * 0.7) / Math.tan((FOV_V / 2) * Math.PI / 180))
  const sw = swingDeg * Math.PI / 180
  // Rotate the inward normal by the swing about the vertical axis.
  const dx = n.x * Math.cos(sw) - n.y * Math.sin(sw), dz = n.x * Math.sin(sw) + n.y * Math.cos(sw)
  const eyeX = tx + dx * dist, eyeZ = tz + dz * dist
  const eyeY = ty + dist * 0.38
  return { id, label, eye: [eyeX, eyeY, eyeZ], target: [tx, ty, tz], hiddenWallIds: wallsBehindEye(walls, eyeX, eyeZ).filter(x => x !== w.id) }
}

/** Stage 1: one shot of the main run (the wall carrying the most cabinet length). */
export function autoShots(walls: Wall[], cabinets: CabinetInstance[], roomH: number): Shot3D[] {
  const std = walls.filter(w => w.wall_type === 'standard')
  if (!std.length) return []
  const main = [...std].sort((a, b) => runLength(b, cabinets) - runLength(a, cabinets) || b.length - a.length)[0]
  return [shotForWall(main, walls, roomH, 28, `run-${main.id}`, `${main.name}`)]
}
