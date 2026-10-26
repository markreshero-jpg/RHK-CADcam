'use client'

// Plan view: several cabinets under one click (overheads over bases, a kick under
// its run, overlapping cabinets) → list them all, top-drawn first, like the
// Cabinet Edit modal's PartPickerMenu.

import { useEffect } from 'react'
import type { CabinetInstance } from '@/src/lib/types'

const CLASS_DOT: Record<string, string> = {
  base: '#3b82f6', base_corner: '#3b82f6', tall: '#a855f7', tall_corner: '#a855f7', wall: '#22c55e', wall_corner: '#22c55e',
}

function kindOf(c: CabinetInstance): string {
  if (c.is_kick_assembly) return 'kick'
  if (c.rule_overrides?.UNDER_PANEL) return 'under panel'
  return c.assembly_class.replace('_', ' ')
}

/** Cabinet ids under a client point (top-drawn first), from the plan hit polygons. */
export function cabinetsAtPoint(clientX: number, clientY: number): string[] {
  const ids: string[] = []
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const id = el.getAttribute('data-cab-id')
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

export default function CabinetPickerMenu({ cabinets, clientX, clientY, selectedId, onPick, onHover, onClose }: {
  cabinets: CabinetInstance[]; clientX: number; clientY: number; selectedId: string | null
  onPick: (id: string) => void; onHover: (id: string | null) => void; onClose: () => void
}) {
  useEffect(() => {
    const down = () => onClose()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const t = setTimeout(() => window.addEventListener('pointerdown', down), 10)
    window.addEventListener('keydown', key)
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key) }
  }, [onClose])

  const menuH = cabinets.length * 30 + 44
  const top  = Math.max(8, Math.min(clientY + 6, window.innerHeight - menuH - 8))
  const left = Math.max(8, Math.min(clientX + 6, window.innerWidth - 228))

  return (
    <div
      className="fixed z-[70] bg-gray-800 border border-gray-600 rounded-lg shadow-2xl overflow-hidden"
      style={{ top, left, minWidth: 200 }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onPointerLeave={() => onHover(null)}
    >
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-700 bg-gray-900/60">
        {cabinets.length} cabinets here — pick one
      </div>
      {cabinets.map(c => (
        <button
          key={c.id}
          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 hover:text-white flex items-center gap-2 ${c.id === selectedId ? 'text-white bg-gray-700/50' : 'text-gray-300'}`}
          onPointerEnter={() => onHover(c.id)}
          onClick={() => onPick(c.id)}
        >
          <span className="w-2 h-2 rounded-full flex-none" style={{ background: c.is_kick_assembly ? '#f59e0b' : CLASS_DOT[c.assembly_class] ?? '#6b7280' }} />
          <span className="flex-1 truncate">{c.label ?? '—'}</span>
          <span className="text-gray-500 text-[10px] shrink-0">{kindOf(c)} · {Math.round(c.dx)}×{Math.round(c.dz)}</span>
        </button>
      ))}
    </div>
  )
}
