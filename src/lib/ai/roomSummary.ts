// Compact room summary for the AI helper (z_ai_helper "Context: the compact
// summary"): one line per wall / cabinet / fixture, ~2–4K tokens for a full
// kitchen. Colours and handles come from the saved (resolved) parts, so they are
// what the drawings show. Never parts, drilling or geometry — the AI asks for
// detail when it needs it. Output order is deterministic so it prompt-caches.

import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance, Wall, Room, RoomFixture, SplashbackInstance } from '@/src/lib/types'
import { sbBounds } from '@/src/lib/splashbackGeometry'
import { cabBottomZ, cabWallSide, wallCabTop } from '@/src/lib/geometry'

export interface RoomSummaryData {
  room: Room
  walls: Wall[]
  cabinets: CabinetInstance[]
  fixtures: Pick<RoomFixture, 'id' | 'label' | 'display_name' | 'name' | 'cabinet_id'>[]
  defNames: Map<string, string>
  /** face_zones rows: cabinet_instance_id, face_type, material_id, handle_hardware_id */
  fronts: { cabinet_instance_id: string; face_type: string; material_id: string | null; handle_hardware_id: string | null }[]
  /** case_parts rows: cabinet_instance_id, material_id */
  carcass: { cabinet_instance_id: string; material_id: string | null }[]
  materialNames: Map<string, string>
  handleNames: Map<string, string>
  /** Splashbacks (z_splashback) + the names of the schedules set on them. */
  splashbacks?: Pick<SplashbackInstance, 'id' | 'label' | 'wall_id' | 'wall_side' | 'segments' | 'splashback_schedule_id'>[]
  sbScheduleNames?: Map<string, string>
}

/** Offset of a cabinet along its wall (mm from the wall's start), as getState() reports it. */
export function wallOffset(c: Pick<CabinetInstance, 'pos_x' | 'pos_y'>, w: Pick<Wall, 'pos_x' | 'pos_y' | 'angle'>): number {
  const rad = (w.angle * Math.PI) / 180
  return Math.round((c.pos_x - w.pos_x) * Math.cos(rad) + (c.pos_y - w.pos_y) * Math.sin(rad))
}

const FRONT_WORD: Record<string, [string, string]> = {
  door: ['door', 'doors'], drawer_face: ['drawer', 'drawers'],
  false_panel: ['false front', 'false fronts'], open: ['open', 'open'],
}

const byLabel = (a: { label: string | null }, b: { label: string | null }) =>
  (a.label ?? '').localeCompare(b.label ?? '', undefined, { numeric: true })

export function formatRoomSummary(d: RoomSummaryData): string {
  const wallById = new Map(d.walls.map(w => [w.id, w]))
  const mat = (id: string | null) => (id && d.materialNames.get(id)) || null
  const top = wallCabTop(null, d.room)
  const lines: string[] = [
    `Room: ${d.room.name}`,
    `Ceiling ${d.room.room_dy ?? 'not set'} · overhead top line ${Math.round(top)} from the floor${d.room.soffit_height != null ? ` (soffit ${d.room.soffit_height} down from the ceiling)` : d.room.wall_cabinet_top != null ? '' : ' (default)'} — overheads hang from it.`,
    '', 'Walls (name | length | angle | type | start → end, plan mm: +x right, +y down):']
  for (const w of [...d.walls].sort((a, b) => a.sort_order - b.sort_order)) {
    const a = (w.angle * Math.PI) / 180, r1 = (v: number) => Math.round(v * 10) / 10
    lines.push(`${w.name} | ${Math.round(w.length)} | ${Math.round(w.angle)}° | ${w.wall_type}${w.height != null ? ` | ${Math.round(Number(w.height))} high` : ''} | ${r1(w.pos_x)},${r1(w.pos_y)} → ${r1(w.pos_x + w.length * Math.cos(a))},${r1(w.pos_y + w.length * Math.sin(a))}`)
  }

  lines.push('', 'Cabinets (label | code | class | wall [back] @ offset | W×H×D | underside off floor | fronts | carcass):')
  lines.push(`Offset = mm along the wall from its start to the cabinet's low end. "back" = on the wall's back face (an island's far side), facing the other way: there your left is the HIGH-offset end.`)
  for (const c of [...d.cabinets].sort(byLabel)) {
    const w = c.wall_id ? wallById.get(c.wall_id) : undefined
    const where = w ? `${w.name}${cabWallSide(c, w) === 'back' ? ' back' : ''} @ ${wallOffset(c, w)}` : 'no wall'
    const code = (c.cabinet_definition_id && d.defNames.get(c.cabinet_definition_id)) || (c.is_kick_assembly ? 'KICK' : '?')

    const fronts = d.fronts.filter(f => f.cabinet_instance_id === c.id)
    const counts = new Map<string, number>()
    for (const f of fronts) counts.set(f.face_type, (counts.get(f.face_type) ?? 0) + 1)
    const frontWords = [...counts].map(([t, n]) => { const [one, many] = FRONT_WORD[t] ?? [t, t]; return `${n} ${n === 1 ? one : many}` })
    const frontMats = [...new Set(fronts.filter(f => f.face_type !== 'open').map(f => mat(f.material_id)).filter(Boolean))]
    const handles = [...new Set(fronts.map(f => f.handle_hardware_id && d.handleNames.get(f.handle_hardware_id)).filter(Boolean))]
    const frontText = fronts.length
      ? [frontWords.join(' + '), frontMats.join('/'), handles.length ? `handle ${handles.join('/')}` : ''].filter(Boolean).join(', ')
      : '-'

    // Carcass board = the most common material across its case parts.
    const tally = new Map<string, number>()
    for (const p of d.carcass) if (p.cabinet_instance_id === c.id && p.material_id) tally.set(p.material_id, (tally.get(p.material_id) ?? 0) + 1)
    const carcassId = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    lines.push([
      c.label ?? '?', code, c.assembly_class, where,
      `${Math.round(c.dx)}×${Math.round(c.dy)}×${Math.round(c.dz)}`,
      `${Math.round(cabBottomZ(c, d.room, w))}${(c.bulkhead as { auto_h?: boolean } | null)?.auto_h ? ' (bulkhead, fills to ceiling)' : (c.rule_overrides as { WALLZ?: number } | null)?.WALLZ != null ? ' (own underside)' : ''}`,
      frontText, mat(carcassId) ?? '-',
    ].join(' | '))
  }

  // Colour TBC (z_ai_helper R2): a board with colours picked without one resolves in its
  // default colour (e.g. White) with a COLOUR_NOT_CHOSEN warning — that is "colour TBC", not White.
  const tbc = colourTbc(d.cabinets)
  if (tbc.length) {
    lines.push('', 'Colour TBC (board chosen, colour not picked yet — drawn in its default colour until it is; that is NOT a chosen colour):')
    for (const t of tbc) lines.push(`${t.what}: ${t.board}, showing ${t.shows} (${t.labels.join(', ')})`)
  }

  if (d.fixtures.length) {
    lines.push('', 'Fixtures (name | on cabinet):')
    const labelById = new Map(d.cabinets.map(c => [c.id, c.label]))
    for (const f of [...d.fixtures].sort((a, b) => (a.label ?? a.name ?? '').localeCompare(b.label ?? b.name ?? ''))) {
      lines.push(`${f.display_name || f.label || f.name} | ${(f.cabinet_id && labelById.get(f.cabinet_id)) || '-'}`)
    }
  }

  if (d.splashbacks?.length) {
    lines.push('', 'Splashbacks (label | wall [back] | from–to along the wall as seen | bottom–top off floor | schedule):')
    const wallName = new Map(d.walls.map(w => [w.id, w.name]))
    for (const s of [...d.splashbacks].sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))) {
      const b = sbBounds(s.segments)
      if (!b) continue
      lines.push([
        s.label ?? 'Splashback',
        `${wallName.get(s.wall_id) ?? '?'}${s.wall_side === 'back' ? ' back' : ''}`,
        `${Math.round(b.x0)}–${Math.round(b.x1)}`,
        `${Math.round(b.z0)}–${Math.round(b.z1)}`,
        (s.splashback_schedule_id && d.sbScheduleNames?.get(s.splashback_schedule_id)) || 'room/job default',
      ].join(' | '))
    }
  }
  return lines.join('\n')
}

/** COLOUR_NOT_CHOSEN warnings from each cabinet's last resolve, grouped by part + board. */
export function colourTbc(cabs: { label: string | null }[]) {
  const by = new Map<string, { what: string; board: string; shows: string; labels: string[] }>()
  for (const c of cabs) {
    const ws = ((c as { resolved_drawer_hw?: unknown }).resolved_drawer_hw as { warnings?: { code?: string; message?: string }[] } | null)?.warnings ?? []
    for (const w of ws) {
      if (w.code !== 'COLOUR_NOT_CHOSEN' || !w.message) continue
      // "Doors: Satin Board 18mm has colours but none was chosen. Using the default, White."
      const m = /^([^:]+):\s*(.+?) has colours but none was chosen\.\s*Using the default, ([^.]+)\./.exec(w.message)
      if (!m) continue
      const k = `${m[1]}|${m[2]}`
      const e = by.get(k) ?? { what: m[1], board: m[2], shows: m[3], labels: [] }
      if (c.label && !e.labels.includes(c.label)) e.labels.push(c.label)
      by.set(k, e)
    }
  }
  return [...by.values()]
}

/** Load everything formatRoomSummary needs for one room (8 reads, run in parallel where possible). */
export async function loadRoomSummaryData(roomId: string): Promise<RoomSummaryData> {
  const [roomQ, wallsQ, cabsQ, fixQ, sbQ, sbSchedQ] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', roomId).single(),
    supabase.from('walls').select('*').eq('room_id', roomId),
    supabase.from('cabinet_instances').select('*').eq('room_id', roomId),
    supabase.from('room_fixtures').select('id, label, display_name, name, cabinet_id').eq('room_id', roomId),
    supabase.from('splashback_instances').select('id, label, wall_id, wall_side, segments, splashback_schedule_id').eq('room_id', roomId),
    supabase.from('splashback_schedules').select('id, name'),
  ])
  if (roomQ.error) throw new Error(`room ${roomId}: ${roomQ.error.message}`)
  const cabinets = (cabsQ.data ?? []) as CabinetInstance[]
  const ids = cabinets.map(c => c.id)
  const defIds = [...new Set(cabinets.map(c => c.cabinet_definition_id).filter((x): x is string => !!x))]

  const [defsQ, frontsQ, carcassQ] = await Promise.all([
    defIds.length ? supabase.from('cabinet_definitions').select('id, name').in('id', defIds) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from('face_zones').select('cabinet_instance_id, face_type, material_id, handle_hardware_id').in('cabinet_instance_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from('case_parts').select('cabinet_instance_id, material_id').in('cabinet_instance_id', ids) : Promise.resolve({ data: [] }),
  ])
  const fronts = (frontsQ.data ?? []) as RoomSummaryData['fronts']
  const carcass = (carcassQ.data ?? []) as RoomSummaryData['carcass']
  const matIds = [...new Set([...fronts, ...carcass].map(r => r.material_id).filter((x): x is string => !!x))]
  const handleIds = [...new Set(fronts.map(f => f.handle_hardware_id).filter((x): x is string => !!x))]
  const [matsQ, handlesQ] = await Promise.all([
    matIds.length ? supabase.from('materials').select('id, name').in('id', matIds) : Promise.resolve({ data: [] }),
    handleIds.length ? supabase.from('hardware_handles').select('id, name').in('id', handleIds) : Promise.resolve({ data: [] }),
  ])
  const names = (rows: { id: string; name: string }[] | null) => new Map((rows ?? []).map(r => [r.id, r.name]))
  return {
    room: roomQ.data as RoomSummaryData['room'],
    walls: (wallsQ.data ?? []) as Wall[],
    cabinets,
    fixtures: (fixQ.data ?? []) as RoomSummaryData['fixtures'],
    defNames: names(defsQ.data as { id: string; name: string }[] | null),
    fronts, carcass,
    materialNames: names(matsQ.data as { id: string; name: string }[] | null),
    handleNames: names(handlesQ.data as { id: string; name: string }[] | null),
    splashbacks: (sbQ.data ?? []) as RoomSummaryData['splashbacks'],
    sbScheduleNames: names(sbSchedQ.data as { id: string; name: string }[] | null),
  }
}

export async function loadRoomSummary(roomId: string): Promise<string> {
  const { cadViews } = await import('./server/cadPicture')
  const [data, cad] = await Promise.all([loadRoomSummaryData(roomId), cadViews(roomId).catch(() => '')])
  // CAD on the canvas (z_ai_helper Q9): the model sees it only through look_at_cad.
  return `${formatRoomSummary(data)}${cad && !cad.startsWith('No ') ? `\nCAD on this room's canvas (look_at_cad to see it): ${cad}` : ''}`
}
