'use client'

// ============================================================
// CNC Machine Setup  (Settings → CNC → CNC Machine Setup)
// Replaces the Coming Soon placeholder. Master list of machines;
// each machine has its own settings + one or more cutting
// profiles. The profile editor exposes the full spec §6 post-
// processor field set, grouped, and feeds src/lib/optimiser/
// gcode.ts via postFromProfile. Optimistic save-on-blur, matching
// the other CNC settings clients.
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import DrillBlockSetup from '@/app/settings/DrillBlockSetup'

interface Machine {
  id: string; name: string; brand: string | null; model: string | null
  table_dx: number | null; table_dy: number | null; gcode_dialect: string | null
  is_default: boolean; active: boolean
}
interface Profile { id: string; cnc_machine_id: string; name: string; is_default: boolean; active: boolean; [k: string]: unknown }
interface ToolItem { id: string; name: string; tool_number: string | null; diameter: number | null }

type FieldKind = 'num' | 'int' | 'text' | 'bool' | 'select' | 'tool' | 'textarea'
interface FieldSpec { key: string; label: string; kind: FieldKind; opts?: string[]; optLabels?: string[] }
interface FieldGroup { title: string; fields: FieldSpec[] }

// Spec §6 post-processor fields, grouped.
const GROUPS: FieldGroup[] = [
  { title: 'Identity & Axis', fields: [
    { key: 'origin_corner', label: 'Machine 0 / origin corner', kind: 'select',
      opts: ['bottom_left', 'bottom_right', 'top_left', 'top_right'],
      optLabels: ['Bottom-left', 'Bottom-right', 'Top-left', 'Top-right'] },
    { key: 'x_axis_direction', label: 'X axis runs', kind: 'select',
      opts: ['positive_right', 'positive_left'],
      optLabels: ['Right → positive (+X)', 'Left → negative (−X)'] },
    { key: 'y_axis_direction', label: 'Y axis runs', kind: 'select',
      opts: ['positive_up', 'positive_down'],
      optLabels: ['Up → positive (+Y)', 'Down → negative (−Y)'] },
    { key: 'z_axis_up', label: 'Z up positive', kind: 'bool' },
    { key: 'max_feed_rate', label: 'Max feed (mm/min)', kind: 'num' },
    { key: 'max_spindle_speed', label: 'Max spindle (RPM)', kind: 'num' },
    { key: 'units_code', label: 'Units code', kind: 'text' },
  ]},
  { title: 'Z Heights', fields: [
    { key: 'safe_z_clearance', label: 'Safe Z (mm)', kind: 'num' },
    { key: 'onion_skin_z', label: 'Onion skin Z (mm)', kind: 'num' },
    { key: 'through_cut_z', label: 'Thru-cut (mm)', kind: 'num' },
    { key: 'material_surface_z', label: 'Z zero ref', kind: 'select', opts: ['top_of_material', 'spoilboard'] },
    { key: 'spoilboard_thickness', label: 'Spoilboard thk (mm)', kind: 'num' },
    { key: 'drill_rapid_z', label: 'Drill rapid Z (mm)', kind: 'num' },
  ]},
  { title: 'Tool Entry', fields: [
    { key: 'entry_strategy', label: 'Entry strategy', kind: 'select', opts: ['ramp', 'helical', 'pre_drill', 'straight_plunge'] },
    { key: 'ramp_in_distance', label: 'Ramp distance (mm)', kind: 'num' },
    { key: 'ramp_in_angle', label: 'Ramp angle (°)', kind: 'num' },
    { key: 'ramp_in_feed_pct', label: 'Ramp feed %', kind: 'num' },
    { key: 'helical_radius', label: 'Helical radius (mm)', kind: 'num' },
    { key: 'helical_feed_pct', label: 'Helical feed %', kind: 'num' },
    { key: 'helical_passes', label: 'Helical passes', kind: 'int' },
    { key: 'pre_drill_tool_id', label: 'Pre-drill tool', kind: 'tool' },
    { key: 'tool_entry_offset', label: 'Tool entry offset (mm)', kind: 'num' },
  ]},
  { title: 'Nesting Margin', fields: [
    { key: 'nest_pad', label: 'Nest pad (mm)', kind: 'num' },
  ]},
  { title: 'Lead-in & Lead-out', fields: [
    { key: 'lead_in_type', label: 'Lead-in', kind: 'select', opts: ['straight', 'arc_tangent', 'perpendicular', 'none'] },
    { key: 'lead_in_length', label: 'Lead-in len (mm)', kind: 'num' },
    { key: 'lead_in_feed_pct', label: 'Lead-in feed %', kind: 'num' },
    { key: 'lead_out_type', label: 'Lead-out', kind: 'select', opts: ['straight', 'arc_tangent', 'perpendicular', 'none'] },
    { key: 'lead_out_length', label: 'Lead-out len (mm)', kind: 'num' },
    { key: 'lead_out_feed_pct', label: 'Lead-out feed %', kind: 'num' },
  ]},
  { title: 'Milling Direction', fields: [
    { key: 'milling_direction', label: 'Direction', kind: 'select', opts: ['climb', 'conventional', 'auto'] },
    { key: 'milling_direction_override_by_material', label: 'Material can override', kind: 'bool' },
    { key: 'cutter_compensation', label: 'Tool comp', kind: 'select', opts: ['computer', 'control', 'off'] },
  ]},
  { title: 'Pass Strategy', fields: [
    { key: 'pass_strategy', label: 'Strategy', kind: 'select', opts: ['single', 'onion_skin', 'roughing_finishing', 'multi_depth'] },
    { key: 'rough_pass_z_step', label: 'Rough Z step (mm)', kind: 'num' },
    { key: 'finish_pass_allowance', label: 'Finish allowance (mm)', kind: 'num' },
    { key: 'finish_pass_feed_pct', label: 'Finish feed %', kind: 'num' },
  ]},
  { title: 'Corners', fields: [
    { key: 'corner_loop_enabled', label: 'Corner loops', kind: 'bool' },
    { key: 'corner_loop_radius', label: 'Loop radius (mm)', kind: 'num' },
    { key: 'dogbone_enabled', label: 'Dog-bones', kind: 'bool' },
    { key: 'dogbone_radius', label: 'Dogbone radius (mm)', kind: 'num' },
    { key: 'corner_dwell_ms', label: 'Corner dwell (ms)', kind: 'int' },
  ]},
  { title: 'Tabs', fields: [
    { key: 'tabs_enabled', label: 'Tabs enabled', kind: 'bool' },
    { key: 'tab_width', label: 'Tab width (mm)', kind: 'num' },
    { key: 'tab_height', label: 'Tab height (mm)', kind: 'num' },
    { key: 'tab_min_part_area', label: 'Min part area (mm²)', kind: 'num' },
    { key: 'tabs_per_side_min', label: 'Tabs/side min', kind: 'int' },
    { key: 'tabs_per_side_max', label: 'Tabs/side max', kind: 'int' },
  ]},
  { title: 'Vacuum & Cut Sequencing', fields: [
    { key: 'drill_sequence_strategy', label: 'Drill sequence', kind: 'select', opts: ['nearest_neighbour', 'stripe', 'tsp'] },
    { key: 'stripe_direction', label: 'Stripe dir', kind: 'select', opts: ['horizontal', 'vertical'] },
    { key: 'stripe_width', label: 'Stripe width (mm)', kind: 'num' },
    { key: 'group_by_vacuum_zone', label: 'Group by vacuum zone', kind: 'bool' },
    { key: 'optimise_travel_path', label: 'Optimise travel path', kind: 'bool' },
    { key: 'vacuum_zone_1', label: 'Vacuum zone 1', kind: 'bool' },
    { key: 'vacuum_zone_2', label: 'Vacuum zone 2', kind: 'bool' },
    { key: 'vacuum_zone_3', label: 'Vacuum zone 3', kind: 'bool' },
    { key: 'vacuum_zone_4', label: 'Vacuum zone 4', kind: 'bool' },
    { key: 'push_off_enabled', label: 'Push-off enabled', kind: 'bool' },
    { key: 'push_off_distance', label: 'Push-off dist (mm)', kind: 'num' },
  ]},
  { title: 'G-code Structure', fields: [
    { key: 'sheet_load_pause', label: 'Sheet load pause (M00)', kind: 'bool' },
    { key: 'dust_extraction_enabled', label: 'Dust extraction', kind: 'bool' },
    { key: 'spindle_on_code', label: 'Spindle on', kind: 'text' },
    { key: 'spindle_off_code', label: 'Spindle off', kind: 'text' },
    { key: 'coolant_on_code', label: 'Coolant/air on', kind: 'text' },
    { key: 'coolant_off_code', label: 'Coolant/air off', kind: 'text' },
    { key: 'tool_change_code', label: 'Tool change ({n})', kind: 'text' },
    { key: 'work_offset_code', label: 'Work offset', kind: 'text' },
    { key: 'decimal_places', label: 'Decimal places', kind: 'int' },
    { key: 'line_numbers_enabled', label: 'Line numbers', kind: 'bool' },
    { key: 'line_number_increment', label: 'Line number step', kind: 'int' },
    { key: 'program_header', label: 'Program header', kind: 'textarea' },
    { key: 'program_footer', label: 'Program footer', kind: 'textarea' },
  ]},
]

const inp = 'bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent w-full'
const lbl = 'text-[10px] text-ink-subtle uppercase tracking-wide mb-1 block'

export default function CncMachinesClient() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [tools, setTools] = useState<ToolItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selMachine, setSelMachine] = useState<string | null>(null)
  const [selProfile, setSelProfile] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ 'Identity & Axis': true, 'Z Heights': true, 'Nesting Margin': true })

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [mR, pR, tR] = await Promise.all([
        supabase.from('cnc_machines').select('id,name,brand,model,table_dx,table_dy,gcode_dialect,is_default,active').order('name'),
        supabase.from('cnc_machine_profiles').select('*').order('name'),
        supabase.from('cnc_tools').select('id,name,tool_number,diameter').eq('active', true).order('tool_number', { nullsFirst: false }),
      ])
      if (cancelled) return
      setMachines((mR.data ?? []) as Machine[])
      setProfiles((pR.data ?? []) as Profile[])
      setTools((tR.data ?? []) as ToolItem[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Machine CRUD ────────────────────────────────────────────────────────────────
  async function createMachine() {
    const name = newName.trim()
    if (!name) return
    const isFirst = machines.length === 0
    const { data, error } = await supabase.from('cnc_machines').insert({ name, is_default: isFirst, active: true }).select().single()
    if (error || !data) { alert(`Create failed: ${error?.message}`); return }
    setMachines(p => [...p, data as Machine])
    setNewName(''); setSelMachine((data as Machine).id)
  }
  async function deleteMachine(id: string) {
    if (!confirm('Delete this machine and its profiles?')) return
    const { error } = await supabase.from('cnc_machines').delete().eq('id', id)
    if (error) { alert(`Delete failed: ${error.message}`); return }
    setMachines(p => p.filter(m => m.id !== id)); setProfiles(p => p.filter(pr => pr.cnc_machine_id !== id))
    if (selMachine === id) { setSelMachine(null); setSelProfile(null) }
  }
  async function patchMachine(id: string, changes: Partial<Machine>) {
    setMachines(prev => prev.map(m => m.id === id ? { ...m, ...changes } : m))
    const { error } = await supabase.from('cnc_machines').update(changes as Record<string, unknown>).eq('id', id)
    if (error) console.error('[cnc_machines] update', error)
  }
  async function setMachineDefault(id: string) {
    await supabase.from('cnc_machines').update({ is_default: false }).neq('id', id)
    await supabase.from('cnc_machines').update({ is_default: true }).eq('id', id)
    setMachines(prev => prev.map(m => ({ ...m, is_default: m.id === id })))
  }

  // ── Profile CRUD ────────────────────────────────────────────────────────────────
  async function addProfile(machineId: string) {
    const existing = profiles.filter(p => p.cnc_machine_id === machineId)
    const { data, error } = await supabase.from('cnc_machine_profiles')
      .insert({ cnc_machine_id: machineId, name: `Profile ${existing.length + 1}`, is_default: existing.length === 0, active: true }).select().single()
    if (error || !data) { alert(`Add profile failed: ${error?.message}`); return }
    setProfiles(p => [...p, data as Profile]); setSelProfile((data as Profile).id)
  }
  async function deleteProfile(id: string) {
    if (!confirm('Delete this cutting profile?')) return
    const { error } = await supabase.from('cnc_machine_profiles').delete().eq('id', id)
    if (error) { alert(`Delete failed: ${error.message}`); return }
    setProfiles(p => p.filter(pr => pr.id !== id))
    if (selProfile === id) setSelProfile(null)
  }
  async function patchProfile(id: string, changes: Record<string, unknown>) {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p))
    const { error } = await supabase.from('cnc_machine_profiles').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('[cnc_machine_profiles] update', error)
  }
  async function setProfileDefault(machineId: string, id: string) {
    await supabase.from('cnc_machine_profiles').update({ is_default: false }).eq('cnc_machine_id', machineId)
    await supabase.from('cnc_machine_profiles').update({ is_default: true }).eq('id', id)
    setProfiles(prev => prev.map(p => p.cnc_machine_id === machineId ? { ...p, is_default: p.id === id } : p))
  }

  if (loading) return <div className="flex-1 flex items-center justify-center text-xs text-ink-subtle">Loading machines…</div>

  const machine = machines.find(m => m.id === selMachine) ?? null
  const machineProfiles = machine ? profiles.filter(p => p.cnc_machine_id === machine.id) : []
  const profile = machineProfiles.find(p => p.id === selProfile) ?? null

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Machine list */}
      <div className="w-56 shrink-0 border-r border-edge flex flex-col overflow-hidden">
        <div className="flex-none border-b border-edge px-3 py-2.5 flex gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createMachine()}
            placeholder="New machine…" className="flex-1 bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink placeholder-ink-subtle focus:outline-none focus:border-accent" />
          <button onClick={createMachine} disabled={!newName.trim()} className="text-xs px-2.5 py-1 bg-accent hover:bg-accent-hover disabled:bg-surface-3 disabled:text-ink-subtle text-white rounded transition-colors">+</button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-edge/50">
          {machines.length === 0 && <p className="text-[10px] text-ink-subtle px-3 py-4 text-center">No machines yet</p>}
          {machines.map(m => (
            <button key={m.id} onClick={() => { setSelMachine(m.id); setSelProfile(null) }}
              className={`w-full text-left px-3 py-2.5 flex items-start justify-between gap-2 group transition-colors ${selMachine === m.id ? 'bg-surface-2' : 'hover:bg-surface'} ${!m.active ? 'opacity-50' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className={`text-xs truncate ${selMachine === m.id ? 'text-ink' : 'text-ink-muted'}`}>{m.name}{m.is_default ? ' ★' : ''}</p>
                {m.brand && <p className="text-[10px] text-ink-subtle truncate">{m.brand}{m.model ? ` ${m.model}` : ''}</p>}
              </div>
              <span role="button" onClick={e => { e.stopPropagation(); deleteMachine(m.id) }}
                className="text-ink-subtle hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 text-base leading-none cursor-pointer">×</span>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      {!machine ? (
        <div className="flex-1 flex items-center justify-center text-xs text-ink-subtle">Select a machine to edit</div>
      ) : (
        <div key={machine.id} className="flex-1 overflow-y-auto px-6 py-5">
          {/* Machine fields */}
          <div className="grid grid-cols-3 gap-4 max-w-2xl mb-5">
            <Txt label="Name" value={machine.name} onSave={v => patchMachine(machine.id, { name: v || machine.name })} />
            <Txt label="Brand" value={machine.brand ?? ''} onSave={v => patchMachine(machine.id, { brand: v || null })} />
            <Txt label="Model" value={machine.model ?? ''} onSave={v => patchMachine(machine.id, { model: v || null })} />
            <NumF label="Table X (mm)" value={machine.table_dx} onSave={v => patchMachine(machine.id, { table_dx: v })} />
            <NumF label="Table Y (mm)" value={machine.table_dy} onSave={v => patchMachine(machine.id, { table_dy: v })} />
            <Txt label="G-code dialect" value={machine.gcode_dialect ?? ''} onSave={v => patchMachine(machine.id, { gcode_dialect: v || null })} />
            <div className="flex items-end gap-3 col-span-3">
              <Toggle label="Default machine" on={machine.is_default} onChange={() => setMachineDefault(machine.id)} />
              <Toggle label="Active" on={machine.active} onChange={() => patchMachine(machine.id, { active: !machine.active })} />
            </div>
          </div>

          {/* Profiles */}
          <div className="border-t border-edge pt-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider mr-1">Cutting profiles</span>
              {machineProfiles.map(p => (
                <button key={p.id} onClick={() => setSelProfile(p.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${selProfile === p.id ? 'bg-accent text-white' : 'bg-surface-2 text-ink-muted hover:text-ink'}`}>
                  {p.name}{p.is_default ? ' ★' : ''}
                </button>
              ))}
              <button onClick={() => addProfile(machine.id)} className="px-2.5 py-1 rounded-full text-[11px] border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">+ Profile</button>
            </div>

            {!profile ? (
              <p className="text-xs text-ink-subtle">{machineProfiles.length ? 'Select a profile to edit.' : 'No profiles yet — add one. The optimiser falls back to spec defaults without a profile.'}</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3 mb-2">
                  <Txt label="Profile name" value={profile.name} onSave={v => patchProfile(profile.id, { name: v || profile.name })} />
                  <Toggle label="Default profile" on={profile.is_default} onChange={() => setProfileDefault(machine.id, profile.id)} />
                  <Toggle label="Active" on={profile.active} onChange={() => patchProfile(profile.id, { active: !profile.active })} />
                  <button onClick={() => deleteProfile(profile.id)} className="text-[11px] text-ink-subtle hover:text-red-400 ml-auto self-end pb-1">Delete profile</button>
                </div>

                {GROUPS.map(g => {
                  const open = openGroups[g.title] ?? false
                  return (
                    <div key={g.title} className="border border-edge-strong rounded-lg overflow-hidden">
                      <button onClick={() => setOpenGroups(o => ({ ...o, [g.title]: !open }))}
                        className="w-full flex items-center justify-between px-3 py-2 bg-surface-2/60 hover:bg-surface-2 transition-colors">
                        <span className="text-[11px] font-semibold text-ink">{g.title}</span>
                        <span className="text-ink-subtle text-xs">{open ? '▾' : '▸'}</span>
                      </button>
                      {open && (g.title === 'Nesting Margin' ? (
                        <NestingMarginPanel profile={profile} tools={tools} onPatch={c => patchProfile(profile.id, c)} />
                      ) : (
                        <div className="grid grid-cols-3 gap-x-4 gap-y-3 px-3 py-3">
                          {g.fields.map(fld => (
                            <Field key={fld.key} spec={fld} value={profile[fld.key]} tools={tools}
                              onSave={v => patchProfile(profile.id, { [fld.key]: v })} />
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Drill block */}
          <div className="border-t border-edge pt-4 mt-5">
            <span className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider">Drill block</span>
            <DrillBlockSetup machineId={machine.id} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Field renderers ───────────────────────────────────────────────────────────────
function Field({ spec, value, tools, onSave }: { spec: FieldSpec; value: unknown; tools: ToolItem[]; onSave: (v: unknown) => void }) {
  if (spec.kind === 'bool') return <Toggle label={spec.label} on={!!value} onChange={() => onSave(!value)} />
  if (spec.kind === 'select') return (
    <div>
      <label className={lbl}>{spec.label}</label>
      <select className={inp} value={(value as string) ?? spec.opts![0]} onChange={e => onSave(e.target.value)}>
        {spec.opts!.map((o, i) => <option key={o} value={o}>{spec.optLabels?.[i] ?? o}</option>)}
      </select>
    </div>
  )
  if (spec.kind === 'tool') return (
    <div>
      <label className={lbl}>{spec.label}</label>
      <select className={inp} value={(value as string) ?? ''} onChange={e => onSave(e.target.value || null)}>
        <option value="">— none —</option>
        {tools.map(t => <option key={t.id} value={t.id}>{t.tool_number ? `${t.tool_number} · ` : ''}{t.name}</option>)}
      </select>
    </div>
  )
  if (spec.kind === 'textarea') return (
    <div className="col-span-3">
      <label className={lbl}>{spec.label}</label>
      <textarea className={`${inp} font-mono resize-y`} rows={2} defaultValue={(value as string) ?? ''} key={String(value)}
        onBlur={e => onSave(e.target.value.trim() || null)} />
    </div>
  )
  if (spec.kind === 'text') return <Txt label={spec.label} value={(value as string) ?? ''} onSave={v => onSave(v || null)} />
  // num / int
  return (
    <div>
      <label className={lbl}>{spec.label}</label>
      <input type="number" step={spec.kind === 'int' ? 1 : 'any'} className={inp} defaultValue={value == null ? '' : String(value)} key={String(value)}
        onBlur={e => {
          const raw = e.target.value.trim()
          if (raw === '') return onSave(null)
          const n = spec.kind === 'int' ? parseInt(raw) : parseFloat(raw)
          onSave(Number.isFinite(n) ? n : null)
        }} />
    </div>
  )
}

// Custom panel for the nesting-margin "builder": each part is opt-in, with a live
// per-tool preview so it's obvious what gap each material will actually get.
function NestingMarginPanel({ profile, tools, onPatch }: { profile: Profile; tools: ToolItem[]; onPatch: (changes: Record<string, unknown>) => void }) {
  const useDia = profile.margin_use_tool_dia !== false
  const useOff = profile.margin_use_entry_offset !== false
  const pad = (profile.nest_pad as number | null) ?? 0
  const off = (profile.tool_entry_offset as number | null) ?? 0
  const base = pad + (useOff ? off : 0)
  const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1)
  return (
    <div className="px-3 py-3 space-y-3">
      <p className="text-[11px] text-ink-subtle">
        Gap left between nested parts. Build it from the parts below — the result is computed per material from its routing tool.
      </p>
      <div className="space-y-2.5 max-w-md">
        <Toggle label="Include routing tool diameter (per material)" on={useDia} onChange={() => onPatch({ margin_use_tool_dia: !useDia })} />
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-muted w-44 shrink-0">+ Pad (mm)</span>
          <input type="number" step="any" className={`${inp} max-w-28`} defaultValue={profile.nest_pad == null ? '' : String(profile.nest_pad)} key={String(profile.nest_pad)}
            onBlur={e => { const r = e.target.value.trim(); onPatch({ nest_pad: r === '' ? null : (Number.isFinite(parseFloat(r)) ? parseFloat(r) : null) }) }} />
        </div>
        <Toggle label={`+ Approach offset (${fmt(off)}mm — set in Tool Entry)`} on={useOff} onChange={() => onPatch({ margin_use_entry_offset: !useOff })} />
      </div>
      <div className="border-t border-edge pt-2.5">
        <p className="text-[10px] uppercase tracking-wider text-ink-subtle mb-1.5">Resulting gap per tool</p>
        <div className="space-y-0.5 font-mono text-[11px]">
          {tools.length === 0 && <p className="text-ink-subtle">No active tools — add bits in the CNC Tool Library.</p>}
          {tools.map(t => {
            const dia = t.diameter ?? 0
            const margin = (useDia ? dia : 0) + base
            return (
              <div key={t.id} className="flex gap-2 text-ink-muted">
                <span className="w-32 shrink-0 truncate">{t.tool_number ? `${t.tool_number} · ` : ''}Ø{fmt(dia)}</span>
                <span className="text-ink-subtle">{useDia ? `${fmt(dia)} + ` : ''}{fmt(base)}{useDia ? '' : ' (Ø excluded)'}</span>
                <span className="text-ink ml-auto">= {fmt(margin)} mm</span>
              </div>
            )
          })}
          <div className="flex gap-2 text-ink-subtle pt-0.5">
            <span className="w-32 shrink-0">no tool assigned</span>
            <span className="ml-auto">= {fmt(base)} mm</span>
          </div>
        </div>
      </div>
      <div className="border-t border-edge pt-2.5 space-y-1">
        <Toggle label="Deduct edgebanding thickness off optimised parts"
          on={profile.deduct_edgeband === true}
          onChange={() => onPatch({ deduct_edgeband: profile.deduct_edgeband !== true })} />
        <p className="text-[11px] text-ink-subtle">
          Parts nest and cut at board size — finished size minus the tape thickness on each banded
          edge (kept fractional to 0.1mm) — and drilling positions shift to match the cut blank.
        </p>
      </div>
    </div>
  )
}

function Txt({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input className={inp} defaultValue={value} key={value} onBlur={e => { const v = e.target.value.trim(); if (v !== value) onSave(v) }} />
    </div>
  )
}
function NumF({ label, value, onSave }: { label: string; value: number | null; onSave: (v: number | null) => void }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type="number" step="any" className={inp} defaultValue={value ?? ''} key={String(value)}
        onBlur={e => { const raw = e.target.value.trim(); if (raw === '') return onSave(null); const n = parseFloat(raw); onSave(Number.isFinite(n) ? n : null) }} />
    </div>
  )
}
function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onChange} className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-surface-3'}`}>
        <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      <span className="text-xs text-ink-muted">{label}</span>
    </div>
  )
}
