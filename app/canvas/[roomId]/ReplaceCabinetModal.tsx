'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance, CabinetDefinition } from '@/src/lib/types'

type Cat = { id: string; name: string; sort_order: number; parent_id: string | null }

const CLASS_LABEL: Record<string, string> = {
  base: 'Base', wall: 'Wall', tall: 'Tall',
  base_corner: 'Base corner', wall_corner: 'Wall corner', tall_corner: 'Tall corner',
}

// Pick a library definition to swap in for an existing cabinet. The swap itself
// (keeping position/label/kick run) is done by the caller — see handleReplaceCabinet.
export default function ReplaceCabinetModal({ cab, onReplace, onClose }: {
  cab: CabinetInstance
  onReplace: (definitionId: string, keepWidth: boolean, keepHeight: boolean) => void
  onClose: () => void
}) {
  const [cats, setCats] = useState<Cat[]>([])
  const [defs, setDefs] = useState<CabinetDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sameClass, setSameClass] = useState(true)
  const [keepWidth, setKeepWidth] = useState(true)
  const [keepHeight, setKeepHeight] = useState(true)
  const [selId, setSelId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [c, d] = await Promise.all([
        supabase.from('cabinet_categories').select('id,name,sort_order,parent_id').eq('active', true).order('sort_order'),
        supabase.from('cabinet_definitions').select('*').eq('is_library_item', true).eq('active', true).order('sort_order'),
      ])
      if (cancelled) return
      setLoading(false)
      if (d.error) { setErr(d.error.message); return }
      setCats((c.data ?? []) as Cat[])
      setDefs((d.data ?? []) as CabinetDefinition[])
    })()
    return () => { cancelled = true }
  }, [])

  const pathOf = (id: string | null): string => {
    const out: string[] = []
    let cur = cats.find(c => c.id === id)
    while (cur) { out.unshift(cur.name); cur = cur.parent_id ? cats.find(c => c.id === cur!.parent_id) : undefined }
    return out.join(' › ') || 'Uncategorised'
  }

  // Visible definitions grouped by category path (sorted by path, then library order).
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const visible = defs.filter(d =>
      (!sameClass || d.assembly_class === cab.assembly_class) &&
      (!q || d.name.toLowerCase().includes(q)))
    const byPath = new Map<string, CabinetDefinition[]>()
    for (const d of visible) {
      const p = pathOf(d.category_id)
      byPath.set(p, [...(byPath.get(p) ?? []), d])
    }
    return [...byPath.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defs, cats, search, sameClass, cab.assembly_class])

  const selected = defs.find(d => d.id === selId) ?? null
  const classChange = selected && selected.assembly_class !== cab.assembly_class

  function confirm(id = selId) {
    if (id) onReplace(id, keepWidth, keepHeight)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onPointerDown={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[30rem] max-h-[85vh] p-6 flex flex-col gap-4"
        onPointerDown={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
        <div>
          <p className="text-sm font-semibold text-white">Replace with library cabinet</p>
          <p className="text-xs text-gray-400 mt-1">
            Replacing <span className="text-gray-200">{cab.label ?? cab.assembly_class}</span> ({cab.dx}×{cab.dy}×{cab.dz}).
            Position, wall and label are kept; construction, faces and internals come from the library cabinet.
          </p>
        </div>

        <input value={search} autoFocus onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') confirm() }}
          placeholder="Search library…"
          className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500" />

        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
            <input type="checkbox" checked={sameClass} onChange={() => setSameClass(v => !v)} className="accent-blue-500" />
            Only {CLASS_LABEL[cab.assembly_class] ?? cab.assembly_class} cabinets
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
            <input type="checkbox" checked={keepWidth} onChange={() => setKeepWidth(v => !v)} className="accent-blue-500" />
            Keep current width ({cab.dx}mm)
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
            <input type="checkbox" checked={keepHeight} onChange={() => setKeepHeight(v => !v)} className="accent-blue-500" />
            Keep current height ({cab.dy}mm)
          </label>
        </div>

        <div className="flex-1 min-h-40 overflow-y-auto bg-gray-800/40 border border-gray-700 rounded-md p-1">
          {loading && <p className="px-2 py-2 text-xs text-gray-500 italic">Loading library…</p>}
          {!loading && groups.length === 0 && (
            <p className="px-2 py-2 text-xs text-gray-500 italic">No matching library cabinets.</p>
          )}
          {groups.map(([path, items]) => (
            <div key={path} className="mb-1">
              <p className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-gray-500">{path}</p>
              {items.map(d => {
                const sel = d.id === selId
                return (
                  <div key={d.id}
                    onClick={() => setSelId(d.id)}
                    onDoubleClick={() => confirm(d.id)}
                    className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-sm transition-colors
                      ${sel ? 'bg-blue-600/30 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
                    <span className="flex-1 truncate">{d.name}</span>
                    {!sameClass && <span className="text-[10px] text-gray-500">{CLASS_LABEL[d.assembly_class] ?? d.assembly_class}</span>}
                    <span className="text-[11px] text-gray-500 font-mono">{d.default_dx}×{d.default_dy}×{d.default_dz}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {classChange && (
          <p className="text-[11px] text-amber-400">
            Changes type from {CLASS_LABEL[cab.assembly_class] ?? cab.assembly_class} to {CLASS_LABEL[selected!.assembly_class] ?? selected!.assembly_class} — the label will be renumbered.
          </p>
        )}
        <p className="text-[11px] text-gray-500">
          Part edits, custom parts and shape changes made on this cabinet are not carried over.
        </p>
        {err && <p className="text-xs text-red-400">{err}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-xs rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors">Cancel</button>
          <button onClick={() => confirm()} disabled={!selId}
            className="px-4 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
            Replace
          </button>
        </div>
      </div>
    </div>
  )
}
