import { notFound } from 'next/navigation'
import { createServerClient } from '@/src/lib/supabase-server'
import type { OptiSnapshot, OptiMaterial, OptiMachine, OptiProfile } from '@/src/lib/optimiser/types'
import { normalizeProject, PART_SELECTS, type RawRoom, type RawCabinet } from '@/src/lib/optimiser/normalize'
import OptimiserClient from './OptimiserClient'

export const dynamic = 'force-dynamic'

export default async function OptimiserPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const supabase = await createServerClient()

  const { data: project } = await supabase.from('projects').select('id,name,job_number').eq('id', projectId).single()
  if (!project) notFound()

  const { data: roomsRaw } = await supabase.from('rooms').select('id,name').eq('project_id', projectId).order('sort_order')
  const rooms = (roomsRaw ?? []) as RawRoom[]
  const roomIds = rooms.map(r => r.id)

  const { data: cabsRaw } = roomIds.length
    ? await supabase.from('cabinet_instances').select('id,label,assembly_class,room_id,part_comments').in('room_id', roomIds)
    : { data: [] }
  const cabs = (cabsRaw ?? []) as (RawCabinet & { part_comments?: Record<string, string> | null })[]
  const cabIds = cabs.map(c => c.id)
  const commentsByCab = new Map<string, Record<string, string>>(cabs.map(c => [c.id, c.part_comments ?? {}]))

  const empty = { data: [] as Record<string, unknown>[] }
  const [cpR, ipR, tpR, fzR] = cabIds.length ? await Promise.all([
    supabase.from('case_parts').select(PART_SELECTS.case_parts).in('cabinet_instance_id', cabIds),
    supabase.from('internal_parts').select(PART_SELECTS.internal_parts).in('cabinet_instance_id', cabIds),
    supabase.from('toekick_parts').select(PART_SELECTS.toekick_parts).in('cabinet_instance_id', cabIds),
    supabase.from('face_zones').select(PART_SELECTS.face_zones).in('cabinet_instance_id', cabIds),
  ]) : [empty, empty, empty, empty]

  const [matR, machR, profR, projR] = await Promise.all([
    supabase.from('materials').select('id,name,dz,sheet_dx,sheet_dy,has_grain,grain_direction,trim_top,trim_bottom,trim_left,trim_right,pad,cnc_tool_id,feed_rate_pct').eq('active', true).order('name'),
    supabase.from('cnc_machines').select('id,name,brand,model,table_dx,table_dy,gcode_dialect,is_default').eq('active', true).order('name'),
    supabase.from('cnc_machine_profiles').select('id,cnc_machine_id,name,is_default'),
    supabase.from('projects').select('id,name,job_number').order('created_at', { ascending: false }),
  ])

  const norm = normalizeProject(project, rooms, cabs,
    (cpR.data ?? []) as Record<string, unknown>[], (ipR.data ?? []) as Record<string, unknown>[],
    (tpR.data ?? []) as Record<string, unknown>[], (fzR.data ?? []) as Record<string, unknown>[], commentsByCab)

  const snapshot: OptiSnapshot = {
    projectId,
    projectName: project.name,
    jobNumber: project.job_number ?? null,
    rooms: norm.rooms,
    cabinets: norm.cabinets,
    parts: norm.parts,
    materials: (matR.data ?? []) as OptiMaterial[],
    machines: (machR.data ?? []) as OptiMachine[],
    profiles: (profR.data ?? []) as OptiProfile[],
    allProjects: (projR.data ?? []) as { id: string; name: string; job_number: string | null }[],
  }

  return <OptimiserClient snapshot={snapshot} />
}
