'use client'

// The card for a fixture picked inside the cabinet edit modal (z_ubo U5):
// what it is, swap it for another catalogue item of the same kind, remove it,
// or close the modal and select it on the canvas (its full panel).

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { FixtureCatalogItem, RoomFixture } from '@/src/lib/types'

export default function CabinetFixtureCard({ f, onSwap, onRemove, onSelectOnCanvas, onClose }: {
  f: RoomFixture
  onSwap: (item: FixtureCatalogItem) => void | Promise<void>
  onRemove: () => void | Promise<void>
  onSelectOnCanvas: () => void
  onClose: () => void
}) {
  const [options, setOptions] = useState<FixtureCatalogItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    let q = supabase.from('fixture_catalog').select('*').eq('active', true).eq('category', f.category)
    if (f.kind) q = q.eq('kind', f.kind)
    void q.order('sort_order').order('name').then(({ data }) => {
      if (!cancelled) setOptions((data ?? []) as FixtureCatalogItem[])
    })
    return () => { cancelled = true }
  }, [f.category, f.kind])

  const btn = 'px-2 py-1 rounded border border-gray-600 text-gray-200 hover:bg-gray-700 text-xs'
  return (
    <div className="absolute top-3 right-3 z-20 w-64 rounded-lg border border-gray-700 bg-gray-900/95 p-3 text-xs text-gray-200 shadow-xl"
      onClick={e => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-sm">{f.label || f.name}</div>
          <div className="text-gray-400">{[f.brand, f.model_no].filter(Boolean).join(' ') || f.kind || f.category}</div>
          <div className="text-gray-400 font-mono">{Math.round(f.width)} × {Math.round(f.height)} × {Math.round(f.depth)}</div>
          {f.link_zone && <div className="text-sky-400 mt-0.5">Seated in the opening</div>}
        </div>
        <button className="text-gray-500 hover:text-gray-200" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <label className="block mt-2 text-gray-400">Swap for</label>
      <select className="mt-0.5 w-full rounded border border-gray-600 bg-gray-800 px-1.5 py-1"
        value={f.catalog_id ?? ''} disabled={!options}
        onChange={e => { const item = options?.find(o => o.id === e.target.value); if (item) void onSwap(item) }}>
        {!options && <option value={f.catalog_id ?? ''}>Loading…</option>}
        {options && !options.some(o => o.id === f.catalog_id) && <option value={f.catalog_id ?? ''}>{f.name}</option>}
        {options?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <div className="mt-3 flex gap-2">
        <button className={btn} onClick={onSelectOnCanvas}>Select on canvas</button>
        <button className={btn + ' border-red-800 text-red-300 hover:bg-red-900/40'} onClick={() => void onRemove()}>Remove</button>
      </div>
    </div>
  )
}
