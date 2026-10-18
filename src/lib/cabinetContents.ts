// ── Cabinet contents (z_ubo U4) ───────────────────────────────────────────────
// A library cabinet can carry default contents — fixtures that come with it,
// e.g. the oven in a UBO. Placing the cabinet spawns them as ordinary
// room_fixtures linked to the new cabinet (cabinet_id + link_*), so they stay
// their own objects (selectable, own panel, own layer).
//
// A 'zone' item sits in an open face cell: centred across it, its underside on
// the cell bottom (the oven shelf), its front flush with the face plane. The
// fixture keeps that as `link_zone` and re-seats whenever the cabinet resolves
// (cell moves with the cabinet's height / kick / row sizes); between resolves
// the stored link_x / link_z / link_zone.y keep it in place, and the follow
// effect carries it with the cabinet like any linked fixture (incl. height).

import type { CabinetInstance, Room, RoomFixture } from './types'
import type { ResolvedCabinet } from './resolver/types'
import type { CabPlan } from './fixtureLinks'
import { rotationForFront } from './fixtureGeometry'
import { cabBottomZ } from './geometry'

export type ContentAnchor =
  | { kind: 'zone'; row_index: number; col_index: number }
  | { kind: 'point'; link_x: number; link_z: number; link_rot: number; z: number }

/** One default content item on a cabinet definition. */
export interface ContentItem {
  fixture_catalog_id: string
  anchor: ContentAnchor
}

/** A fixture's anchor to an open face cell; y = cell bottom above the cabinet bottom. */
export interface LinkZone {
  row_index: number
  col_index: number
  y: number
}

/** Link fields that seat a fixture `depth` deep in a cabinet's open cell, or null when the cell isn't there. */
export function zoneSeat(
  resolved: Pick<ResolvedCabinet, 'open_zones' | 'face_zones'> | undefined,
  cab: Pick<CabinetInstance, 'dz'>,
  plan: Pick<CabPlan, 'perp' | 'angle'>,
  zone: { row_index: number; col_index: number },
  depth: number,
): { link_x: number; link_z: number; link_rot: number; link_zone: LinkZone } | null {
  const cell = resolved?.open_zones?.find(z => z.row_index === zone.row_index && z.col_index === zone.col_index)
  if (!cell) return null
  // Face plane = the front of the fronts (fixed panels around the opening); a
  // cabinet with no fronts → the carcass front.
  const fronts = (resolved?.face_zones ?? []).filter(z => !z.facet)
  const frontZ = fronts.length ? Math.max(...fronts.map(z => z.Z + z.DZ)) : cab.dz
  return {
    link_x:   round1(cell.X + cell.DX / 2),
    link_z:   round1(frontZ - depth / 2),
    link_rot: round3(norm(rotationForFront(plan.perp) - plan.angle)),
    link_zone: { row_index: zone.row_index, col_index: zone.col_index, y: round1(cell.Y) },
  }
}

/**
 * Re-seat zone-anchored fixtures: link fields from the cabinet's current resolve
 * (when it carries open_zones) and the underside height from the cabinet's
 * bottom + link_zone.y. Returns only fixtures that changed.
 */
export function zoneFollow(
  fixtures: RoomFixture[], plans: CabPlan[], resolved: Map<string, ResolvedCabinet>, room: Room,
): { id: string; patch: Partial<RoomFixture> }[] {
  const byId = new Map(plans.map(p => [p.cab.id, p]))
  const out: { id: string; patch: Partial<RoomFixture> }[] = []
  for (const f of fixtures) {
    const lz = f.link_zone
    const p = lz && f.cabinet_id ? byId.get(f.cabinet_id) : undefined
    if (!lz || !p) continue
    const seat = zoneSeat(resolved.get(p.cab.id), p.cab, p, lz, f.depth)
    const next = seat ?? { link_x: f.link_x, link_z: f.link_z, link_rot: f.link_rot, link_zone: lz }
    const z = round1(cabBottomZ(p.cab, room, p.wall) + next.link_zone.y)
    const patch: Partial<RoomFixture> = {}
    if (Math.abs(next.link_x - f.link_x) > 0.05) patch.link_x = next.link_x
    if (Math.abs(next.link_z - f.link_z) > 0.05) patch.link_z = next.link_z
    if (Math.abs(next.link_rot - f.link_rot) > 0.001) patch.link_rot = next.link_rot
    if (Math.abs(next.link_zone.y - lz.y) > 0.05) patch.link_zone = next.link_zone
    if (Math.abs(z - (Number(f.z) || 0)) > 0.05) patch.z = z
    if (Object.keys(patch).length) out.push({ id: f.id, patch })
  }
  return out
}

/** A linked fixture as a box in its cabinet's own frame (z_ubo U5) — cabinet
 *  X from the left, Y up from the cabinet bottom, Z from the back — for
 *  drawing it inside the cabinet edit modal. `yaw` = turn vs facing out of the
 *  cabinet (deg, 0 = its front to the cabinet front); w / d are its footprint
 *  along X / Z (swapped when it's turned a quarter). */
export interface LocalFixtureBox {
  f: RoomFixture
  x0: number; y0: number; z0: number
  w: number; h: number; d: number
  yaw: number
}

export function fixtureLocalBox(f: RoomFixture, plan: CabPlan, room: Room): LocalFixtureBox {
  const yaw = round3(norm(f.link_rot - norm(rotationForFront(plan.perp) - plan.angle)))
  const quarter = Math.abs(Math.sin(yaw * Math.PI / 180)) > 0.7
  const w = quarter ? f.depth : f.width, d = quarter ? f.width : f.depth
  return {
    f, yaw, w, d, h: f.height,
    x0: f.link_x - w / 2,
    z0: f.link_z - d / 2,
    y0: (Number(f.z) || 0) - cabBottomZ(plan.cab, room, plan.wall),
  }
}

/**
 * Contents to save with a library definition (z_ubo U6) from the fixtures
 * linked to the cabinet: a seated one keeps its open cell; anything else (a
 * sink dropped on a base) keeps its spot — link_* plus its height above the
 * cabinet bottom. Fixtures not from the catalogue can't be re-spawned → skipped.
 */
export function contentsFromFixtures(fixtures: RoomFixture[], cabinetBottomZ: number): ContentItem[] {
  return fixtures.filter(f => !!f.catalog_id).map(f => ({
    fixture_catalog_id: f.catalog_id!,
    anchor: f.link_zone
      ? { kind: 'zone', row_index: f.link_zone.row_index, col_index: f.link_zone.col_index }
      : { kind: 'point', link_x: f.link_x, link_z: f.link_z, link_rot: f.link_rot, z: round1((Number(f.z) || 0) - cabinetBottomZ) },
  }))
}

/** Parse a definition's contents column defensively (jsonb, may be null / legacy). */
export function definitionContents(raw: unknown): ContentItem[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((c): c is ContentItem =>
    !!c && typeof c === 'object' && typeof (c as ContentItem).fixture_catalog_id === 'string'
    && !!(c as ContentItem).anchor && ((c as ContentItem).anchor.kind === 'zone' || (c as ContentItem).anchor.kind === 'point'))
}

function norm(deg: number) { return ((deg % 360) + 360) % 360 }
function round1(v: number) { return Math.round(v * 10) / 10 }
function round3(v: number) { return Math.round(v * 1000) / 1000 }
