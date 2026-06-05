'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'
import { ThemeToggle } from '../../ThemeToggle'

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'assembly',        label: 'Assembly',             table: 'assembly_schedules',       type: 'asm_grid',   valueCol: null,          ebCol: null           },
  { key: 'toekick',         label: 'Toe Kick',             table: 'toekick_schedules',         type: 'tk_list',    valueCol: null,          ebCol: null           },
  { key: 'front',           label: 'Door & Drawer Fronts', table: 'front_schedules',           type: 'front_list', valueCol: null,          ebCol: null           },
  { key: 'drawerbox',       label: 'Drawer Box',           table: 'drawerbox_schedules',       type: 'db_list',    valueCol: null,          ebCol: null           },
  { key: 'inner_drawerbox', label: 'Inner Drawer Box',     table: 'inner_drawerbox_schedules', type: 'idb_list',   valueCol: null,          ebCol: null           },
  { key: 'hinge',           label: 'Hinges',               table: 'hinge_schedules',           type: 'hw_single',  valueCol: 'hinge_id',   ebCol: null           },
  { key: 'slide',           label: 'Slides',               table: 'slide_schedules',           type: 'slide_grid', valueCol: null,         ebCol: null           },
  { key: 'handle',          label: 'Handles',              table: 'handle_schedules',          type: 'hw_single',  valueCol: 'handle_id',  ebCol: null           },
  { key: 'benchtop',        label: 'Benchtops',            table: 'benchtop_schedules',        type: 'bt_roles',   valueCol: null,          ebCol: null          },
] as const

type SchedKey = typeof TABS[number]['key']

// ── Row editor config ─────────────────────────────────────────────────────────

const ASM_ROLES = [
  { key: 'interior',         label: 'Interior' },
  { key: 'exposed_interior', label: 'Exp. Interior' },
  { key: 'shelf',            label: 'Shelf' },
  { key: 'end_panel',        label: 'End Panel' },
]
const TK_ROLES = [
  { key: 'face',     label: 'Face',     desc: 'Visible front face' },
  { key: 'interior', label: 'Interior', desc: 'Structural members' },
]
const BT_ROLES = [
  { key: 'worktop_panel',        label: 'Worktop Panel',     desc: 'Main surface',               source: 'benchtop', hasEb: false },
  { key: 'stone_slab',           label: 'Stone Slab',        desc: 'Full-thickness stone panel',  source: 'benchtop', hasEb: false },
  { key: 'buildup_rail',         label: 'Build-Up Rail',     desc: 'Perimeter framing strips',    source: 'board',    hasEb: true  },
  { key: 'buildup_cross_member', label: 'Cross Member',      desc: 'Internal support members',    source: 'board',    hasEb: false },
  { key: 'subtop',               label: 'Substrate',         desc: 'Under-stone substrate',       source: 'board',    hasEb: false },
  { key: 'drop_front_fascia',    label: 'Drop Front Fascia', desc: 'Exposed front face',          source: 'board',    hasEb: true  },
  { key: 'side_fascia',          label: 'Side Fascia',       desc: 'Exposed end face',            source: 'board',    hasEb: true  },
  { key: 'back_fascia',          label: 'Back Fascia',       desc: 'Exposed back (islands)',      source: 'board',    hasEb: true  },
] as const
const CLASSES = ['base', 'wall', 'tall'] as const

// ── Types ─────────────────────────────────────────────────────────────────────

type SchedRecord = {
  id: string
  name: string
  description: string | null
  is_default: boolean
  active: boolean
  [key: string]: unknown
}

type MatItem       = { id: string; name: string; dz: number }
type BenchtopItem  = { id: string; name: string; dz: number; material_type: string | null }
type HwItem        = { id: string; name: string; brand: string | null }
type HwSlideItem   = { id: string; name: string; brand: string | null; nominal_length: number | null; box_height: number | null }
type SlideEntryRow = { id: string; depth_threshold: number; height_threshold: number; slide_id: string }
type EbItem        = { id: string; name: string; thickness: number; material_match_id: string | null }

// rowData keys:
//   assembly:  `${cls}|${role}`     → material_id   `${cls}|${role}|eb`  → edgeband_id
//   toekick:   `${role}`            → material_id   `${role}|eb`         → edgeband_id
//   front:     `${cls}`             → material_id   `${cls}|eb`          → edgeband_id

// ── Component ─────────────────────────────────────────────────────────────────

export default function SchedulesClient({ embedded }: { embedded?: boolean }) {
  const [loading,      setLoading]      = useState(true)
  const [materials,    setMaterials]    = useState<MatItem[]>([])
  const [edgebands,    setEdgebands]    = useState<EbItem[]>([])
  const [benchtopMats, setBenchtopMats] = useState<BenchtopItem[]>([])
  const [hinges,        setHinges]        = useState<HwItem[]>([])
  const [hingePlates,   setHingePlates]   = useState<{ id: string; name: string; hinge_id: string }[]>([])
  const [slides,        setSlides]        = useState<HwSlideItem[]>([])
  const [handles,       setHandles]       = useState<HwItem[]>([])
  const [schedLists,    setSchedLists]    = useState<Partial<Record<SchedKey, SchedRecord[]>>>({})
  const [activeTab,     setActiveTab]     = useState<SchedKey>('assembly')
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [editName,      setEditName]      = useState('')
  const [editDesc,      setEditDesc]      = useState('')
  const [newName,       setNewName]       = useState('')
  const [creating,      setCreating]      = useState(false)
  const [rowData,       setRowData]       = useState<Record<string, string>>({})
  const [rowsLoading,   setRowsLoading]   = useState(false)
  const [createError,   setCreateError]   = useState<string | null>(null)
  const [slideEntries,  setSlideEntries]  = useState<SlideEntryRow[]>([])
  const [addingInDepth, setAddingInDepth] = useState<Record<number, { height: string; slideId: string }>>({})
  const [newTierDepth,  setNewTierDepth]  = useState('')
  const [newTierHeight, setNewTierHeight] = useState('')
  const [newTierSlide,  setNewTierSlide]  = useState('')

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [
        asmR, tkR, frR, dbR, idbR, hiR, slR, haR, btR,
        matsR, ebR, btMatsR, hingesR, slidesR, handlesR, platesR,
      ] = await Promise.all([
        supabase.from('assembly_schedules').select('id,name,description,is_default,active').order('name'),
        supabase.from('toekick_schedules').select('id,name,description,is_default,active').order('name'),
        supabase.from('front_schedules').select('id,name,description,is_default,active').order('name'),
        supabase.from('drawerbox_schedules').select('id,name,description,is_default,active,material_id,edgeband_id,bottom_material_id,bottom_edgeband_id').order('name'),
        supabase.from('inner_drawerbox_schedules').select('id,name,description,is_default,active,material_id,edgeband_id,bottom_material_id,bottom_edgeband_id,front_material_id,front_edgeband_id').order('name'),
        supabase.from('hinge_schedules').select('id,name,description,is_default,active,hinge_id,hinge_plate_id').order('name'),
        supabase.from('slide_schedules').select('id,name,description,is_default,active').order('name'),
        supabase.from('handle_schedules').select('id,name,description,is_default,active,handle_id').order('name'),
        supabase.from('benchtop_schedules').select('id,name,description,is_default,active,benchtop_id').order('name'),
        supabase.from('materials').select('id,name,dz').eq('active', true).order('name'),
        supabase.from('edge_banding').select('id,name,thickness,material_match_id').eq('active', true).order('name'),
        supabase.from('benchtop_materials').select('id,name,dz,material_type').eq('active', true).order('name'),
        supabase.from('hardware_hinges').select('id,name,brand').eq('active', true).order('name'),
        supabase.from('hardware_slides').select('id,name,brand,nominal_length,box_height').eq('active', true).order('name'),
        supabase.from('hardware_handles').select('id,name,brand').eq('active', true).order('name'),
        supabase.from('hardware_hinge_plates').select('id,name,hinge_id').eq('active', true).order('name'),
      ])
      if (cancelled) return

      setSchedLists({
        assembly:        (asmR.data  ?? []) as SchedRecord[],
        toekick:         (tkR.data   ?? []) as SchedRecord[],
        front:           (frR.data   ?? []) as SchedRecord[],
        drawerbox:       (dbR.data   ?? []) as SchedRecord[],
        inner_drawerbox: (idbR.data  ?? []) as SchedRecord[],
        hinge:           (hiR.data   ?? []) as SchedRecord[],
        slide:           (slR.data   ?? []) as SchedRecord[],
        handle:          (haR.data   ?? []) as SchedRecord[],
        benchtop:        (btR.data   ?? []) as SchedRecord[],
      })
      setMaterials((matsR.data    ?? []) as MatItem[])
      setEdgebands((ebR.data      ?? []) as EbItem[])
      setBenchtopMats((btMatsR.data ?? []) as BenchtopItem[])
      setHinges((hingesR.data  ?? []) as HwItem[])
      setHingePlates((platesR.data ?? []) as { id: string; name: string; hinge_id: string }[])
      setSlides((slidesR.data  ?? []) as HwSlideItem[])
      setHandles((handlesR.data ?? []) as HwItem[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Edgeband filter helper ────────────────────────────────────────────────
  // Returns bandings matching the given material, or all bandings if none match.

  function ebOpts(matId: string): EbItem[] {
    if (!matId) return edgebands
    const matched = edgebands.filter(eb => eb.material_match_id === matId)
    return matched.length > 0 ? matched : edgebands
  }

  // ── Select ────────────────────────────────────────────────────────────────

  async function selectSchedule(id: string) {
    const tab  = TABS.find(t => t.key === activeTab)!
    const list = schedLists[activeTab] ?? []
    const s    = list.find(s => s.id === id)
    if (!s) return
    setSelectedId(id)
    setEditName(s.name)
    setEditDesc(s.description ?? '')
    setRowData({})
    setSlideEntries([])
    setAddingInDepth({})
    if (tab.type === 'asm_grid' || tab.type === 'tk_list' || tab.type === 'front_list' || tab.type === 'bt_roles') {
      setRowsLoading(true)
      const rows = await fetchRows(tab.type, id)
      setRowData(rows)
      setRowsLoading(false)
    } else if (tab.type === 'slide_grid') {
      setRowsLoading(true)
      const { data } = await supabase
        .from('slide_schedule_entries')
        .select('id, depth_threshold, height_threshold, slide_id')
        .eq('schedule_id', id)
        .order('depth_threshold')
        .order('height_threshold')
      setSlideEntries((data ?? []) as SlideEntryRow[])
      setRowsLoading(false)
    }
  }

  async function fetchRows(type: string, schedId: string): Promise<Record<string, string>> {
    const map: Record<string, string> = {}
    if (type === 'asm_grid') {
      const { data } = await supabase
        .from('assembly_schedule_rows')
        .select('assembly_class,material_role,material_id,edgeband_id')
        .eq('schedule_id', schedId)
      for (const r of (data ?? []) as { assembly_class: string; material_role: string; material_id: string; edgeband_id: string | null }[]) {
        map[`${r.assembly_class}|${r.material_role}`]       = r.material_id
        if (r.edgeband_id) map[`${r.assembly_class}|${r.material_role}|eb`] = r.edgeband_id
      }
    } else if (type === 'tk_list') {
      const { data } = await supabase
        .from('toekick_schedule_rows')
        .select('part_role,material_id,edgeband_id')
        .eq('schedule_id', schedId)
      for (const r of (data ?? []) as { part_role: string; material_id: string; edgeband_id: string | null }[]) {
        map[r.part_role]          = r.material_id
        if (r.edgeband_id) map[`${r.part_role}|eb`] = r.edgeband_id
      }
    } else if (type === 'front_list') {
      const { data } = await supabase
        .from('front_schedule_rows')
        .select('assembly_class,material_id,edgeband_id')
        .eq('schedule_id', schedId)
      for (const r of (data ?? []) as { assembly_class: string; material_id: string; edgeband_id: string | null }[]) {
        map[r.assembly_class]          = r.material_id
        if (r.edgeband_id) map[`${r.assembly_class}|eb`] = r.edgeband_id
      }
    } else if (type === 'bt_roles') {
      const { data } = await supabase
        .from('benchtop_schedule_rows')
        .select('part_role,material_id,benchtop_material_id,edgeband_id')
        .eq('schedule_id', schedId)
      for (const r of (data ?? []) as { part_role: string; material_id: string | null; benchtop_material_id: string | null; edgeband_id: string | null }[]) {
        const matId = r.material_id ?? r.benchtop_material_id
        if (matId) map[r.part_role] = matId
        if (r.edgeband_id) map[`${r.part_role}|eb`] = r.edgeband_id
      }
    }
    return map
  }

  // ── Tab change ────────────────────────────────────────────────────────────

  function changeTab(key: SchedKey) {
    setActiveTab(key)
    setSelectedId(null)
    setRowData({})
    setSlideEntries([])
    setAddingInDepth({})
    setNewTierDepth('')
    setNewTierHeight('')
    setNewTierSlide('')
    setNewName('')
    setCreateError(null)
  }

  // ── Create / delete ───────────────────────────────────────────────────────

  async function createSchedule() {
    const name = newName.trim()
    if (!name || creating) return
    const tab = TABS.find(t => t.key === activeTab)!
    setCreating(true)
    setCreateError(null)
    const { data, error } = await supabase.from(tab.table).insert({ name, is_default: false, active: true }).select().single()
    setCreating(false)
    if (error) { setCreateError(error.message); return }
    if (!data) return
    const newSched = data as SchedRecord
    setSchedLists(prev => ({ ...prev, [activeTab]: [newSched, ...(prev[activeTab] ?? [])] }))
    setNewName('')
    setSelectedId(newSched.id)
    setEditName(newSched.name)
    setEditDesc('')
    setRowData({})
  }

  async function deleteSchedule(id: string) {
    if (!confirm('Delete this schedule?')) return
    const tab = TABS.find(t => t.key === activeTab)!
    await supabase.from(tab.table).delete().eq('id', id)
    setSchedLists(prev => ({ ...prev, [activeTab]: (prev[activeTab] ?? []).filter(s => s.id !== id) }))
    if (selectedId === id) { setSelectedId(null); setRowData({}) }
  }

  // ── Header save ───────────────────────────────────────────────────────────

  async function saveName() {
    if (!selectedId || !editName.trim()) return
    const tab  = TABS.find(t => t.key === activeTab)!
    const name = editName.trim()
    await supabase.from(tab.table).update({ name }).eq('id', selectedId)
    setSchedLists(prev => ({
      ...prev, [activeTab]: (prev[activeTab] ?? []).map(s => s.id === selectedId ? { ...s, name } : s),
    }))
  }

  async function saveDesc() {
    if (!selectedId) return
    const tab  = TABS.find(t => t.key === activeTab)!
    const desc = editDesc.trim() || null
    await supabase.from(tab.table).update({ description: desc }).eq('id', selectedId)
    setSchedLists(prev => ({
      ...prev, [activeTab]: (prev[activeTab] ?? []).map(s => s.id === selectedId ? { ...s, description: desc } : s),
    }))
  }

  async function toggleActive() {
    if (!selectedId) return
    const tab    = TABS.find(t => t.key === activeTab)!
    const sched  = (schedLists[activeTab] ?? []).find(s => s.id === selectedId)
    if (!sched) return
    const active = !sched.active
    await supabase.from(tab.table).update({ active }).eq('id', selectedId)
    setSchedLists(prev => ({
      ...prev, [activeTab]: (prev[activeTab] ?? []).map(s => s.id === selectedId ? { ...s, active } : s),
    }))
  }

  async function setAsDefault() {
    if (!selectedId) return
    const tab = TABS.find(t => t.key === activeTab)!
    await supabase.from(tab.table).update({ is_default: false }).eq('is_default', true)
    await supabase.from(tab.table).update({ is_default: true }).eq('id', selectedId)
    setSchedLists(prev => ({
      ...prev, [activeTab]: (prev[activeTab] ?? []).map(s => ({ ...s, is_default: s.id === selectedId })),
    }))
  }

  // ── Row material + edgeband saves ─────────────────────────────────────────

  async function saveAsmMat(cls: string, role: string, matId: string) {
    if (!selectedId) return
    const k = `${cls}|${role}`
    const ebId = rowData[`${k}|eb`] || null
    if (matId) {
      await supabase.from('assembly_schedule_rows').upsert(
        { schedule_id: selectedId, assembly_class: cls, material_role: role, material_id: matId, edgeband_id: ebId },
        { onConflict: 'schedule_id,assembly_class,material_role' }
      )
      setRowData(p => ({ ...p, [k]: matId }))
    } else {
      await supabase.from('assembly_schedule_rows').delete()
        .eq('schedule_id', selectedId).eq('assembly_class', cls).eq('material_role', role)
      setRowData(p => { const n = { ...p }; delete n[k]; delete n[`${k}|eb`]; return n })
    }
  }

  async function saveAsmEb(cls: string, role: string, ebId: string) {
    if (!selectedId || !rowData[`${cls}|${role}`]) return
    const k = `${cls}|${role}|eb`
    await supabase.from('assembly_schedule_rows')
      .update({ edgeband_id: ebId || null })
      .eq('schedule_id', selectedId).eq('assembly_class', cls).eq('material_role', role)
    setRowData(p => ebId ? { ...p, [k]: ebId } : (({ [k]: _, ...rest }) => rest)(p))
  }

  async function saveTkMat(partRole: string, matId: string) {
    if (!selectedId) return
    const ebId = rowData[`${partRole}|eb`] || null
    if (matId) {
      await supabase.from('toekick_schedule_rows').upsert(
        { schedule_id: selectedId, part_role: partRole, material_id: matId, edgeband_id: ebId },
        { onConflict: 'schedule_id,part_role' }
      )
      setRowData(p => ({ ...p, [partRole]: matId }))
    } else {
      await supabase.from('toekick_schedule_rows').delete()
        .eq('schedule_id', selectedId).eq('part_role', partRole)
      setRowData(p => { const n = { ...p }; delete n[partRole]; delete n[`${partRole}|eb`]; return n })
    }
  }

  async function saveTkEb(partRole: string, ebId: string) {
    if (!selectedId || !rowData[partRole]) return
    const k = `${partRole}|eb`
    await supabase.from('toekick_schedule_rows')
      .update({ edgeband_id: ebId || null })
      .eq('schedule_id', selectedId).eq('part_role', partRole)
    setRowData(p => ebId ? { ...p, [k]: ebId } : (({ [k]: _, ...rest }) => rest)(p))
  }

  async function saveFrontMat(cls: string, matId: string) {
    if (!selectedId) return
    const ebId = rowData[`${cls}|eb`] || null
    if (matId) {
      await supabase.from('front_schedule_rows').upsert(
        { schedule_id: selectedId, assembly_class: cls, material_id: matId, edgeband_id: ebId },
        { onConflict: 'schedule_id,assembly_class' }
      )
      setRowData(p => ({ ...p, [cls]: matId }))
    } else {
      await supabase.from('front_schedule_rows').delete()
        .eq('schedule_id', selectedId).eq('assembly_class', cls)
      setRowData(p => { const n = { ...p }; delete n[cls]; delete n[`${cls}|eb`]; return n })
    }
  }

  async function saveFrontEb(cls: string, ebId: string) {
    if (!selectedId || !rowData[cls]) return
    const k = `${cls}|eb`
    await supabase.from('front_schedule_rows')
      .update({ edgeband_id: ebId || null })
      .eq('schedule_id', selectedId).eq('assembly_class', cls)
    setRowData(p => ebId ? { ...p, [k]: ebId } : (({ [k]: _, ...rest }) => rest)(p))
  }

  async function saveBtMat(partRole: string, matId: string, source: 'board' | 'benchtop') {
    if (!selectedId) return
    const matCol = source === 'benchtop' ? 'benchtop_material_id' : 'material_id'
    const ebId   = rowData[`${partRole}|eb`] || null
    if (matId) {
      await supabase.from('benchtop_schedule_rows').upsert(
        { schedule_id: selectedId, part_role: partRole, [matCol]: matId, edgeband_id: ebId },
        { onConflict: 'schedule_id,part_role' }
      )
      setRowData(p => ({ ...p, [partRole]: matId }))
    } else {
      await supabase.from('benchtop_schedule_rows').delete()
        .eq('schedule_id', selectedId).eq('part_role', partRole)
      setRowData(p => { const n = { ...p }; delete n[partRole]; delete n[`${partRole}|eb`]; return n })
    }
  }

  async function saveBtEb(partRole: string, ebId: string) {
    if (!selectedId || !rowData[partRole]) return
    const k = `${partRole}|eb`
    await supabase.from('benchtop_schedule_rows')
      .update({ edgeband_id: ebId || null })
      .eq('schedule_id', selectedId).eq('part_role', partRole)
    setRowData(p => ebId ? { ...p, [k]: ebId } : (({ [k]: _, ...rest }) => rest)(p))
  }

  async function saveSingleValue(col: string, value: string) {
    if (!selectedId) return
    const tab = TABS.find(t => t.key === activeTab)!
    const v   = value || null
    await supabase.from(tab.table).update({ [col]: v }).eq('id', selectedId)
    setSchedLists(prev => ({
      ...prev, [activeTab]: (prev[activeTab] ?? []).map(s => s.id === selectedId ? { ...s, [col]: v } : s),
    }))
  }

  // ── Slide entry CRUD ──────────────────────────────────────────────────────

  async function addSlideEntry(depth: number, height: number, slideId: string) {
    if (!selectedId || !slideId) return
    const { data, error } = await supabase
      .from('slide_schedule_entries')
      .insert({ schedule_id: selectedId, depth_threshold: depth, height_threshold: height, slide_id: slideId })
      .select('id, depth_threshold, height_threshold, slide_id')
      .single()
    if (error || !data) return
    const entry = data as SlideEntryRow
    setSlideEntries(prev =>
      [...prev, entry].sort((a, b) => a.depth_threshold - b.depth_threshold || a.height_threshold - b.height_threshold)
    )
  }

  async function updateSlideEntry(entryId: string, slideId: string) {
    if (!slideId) return
    await supabase.from('slide_schedule_entries').update({ slide_id: slideId }).eq('id', entryId)
    setSlideEntries(prev => prev.map(e => e.id === entryId ? { ...e, slide_id: slideId } : e))
  }

  async function deleteSlideEntry(entryId: string) {
    await supabase.from('slide_schedule_entries').delete().eq('id', entryId)
    setSlideEntries(prev => prev.filter(e => e.id !== entryId))
  }

  async function deleteDepthTier(depth: number) {
    if (!selectedId) return
    await supabase.from('slide_schedule_entries').delete().eq('schedule_id', selectedId).eq('depth_threshold', depth)
    setSlideEntries(prev => prev.filter(e => e.depth_threshold !== depth))
    setAddingInDepth(prev => { const n = { ...prev }; delete n[depth]; return n })
  }

  // ── CSS helpers ───────────────────────────────────────────────────────────

  const sel    = 'w-full bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent'
  const selEb  = 'w-full bg-surface-2/60 border border-edge-strong/60 rounded px-2 py-1 text-[10px] text-ink-muted focus:outline-none focus:border-purple-600 focus:text-purple-300'
  const inp    = 'bg-surface-2 border border-edge-strong rounded px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-accent w-full'

  // ── MatCell: stacked material + edgeband dropdowns ────────────────────────

  function MatCell({
    matId, ebId, matKey, ebKey,
    onMatChange, onEbChange,
    className = '',
  }: {
    matId: string; ebId: string
    matKey: string; ebKey: string
    onMatChange: (v: string) => void
    onEbChange:  (v: string) => void
    className?: string
  }) {
    const opts = ebOpts(matId)
    return (
      <div className={`space-y-1 ${className}`}>
        <select value={matId} onChange={e => onMatChange(e.target.value)} className={sel}>
          {!matId && <option value="">— not set —</option>}
          {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.dz}mm)</option>)}
        </select>
        <select
          value={ebId}
          onChange={e => onEbChange(e.target.value)}
          disabled={!matId}
          className={selEb}
        >
          <option value="">{matId ? '— no banding —' : '—'}</option>
          {opts.map(eb => <option key={eb.id} value={eb.id}>{eb.name} ({eb.thickness}mm)</option>)}
        </select>
      </div>
    )
  }

  // ── Editor sections ───────────────────────────────────────────────────────

  function renderAsmGrid() {
    return (
      <div className="grid grid-cols-[120px_1fr_1fr_1fr] gap-px bg-surface-3/50 rounded overflow-hidden border border-edge-strong text-xs">
        <div className="bg-surface-2 px-2 py-1.5 text-[10px] font-semibold text-ink-subtle uppercase tracking-wide">Role</div>
        {CLASSES.map(c => (
          <div key={c} className="bg-surface-2 px-2 py-1.5 text-[10px] font-semibold text-ink-subtle uppercase tracking-wide capitalize">{c}</div>
        ))}
        {ASM_ROLES.map(role => (
          <Fragment key={role.key}>
            <div className="bg-surface px-2 py-2.5 flex items-start pt-3 text-xs text-ink-muted">{role.label}</div>
            {CLASSES.map(cls => {
              const mK = `${cls}|${role.key}`
              const eK = `${mK}|eb`
              return (
                <div key={cls} className="bg-surface px-2 py-2">
                  <MatCell
                    matId={rowData[mK] ?? ''} ebId={rowData[eK] ?? ''}
                    matKey={mK} ebKey={eK}
                    onMatChange={v => saveAsmMat(cls, role.key, v)}
                    onEbChange={v  => saveAsmEb(cls, role.key, v)}
                  />
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
    )
  }

  function renderTkList() {
    return (
      <div className="space-y-3">
        {TK_ROLES.map(role => {
          const mK = role.key
          const eK = `${role.key}|eb`
          return (
            <div key={role.key} className="flex items-start gap-3">
              <div className="w-28 shrink-0 pt-1">
                <p className="text-xs text-ink-muted">{role.label}</p>
                <p className="text-[9px] text-ink-subtle">{role.desc}</p>
              </div>
              <MatCell
                matId={rowData[mK] ?? ''} ebId={rowData[eK] ?? ''}
                matKey={mK} ebKey={eK}
                onMatChange={v => saveTkMat(role.key, v)}
                onEbChange={v  => saveTkEb(role.key, v)}
                className="flex-1"
              />
            </div>
          )
        })}
      </div>
    )
  }

  function renderFrontList() {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-12 shrink-0" />
          <span className="flex-1 text-[10px] text-ink-subtle pl-1">Board</span>
          <span className="flex-1 text-[10px] text-ink-subtle pl-1">Edgebanding</span>
        </div>
        {CLASSES.map(cls => {
          const mK = cls
          const eK = `${cls}|eb`
          const matId = rowData[mK] ?? ''
          const ebId  = rowData[eK] ?? ''
          const opts  = ebOpts(matId)
          return (
            <div key={cls} className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-xs text-ink-muted capitalize">{cls}</span>
              <select value={matId} onChange={e => saveFrontMat(cls, e.target.value)} className={`flex-1 ${sel}`}>
                {!matId && <option value="">— not set —</option>}
                {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.dz}mm)</option>)}
              </select>
              <select
                value={ebId}
                onChange={e => saveFrontEb(cls, e.target.value)}
                disabled={!matId}
                className={`flex-1 ${selEb} ${matId ? '' : 'opacity-40'}`}
              >
                <option value="">{matId ? '— no banding —' : '—'}</option>
                {opts.map(eb => <option key={eb.id} value={eb.id}>{eb.name} ({eb.thickness}mm)</option>)}
              </select>
            </div>
          )
        })}
      </div>
    )
  }

  const DB_ROLES = [
    { key: 'box',    label: 'Box Panels',   desc: 'Sides, front & back',  matCol: 'material_id',        ebCol: 'edgeband_id'         },
    { key: 'bottom', label: 'Bottom Panel', desc: 'Base / floor of box',  matCol: 'bottom_material_id', ebCol: 'bottom_edgeband_id'  },
  ] as const

  const IDB_ROLES = [
    { key: 'box',    label: 'Box Panels',   desc: 'Sides & back',         matCol: 'material_id',        ebCol: 'edgeband_id'         },
    { key: 'bottom', label: 'Bottom Panel', desc: 'Base / floor of box',  matCol: 'bottom_material_id', ebCol: 'bottom_edgeband_id'  },
    { key: 'front',  label: 'Front Panel',  desc: 'Inner drawer front',   matCol: 'front_material_id',  ebCol: 'front_edgeband_id'   },
  ] as const

  function renderDbList(roles: readonly { readonly key: string; readonly label: string; readonly desc: string; readonly matCol: string; readonly ebCol: string }[] = DB_ROLES) {
    const sched = (schedLists[activeTab] ?? []).find(s => s.id === selectedId)
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 mb-1">
          <span className="w-28 shrink-0" />
          <span className="flex-1 text-[10px] text-ink-subtle pl-1">Board</span>
          <span className="flex-1 text-[10px] text-ink-subtle pl-1">Edgebanding</span>
        </div>
        {roles.map(role => {
          const mId = (sched?.[role.matCol] as string) ?? ''
          const eId = (sched?.[role.ebCol]  as string) ?? ''
          const opts = ebOpts(mId)
          return (
            <div key={role.key} className="flex items-center gap-3">
              <div className="w-28 shrink-0">
                <p className="text-xs text-ink-muted">{role.label}</p>
                <p className="text-[9px] text-ink-subtle">{role.desc}</p>
              </div>
              <select
                value={mId}
                onChange={e => saveSingleValue(role.matCol, e.target.value)}
                className={`flex-1 ${sel}`}
              >
                {!mId && <option value="">— not set —</option>}
                {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.dz}mm)</option>)}
              </select>
              <select
                value={eId}
                onChange={e => saveSingleValue(role.ebCol, e.target.value)}
                disabled={!mId}
                className={`flex-1 ${selEb} ${mId ? '' : 'opacity-40'}`}
              >
                <option value="">{mId ? '— no banding —' : '—'}</option>
                {opts.map(eb => <option key={eb.id} value={eb.id}>{eb.name} ({eb.thickness}mm)</option>)}
              </select>
            </div>
          )
        })}
      </div>
    )
  }

  function renderBtRoles() {
    return (
      <div className="space-y-3">
        {BT_ROLES.map(role => {
          const mK      = role.key
          const eK      = `${role.key}|eb`
          const matId   = rowData[mK] ?? ''
          const ebId    = rowData[eK] ?? ''
          const catalog = role.source === 'benchtop' ? benchtopMats : materials
          const opts    = role.hasEb ? ebOpts(matId) : []
          return (
            <div key={role.key} className="flex items-start gap-3">
              <div className="w-36 shrink-0 pt-1">
                <p className="text-xs text-ink-muted">{role.label}</p>
                <p className="text-[9px] text-ink-subtle">{role.desc}</p>
              </div>
              <div className="flex-1 space-y-1">
                <select
                  value={matId}
                  onChange={e => saveBtMat(role.key, e.target.value, role.source as 'board' | 'benchtop')}
                  className={sel}
                >
                  {!matId && <option value="">— not set —</option>}
                  {(catalog as { id: string; name: string; dz: number }[]).map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.dz}mm)</option>
                  ))}
                </select>
                {role.hasEb && (
                  <select
                    value={ebId}
                    onChange={e => saveBtEb(role.key, e.target.value)}
                    disabled={!matId}
                    className={`${selEb} ${matId ? '' : 'opacity-40'}`}
                  >
                    <option value="">{matId ? '— no banding —' : '—'}</option>
                    {opts.map(eb => <option key={eb.id} value={eb.id}>{eb.name} ({eb.thickness}mm)</option>)}
                  </select>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderHwSingle() {
    const tab     = TABS.find(t => t.key === activeTab)!
    const col     = tab.valueCol as string
    const sched   = (schedLists[activeTab] ?? []).find(s => s.id === selectedId)
    const val     = (sched?.[col] as string) ?? ''
    const catalog = activeTab === 'hinge' ? hinges : activeTab === 'slide' ? slides : handles
    const label   = activeTab === 'hinge' ? 'Hinge' : activeTab === 'slide' ? 'Slide' : 'Handle'

    // Hinge schedules also carry an optional plate; the list is filtered to the
    // plates belonging to the chosen hinge. Leave unset to use the hinge's
    // default plate at resolve time.
    const plateVal     = activeTab === 'hinge' ? ((sched?.['hinge_plate_id'] as string) ?? '') : ''
    const platesForSel = activeTab === 'hinge' ? hingePlates.filter(p => p.hinge_id === val) : []

    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-xs text-ink-muted">{label}</span>
          <select value={val} onChange={e => saveSingleValue(col, e.target.value)} className={`flex-1 max-w-sm ${sel}`}>
            {!val && <option value="">— not set —</option>}
            {catalog.map(item => (
              <option key={item.id} value={item.id}>{item.name}{item.brand ? ` — ${item.brand}` : ''}</option>
            ))}
          </select>
        </div>
        {activeTab === 'hinge' && (
          <div className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-xs text-ink-muted">Plate</span>
            <select
              value={plateVal}
              onChange={e => saveSingleValue('hinge_plate_id', e.target.value)}
              disabled={!val}
              className={`flex-1 max-w-sm ${sel} disabled:opacity-40`}
            >
              <option value="">— hinge default —</option>
              {platesForSel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
      </div>
    )
  }

  function renderSlideGrid() {
    const slideLabel = (s: HwSlideItem) =>
      `${s.name}${s.brand ? ` — ${s.brand}` : ''}${s.box_height != null ? ` (H${s.box_height})` : ''}`
    let prevDepth: number | null = null

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-surface">

        {/* Add-entry form row — matches MaterialsClient input row style */}
        <div className="flex-none border-b border-edge-strong overflow-x-auto bg-surface/80">
          <div className="flex items-stretch min-w-max">
            <div style={{ width: 110 }} className="flex flex-col justify-between py-2 px-2 border-r border-edge-strong">
              <span className="text-[9px] text-ink-subtle uppercase tracking-wide mb-1.5">Depth ≥ mm</span>
              <input
                type="number"
                value={newTierDepth}
                onChange={e => setNewTierDepth(e.target.value)}
                placeholder="450"
                onFocus={e => e.target.select()}
                className="block w-full bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs text-ink text-right focus:outline-none focus:border-accent placeholder:text-ink-subtle"
              />
            </div>
            <div style={{ width: 110 }} className="flex flex-col justify-between py-2 px-2 border-r border-edge-strong">
              <span className="text-[9px] text-ink-subtle uppercase tracking-wide mb-1.5">Height ≥ mm</span>
              <input
                type="number"
                value={newTierHeight}
                onChange={e => setNewTierHeight(e.target.value)}
                placeholder="104"
                onFocus={e => e.target.select()}
                className="block w-full bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs text-ink text-right focus:outline-none focus:border-accent placeholder:text-ink-subtle"
              />
            </div>
            <div className="flex flex-col justify-between py-2 px-2 flex-1 min-w-[220px]">
              <span className="text-[9px] text-ink-subtle uppercase tracking-wide mb-1.5">Slide</span>
              <select
                value={newTierSlide}
                onChange={e => setNewTierSlide(e.target.value)}
                className="bg-transparent border-b border-edge-strong text-xs text-ink focus:outline-none focus:border-accent py-0.5 w-full"
              >
                <option value="" className="bg-surface">— select —</option>
                {slides.map(s => <option key={s.id} value={s.id} className="bg-surface">{slideLabel(s)}</option>)}
              </select>
            </div>
            <div className="flex-none flex items-center gap-1.5 px-3 border-l border-edge-strong">
              <button
                onClick={async () => {
                  const d = parseInt(newTierDepth)
                  const h = parseInt(newTierHeight)
                  if (!d || !h || !newTierSlide) return
                  await addSlideEntry(d, h, newTierSlide)
                  setNewTierDepth('')
                  setNewTierHeight('')
                  setNewTierSlide('')
                }}
                disabled={!newTierDepth || !newTierHeight || !newTierSlide}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-xs rounded transition-colors whitespace-nowrap"
              >Add</button>
            </div>
          </div>
        </div>

        {/* Scrollable table */}
        <div className="flex-1 overflow-auto">

          {/* Sticky column header */}
          <div className="flex items-center bg-surface-2/60 border-b border-edge-strong sticky top-0 z-10 min-w-max">
            <div style={{ width: 110 }} className="flex-none px-2 border-r border-edge-strong/50 text-[9px] text-ink-subtle uppercase tracking-wide py-1.5 text-right">Depth ≥</div>
            <div style={{ width: 110 }} className="flex-none px-2 border-r border-edge-strong/50 text-[9px] text-ink-subtle uppercase tracking-wide py-1.5 text-right">Height ≥</div>
            <div className="flex-1 min-w-[220px] px-2 text-[9px] text-ink-subtle uppercase tracking-wide py-1.5">Slide</div>
            <div style={{ width: 36 }} />
          </div>

          <div className="min-w-max">
            {slideEntries.length === 0 ? (
              <div className="px-4 py-10">
                <p className="text-xs text-ink-subtle">No entries yet — fill in the form above and click Add.</p>
              </div>
            ) : slideEntries.map(entry => {
              const isFirst = entry.depth_threshold !== prevDepth
              prevDepth = entry.depth_threshold
              return (
                <div
                  key={entry.id}
                  className={`flex items-center border-b border-edge/60 hover:bg-surface-2/20 transition-colors ${isFirst ? 'border-t border-edge-strong/40' : ''}`}
                >
                  <div style={{ width: 110 }} className={`flex-none px-2 py-1.5 text-xs text-right border-r border-edge/50 tabular-nums ${isFirst ? 'text-ink font-medium' : 'text-ink-subtle'}`}>
                    {entry.depth_threshold}
                  </div>
                  <div style={{ width: 110 }} className="flex-none px-2 py-1.5 text-xs text-right border-r border-edge/50 tabular-nums text-ink-muted">
                    {entry.height_threshold}
                  </div>
                  <div className="flex-1 min-w-[220px] px-2 py-1">
                    <select
                      value={entry.slide_id}
                      onChange={e => updateSlideEntry(entry.id, e.target.value)}
                      className="w-full bg-transparent border-b border-transparent hover:border-edge-strong focus:border-accent text-xs text-ink-muted focus:outline-none py-0.5 focus:text-ink transition-colors"
                    >
                      {slides.map(s => <option key={s.id} value={s.id} className="bg-surface">{slideLabel(s)}</option>)}
                    </select>
                  </div>
                  <div style={{ width: 36 }} className="flex items-center justify-center">
                    <button onClick={() => deleteSlideEntry(entry.id)} className="text-ink-subtle hover:text-red-400 text-base leading-none transition-colors">×</button>
                  </div>
                </div>
              )
            })}
          </div>

          {slideEntries.length > 0 && (
            <div className="border-t border-edge px-4 py-1.5">
              <span className="text-[10px] text-ink-subtle">{slideEntries.length} entr{slideEntries.length !== 1 ? 'ies' : 'y'}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderEditor() {
    if (!selectedId) {
      return (
        <div className="flex-1 flex items-center justify-center text-xs text-ink-subtle">
          Select a schedule to edit
        </div>
      )
    }

    const tab   = TABS.find(t => t.key === activeTab)!
    const sched = (schedLists[activeTab] ?? []).find(s => s.id === selectedId)
    if (!sched) return null

    // Slide grid gets its own full-height spreadsheet layout (name/desc inline, no outer scroll)
    if (tab.type === 'slide_grid') {
      return (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-none border-b border-edge px-5 py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0 space-y-1.5">
              <input value={editName} onChange={e => setEditName(e.target.value)} onBlur={saveName} className={inp} />
              <input value={editDesc} onChange={e => setEditDesc(e.target.value)} onBlur={saveDesc} placeholder="Optional description" className="block w-full bg-transparent text-[10px] text-ink-subtle focus:outline-none placeholder:text-ink-subtle focus:text-ink-muted" />
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                onClick={toggleActive}
                className={`text-xs px-3 py-1 rounded border transition-colors ${
                  sched.active
                    ? 'border-green-700 text-green-400 hover:bg-green-900/30'
                    : 'border-edge-strong text-ink-subtle hover:border-edge-strong'
                }`}
              >{sched.active ? 'Active' : 'Inactive'}</button>
              {sched.is_default
                ? <span className="text-[10px] text-center px-3 py-1 rounded bg-accent/10 border border-blue-800 text-accent-ink">Shop Default</span>
                : <button onClick={setAsDefault} className="text-xs px-3 py-1 rounded border border-edge-strong text-ink-subtle hover:border-blue-700 hover:text-accent-ink transition-colors">Set Default</button>
              }
            </div>
          </div>
          {rowsLoading
            ? <div className="flex-1 flex items-center justify-center"><p className="text-xs text-ink-subtle">Loading…</p></div>
            : renderSlideGrid()
          }
        </div>
      )
    }

    return (
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* Name + status controls */}
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <label className="text-[10px] text-ink-subtle uppercase tracking-wide mb-1 block">Name</label>
            <input value={editName} onChange={e => setEditName(e.target.value)} onBlur={saveName} className={inp} />
          </div>
          <div className="flex flex-col gap-1.5 pt-5">
            <button
              onClick={toggleActive}
              className={`text-xs px-3 py-1 rounded border transition-colors ${
                sched.active
                  ? 'border-green-700 text-green-400 hover:bg-green-900/30'
                  : 'border-edge-strong text-ink-subtle hover:border-edge-strong'
              }`}
            >
              {sched.active ? 'Active' : 'Inactive'}
            </button>
            {sched.is_default
              ? <span className="text-[10px] text-center px-3 py-1 rounded bg-accent/10 border border-blue-800 text-accent-ink">Shop Default</span>
              : <button onClick={setAsDefault} className="text-xs px-3 py-1 rounded border border-edge-strong text-ink-subtle hover:border-blue-700 hover:text-accent-ink transition-colors">Set Default</button>
            }
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-[10px] text-ink-subtle uppercase tracking-wide mb-1 block">Description</label>
          <input value={editDesc} onChange={e => setEditDesc(e.target.value)} onBlur={saveDesc} placeholder="Optional description" className={inp} />
        </div>

        {/* Content editor */}
        <div className="border-t border-edge pt-4">
          {tab.type === 'asm_grid'    && <>{rowsLoading ? <p className="text-xs text-ink-subtle">Loading…</p> : renderAsmGrid()}</>}
          {tab.type === 'tk_list'     && <>{rowsLoading ? <p className="text-xs text-ink-subtle">Loading…</p> : renderTkList()}</>}
          {tab.type === 'front_list'  && <>{rowsLoading ? <p className="text-xs text-ink-subtle">Loading…</p> : renderFrontList()}</>}
          {tab.type === 'db_list'     && renderDbList()}
          {tab.type === 'idb_list'    && renderDbList(IDB_ROLES)}
          {tab.type === 'bt_roles'    && <>{rowsLoading ? <p className="text-xs text-ink-subtle">Loading…</p> : renderBtRoles()}</>}
          {tab.type === 'hw_single'   && renderHwSingle()}
        </div>

        {/* Edging defaults hint for row-based tabs */}
        {(tab.type === 'asm_grid' || tab.type === 'tk_list' || tab.type === 'front_list') && (
          <p className="text-[10px] text-ink-subtle border-t border-edge/50 pt-3">
            Which parts and edges receive banding is configured in the construction method settings.
          </p>
        )}
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={embedded ? "flex-1 flex items-center justify-center" : "h-screen bg-canvas flex items-center justify-center"}>
        <p className="text-xs text-ink-subtle">Loading schedules…</p>
      </div>
    )
  }

  const activeList = schedLists[activeTab] ?? []

  return (
    <div className={embedded ? "flex-1 flex flex-col overflow-hidden" : "h-screen bg-canvas text-ink flex flex-col overflow-hidden"}>

      {/* Header */}
      {!embedded && (
        <div className="flex-none border-b border-edge px-6 py-3 flex items-center gap-3">
          <ThemeToggle />
          <Link href="/" className="text-ink-subtle hover:text-ink-muted text-sm transition-colors">← Projects</Link>
          <span className="text-ink-subtle">|</span>
          <span className="text-sm font-semibold text-ink">Schedules</span>
          <span className="text-xs text-ink-subtle ml-1">· Named templates applied to jobs and rooms</span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">

        {/* Vertical tab list */}
        <div className="w-44 shrink-0 border-r border-edge overflow-y-auto">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => changeTab(tab.key)}
              className={`w-full text-left px-4 py-2.5 text-xs transition-colors border-b border-edge/50 ${
                activeTab === tab.key
                  ? 'bg-surface-2 text-ink font-semibold'
                  : 'text-ink-muted hover:text-ink hover:bg-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Schedule list */}
        <div className="w-56 shrink-0 border-r border-edge flex flex-col overflow-hidden">
          <div className="flex-none border-b border-edge">
            <div className="px-3 py-2.5 flex gap-2">
              <input
                value={newName}
                onChange={e => { setNewName(e.target.value); setCreateError(null) }}
                onKeyDown={e => e.key === 'Enter' && createSchedule()}
                placeholder="New schedule name…"
                className="flex-1 bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink placeholder-ink-subtle focus:outline-none focus:border-accent"
              />
              <button
                onClick={createSchedule}
                disabled={creating || !newName.trim()}
                className="text-xs px-2.5 py-1 bg-accent hover:bg-accent-hover disabled:bg-surface-3 disabled:text-ink-subtle text-white rounded transition-colors"
              >
                {creating ? '…' : '+'}
              </button>
            </div>
            {createError && (
              <p className="px-3 pb-2 text-[10px] text-red-400">{createError}</p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-edge/50">
            {activeList.length === 0 && (
              <p className="text-[10px] text-ink-subtle px-3 py-4 text-center">No schedules yet</p>
            )}
            {activeList.map(s => (
              <button
                key={s.id}
                onClick={() => selectSchedule(s.id)}
                className={`w-full text-left px-3 py-2.5 flex items-start justify-between gap-2 transition-colors group ${
                  selectedId === s.id ? 'bg-surface-2' : 'hover:bg-surface'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-xs truncate ${selectedId === s.id ? 'text-ink' : 'text-ink-muted'}`}>{s.name}</p>
                  <div className="flex gap-1.5 mt-0.5">
                    {s.is_default && <span className="text-[9px] text-accent-ink bg-accent/10 px-1.5 py-0.5 rounded">default</span>}
                    {!s.active   && <span className="text-[9px] text-ink-subtle">inactive</span>}
                  </div>
                </div>
                <span
                  role="button"
                  onClick={e => { e.stopPropagation(); deleteSchedule(s.id) }}
                  className="text-ink-subtle hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 text-base leading-none cursor-pointer"
                >
                  ×
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        {renderEditor()}

      </div>
    </div>
  )
}
