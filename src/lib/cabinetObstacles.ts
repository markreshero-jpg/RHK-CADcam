// ── Cabinets on other walls as obstacles ─────────────────────────────────────
// Place / move / stretch only compare a cabinet with the others on its own wall
// (`occupied` = their { t, dx } ranges). A cabinet on another wall can still
// reach into this wall's floor space — a corner unit's depth, and above all an
// L corner's return leg (BCNP, Mark 2026-10-15: "it can't recognise where it
// stops and the cabinet can overlap it"). Like waterfallOccupancy: take each
// such cabinet's real plan outline (shaped footprints included), keep the part
// within the mover's depth off this wall face, and add its along-wall range.

import type { CabinetInstance, Wall, Room, RoomFixture } from './types'
import { fixtureCorners, sitsOnCabinets } from './fixtureGeometry'
import { cabVExtent, cabWallPerp, cabinetCornerPts, wallInwardNormal, type Pt } from './geometry'
import { wallFrame, alongOf, offOf, type WallSide } from './benchtopAnchor'
import { clipToRect } from './cabinetShape/construct'

/**
 * Along-wall ranges of plan outlines that reach into a wall face's floor band
 * (near … depth off the face; near > 0 for something pulled off the wall) at a
 * height overlapping z0 … z1. The common core of the obstacle lists below.
 */
export function bandOccupancy(
  items: { pts: Pt[]; z0: number; z1: number }[],
  wall: Wall, side: WallSide, cx: Pt, z0: number, z1: number, depth: number, near = 0,
): { t: number; dx: number }[] {
  const f = wallFrame(wall, side, cx)
  const out: { t: number; dx: number }[] = []
  for (const it of items) {
    if (!(z0 < it.z1 - 1 && it.z0 < z1 - 1)) continue
    const local = clipToRect(it.pts.map(p => ({ x: alongOf(f, p), y: offOf(f, p) })), -1e7, near + 1, 1e7, depth - 1)
    if (local.length < 3) continue
    const ts = local.map(p => p.x)
    const t0 = Math.min(...ts), t1 = Math.max(...ts)
    if (t1 - t0 < 1 || t1 <= 0 || t0 >= wall.length) continue
    out.push({ t: t0, dx: t1 - t0 })
  }
  return out
}

/** Fixtures that stand in the floor / wall space (z_fixtures) — what cabinets and other fixtures stop against. */
export function solidFixtures(fixtures: RoomFixture[], excludeId?: string): RoomFixture[] {
  // Openings live in the wall; sinks / taps / cooktops sit on cabinets; linked items belong to their cabinet.
  return fixtures.filter(f => f.id !== excludeId && f.category !== 'opening' && !sitsOnCabinets(f) && !f.cabinet_id)
}

/**
 * Appliances as obstacles for a cabinet being placed / moved / stretched on
 * `wall` (Mark 2026-10-18: "appliances aren't being recognised by the
 * cabinets"). Same band + height test as the cabinet obstacles.
 */
export function fixtureOccupancy(
  fixtures: RoomFixture[], wall: Wall, side: WallSide, cx: Pt, room: Room,
  mover: { assembly_class: string; dy: number; dz?: number; bulkhead?: unknown },
): { t: number; dx: number }[] {
  const [mB, mT] = cabVExtent(mover.assembly_class, mover.dy, wall, room, mover.bulkhead)
  const items = solidFixtures(fixtures).map(f => ({ pts: fixtureCorners(f), z0: Number(f.z) || 0, z1: (Number(f.z) || 0) + Number(f.height) }))
  return bandOccupancy(items, wall, side, cx, mB, mT, mover.dz ?? 600)
}

export function crossWallCabinetOccupancy(
  cabinets: CabinetInstance[],
  walls: Wall[],
  wall: Wall,
  side: WallSide,
  cx: Pt,
  room: Room,
  mover: { id?: string; assembly_class: string; dy: number; dz?: number; bulkhead?: unknown },
): { t: number; dx: number }[] {
  const [mB, mT] = cabVExtent(mover.assembly_class, mover.dy, wall, room, mover.bulkhead)
  const depth = mover.dz ?? 600
  const f = wallFrame(wall, side, cx)
  const out: { t: number; dx: number }[] = []
  for (const c of cabinets) {
    if (c.id === mover.id || c.wall_id === wall.id || c.is_kick_assembly) continue
    const cw = walls.find(w => w.id === c.wall_id)
    if (!cw) continue
    // Vertical: wall units clear base units, as cabsBlock.
    const [oB, oT] = cabVExtent(c.assembly_class, c.dy, cw, room, c.bulkhead)
    if (!(mB < oT - 1 && oB < mT - 1)) continue
    const pts = cabinetCornerPts(c, cw, cabWallPerp(c, cw, wallInwardNormal(cw, cx)))
    // Into this face's frame (x = along, y = off), cut to the mover's depth band.
    const local = clipToRect(pts.map(p => ({ x: alongOf(f, p), y: offOf(f, p) })), -1e7, 1, 1e7, depth - 1)
    if (local.length < 3) continue
    const ts = local.map(p => p.x)
    const t0 = Math.min(...ts), t1 = Math.max(...ts)
    if (t1 - t0 < 1 || t1 <= 0 || t0 >= wall.length) continue
    out.push({ t: t0, dx: t1 - t0 })
  }
  return out
}
