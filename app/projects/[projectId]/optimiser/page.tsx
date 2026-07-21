import { notFound } from 'next/navigation'
import { createServerClient } from '@/src/lib/supabase-server'
import type { OptiSnapshot, OptiMaterial, OptiMachine, OptiProfile, PartKeyMap } from '@/src/lib/optimiser/types'
import { normalizeProject, collectEbIds, PART_SELECTS, type RawRoom, type RawCabinet } from '@/src/lib/optimiser/normalize'
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
    ? await supabase.from('cabinet_instances').select('id,label,assembly_class,room_id,part_comments,part_names,no_cnc').in('room_id', roomIds)
    : { data: [] }
  const cabs = (cabsRaw ?? []) as (RawCabinet & { part_comments?: PartKeyMap | null; part_names?: PartKeyMap | null })[]
  const cabIds = cabs.map(c => c.id)
  const commentsByCab = new Map<string, PartKeyMap>(cabs.map(c => [c.id, c.part_comments ?? {}]))
  const namesByCab = new Map<string, PartKeyMap>(cabs.map(c => [c.id, c.part_names ?? {}]))

  const empty = { data: [] as Record<string, unknown>[] }
  const [cpR, ipR, tpR, fzR, dbR, ccR] = cabIds.length ? await Promise.all([
    supabase.from('case_parts').select(PART_SELECTS.case_parts).in('cabinet_instance_id', cabIds),
    supabase.from('internal_parts').select(PART_SELECTS.internal_parts).in('cabinet_instance_id', cabIds),
    supabase.from('toekick_parts').select(PART_SELECTS.toekick_parts).in('cabinet_instance_id', cabIds),
    supabase.from('face_zones').select(PART_SELECTS.face_zones).in('cabinet_instance_id', cabIds),
    supabase.from('drawer_box_parts').select(PART_SELECTS.drawer_box_parts).in('cabinet_instance_id', cabIds),
    supabase.from('cabinet_custom_parts').select(PART_SELECTS.custom_parts).in('cabinet_instance_id', cabIds),
  ]) : [empty, empty, empty, empty, empty, empty]

  const [matR, machR, profR, toolR, projR, sysNamesR] = await Promise.all([
    supabase.from('materials').select('id,name,dz,sheet_dx,sheet_dy,has_grain,grain_direction,trim_top,trim_bottom,trim_left,trim_right,pad,cnc_tool_id,feed_rate_pct').eq('active', true).order('name'),
    supabase.from('cnc_machines').select('id,name,brand,model,table_dx,table_dy,gcode_dialect,is_default').eq('active', true).order('name'),
    supabase.from('cnc_machine_profiles').select('id,cnc_machine_id,name,is_default,nest_pad,tool_entry_offset,margin_use_tool_dia,margin_use_entry_offset,deduct_edgeband'),
    supabase.from('cnc_tools').select('id,diameter').eq('active', true),
    supabase.from('projects').select('id,name,job_number').order('created_at', { ascending: false }),
    supabase.from('parts_library').select('key,name').eq('active', true),
  ])

  // Shop-wide display names, read live from parts_library (key = raw resolver
  // identity). Renaming a part there relabels every job that hasn't overridden
  // that specific part by hand.
  const systemNames: PartKeyMap = Object.fromEntries(
    ((sysNamesR.data ?? []) as { key: string; name: string }[]).map(r => [r.key, r.name]))

  // Edgeband thicknesses referenced by the part rows (for cut-size deduction).
  const ebIds = collectEbIds(
    (cpR.data ?? []) as Record<string, unknown>[], (ipR.data ?? []) as Record<string, unknown>[],
    (tpR.data ?? []) as Record<string, unknown>[], (fzR.data ?? []) as Record<string, unknown>[],
    (dbR.data ?? []) as Record<string, unknown>[])
  const { data: ebRows } = ebIds.length
    ? await supabase.from('edge_banding').select('id,thickness').in('id', ebIds)
    : { data: [] }
  const ebThickness = new Map((ebRows ?? []).map(r => [r.id as string, Number(r.thickness)]))

  const norm = normalizeProject(project, rooms, cabs,
    (cpR.data ?? []) as Record<string, unknown>[], (ipR.data ?? []) as Record<string, unknown>[],
    (tpR.data ?? []) as Record<string, unknown>[], (fzR.data ?? []) as Record<string, unknown>[],
    (dbR.data ?? []) as Record<string, unknown>[], commentsByCab,
    (ccR.data ?? []) as Record<string, unknown>[], ebThickness, namesByCab, systemNames)

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
    tools: (toolR.data ?? []) as OptiSnapshot['tools'],
    allProjects: (projR.data ?? []) as { id: string; name: string; job_number: string | null }[],
  }

  return <OptimiserClient snapshot={snapshot} />
}
