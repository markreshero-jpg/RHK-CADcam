'use client'

// ============================================================
// CNC Tool Sets  (Settings → CNC → Tool Sets)
// A tool set is a named, ordered sequence of machining
// operations (e.g. "Shaker Route"). Master list of sets on the
// left; selected set's ordered operations on the right, each row
// expandable to its full parameter set. Operations always render
// in ascending sort_order; editing the number reorders them.
// Optimistic patch / save-on-blur, matching DoorSystemClient.
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'

const OP_TYPES = ['pocket', 'outline', 'square_off', 'profile', 'drill', 'groove', 'raster'] as const
const FILL_STRATEGIES = ['raster', 'spiral_in', 'spiral_out'] as const

interface ToolSet {
  id: string; name: string; description: string | null
  is_active: boolean; sort_order: number
}
interface ToolSetOp {
  id: string; tool_set_id: string; sort_order: number; operation_type: string
  tool_id: string | null; description: string | null
  depth_mm: number | null; depth_eq: string | null; width_mm: number | null
  offset_top_mm: number | null; offset_bottom_mm: number | null
  offset_left_mm: number | null; offset_right_mm: number | null
  fill_strategy: string | null; raster_angle_deg: number | null; raster_stepover_pct: number | null
  feed_rate_override: number | null; spindle_speed_override: number | null
}
interface ToolItem { id: string; name: string; tool_number: string | null }

const inp = 'bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent w-full'
const lbl = 'text-[10px] text-ink-subtle uppercase tracking-wide mb-1 block'

export default function CncToolSetsClient() {
  const [sets, setSets] = useState<ToolSet[]>([])
  const [ops, setOps] = useState<ToolSetOp[]>([])
  const [tools, setTools] = useState<ToolItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedOp, setExpandedOp] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [setR, opR, toolR] = await Promise.all([
        supabase.from('cnc_tool_sets').select('*').order('sort_order').order('name'),
        supabase.from('cnc_tool_set_operations').select('*').order('sort_order'),
        supabase.from('cnc_tools').select('id,name,tool_number').eq('active', true).order('tool_number', { nullsFirst: false }),
      ])
      if (cancelled) return
      setSets((setR.data ?? []) as ToolSet[])
      setOps((opR.data ?? []) as ToolSetOp[])
      setTools((toolR.data ?? []) as ToolItem[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Tool set CRUD ───────────────────────────────────────────────────────────────
  async function createSet() {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    const nextOrder = sets.length ? Math.max(...sets.map(s => s.sort_order)) + 1 : 0
    const { data, error } = await supabase.from('cnc_tool_sets').insert({ name, sort_order: nextOrder }).select().single()
    setCreating(false)
    if (error || !data) { alert(`Create failed: ${error?.message}`); return }
    setSets(p => [...p, data as ToolSet])
    setNewName('')
    setSelectedId((data as ToolSet).id)
  }

  async function deleteSet(id: string) {
    if (!confirm('Delete this tool set and all its operations?')) return
    const { error } = await supabase.from('cnc_tool_sets').delete().eq('id', id)
    if (error) { alert(`Delete failed: ${error.message}`); return }
    setSets(p => p.filter(s => s.id !== id))
    setOps(p => p.filter(o => o.tool_set_id !== id))   // cascade already removed them server-side
    if (selectedId === id) setSelectedId(null)
  }

  async function patchSet(id: string, changes: Partial<ToolSet>) {
    setSets(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s))
    const { error } = await supabase.from('cnc_tool_sets').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('[cnc_tool_sets] update', error)
  }

  // ── Operation CRUD ──────────────────────────────────────────────────────────────
  async function addOp(setId: string) {
    const existing = ops.filter(o => o.tool_set_id === setId)
    const nextOrder = existing.length ? Math.max(...existing.map(o => o.sort_order)) + 1 : 0
    const { data, error } = await supabase.from('cnc_tool_set_operations')
      .insert({ tool_set_id: setId, sort_order: nextOrder, operation_type: 'pocket' }).select().single()
    if (error || !data) { alert(`Add operation failed: ${error?.message}`); return }
    setOps(p => [...p, data as ToolSetOp])
    setExpandedOp((data as ToolSetOp).id)
  }

  async function deleteOp(id: string) {
    const { error } = await supabase.from('cnc_tool_set_operations').delete().eq('id', id)
    if (error) { alert(`Delete failed: ${error.message}`); return }
    setOps(p => p.filter(o => o.id !== id))
    if (expandedOp === id) setExpandedOp(null)
  }

  async function patchOp(id: string, changes: Partial<ToolSetOp>) {
    setOps(prev => prev.map(o => o.id === id ? { ...o, ...changes } : o))
    const { error } = await supabase.from('cnc_tool_set_operations').update(changes as Record<string, unknown>).eq('id', id)
    if (error) console.error('[cnc_tool_set_operations] update', error)
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-xs text-ink-subtle">Loading tool sets…</div>
  }

  const selected = sets.find(s => s.id === selectedId) ?? null
  const selectedOps = selected
    ? ops.filter(o => o.tool_set_id === selected.id).sort((a, b) => a.sort_order - b.sort_order)
    : []

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Tool set list */}
      <div className="w-60 shrink-0 border-r border-edge flex flex-col overflow-hidden">
        <div className="flex-none border-b border-edge px-3 py-2.5 flex gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createSet()}
            placeholder="New tool set…" className="flex-1 bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink placeholder-ink-subtle focus:outline-none focus:border-accent" />
          <button onClick={createSet} disabled={creating || !newName.trim()}
            className="text-xs px-2.5 py-1 bg-accent hover:bg-accent-hover disabled:bg-surface-3 disabled:text-ink-subtle text-white rounded transition-colors">
            {creating ? '…' : '+'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-edge/50">
          {sets.length === 0 && <p className="text-[10px] text-ink-subtle px-3 py-4 text-center">No tool sets yet</p>}
          {sets.map(s => (
            <button key={s.id} onClick={() => { setSelectedId(s.id); setExpandedOp(null) }}
              className={`w-full text-left px-3 py-2.5 flex items-start justify-between gap-2 transition-colors group ${
                selectedId === s.id ? 'bg-surface-2' : 'hover:bg-surface'} ${!s.is_active ? 'opacity-50' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className={`text-xs truncate ${selectedId === s.id ? 'text-ink' : 'text-ink-muted'}`}>{s.name}</p>
                {s.description && <p className="text-[10px] text-ink-subtle truncate">{s.description}</p>}
                {!s.is_active && <span className="text-[9px] text-ink-subtle">inactive</span>}
              </div>
              <span role="button" onClick={e => { e.stopPropagation(); deleteSet(s.id) }}
                className="text-ink-subtle hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 text-base leading-none cursor-pointer">×</span>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-xs text-ink-subtle">Select a tool set to edit</div>
      ) : (
        <div key={selected.id} className="flex-1 overflow-y-auto px-6 py-5">
          {/* Header fields */}
          <div className="flex items-start gap-4 mb-5 max-w-2xl">
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Name</label>
                <input className={inp} defaultValue={selected.name} key={selected.name}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== selected.name) patchSet(selected.id, { name: v }) }} />
              </div>
              <div>
                <label className={lbl}>Description</label>
                <input className={inp} defaultValue={selected.description ?? ''} key={selected.description ?? ''}
                  onBlur={e => patchSet(selected.id, { description: e.target.value.trim() || null })} />
              </div>
            </div>
            <button onClick={() => patchSet(selected.id, { is_active: !selected.is_active })}
              className={`mt-5 px-2.5 py-1 rounded border text-[10px] transition-colors ${
                selected.is_active ? 'border-green-700 text-green-400 hover:bg-green-900/30' : 'border-edge-strong text-ink-subtle hover:text-ink'}`}>
              {selected.is_active ? 'Active' : 'Inactive'}
            </button>
          </div>

          {/* Operations */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Operations (run in order)</p>
            <button onClick={() => addOp(selected.id)}
              className="text-xs px-2.5 py-1 bg-accent hover:bg-accent-hover text-white rounded transition-colors">+ Add operation</button>
          </div>

          <div className="border border-edge-strong rounded-lg overflow-hidden">
            {selectedOps.length === 0 && <p className="text-[11px] text-ink-subtle px-3 py-5 text-center">No operations — add the first step.</p>}
            {selectedOps.map(op => {
              const isOpen = expandedOp === op.id
              return (
                <div key={op.id} className="border-b border-edge last:border-b-0">
                  {/* Summary row */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-surface">
                    <button onClick={() => setExpandedOp(isOpen ? null : op.id)} className="text-ink-subtle w-4 text-center">{isOpen ? '▾' : '▸'}</button>
                    <input type="number" title="Sort order" className={`${inp} w-14 text-center`} defaultValue={op.sort_order} key={`so-${op.sort_order}`}
                      onBlur={e => patchOp(op.id, { sort_order: parseInt(e.target.value) || 0 })} />
                    <select className={`${inp} w-28`} value={op.operation_type} onChange={e => patchOp(op.id, { operation_type: e.target.value })}>
                      {OP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select className={`${inp} flex-1`} value={op.tool_id ?? ''} onChange={e => patchOp(op.id, { tool_id: e.target.value || null })}>
                      <option value="">— no tool —</option>
                      {tools.map(t => <option key={t.id} value={t.id}>{t.tool_number ? `${t.tool_number} · ` : ''}{t.name}</option>)}
                    </select>
                    <input className={`${inp} flex-1`} placeholder="step label" defaultValue={op.description ?? ''} key={`d-${op.description ?? ''}`}
                      onBlur={e => patchOp(op.id, { description: e.target.value.trim() || null })} />
                    <span role="button" onClick={() => deleteOp(op.id)}
                      className="text-ink-subtle hover:text-red-400 cursor-pointer text-base leading-none px-1">×</span>
                  </div>

                  {/* Expanded params */}
                  {isOpen && (
                    <div className="px-9 py-3 bg-surface-2/40 grid grid-cols-4 gap-x-4 gap-y-3">
                      <NumFx label="Depth (mm)" value={op.depth_mm} formula={op.depth_eq}
                        onValue={v => patchOp(op.id, { depth_mm: v })} onFormula={f => patchOp(op.id, { depth_eq: f })} />
                      <Num label="Width (mm)" value={op.width_mm} onSave={v => patchOp(op.id, { width_mm: v })} />
                      <div>
                        <label className={lbl}>Fill strategy</label>
                        <select className={inp} value={op.fill_strategy ?? ''} onChange={e => patchOp(op.id, { fill_strategy: e.target.value || null })}>
                          <option value="">—</option>
                          {FILL_STRATEGIES.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                      <div /> {/* spacer */}
                      <Num label="Offset top (mm)" value={op.offset_top_mm} onSave={v => patchOp(op.id, { offset_top_mm: v })} />
                      <Num label="Offset bottom (mm)" value={op.offset_bottom_mm} onSave={v => patchOp(op.id, { offset_bottom_mm: v })} />
                      <Num label="Offset left (mm)" value={op.offset_left_mm} onSave={v => patchOp(op.id, { offset_left_mm: v })} />
                      <Num label="Offset right (mm)" value={op.offset_right_mm} onSave={v => patchOp(op.id, { offset_right_mm: v })} />
                      <Num label="Raster angle°" value={op.raster_angle_deg} onSave={v => patchOp(op.id, { raster_angle_deg: v })} />
                      <Num label="Raster stepover %" value={op.raster_stepover_pct} onSave={v => patchOp(op.id, { raster_stepover_pct: v })} />
                      <Num label="Feed override" value={op.feed_rate_override} onSave={v => patchOp(op.id, { feed_rate_override: v })} />
                      <Num label="Spindle override" value={op.spindle_speed_override} integer onSave={v => patchOp(op.id, { spindle_speed_override: v })} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Num({ label, value, onSave, integer }: { label: string; value: number | null; onSave: (v: number | null) => void; integer?: boolean }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type="number" step={integer ? 1 : 'any'} className={inp} defaultValue={value ?? ''} key={String(value)}
        onBlur={e => {
          const raw = e.target.value.trim()
          if (raw === '') return onSave(null)
          const n = integer ? parseInt(raw) : parseFloat(raw)
          onSave(Number.isFinite(n) ? n : null)
        }} />
    </div>
  )
}

// Depth supports a fixed value OR a formula (depth_eq, e.g. "@part.DZ * 0.4").
// When a formula is present the numeric input is disabled, mirroring the door
// builder's value/ƒ-override convention.
function NumFx({ label, value, formula, onValue, onFormula }: {
  label: string; value: number | null; formula: string | null
  onValue: (v: number | null) => void; onFormula: (f: string | null) => void
}) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type="number" step="any" className={inp} defaultValue={value ?? ''} key={String(value)} disabled={!!formula}
        onBlur={e => { const raw = e.target.value.trim(); onValue(raw === '' ? null : (Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : null)) }} />
      <input className="bg-surface-2/60 border border-edge-strong/60 rounded px-1.5 py-0.5 text-[10px] text-ink-muted focus:outline-none focus:border-purple-600 focus:text-purple-300 w-full font-mono mt-1"
        defaultValue={formula ?? ''} placeholder="ƒ e.g. @part.DZ*0.4" key={`fx-${formula ?? ''}`}
        onBlur={e => onFormula(e.target.value.trim() || null)} />
    </div>
  )
}
