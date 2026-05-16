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
