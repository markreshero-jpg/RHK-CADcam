'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetDefinition } from '@/src/lib/types'
import { searchTokens, scoreDef } from '@/src/lib/cabinetSearch'
import type { InsertFavourite } from './insertFavourites'

type Cat = { id: string; name: string; sort_order: number; parent_id: string | null }

const CLASS_LABEL: Record<string, string> = {
  base: 'Base', wall: 'Wall', tall: 'Tall',
  base_corner: 'Base corner', wall_corner: 'Wall corner', tall_corner: 'Tall corner',
}

// Tick the library items offered under right-click → Insert (same look as the
// Replace with library cabinet picker). Saving hands the ticked list back.
export default function InsertFavouritesModal({ favourites, onSave, onClose }: {
  favourites: InsertFavourite[]
  onSave: (favs: InsertFavourite[]) => void
  onClose: () => void
}) {
  const [cats, setCats] = useState<Cat[]>([])
  const [defs, setDefs] = useState<CabinetDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [onlyTicked, setOnlyTicked] = useState(false)
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(favourites.map(f => f.id)))

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
    const tokens = searchTokens(search)
    const visible = defs
      .map((d, i) => ({ d, i, s: scoreDef(d, tokens, pathOf(d.category_id)) }))
      .filter(x => x.s > 0 && (!onlyTicked || ticked.has(x.d.id)))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map(x => x.d)
    const byPath = new Map<string, CabinetDefinition[]>()
    for (const d of visible) {
      const p = pathOf(d.category_id)
      byPath.set(p, [...(byPath.get(p) ?? []), d])
    }
    return [...byPath.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defs, cats, search, onlyTicked, ticked])

  function toggle(id: string) {
    setTicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  function save() {
    // Keep the existing order for items still ticked; newly ticked ones follow in
    // library order. Ticked items the library no longer has (deleted / inactive)
    // drop out once the library has loaded.
    const byId = new Map(defs.map(d => [d.id, d]))
    const kept = favourites.filter(f => ticked.has(f.id) && (loading || byId.has(f.id)))
      .map(f => { const d = byId.get(f.id); return d ? { id: d.id, name: d.name, assembly_class: d.assembly_class } : f })
    const keptIds = new Set(kept.map(f => f.id))
    const added = defs.filter(d => ticked.has(d.id) && !keptIds.has(d.id))
      .map(d => ({ id: d.id, name: d.name, assembly_class: d.assembly_class }))
    onSave([...kept, ...added])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onPointerDown={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[30rem] max-h-[85vh] p-6 flex flex-col gap-4"
        onPointerDown={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
        <div>
          <p className="text-sm font-semibold text-white">Edit insert list</p>
          <p className="text-xs text-gray-400 mt-1">
            Ticked library items appear under right-click → Insert, each with Left side / Right side.
            A cabinet shows the items of its own type (base, wall, tall) first; the rest sit under Other.
          </p>
        </div>

        <input value={search} autoFocus onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save() }}
          placeholder="Search code, description, folder…"
          className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500" />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
            <input type="checkbox" checked={onlyTicked} onChange={() => setOnlyTicked(v => !v)} className="accent-blue-500" />
            Show ticked only
          </label>
          <span className="text-xs text-gray-500">{ticked.size} ticked</span>
          {ticked.size > 0 && (
            <button onClick={() => setTicked(new Set())} className="text-xs text-gray-400 hover:text-white underline">Untick all</button>
          )}
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
                const on = ticked.has(d.id)
                return (
                  <label key={d.id}
                    className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-sm transition-colors
                      ${on ? 'bg-blue-600/20 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(d.id)} className="accent-blue-500" />
                    <span className="flex-1 min-w-0 truncate">
                      {d.name}
                      {d.description && <span className="ml-2 text-[11px] text-gray-500">{d.description}</span>}
                    </span>
                    <span className="text-[10px] text-gray-500">{CLASS_LABEL[d.assembly_class] ?? d.assembly_class}</span>
                    <span className="text-[11px] text-gray-500 font-mono">{d.default_dx}×{d.default_dy}×{d.default_dz}</span>
                  </label>
                )
              })}
            </div>
          ))}
        </div>

        <p className="text-[11px] text-gray-500">
          Inserted items butt against the cabinet and take its height, depth and elevation when they are the same type.
          Saved in this browser.
        </p>
        {err && <p className="text-xs text-red-400">{err}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-xs rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors">Cancel</button>
          <button onClick={save}
            className="px-4 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
