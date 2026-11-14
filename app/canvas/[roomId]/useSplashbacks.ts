'use client'

// Splashbacks on the canvas (z_splashback S2): catalog (schedules + both
// material libraries + the inherit setting), per-piece effective material and
// thickness, and create / update / delete with undo snapshots.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import { confirmDelete } from '@/src/components/ConfirmDeleteModal'
import type { BenchtopInstance, BenchtopScheduleRow, Project, Room, SplashbackInstance } from '@/src/lib/types'
import {
  effectiveSplashbackRows, benchtopPanelMaterial, pickSplashbackScheduleId, type SplashbackMaterialRow,
} from '@/src/lib/splashbackMaterials'
import { sbBounds } from '@/src/lib/splashbackGeometry'
import type { Selected } from './canvasTypes'

type MatRef = Omit<SplashbackMaterialRow, 'source'>
type SchedRow = MatRef & { schedule_id: string }
interface Surface { id: string; name: string; dz: number; material_type: string | null; color: string | null }
interface Board { id: string; name: string; dz: number }

/** What a splashback is made of, for drawing + the panel. */
export interface SbInfo {
  /** Panel material name, or null when nothing resolves. */
  name: string | null
  /** Surface type (stone, glass, tile, mirror, acrylic, timber…) or 'board'. */
  kind: string
  /** Panel thickness drawn (override, else the material, else 20). */
  thick: number
  /** Board panel = cut part; surface = supply only (L5). */
  isBoard: boolean
  /** Where the panel material came from. */
  source: SplashbackMaterialRow['source'] | null
  scheduleId: string | null
}

export function useSplashbacks(args: {
  room: Room
  project: Project | null
  splashbacks: SplashbackInstance[]
  setSplashbacks: React.Dispatch<React.SetStateAction<SplashbackInstance[]>>
  benchtops: BenchtopInstance[]
  /** The benchtop schedule rows a top is made from (useBenchtopCatalog). */
  btRowsFor: (bt: BenchtopInstance) => BenchtopScheduleRow[]
  captureSnapshot: () => void
  setSelected: (s: Selected) => void
}) {
  const { room, project, splashbacks, setSplashbacks, benchtops, btRowsFor, captureSnapshot, setSelected } = args
  const [schedules, setSchedules] = useState<{ id: string; name: string; is_default: boolean }[]>([])
  const [rows, setRows] = useState<SchedRow[]>([])
  const [jobOvr, setJobOvr] = useState<MatRef[]>([])
  const [roomOvr, setRoomOvr] = useState<MatRef[]>([])
  const [shop, setShop] = useState<{ splashback_schedule_id: string | null; splashback_inherits_benchtop: boolean }>({ splashback_schedule_id: null, splashback_inherits_benchtop: true })
  const projectId = project?.id ?? null
  const [surfaces, setSurfaces] = useState<Map<string, Surface>>(new Map())
  const [boards, setBoards] = useState<Map<string, Board>>(new Map())

  useEffect(() => {
    let live = true
    void Promise.all([
      supabase.from('splashback_schedules').select('id, name, is_default').eq('active', true).order('name'),
      supabase.from('splashback_schedule_rows').select('schedule_id, part_role, material_id, benchtop_material_id, edgeband_id'),
      projectId ? supabase.from('job_splashback_materials').select('part_role, material_id, benchtop_material_id, edgeband_id').eq('project_id', projectId) : Promise.resolve({ data: [] }),
      supabase.from('room_splashback_materials').select('part_role, material_id, benchtop_material_id, edgeband_id').eq('room_id', room.id),
      supabase.from('shop_settings').select('splashback_schedule_id, splashback_inherits_benchtop').limit(1).maybeSingle(),
      supabase.from('benchtop_materials').select('id, name, dz, material_type, color'),
      supabase.from('materials').select('id, name, dz'),
    ]).then(([s, r, j, rm, sh, bm, m]) => {
      if (!live) return
      setSchedules((s.data ?? []) as { id: string; name: string; is_default: boolean }[])
      setRows((r.data ?? []) as SchedRow[])
      setJobOvr((j.data ?? []) as MatRef[])
      setRoomOvr((rm.data ?? []) as MatRef[])
      if (sh.data) setShop(sh.data as typeof shop)
      setSurfaces(new Map(((bm.data ?? []) as Surface[]).map(x => [x.id, { ...x, dz: Number(x.dz) }])))
      setBoards(new Map(((m.data ?? []) as Board[]).map(x => [x.id, { ...x, dz: Number(x.dz) }])))
    })
    return () => { live = false }
  }, [room.id, projectId])

  /** The benchtop a splashback sits on: one on the same wall that overlaps it, else any top in the room. */
  const benchUnder = useCallback((sb: SplashbackInstance) => {
    const onWall = benchtops.filter(b => b.wall_id === sb.wall_id)
    return onWall[0] ?? benchtops[0] ?? null
  }, [benchtops])

  const infoFor = useCallback((sb: SplashbackInstance): SbInfo => {
    const scheduleId = pickSplashbackScheduleId(
      sb.splashback_schedule_id, room.splashback_schedule_id, project?.splashback_schedule_id,
      shop.splashback_schedule_id, schedules.find(x => x.is_default)?.id,
    )
    const bt = benchUnder(sb)
    const eff = effectiveSplashbackRows({
      scheduleRows: rows.filter(r => r.schedule_id === scheduleId),
      jobOverrides: jobOvr, roomOverrides: roomOvr,
      inheritBenchtop: shop.splashback_inherits_benchtop,
      benchtopPanel: bt ? benchtopPanelMaterial(btRowsFor(bt)) : null,
    })
    const panel = eff.find(r => r.part_role === 'panel')
    const board = panel?.material_id ? boards.get(panel.material_id) : undefined
    const surf = panel?.benchtop_material_id ? surfaces.get(panel.benchtop_material_id) : undefined
    const matDz = board?.dz ?? surf?.dz
    return {
      name: board?.name ?? surf?.name ?? null,
      kind: board ? 'board' : (surf?.material_type ?? 'stone'),
      thick: Number(sb.thickness_mm) || matDz || 20,
      isBoard: !!board,
      source: panel?.source ?? null,
      scheduleId,
    }
  }, [rows, jobOvr, roomOvr, shop, schedules, boards, surfaces, benchUnder, btRowsFor, room.splashback_schedule_id, project?.splashback_schedule_id])

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async function create(d: Pick<SplashbackInstance, 'wall_id' | 'wall_side' | 'segments'>) {
    captureSnapshot()
    const row = {
      room_id: room.id,
      label: `Splashback ${splashbacks.length + 1}`,
      ...d,
      cutouts: [], offset_mm: 0, thickness_mm: null, opening_reveal_mm: 0,
      splashback_schedule_id: null, notes: null,
    }
    const { data, error } = await supabase.from('splashback_instances').insert(row).select().single()
    if (error || !data) { console.error('Failed to create splashback:', error); return null }
    const sb = data as SplashbackInstance
    setSplashbacks(s => [...s, sb])
    setSelected({ type: 'splashback', id: sb.id })
    return sb
  }

  async function update(id: string, u: Partial<SplashbackInstance>, snapshot = true) {
    if (snapshot) captureSnapshot()
    const patch = { ...u, updated_at: new Date().toISOString() }
    setSplashbacks(s => s.map(x => x.id === id ? { ...x, ...patch } : x))
    const { error } = await supabase.from('splashback_instances').update(patch).eq('id', id)
    if (error) console.error('Failed to save splashback:', error)
  }

  async function remove(id: string) {
    if (!(await confirmDelete({ title: 'Delete Splashback', message: 'Delete this splashback?' }))) return
    captureSnapshot()
    setSplashbacks(s => s.filter(x => x.id !== id))
    setSelected(null)
    await supabase.from('splashback_instances').delete().eq('id', id)
  }

  /** Overall size text, e.g. "3872 × 700". */
  const sizeOf = (sb: SplashbackInstance) => {
    const b = sbBounds(sb.segments)
    return b ? `${Math.round(b.x1 - b.x0)} × ${Math.round(b.z1 - b.z0)}` : ''
  }

  const scheduleOptions = useMemo(() => schedules, [schedules])

  return { infoFor, create, update, remove, sizeOf, scheduleOptions }
}
