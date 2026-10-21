// ── Fixture lock groups + align (z_fixtures "Multi-select, align, lock") ──────
// Fixtures shift-picked together can be lined up with the one right-clicked
// (the anchor stays put) or locked into a rigid group: move, turn or re-seat any
// one and the rest keep their places relative to it (a basin and its wall
// spout). No reference point is stored — whichever member moves carries the
// others by the same turn + shift (about its own centre) and the same rise.

import type { RoomFixture } from './types'
import { fixtureAxes, fixtureCenter, fixtureCorners, backLeftForCenter } from './fixtureGeometry'
import type { Pt } from './geometry'

const DEG = Math.PI / 180

type Pose = Pick<RoomFixture, 'x' | 'y' | 'rotation' | 'width' | 'depth' | 'z' | 'wall_id'>
export type GroupPatch = Pick<RoomFixture, 'x' | 'y' | 'rotation' | 'z' | 'wall_id'>

/**
 * Where `mate` goes when its group-mate moved from `before` to `after`: the same
 * turn about the mover's centre, then its shift, and the same rise. Null when
 * the mover didn't actually move. Wall: a mate on the mover's old wall goes to
 * its new one; a turn otherwise frees it; else it keeps its wall.
 */
export function rigidFollow(before: Pose, after: Pose, mate: Pose): GroupPatch | null {
  const c0 = fixtureCenter(before), c1 = fixtureCenter(after)
  const turn = norm(after.rotation - before.rotation)
  const dz = (Number(after.z) || 0) - (Number(before.z) || 0)
  const turned = Math.min(turn, 360 - turn) > 0.001
  if (!turned && Math.hypot(c1.x - c0.x, c1.y - c0.y) < 0.05 && Math.abs(dz) < 0.05) return null
  const mc = fixtureCenter(mate)
  const r = turn * DEG, cos = Math.cos(r), sin = Math.sin(r)
  const dx = mc.x - c0.x, dy = mc.y - c0.y
  const nc = { x: c1.x + dx * cos - dy * sin, y: c1.y + dx * sin + dy * cos }
  const rotation = round3(norm(mate.rotation + turn))
  const bl = backLeftForCenter(nc, rotation, mate.width, mate.depth)
  const wall_id = mate.wall_id && mate.wall_id === before.wall_id ? after.wall_id
    : turned ? null : mate.wall_id
  return { x: round1(bl.x), y: round1(bl.y), rotation, z: round1((Number(mate.z) || 0) + dz), wall_id }
}

/**
 * Mates carried along by pose changes. `changes` = id → the new pose fields of
 * fixtures that moved (merged over their current row). Mates that moved
 * themselves, or that `skip` rejects, stay put; the first mover wins.
 */
export function groupFollow(
  fixtures: RoomFixture[], changes: Map<string, Partial<RoomFixture>>, skip?: (mate: RoomFixture) => boolean,
): Map<string, GroupPatch> {
  const out = new Map<string, GroupPatch>()
  for (const [id, patch] of changes) {
    const lead = fixtures.find(f => f.id === id)
    if (!lead?.lock_group) continue
    const after = { ...lead, ...patch }
    for (const m of fixtures) {
      if (m.id === id || m.lock_group !== lead.lock_group || changes.has(m.id) || out.has(m.id)) continue
      if (skip?.(m)) continue
      const p = rigidFollow(lead, after, m)
      if (p) out.set(m.id, p)
    }
  }
  return out
}

/** The ids locked with `id` (itself included); just [id] when it isn't locked. */
export function lockMates(fixtures: RoomFixture[], id: string): string[] {
  const g = fixtures.find(f => f.id === id)?.lock_group
  return g ? fixtures.filter(f => f.lock_group === g).map(f => f.id) : [id]
}

export type AlignMode = 'centre_along' | 'centre_depth' | 'left' | 'right' | 'height'

/**
 * Line `others` up with `anchor`, in the anchor's own frame: along = its width
 * (left / right as seen from its front, as in elevation), depth = front-to-back,
 * height = same underside. Only items that move are returned.
 */
export function alignPatches(anchor: RoomFixture, others: RoomFixture[], mode: AlignMode): Map<string, Partial<RoomFixture>> {
  const out = new Map<string, Partial<RoomFixture>>()
  const { a, n } = fixtureAxes(anchor.rotation)
  const dot = (p: Pt, v: Pt) => p.x * v.x + p.y * v.y
  const span = (f: RoomFixture, v: Pt) => {
    const t = fixtureCorners(f).map(p => dot(p, v))
    return { lo: Math.min(...t), hi: Math.max(...t) }
  }
  for (const f of others) {
    if (f.id === anchor.id) continue
    if (mode === 'height') {
      if (Math.abs((Number(f.z) || 0) - (Number(anchor.z) || 0)) > 0.05) out.set(f.id, { z: Number(anchor.z) || 0 })
      continue
    }
    const v = mode === 'centre_depth' ? n : a
    const A = span(anchor, v), F = span(f, v)
    const shift = mode === 'left' ? A.lo - F.lo
      : mode === 'right' ? A.hi - F.hi
      : (A.lo + A.hi) / 2 - (F.lo + F.hi) / 2
    if (Math.abs(shift) < 0.05) continue
    out.set(f.id, { x: round1(f.x + v.x * shift), y: round1(f.y + v.y * shift) })
  }
  return out
}

function norm(d: number) { return ((d % 360) + 360) % 360 }
function round1(v: number) { return Math.round(v * 10) / 10 }
function round3(v: number) { return Math.round(v * 1000) / 1000 }
