// 3D camera shots for the shop drawings (z_shop_drawings S8).
// World frame = Room3DScene's: x = plan x, z = plan y, y = up (mm).
// Auto shots: a bird's eye of the whole room, one low 3/4 view per cabinet run
// (biggest first), and each island from both sides. For every shot:
//  - perimeter walls the camera stands behind are hidden (dollhouse cut-away),
//    which also drops that wall's cabinets and tops;
//  - anything standing between the camera and the subject out on the floor
//    (an island, a peninsula, a free-standing unit) is hidden too — a whole
//    island wall at once (its tops go with it), else the single cabinet.
// Saved shots come from the 3D view (room.shop_3d_shots) and keep the walls
// that were hidden when they were saved.
import type { Wall, CabinetInstance } from '../types'
import { cabWallPerp, cabWallSide, cabinetCornerPts, centroid, wallEnd, wallInwardNormal, type Pt } from '../geometry'

export interface Shot3D {
  id: string
  label: string
  eye: [number, number, number]
  target: [number, number, number]
  hiddenWallIds: string[]
  /** Single cabinets hidden for this shot (blockers not on an island wall). */
  hiddenCabinetIds?: string[]
  /** Saved from the 3D view (room.shop_3d_shots), not automatic. */
  saved?: boolean
}

const FOV_V = 40   // matches Room3DScene's camera
const ASPECT = 4 / 3
const MAX_RUN_SHOTS = 4
/** A blocker must stand at least this far in front of the subject — the corner units beside a run aren't. */
const BLOCKER_CLEAR = 700
/** Run / island shots look down this much (Mark, 2026-10-27: 21° looked too steep). */
const RUN_PITCH_DEG = 11
/** Bird's eye: looking down at the whole room from a high corner. */
const BIRDSEYE_PITCH_DEG = 50

/** Cabinet run length on a wall's face side. */
function runLength(w: Wall, cabinets: CabinetInstance[]): number {
  return cabinets.filter(c => c.wall_id === w.id && cabWallSide(c, w) === 'face').reduce((s, c) => s + c.dx, 0)
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

function inTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const s = (p1: Pt, p2: Pt, p3: Pt) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

/** Objects out on the floor between the eye and the subject wall line (a → b, facing n). */
function blockers(walls: Wall[], cabinets: CabinetInstance[], subject: Wall, eye: Pt, a: Pt, b: Pt, n: Pt, skipWalls: Set<string>) {
  const rc = centroid(walls)
  const wallIds = new Set<string>(), cabIds = new Set<string>()
  for (const c of cabinets) {
    const w = c.wall_id ? walls.find(x => x.id === c.wall_id) : undefined
    if (!w || w.id === subject.id || skipWalls.has(w.id)) continue
    const pts = cabinetCornerPts(c, w, cabWallPerp(c, w, wallInwardNormal(w, rc)))
    const blocks = pts.some(p => (p.x - a.x) * n.x + (p.y - a.y) * n.y >= BLOCKER_CLEAR && inTriangle(p, eye, a, b))
    if (!blocks) continue
    if (w.wall_type === 'island') wallIds.add(w.id); else cabIds.add(c.id)
  }
  return { wallIds: [...wallIds], cabIds: [...cabIds] }
}

/** A raised view square-on to a wall line (looking against `n`), swung `swingDeg` about the vertical. */
function shotOf(subject: Wall, n: Pt, walls: Wall[], cabinets: CabinetInstance[], roomH: number, swingDeg: number, id: string, label: string, keepSubjectWall: boolean): Shot3D {
  const e = wallEnd(subject)
  const len = Math.max(subject.length, 1200)
  // Aim at the middle of the run, a little in front of it, at bench-ish height.
  const tx = (subject.pos_x + e.x) / 2 + n.x * 300, tz = (subject.pos_y + e.y) / 2 + n.y * 300
  const ty = Math.min(roomH * 0.42, 1100)
  const tanV = Math.tan((FOV_V / 2) * Math.PI / 180)
  const dist = Math.max((len * 0.62) / (tanV * ASPECT), (roomH * 0.7) / tanV)
  const sw = swingDeg * Math.PI / 180
  const dx = n.x * Math.cos(sw) - n.y * Math.sin(sw), dz = n.x * Math.sin(sw) + n.y * Math.cos(sw)
  const eye = { x: tx + dx * dist, y: tz + dz * dist }
  const behind = wallsBehindEye(walls, eye.x, eye.y).filter(x => !keepSubjectWall || x !== subject.id)
  const b = blockers(walls, cabinets, subject, eye, { x: subject.pos_x, y: subject.pos_y }, e, n, new Set(behind))
  return {
    id, label,
    eye: [eye.x, ty + dist * Math.tan(RUN_PITCH_DEG * Math.PI / 180), eye.y],
    target: [tx, ty, tz],
    hiddenWallIds: [...behind, ...b.wallIds],
    hiddenCabinetIds: b.cabIds,
  }
}

/** The whole room from high up, standing opposite the main run (looking along -n) swung 35°.
 *  Near walls are hidden (dollhouse); nothing out on the floor is, since the view is over the top. */
function birdsEyeShot(walls: Wall[], n: Pt, roomH: number): Shot3D {
  const pts = walls.flatMap(w => [{ x: w.pos_x, y: w.pos_y }, wallEnd(w)])
  const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x))
  const minZ = Math.min(...pts.map(p => p.y)), maxZ = Math.max(...pts.map(p => p.y))
  const tx = (minX + maxX) / 2, tz = (minZ + maxZ) / 2, ty = roomH * 0.3
  const r = Math.hypot(maxX - minX, maxZ - minZ, roomH) / 2
  const dist = (r * 1.1) / Math.tan((FOV_V / 2) * Math.PI / 180)
  const sw = 35 * Math.PI / 180, pitch = BIRDSEYE_PITCH_DEG * Math.PI / 180
  const dx = n.x * Math.cos(sw) - n.y * Math.sin(sw), dz = n.x * Math.sin(sw) + n.y * Math.cos(sw)
  const h = dist * Math.cos(pitch)
  const eye = { x: tx + dx * h, y: tz + dz * h }
  return {
    id: 'birdseye', label: "Bird's eye",
    eye: [eye.x, ty + dist * Math.sin(pitch), eye.y],
    target: [tx, ty, tz],
    hiddenWallIds: wallsBehindEye(walls, eye.x, eye.y),
    hiddenCabinetIds: [],
  }
}

/** Automatic shots: a bird's eye of the room, then each cabinet run (most cabinet length first), then each island from both sides. */
export function autoShots(walls: Wall[], cabinets: CabinetInstance[], roomH: number): Shot3D[] {
  const rc = centroid(walls)
  const runs = walls.filter(w => w.wall_type === 'standard' && runLength(w, cabinets) >= 400)
    .sort((a, b) => runLength(b, cabinets) - runLength(a, cabinets))
    .slice(0, MAX_RUN_SHOTS)
  const shots = runs.map((w, i) => shotOf(w, wallInwardNormal(w, rc), walls, cabinets, roomH, i % 2 ? -28 : 28, `run-${w.id}`, w.name, true))
  for (const w of walls.filter(x => x.wall_type === 'island' && cabinets.some(c => c.wall_id === x.id))) {
    const n = wallInwardNormal(w, rc)
    shots.push(shotOf(w, n, walls, cabinets, roomH, 22, `isl-${w.id}-f`, `${w.name} front`, true))
    shots.push(shotOf(w, { x: -n.x, y: -n.y }, walls, cabinets, roomH, 22, `isl-${w.id}-b`, `${w.name} back`, true))
  }
  // No runs yet (e.g. just walls): one view of the longest wall.
  if (!shots.length) {
    const std = walls.filter(w => w.wall_type === 'standard').sort((a, b) => b.length - a.length)[0]
    if (std) shots.push(shotOf(std, wallInwardNormal(std, rc), walls, cabinets, roomH, 28, `run-${std.id}`, std.name, true))
  }
  // Bird's eye of the whole room first, once there's something in it.
  const main = runs[0] ?? walls.find(w => w.wall_type === 'standard')
  if (main && cabinets.length) shots.unshift(birdsEyeShot(walls, wallInwardNormal(main, rc), roomH))
  return shots
}

/** Shots per 3D sheet (Mark, 2026-10-21): 3–4 for a small room (longest side < 2000mm), else 1–2. */
export function shotsPerSheet(walls: Wall[]): number {
  if (!walls.length) return 2
  const pts = walls.flatMap(w => [{ x: w.pos_x, y: w.pos_y }, wallEnd(w)])
  const span = Math.max(Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x)), Math.max(...pts.map(p => p.y)) - Math.min(...pts.map(p => p.y)))
  return span < 2000 ? 4 : 2
}
