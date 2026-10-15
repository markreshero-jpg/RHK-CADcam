import type { Wall } from './types'
import type { Pt } from './geometry'
import { wallEnd, wallDir, dist, MIN_WALL_LEN } from './geometry'

export const JOINT_TOL = 5 // mm — matches the JSNAP used in wallMitrePolygon

export function isEndpointUpdate(u: Partial<Wall>): boolean {
  return 'pos_x' in u || 'pos_y' in u || 'length' in u || 'angle' in u
}

export function computeJointUpdates(
  walls: Wall[], changedId: string, oldWall: Wall, newWall: Wall,
): { id: string; update: Partial<Wall> }[] {
  // Live state for all walls as propagation progresses
  const liveState = new Map<string, Wall>(walls.map(w => [w.id, w]))
  liveState.set(changedId, newWall)

  const allUpdates = new Map<string, Partial<Wall>>()

  // BFS — each entry is a wall whose endpoints just changed
  const queue: { changedId: string; oldWall: Wall; newWall: Wall }[] = [
    { changedId, oldWall, newWall },
  ]
  // Walls already processed as a propagation source (prevents cycles in closed rooms)
  const processed = new Set<string>([changedId])

  while (queue.length > 0) {
    const { changedId: cId, oldWall: oW, newWall: nW } = queue.shift()!

    const moved: { old: Pt; new: Pt }[] = []
    if (dist({ x: oW.pos_x, y: oW.pos_y }, { x: nW.pos_x, y: nW.pos_y }) > 0.01)
      moved.push({ old: { x: oW.pos_x, y: oW.pos_y }, new: { x: nW.pos_x, y: nW.pos_y } })
    if (dist(wallEnd(oW), wallEnd(nW)) > 0.01)
      moved.push({ old: wallEnd(oW), new: wallEnd(nW) })
    if (!moved.length) continue

    for (const other of walls) {
      if (processed.has(other.id)) continue
      const cur = liveState.get(other.id) ?? other
      const curStart: Pt = { x: cur.pos_x, y: cur.pos_y }
      const curEnd: Pt   = wallEnd(cur)

      for (const { old: oldPt, new: newPt } of moved) {
        if (dist(curStart, oldPt) < JOINT_TOL) {
          const updated: Wall = {
            ...cur,
            pos_x: cur.pos_x + (newPt.x - oldPt.x),
            pos_y: cur.pos_y + (newPt.y - oldPt.y),
          }
          liveState.set(other.id, updated)
          allUpdates.set(other.id, { pos_x: updated.pos_x, pos_y: updated.pos_y })
          processed.add(other.id)
          queue.push({ changedId: other.id, oldWall: cur, newWall: updated })
          break
        }
        if (dist(curEnd, oldPt) < JOINT_TOL) {
          const wd = wallDir(cur)
          const newLen = Math.round((newPt.x - cur.pos_x) * wd.x + (newPt.y - cur.pos_y) * wd.y)
          if (newLen >= MIN_WALL_LEN) {
            const updated: Wall = { ...cur, length: newLen }
            liveState.set(other.id, updated)
            allUpdates.set(other.id, { length: newLen })
            processed.add(other.id)
            queue.push({ changedId: other.id, oldWall: cur, newWall: updated })
          }
          break
        }
      }
    }
  }

  return Array.from(allUpdates.entries()).map(([id, update]) => ({ id, update }))
}

// Thickest non-island wall joined to `wall` at its start (end='start') or end
// (end='end'). Annotations placed just past a wall end (the perpendicular depth
// dims) push out by this much so they clear the return wall's body instead of
// landing inside it — the fixed screen-px gap alone is only a few mm when zoomed in.
export function returnWallThickness(wall: Wall, walls: Wall[], end: 'start' | 'end'): number {
  const p: Pt = end === 'start' ? { x: wall.pos_x, y: wall.pos_y } : wallEnd(wall)
  let t = 0
  for (const o of walls) {
    if (o.id === wall.id || o.wall_type === 'island') continue
    if (dist({ x: o.pos_x, y: o.pos_y }, p) < JOINT_TOL || dist(wallEnd(o), p) < JOINT_TOL)
      t = Math.max(t, o.thickness)
  }
  return t
}

// ── Moving walls off their joints ────────────────────────────────────────────
// A drag of walls `movedIds` by (dx, dy) pulls their endpoints away from any
// other wall joined there. These helpers find those walls and work out how
// each one follows when the user picks "stretch connected walls".

/** A wall outside the drag that shares an endpoint with a dragged wall. */
export interface DetachedNeighbour { id: string; startJoined: boolean; endJoined: boolean }

const endpoints = (w: Wall): Pt[] => [{ x: w.pos_x, y: w.pos_y }, wallEnd(w)]

/** Walls (not in `movedIds`) joined to a dragged wall, with which of their ends are joined. */
export function detachedNeighbours(walls: Wall[], movedIds: string[]): DetachedNeighbour[] {
  const moved = new Set(movedIds)
  const pts = walls.filter(w => moved.has(w.id)).flatMap(endpoints)
  const near = (p: Pt) => pts.some(q => dist(p, q) < JOINT_TOL)
  const out: DetachedNeighbour[] = []
  for (const w of walls) {
    if (moved.has(w.id)) continue
    const [s, e] = endpoints(w)
    const startJoined = near(s), endJoined = near(e)
    if (startJoined || endJoined) out.push({ id: w.id, startJoined, endJoined })
  }
  return out
}

/** Every wall joined to `ids` through any chain of shared endpoints (includes `ids`). */
export function connectedWallIds(walls: Wall[], ids: string[]): string[] {
  const set = new Set(ids)
  for (let grew = true; grew;) {
    grew = false
    for (const n of detachedNeighbours(walls, [...set])) { set.add(n.id); grew = true }
  }
  return [...set]
}

/**
 * How a joined neighbour follows a drag of (dx, dy): the joined end moves with
 * the drag, the free end stays put, so the wall lengthens / shortens and turns
 * about its free end. Joined at both ends → it just moves along. `fn` maps any
 * plan point riding on the wall (cabinets, tops, fixtures) to its new place and
 * `turn` is the change in angle (deg) for their rotation. Null when the wall
 * would shrink below MIN_WALL_LEN.
 */
export function stretchNeighbour(w: Wall, n: DetachedNeighbour, dx: number, dy: number):
  { update: Partial<Wall>; fn: (p: Pt) => Pt; turn: number } | null {
  if (n.startJoined && n.endJoined) {
    return { update: { pos_x: w.pos_x + dx, pos_y: w.pos_y + dy }, fn: p => ({ x: p.x + dx, y: p.y + dy }), turn: 0 }
  }
  const [s0, e0] = endpoints(w)
  const s = n.startJoined ? { x: s0.x + dx, y: s0.y + dy } : s0
  const e = n.endJoined ? { x: e0.x + dx, y: e0.y + dy } : e0
  const length = dist(s, e)
  if (length < MIN_WALL_LEN) return null
  const angle = Math.atan2(e.y - s.y, e.x - s.x) * 180 / Math.PI
  let turn = angle - w.angle
  turn = ((turn % 360) + 540) % 360 - 180
  const pivot = n.startJoined ? e0 : s0            // the end that stays put
  const r = turn * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r)
  const fn = (p: Pt): Pt => {
    const vx = p.x - pivot.x, vy = p.y - pivot.y
    return { x: pivot.x + vx * c - vy * sn, y: pivot.y + vx * sn + vy * c }
  }
  return { update: { pos_x: s.x, pos_y: s.y, length, angle }, fn, turn }
}
