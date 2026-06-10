'use client'

// ============================================================
// CNC Tool Library  (Settings → CNC → CNC Tool Setup)
// Replaces the Coming Soon placeholder. Full tool list with
// inline-editable, expandable rows; each expanded row carries
// the parametric shape editor + live cross-section preview.
// Mirrors DoorSystemClient's optimistic-patch / save-on-blur
// pattern and the shared theme tokens.
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import ToolProfilePreview from '@/src/components/ToolProfilePreview'
import {
  shapeTypeFor, defaultExtraParams, SHAPE_EXTRA_PARAMS,
  type ToolShape,
} from '@/src/lib/cnc/toolProfile'

// tool_type values mirror the DB check constraint.
const TOOL_TYPES = [
  'compression', 'upcut', 'downcut', 'vbit', 'drill', 'other',
  'roundover', 'cove', 'rebate', 'chamfer', 't_slot',
] as const

interface Tool {
  id: string
  name: string
  tool_number: string | null
  diameter: number | null
  flutes: number | null
  tool_type: string
  material_notes: string | null
  active: boolean
  base_feed_rate: number | null
  base_spindle_speed: number | null
  plunge_feed_pct: number | null
  max_depth_per_pass: number | null
  cutting_length: number | null
  shank_diameter: number | null
  shape_profile: ToolShape | null
}

const inp = 'bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent w-full'
const lbl = 'text-[10px] text-ink-subtle uppercase tracking-wide mb-1 block'

// Compose the self-contained shape_profile stored on the row.
// tool.diameter / tool.cutting_length are the source of truth for those
// two values; the type-specific extras live in shape_profile.params.
function composeShape(
  toolType: string,
  diameter: number | null,
  cuttingLength: number | null,
  existingParams?: Record<string, number>,
  extraOverride?: Record<string, number>,
): ToolShape {
  const type = shapeTypeFor(toolType)
  const extra = { ...defaultExtraParams(type, existingParams), ...extraOverride }
  return { type, params: { ...extra, diameter: diameter ?? 0, cutting_length: cuttingLength ?? 0 } }
}

export default function CncToolsClient() {
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.from('cnc_tools').select('*').order('tool_number', { nullsFirst: false }).order('name')
      .then(({ data }) => {
        if (cancelled) return
        setTools((data ?? []) as Tool[])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  async function patch(id: string, changes: Partial<Tool>) {
    setTools(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t))
    const { error } = await supabase.from('cnc_tools').update(changes as Record<string, unknown>).eq('id', id)
    if (error) console.error('[cnc_tools] update', error)
  }

  async function addTool() {
    if (creating) return
    setCreating(true)
    const nextNum = `T${100 + tools.length + 1}`
    const shape = composeShape('compression', 8, 32)
    const payload = { name: 'New tool', tool_number: nextNum, tool_type: 'compression', diameter: 8, cutting_length: 32, shape_profile: shape, active: true }
    const { data, error } = await supabase.from('cnc_tools').insert(payload).select().single()
    setCreating(false)
    if (error || !data) { alert(`Add failed: ${error?.message}`); return }
    setTools(p => [...p, data as Tool])
    setExpanded((data as Tool).id)
  }

  async function deleteTool(id: string) {
    if (!confirm('Delete this tool permanently? (Use the Active toggle to retire it instead.)')) return
    const { error } = await supabase.from('cnc_tools').delete().eq('id', id)
    if (error) { alert(`Delete failed: ${error.message}`); return }
    setTools(p => p.filter(t => t.id !== id))
    if (expanded === id) setExpanded(null)
  }

  // ── Field handlers that keep shape_profile in sync ──────────────────────────────
  function setToolType(t: Tool, toolType: string) {
    const shape = composeShape(toolType, t.diameter, t.cutting_length, t.shape_profile?.params)
    patch(t.id, { tool_type: toolType, shape_profile: shape })
  }
  function setDiameter(t: Tool, v: number | null) {
    const shape = composeShape(t.tool_type, v, t.cutting_length, t.shape_profile?.params)
    patch(t.id, { diameter: v, shape_profile: shape })
  }
  function setCuttingLength(t: Tool, v: number | null) {
    const shape = composeShape(t.tool_type, t.diameter, v, t.shape_profile?.params)
    patch(t.id, { cutting_length: v, shape_profile: shape })
  }
  function setExtra(t: Tool, key: string, v: number) {
    const shape = composeShape(t.tool_type, t.diameter, t.cutting_length, t.shape_profile?.params, { [key]: v })
    patch(t.id, { shape_profile: shape })
  }

  function previewShape(t: Tool): ToolShape {
    return composeShape(t.tool_type, t.diameter, t.cutting_length, t.shape_profile?.params)
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-xs text-ink-subtle">Loading tools…</div>
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="flex items-center justify-between mb-4 max-w-5xl">
        <p className="text-xs text-ink-subtle">
          Cutting tools available to the optimiser and routing system. Inactive tools stay here but are hidden from selection lists.
        </p>
        <button onClick={addTool} disabled={creating}
          className="shrink-0 text-xs px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded transition-colors">
          {creating ? 'Adding…' : '+ Add tool'}
        </button>
      </div>

      <div className="border border-edge-strong rounded-lg overflow-hidden max-w-5xl">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-2 text-ink-subtle text-left">
              <th className="px-3 py-2 font-medium w-8"></th>
              <th className="px-3 py-2 font-medium">Tool #</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium text-right">⌀</th>
              <th className="px-3 py-2 font-medium text-right">Max DOC</th>
              <th className="px-3 py-2 font-medium text-right">Feed</th>
              <th className="px-3 py-2 font-medium text-center">Active</th>
              <th className="px-3 py-2 font-medium w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {tools.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-ink-subtle">No tools yet — add one to begin.</td></tr>
            )}
            {tools.map(t => {
              const isOpen = expanded === t.id
              return (
                <FragmentRow key={t.id}>
                  <tr className={`group cursor-pointer transition-colors ${isOpen ? 'bg-surface-2' : 'hover:bg-surface'} ${!t.active ? 'opacity-50' : ''}`}
                    onClick={() => setExpanded(isOpen ? null : t.id)}>
                    <td className="px-3 py-2 text-ink-subtle">{isOpen ? '▾' : '▸'}</td>
                    <td className="px-3 py-2 font-mono text-ink-muted">{t.tool_number ?? '—'}</td>
                    <td className="px-3 py-2 text-ink">{t.name}</td>
                    <td className="px-3 py-2 text-ink-muted">{t.tool_type}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-muted">{t.diameter ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-muted">{t.max_depth_per_pass ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-muted">{t.base_feed_rate ?? '—'}</td>
                    <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                      <button onClick={() => patch(t.id, { active: !t.active })}
                        className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${
                          t.active ? 'border-green-700 text-green-400 hover:bg-green-900/30' : 'border-edge-strong text-ink-subtle hover:text-ink'
                        }`}>
                        {t.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                      <span role="button" onClick={() => deleteTool(t.id)}
                        className="text-ink-subtle hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-base leading-none">×</span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-surface">
                      <td colSpan={9} className="px-6 py-5">
                        <div className="flex gap-8 flex-wrap">
                          {/* Field grid */}
                          <div className="grid grid-cols-2 gap-x-5 gap-y-3 flex-1 min-w-[320px] max-w-md">
                            <TextField label="Name" value={t.name} onSave={v => patch(t.id, { name: v })} />
                            <TextField label="Tool number" value={t.tool_number ?? ''} onSave={v => patch(t.id, { tool_number: v || null })} />
                            <div>
                              <label className={lbl}>Tool type</label>
                              <select className={inp} value={t.tool_type} onChange={e => setToolType(t, e.target.value)}>
                                {TOOL_TYPES.map(tt => <option key={tt} value={tt}>{tt}</option>)}
                              </select>
                            </div>
                            <NumField label="Flutes" value={t.flutes} integer onSave={v => patch(t.id, { flutes: v })} />
                            <NumField label="Diameter (mm)" value={t.diameter} onSave={v => setDiameter(t, v)} />
                            <NumField label="Cutting length (mm)" value={t.cutting_length} onSave={v => setCuttingLength(t, v)} />
                            <NumField label="Max depth / pass (mm)" value={t.max_depth_per_pass} onSave={v => patch(t.id, { max_depth_per_pass: v })} />
                            <NumField label="Shank dia (mm)" value={t.shank_diameter} onSave={v => patch(t.id, { shank_diameter: v })} />
                            <NumField label="Base feed (mm/min)" value={t.base_feed_rate} onSave={v => patch(t.id, { base_feed_rate: v })} />
                            <NumField label="Base spindle (RPM)" value={t.base_spindle_speed} integer onSave={v => patch(t.id, { base_spindle_speed: v })} />
                            <NumField label="Plunge feed (% of feed)" value={t.plunge_feed_pct} onSave={v => patch(t.id, { plunge_feed_pct: v })} />
                            <div className="col-span-2">
                              <label className={lbl}>Material notes</label>
                              <input className={inp} defaultValue={t.material_notes ?? ''}
                                onBlur={e => patch(t.id, { material_notes: e.target.value.trim() || null })} />
                            </div>
                          </div>

                          {/* Shape editor + live preview */}
                          <div className="flex gap-5">
                            <div className="w-40 space-y-3">
                              <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Shape profile</p>
                              {SHAPE_EXTRA_PARAMS[shapeTypeFor(t.tool_type)].length === 0 ? (
                                <p className="text-[11px] text-ink-subtle">Straight cutter — profile derived from diameter &amp; cutting length.</p>
                              ) : (
                                SHAPE_EXTRA_PARAMS[shapeTypeFor(t.tool_type)].map(pd => (
                                  <NumField key={pd.key} label={pd.label} step={pd.step}
                                    value={t.shape_profile?.params?.[pd.key] ?? pd.default}
                                    onSave={v => setExtra(t, pd.key, v ?? pd.default)} />
                                ))
                              )}
                            </div>
                            <ToolProfilePreview shape={previewShape(t)} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// React needs a keyed wrapper for the two-row-per-tool layout.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function TextField({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input className={inp} defaultValue={value} key={value} onBlur={e => { const v = e.target.value.trim(); if (v !== value) onSave(v) }} />
    </div>
  )
}

function NumField({ label, value, onSave, integer, step }: {
  label: string; value: number | null; onSave: (v: number | null) => void; integer?: boolean; step?: number
}) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type="number" step={step ?? (integer ? 1 : 'any')} className={inp} defaultValue={value ?? ''} key={String(value)}
        onBlur={e => {
          const raw = e.target.value.trim()
          if (raw === '') return onSave(null)
          const n = integer ? parseInt(raw) : parseFloat(raw)
          onSave(Number.isFinite(n) ? n : null)
        }} />
    </div>
  )
}
