// ============================================================
// ⚠ WIP — TO BE FINISHED OR DELETED (paused 2026-05-28)
// Companion tests for the plan-view wall outline editing. See
// the top of wallPolyline.ts for the full status note.
// ============================================================
//
// wallPolyline.ts — Test Suite
// Run: npx ts-node src/lib/wallPolyline.test.ts
// ============================================================

import { wallsToPolyline, polylineToWalls, MM_TO_PX } from './wallPolyline'
import type { Wall } from './types'

let passed = 0
let failed = 0

function ok(cond: boolean, label: string, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else      { failed++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`) }
}

function near(a: number, b: number, tol = 1): boolean {
  return Math.abs(a - b) <= tol
}

function group(name: string) {
  console.log(`\n${name}`)
}

// ── helpers ────────────────────────────────────────────────────

function mkWall(id: string, pos_x: number, pos_y: number, length: number, angle: number, extra: Partial<Wall> = {}): Wall {
  return {
    id,
    room_id: 'room-1',
    name: id.toUpperCase(),
    sort_order: parseInt(id.replace(/\D/g, ''), 10) || 0,
    pos_x, pos_y, length, angle,
    height: 2400,
    soffit_height: null,
    thickness: 90,
    wall_type: 'standard',
    created_at: '2026-01-01T00:00:00Z',
    ...extra,
  }
}

// A 4000 × 3000 mm rectangular room, walls labelled clockwise from top-left.
function rectRoom(): Wall[] {
  return [
    mkWall('w1', 0,    0,    4000, 0),    // top, left→right
    mkWall('w2', 4000, 0,    3000, 90),   // right, top→bottom
    mkWall('w3', 4000, 3000, 4000, 180),  // bottom, right→left
    mkWall('w4', 0,    3000, 3000, -90),  // left, bottom→top
  ]
}

// ── tests ──────────────────────────────────────────────────────

group('wallsToPolyline')
{
  const walls = rectRoom()
  const segs = wallsToPolyline(walls)
  ok(segs.length === 4, 'produces one line segment per wall')
  ok(segs.every(s => s.type === 'line'), 'all segments are lines')
  ok(segs[0].p0.x === 0 && segs[0].p0.y === 0, 'first wall p0 at room origin (in px)')
  ok(segs[0].p1.x === 4000 * MM_TO_PX, 'first wall p1 at length * MM_TO_PX',
     `got p1=(${segs[0].p1.x},${segs[0].p1.y})`)
  ok(segs[1].p0.x === segs[0].p1.x && segs[1].p0.y === segs[0].p1.y,
     'wall 2 starts where wall 1 ends (rect is closed)')
}

group('polylineToWalls — round-trip identity (no edits)')
{
  const walls = rectRoom()
  const segs = wallsToPolyline(walls)
  const diff = polylineToWalls(segs, walls)
  ok(diff.toUpdate.length === 4, 'all 4 walls matched',
     `got toUpdate=${diff.toUpdate.length}, toInsert=${diff.toInsert.length}, toDelete=${diff.toDelete.length}`)
  ok(diff.toInsert.length === 0, 'no inserts')
  ok(diff.toDelete.length === 0, 'no deletes')
  for (const u of diff.toUpdate) {
    const orig = walls.find(w => w.id === u.id)!
    const lenOk = near(u.length, orig.length)
    ok(lenOk, `wall ${u.id} length preserved (${u.length} vs ${orig.length})`)
  }
  ok(diff.segmentToWallId.every(id => id !== null), 'every segment mapped to a wall id')
}

group('polylineToWalls — drag one vertex')
{
  // Move the top-right corner (shared by w1 and w2) 200mm to the right.
  // w1: (0,0)→(4000,0) becomes (0,0)→(4200,0)
  // w2: (4000,0)→(4000,3000) becomes (4200,0)→(4000,3000)
  const walls = rectRoom()
  const segs = wallsToPolyline(walls)
  // Mutate segs to simulate the drag in editor coords:
  segs[0].p1 = { x: 4200 * MM_TO_PX, y: 0 }
  segs[1].p0 = { x: 4200 * MM_TO_PX, y: 0 }
  const diff = polylineToWalls(segs, walls)
  ok(diff.toUpdate.length === 4, 'all 4 walls still matched (identity preserved)',
     `got toUpdate=${diff.toUpdate.length}, toInsert=${diff.toInsert.length}, toDelete=${diff.toDelete.length}`)
  ok(diff.toInsert.length === 0, 'no inserts')
  ok(diff.toDelete.length === 0, 'no deletes')
  const w1 = diff.toUpdate.find(u => u.id === 'w1')!
  ok(near(w1.length, 4200), `w1 length grew to 4200 (got ${w1.length})`)
  const w2 = diff.toUpdate.find(u => u.id === 'w2')!
  ok(near(w2.pos_x, 4200), `w2 pos_x shifted to 4200 (got ${w2.pos_x})`)
}

group('polylineToWalls — insert a new wall (4th wall added to an open shape)')
{
  // Start with 3 walls (no left side), then "add" a 4th in the new polyline.
  const open3 = [
    mkWall('w1', 0,    0,    4000, 0),
    mkWall('w2', 4000, 0,    3000, 90),
    mkWall('w3', 4000, 3000, 4000, 180),
  ]
  const segs = wallsToPolyline(open3)
  // Append a "new" 4th wall (the missing left side).
  segs.push({ type: 'line', p0: { x: 0, y: 3000 * MM_TO_PX }, p1: { x: 0, y: 0 } })
  const diff = polylineToWalls(segs, open3)
  ok(diff.toUpdate.length === 3, 'old 3 walls matched')
  ok(diff.toInsert.length === 1, 'one new wall inserted')
  ok(diff.toDelete.length === 0, 'no deletes')
  ok(near(diff.toInsert[0].length, 3000), `new wall length ~3000 (got ${diff.toInsert[0].length})`)
  ok(diff.segmentToWallId[3] === null, 'inserted segment maps to null (id assigned post-insert)')
}

group('polylineToWalls — delete a wall (remove 4th from rect)')
{
  const walls = rectRoom()
  const segs = wallsToPolyline(walls)
  segs.pop() // remove w4
  const diff = polylineToWalls(segs, walls)
  ok(diff.toUpdate.length === 3, 'remaining 3 walls matched')
  ok(diff.toInsert.length === 0, 'no inserts')
  ok(diff.toDelete.length === 1 && diff.toDelete[0] === 'w4', 'w4 marked for deletion',
     `got toDelete=${JSON.stringify(diff.toDelete)}`)
}

group('polylineToWalls — split a wall (add midpoint)')
{
  // Add a midpoint to w1: one segment (0,0)→(4000,0) becomes two:
  //   (0,0)→(2000,0) and (2000,0)→(4000,0).
  // Old w1's endpoints best match the first half OR the second half —
  // whichever scores lowest. The other half becomes a new insert.
  const walls = rectRoom()
  const segs = wallsToPolyline(walls)
  // Replace segs[0] with two halves.
  segs.splice(0, 1,
    { type: 'line', p0: { x: 0,                 y: 0 }, p1: { x: 2000 * MM_TO_PX, y: 0 } },
    { type: 'line', p0: { x: 2000 * MM_TO_PX,   y: 0 }, p1: { x: 4000 * MM_TO_PX, y: 0 } },
  )
  const diff = polylineToWalls(segs, walls)
  ok(diff.toUpdate.length === 4, 'old 4 walls (w1,w2,w3,w4) all still matched',
     `got toUpdate=${diff.toUpdate.length}, toInsert=${diff.toInsert.length}`)
  ok(diff.toInsert.length === 1, 'split produced one insert')
  ok(diff.toDelete.length === 0, 'no deletes')
}

group('polylineToWalls — flipped wall direction still matches')
{
  // Editor returns w1 with p0/p1 swapped — should still match w1.
  const walls = rectRoom()
  const segs = wallsToPolyline(walls)
  const orig = segs[0]
  segs[0] = { type: 'line', p0: orig.p1, p1: orig.p0 }
  const diff = polylineToWalls(segs, walls)
  ok(diff.toUpdate.length === 4, 'flipped wall still matched')
  ok(diff.toInsert.length === 0, 'no inserts')
  const w1 = diff.toUpdate.find(u => u.id === 'w1')!
  // After un-flip the geometry should be ~identical to original.
  ok(near(w1.pos_x, 0) && near(w1.pos_y, 0), `w1 pos preserved (got ${w1.pos_x},${w1.pos_y})`)
}

group('polylineToWalls — far-away new segment is inserted, not matched')
{
  // Take the rect, then add a wall far across the room.
  const walls = rectRoom()
  const segs = wallsToPolyline(walls)
  segs.push({
    type: 'line',
    p0: { x: 10000 * MM_TO_PX, y: 10000 * MM_TO_PX },
    p1: { x: 12000 * MM_TO_PX, y: 10000 * MM_TO_PX },
  })
  const diff = polylineToWalls(segs, walls)
  ok(diff.toUpdate.length === 4, 'original 4 walls matched (close)')
  ok(diff.toInsert.length === 1, 'far segment inserted (beyond threshold)')
  ok(diff.toDelete.length === 0, 'no deletes')
}

group('polylineToWalls — non-line segments ignored')
{
  const walls = rectRoom()
  const segs = wallsToPolyline(walls) as any[]
  segs.push({
    type: 'curve',
    p0: { x: 100, y: 100 }, p1: { x: 200, y: 200 },
    cp1: { x: 150, y: 80 }, cp2: { x: 180, y: 220 },
  })
  const diff = polylineToWalls(segs, walls)
  ok(diff.toInsert.length === 0, 'curve segment not turned into a wall')
  ok(diff.toUpdate.length === 4, 'real wall segments still matched')
}

// ── summary ────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
