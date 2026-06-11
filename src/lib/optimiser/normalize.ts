// ============================================================
// Shared part-snapshot normaliser.
// Turns raw project/room/cabinet/part rows into OptiPart[] +
// room/cabinet lists. Used by the server route loader and the
// client-side batch loader so both produce identical shapes.
// ============================================================

import type { OptiPart, OptiRoom, OptiCabinet, SourceTable } from './types'

export const humanize = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

export interface RawProject { id: string; name: string; job_number: string | null }
export interface RawRoom { id: string; name: string }
export interface RawCabinet { id: string; label: string | null; assembly_class: string; room_id: string }
type Row = Record<string, unknown>

export interface NormalizedProject {
  rooms: OptiRoom[]
  cabinets: OptiCabinet[]
  parts: OptiPart[]
}

export function normalizeProject(
  project: RawProject,
  roomsRaw: RawRoom[],
  cabsRaw: RawCabinet[],
  cp: Row[], ip: Row[], tp: Row[], fz: Row[],
  dbp: Row[] = [],
  commentsByCab: Map<string, Record<string, string>> = new Map(),
): NormalizedProject {
  const rooms: OptiRoom[] = roomsRaw.map(r => ({ id: r.id, name: r.name }))
  const roomById = new Map(rooms.map(r => [r.id, r]))
  const cabinets: OptiCabinet[] = cabsRaw.map(c => ({ id: c.id, label: c.label ?? humanize(c.assembly_class), room_id: c.room_id }))
  const cabById = new Map(cabinets.map(c => [c.id, c]))

  const parts: OptiPart[] = []
  const meta = (cabId: string) => {
    const cab = cabById.get(cabId)
    const room = cab ? roomById.get(cab.room_id) : undefined
    return { cabinet_label: cab?.label ?? '—', room_id: cab?.room_id ?? '', room_name: room?.name ?? '—' }
  }
  const push = (table: SourceTable, row: Row, partKey: string, label: string, grain: string | null, nestPriority: number) => {
    const m = meta(row.cabinet_instance_id as string)
    parts.push({
      uid: `${table}:${row.id as string}`,
      source_table: table, source_part_id: row.id as string,
      source_part_key: partKey,
      cabinet_instance_id: row.cabinet_instance_id as string,
      cabinet_label: m.cabinet_label, room_id: m.room_id, room_name: m.room_name,
      project_id: project.id, job_number: project.job_number,
      label,
      w: Number(row.dx), h: Number(row.dy), thickness: Number(row.dz),
      material_id: (row.material_id as string) ?? null,
      grain_direction: grain, nest_priority: nestPriority,
      output_to_cnc: (row.output_to_cnc as boolean) ?? true,
      comment: commentsByCab.get(row.cabinet_instance_id as string)?.[partKey] ?? null,
    })
  }

  // partKey mirrors the svg*Meta synthetic ids so it matches part_operations.source_part_key.
  for (const r of cp) push('case_parts', r, `case_${r.part_key}`, humanize(String(r.part_key)), (r.grain_direction as string) ?? null, Number(r.nest_priority ?? 0))
  for (const r of ip) push('internal_parts', r, `int_${r.part_type}_${r.sort_order}`, `${humanize(String(r.part_type))} ${Number(r.sort_order) + 1}`, null, 0)
  for (const r of tp) push('toekick_parts', r, `tk_${r.part_key}_${r.sort_order}`, humanize(String(r.part_key)), null, 0)
  for (const r of fz) push('face_zones', r, `zone_${r.row_index}_${r.col_index}`, `${humanize(String(r.face_type))} (R${Number(r.row_index) + 1}C${Number(r.col_index) + 1})`, (r.grain_direction as string) ?? null, 0)
  // Drawer box panels — key mirrors svgDbMeta (dbox_<row>_<col>_<part_type>).
  for (const r of dbp) push('drawer_box_parts', r, `dbox_${r.face_zone_row}_${r.face_zone_col}_${r.part_type}`,
    `${humanize(String(r.part_type).replace(/^db_/, ''))} (R${Number(r.face_zone_row) + 1}C${Number(r.face_zone_col) + 1})`, (r.grain_direction as string) ?? null, 0)

  return { rooms, cabinets, parts }
}

// Column selections shared by server + client loaders.
export const PART_SELECTS = {
  case_parts: 'id,cabinet_instance_id,part_key,dx,dy,dz,material_id,grain_direction,nest_priority,output_to_cnc',
  internal_parts: 'id,cabinet_instance_id,part_type,sort_order,dx,dy,dz,material_id,output_to_cnc',
  toekick_parts: 'id,cabinet_instance_id,part_key,sort_order,dx,dy,dz,material_id,output_to_cnc',
  face_zones: 'id,cabinet_instance_id,row_index,col_index,face_type,dx,dy,dz,material_id,grain_direction,output_to_cnc',
  drawer_box_parts: 'id,cabinet_instance_id,face_zone_row,face_zone_col,part_type,dx,dy,dz,material_id,grain_direction,output_to_cnc',
} as const
