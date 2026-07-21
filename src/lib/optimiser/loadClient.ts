// ============================================================
// Client-side batch loader. Pulls another project's part snapshot
// in the browser so projects can be added to a batch run after
// the page has loaded (spec §5.3). Mirrors the server route's
// query set and reuses the shared normaliser.
// ============================================================

import { supabase } from '@/src/lib/supabase'
import { normalizeProject, collectEbIds, PART_SELECTS, type RawRoom, type RawCabinet } from './normalize'
import type { NormalizedProject } from './normalize'
import type { PartKeyMap } from './types'

export async function loadProjectParts(projectId: string): Promise<NormalizedProject> {
  const { data: project } = await supabase.from('projects').select('id,name,job_number').eq('id', projectId).single()
  if (!project) return { rooms: [], cabinets: [], parts: [] }

  const { data: roomsRaw } = await supabase.from('rooms').select('id,name').eq('project_id', projectId).order('sort_order')
  const rooms = (roomsRaw ?? []) as RawRoom[]
  const roomIds = rooms.map(r => r.id)
  if (!roomIds.length) return normalizeProject(project, rooms, [], [], [], [], [], [])

  const { data: cabsRaw } = await supabase.from('cabinet_instances').select('id,label,assembly_class,room_id,part_comments,part_names,no_cnc').in('room_id', roomIds)
  const cabs = (cabsRaw ?? []) as (RawCabinet & { part_comments?: PartKeyMap | null; part_names?: PartKeyMap | null })[]
  const cabIds = cabs.map(c => c.id)
  const commentsByCab = new Map<string, PartKeyMap>(cabs.map(c => [c.id, c.part_comments ?? {}]))
  const namesByCab = new Map<string, PartKeyMap>(cabs.map(c => [c.id, c.part_names ?? {}]))
  if (!cabIds.length) return normalizeProject(project, rooms, cabs, [], [], [], [], [], commentsByCab)

  const [cpR, ipR, tpR, fzR, dbR, ccR] = await Promise.all([
    supabase.from('case_parts').select(PART_SELECTS.case_parts).in('cabinet_instance_id', cabIds),
    supabase.from('internal_parts').select(PART_SELECTS.internal_parts).in('cabinet_instance_id', cabIds),
    supabase.from('toekick_parts').select(PART_SELECTS.toekick_parts).in('cabinet_instance_id', cabIds),
    supabase.from('face_zones').select(PART_SELECTS.face_zones).in('cabinet_instance_id', cabIds),
    supabase.from('drawer_box_parts').select(PART_SELECTS.drawer_box_parts).in('cabinet_instance_id', cabIds),
    supabase.from('cabinet_custom_parts').select(PART_SELECTS.custom_parts).in('cabinet_instance_id', cabIds),
  ])

  // Edgeband thicknesses referenced by the part rows (for cut-size deduction).
  const ebIds = collectEbIds(
    (cpR.data ?? []) as Record<string, unknown>[], (ipR.data ?? []) as Record<string, unknown>[],
    (tpR.data ?? []) as Record<string, unknown>[], (fzR.data ?? []) as Record<string, unknown>[],
    (dbR.data ?? []) as Record<string, unknown>[])
  const { data: ebRows } = ebIds.length
    ? await supabase.from('edge_banding').select('id,thickness').in('id', ebIds)
    : { data: [] }
  const ebThickness = new Map((ebRows ?? []).map(r => [r.id as string, Number(r.thickness)]))

  // Shop-wide display names, read live from parts_library (key = raw resolver identity).
  const { data: libRows } = await supabase.from('parts_library').select('key,name').eq('active', true)
  const systemNames: PartKeyMap = Object.fromEntries(
    ((libRows ?? []) as { key: string; name: string }[]).map(r => [r.key, r.name]))

  return normalizeProject(project, rooms, cabs,
    (cpR.data ?? []) as Record<string, unknown>[], (ipR.data ?? []) as Record<string, unknown>[],
    (tpR.data ?? []) as Record<string, unknown>[], (fzR.data ?? []) as Record<string, unknown>[],
    (dbR.data ?? []) as Record<string, unknown>[], commentsByCab,
    (ccR.data ?? []) as Record<string, unknown>[], ebThickness, namesByCab, systemNames)
}
