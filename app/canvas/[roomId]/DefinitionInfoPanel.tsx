'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetDefinition } from '@/src/lib/types'

// Read-only properties panel for a library definition that's armed for placement.
// Definitions are authored on the canvas (Save to library) and organised on the
// management page, so this panel only displays — it doesn't edit.

type Row = CabinetDefinition & {
  cabinet_categories: { name: string } | null
  cabinet_subcategories: { name: string } | null
}

export default function DefinitionInfoPanel({ definitionId }: { definitionId: string }) {
  const [def, setDef] = useState<Row | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('cabinet_definitions')
        .select('*, cabinet_categories(name), cabinet_subcategories(name)')
        .eq('id', definitionId).single()
      if (!cancelled) setDef((data as Row) ?? null)
    })()
    return () => { cancelled = true }
  }, [definitionId])

  const lbl = 'text-[10px] text-gray-500 uppercase tracking-wider mb-0.5 block'
  const box = 'w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto'

  // While switching definitions, def may still hold the previous row — gate on id.
  if (!def || def.id !== definitionId) {
    return <div className={box}><p className="p-4 text-xs text-gray-500">Loading…</p></div>
  }

  const mat = (def.material_overrides ?? {}) as Record<string, unknown>
  const hw  = (def.hardware_overrides ?? {}) as Record<string, unknown>
  const tk  = (def.toekick_overrides ?? {}) as Record<string, unknown>
  const preserved: string[] = []
  if (mat.interior) preserved.push('Carcase material')
  if (Object.keys(tk).length) preserved.push('Toekick material')
  if (hw.slide_id) preserved.push('Drawer slide')
  if (hw.hinge_hardware_id) preserved.push('Hinge')
  if (def.exposed_interior) preserved.push('Exposed interior')

  const modules = [
    ['Carcass', def.has_carcass], ['Internal', def.has_internal],
    ['Face', def.has_face], ['Toekick', def.has_toekick],
  ] as const

  return (
    <div className={box}>
      <div className="px-4 py-3 border-b border-gray-800">
        <p className="text-xs font-medium text-gray-200">{def.name}</p>
        <p className="text-[10px] text-blue-400 capitalize">Library · {def.assembly_class.replace('_', ' ')}</p>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <label className={lbl}>Dimensions (W × H × D)</label>
          <p className="text-xs text-gray-200 font-mono">{def.default_dx} × {def.default_dy} × {def.default_dz} mm</p>
        </div>

        <div>
          <label className={lbl}>Library location</label>
          <p className="text-xs text-gray-200">
            {def.cabinet_categories?.name ?? '—'} <span className="text-gray-600">›</span> {def.cabinet_subcategories?.name ?? '—'}
          </p>
        </div>

        <div>
          <label className={lbl}>Construction</label>
          <p className="text-xs text-gray-200 capitalize">Top: {(def.top_type ?? '—').replace('_', ' ')} · Toe: {(def.toe_type ?? '—').replace('_', ' ')}</p>
        </div>

        <div>
          <label className={lbl}>Modules</label>
          <div className="flex flex-wrap gap-1">
            {modules.map(([name, on]) => (
              <span key={name} className={`text-[10px] px-1.5 py-0.5 rounded ${on ? 'bg-blue-600/20 text-blue-300' : 'bg-gray-800 text-gray-600 line-through'}`}>{name}</span>
            ))}
          </div>
        </div>

        {def.description && (
          <div>
            <label className={lbl}>Description</label>
            <p className="text-xs text-gray-300">{def.description}</p>
          </div>
        )}

        <div>
          <label className={lbl}>Preserved on placement</label>
          {preserved.length ? (
            <div className="flex flex-wrap gap-1">
              {preserved.map(p => (
                <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-600/20 text-amber-300">{p}</span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">Nothing — fully re-resolves per job.</p>
          )}
        </div>
      </div>

      <div className="mt-auto px-4 py-3 border-t border-gray-800">
        <p className="text-[11px] text-blue-400">Click near a wall to place · Esc to cancel</p>
      </div>
    </div>
  )
}
