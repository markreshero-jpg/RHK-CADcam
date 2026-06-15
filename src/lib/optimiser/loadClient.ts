// ============================================================
// Client-side batch loader. Pulls another project's part snapshot
// in the browser so projects can be added to a batch run after
// the page has loaded (spec §5.3). Mirrors the server route's
// query set and reuses the shared normaliser.
// ============================================================

import { supabase } from '@/src/lib/supabase'
import { normalizeProject, PART_SELECTS, type RawRoom, type RawCabinet } from './normalize'
import type { NormalizedProject } from './normalize'

export async function loadProjectParts(projectId: string): Promise<NormalizedProject> {
  const { data: project } = await supabase.from('projects').select('id,name,job_number').eq('id', projectId).single()
  if (!project) return { rooms: [], cabinets: [], parts: [] }

  const { data: roomsRaw } = await supabase.from('rooms').select('id,name').eq('project_id', projectId).order('sort_order')
  const rooms = (roomsRaw ?? []) as RawRoom[]
  const roomIds = rooms.map(r => r.id)
  if (!roomIds.length) return normalizeProject(project, rooms, [], [], [], [], [], [])

  const { data: cabsRaw } = await supabase.from('cabinet_instances').select('id,label,assembly_class,room_id,part_comments,no_cnc').in('room_id', roomIds)
  const cabs = (cabsRaw ?? []) as (RawCabinet & { part_comments?: Record<string, string> | null })[]
  const cabIds = cabs.map(c => c.id)
  const commentsByCab = new Map<string, Record<string, string>>(cabs.map(c => [c.id, c.part_comments ?? {}]))
  if (!cabIds.length) return normalizeProject(project, rooms, cabs, [], [], [], [], [], commentsByCab)

  const [cpR, ipR, tpR, fzR, dbR, ccR] = await Promise.all([
    supabase.from('case_parts').select(PART_SELECTS.case_parts).in('cabinet_instance_id', cabIds),
    supabase.from('internal_parts').select(PART_SELECTS.internal_parts).in('cabinet_instance_id', cabIds),
    supabase.from('toekick_parts').select(PART_SELECTS.toekick_parts).in('cabinet_instance_id', cabIds),
    supabase.from('face_zones').select(PART_SELECTS.face_zones).in('cabinet_instance_id', cabIds),
    supabase.from('drawer_box_parts').select(PART_SELECTS.drawer_box_parts).in('cabinet_instance_id', cabIds),
    supabase.from('cabinet_custom_parts').select(PART_SELECTS.custom_parts).in('cabinet_instance_id', cabIds),
  ])

  return normalizeProject(project, rooms, cabs,
    (cpR.data ?? []) as Record<string, unknown>[], (ipR.data ?? []) as Record<string, unknown>[],
    (tpR.data ?? []) as Record<string, unknown>[], (fzR.data ?? []) as Record<string, unknown>[],
    (dbR.data ?? []) as Record<string, unknown>[], commentsByCab,
    (ccR.data ?? []) as Record<string, unknown>[])
}
