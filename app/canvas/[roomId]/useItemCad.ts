'use client'

// Item CAD (z_item_cad): the library rows, the job's pinned copies, and what each
// cabinet draws. Library edits never change a job already drawn (decision 4): the job
// draws its copy, made the first time it draws that owner; Update job (IC4) refreshes.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance, RoomAnnotation } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import {
  type LibraryCad, type JobItemCad, type ItemCadTarget, type ItemCadView,
  FRONT_TYPE_LABELS, ownerId, itemsForOwner, missingJobCopies, toItemCadItems, placeItemCad, asAnnotationRows,
  binProductName, itemFieldValues,
} from '@/src/lib/annotations/itemCad'
import { withFieldsFilled, type CadFieldValues } from '@/src/lib/annotations/blocks'
import { ownedBy, cabinetSheetOwner } from '@/src/lib/annotations/owner'
import { zoneElevRect } from './cabinetEditSvgHelpers'

/** Where item CAD can attach on a cabinet's front, in the cabinet front frame (x from
 *  the left, y down from the bottom): each bin front, and the cabinet code. */
export function cabinetItemCadTargets(cab: CabinetInstance, rp: ResolvedCabinet | undefined, defName?: string): ItemCadTarget[] {
  const out: ItemCadTarget[] = []
  const allBins: string[] = []
  for (const ds of rp?.drawer_stacks ?? []) {
    if (ds.drawer_type !== 'bin') continue
    const binId = ds.slides[0]?.slide_id
    if (binId) allBins.push(binId)
    const z = rp!.face_zones.find(f => f.row_index === ds.face_zone_row && f.col_index === ds.face_zone_col)
    if (!z) continue
    const r = zoneElevRect(z)
    out.push({ kind: 'front_type', key: 'bin', label: FRONT_TYPE_LABELS.bin, binIds: binId ? [binId] : [],
      box: { minX: r.ex, maxX: r.ex + r.ew, minY: -r.ey, maxY: -(r.ey - r.eh) } })
  }
  if (cab.cabinet_definition_id) {
    out.push({ kind: 'cabinet_def', key: cab.cabinet_definition_id, label: defName ?? 'Cabinet code', binIds: allBins,
      box: { minX: 0, maxX: cab.dx, minY: -cab.dy, maxY: 0 } })
  }
  return out
}

/** Owners hidden on this cabinet (Hide / Detach, IC2). */
export const hiddenOwners = (cab: CabinetInstance) => new Set(cab.item_cad_hidden ?? [])

/** Several of one owner on a cabinet (two bin fronts): the first is the one to edit. */
export function distinctTargets(ts: ItemCadTarget[]): ItemCadTarget[] {
  const seen = new Set<string>()
  return ts.filter(t => { const id = ownerId(t.kind, t.key); if (seen.has(id)) return false; seen.add(id); return true })
}

export function useItemCad({ projectId, projectCreatedAt, roomId, cabinets, resolvedParts, annotations, paper }: {
  projectId:     string | null
  /** The job's start: it only takes library item CAD that existed then (decision 4). */
  projectCreatedAt: string | null
  roomId:        string
  cabinets:      CabinetInstance[]
  resolvedParts: Map<string, ResolvedCabinet>
  annotations:   RoomAnnotation[]
  /** frame mm per paper mm (the room's annotation scale). */
  paper:         number
}) {
  const [lib, setLib] = useState<LibraryCad[]>([])
  // null = a room outside a job: it draws the library's current version.
  const [job, setJob] = useState<JobItemCad[] | null>(projectId ? [] : null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let off = false
    void (async () => {
      const [l, j] = await Promise.all([
        supabase.from('library_cad').select('*'),
        projectId ? supabase.from('job_item_cad').select('*').eq('project_id', projectId) : Promise.resolve({ data: null, error: null }),
      ])
      if (l.error) console.error('[item cad load]', l.error)
      if (j.error) console.error('[job item cad load]', j.error)
      if (off) return
      setLib((l.data ?? []) as LibraryCad[])
      if (projectId) setJob((j.data ?? []) as JobItemCad[])
      setLoaded(true)
    })()
    return () => { off = true }
  }, [projectId])

  // Cabinet codes (definition names) for the "this code" targets.
  const defIds = useMemo(() => [...new Set(cabinets.map(c => c.cabinet_definition_id).filter((x): x is string => !!x))].sort().join(','), [cabinets])
  const [defNames, setDefNames] = useState<Record<string, string>>({})
  useEffect(() => {
    const ids = defIds ? defIds.split(',') : []
    if (!ids.length) return
    let off = false
    void supabase.from('cabinet_definitions').select('id, name').in('id', ids).then(({ data, error }) => {
      if (error) console.error('[item cad codes]', error)
      if (!off && data) setDefNames(Object.fromEntries((data as { id: string; name: string }[]).map(d => [d.id, d.name])))
    })
    return () => { off = true }
  }, [defIds])

  const targetsFor = useCallback((c: CabinetInstance, rp: ResolvedCabinet | undefined) =>
    cabinetItemCadTargets(c, rp, c.cabinet_definition_id ? defNames[c.cabinet_definition_id] : undefined), [defNames])

  // Bin product names for {bin} (a bin's "slide" is the bin itself, z_bin_cabinet).
  const binIds = useMemo(() => [...new Set([...resolvedParts.values()].flatMap(r =>
    r.drawer_stacks.filter(s => s.drawer_type === 'bin').map(s => s.slides[0]?.slide_id).filter((x): x is string => !!x)))].sort().join(','), [resolvedParts])
  const [binNames, setBinNames] = useState<Record<string, string>>({})
  useEffect(() => {
    const ids = binIds ? binIds.split(',') : []
    if (!ids.length) return
    let off = false
    void supabase.from('hardware_slides').select('id, name, brand').in('id', ids).then(({ data, error }) => {
      if (error) console.error('[item cad bins]', error)
      if (!off && data) setBinNames(Object.fromEntries((data as { id: string; name: string | null; brand: string | null }[])
        .map(b => [b.id, binProductName(b.name, b.brand)])))
    })
    return () => { off = true }
  }, [binIds])

  /** Item field values for a cabinet, or one of its targets ({bin} = that front's bin). */
  const fieldsFor = useCallback((c: CabinetInstance, t?: ItemCadTarget, rp?: ResolvedCabinet): CadFieldValues => {
    const ids = t?.binIds ?? targetsFor(c, rp ?? resolvedParts.get(c.id)).find(x => x.kind === 'cabinet_def')?.binIds
      ?? (rp ?? resolvedParts.get(c.id))?.drawer_stacks.filter(s => s.drawer_type === 'bin').map(s => s.slides[0]?.slide_id ?? '') ?? []
    return itemFieldValues({
      code: c.cabinet_definition_id ? defNames[c.cabinet_definition_id] : null, label: c.label,
      w: c.dx, h: c.dy, d: c.dz, bins: ids.map(id => binNames[id] ?? 'Pull-out bin'),
    })
  }, [defNames, binNames, targetsFor, resolvedParts])

  const targetsByCab = useMemo(() => {
    const m = new Map<string, ItemCadTarget[]>()
    for (const c of cabinets) m.set(c.id, targetsFor(c, resolvedParts.get(c.id)))
    return m
  }, [cabinets, resolvedParts, targetsFor])

  // Pin: an owner the job draws for the first time gets the library's current version,
  // if it was in the library when the job started. Newer item CAD reaches an existing
  // job only through Update job (IC4) or a save made from inside it.
  useEffect(() => {
    if (!loaded || !projectId || !job) return
    const used = new Set<string>()
    for (const ts of targetsByCab.values()) for (const t of ts) used.add(ownerId(t.kind, t.key))
    const missing = missingJobCopies(lib, job, used, projectCreatedAt)
    if (!missing.length) return
    void (async () => {
      const { data, error } = await supabase.from('job_item_cad')
        .upsert(missing.map(l => ({ project_id: projectId, library_cad_id: l.id, version: l.version, items: l.items })),
          { onConflict: 'project_id,library_cad_id', ignoreDuplicates: true })
        .select('*')
      if (error) { console.error('[job item cad pin]', error); return }
      const added = (data ?? []) as JobItemCad[]
      if (added.length) setJob(prev => [...(prev ?? []).filter(j => !added.some(a => a.id === j.id)), ...added])
    })()
  }, [loaded, projectId, projectCreatedAt, job, lib, targetsByCab])

  /** Everything a cabinet's front draws, in its front frame, item fields filled: its own
   *  notes (Cabinet Edit modal, "this cabinet only") then the item CAD of each target it
   *  doesn't hide. */
  const frontNotes = useCallback((cab: CabinetInstance, view: ItemCadView = 'elevation'): RoomAnnotation[] => {
    const own = withFieldsFilled(annotations.filter(a => ownedBy(a, cabinetSheetOwner(cab.id, view === 'plan' ? 'top' : 'front'))), fieldsFor(cab))
    const hidden = hiddenOwners(cab)
    const placed = (targetsByCab.get(cab.id) ?? []).flatMap((t, i) => hidden.has(ownerId(t.kind, t.key)) ? [] : withFieldsFilled(
      asAnnotationRows(placeItemCad(itemsForOwner(lib, job, t.kind, t.key, view), t.box, paper), `itemcad:${cab.id}:${i}`, roomId), fieldsFor(cab, t)))
    return [...own, ...placed]
  }, [annotations, targetsByCab, lib, job, paper, roomId, fieldsFor])

  /** Library item CAD drawn on one target (what this job shows). */
  const targetItems = useCallback((t: ItemCadTarget, view: ItemCadView = 'elevation') =>
    itemsForOwner(lib, job, t.kind, t.key, view), [lib, job])

  /** Write an owner's items to the library (version + 1) and this job's copy. */
  const writeOwner = useCallback(async (t: ItemCadTarget, view: ItemCadView, items: LibraryCad['items']): Promise<string | null> => {
    const row = lib.find(l => l.owner_kind === t.kind && l.owner_key === t.key && l.view === view)
    const res = row
      ? await supabase.from('library_cad').update({ items, version: row.version + 1, updated_at: new Date().toISOString() }).eq('id', row.id).select('*').single()
      : await supabase.from('library_cad').insert({ owner_kind: t.kind, owner_key: t.key, view, items }).select('*').single()
    if (res.error || !res.data) {
      console.error('[item cad save]', res.error)
      return res.error?.code === '42501' || /row-level security/i.test(res.error?.message ?? '')
        ? 'Only admins can change the library.' : 'Couldn’t save to the library.'
    }
    const saved = res.data as LibraryCad
    setLib(prev => [...prev.filter(l => l.id !== saved.id), saved])
    if (projectId) {
      const j = await supabase.from('job_item_cad')
        .upsert({ project_id: projectId, library_cad_id: saved.id, version: saved.version, items: saved.items, updated_at: new Date().toISOString() },
          { onConflict: 'project_id,library_cad_id' })
        .select('*').single()
      if (j.error) console.error('[job item cad save]', j.error)
      else setJob(prev => [...(prev ?? []).filter(x => x.id !== (j.data as JobItemCad).id), j.data as JobItemCad])
    }
    return null
  }, [lib, projectId])

  /** Move drawn notes into the library on a target (appended to what it has). */
  const saveToLibrary = useCallback(async (t: ItemCadTarget, notes: RoomAnnotation[], view: ItemCadView = 'elevation') => {
    const row = lib.find(l => l.owner_kind === t.kind && l.owner_key === t.key && l.view === view)
    return writeOwner(t, view, [...(row?.items ?? []), ...toItemCadItems(notes, t.box, paper)])
  }, [lib, paper, writeOwner])

  /** Clear an owner's item CAD (jobs already drawn keep their copies). */
  const clearOwner = useCallback((t: ItemCadTarget, view: ItemCadView = 'elevation') => writeOwner(t, view, []), [writeOwner])

  return { lib, job, loaded, targetsByCab, targetsFor, fieldsFor, frontNotes, targetItems, saveToLibrary, clearOwner }
}

export type ItemCadApi = ReturnType<typeof useItemCad>
