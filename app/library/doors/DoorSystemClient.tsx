'use client'

// ============================================================
// Door System Library
// Four sub-systems behind vertical tabs (Catalogue / Material
// Schedules / Profiles / Door Styles), each a master-detail editor.
// Mirrors SchedulesClient layout + theme tokens. DB built in
// migrations door_system_schema / door_system_seed.
// ============================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'
import { ThemeToggle } from '../../ThemeToggle'

// ── Option sets (mirror the DB CHECK constraints) ───────────────────────────────

const CONSTRUCTIONS = [
  { value: 'solid_panel',     label: 'Solid Panel' },
  { value: 'frame_and_panel', label: 'Frame & Panel' },
  { value: 'profile_routed',  label: 'Profile Routed' },
] as const

const PROFILE_TYPES = [
  { value: 'perimeter_route', label: 'Perimeter Route' },
  { value: 'vj_lines',        label: 'VJ Lines' },
  { value: 'panel_raise',     label: 'Panel Raise' },
  { value: 'bead',            label: 'Bead' },
  { value: 'custom',          label: 'Custom' },
] as const

const OP_TYPES    = ['route', 'drill', 'pocket'] as const
const REPEAT_AXES = ['none', 'x', 'y'] as const
const FACES       = ['front', 'back'] as const
const GRAINS      = ['none', 'vertical', 'horizontal'] as const

// ── Types ───────────────────────────────────────────────────────────────────────

interface Catalogue {
  id: string; name: string; thickness_mm: number; construction: string
  substrate: string | null; description: string | null
  is_active: boolean; sort_order: number
}
interface Schedule {
  id: string; name: string; brand: string | null; description: string | null
  is_active: boolean; sort_order: number
}
interface CatSchedLink {
  id: string; door_catalogue_id: string; door_material_schedule_id: string; is_default: boolean
}
interface SchedMaterial {
  id: string; schedule_id: string; colour_name: string; colour_code: string | null
  brand: string | null; finish: string | null; grain_direction: string
  grain_match_required: boolean; material_id: string | null
  is_default: boolean; is_active: boolean; sort_order: number
}
interface Profile {
  id: string; name: string; profile_type: string; description: string | null
  preview_svg: string | null; is_active: boolean; sort_order: number
}
interface ProfileOp {
  id: string; profile_id: string; operation_type: string
  tool_diameter_mm: number | null; description: string | null
  depth_mm: number | null; width_mm: number | null; offset_from_edge_mm: number | null
  repeat_axis: string | null; spacing_mm: number | null; face: string
  lead_in_mm: number | null; lead_out_mm: number | null; pass_depth_mm: number | null
  feed_rate: number | null; spindle_speed: number | null
  expressions: Record<string, string> | null; sort_order: number
}
interface Style {
  id: string; name: string; door_catalogue_id: string
  door_material_schedule_id: string | null; default_material_id: string | null
  door_profile_id: string | null; description: string | null
  is_active: boolean; sort_order: number
}
interface MatItem { id: string; name: string; dz: number }

const TABS = [
  { key: 'catalogue', label: 'Catalogue' },
  { key: 'schedules', label: 'Material Schedules' },
  { key: 'profiles',  label: 'Profiles' },
  { key: 'styles',    label: 'Door Styles' },
] as const
type TabKey = typeof TABS[number]['key']

// ── Shared CSS ──────────────────────────────────────────────────────────────────

const inp   = 'bg-surface-2 border border-edge-strong rounded px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-accent w-full'
const sel   = inp
const sInp  = 'bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent w-full'
const lbl   = 'text-[10px] text-ink-subtle uppercase tracking-wide mb-1 block'
const fxInp = 'bg-surface-2/60 border border-edge-strong/60 rounded px-1.5 py-0.5 text-[10px] text-ink-muted focus:outline-none focus:border-purple-600 focus:text-purple-300 w-full font-mono'

// ════════════════════════════════════════════════════════════════════════════════

export default function DoorSystemClient({ embedded }: { embedded?: boolean }) {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('catalogue')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Datasets
  const [catalogue, setCatalogue]   = useState<Catalogue[]>([])
  const [schedules, setSchedules]   = useState<Schedule[]>([])
  const [links, setLinks]           = useState<CatSchedLink[]>([])
  const [schedMats, setSchedMats]   = useState<SchedMaterial[]>([])
  const [profiles, setProfiles]     = useState<Profile[]>([])
  const [ops, setOps]               = useState<ProfileOp[]>([])
  const [styles, setStyles]         = useState<Style[]>([])
  const [materials, setMaterials]   = useState<MatItem[]>([])

  // ── Load everything (small tables) ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      const [catR, schR, lnkR, smR, prR, opR, stR, matR] = await Promise.all([
        supabase.from('door_catalogue').select('*').order('sort_order').order('name'),
        supabase.from('door_material_schedules').select('*').order('sort_order').order('name'),
        supabase.from('door_catalogue_schedules').select('*'),
        supabase.from('door_schedule_materials').select('*').order('sort_order').order('colour_name'),
        supabase.from('door_profiles').select('*').order('sort_order').order('name'),
        supabase.from('door_profile_operations').select('*').order('sort_order'),
        supabase.from('door_styles').select('*').order('sort_order').order('name'),
        supabase.from('materials').select('id,name,dz').eq('active', true).order('name'),
      ])
      if (cancelled) return
      setCatalogue((catR.data ?? []) as Catalogue[])
      setSchedules((schR.data ?? []) as Schedule[])
      setLinks((lnkR.data ?? []) as CatSchedLink[])
      setSchedMats((smR.data ?? []) as SchedMaterial[])
      setProfiles((prR.data ?? []) as Profile[])
      setOps((opR.data ?? []) as ProfileOp[])
      setStyles((stR.data ?? []) as Style[])
      setMaterials((matR.data ?? []) as MatItem[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Tab / selection ─────────────────────────────────────────────────────────────
  function changeTab(key: TabKey) {
    setActiveTab(key)
    setSelectedId(null)
    setNewName('')
    setCreateError(null)
  }

  // ── Active list helpers ─────────────────────────────────────────────────────────
  function activeList(): { id: string; name: string; is_active: boolean }[] {
    switch (activeTab) {
      case 'catalogue': return catalogue
      case 'schedules': return schedules
      case 'profiles':  return profiles
      case 'styles':    return styles
    }
  }

  // ── Create ──────────────────────────────────────────────────────────────────────
  async function createItem() {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    setCreateError(null)
    let table = '', payload: Record<string, unknown> = { name }
    if (activeTab === 'catalogue') {
      table = 'door_catalogue'; payload = { name, thickness_mm: 18, construction: 'solid_panel' }
    } else if (activeTab === 'schedules') {
      table = 'door_material_schedules'; payload = { name }
    } else if (activeTab === 'profiles') {
      table = 'door_profiles'; payload = { name, profile_type: 'perimeter_route' }
    } else if (activeTab === 'styles') {
      // Styles need a catalogue FK (NOT NULL) — default to first catalogue entry.
      if (catalogue.length === 0) { setCreating(false); setCreateError('Create a catalogue entry first'); return }
      table = 'door_styles'; payload = { name, door_catalogue_id: catalogue[0].id }
    }
    const { data, error } = await supabase.from(table).insert(payload).select().single()
    setCreating(false)
    if (error) { setCreateError(error.message); return }
    if (!data) return
    if (activeTab === 'catalogue') setCatalogue(p => [...p, data as Catalogue])
    if (activeTab === 'schedules') setSchedules(p => [...p, data as Schedule])
    if (activeTab === 'profiles')  setProfiles(p => [...p, data as Profile])
    if (activeTab === 'styles')    setStyles(p => [...p, data as Style])
    setNewName('')
    setSelectedId((data as { id: string }).id)
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this item?')) return
    const table = activeTab === 'catalogue' ? 'door_catalogue'
      : activeTab === 'schedules' ? 'door_material_schedules'
      : activeTab === 'profiles' ? 'door_profiles' : 'door_styles'
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) { alert(`Delete failed: ${error.message}`); return }
    if (activeTab === 'catalogue') setCatalogue(p => p.filter(x => x.id !== id))
    if (activeTab === 'schedules') { setSchedules(p => p.filter(x => x.id !== id)); setSchedMats(p => p.filter(m => m.schedule_id !== id)); setLinks(p => p.filter(l => l.door_material_schedule_id !== id)) }
    if (activeTab === 'profiles')  { setProfiles(p => p.filter(x => x.id !== id)); setOps(p => p.filter(o => o.profile_id !== id)) }
    if (activeTab === 'styles')    setStyles(p => p.filter(x => x.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  // ── Generic field patch (optimistic + persist) ──────────────────────────────────
  async function patch<T extends { id: string }>(
    table: string, id: string, changes: Partial<T>,
    setter: React.Dispatch<React.SetStateAction<T[]>>,
  ) {
    setter(prev => prev.map(r => r.id === id ? { ...r, ...changes } : r))
    const { error } = await supabase.from(table).update(changes as Record<string, unknown>).eq('id', id)
    if (error) console.error(`[door ${table}] update`, error)
  }

  // ════════════════════════════════════════════════════════════════════════════════
  // CATALOGUE editor
  // ════════════════════════════════════════════════════════════════════════════════
  function renderCatalogue(c: Catalogue) {
    const linked = links.filter(l => l.door_catalogue_id === c.id)
    const isLinked = (schedId: string) => linked.some(l => l.door_material_schedule_id === schedId)

    async function toggleLink(schedId: string) {
      const existing = linked.find(l => l.door_material_schedule_id === schedId)
      if (existing) {
        await supabase.from('door_catalogue_schedules').delete().eq('id', existing.id)
        setLinks(p => p.filter(l => l.id !== existing.id))
      } else {
        const makeDefault = linked.length === 0
        const { data, error } = await supabase.from('door_catalogue_schedules')
          .insert({ door_catalogue_id: c.id, door_material_schedule_id: schedId, is_default: makeDefault })
          .select().single()
        if (error || !data) { alert(`Link failed: ${error?.message}`); return }
        setLinks(p => [...p, data as CatSchedLink])
      }
    }
    async function setLinkDefault(schedId: string) {
      const target = linked.find(l => l.door_material_schedule_id === schedId)
      if (!target) return
      await supabase.from('door_catalogue_schedules').update({ is_default: false }).eq('door_catalogue_id', c.id)
      await supabase.from('door_catalogue_schedules').update({ is_default: true }).eq('id', target.id)
      setLinks(p => p.map(l => l.door_catalogue_id === c.id ? { ...l, is_default: l.id === target.id } : l))
    }

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={lbl}>Name</label>
            <input className={inp} defaultValue={c.name}
              onBlur={e => patch<Catalogue>('door_catalogue', c.id, { name: e.target.value.trim() || c.name }, setCatalogue)} />
          </div>
          <div>
            <label className={lbl}>Thickness (mm)</label>
            <input type="number" className={inp} defaultValue={c.thickness_mm}
              onBlur={e => patch<Catalogue>('door_catalogue', c.id, { thickness_mm: parseFloat(e.target.value) || c.thickness_mm }, setCatalogue)} />
          </div>
          <div>
            <label className={lbl}>Construction</label>
            <select className={sel} value={c.construction}
              onChange={e => patch<Catalogue>('door_catalogue', c.id, { construction: e.target.value }, setCatalogue)}>
              {CONSTRUCTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Substrate</label>
            <input className={inp} defaultValue={c.substrate ?? ''} placeholder="MDF, particleboard…"
              onBlur={e => patch<Catalogue>('door_catalogue', c.id, { substrate: e.target.value.trim() || null }, setCatalogue)} />
          </div>
          <div>
            <label className={lbl}>Sort order</label>
            <input type="number" className={inp} defaultValue={c.sort_order}
              onBlur={e => patch<Catalogue>('door_catalogue', c.id, { sort_order: parseInt(e.target.value) || 0 }, setCatalogue)} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>Description</label>
            <input className={inp} defaultValue={c.description ?? ''}
              onBlur={e => patch<Catalogue>('door_catalogue', c.id, { description: e.target.value.trim() || null }, setCatalogue)} />
          </div>
        </div>

        {/* Linked schedules (m2m) */}
        <div className="border-t border-edge pt-4">
          <label className={lbl}>Material schedules available for this door</label>
          {schedules.length === 0
            ? <p className="text-[10px] text-ink-subtle">No material schedules yet — create some in the Material Schedules tab.</p>
            : <div className="space-y-1.5">
                {schedules.map(s => {
                  const on = isLinked(s.id)
                  const link = linked.find(l => l.door_material_schedule_id === s.id)
                  return (
                    <div key={s.id} className="flex items-center gap-2.5">
                      <label className="flex items-center gap-2 cursor-pointer flex-1">
                        <input type="checkbox" checked={on} onChange={() => toggleLink(s.id)} className="accent-[var(--accent,#2563eb)]" />
                        <span className={`text-xs ${on ? 'text-ink' : 'text-ink-muted'}`}>{s.name}{s.brand ? ` — ${s.brand}` : ''}</span>
                      </label>
                      {on && (link?.is_default
                        ? <span className="text-[9px] text-accent-ink bg-accent/10 px-1.5 py-0.5 rounded">default</span>
                        : <button onClick={() => setLinkDefault(s.id)} className="text-[9px] text-ink-subtle hover:text-accent-ink transition-colors">set default</button>)}
                    </div>
                  )
                })}
              </div>}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════════
  // MATERIAL SCHEDULE editor (+ child materials)
  // ════════════════════════════════════════════════════════════════════════════════
  function renderSchedule(s: Schedule) {
    const mats = schedMats.filter(m => m.schedule_id === s.id)

    async function addMaterial() {
      const { data, error } = await supabase.from('door_schedule_materials')
        .insert({ schedule_id: s.id, colour_name: 'New colour', grain_direction: 'none' })
        .select().single()
      if (error || !data) { alert(`Add failed: ${error?.message}`); return }
      setSchedMats(p => [...p, data as SchedMaterial])
    }
    async function delMaterial(id: string) {
      await supabase.from('door_schedule_materials').delete().eq('id', id)
      setSchedMats(p => p.filter(m => m.id !== id))
    }
    function patchMat(id: string, changes: Partial<SchedMaterial>) {
      patch<SchedMaterial>('door_schedule_materials', id, changes, setSchedMats)
    }

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Name</label>
            <input className={inp} defaultValue={s.name}
              onBlur={e => patch<Schedule>('door_material_schedules', s.id, { name: e.target.value.trim() || s.name }, setSchedules)} />
          </div>
          <div>
            <label className={lbl}>Brand</label>
            <input className={inp} defaultValue={s.brand ?? ''} placeholder="Polytec, Laminex…"
              onBlur={e => patch<Schedule>('door_material_schedules', s.id, { brand: e.target.value.trim() || null }, setSchedules)} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>Description</label>
            <input className={inp} defaultValue={s.description ?? ''}
              onBlur={e => patch<Schedule>('door_material_schedules', s.id, { description: e.target.value.trim() || null }, setSchedules)} />
          </div>
        </div>

        <div className="border-t border-edge pt-4">
          <div className="flex items-center justify-between mb-2">
            <label className={lbl + ' mb-0'}>Colours / finishes ({mats.length})</label>
            <button onClick={addMaterial} className="text-xs px-2.5 py-1 bg-accent hover:bg-accent-hover text-white rounded transition-colors">+ Add colour</button>
          </div>

          {mats.length === 0
            ? <p className="text-[10px] text-ink-subtle">No colours yet.</p>
            : <div className="space-y-2">
                {mats.map(m => (
                  <div key={m.id} className="bg-surface-2/40 border border-edge rounded p-2.5 space-y-2">
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div>
                        <label className={lbl}>Colour name</label>
                        <input className={sInp} defaultValue={m.colour_name}
                          onBlur={e => patchMat(m.id, { colour_name: e.target.value.trim() || m.colour_name })} />
                      </div>
                      <div>
                        <label className={lbl}>Code</label>
                        <input className={sInp} defaultValue={m.colour_code ?? ''}
                          onBlur={e => patchMat(m.id, { colour_code: e.target.value.trim() || null })} />
                      </div>
                      <button onClick={() => delMaterial(m.id)} className="text-ink-subtle hover:text-red-400 text-base leading-none px-1 pb-1.5">×</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className={lbl}>Finish</label>
                        <input className={sInp} defaultValue={m.finish ?? ''} placeholder="Matt, Gloss…"
                          onBlur={e => patchMat(m.id, { finish: e.target.value.trim() || null })} />
                      </div>
                      <div>
                        <label className={lbl}>Grain</label>
                        <select className={sInp} value={m.grain_direction} onChange={e => patchMat(m.id, { grain_direction: e.target.value })}>
                          {GRAINS.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Linked board</label>
                        <select className={sInp} value={m.material_id ?? ''} onChange={e => patchMat(m.id, { material_id: e.target.value || null })}>
                          <option value="">— none —</option>
                          {materials.map(b => <option key={b.id} value={b.id}>{b.name} ({b.dz}mm)</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 pt-0.5">
                      <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-ink-muted">
                        <input type="checkbox" checked={m.grain_match_required} onChange={e => patchMat(m.id, { grain_match_required: e.target.checked })} />
                        Grain match required
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-ink-muted">
                        <input type="checkbox" checked={m.is_active} onChange={e => patchMat(m.id, { is_active: e.target.checked })} />
                        Active
                      </label>
                    </div>
                  </div>
                ))}
              </div>}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════════
  // PROFILE editor (+ operations)
  // ════════════════════════════════════════════════════════════════════════════════
  function renderProfile(p: Profile) {
    const profOps = ops.filter(o => o.profile_id === p.id)

    async function addOp() {
      const nextOrder = profOps.length ? Math.max(...profOps.map(o => o.sort_order)) + 1 : 1
      const { data, error } = await supabase.from('door_profile_operations')
        .insert({ profile_id: p.id, operation_type: 'route', face: 'front', repeat_axis: 'none', sort_order: nextOrder })
        .select().single()
      if (error || !data) { alert(`Add failed: ${error?.message}`); return }
      setOps(prev => [...prev, data as ProfileOp])
    }
    async function delOp(id: string) {
      await supabase.from('door_profile_operations').delete().eq('id', id)
      setOps(prev => prev.filter(o => o.id !== id))
    }
    function patchOp(id: string, changes: Partial<ProfileOp>) {
      patch<ProfileOp>('door_profile_operations', id, changes, setOps)
    }
    // Formula override: write into expressions jsonb keyed by field name (joints pattern).
    function patchFormula(op: ProfileOp, field: string, raw: string) {
      const expr = { ...(op.expressions ?? {}) }
      if (raw.trim()) expr[field] = raw.trim()
      else delete expr[field]
      patchOp(op.id, { expressions: Object.keys(expr).length ? expr : null })
    }

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Name</label>
            <input className={inp} defaultValue={p.name}
              onBlur={e => patch<Profile>('door_profiles', p.id, { name: e.target.value.trim() || p.name }, setProfiles)} />
          </div>
          <div>
            <label className={lbl}>Profile type</label>
            <select className={sel} value={p.profile_type}
              onChange={e => patch<Profile>('door_profiles', p.id, { profile_type: e.target.value }, setProfiles)}>
              {PROFILE_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={lbl}>Description</label>
            <input className={inp} defaultValue={p.description ?? ''}
              onBlur={e => patch<Profile>('door_profiles', p.id, { description: e.target.value.trim() || null }, setProfiles)} />
          </div>
        </div>

        <div className="border-t border-edge pt-4">
          <div className="flex items-center justify-between mb-2">
            <label className={lbl + ' mb-0'}>Operations ({profOps.length})</label>
            <button onClick={addOp} className="text-xs px-2.5 py-1 bg-accent hover:bg-accent-hover text-white rounded transition-colors">+ Add operation</button>
          </div>
          <p className="text-[10px] text-ink-subtle mb-3">
            Each row is one CNC pass. Fields take a fixed value; the small formula box overrides it at
            resolve time (e.g. <span className="font-mono">@door.DX * 0.08</span>). Formula wiring is built in the resolver phase.
          </p>

          {profOps.length === 0
            ? <p className="text-[10px] text-ink-subtle">No operations yet.</p>
            : <div className="space-y-2.5">
                {profOps.map((o, i) => (
                  <div key={o.id} className="bg-surface-2/40 border border-edge rounded p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-ink-subtle">#{i + 1}</span>
                      <button onClick={() => delOp(o.id)} className="text-ink-subtle hover:text-red-400 text-base leading-none">×</button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <OpSelect label="Type"   value={o.operation_type} opts={OP_TYPES as readonly string[]} onChange={v => patchOp(o.id, { operation_type: v })} />
                      <OpSelect label="Face"   value={o.face}           opts={FACES as readonly string[]}    onChange={v => patchOp(o.id, { face: v })} />
                      <OpSelect label="Repeat" value={o.repeat_axis ?? 'none'} opts={REPEAT_AXES as readonly string[]} onChange={v => patchOp(o.id, { repeat_axis: v })} />
                      <OpNumPlain label="Tool ⌀" value={o.tool_diameter_mm} onChange={v => patchOp(o.id, { tool_diameter_mm: v })} />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <OpNumFx op={o} label="Depth"  field="depth_mm"            value={o.depth_mm}            onValue={v => patchOp(o.id, { depth_mm: v })}            onFx={patchFormula} />
                      <OpNumFx op={o} label="Width"  field="width_mm"            value={o.width_mm}            onValue={v => patchOp(o.id, { width_mm: v })}            onFx={patchFormula} />
                      <OpNumFx op={o} label="Edge offset" field="offset_from_edge_mm" value={o.offset_from_edge_mm} onValue={v => patchOp(o.id, { offset_from_edge_mm: v })} onFx={patchFormula} />
                      <OpNumFx op={o} label="Spacing" field="spacing_mm"         value={o.spacing_mm}          onValue={v => patchOp(o.id, { spacing_mm: v })}          onFx={patchFormula} />
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      <OpNumPlain label="Lead in"  value={o.lead_in_mm}    onChange={v => patchOp(o.id, { lead_in_mm: v })} />
                      <OpNumPlain label="Lead out" value={o.lead_out_mm}   onChange={v => patchOp(o.id, { lead_out_mm: v })} />
                      <OpNumPlain label="Pass dep" value={o.pass_depth_mm} onChange={v => patchOp(o.id, { pass_depth_mm: v })} />
                      <OpNumPlain label="Feed"     value={o.feed_rate}     onChange={v => patchOp(o.id, { feed_rate: v })} />
                      <OpNumPlain label="RPM"      value={o.spindle_speed} onChange={v => patchOp(o.id, { spindle_speed: v })} integer />
                    </div>
                    <div>
                      <label className={lbl}>Description</label>
                      <input className={sInp} defaultValue={o.description ?? ''}
                        onBlur={e => patchOp(o.id, { description: e.target.value.trim() || null })} />
                    </div>
                  </div>
                ))}
              </div>}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════════
  // DOOR STYLE editor
  // ════════════════════════════════════════════════════════════════════════════════
  function renderStyle(st: Style) {
    // Materials available for the chosen schedule (for the default-colour picker).
    const schedMatOpts = st.door_material_schedule_id
      ? schedMats.filter(m => m.schedule_id === st.door_material_schedule_id)
      : []
    return (
      <div className="space-y-5">
        <div>
          <label className={lbl}>Name</label>
          <input className={inp} defaultValue={st.name}
            onBlur={e => patch<Style>('door_styles', st.id, { name: e.target.value.trim() || st.name }, setStyles)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Door catalogue *</label>
            <select className={sel} value={st.door_catalogue_id}
              onChange={e => patch<Style>('door_styles', st.id, { door_catalogue_id: e.target.value }, setStyles)}>
              {catalogue.map(c => <option key={c.id} value={c.id}>{c.name} ({c.thickness_mm}mm)</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Profile</label>
            <select className={sel} value={st.door_profile_id ?? ''}
              onChange={e => patch<Style>('door_styles', st.id, { door_profile_id: e.target.value || null }, setStyles)}>
              <option value="">— flat (no profile) —</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Material schedule</label>
            <select className={sel} value={st.door_material_schedule_id ?? ''}
              onChange={e => patch<Style>('door_styles', st.id, { door_material_schedule_id: e.target.value || null, default_material_id: null }, setStyles)}>
              <option value="">— none (paint on site) —</option>
              {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Default colour</label>
            <select className={sel} value={st.default_material_id ?? ''} disabled={!st.door_material_schedule_id}
              onChange={e => patch<Style>('door_styles', st.id, { default_material_id: e.target.value || null }, setStyles)}>
              <option value="">— none —</option>
              {schedMatOpts.map(m => <option key={m.id} value={m.id}>{m.colour_name}{m.colour_code ? ` (${m.colour_code})` : ''}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={lbl}>Description</label>
            <input className={inp} defaultValue={st.description ?? ''}
              onBlur={e => patch<Style>('door_styles', st.id, { description: e.target.value.trim() || null }, setStyles)} />
          </div>
        </div>
      </div>
    )
  }

  // ── Active-toggle + editor dispatch ───────────────────────────────────────────────
  function toggleActive(id: string) {
    if (activeTab === 'catalogue') { const c = catalogue.find(x => x.id === id); if (c) patch<Catalogue>('door_catalogue', id, { is_active: !c.is_active }, setCatalogue) }
    if (activeTab === 'schedules') { const s = schedules.find(x => x.id === id); if (s) patch<Schedule>('door_material_schedules', id, { is_active: !s.is_active }, setSchedules) }
    if (activeTab === 'profiles')  { const p = profiles.find(x => x.id === id); if (p) patch<Profile>('door_profiles', id, { is_active: !p.is_active }, setProfiles) }
    if (activeTab === 'styles')    { const s = styles.find(x => x.id === id); if (s) patch<Style>('door_styles', id, { is_active: !s.is_active }, setStyles) }
  }

  function renderEditor() {
    if (!selectedId) {
      return <div className="flex-1 flex items-center justify-center text-xs text-ink-subtle">Select an item to edit</div>
    }
    const item = activeList().find(x => x.id === selectedId)
    if (!item) return null
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-end gap-2 border-b border-edge px-6 py-2.5">
          <button onClick={() => toggleActive(item.id)}
            className={`text-xs px-3 py-1 rounded border transition-colors ${
              item.is_active ? 'border-green-700 text-green-400 hover:bg-green-900/30' : 'border-edge-strong text-ink-subtle'
            }`}>
            {item.is_active ? 'Active' : 'Inactive'}
          </button>
        </div>
        <div className="px-6 py-5">
          {activeTab === 'catalogue' && renderCatalogue(item as unknown as Catalogue)}
          {activeTab === 'schedules' && renderSchedule(item as unknown as Schedule)}
          {activeTab === 'profiles'  && renderProfile(item as unknown as Profile)}
          {activeTab === 'styles'    && renderStyle(item as unknown as Style)}
        </div>
      </div>
    )
  }

  // ── Main render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={embedded ? 'flex-1 flex items-center justify-center' : 'h-screen bg-canvas flex items-center justify-center'}>
        <p className="text-xs text-ink-subtle">Loading door system…</p>
      </div>
    )
  }

  const list = activeList()
  const newPlaceholder = activeTab === 'catalogue' ? 'New door…'
    : activeTab === 'schedules' ? 'New schedule…'
    : activeTab === 'profiles' ? 'New profile…' : 'New style…'

  return (
    <div className={embedded ? 'flex-1 flex flex-col overflow-hidden' : 'h-screen bg-canvas text-ink flex flex-col overflow-hidden'}>
      {!embedded && (
        <div className="flex-none border-b border-edge px-6 py-3 flex items-center gap-3">
          <ThemeToggle />
          <Link href="/" className="text-ink-subtle hover:text-ink-muted text-sm transition-colors">← Projects</Link>
          <span className="text-ink-subtle">|</span>
          <span className="text-sm font-semibold text-ink">Doors</span>
          <span className="text-xs text-ink-subtle ml-1">· Catalogue, material schedules, profiles & styles</span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Vertical tab list */}
        <div className="w-44 shrink-0 border-r border-edge overflow-y-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => changeTab(t.key)}
              className={`w-full text-left px-4 py-2.5 text-xs transition-colors border-b border-edge/50 ${
                activeTab === t.key ? 'bg-surface-2 text-ink font-semibold' : 'text-ink-muted hover:text-ink hover:bg-surface'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Item list */}
        <div className="w-56 shrink-0 border-r border-edge flex flex-col overflow-hidden">
          <div className="flex-none border-b border-edge">
            <div className="px-3 py-2.5 flex gap-2">
              <input value={newName} onChange={e => { setNewName(e.target.value); setCreateError(null) }}
                onKeyDown={e => e.key === 'Enter' && createItem()} placeholder={newPlaceholder}
                className="flex-1 bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink placeholder-ink-subtle focus:outline-none focus:border-accent" />
              <button onClick={createItem} disabled={creating || !newName.trim()}
                className="text-xs px-2.5 py-1 bg-accent hover:bg-accent-hover disabled:bg-surface-3 disabled:text-ink-subtle text-white rounded transition-colors">
                {creating ? '…' : '+'}
              </button>
            </div>
            {createError && <p className="px-3 pb-2 text-[10px] text-red-400">{createError}</p>}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-edge/50">
            {list.length === 0 && <p className="text-[10px] text-ink-subtle px-3 py-4 text-center">Nothing here yet</p>}
            {list.map(it => (
              <button key={it.id} onClick={() => setSelectedId(it.id)}
                className={`w-full text-left px-3 py-2.5 flex items-start justify-between gap-2 transition-colors group ${
                  selectedId === it.id ? 'bg-surface-2' : 'hover:bg-surface'
                }`}>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs truncate ${selectedId === it.id ? 'text-ink' : 'text-ink-muted'}`}>{it.name}</p>
                  {!it.is_active && <span className="text-[9px] text-ink-subtle">inactive</span>}
                </div>
                <span role="button" onClick={e => { e.stopPropagation(); deleteItem(it.id) }}
                  className="text-ink-subtle hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 text-base leading-none cursor-pointer">×</span>
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

// ── Small field components ────────────────────────────────────────────────────────

function OpSelect({ label, value, opts, onChange }: {
  label: string; value: string; opts: readonly string[]; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <select className={sInp} value={value} onChange={e => onChange(e.target.value)}>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function OpNumPlain({ label, value, onChange, integer }: {
  label: string; value: number | null; onChange: (v: number | null) => void; integer?: boolean
}) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type="number" className={sInp} defaultValue={value ?? ''}
        onBlur={e => {
          const raw = e.target.value.trim()
          if (raw === '') return onChange(null)
          const n = integer ? parseInt(raw) : parseFloat(raw)
          onChange(Number.isFinite(n) ? n : null)
        }} />
    </div>
  )
}

function OpNumFx({ op, label, field, value, onValue, onFx }: {
  op: ProfileOp; label: string; field: string; value: number | null
  onValue: (v: number | null) => void
  onFx: (op: ProfileOp, field: string, raw: string) => void
}) {
  const formula = op.expressions?.[field] ?? ''
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type="number" className={sInp} defaultValue={value ?? ''} disabled={!!formula}
        onBlur={e => {
          const raw = e.target.value.trim()
          if (raw === '') return onValue(null)
          const n = parseFloat(raw)
          onValue(Number.isFinite(n) ? n : null)
        }} />
      <input className={fxInp + ' mt-1'} defaultValue={formula} placeholder="ƒ override"
        key={formula} onBlur={e => onFx(op, field, e.target.value)} />
    </div>
  )
}
