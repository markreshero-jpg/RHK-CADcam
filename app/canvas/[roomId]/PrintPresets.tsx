// Print presets for Reports (Mark, 2026-11-02): one click sets a report's paper,
// scale, layer set(s) and page-per-room. Shop-wide, in shop_settings.print_presets
// (everyone sees the same list); each preset belongs to one report.
'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { LayerSet } from '@/src/lib/displayLayers/registry'

export interface PrintPreset {
  id: string
  name: string
  report: string
  paper?: string
  scale?: number
  /** Layer set NAME per report storage key (useReportLayerSet takes names). */
  sets?: Record<string, string>
  pagePerRoom?: boolean
}

/** The useReportLayerSet storage keys each report reads (ShopDrawings shares the plan / elevation ones). */
export const PRESET_SET_KEYS: Record<string, { key: string; label: string }[]> = {
  shop_drawings: [
    { key: 'plan-view-layer-set', label: 'Plan' },
    { key: 'elevation-print-layer-set', label: 'Elev' },
    { key: 'shop-3d-layer-set', label: '3D' },
  ],
  plan_view_v2: [{ key: 'plan-view-layer-set', label: '' }],
  benchtop_quote: [{ key: 'benchtop-quote-layer-set', label: '' }],
  elevation_view_v2: [{ key: 'elevation-print-layer-set', label: '' }],
  render_3d: [{ key: 'render-3d-layer-set', label: '' }],
}

/** Layer set names a report is on now: its remembered pick, else the fallback it starts on. */
export function currentSets(report: string, sets: LayerSet[], fallbackId: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { key } of PRESET_SET_KEYS[report] ?? []) {
    let picked: string | null = null
    try { picked = localStorage.getItem(key) } catch { /* storage unavailable */ }
    const set = sets.find(s => s.id === picked) ?? sets.find(s => s.name === picked)
      ?? sets.find(s => s.id === fallbackId) ?? sets[0]
    if (set) out[key] = set.name
  }
  return out
}

/** Point each report key at the preset's layer set (read when the report next mounts). */
export function applyPresetSets(p: PrintPreset) {
  for (const [key, name] of Object.entries(p.sets ?? {})) {
    try { localStorage.setItem(key, name) } catch { /* storage unavailable */ }
  }
}

export function usePrintPresets() {
  const [shopId, setShopId] = useState<string | null>(null)
  const [presets, setPresets] = useState<PrintPreset[]>([])
  useEffect(() => {
    void supabase.from('shop_settings').select('id, print_presets').limit(1).maybeSingle().then(({ data }) => {
      if (!data) return
      setShopId(data.id)
      setPresets((data.print_presets ?? []) as PrintPreset[])
    })
  }, [])
  const save = useCallback(async (next: PrintPreset[]) => {
    setPresets(next)
    if (!shopId) return
    const { error } = await supabase.from('shop_settings').update({ print_presets: next }).eq('id', shopId)
    if (error) console.error('[print presets]', error)
  }, [shopId])
  return { presets, save }
}

export function PrintPresetBar({ report, presets, activeId, onApply, onAdd, onDelete, suggestName, describe }: {
  report: string
  presets: PrintPreset[]
  activeId: string | null
  onApply: (p: PrintPreset) => void
  /** Save the report's current settings under this name. */
  onAdd: (name: string) => void
  onDelete: (id: string) => void
  suggestName: () => string
  describe: (p: PrintPreset) => string
}) {
  const mine = presets.filter(p => p.report === report)
  const [naming, setNaming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const add = (name: string) => {
    if (!name.trim()) return
    onAdd(name.trim())
    setNaming(null)
  }
  return (
    <div data-print-presets className="flex flex-wrap items-center gap-1.5 px-4 py-1.5 border-b border-gray-800 shrink-0">
      <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1"
        title="One click sets the paper, scale and layer sets for this report — shared by the whole shop">Print presets:</span>
      {mine.length === 0 && naming === null && <span className="text-[11px] text-gray-600">none yet</span>}
      {mine.map(p => (
        <span key={p.id} className={`inline-flex items-center rounded text-xs border ${p.id === activeId ? 'border-blue-500 bg-blue-600/25 text-blue-200' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}>
          <button className="pl-2 pr-1 py-0.5" title={describe(p)} onClick={() => onApply(p)}>{p.name}</button>
          {deleting === p.id ? (
            <button className="pr-1.5 py-0.5 text-red-400" onClick={() => { onDelete(p.id); setDeleting(null) }}
              onBlur={() => setDeleting(null)}>delete?</button>
          ) : (
            <button className="pr-1.5 py-0.5 text-gray-500 hover:text-red-400" title="Delete this preset" onClick={() => setDeleting(p.id)}>×</button>
          )}
        </span>
      ))}
      {naming === null ? (
        <button className="px-1.5 py-0.5 text-[11px] text-gray-400 hover:text-gray-200" onClick={() => setNaming(suggestName())}
          title="Save this report's paper, scale and layer sets as a preset">+ Save current</button>
      ) : (
        <span className="inline-flex items-center gap-1">
          <input autoFocus value={naming} onChange={e => setNaming(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(naming); if (e.key === 'Escape') setNaming(null) }}
            className="w-56 text-xs bg-gray-800 border border-gray-700 text-gray-200 rounded px-1.5 py-0.5" />
          <button className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded" onClick={() => add(naming)}>Save</button>
          <button className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-200" onClick={() => setNaming(null)}>Cancel</button>
        </span>
      )}
    </div>
  )
}
