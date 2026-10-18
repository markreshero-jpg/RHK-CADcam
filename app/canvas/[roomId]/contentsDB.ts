// Cabinet contents (z_ubo U4): spawn a definition's default fixtures linked to
// a freshly placed cabinet. Runs after the cabinet's first resolve — zone items
// need its open cells (ResolvedCabinet.open_zones).

import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance, FixtureCatalogItem, Room, RoomFixture } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { definitionContents, facingOutRot, zoneSeat } from '@/src/lib/cabinetContents'
import { linkedPose, type CabPlan } from '@/src/lib/fixtureLinks'
import { defaultFixtureZ, fixtureCenter } from '@/src/lib/fixtureGeometry'
import { cabBottomZ, type Pt } from '@/src/lib/geometry'
import { bodyFromCatalog } from './useFixtureInteraction'

export async function dbSpawnDefinitionContents(
  cabinet: CabinetInstance, resolved: ResolvedCabinet, plan: CabPlan, room: Room,
  /** Top height of the benchtop under a plan point, or null — benchtop-mount items sit on it. */
  benchTopAt?: (p: Pt) => number | null,
): Promise<RoomFixture[]> {
  if (!cabinet.cabinet_definition_id) return []
  const { data: def } = await supabase.from('cabinet_definitions').select('contents').eq('id', cabinet.cabinet_definition_id).maybeSingle()
  const items = definitionContents((def as { contents?: unknown } | null)?.contents)
  if (!items.length) return []

  const ids = [...new Set(items.map(i => i.fixture_catalog_id))]
  const { data: cat, error: catErr } = await supabase.from('fixture_catalog').select('*').in('id', ids)
  if (catErr) { console.error('dbSpawnDefinitionContents catalog', catErr); return [] }
  const byId = new Map(((cat ?? []) as FixtureCatalogItem[]).map(c => [c.id, c]))
  const bottom = cabBottomZ(cabinet, room, plan.wall)

  const rows = items.flatMap(item => {
    const c = byId.get(item.fixture_catalog_id)
    if (!c) { console.warn('cabinet contents: catalog item missing', item.fixture_catalog_id); return [] }
    const a = item.anchor
    const link = a.kind === 'zone'
      ? zoneSeat(resolved, cabinet, plan, a, Number(c.depth))
      : { link_x: a.link_x, link_z: a.link_z, link_rot: a.yaw != null ? facingOutRot(plan, a.yaw) : (a.link_rot ?? facingOutRot(plan)), link_zone: null }
    if (!link) { console.warn('cabinet contents: open cell missing', a); return [] }
    const pose = linkedPose(link, plan, Number(c.width), Number(c.depth))
    // Underside: seated → the cell bottom; benchtop items (sink, tap) → on the
    // benchtop under them less their drop (no top yet → the default bench
    // height), like dropping one by hand; else the stored height.
    const z = link.link_zone ? bottom + link.link_zone.y
      : c.mount === 'benchtop'
        ? (benchTopAt?.(fixtureCenter({ ...pose, width: Number(c.width), depth: Number(c.depth) })) ?? defaultFixtureZ('benchtop', c.mount_height)) - (Number(c.bench_drop) || 0)
        : bottom + (a.kind === 'point' ? a.z : 0)
    return [{
      room_id: room.id, catalog_id: c.id, ...bodyFromCatalog(c),
      x: pose.x, y: pose.y, rotation: pose.rotation, wall_id: pose.wall_id, z: Math.round(z * 10) / 10,
      cabinet_id: cabinet.id, link_x: link.link_x, link_z: link.link_z, link_rot: link.link_rot,
      link_zone: link.link_zone,
    }]
  })
  if (!rows.length) return []
  const { data, error } = await supabase.from('room_fixtures').insert(rows).select('*')
  if (error) { console.error('dbSpawnDefinitionContents insert', error); return [] }
  return (data ?? []) as RoomFixture[]
}
