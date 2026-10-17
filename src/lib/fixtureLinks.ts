// ── Fixture ↔ cabinet links (z_fixtures P4) ───────────────────────────────────
// A fixture dropped over a cabinet remembers where it sits on that cabinet: its
// footprint centre in the cabinet's own frame (link_x along the width from the
// left, link_z into the room from the back) and its turn relative to the
// cabinet (link_rot). Nothing is centred — it stays exactly where it was put —
// but when the cabinet moves, slides or turns, the fixture is re-placed from
// the link so it goes with it.
//
// Floor-mount items (dishwashers, fridges) never link: they stand in gaps
// between cabinets. Instead they — and any unlinked non-benchtop item — get an
// overlap warning when they clash with a cabinet (fixtureClashes).

import type { CabinetInstance, Wall, Room, RoomFixture, FixtureMount } from './types'
import { cabWallPerp, cabinetPlanFrame, cabinetCornerPts, wallInwardNormal, type Pt, type RoomRef } from './geometry'
import { fixtureCenter, fixtureCorners, backLeftForCenter, pointInPolygon, type FixtureFootprint } from './fixtureGeometry'
import { cabBottomZ } from './elevationSnap'

const DEG = Math.PI / 180

/** A cabinet's plan frame: origin + right-handed axes (x along the width, perp into the room). */
export interface CabPlan {
  cab:   CabinetInstance
  wall:  Wall
  o:     Pt
  x:     Pt
  perp:  Pt
  /** Footprint outline in plan. */
  pts:   Pt[]
  /** Angle (deg) of the frame's +x. */
  angle: number
}

export function cabinetPlans(cabinets: CabinetInstance[], walls: Wall[], ref: RoomRef): CabPlan[] {
  const out: CabPlan[] = []
  for (const cab of cabinets) {
    const wall = walls.find(w => w.id === cab.wall_id)
    if (!wall) continue
    const perp = cabWallPerp(cab, wall, wallInwardNormal(wall, ref))
    const { o, x } = cabinetPlanFrame(cab, wall, perp)
    out.push({ cab, wall, o, x, perp, pts: cabinetCornerPts(cab, wall, perp), angle: norm(Math.atan2(x.y, x.x) / DEG) })
  }
  return out
}

export interface FixtureLink {
  cabinet_id: string
  link_x:     number
  link_z:     number
  link_rot:   number
}

const isWallClass = (c: CabinetInstance) => c.assembly_class === 'wall' || c.assembly_class === 'wall_corner'

/**
 * The cabinet a fixture sits on, as a link from its current pose — or null.
 * Wall-mount items link to wall cabinets; benchtop / under-bench items to base
 * and tall cabinets (base and wall cabinets overlap in plan, so the class
 * decides). Floor items never link. Kick assemblies are skipped.
 */
export function linkFor(f: FixtureFootprint & { mount: FixtureMount }, plans: CabPlan[]): FixtureLink | null {
  if (f.mount === 'floor') return null
  const c = fixtureCenter(f)
  const wantWall = f.mount === 'wall'
  const hit = plans.find(p => !p.cab.is_kick_assembly && isWallClass(p.cab) === wantWall && pointInPolygon(p.pts, c))
  return hit ? linkOnCabinet(f, hit) : null
}

/** The link that keeps a fixture exactly where it is on `p`. */
export function linkOnCabinet(f: FixtureFootprint, p: CabPlan): FixtureLink {
  const c = fixtureCenter(f)
  const dx = c.x - p.o.x, dy = c.y - p.o.y
  return {
    cabinet_id: p.cab.id,
    link_x:   round1(dx * p.x.x + dy * p.x.y),
    link_z:   round1(dx * p.perp.x + dy * p.perp.y),
    link_rot: round3(norm(f.rotation - p.angle)),
  }
}

/** Where a linked fixture belongs on its cabinet's current frame. */
export function linkedPose(
  link: Pick<FixtureLink, 'link_x' | 'link_z' | 'link_rot'>, p: CabPlan, width: number, depth: number,
): { x: number; y: number; rotation: number; wall_id: string } {
  const c = {
    x: p.o.x + link.link_x * p.x.x + link.link_z * p.perp.x,
    y: p.o.y + link.link_x * p.x.y + link.link_z * p.perp.y,
  }
  const rotation = round3(norm(p.angle + link.link_rot))
  const bl = backLeftForCenter(c, rotation, width, depth)
  return { x: round1(bl.x), y: round1(bl.y), rotation, wall_id: p.wall.id }
}

/**
 * Pose changes for fixtures linked to the given cabinets (after those cabinets
 * changed). Only fixtures that actually moved are returned.
 */
export function followLinks(
  fixtures: RoomFixture[], plans: CabPlan[],
): { id: string; patch: Pick<RoomFixture, 'x' | 'y' | 'rotation' | 'wall_id'> }[] {
  const byId = new Map(plans.map(p => [p.cab.id, p]))
  const out: { id: string; patch: Pick<RoomFixture, 'x' | 'y' | 'rotation' | 'wall_id'> }[] = []
  for (const f of fixtures) {
    const p = f.cabinet_id ? byId.get(f.cabinet_id) : undefined
    if (!p) continue
    const pose = linkedPose(f, p, f.width, f.depth)
    const turn = norm(pose.rotation - f.rotation)
    if (Math.abs(pose.x - f.x) > 0.05 || Math.abs(pose.y - f.y) > 0.05
      || Math.min(turn, 360 - turn) > 0.001 || pose.wall_id !== f.wall_id) {
      out.push({ id: f.id, patch: pose })
    }
  }
  return out
}

/**
 * Cabinets each fixture overlaps (plan footprint and height), by fixture id.
 * Benchtop-mount items (sinks, cooktops, taps) sit on cabinets by design and
 * are never checked; a fixture's own linked cabinet is ignored. Touching
 * faces don't count (1 mm tolerance).
 */
export function fixtureClashes(fixtures: RoomFixture[], plans: CabPlan[], room: Room): Map<string, CabinetInstance[]> {
  const out = new Map<string, CabinetInstance[]>()
  for (const f of fixtures) {
    if (f.mount === 'benchtop') continue
    const poly = shrunkCorners(f, 1)
    const z0 = Number(f.z) || 0, z1 = z0 + Number(f.height)
    const hits: CabinetInstance[] = []
    for (const p of plans) {
      if (p.cab.id === f.cabinet_id) continue
      const b0 = cabBottomZ(p.cab, room, p.wall), b1 = b0 + p.cab.dy
      if (Math.min(z1, b1) - Math.max(z0, b0) <= 1) continue
      if (polygonsOverlap(poly, p.pts)) hits.push(p.cab)
    }
    if (hits.length) out.set(f.id, hits)
  }
  return out
}

function shrunkCorners(f: FixtureFootprint, by: number): Pt[] {
  const c = fixtureCenter(f)
  const w = Math.max(0, f.width - 2 * by), d = Math.max(0, f.depth - 2 * by)
  const bl = backLeftForCenter(c, f.rotation, w, d)
  return fixtureCorners({ x: bl.x, y: bl.y, rotation: f.rotation, width: w, depth: d })
}

/** Do two simple polygons overlap (edges cross, or one holds a vertex of the other)? */
export function polygonsOverlap(a: Pt[], b: Pt[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i], a2 = a[(i + 1) % a.length]
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a1, a2, b[j], b[(j + 1) % b.length])) return true
    }
  }
  return a.some(p => pointInPolygon(b, p)) || b.some(p => pointInPolygon(a, p))
}

function segmentsCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

function norm(deg: number) { return ((deg % 360) + 360) % 360 }
function round1(v: number) { return Math.round(v * 10) / 10 }
function round3(v: number) { return Math.round(v * 1000) / 1000 }
