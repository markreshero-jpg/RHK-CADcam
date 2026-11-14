'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/src/lib/supabase'
import { topThickness, topRow } from '@/src/lib/benchtop-resolver/resolver'
import { tapeApplies } from '@/src/lib/benchtopEdgeband'
import { isBuildUp } from '@/src/lib/benchtop-resolver/construction'
import type { BenchtopBuildMethod, BenchtopEdgeProfile, BenchtopInstance, BenchtopScheduleRow, Project, Room } from '@/src/lib/types'

/** Display thickness of a top (elevation / 3D): `total` = finished edge, `top` = the worktop itself. */
export interface BtThickness { total: number; top: number; buildUp: boolean }

/** An edge tape from the catalogue (edge_banding). */
export interface BtTape { id: string; name: string; thickness: number; width: number | null; color: string | null }
/** Edge tape for one top (Phase 7): applies = in-house board top; defaultTape = its schedule row's tape. */
export interface BtTapeContext { applies: boolean; defaultTape: string | null }

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
  // Display colours (z_benchtop_colours C1): surface material `color`, board `face_colour`.
  const [surfaceCol, setSurfaceCol] = useState<Map<string, string>>(new Map())
  const [boardCol, setBoardCol] = useState<Map<string, string>>(new Map())
  // Job / room per-role material overrides (as loadBenchtopInput): room id → rows, '' = job level.
  const [overrides, setOverrides] = useState<Map<string, BtOverride[]>>(new Map())
  const [tapes, setTapes] = useState<BtTape[]>([])

  useEffect(() => {
    let live = true
    void Promise.all([
      supabase.from('benchtop_build_methods').select('*').eq('active', true).order('name'),
      supabase.from('benchtop_edge_profiles').select('*').order('category').order('sort_order').order('name'),
      supabase.from('benchtop_schedules').select('id, is_default'),
      supabase.from('benchtop_schedule_rows').select('*'),
      supabase.from('benchtop_materials').select('id, dz, color'),
      supabase.from('edge_banding').select('id, name, thickness, width, color').eq('active', true).order('name'),
    ]).then(async ([m, p, s, r, bm, eb]) => {
      if (!live) return
      setTapes(((eb.data ?? []) as BtTape[]).map(t => ({ ...t, thickness: Number(t.thickness), width: t.width == null ? null : Number(t.width) })))
      setMethods((m.data ?? []) as BenchtopBuildMethod[])
      setProfiles((p.data ?? []) as BenchtopEdgeProfile[])
      setSchedules((s.data ?? []) as { id: string; is_default: boolean }[])
      const rowList = (r.data ?? []) as BenchtopScheduleRow[]
      setRows(rowList)
      const surf = (bm.data ?? []) as { id: string; dz: number; color: string | null }[]
      setSurfaceDz(new Map(surf.map(x => [x.id, Number(x.dz)])))
      setSurfaceCol(new Map(surf.filter(x => x.color).map(x => [x.id, x.color!])))
      // Job / room overrides for this job (every room of it — the job reports draw other rooms).
      const pid = project?.id
      const ovr = new Map<string, BtOverride[]>()
      if (pid) {
        const { data: rms } = await supabase.from('rooms').select('id').eq('project_id', pid)
        const roomIds = ((rms ?? []) as { id: string }[]).map(r => r.id)
        const [jo, ro] = await Promise.all([
          supabase.from('job_benchtop_materials').select('part_role, material_id, benchtop_material_id').eq('project_id', pid),
          roomIds.length
            ? supabase.from('room_benchtop_materials').select('room_id, part_role, material_id, benchtop_material_id').in('room_id', roomIds)
            : Promise.resolve({ data: [] }),
        ])
        ovr.set('', (jo.data ?? []) as BtOverride[])
        for (const o of (ro.data ?? []) as (BtOverride & { room_id: string })[]) ovr.set(o.room_id, [...(ovr.get(o.room_id) ?? []), o])
      }
      if (!live) return
      setOverrides(ovr)
      // Board thickness + colour only for the boards the schedules / overrides use (materials is big).
      const ids = [...new Set([...rowList.map(x => x.material_id), ...[...ovr.values()].flat().map(x => x.material_id)]
        .filter((x): x is string => !!x))]
      if (!ids.length) return
      const { data } = await supabase.from('materials').select('id, dz, face_colour').in('id', ids)
      if (!live) return
      const boards = (data ?? []) as { id: string; dz: number; face_colour: string | null }[]
      setBoardDz(new Map(boards.map(x => [x.id, Number(x.dz)])))
      setBoardCol(new Map(boards.filter(x => x.face_colour).map(x => [x.id, x.face_colour!])))
    })
    return () => { live = false }
  }, [project?.id])

  const profileById = useMemo(() => Object.fromEntries(profiles.map(p => [p.id, p])), [profiles])

  // The cascades below for any room of the job — the job reports draw other
  // rooms' tops (shop drawings) with that room's method / schedule.
  const forRoom = useCallback((rm: Pick<Room, 'id' | 'benchtop_build_method_id' | 'benchtop_schedule_id'>) => {
    // Same cascade as loadBenchtopInput: benchtop → room → job → shop default.
    const methodFor = (bt: BenchtopInstance): BenchtopBuildMethod | null => {
      const id = bt.benchtop_build_method_id ?? rm.benchtop_build_method_id ?? project?.benchtop_build_method_id ?? null
      return (id ? methods.find(m => m.id === id) : undefined) ?? methods.find(m => m.is_default) ?? null
    }
    // Schedule cascade as loadBenchtopInput (benchtop → method → room → job →
    // shop default); thickness rule shared with the resolver (topThickness), so
    // the canvas draws exactly what the parts list cuts. Job → room per-role
    // material overrides are laid over the rows as loadBenchtopInput does (room wins).
    const scheduleRowsFor = (bt: BenchtopInstance) => {
      const method = methodFor(bt)
      const schedId = bt.benchtop_schedule_id ?? method?.default_schedule_id ?? rm.benchtop_schedule_id
        ?? project?.benchtop_schedule_id ?? schedules.find(s => s.is_default)?.id ?? null
      return applyOverrides(rows.filter(r => r.schedule_id === schedId), [...(overrides.get('') ?? []), ...(overrides.get(rm.id) ?? [])])
    }
    const thicknessFor = (bt: BenchtopInstance): BtThickness => {
      const method = methodFor(bt)
      const sched = scheduleRowsFor(bt)
      if (!method) return { top: 33, total: 33, buildUp: false }
      const asMat = (m: Map<string, number>) => new Map([...m].map(([k, dz]) => [k, { name: '', dz }]))
      const t = topThickness(method, sched, asMat(boardDz), asMat(surfaceDz))
      return { ...t, buildUp: isBuildUp(method.construction) }
    }
    const defaultProfileIdFor = (bt: BenchtopInstance) => methodFor(bt)?.default_edge_profile_id ?? null
    // Display colour of the top (z_benchtop_colours C1): the colour of what the worktop /
    // stone slab is made of — stone `color`, else the board's face colour. Null = none set.
    const colourFor = (bt: BenchtopInstance): string | null => {
      const method = methodFor(bt)
      const top = method ? topRow(method, scheduleRowsFor(bt)) : undefined
      if (!top) return null
      return (top.benchtop_material_id ? surfaceCol.get(top.benchtop_material_id) : undefined)
        ?? (top.material_id ? boardCol.get(top.material_id) : undefined) ?? null
    }
    return { methodFor, scheduleRowsFor, thicknessFor, defaultProfileIdFor, colourFor }
  }, [methods, rows, schedules, boardDz, surfaceDz, surfaceCol, boardCol, overrides, project?.benchtop_build_method_id, project?.benchtop_schedule_id])

  const here = useMemo(() => forRoom(room), [forRoom, room])
  const { methodFor, scheduleRowsFor, thicknessFor, defaultProfileIdFor, colourFor } = here

  // Same rule as the resolver: tape only on in-house board tops; the default
  // is the tape on the schedule row the top is made from.
  const tapeContextFor = useCallback((bt: BenchtopInstance): BtTapeContext => {
    const method = methodFor(bt)
    const top = method ? topRow(method, scheduleRowsFor(bt)) : undefined
    const applies = tapeApplies(method, top)
    return { applies, defaultTape: applies ? top?.edgeband_id ?? null : null }
  }, [methodFor, scheduleRowsFor])

  return { methods, profiles, profileById, methodFor, defaultProfileIdFor, thicknessFor, colourFor, scheduleRowsFor, tapes, tapeContextFor, forRoom }
}

type BtOverride = { part_role: BenchtopScheduleRow['part_role']; material_id: string | null; benchtop_material_id: string | null }

/** Per-role overrides laid over a schedule's rows — the same rule as loadBenchtopInput. */
function applyOverrides(rows: BenchtopScheduleRow[], ovrs: BtOverride[]): BenchtopScheduleRow[] {
  if (!ovrs.length) return rows
  const byRole = new Map(rows.map(r => [r.part_role, r]))
  for (const o of ovrs) {
    if (!o.material_id && !o.benchtop_material_id) continue
    const ex = byRole.get(o.part_role)
    byRole.set(o.part_role, {
      id: ex?.id ?? `override-${o.part_role}`, schedule_id: ex?.schedule_id ?? '', part_role: o.part_role,
      material_id: o.material_id ?? ex?.material_id ?? null,
      benchtop_material_id: o.benchtop_material_id ?? ex?.benchtop_material_id ?? null,
      edgeband_id: ex?.edgeband_id ?? null,
    })
  }
  return [...byRole.values()]
}
