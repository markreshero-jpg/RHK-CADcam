import { supabase } from '@/src/lib/supabase'
import type { BenchtopInstance, BenchtopBuildMethod, BenchtopScheduleRow, Room, Project } from '@/src/lib/types'
import type { BenchtopResolverInput } from './types'

export async function loadBenchtopInput(benchtopId: string): Promise<BenchtopResolverInput | null> {
  // Load the benchtop itself
  const { data: benchtop, error: btErr } = await supabase
    .from('benchtop_instances')
    .select('*')
    .eq('id', benchtopId)
    .single()

  if (btErr || !benchtop) return null

  const bt = benchtop as BenchtopInstance

  // Load room and project for hierarchy resolution
  const [{ data: room }, { data: project }] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', bt.room_id).single(),
    supabase.from('rooms').select('project_id').eq('id', bt.room_id).single()
      .then(async ({ data: r }) => {
        if (!r) return { data: null }
        return supabase.from('projects').select('*').eq('id', (r as { project_id: string }).project_id).single()
      }),
  ])

  const rm  = room as Room | null
  const prj = project as Project | null

  // ── Resolve Build Method through hierarchy ──────────────────────────────
  const methodId =
    bt.benchtop_build_method_id ??
    rm?.benchtop_build_method_id ??
    prj?.benchtop_build_method_id ??
    null

  let method: BenchtopBuildMethod | null = null
  if (methodId) {
    const { data: m } = await supabase
      .from('benchtop_build_methods')
      .select('*')
      .eq('id', methodId)
      .single()
    method = m as BenchtopBuildMethod | null
  }
  if (!method) {
    const { data: m } = await supabase
      .from('benchtop_build_methods')
      .select('*')
      .eq('is_default', true)
      .limit(1)
      .single()
    method = m as BenchtopBuildMethod | null
  }
  if (!method) return null  // Cannot resolve without a build method

  // ── Resolve Schedule through hierarchy ──────────────────────────────────
  const scheduleId =
    bt.benchtop_schedule_id ??
    rm?.benchtop_schedule_id ??
    prj?.benchtop_schedule_id ??
    null

  let scheduleRows: BenchtopScheduleRow[] = []
  if (scheduleId) {
    const { data: rows } = await supabase
      .from('benchtop_schedule_rows')
      .select('*')
      .eq('schedule_id', scheduleId)
    scheduleRows = (rows ?? []) as BenchtopScheduleRow[]
  }

  // ── Load materials for thickness/name lookup ────────────────────────────
  const [{ data: boards }, { data: surfaces }] = await Promise.all([
    supabase.from('materials').select('id, name, dz'),
    supabase.from('benchtop_materials').select('id, name, dz'),
  ])

  const boardMaterials = new Map<string, { name: string; dz: number }>(
    ((boards ?? []) as { id: string; name: string; dz: number }[]).map(m => [m.id, m])
  )
  const surfaceMaterials = new Map<string, { name: string; dz: number }>(
    ((surfaces ?? []) as { id: string; name: string; dz: number }[]).map(m => [m.id, m])
  )

  return { benchtop: bt, method, scheduleRows, boardMaterials, surfaceMaterials }
}
