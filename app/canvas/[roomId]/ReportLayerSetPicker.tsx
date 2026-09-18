// Layer set picker for print reports (z_display_layers spec, Phase 3c).
// Starts on the canvas's active set; the last pick is remembered per report in
// localStorage (a per-viewer convenience — falls back to the active set).
'use client'
import { useEffect, useState } from 'react'
import type { LayerSet } from '@/src/lib/displayLayers/registry'

export function useReportLayerSet(storageKey: string, sets: LayerSet[], activeSetId: string | null) {
  const [picked, setPicked] = useState<string | null>(() => {
    try { return localStorage.getItem(storageKey) } catch { return null }
  })
  useEffect(() => {
    try { if (picked) localStorage.setItem(storageKey, picked) } catch { /* storage unavailable */ }
  }, [storageKey, picked])
  const set = sets.find(s => s.id === picked) ?? sets.find(s => s.id === activeSetId) ?? sets[0]
  return [set, setPicked] as const
}

export function ReportLayerSetSelect({ sets, value, onChange }: {
  sets: LayerSet[]
  value: LayerSet | undefined
  onChange: (id: string) => void
}) {
  return (
    <label className="flex items-center gap-1.5 mr-2">
      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Layer set:</span>
      <select value={value?.id ?? ''} onChange={e => onChange(e.target.value)}
        data-report-layer-set=""
        className="bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-gray-200">
        {!value && <option value="">Default</option>}
        {sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  )
}
