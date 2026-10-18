'use client'

// Per-view "Hide in" ticks for one part (z_display_layers/PART-HIDE-SPEC.md).
// The cabinet editor provides PartHideContext; the Parts tab, the right-click
// menus and the docked part panels all render <PartHideTicks partId=…/>.
// Without a provider (library viewers etc.) it renders nothing.
// The same provider carries the per-part "No CNC" tick (<PartNoCncTick/>):
// unlike hiding, that one keeps the part out of the optimiser / CNC.

import { createContext, useContext } from 'react'
import type { PartHideView } from '@/src/lib/resolver/types'
import { PART_HIDE_VIEWS, isHideablePartId } from '@/src/lib/resolver/filterHidden'

export interface PartHideApi {
  get(partId: string): PartHideView[]
  set(partId: string, views: PartHideView[]): void
  /** true = don't send this part to the optimiser / CNC. */
  getNoCnc(partId: string): boolean
  setNoCnc(partId: string, noCnc: boolean): void
}

export const PartHideContext = createContext<PartHideApi | null>(null)

export const HIDE_COLS: { view: PartHideView; label: string; title: string }[] = [
  { view: 'plan',      label: 'Plan', title: 'Hide in the room plan view (and plan report)' },
  { view: 'elevation', label: 'Elev', title: 'Hide in the room elevation view (and elevation report)' },
  { view: '3d',        label: '3D',   title: 'Hide in the room 3D view' },
]

/** "No CNC" tick for one part — not cut on the CNC (the optimiser leaves it out). */
export function PartNoCncTick({ partId, label = false }: { partId: string; label?: boolean }) {
  const api = useContext(PartHideContext)
  if (!api || !isHideablePartId(partId)) return null
  const box = (
    <input type="checkbox" checked={api.getNoCnc(partId)} onChange={e => api.setNoCnc(partId, e.target.checked)}
      title="Don't cut on the CNC (left out of the optimiser). Still drawn."
      className="accent-red-500 w-3.5 h-3.5 cursor-pointer" />
  )
  if (!label) return box
  return <label className="flex items-center gap-1 cursor-pointer text-[11px] text-gray-300">{box}No CNC (don&apos;t cut)</label>
}

/** Plan / Elev / 3D / All ticks. `compact` = ticks only (table cells). */
export function PartHideTicks({ partId, compact = false, className = '' }: {
  partId: string
  compact?: boolean
  className?: string
}) {
  const api = useContext(PartHideContext)
  if (!api || !isHideablePartId(partId)) return null
  const views = api.get(partId)
  const all = PART_HIDE_VIEWS.every(v => views.includes(v))
  const toggle = (v: PartHideView) => api.set(partId, views.includes(v) ? views.filter(x => x !== v) : [...views, v])
  const box = (checked: boolean, onChange: () => void, title: string, indeterminate = false) => (
    <input type="checkbox" checked={checked} onChange={onChange} title={title}
      ref={el => { if (el) el.indeterminate = indeterminate }}
      className="accent-orange-500 w-3.5 h-3.5 cursor-pointer" />
  )
  const allBox = box(all, () => api.set(partId, all ? [] : [...PART_HIDE_VIEWS]), 'Hide in every room view', !all && views.length > 0)

  if (compact) {
    return (
      <span className={`flex items-center justify-around w-full ${className}`}>
        {HIDE_COLS.map(c => <span key={c.view} className="flex">{box(views.includes(c.view), () => toggle(c.view), c.title)}</span>)}
        {allBox}
      </span>
    )
  }
  return (
    <div className={className} onClick={e => e.stopPropagation()}
      title="Hide in a room view. Visual only — still cut; always shown in the cabinet editor.">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-500 pb-1">Hide in room view</div>
      <div className="flex items-center gap-2.5">
        {HIDE_COLS.map(c => (
          <label key={c.view} className="flex items-center gap-1 cursor-pointer text-[11px] text-gray-300">
            {box(views.includes(c.view), () => toggle(c.view), c.title)}{c.label}
          </label>
        ))}
        <label className="flex items-center gap-1 cursor-pointer text-[11px] text-gray-300">{allBox}All</label>
      </div>
      <div className="pt-1.5"><PartNoCncTick partId={partId} label /></div>
    </div>
  )
}
