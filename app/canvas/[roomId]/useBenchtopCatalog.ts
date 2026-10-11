'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { BenchtopBuildMethod, BenchtopEdgeProfile, BenchtopInstance, BenchtopScheduleRow, Project, Room } from '@/src/lib/types'

/** Display thickness of a top (elevation / 3D): `total` = finished edge, `top` = the worktop itself. */
export interface BtThickness { total: number; top: number; buildUp: boolean }

// Build methods + edge profiles for the plan canvas (benchtop Phase 3):
// edge colours / codes on the plan, the Shape Editor profile picker and the
// BenchtopPanel edge list. Phase 3b adds the schedules + material thicknesses
// so elevation / 3D can draw a top at its real thickness. Loaded once per canvas.
export function useBenchtopCatalog(room: Room, project: Project | null) {
  const [methods, setMethods] = useState<BenchtopBuildMethod[]>([])
  const [profiles, setProfiles] = useState<BenchtopEdgeProfile[]>([])
  const [schedules, setSchedules] = useState<{ id: string; is_default: boolean }[]>([])
  const [rows, setRows] = useState<BenchtopScheduleRow[]>([])
  const [boardDz, setBoardDz] = useState<Map<string, number>>(new Map())
  const [surfaceDz, setSurfaceDz] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    let live = true
    void Promise.all([
      supabase.from('benchtop_build_methods').select('*').eq('active', true).order('name'),
      supabase.from('benchtop_edge_profiles').select('*').order('category').order('sort_order').order('name'),
      supabase.from('benchtop_schedules').select('id, is_default'),
      supabase.from('benchtop_schedule_rows').select('*'),
      supabase.from('benchtop_materials').select('id, dz'),
    ]).then(async ([m, p, s, r, bm]) => {
      if (!live) return
      setMethods((m.data ?? []) as BenchtopBuildMethod[])
      setProfiles((p.data ?? []) as BenchtopEdgeProfile[])
      setSchedules((s.data ?? []) as { id: string; is_default: boolean }[])
      const rowList = (r.data ?? []) as BenchtopScheduleRow[]
      setRows(rowList)
      setSurfaceDz(new Map(((bm.data ?? []) as { id: string; dz: number }[]).map(x => [x.id, Number(x.dz)])))
      // Board thickness only for the boards the schedules use (materials is big).
      const ids = [...new Set(rowList.map(x => x.material_id).filter((x): x is string => !!x))]
      if (!ids.length) return
      const { data } = await supabase.from('materials').select('id, dz').in('id', ids)
      if (live) setBoardDz(new Map(((data ?? []) as { id: string; dz: number }[]).map(x => [x.id, Number(x.dz)])))
    })
    return () => { live = false }
  }, [])

  const profileById = useMemo(() => Object.fromEntries(profiles.map(p => [p.id, p])), [profiles])

  // Same cascade as loadBenchtopInput: benchtop → room → job → shop default.
  const methodFor = useCallback((bt: BenchtopInstance): BenchtopBuildMethod | null => {
    const id = bt.benchtop_build_method_id ?? room.benchtop_build_method_id ?? project?.benchtop_build_method_id ?? null
    return (id ? methods.find(m => m.id === id) : undefined) ?? methods.find(m => m.is_default) ?? null
  }, [methods, room.benchtop_build_method_id, project?.benchtop_build_method_id])

  const defaultProfileIdFor = useCallback(
    (bt: BenchtopInstance) => methodFor(bt)?.default_edge_profile_id ?? null,
    [methodFor],
  )

  // Schedule cascade as loadBenchtopInput (benchtop → method → room → job →
  // shop default); thickness rules as the resolver's worktop + build-up. Job /
  // room per-role material overrides are not applied here (display only).
  const thicknessFor = useCallback((bt: BenchtopInstance): BtThickness => {
    const method = methodFor(bt)
    const schedId = bt.benchtop_schedule_id ?? method?.default_schedule_id ?? room.benchtop_schedule_id
      ?? project?.benchtop_schedule_id ?? schedules.find(s => s.is_default)?.id ?? null
    const row = (role: string) => rows.find(r => r.schedule_id === schedId && r.part_role === role)
    const thick = (r: BenchtopScheduleRow | undefined, fallback: number) =>
      (r?.material_id ? boardDz.get(r.material_id) : r?.benchtop_material_id ? surfaceDz.get(r.benchtop_material_id) : undefined) || fallback
    const top = thick(row('worktop_panel'), method?.construction === 'outsourced' ? 20 : 33)
    switch (method?.construction) {
      case 'buildup_flat':     return { total: top + thick(row('buildup_rail'), top), top, buildUp: true }
      case 'buildup_vertical': return { total: top + (Number(method.buildup_rail_depth) || top), top, buildUp: true }
      default:                 return { total: top, top, buildUp: false }
    }
  }, [methodFor, rows, schedules, boardDz, surfaceDz, room.benchtop_schedule_id, project?.benchtop_schedule_id])

  return { methods, profiles, profileById, methodFor, defaultProfileIdFor, thicknessFor }
}
