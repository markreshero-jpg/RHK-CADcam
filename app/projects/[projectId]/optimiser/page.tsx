import { notFound } from 'next/navigation'
import { createServerClient } from '@/src/lib/supabase-server'
import type {
  OptiSnapshot, OptiPart, OptiMaterial, OptiMachine, OptiProfile, OptiRoom, OptiCabinet, SourceTable,
} from '@/src/lib/optimiser/types'
import OptimiserClient from './OptimiserClient'

export const dynamic = 'force-dynamic'

const humanize = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

export default async function OptimiserPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const supabase = await createServerClient()

  const { data: project } = await supabase.from('projects').select('id,name,job_number').eq('id', projectId).single()
  if (!project) notFound()

  const { data: roomsRaw } = await supabase.from('rooms').select('id,name').eq('project_id', projectId).order('sort_order')
  const rooms = (roomsRaw ?? []) as OptiRoom[]
  const roomIds = rooms.map(r => r.id)
  const roomById = new Map(rooms.map(r => [r.id, r]))

  const { data: cabsRaw } = roomIds.length
    ? await supabase.from('cabinet_instances').select('id,label,assembly_class,room_id').in('room_id', roomIds)
    : { data: [] }
  const cabsFull = (cabsRaw ?? []) as { id: string; label: string | null; assembly_class: string; room_id: string }[]
  const cabinets: OptiCabinet[] = cabsFull.map(c => ({ id: c.id, label: c.label ?? humanize(c.assembly_class), room_id: c.room_id }))
  const cabById = new Map(cabinets.map(c => [c.id, c]))
  const cabIds = cabinets.map(c => c.id)

  const inCabs = <T,>(q: T) => q  // readability marker; queries below guard on cabIds

  const [cpR, ipR, tpR, fzR, matR, machR, profR] = cabIds.length ? await Promise.all([
    inCabs(supabase.from('case_parts').select('id,cabinet_instance_id,part_key,dx,dy,dz,material_id,grain_direction,nest_priority,output_to_cnc').in('cabinet_instance_id', cabIds)),
    inCabs(supabase.from('internal_parts').select('id,cabinet_instance_id,part_type,sort_order,dx,dy,dz,material_id,output_to_cnc').in('cabinet_instance_id', cabIds)),
    inCabs(supabase.from('toekick_parts').select('id,cabinet_instance_id,part_key,sort_order,dx,dy,dz,material_id,output_to_cnc').in('cabinet_instance_id', cabIds)),
    inCabs(supabase.from('face_zones').select('id,cabinet_instance_id,row_index,col_index,face_type,dx,dy,dz,material_id,grain_direction,output_to_cnc').in('cabinet_instance_id', cabIds)),
    supabase.from('materials').select('id,name,dz,sheet_dx,sheet_dy,has_grain,grain_direction,trim_top,trim_bottom,trim_left,trim_right,pad').eq('active', true).order('name'),
    supabase.from('cnc_machines').select('id,name,brand,model,table_dx,table_dy,gcode_dialect,is_default').eq('active', true).order('name'),
    supabase.from('cnc_machine_profiles').select('id,cnc_machine_id,name,is_default'),
  ]) : [
    { data: [] }, { data: [] }, { data: [] }, { data: [] },
    await supabase.from('materials').select('id,name,dz,sheet_dx,sheet_dy,has_grain,grain_direction,trim_top,trim_bottom,trim_left,trim_right,pad').eq('active', true).order('name'),
    await supabase.from('cnc_machines').select('id,name,brand,model,table_dx,table_dy,gcode_dialect,is_default').eq('active', true).order('name'),
    await supabase.from('cnc_machine_profiles').select('id,cnc_machine_id,name,is_default'),
  ]

  const parts: OptiPart[] = []
  const meta = (cabId: string) => {
    const cab = cabById.get(cabId)
    const room = cab ? roomById.get(cab.room_id) : undefined
    return { cabinet_label: cab?.label ?? '—', room_id: cab?.room_id ?? '', room_name: room?.name ?? '—' }
  }
  const push = (
    table: SourceTable, row: Record<string, unknown>, key: string, label: string,
    grain: string | null, nestPriority: number,
  ) => {
    const m = meta(row.cabinet_instance_id as string)
    parts.push({
      uid: `${table}:${row.id as string}`,
      source_table: table,
      source_part_id: row.id as string,
      cabinet_instance_id: row.cabinet_instance_id as string,
      cabinet_label: m.cabinet_label,
      room_id: m.room_id, room_name: m.room_name,
      project_id: projectId, job_number: project.job_number ?? null,
      label,
      w: Number(row.dx), h: Number(row.dy), thickness: Number(row.dz),
      material_id: (row.material_id as string) ?? null,
      grain_direction: grain,
      nest_priority: nestPriority,
      output_to_cnc: (row.output_to_cnc as boolean) ?? true,
    })
    void key
  }

  for (const r of (cpR.data ?? []) as Record<string, unknown>[])
    push('case_parts', r, `case_${r.part_key}`, humanize(String(r.part_key)), (r.grain_direction as string) ?? null, Number(r.nest_priority ?? 0))
  for (const r of (ipR.data ?? []) as Record<string, unknown>[])
    push('internal_parts', r, `int_${r.part_type}_${r.sort_order}`, `${humanize(String(r.part_type))} ${Number(r.sort_order) + 1}`, null, 0)
  for (const r of (tpR.data ?? []) as Record<string, unknown>[])
    push('toekick_parts', r, `tk_${r.part_key}_${r.sort_order}`, humanize(String(r.part_key)), null, 0)
  for (const r of (fzR.data ?? []) as Record<string, unknown>[])
    push('face_zones', r, `zone_${r.row_index}_${r.col_index}`, `${humanize(String(r.face_type))} (R${Number(r.row_index) + 1}C${Number(r.col_index) + 1})`, (r.grain_direction as string) ?? null, 0)

  const snapshot: OptiSnapshot = {
    projectId,
    projectName: project.name,
    jobNumber: project.job_number ?? null,
    rooms,
    cabinets,
    parts,
    materials: (matR.data ?? []) as OptiMaterial[],
    machines: (machR.data ?? []) as OptiMachine[],
    profiles: (profR.data ?? []) as OptiProfile[],
  }

  return <OptimiserClient snapshot={snapshot} />
}
