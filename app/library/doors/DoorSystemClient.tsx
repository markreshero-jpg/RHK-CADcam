'use client'

// ============================================================
// Door System Library
// Four sub-systems behind vertical tabs (Door Styles / Door
// Blanks / Colour Ranges / Profiles), each a master-detail editor.
// Mirrors SchedulesClient layout + theme tokens. DB built in
// migrations door_system_schema / door_system_seed.
// ============================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'
import { ThemeToggle } from '../../ThemeToggle'
import OperationToolSelect from '@/src/components/cnc/OperationToolSelect'
import { DoorStylePreview, dbOpsToRawProfileOps } from '@/src/components/DoorStylePreview'
import type { ResolvedDoorProfile } from '@/src/lib/resolver/types'

// ── Option sets (mirror the DB CHECK constraints) ───────────────────────────────

const CONSTRUCTIONS = [
  { value: 'solid_panel',     label: 'Solid Panel' },
  { value: 'frame_and_panel', label: 'Frame & Panel' },
  { value: 'profile_routed',  label: 'Profile Routed' },
] as const

// Display labels only — DB values are fixed by the door_profiles CHECK
// constraint. Only 'vj_lines' behaves differently (forces repeated grooves);
// the rest are descriptive categories over the profile's operations.
const PROFILE_TYPES = [
  { value: 'perimeter_route', label: 'Frame Route (Shaker-style)' },
  { value: 'vj_lines',        label: 'VJ Lines (repeated grooves)' },
  { value: 'panel_raise',     label: 'Panel Raise' },
  { value: 'bead',            label: 'Bead' },
  { value: 'custom',          label: 'Custom' },
] as const

const OP_TYPES    = ['route', 'drill', 'pocket', 'outline', 'square_off', 'profile', 'groove', 'raster'] as const
const REPEAT_AXES = ['none', 'x', 'y'] as const
const FACES       = ['front', 'back'] as const
const GRAINS      = ['none', 'vertical', 'horizontal'] as const
const FILL_STRATEGIES = ['raster', 'spiral_in', 'spiral_out'] as const
// Per-side offsets + fill apply to area ops; fill/raster params apply to pocket+raster.
const AREA_OPS = ['pocket', 'outline', 'square_off'] as const
const FILL_OPS = ['pocket', 'raster'] as const

// ── Types ───────────────────────────────────────────────────────────────────────

interface Catalogue {
  id: string; name: string; thickness_mm: number; construction: string
  substrate: string | null; description: string | null
  is_active: boolean; sort_order: number
  edge_band_top: boolean; edge_band_bottom: boolean
  edge_band_left: boolean; edge_band_right: boolean
}
interface Schedule {
  id: string; name: string; brand: string | null; description: string | null
  is_active: boolean; sort_order: number
}
interface SchedMaterial {
  id: string; schedule_id: string; colour_name: string; colour_code: string | null
  brand: string | null; finish: string | null; grain_direction: string
  grain_match_required: boolean; material_id: string | null
  edgeband_id: string | null
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
  // CNC routing extensions (migration routing_part_and_door_op_extensions)
  // Three-column tool pattern (drill_block_3_tool_assignment_refactor)
  router_tool_id: string | null; drill_id: string | null; auto_tool: boolean
  tool_set_id: string | null
  offset_top_mm: number | null; offset_bottom_mm: number | null
  offset_left_mm: number | null; offset_right_mm: number | null
  fill_strategy: string | null; raster_angle_deg: number | null; raster_stepover_pct: number | null
}
interface CncToolItem { id: string; name: string; tool_number: string | null }
interface CncDrillItem { id: string; name: string; diameter: number | null }
interface ToolSetItem { id: string; name: string }
interface Style {
  id: string; name: string; door_catalogue_id: string
  door_material_schedule_id: string | null; default_material_id: string | null
  door_profile_id: string | null; description: string | null
  is_active: boolean; sort_order: number
}
interface MatItem { id: string; name: string; dz: number; face_colour: string | null }
interface EdgeBand { id: string; name: string; thickness: number; color: string | null }

const TABS = [
  { key: 'styles',    label: 'Door Styles' },
  { key: 'catalogue', label: 'Door Blanks' },
  { key: 'schedules', label: 'Colour Ranges' },
  { key: 'profiles',  label: 'Profiles' },
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
  const [activeTab, setActiveTab] = useState<TabKey>('styles')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)

  // Datasets
  const [catalogue, setCatalogue]   = useState<Catalogue[]>([])
  const [schedules, setSchedules]   = useState<Schedule[]>([])
  const [schedMats, setSchedMats]   = useState<SchedMaterial[]>([])
  const [profiles, setProfiles]     = useState<Profile[]>([])
  const [ops, setOps]               = useState<ProfileOp[]>([])
  const [styles, setStyles]         = useState<Style[]>([])
  const [materials, setMaterials]   = useState<MatItem[]>([])
  const [edgeBands, setEdgeBands]   = useState<EdgeBand[]>([])
  const [cncTools, setCncTools]     = useState<CncToolItem[]>([])
  const [cncDrills, setCncDrills]   = useState<CncDrillItem[]>([])
  const [toolSets, setToolSets]     = useState<ToolSetItem[]>([])

  // ── Load everything (small tables) ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      const [catR, schR, smR, prR, opR, stR, matR, ebR, toolR, drillR, tsR] = await Promise.all([
        supabase.from('door_catalogue').select('*').order('sort_order').order('name'),
        supabase.from('door_material_schedules').select('*').order('sort_order').order('name'),
        supabase.from('door_schedule_materials').select('*').order('sort_order').order('colour_name'),
        supabase.from('door_profiles').select('*').order('sort_order').order('name'),
        supabase.from('door_profile_operations').select('*').order('sort_order'),
        supabase.from('door_styles').select('*').order('sort_order').order('name'),
        supabase.from('materials').select('id,name,dz,face_colour').eq('active', true).order('name'),
        supabase.from('edge_banding').select('id,name,thickness,color').eq('active', true).order('name'),
        supabase.from('cnc_tools').select('id,name,tool_number').eq('active', true).order('tool_number', { nullsFirst: false }),
        supabase.from('cnc_drills').select('id,name,diameter').eq('is_active', true).order('diameter'),
        supabase.from('cnc_tool_sets').select('id,name').eq('is_active', true).order('sort_order').order('name'),
      ])
      if (cancelled) return
      setCatalogue((catR.data ?? []) as Catalogue[])
      setSchedules((schR.data ?? []) as Schedule[])
      setSchedMats((smR.data ?? []) as SchedMaterial[])
      setProfiles((prR.data ?? []) as Profile[])
      setOps((opR.data ?? []) as ProfileOp[])
      setStyles((stR.data ?? []) as Style[])
      setMaterials((matR.data ?? []) as MatItem[])
      setEdgeBands((ebR.data ?? []) as EdgeBand[])
      setCncTools((toolR.data ?? []) as CncToolItem[])
      setCncDrills((drillR.data ?? []) as CncDrillItem[])
      setToolSets((tsR.data ?? []) as ToolSetItem[])
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
      // Styles need a catalogue FK (NOT NULL) — default to first door blank.
      if (catalogue.length === 0) { setCreating(false); setCreateError('Create a door blank first'); return }
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
    if (activeTab === 'schedules') { setSchedules(p => p.filter(x => x.id !== id)); setSchedMats(p => p.filter(m => m.schedule_id !== id)) }
    if (activeTab === 'profiles')  { setProfiles(p => p.filter(x => x.id !== id)); setOps(p => p.filter(o => o.profile_id !== id)) }
    if (activeTab === 'styles')    setStyles(p => p.filter(x => x.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  // ── Duplicate a material schedule (+ all its colour rows) ────────────────────────
  async function duplicateSchedule(id: string) {
    const src = schedules.find(s => s.id === id)
    if (!src) return
    const { data: newSched, error } = await supabase.from('door_material_schedules')
      .insert({ name: `${src.name} (copy)`, brand: src.brand, description: src.description, sort_order: src.sort_order })
      .select().single()
    if (error || !newSched) { alert(`Copy failed: ${error?.message}`); return }

    let newMats: SchedMaterial[] = []
    const mats = schedMats.filter(m => m.schedule_id === id)
    if (mats.length) {
      const payload = mats.map(m => ({
        schedule_id: (newSched as Schedule).id,
        colour_name: m.colour_name, colour_code: m.colour_code, brand: m.brand,
        finish: m.finish, grain_direction: m.grain_direction, grain_match_required: m.grain_match_required,
        material_id: m.material_id, edgeband_id: m.edgeband_id,
        is_default: m.is_default, is_active: m.is_active, sort_order: m.sort_order,
      }))
      const { data: inserted, error: mErr } = await supabase.from('door_schedule_materials').insert(payload).select()
      if (mErr) { alert(`Copied schedule but colours failed: ${mErr.message}`) }
      newMats = (inserted ?? []) as SchedMaterial[]
    }
    setSchedules(p => [...p, newSched as Schedule])
    setSchedMats(p => [...p, ...newMats])
    setSelectedId((newSched as Schedule).id)
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

        {/* Edge banding — which edges of the door blank get taped */}
        <div className="border-t border-edge pt-4">
          <label className={lbl}>Banded edges</label>
          <p className="text-[10px] text-ink-subtle mb-2">
            Which edges get edge tape. The tape product is colour-matched per colour in the Colour Range.
          </p>
          <div className="flex flex-wrap gap-4">
            {([
              ['Top',    'edge_band_top'],
              ['Bottom', 'edge_band_bottom'],
              ['Left',   'edge_band_left'],
              ['Right',  'edge_band_right'],
            ] as const).map(([label, field]) => (
              <label key={field} className="flex items-center gap-1.5 cursor-pointer text-xs text-ink-muted">
                <input type="checkbox" checked={c[field]} className="accent-[var(--accent,#2563eb)]"
                  onChange={e => patch<Catalogue>('door_catalogue', c.id, { [field]: e.target.checked } as Partial<Catalogue>, setCatalogue)} />
                {label}
              </label>
            ))}
          </div>
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
                    <div>
                      <label className={lbl}>Edge band (colour-matched tape)</label>
                      <select className={sInp} value={m.edgeband_id ?? ''} onChange={e => patchMat(m.id, { edgeband_id: e.target.value || null })}>
                        <option value="">— none —</option>
                        {edgeBands.map(b => <option key={b.id} value={b.id}>{b.name} ({b.thickness}mm){b.color ? ` · ${b.color}` : ''}</option>)}
                      </select>
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
        .insert({ profile_id: p.id, operation_type: 'route', face: 'front', repeat_axis: 'none', auto_tool: true, sort_order: nextOrder })
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
        <div className="flex gap-5">
          <div className="flex-1 grid grid-cols-2 gap-3 content-start">
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
          {/* Live preview — re-renders as operations below are edited */}
          <div className="shrink-0 bg-surface-2/30 border border-edge rounded p-2.5 flex items-start">
            <DoorStylePreview
              className="h-44"
              profileType={p.profile_type as ResolvedDoorProfile['profile_type']}
              ops={dbOpsToRawProfileOps(profOps as unknown as Record<string, unknown>[])}
              caption="450 × 720 sample" />
          </div>
        </div>

        <div className="border-t border-edge pt-4">
          <div className="flex items-center justify-between mb-2">
            <label className={lbl + ' mb-0'}>Operations ({profOps.length})</label>
            <button onClick={addOp} className="text-xs px-2.5 py-1 bg-accent hover:bg-accent-hover text-white rounded transition-colors">+ Add operation</button>
          </div>
          <p className="text-[10px] text-ink-subtle mb-3">
            Each row is one CNC pass. Fields take a fixed value; the small formula box overrides it at
            resolve time. Variables: <span className="font-mono">W</span> (panel width),
            <span className="font-mono"> H</span> (height), <span className="font-mono">T</span> (thickness),
            <span className="font-mono"> TD</span> (tool ⌀) — e.g. <span className="font-mono">W * 0.08</span>.
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

                    {/* Tool set / tool selection. A tool set runs its full sequence and
                        supersedes the individual tool, so the tool picker hides when set. */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={lbl}>Tool set</label>
                        <select className={sInp} value={o.tool_set_id ?? ''} onChange={e => patchOp(o.id, { tool_set_id: e.target.value || null })}>
                          <option value="">— none —</option>
                          {toolSets.map(ts => <option key={ts.id} value={ts.id}>{ts.name}</option>)}
                        </select>
                      </div>
                      {!o.tool_set_id && (
                        <div>
                          <label className={lbl}>Tool</label>
                          <OperationToolSelect
                            operationType={o.operation_type}
                            value={{ router_tool_id: o.router_tool_id, drill_id: o.drill_id, auto_tool: o.auto_tool }}
                            tools={cncTools} drills={cncDrills}
                            onChange={v => patchOp(o.id, v)}
                            className={sInp} />
                        </div>
                      )}
                    </div>

                    {/* Per-side offsets for area ops. Blank fields fall back to the
                        single Edge offset above (square inset). */}
                    {(AREA_OPS as readonly string[]).includes(o.operation_type) && (
                      <div className="grid grid-cols-4 gap-2">
                        <OpNumPlain label="Off top"    value={o.offset_top_mm    ?? o.offset_from_edge_mm} onChange={v => patchOp(o.id, { offset_top_mm: v })} />
                        <OpNumPlain label="Off bottom" value={o.offset_bottom_mm ?? o.offset_from_edge_mm} onChange={v => patchOp(o.id, { offset_bottom_mm: v })} />
                        <OpNumPlain label="Off left"   value={o.offset_left_mm   ?? o.offset_from_edge_mm} onChange={v => patchOp(o.id, { offset_left_mm: v })} />
                        <OpNumPlain label="Off right"  value={o.offset_right_mm  ?? o.offset_from_edge_mm} onChange={v => patchOp(o.id, { offset_right_mm: v })} />
                      </div>
                    )}

                    {/* Fill strategy + raster params for pocket / raster ops. */}
                    {(FILL_OPS as readonly string[]).includes(o.operation_type) && (
                      <div className="grid grid-cols-3 gap-2">
                        <OpSelect label="Fill" value={o.fill_strategy ?? ''} opts={['', ...FILL_STRATEGIES] as readonly string[]} onChange={v => patchOp(o.id, { fill_strategy: v || null })} />
                        <OpNumPlain label="Raster°"  value={o.raster_angle_deg}    onChange={v => patchOp(o.id, { raster_angle_deg: v })} />
                        <OpNumPlain label="Step %"   value={o.raster_stepover_pct} onChange={v => patchOp(o.id, { raster_stepover_pct: v })} />
                      </div>
                    )}

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

  // Completeness check: everything that would make a job using this style cut
  // something other than what the name promises. 'warn' issues badge the list.
  function styleIssues(st: Style): { level: 'warn' | 'info'; text: string }[] {
    const issues: { level: 'warn' | 'info'; text: string }[] = []
    const cat = catalogue.find(c => c.id === st.door_catalogue_id)
    if (!st.door_material_schedule_id) {
      issues.push({ level: 'info', text: 'No colour range — fronts cut from the carcass door material (paint on site).' })
      return issues
    }
    const cols = schedMats.filter(m => m.schedule_id === st.door_material_schedule_id && m.is_active)
    if (cols.length === 0) {
      issues.push({ level: 'warn', text: 'Colour range has no active colours — fronts cut from the carcass door material.' })
      return issues
    }
    if (!st.default_material_id) {
      issues.push({ level: 'warn', text: 'No default colour — jobs must pick a colour explicitly or fronts cut from the carcass door material.' })
    }
    const unlinked = cols.filter(c => !c.material_id)
    if (unlinked.length > 0) {
      issues.push({ level: 'warn', text: `${unlinked.length} colour${unlinked.length > 1 ? 's' : ''} not linked to a board (${unlinked.map(c => c.colour_name).join(', ')}) — those cut from the carcass door material.` })
    }
    // Board vs blank thickness — 1mm tolerance so nominal-16 boards at 16.5 don't flag.
    if (cat) {
      for (const c of cols) {
        const board = c.material_id ? materials.find(b => b.id === c.material_id) : undefined
        if (board && Math.abs(Number(board.dz) - Number(cat.thickness_mm)) > 1) {
          issues.push({ level: 'warn', text: `“${c.colour_name}” board is ${board.dz}mm but the blank is ${cat.thickness_mm}mm — parts would cut at the wrong thickness.` })
        }
      }
    }
    return issues
  }

  function renderStyle(st: Style) {
    // Materials available for the chosen schedule (for the default-colour picker).
    const schedMatOpts = st.door_material_schedule_id
      ? schedMats.filter(m => m.schedule_id === st.door_material_schedule_id)
      : []
    const issues = styleIssues(st)
    // Live bundle preview: blank thickness + profile routing + default colour board.
    const pvCat   = catalogue.find(c => c.id === st.door_catalogue_id)
    const pvProf  = profiles.find(p => p.id === st.door_profile_id)
    const pvOps   = st.door_profile_id ? ops.filter(o => o.profile_id === st.door_profile_id) : []
    const pvCol   = schedMats.find(m => m.id === st.default_material_id)
    const pvBoard = pvCol?.material_id ? materials.find(b => b.id === pvCol.material_id) : undefined
    return (
      <div className="space-y-5">
        {issues.length > 0 && (
          <div className="space-y-1.5">
            {issues.map((iss, i) => (
              <p key={i} className={`text-[11px] rounded px-2.5 py-1.5 border ${
                iss.level === 'warn'
                  ? 'text-amber-400 bg-amber-950/30 border-amber-800/50'
                  : 'text-ink-muted bg-surface-2/40 border-edge'
              }`}>
                {iss.level === 'warn' ? '⚠ ' : ''}{iss.text}
              </p>
            ))}
          </div>
        )}
        <div className="flex gap-5">
          <div className="flex-1">
            <label className={lbl}>Name</label>
            <input className={inp} defaultValue={st.name}
              onBlur={e => patch<Style>('door_styles', st.id, { name: e.target.value.trim() || st.name }, setStyles)} />
          </div>
          <div className="shrink-0 bg-surface-2/30 border border-edge rounded p-2.5">
            <DoorStylePreview
              className="h-44"
              thickness={pvCat ? Number(pvCat.thickness_mm) : 18}
              profileType={(pvProf?.profile_type as ResolvedDoorProfile['profile_type']) ?? null}
              ops={dbOpsToRawProfileOps(pvOps as unknown as Record<string, unknown>[])}
              faceColour={pvBoard?.face_colour ?? null}
              grain={pvCol?.grain_direction ?? null}
              caption={pvCol ? `${pvCol.colour_name}${pvBoard ? ` · ${pvBoard.name}` : ''}` : 'no default colour'} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Door blank *</label>
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
            <label className={lbl}>Colour range</label>
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
      <div key={selectedId} className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-end gap-2 border-b border-edge px-6 py-2.5">
          {activeTab === 'schedules' && (
            <button onClick={() => duplicateSchedule(item.id)}
              className="text-xs px-3 py-1 rounded border border-edge-strong text-ink-muted hover:text-ink hover:border-accent transition-colors">
              Duplicate
            </button>
          )}
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
  const newPlaceholder = activeTab === 'catalogue' ? 'New blank…'
    : activeTab === 'schedules' ? 'New range…'
    : activeTab === 'profiles' ? 'New profile…' : 'New style…'

  return (
    <div className={embedded ? 'flex-1 flex flex-col overflow-hidden' : 'h-screen bg-canvas text-ink flex flex-col overflow-hidden'}>
      {!embedded && (
        <div className="flex-none border-b border-edge px-6 py-3 flex items-center gap-3">
          <ThemeToggle />
          <Link href="/" className="text-ink-subtle hover:text-ink-muted text-sm transition-colors">← Projects</Link>
          <span className="text-ink-subtle">|</span>
          <span className="text-sm font-semibold text-ink">Doors</span>
          <span className="text-xs text-ink-subtle ml-1">· Styles, door blanks, colour ranges & profiles</span>
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
            {activeTab === 'styles' && (
              <button onClick={() => setWizardOpen(true)}
                className="w-full text-left px-3 pb-2.5 text-[11px] text-accent-ink hover:underline">
                ✚ Guided setup — blank, colours & profile in one go
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-edge/50">
            {list.length === 0 && <p className="text-[10px] text-ink-subtle px-3 py-4 text-center">Nothing here yet</p>}
            {list.map(it => (
              <button key={it.id} onClick={() => setSelectedId(it.id)}
                className={`w-full text-left px-3 py-2.5 flex items-start justify-between gap-2 transition-colors group ${
                  selectedId === it.id ? 'bg-surface-2' : 'hover:bg-surface'
                }`}>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs truncate ${selectedId === it.id ? 'text-ink' : 'text-ink-muted'}`}>
                    {activeTab === 'styles' && styleIssues(it as unknown as Style).some(i => i.level === 'warn') && (
                      <span className="text-amber-400 mr-1" title="Style has setup warnings">⚠</span>
                    )}
                    {it.name}
                  </p>
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

      {wizardOpen && (
        <StyleWizard
          catalogue={catalogue} schedules={schedules} schedMats={schedMats}
          profiles={profiles} profileOps={ops} materials={materials} edgeBands={edgeBands}
          onClose={() => setWizardOpen(false)}
          onCreated={({ blank, range, colour, style }) => {
            if (blank)  setCatalogue(p => [...p, blank])
            if (range)  setSchedules(p => [...p, range])
            if (colour) setSchedMats(p => [...p, colour])
            setStyles(p => [...p, style])
            setWizardOpen(false)
            setActiveTab('styles')
            setSelectedId(style.id)
          }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// NEW DOOR STYLE WIZARD — one guided flow: name → blank → colour range → profile.
// Creates any missing pieces inline so the user never has to tour four tabs.
// ════════════════════════════════════════════════════════════════════════════════

function StyleWizard({ catalogue, schedules, schedMats, profiles, profileOps, materials, edgeBands, onClose, onCreated }: {
  catalogue: Catalogue[]; schedules: Schedule[]; schedMats: SchedMaterial[]
  profiles: Profile[]; profileOps: ProfileOp[]; materials: MatItem[]; edgeBands: EdgeBand[]
  onClose: () => void
  onCreated: (created: { blank?: Catalogue; range?: Schedule; colour?: SchedMaterial; style: Style }) => void
}) {
  const [name, setName]         = useState('')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Blank: an existing id or 'new'
  const [blankId, setBlankId]   = useState(catalogue[0]?.id ?? 'new')
  const [nbName, setNbName]     = useState('')
  const [nbThick, setNbThick]   = useState('16')
  const [nbCon, setNbCon]       = useState('solid_panel')

  // Colour range: '' = none (paint on site), existing id, or 'new'
  const [rangeId, setRangeId]   = useState('')
  const [defColId, setDefColId] = useState('')
  const [nrName, setNrName]     = useState('')
  const [nrBrand, setNrBrand]   = useState('')
  const [ncName, setNcName]     = useState('')
  const [ncCode, setNcCode]     = useState('')
  const [ncBoard, setNcBoard]   = useState('')
  const [ncTape, setNcTape]     = useState('')

  const [profileId, setProfileId] = useState('')

  const rangeCols = rangeId && rangeId !== 'new' ? schedMats.filter(m => m.schedule_id === rangeId && m.is_active) : []
  const blank     = blankId !== 'new' ? catalogue.find(c => c.id === blankId) : undefined
  const blankThk  = blankId === 'new' ? parseFloat(nbThick) || 0 : Number(blank?.thickness_mm ?? 0)

  // Live warnings — same rules as the style completeness check.
  const warnings: string[] = []
  const chosenBoard = rangeId === 'new'
    ? materials.find(b => b.id === ncBoard)
    : defColId ? materials.find(b => b.id === (rangeCols.find(c => c.id === defColId)?.material_id ?? '')) : undefined
  if (rangeId === 'new' && !ncBoard) warnings.push('The first colour has no linked board — fronts will cut from the carcass door material until one is linked.')
  if (rangeId && rangeId !== 'new' && defColId && !rangeCols.find(c => c.id === defColId)?.material_id)
    warnings.push('The default colour has no linked board — fronts will cut from the carcass door material.')
  if (rangeId && rangeId !== 'new' && !defColId) warnings.push('No default colour — jobs must pick a colour explicitly.')
  if (chosenBoard && blankThk && Math.abs(Number(chosenBoard.dz) - blankThk) > 1)
    warnings.push(`Board is ${chosenBoard.dz}mm but the blank is ${blankThk}mm — parts would cut at the wrong thickness.`)

  const canCreate = !!name.trim()
    && (blankId !== 'new' || (!!nbName.trim() && blankThk > 0))
    && (rangeId !== 'new' || (!!nrName.trim() && !!ncName.trim()))

  async function create() {
    if (!canCreate || busy) return
    setBusy(true)
    setError(null)
    const created: { blank?: Catalogue; range?: Schedule; colour?: SchedMaterial } = {}
    try {
      // 1. Door blank
      let catId = blankId
      if (blankId === 'new') {
        const { data, error } = await supabase.from('door_catalogue')
          .insert({ name: nbName.trim(), thickness_mm: blankThk, construction: nbCon,
                    edge_band_top: true, edge_band_bottom: true, edge_band_left: true, edge_band_right: true })
          .select().single()
        if (error || !data) throw new Error(error?.message ?? 'blank insert failed')
        created.blank = data as Catalogue
        catId = created.blank.id
      }
      // 2. Colour range + first colour
      let schedId: string | null = rangeId || null
      let defaultMatId: string | null = defColId || null
      if (rangeId === 'new') {
        const { data: sched, error: sErr } = await supabase.from('door_material_schedules')
          .insert({ name: nrName.trim(), brand: nrBrand.trim() || null }).select().single()
        if (sErr || !sched) throw new Error(sErr?.message ?? 'range insert failed')
        created.range = sched as Schedule
        schedId = created.range.id
        const { data: col, error: cErr } = await supabase.from('door_schedule_materials')
          .insert({ schedule_id: schedId, colour_name: ncName.trim(), colour_code: ncCode.trim() || null,
                    material_id: ncBoard || null, edgeband_id: ncTape || null,
                    grain_direction: 'none', is_default: true })
          .select().single()
        if (cErr || !col) throw new Error(cErr?.message ?? 'colour insert failed')
        created.colour = col as SchedMaterial
        defaultMatId = created.colour.id
      }
      // 3. The style itself
      const { data: style, error: stErr } = await supabase.from('door_styles')
        .insert({ name: name.trim(), door_catalogue_id: catId,
                  door_material_schedule_id: schedId, default_material_id: defaultMatId,
                  door_profile_id: profileId || null })
        .select().single()
      if (stErr || !style) throw new Error(stErr?.message ?? 'style insert failed')
      onCreated({ ...created, style: style as Style })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const summary = [
    blankId === 'new' ? (nbName.trim() ? `${nbName.trim()} (${nbThick}mm)` : '…') : `${blank?.name} (${blank?.thickness_mm}mm)`,
    rangeId === '' ? 'paint on site'
      : rangeId === 'new' ? (nrName.trim() ? `${nrName.trim()}${ncName.trim() ? ` · ${ncName.trim()}` : ''}` : '…')
      : `${schedules.find(s => s.id === rangeId)?.name}${defColId ? ` · ${rangeCols.find(c => c.id === defColId)?.colour_name}` : ''}`,
    profileId ? profiles.find(p => p.id === profileId)?.name : 'flat',
  ].join(' · ')

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-surface border border-edge-strong rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-edge flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">New Door Style</h2>
          <button onClick={onClose} className="text-ink-subtle hover:text-ink text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <div>
            <label className={lbl}>Style name *</label>
            <input className={inp} value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Flat Woodmatt — Polytec" autoFocus />
          </div>

          {/* 1 — the blank */}
          <div className="border-t border-edge pt-4">
            <label className={lbl}>1 · Door blank (what the door physically is)</label>
            <select className={sel} value={blankId} onChange={e => setBlankId(e.target.value)}>
              {catalogue.map(c => <option key={c.id} value={c.id}>{c.name} ({c.thickness_mm}mm)</option>)}
              <option value="new">+ Create a new blank…</option>
            </select>
            {blankId === 'new' && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="col-span-3">
                  <label className={lbl}>Blank name *</label>
                  <input className={sInp} value={nbName} onChange={e => setNbName(e.target.value)} placeholder="e.g. 16mm Woodmatt Door" />
                </div>
                <div>
                  <label className={lbl}>Thickness (mm) *</label>
                  <input type="number" className={sInp} value={nbThick} onChange={e => setNbThick(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className={lbl}>Construction</label>
                  <select className={sInp} value={nbCon} onChange={e => setNbCon(e.target.value)}>
                    {CONSTRUCTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <p className="col-span-3 text-[10px] text-ink-subtle">All four edges banded by default — adjust later in Door Blanks.</p>
              </div>
            )}
          </div>

          {/* 2 — the colour range */}
          <div className="border-t border-edge pt-4">
            <label className={lbl}>2 · Colour range (what colour the doors come in)</label>
            <select className={sel} value={rangeId} onChange={e => { setRangeId(e.target.value); setDefColId('') }}>
              <option value="">— none (paint on site) —</option>
              {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="new">+ Create a new range…</option>
            </select>
            {rangeId && rangeId !== 'new' && (
              <div className="mt-2">
                <label className={lbl}>Default colour</label>
                <select className={sInp} value={defColId} onChange={e => setDefColId(e.target.value)}>
                  <option value="">— none —</option>
                  {rangeCols.map(c => <option key={c.id} value={c.id}>{c.colour_name}{c.colour_code ? ` (${c.colour_code})` : ''}</option>)}
                </select>
              </div>
            )}
            {rangeId === 'new' && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className={lbl}>Range name *</label>
                  <input className={sInp} value={nrName} onChange={e => setNrName(e.target.value)} placeholder="e.g. Polytec Woodmatt 16mm" />
                </div>
                <div>
                  <label className={lbl}>Brand</label>
                  <input className={sInp} value={nrBrand} onChange={e => setNrBrand(e.target.value)} placeholder="Polytec" />
                </div>
                <div>
                  <label className={lbl}>First colour *</label>
                  <input className={sInp} value={ncName} onChange={e => setNcName(e.target.value)} placeholder="e.g. Classic Walnut" />
                </div>
                <div>
                  <label className={lbl}>Colour code</label>
                  <input className={sInp} value={ncCode} onChange={e => setNcCode(e.target.value)} placeholder="PTC-CW-M" />
                </div>
                <div>
                  <label className={lbl}>Linked board (cuts from)</label>
                  <select className={sInp} value={ncBoard} onChange={e => setNcBoard(e.target.value)}>
                    <option value="">— none —</option>
                    {materials.map(b => <option key={b.id} value={b.id}>{b.name} ({b.dz}mm)</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Edge tape</label>
                  <select className={sInp} value={ncTape} onChange={e => setNcTape(e.target.value)}>
                    <option value="">— none —</option>
                    {edgeBands.map(b => <option key={b.id} value={b.id}>{b.name} ({b.thickness}mm)</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* 3 — the profile */}
          <div className="border-t border-edge pt-4">
            <label className={lbl}>3 · Face profile (CNC routing on the face)</label>
            <select className={sel} value={profileId} onChange={e => setProfileId(e.target.value)}>
              <option value="">— flat (no routing) —</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Summary + live preview + warnings */}
          <div className="border-t border-edge pt-3 flex gap-4">
            <div className="flex-1 space-y-1.5">
              <p className="text-[11px] text-ink-muted">→ {name.trim() || 'New style'}: {summary}</p>
              {warnings.map((w, i) => (
                <p key={i} className="text-[11px] text-amber-400 bg-amber-950/30 border border-amber-800/50 rounded px-2.5 py-1.5">⚠ {w}</p>
              ))}
              {error && <p className="text-[11px] text-red-400">{error}</p>}
            </div>
            <div className="shrink-0 bg-surface-2/30 border border-edge rounded p-2">
              <DoorStylePreview
                className="h-32"
                thickness={blankThk || 18}
                profileType={(profiles.find(p => p.id === profileId)?.profile_type as ResolvedDoorProfile['profile_type']) ?? null}
                ops={dbOpsToRawProfileOps((profileId ? profileOps.filter(o => o.profile_id === profileId) : []) as unknown as Record<string, unknown>[])}
                faceColour={chosenBoard?.face_colour ?? null}
                grain={rangeId !== 'new' && defColId ? rangeCols.find(c => c.id === defColId)?.grain_direction ?? null : null}
                caption="preview" />
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-edge flex justify-end gap-2">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border border-edge-strong text-ink-muted hover:text-ink transition-colors">Cancel</button>
          <button onClick={create} disabled={!canCreate || busy}
            className="text-xs px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:bg-surface-3 disabled:text-ink-subtle text-white rounded transition-colors">
            {busy ? 'Creating…' : 'Create style'}
          </button>
        </div>
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
