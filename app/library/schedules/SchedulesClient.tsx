'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'assembly',        label: 'Assembly',             table: 'assembly_schedules',       type: 'asm_grid',   valueCol: null           },
  { key: 'toekick',         label: 'Toe Kick',             table: 'toekick_schedules',         type: 'tk_list',    valueCol: null           },
  { key: 'front',           label: 'Door & Drawer Fronts', table: 'front_schedules',           type: 'front_list', valueCol: null           },
  { key: 'drawerbox',       label: 'Drawer Box',           table: 'drawerbox_schedules',       type: 'mat_single', valueCol: 'material_id'  },
  { key: 'inner_drawerbox', label: 'Inner Drawer Box',     table: 'inner_drawerbox_schedules', type: 'mat_single', valueCol: 'material_id'  },
  { key: 'hinge',           label: 'Hinges',               table: 'hinge_schedules',           type: 'hw_single',  valueCol: 'hinge_id'     },
  { key: 'slide',           label: 'Slides',               table: 'slide_schedules',           type: 'hw_single',  valueCol: 'slide_id'     },
  { key: 'handle',          label: 'Handles',              table: 'handle_schedules',          type: 'hw_single',  valueCol: 'handle_id'    },
  { key: 'benchtop',        label: 'Benchtops',            table: 'benchtop_schedules',        type: 'bt_single',  valueCol: 'benchtop_id'  },
] as const

type SchedKey = typeof TABS[number]['key']

// ── Row editor config ─────────────────────────────────────────────────────────

const ASM_ROLES = [
  { key: 'interior',         label: 'Interior' },
  { key: 'exposed_interior', label: 'Exp. Interior' },
  { key: 'shelf',            label: 'Shelf' },
  { key: 'end_panel',        label: 'End Panel' },
]
const TK_ROLES  = [
  { key: 'face',     label: 'Face',     desc: 'Visible front face' },
  { key: 'interior', label: 'Interior', desc: 'Structural members' },
]
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

type MatItem      = { id: string; name: string; dz: number }
type BenchtopItem = { id: string; name: string; dz: number; material_type: string | null }
type HwItem       = { id: string; name: string; brand: string | null }

// ── Component ─────────────────────────────────────────────────────────────────

export default function SchedulesClient() {
  const [loading,     setLoading]     = useState(true)
  const [materials,   setMaterials]   = useState<MatItem[]>([])
  const [benchtopMats, setBenchtopMats] = useState<BenchtopItem[]>([])
  const [hinges,      setHinges]      = useState<HwItem[]>([])
  const [slides,      setSlides]      = useState<HwItem[]>([])
  const [handles,     setHandles]     = useState<HwItem[]>([])
  const [schedLists,  setSchedLists]  = useState<Partial<Record<SchedKey, SchedRecord[]>>>({})
  const [activeTab,   setActiveTab]   = useState<SchedKey>('assembly')
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [editName,    setEditName]    = useState('')
  const [editDesc,    setEditDesc]    = useState('')
  const [newName,     setNewName]     = useState('')
  const [creating,    setCreating]    = useState(false)
  const [rowData,     setRowData]     = useState<Record<string, string>>({})
  const [rowsLoading, setRowsLoading] = useState(false)

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [
        asmR, tkR, frR, dbR, idbR, hiR, slR, haR, btR,
        matsR, btMatsR, hingesR, slidesR, handlesR,
      ] = await Promise.all([
        supabase.from('assembly_schedules').select('id,name,description,is_default,active').order('name'),
        supabase.from('toekick_schedules').select('id,name,description,is_default,active').order('name'),
        supabase.from('front_schedules').select('id,name,description,is_default,active').order('name'),
        supabase.from('drawerbox_schedules').select('id,name,description,is_default,active,material_id').order('name'),
        supabase.from('inner_drawerbox_schedules').select('id,name,description,is_default,active,material_id').order('name'),
        supabase.from('hinge_schedules').select('id,name,description,is_default,active,hinge_id').order('name'),
        supabase.from('slide_schedules').select('id,name,description,is_default,active,slide_id').order('name'),
        supabase.from('handle_schedules').select('id,name,description,is_default,active,handle_id').order('name'),
        supabase.from('benchtop_schedules').select('id,name,description,is_default,active,benchtop_id').order('name'),
        supabase.from('materials').select('id,name,dz').eq('active', true).order('name'),
        supabase.from('benchtop_materials').select('id,name,dz,material_type').eq('active', true).order('name'),
        supabase.from('hardware_hinges').select('id,name,brand').eq('active', true).order('name'),
        supabase.from('hardware_slides').select('id,name,brand').eq('active', true).order('name'),
        supabase.from('hardware_handles').select('id,name,brand').eq('active', true).order('name'),
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
      setBenchtopMats((btMatsR.data ?? []) as BenchtopItem[])
      setHinges((hingesR.data  ?? []) as HwItem[])
      setSlides((slidesR.data  ?? []) as HwItem[])
      setHandles((handlesR.data ?? []) as HwItem[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

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
    if (tab.type === 'asm_grid' || tab.type === 'tk_list' || tab.type === 'front_list') {
      setRowsLoading(true)
      const rows = await fetchRows(tab.type, id)
      setRowData(rows)
      setRowsLoading(false)
    }
  }

  async function fetchRows(type: string, schedId: string): Promise<Record<string, string>> {
    const map: Record<string, string> = {}
    if (type === 'asm_grid') {
      const { data } = await supabase.from('assembly_schedule_rows').select('assembly_class,material_role,material_id').eq('schedule_id', schedId)
      for (const r of (data ?? []) as { assembly_class: string; material_role: string; material_id: string }[])
        map[`${r.assembly_class}|${r.material_role}`] = r.material_id
    } else if (type === 'tk_list') {
      const { data } = await supabase.from('toekick_schedule_rows').select('part_role,material_id').eq('schedule_id', schedId)
      for (const r of (data ?? []) as { part_role: string; material_id: string }[])
        map[r.part_role] = r.material_id
    } else if (type === 'front_list') {
      const { data } = await supabase.from('front_schedule_rows').select('assembly_class,material_id').eq('schedule_id', schedId)
      for (const r of (data ?? []) as { assembly_class: string; material_id: string }[])
        map[r.assembly_class] = r.material_id
    }
    return map
  }

  // ── Tab change ────────────────────────────────────────────────────────────

  function changeTab(key: SchedKey) {
    setActiveTab(key)
    setSelectedId(null)
    setRowData({})
    setNewName('')
  }

  // ── Create / delete ───────────────────────────────────────────────────────

  async function createSchedule() {
    const name = newName.trim()
    if (!name || creating) return
    const tab = TABS.find(t => t.key === activeTab)!
    setCreating(true)
    const { data, error } = await supabase.from(tab.table).insert({ name, is_default: false, active: true }).select().single()
    setCreating(false)
    if (error || !data) return
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
    const tab = TABS.find(t => t.key === activeTab)!
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

  // ── Row value saves ───────────────────────────────────────────────────────

  async function saveAsmRow(cls: string, role: string, matId: string) {
    if (!selectedId) return
    const k = `${cls}|${role}`
    if (matId) {
      await supabase.from('assembly_schedule_rows').upsert(
        { schedule_id: selectedId, assembly_class: cls, material_role: role, material_id: matId },
        { onConflict: 'schedule_id,assembly_class,material_role' }
      )
      setRowData(p => ({ ...p, [k]: matId }))
    } else {
      await supabase.from('assembly_schedule_rows').delete().eq('schedule_id', selectedId).eq('assembly_class', cls).eq('material_role', role)
      setRowData(p => { const n = { ...p }; delete n[k]; return n })
    }
  }

  async function saveTkRow(partRole: string, matId: string) {
    if (!selectedId) return
    if (matId) {
      await supabase.from('toekick_schedule_rows').upsert(
        { schedule_id: selectedId, part_role: partRole, material_id: matId },
        { onConflict: 'schedule_id,part_role' }
      )
      setRowData(p => ({ ...p, [partRole]: matId }))
    } else {
      await supabase.from('toekick_schedule_rows').delete().eq('schedule_id', selectedId).eq('part_role', partRole)
      setRowData(p => { const n = { ...p }; delete n[partRole]; return n })
    }
  }

  async function saveFrontRow(cls: string, matId: string) {
    if (!selectedId) return
    if (matId) {
      await supabase.from('front_schedule_rows').upsert(
        { schedule_id: selectedId, assembly_class: cls, material_id: matId },
        { onConflict: 'schedule_id,assembly_class' }
      )
      setRowData(p => ({ ...p, [cls]: matId }))
    } else {
      await supabase.from('front_schedule_rows').delete().eq('schedule_id', selectedId).eq('assembly_class', cls)
      setRowData(p => { const n = { ...p }; delete n[cls]; return n })
    }
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

  // ── CSS helpers ───────────────────────────────────────────────────────────

  const sel = 'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500'
  const inp = 'bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 w-full'

  // ── Editor sections ───────────────────────────────────────────────────────

  function renderAsmGrid() {
    return (
      <div className="grid grid-cols-[130px_1fr_1fr_1fr] gap-px bg-gray-700/50 rounded overflow-hidden border border-gray-700 text-xs">
        <div className="bg-gray-800 px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Role</div>
        {CLASSES.map(c => (
          <div key={c} className="bg-gray-800 px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide capitalize">{c}</div>
        ))}
        {ASM_ROLES.map(role => (
          <Fragment key={role.key}>
            <div className="bg-gray-900 px-2 py-2 flex items-center text-xs text-gray-300">{role.label}</div>
            {CLASSES.map(cls => {
              const val = rowData[`${cls}|${role.key}`] ?? ''
              return (
                <div key={cls} className="bg-gray-900 px-2 py-2">
                  <select value={val} onChange={e => saveAsmRow(cls, role.key, e.target.value)} className={sel}>
                    {!val && <option value="">— not set —</option>}
                    {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.dz}mm)</option>)}
                  </select>
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
          const val = rowData[role.key] ?? ''
          return (
            <div key={role.key} className="flex items-center gap-3">
              <div className="w-28 shrink-0">
                <p className="text-xs text-gray-300">{role.label}</p>
                <p className="text-[9px] text-gray-600">{role.desc}</p>
              </div>
              <select value={val} onChange={e => saveTkRow(role.key, e.target.value)} className={`flex-1 ${sel}`}>
                {!val && <option value="">— not set —</option>}
                {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.dz}mm)</option>)}
              </select>
            </div>
          )
        })}
      </div>
    )
  }

  function renderFrontList() {
    return (
      <div className="space-y-3">
        {CLASSES.map(cls => {
          const val = rowData[cls] ?? ''
          return (
            <div key={cls} className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-xs text-gray-400 capitalize">{cls}</span>
              <select value={val} onChange={e => saveFrontRow(cls, e.target.value)} className={`flex-1 ${sel}`}>
                {!val && <option value="">— not set —</option>}
                {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.dz}mm)</option>)}
              </select>
            </div>
          )
        })}
      </div>
    )
  }

  function renderMatSingle(col: string) {
    const sched = (schedLists[activeTab] ?? []).find(s => s.id === selectedId)
    const val = (sched?.[col] as string) ?? ''
    return (
      <div className="flex items-center gap-3">
        <span className="w-20 shrink-0 text-xs text-gray-400">Material</span>
        <select value={val} onChange={e => saveSingleValue(col, e.target.value)} className={`flex-1 max-w-sm ${sel}`}>
          {!val && <option value="">— not set —</option>}
          {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.dz}mm)</option>)}
        </select>
      </div>
    )
  }

  function renderBtSingle() {
    const sched = (schedLists[activeTab] ?? []).find(s => s.id === selectedId)
    const val = (sched?.['benchtop_id'] as string) ?? ''
    return (
      <div className="flex items-center gap-3">
        <span className="w-20 shrink-0 text-xs text-gray-400">Benchtop</span>
        <select value={val} onChange={e => saveSingleValue('benchtop_id', e.target.value)} className={`flex-1 max-w-sm ${sel}`}>
          {!val && <option value="">— not set —</option>}
          {benchtopMats.map(m => <option key={m.id} value={m.id}>{m.name} ({m.dz}mm{m.material_type ? ` · ${m.material_type}` : ''})</option>)}
        </select>
      </div>
    )
  }

  function renderHwSingle() {
    const tab   = TABS.find(t => t.key === activeTab)!
    const col   = tab.valueCol as string
    const sched = (schedLists[activeTab] ?? []).find(s => s.id === selectedId)
    const val   = (sched?.[col] as string) ?? ''
    const catalog = activeTab === 'hinge' ? hinges : activeTab === 'slide' ? slides : handles
    const label   = activeTab === 'hinge' ? 'Hinge' : activeTab === 'slide' ? 'Slide' : 'Handle'
    return (
      <div className="flex items-center gap-3">
        <span className="w-20 shrink-0 text-xs text-gray-400">{label}</span>
        <select value={val} onChange={e => saveSingleValue(col, e.target.value)} className={`flex-1 max-w-sm ${sel}`}>
          {!val && <option value="">— not set —</option>}
          {catalog.map(item => (
            <option key={item.id} value={item.id}>{item.name}{item.brand ? ` — ${item.brand}` : ''}</option>
          ))}
        </select>
      </div>
    )
  }

  function renderEditor() {
    if (!selectedId) {
      return (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-600">
          Select a schedule to edit
        </div>
      )
    }

    const tab   = TABS.find(t => t.key === activeTab)!
    const sched = (schedLists[activeTab] ?? []).find(s => s.id === selectedId)
    if (!sched) return null

    return (
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* Name + status controls */}
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <label className="text-[10px] text-gray-500 uppercase tracking-wide mb-1 block">Name</label>
            <input value={editName} onChange={e => setEditName(e.target.value)} onBlur={saveName} className={inp} />
          </div>
          <div className="flex flex-col gap-1.5 pt-5">
            <button
              onClick={toggleActive}
              className={`text-xs px-3 py-1 rounded border transition-colors ${
                sched.active
                  ? 'border-green-700 text-green-400 hover:bg-green-900/30'
                  : 'border-gray-700 text-gray-500 hover:border-gray-600'
              }`}
            >
              {sched.active ? 'Active' : 'Inactive'}
            </button>
            {sched.is_default
              ? <span className="text-[10px] text-center px-3 py-1 rounded bg-blue-900/40 border border-blue-800 text-blue-300">Shop Default</span>
              : <button onClick={setAsDefault} className="text-xs px-3 py-1 rounded border border-gray-700 text-gray-500 hover:border-blue-700 hover:text-blue-400 transition-colors">Set Default</button>
            }
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wide mb-1 block">Description</label>
          <input value={editDesc} onChange={e => setEditDesc(e.target.value)} onBlur={saveDesc} placeholder="Optional description" className={inp} />
        </div>

        {/* Content editor */}
        <div className="border-t border-gray-800 pt-4">
          {rowsLoading && <p className="text-xs text-gray-500">Loading…</p>}
          {!rowsLoading && tab.type === 'asm_grid'   && renderAsmGrid()}
          {!rowsLoading && tab.type === 'tk_list'    && renderTkList()}
          {!rowsLoading && tab.type === 'front_list' && renderFrontList()}
          {tab.type === 'mat_single' && renderMatSingle(tab.valueCol as string)}
          {tab.type === 'bt_single'  && renderBtSingle()}
          {tab.type === 'hw_single'  && renderHwSingle()}
        </div>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-xs text-gray-500">Loading schedules…</p>
      </div>
    )
  }

  const activeList = schedLists[activeTab] ?? []

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex-none border-b border-gray-800 px-6 py-3 flex items-center gap-3">
        <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">← Projects</Link>
        <span className="text-gray-700">|</span>
        <Link href="/library/materials" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">Materials Library</Link>
        <span className="text-gray-700">|</span>
        <span className="text-sm font-semibold text-white">Schedules</span>
        <span className="text-xs text-gray-600 ml-1">· Named templates applied to jobs and rooms</span>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* Vertical tab list */}
        <div className="w-44 shrink-0 border-r border-gray-800 overflow-y-auto">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => changeTab(tab.key)}
              className={`w-full text-left px-4 py-2.5 text-xs transition-colors border-b border-gray-800/50 ${
                activeTab === tab.key
                  ? 'bg-gray-800 text-white font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Schedule list */}
        <div className="w-56 shrink-0 border-r border-gray-800 flex flex-col overflow-hidden">
          {/* New schedule input */}
          <div className="flex-none px-3 py-2.5 border-b border-gray-800 flex gap-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createSchedule()}
              placeholder="New schedule name…"
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={createSchedule}
              disabled={creating || !newName.trim()}
              className="text-xs px-2.5 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
            >
              +
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-800/50">
            {activeList.length === 0 && (
              <p className="text-[10px] text-gray-600 px-3 py-4 text-center">No schedules yet</p>
            )}
            {activeList.map(s => (
              <button
                key={s.id}
                onClick={() => selectSchedule(s.id)}
                className={`w-full text-left px-3 py-2.5 flex items-start justify-between gap-2 transition-colors group ${
                  selectedId === s.id ? 'bg-gray-800' : 'hover:bg-gray-900'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-xs truncate ${selectedId === s.id ? 'text-white' : 'text-gray-300'}`}>{s.name}</p>
                  <div className="flex gap-1.5 mt-0.5">
                    {s.is_default && <span className="text-[9px] text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded">default</span>}
                    {!s.active   && <span className="text-[9px] text-gray-600">inactive</span>}
                  </div>
                </div>
                <span
                  role="button"
                  onClick={e => { e.stopPropagation(); deleteSchedule(s.id) }}
                  className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 text-base leading-none cursor-pointer"
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
