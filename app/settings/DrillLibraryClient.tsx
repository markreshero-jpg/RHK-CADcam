'use client'

// ============================================================
// Drill Library  (Settings → CNC → Drill Library)
// Shop-wide library of drill bits (cnc_drills), separate from the
// router/profile tool library (cnc_tools). Drills have no ATC tool
// number — they live permanently in drill-block spindles and are
// diameter-driven. Diameter is the key field: only same-diameter
// adjacent spindles can gang (spec Part A §4).
// Mirrors CncToolsClient's optimistic-patch / save-on-blur pattern
// and the shared theme tokens.
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'

const DRILL_TYPES = ['through', 'blind', 'countersink'] as const
const ROTATIONS = ['clockwise', 'anticlockwise'] as const

interface Drill {
  id: string
  name: string
  diameter: number | null
  drill_type: string
  point_angle: number | null
  max_depth: number | null
  total_length: number | null
  rotation: string
  supplier_code: string | null
  notes: string | null
  is_active: boolean
}

const inp = 'bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent w-full'
const lbl = 'text-[10px] text-ink-subtle uppercase tracking-wide mb-1 block'

export default function DrillLibraryClient() {
  const [drills, setDrills] = useState<Drill[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.from('cnc_drills').select('*').order('diameter', { nullsFirst: false }).order('name')
      .then(({ data }) => {
        if (cancelled) return
        setDrills((data ?? []) as Drill[])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  async function patch(id: string, changes: Partial<Drill>) {
    setDrills(prev => prev.map(d => d.id === id ? { ...d, ...changes } : d))
    const { error } = await supabase.from('cnc_drills').update(changes as Record<string, unknown>).eq('id', id)
    if (error) console.error('[cnc_drills] update', error)
  }

  async function addDrill() {
    if (creating) return
    setCreating(true)
    const payload = { name: 'New drill', diameter: 5, drill_type: 'through', point_angle: 118, rotation: 'clockwise', is_active: true }
    const { data, error } = await supabase.from('cnc_drills').insert(payload).select().single()
    setCreating(false)
    if (error || !data) { alert(`Add failed: ${error?.message}`); return }
    setDrills(p => [...p, data as Drill])
    setExpanded((data as Drill).id)
  }

  async function deleteDrill(id: string) {
    if (!confirm('Delete this drill permanently? (Use the Active toggle to retire it instead.)')) return
    const { error } = await supabase.from('cnc_drills').delete().eq('id', id)
    if (error) { alert(`Delete failed: ${error.message}`); return }
    setDrills(p => p.filter(d => d.id !== id))
    if (expanded === id) setExpanded(null)
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-xs text-ink-subtle">Loading drills…</div>
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="flex items-center justify-between mb-4 max-w-4xl">
        <p className="text-xs text-ink-subtle">
          Drill bits fitted to the machine&apos;s drill block. Separate from router tools — no ATC tool number.
          Diameter drives gang-detection: only same-⌀ bits on adjacent spindles fire together. Inactive drills are hidden from spindle assignment and operation dropdowns.
        </p>
        <button onClick={addDrill} disabled={creating}
          className="shrink-0 text-xs px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded transition-colors">
          {creating ? 'Adding…' : '+ Add drill'}
        </button>
      </div>

      <div className="border border-edge-strong rounded-lg overflow-hidden max-w-4xl">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-2 text-ink-subtle text-left">
              <th className="px-3 py-2 font-medium w-8"></th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium text-right">⌀</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium text-right">Point°</th>
              <th className="px-3 py-2 font-medium text-right">Max depth</th>
              <th className="px-3 py-2 font-medium text-center">Active</th>
              <th className="px-3 py-2 font-medium w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {drills.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-ink-subtle">No drills yet — add one to begin.</td></tr>
            )}
            {drills.map(d => {
              const isOpen = expanded === d.id
              return (
                <FragmentRow key={d.id}>
                  <tr className={`group cursor-pointer transition-colors ${isOpen ? 'bg-surface-2' : 'hover:bg-surface'} ${!d.is_active ? 'opacity-50' : ''}`}
                    onClick={() => setExpanded(isOpen ? null : d.id)}>
                    <td className="px-3 py-2 text-ink-subtle">{isOpen ? '▾' : '▸'}</td>
                    <td className="px-3 py-2 text-ink">{d.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-muted">{d.diameter ?? '—'}</td>
                    <td className="px-3 py-2 text-ink-muted">{d.drill_type}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-muted">{d.point_angle ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-muted">{d.max_depth ?? '—'}</td>
                    <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                      <button onClick={() => patch(d.id, { is_active: !d.is_active })}
                        className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${
                          d.is_active ? 'border-green-700 text-green-400 hover:bg-green-900/30' : 'border-edge-strong text-ink-subtle hover:text-ink'
                        }`}>
                        {d.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                      <span role="button" onClick={() => deleteDrill(d.id)}
                        className="text-ink-subtle hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-base leading-none">×</span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-surface">
                      <td colSpan={8} className="px-6 py-5">
                        <div className="grid grid-cols-3 gap-x-5 gap-y-3 max-w-2xl">
                          <TextField label="Name" value={d.name} onSave={v => patch(d.id, { name: v })} />
                          <NumField label="Diameter (mm)" value={d.diameter} onSave={v => patch(d.id, { diameter: v })} />
                          <div>
                            <label className={lbl}>Drill type</label>
                            <select className={inp} value={d.drill_type} onChange={e => patch(d.id, { drill_type: e.target.value })}>
                              {DRILL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <NumField label="Point angle (°)" value={d.point_angle} onSave={v => patch(d.id, { point_angle: v })} />
                          <NumField label="Max depth (mm)" value={d.max_depth} onSave={v => patch(d.id, { max_depth: v })} />
                          <NumField label="Total length (mm)" value={d.total_length} onSave={v => patch(d.id, { total_length: v })} />
                          <div>
                            <label className={lbl}>Rotation</label>
                            <select className={inp} value={d.rotation} onChange={e => patch(d.id, { rotation: e.target.value })}>
                              {ROTATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </div>
                          <TextField label="Supplier code" value={d.supplier_code ?? ''} onSave={v => patch(d.id, { supplier_code: v || null })} />
                          <div className="col-span-3">
                            <label className={lbl}>Notes</label>
                            <input className={inp} defaultValue={d.notes ?? ''}
                              onBlur={e => patch(d.id, { notes: e.target.value.trim() || null })} />
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

function NumField({ label, value, onSave }: { label: string; value: number | null; onSave: (v: number | null) => void }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type="number" step="any" className={inp} defaultValue={value ?? ''} key={String(value)}
        onBlur={e => {
          const raw = e.target.value.trim()
          if (raw === '') return onSave(null)
          const n = parseFloat(raw)
          onSave(Number.isFinite(n) ? n : null)
        }} />
    </div>
  )
}
