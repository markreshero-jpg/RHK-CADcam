// Read tools for the AI helper (z_ai_helper AI1). Each returns short plain text
// the model reads — never raw rows. All reads go through '@/src/lib/supabase', so
// inside withSupabase() they run as the signed-in user (RLS).

import type Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance, RoomAnnotation, Wall } from '@/src/lib/types'
import { cabWallPerp, cabinetCenterPt, centroid, wallInwardNormal } from '@/src/lib/geometry'
import { wallOffset } from './roomSummary'

export interface ToolContext { projectId: string; roomId: string }

export const READ_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_kicks',
    description: 'Every toe-kick piece in the room (joined kick runs and cabinets\' own kicks): part, length, height, thickness, board, plus total length per part type. Use for kick lengths, kick boards and kick heights.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_markup',
    description: 'The CAD markup drawn on the room\'s plan and elevations: TBC clouds, notes and text, with the wall and the cabinets each one is on or near. Use for "what is TBC", site notes, colour callouts.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'find_library',
    description: 'Search the cabinet library for codes to place: by code or words (e.g. "end panel", "filler", "BEP", "drawer 600"). Returns code | class | default W×H×D | category.',
    input_schema: {
      type: 'object',
      properties: { search: { type: 'string' } },
      required: ['search'], additionalProperties: false,
    },
  },
  {
    name: 'get_cabinet_detail',
    description: 'Full detail for one cabinet by label: size, position, neighbours, notes, every front (type, size, colour, handle, hinge side), carcass parts (size, board), custom parts (end panels, fillers) and fixtures on it.',
    input_schema: {
      type: 'object',
      properties: { label: { type: 'string', description: 'Cabinet label, e.g. "BC-03"' } },
      required: ['label'], additionalProperties: false,
    },
  },
]

const r = (n: unknown) => Math.round(Number(n) * 10) / 10

async function roomCabinets(roomId: string) {
  const [{ data: cabs }, { data: walls }] = await Promise.all([
    supabase.from('cabinet_instances').select('*').eq('room_id', roomId),
    supabase.from('walls').select('*').eq('room_id', roomId),
  ])
  return { cabinets: (cabs ?? []) as CabinetInstance[], walls: (walls ?? []) as Wall[] }
}

async function names(table: string, ids: (string | null | undefined)[]) {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))]
  if (!uniq.length) return new Map<string, string>()
  const { data } = await supabase.from(table).select('id, name').in('id', uniq)
  return new Map((data ?? []).map((x: { id: string; name: string }) => [x.id, x.name]))
}

async function getKicks(ctx: ToolContext): Promise<string> {
  const { cabinets } = await roomCabinets(ctx.roomId)
  if (!cabinets.length) return 'No cabinets in this room.'
  const { data } = await supabase.from('toekick_parts')
    .select('cabinet_instance_id, part_key, dx, dy, dz, material_id')
    .in('cabinet_instance_id', cabinets.map(c => c.id))
  const parts = (data ?? []).filter(p => !String(p.part_key).startsWith('spreader'))
  if (!parts.length) return 'No kick pieces saved for this room.'
  const mats = await names('materials', parts.map(p => p.material_id))
  const label = new Map(cabinets.map(c => [c.id, c.label ?? '?']))
  // CV convention: DY = length (grain), DX = height, DZ = thickness.
  const lines = parts
    .map(p => ({ who: label.get(p.cabinet_instance_id) ?? '?', key: p.part_key as string, len: r(p.dy), h: r(p.dx), t: r(p.dz), mat: mats.get(p.material_id) ?? '-' }))
    .sort((a, b) => a.who.localeCompare(b.who, undefined, { numeric: true }) || a.key.localeCompare(b.key))
  const totals = new Map<string, number>()
  for (const l of lines) totals.set(l.key, (totals.get(l.key) ?? 0) + l.len)
  return [
    'Kick pieces (cabinet | part | length | height | thickness | board) — spreaders left out:',
    ...lines.map(l => `${l.who} | ${l.key} | ${l.len} | ${l.h} | ${l.t} | ${l.mat}`),
    '', 'Total length per part:',
    ...[...totals].map(([k, v]) => `${k}: ${r(v)} mm`),
    'Note: kick_front_face is the visible kick; kick_sub_front / kick_back are the carcass rails behind it.',
  ].join('\n')
}

/** Cabinets an annotation's bounding box covers or sits within 300 mm of. */
function nearCabinets(a: RoomAnnotation, cabinets: CabinetInstance[], walls: Wall[]): string[] {
  const pts: { x: number; y: number }[] = []
  const g = a.geom as unknown as Record<string, unknown>
  const pushPt = (p: unknown) => { if (p && typeof p === 'object' && 'x' in p) pts.push(p as { x: number; y: number }) }
  for (const v of Object.values(g)) Array.isArray(v) ? v.forEach(pushPt) : pushPt(v)
  if (!pts.length) return []
  const pad = 300
  const box = { minX: Math.min(...pts.map(p => p.x)) - pad, maxX: Math.max(...pts.map(p => p.x)) + pad, minY: Math.min(...pts.map(p => p.y)) - pad, maxY: Math.max(...pts.map(p => p.y)) + pad }
  const inside = (x: number, y: number) => x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY
  const ref = centroid(walls)
  return cabinets.filter(c => {
    const w = walls.find(x => x.id === c.wall_id)
    if (!w) return false
    if (a.view === 'elevation') {
      if (a.wall_id !== w.id) return false
      const u = wallOffset(c, w) + c.dx / 2
      return inside(u, (c.pos_z ?? 0) + c.dy / 2)
    }
    if (a.view === 'plan') {
      const ctr = cabinetCenterPt(c, w, cabWallPerp(c, w, wallInwardNormal(w, ref)))
      return inside(ctr.x, ctr.y)
    }
    return false
  }).map(c => c.label ?? '?')
}

async function getMarkup(ctx: ToolContext): Promise<string> {
  const [{ data }, { cabinets, walls }] = await Promise.all([
    supabase.from('room_annotations').select('*').eq('room_id', ctx.roomId).in('kind', ['text', 'cloud']),
    roomCabinets(ctx.roomId),
  ])
  const notes = (data ?? []) as RoomAnnotation[]
  if (!notes.length) return 'No notes or clouds drawn in this room.'
  const wallName = new Map(walls.map(w => [w.id, w.name]))
  const label = new Map(cabinets.map(c => [c.id, c.label ?? '?']))
  const lines = notes.map(a => {
    const where = a.view === 'cabinet_sheet' ? `cabinet sheet ${label.get(a.cabinet_id ?? '') ?? '?'}`
      : a.view === 'elevation' ? `elevation ${wallName.get(a.wall_id ?? '') ?? '?'}` : 'plan'
    const near = a.view === 'cabinet_sheet' ? [] : nearCabinets(a, cabinets, walls)
    const text = a.kind === 'cloud' ? `CLOUD${a.text ? ` "${a.text}"` : ''}` : `"${(a.text ?? '').replace(/\s+/g, ' ').trim()}"`
    return `${text} | ${where} | near ${near.length ? near.join(', ') : '-'}`
  })
  return [
    'Markup (what | where | cabinets on/near it). A cloud marks something TBC; text near a cloud usually says what:',
    ...lines,
  ].join('\n')
}

async function getCabinetDetail(ctx: ToolContext, input: { label?: string }): Promise<string> {
  const want = String(input.label ?? '').trim().toLowerCase()
  const { cabinets, walls } = await roomCabinets(ctx.roomId)
  const c = cabinets.find(x => (x.label ?? '').toLowerCase() === want)
  if (!c) return `No cabinet "${input.label}" in this room. Labels: ${cabinets.map(x => x.label).join(', ')}`
  const w = walls.find(x => x.id === c.wall_id)
  const [def, fronts, carcass, custom, fixtures] = await Promise.all([
    c.cabinet_definition_id ? supabase.from('cabinet_definitions').select('name').eq('id', c.cabinet_definition_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('face_zones').select('facet, face_type, row_index, col_index, dx, dy, material_id, handle_hardware_id, hinge_side').eq('cabinet_instance_id', c.id),
    supabase.from('case_parts').select('part_key, dx, dy, dz, material_id').eq('cabinet_instance_id', c.id),
    supabase.from('cabinet_custom_parts').select('name, dx, dy, dz, material_id, visible').eq('cabinet_instance_id', c.id),
    supabase.from('room_fixtures').select('name, label, display_name').eq('cabinet_id', c.id),
  ])
  const fz = fronts.data ?? [], cp = carcass.data ?? [], cu = (custom.data ?? []).filter(p => p.visible !== false)
  const mats = await names('materials', [...fz, ...cp, ...cu].map(p => p.material_id))
  const handles = await names('hardware_handles', fz.map(f => f.handle_hardware_id))
  const rules = Object.keys(c.rule_overrides ?? {})
  return [
    `${c.label} — ${(def.data as { name?: string } | null)?.name ?? '?'} (${c.assembly_class})`,
    `Size W×H×D: ${r(c.dx)}×${r(c.dy)}×${r(c.dz)}, ${r(c.pos_z ?? 0)} off the floor`,
    `Position: ${w ? `${w.name} @ ${wallOffset(c, w)}` : 'not on a wall'}; neighbours left ${c.left_neighbour_type ?? '-'}, right ${c.right_neighbour_type ?? '-'}`,
    c.notes ? `Notes: ${c.notes}` : '',
    rules.length ? `Rule overrides: ${rules.map(k => `${k}=${JSON.stringify((c.rule_overrides as Record<string, unknown>)[k])}`).join(', ')}` : '',
    // A shaped cabinet (pie corner, angled end) has fronts on more than one face:
    // facet '' = its main face, others are named by the footprint edge.
    '', 'Fronts (face | type | row,col | W×H | colour | handle | hinge — doors only):',
    ...fz.sort((a, b) => (a.facet ?? '').localeCompare(b.facet ?? '') || a.row_index - b.row_index || a.col_index - b.col_index).map(f =>
      `${f.facet ? `${f.facet} face` : 'main face'} | ${f.face_type} | ${f.row_index},${f.col_index} | ${r(f.dx)}×${r(f.dy)} | ${mats.get(f.material_id) ?? '-'} | ${handles.get(f.handle_hardware_id) ?? '-'} | ${f.face_type === 'door' ? f.hinge_side ?? '-' : '-'}`),
    ...(new Set(fz.map(f => f.facet ?? '')).size > 1 ? ['(Fronts on different faces are separate fronts, even when their row,col match.)'] : []),
    '', 'Carcass parts (part | length × width × thickness | board):',
    ...cp.sort((a, b) => a.part_key.localeCompare(b.part_key)).map(p => `${p.part_key} | ${r(p.dy)}×${r(p.dx)}×${r(p.dz)} | ${mats.get(p.material_id) ?? '-'}`),
    ...(cu.length ? ['', 'Custom parts (name | size | board):', ...cu.map(p => `${p.name} | ${r(p.dx)}×${r(p.dy)}×${r(p.dz)} | ${mats.get(p.material_id) ?? '-'}`)] : []),
    ...((fixtures.data ?? []).length ? ['', `Fixtures on it: ${(fixtures.data ?? []).map(f => f.display_name || f.label || f.name).join(', ')}`] : []),
  ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n')
}

async function findLibrary(input: { search?: string }): Promise<string> {
  const q = String(input.search ?? '').trim()
  if (!q) return 'Give a code or a few words to search for.'
  const [{ data: cats }, { data: defs }] = await Promise.all([
    supabase.from('cabinet_categories').select('id, name'),
    supabase.from('cabinet_definitions').select('id, name, assembly_class, default_dx, default_dy, default_dz, category_id, subcategory_id').order('name'),
  ])
  const catName = new Map((cats ?? []).map((c: { id: string; name: string }) => [c.id, c.name]))
  const words = q.toLowerCase().split(/\s+/)
  const rows = (defs ?? []).map(d => ({ d, text: `${d.name} ${catName.get(d.category_id) ?? ''} ${catName.get(d.subcategory_id) ?? ''} ${d.assembly_class}`.toLowerCase() }))
  const exact = rows.filter(r => r.d.name.toLowerCase() === q.toLowerCase())
  const hits = exact.length ? exact : rows.filter(r => words.every(w => r.text.includes(w)))
  if (!hits.length) return `Nothing in the library matches "${q}". Try fewer words or a code.`
  return ['code | class | default W×H×D | category', ...hits.slice(0, 25).map(({ d }) =>
    `${d.name} | ${d.assembly_class} | ${r(d.default_dx)}×${r(d.default_dy)}×${r(d.default_dz)} | ${[catName.get(d.category_id), catName.get(d.subcategory_id)].filter(Boolean).join(' › ') || '-'}`),
    ...(hits.length > 25 ? [`…and ${hits.length - 25} more — narrow the search.`] : []),
  ].join('\n')
}

export async function runReadTool(name: string, input: unknown, ctx: ToolContext): Promise<string> {
  switch (name) {
    case 'find_library': return findLibrary((input ?? {}) as { search?: string })
    case 'get_kicks': return getKicks(ctx)
    case 'get_markup': return getMarkup(ctx)
    case 'get_cabinet_detail': return getCabinetDetail(ctx, (input ?? {}) as { label?: string })
    default: throw new Error(`Unknown tool: ${name}`)
  }
}
