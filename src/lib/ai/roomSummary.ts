// Compact room summary for the AI helper (z_ai_helper "Context: the compact
// summary"): one line per wall / cabinet / fixture, ~2–4K tokens for a full
// kitchen. Colours and handles come from the saved (resolved) parts, so they are
// what the drawings show. Never parts, drilling or geometry — the AI asks for
// detail when it needs it. Output order is deterministic so it prompt-caches.

import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance, Wall, Room, RoomFixture } from '@/src/lib/types'
import { cabWallSide } from '@/src/lib/geometry'

export interface RoomSummaryData {
  room: Pick<Room, 'id' | 'name'>
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
  const lines: string[] = [`Room: ${d.room.name}`, '', 'Walls (name | length | angle | type):']
  for (const w of [...d.walls].sort((a, b) => a.sort_order - b.sort_order)) {
    lines.push(`${w.name} | ${Math.round(w.length)} | ${Math.round(w.angle)}° | ${w.wall_type}`)
  }

  lines.push('', 'Cabinets (label | code | class | wall [back] @ offset | W×H×D | z | fronts | carcass):')
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
      Math.round(c.pos_z ?? 0), frontText, mat(carcassId) ?? '-',
    ].join(' | '))
  }

  if (d.fixtures.length) {
    lines.push('', 'Fixtures (name | on cabinet):')
    const labelById = new Map(d.cabinets.map(c => [c.id, c.label]))
    for (const f of [...d.fixtures].sort((a, b) => (a.label ?? a.name ?? '').localeCompare(b.label ?? b.name ?? ''))) {
      lines.push(`${f.display_name || f.label || f.name} | ${(f.cabinet_id && labelById.get(f.cabinet_id)) || '-'}`)
    }
  }
  return lines.join('\n')
}

/** Load everything formatRoomSummary needs for one room (8 reads, run in parallel where possible). */
export async function loadRoomSummaryData(roomId: string): Promise<RoomSummaryData> {
  const [roomQ, wallsQ, cabsQ, fixQ] = await Promise.all([
    supabase.from('rooms').select('id, name').eq('id', roomId).single(),
    supabase.from('walls').select('*').eq('room_id', roomId),
    supabase.from('cabinet_instances').select('*').eq('room_id', roomId),
    supabase.from('room_fixtures').select('id, label, display_name, name, cabinet_id').eq('room_id', roomId),
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
  }
}

export async function loadRoomSummary(roomId: string): Promise<string> {
  return formatRoomSummary(await loadRoomSummaryData(roomId))
}
