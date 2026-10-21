'use client'

// Right-click menu on a CAD note / line (z_CAD_tool B4b). Corner items act on the
// corner nearest the click; "all corners" on every corner of a line or box.

import { useEffect } from 'react'
import type { RoomAnnotation } from '@/src/lib/types'
import { type LineGeom, segLength } from '@/src/lib/annotations/geometry'
import { OFFSETTABLE } from '@/src/lib/annotations/geometry'
import type { AnnotationTool } from './useAnnotationTool'

export default function CadContextMenu({ cad, annotations, zoom, onSaveBlock }: {
  cad:         AnnotationTool
  annotations: RoomAnnotation[]
  /** canvas zoom (px per mm) — how near the click must be to a corner. */
  zoom:        number
  /** Open the CAD panel's "save as block" name box for the selection (z_CAD_tool C1). */
  onSaveBlock?: () => void
}) {
  const m = cad.menu
  useEffect(() => {
    if (!m) return
    const close = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest?.('[data-cad-menu]')) cad.closeMenu() }
    window.addEventListener('pointerdown', close, true)
    return () => window.removeEventListener('pointerdown', close, true)
  }, [m, cad])
  if (!m) return null
  const a = annotations.find(x => x.id === m.id)
  if (!a) return null

  const g = a.kind === 'line' ? (a.geom as LineGeom) : null
  const pts = g?.pts ?? []
  // The corner under the click (lines only; an open line's ends aren't corners).
  let corner = -1
  if (g) {
    let best = 16 / zoom
    pts.forEach((p, i) => {
      const interior = g.closed || (i > 0 && i < pts.length - 1)
      const d = segLength(p, m.pt)
      if (interior && d < best) { best = d; corner = i }
    })
  }
  const run = (fn: () => void) => () => { fn(); cad.closeMenu() }
  type Item = { label: string; act: () => void; danger?: boolean } | 'sep'
  const items: Item[] = []
  if (corner >= 0) {
    items.push({ label: `Fillet this corner (R ${cad.filletR})`, act: run(() => cad.cornerOp(a.id, 'fillet', corner)) })
    items.push({ label: `Chamfer this corner (${cad.chamfer.d1} × ${cad.chamfer.d2})`, act: run(() => cad.cornerOp(a.id, 'chamfer', corner)) })
  }
  if ((g && pts.length >= 3) || a.kind === 'rect') {
    items.push({ label: `Fillet all corners (R ${cad.filletR})`, act: run(() => cad.cornerOp(a.id, 'fillet', 'all')) })
    items.push({ label: `Chamfer all corners`, act: run(() => cad.cornerOp(a.id, 'chamfer', 'all')) })
  }
  if (g && !g.closed) items.push({ label: 'Join with another line…', act: run(() => cad.startJoinFrom(a.id, m.pt)) })
  if (g && !g.closed && pts.length >= 3) items.push({ label: 'Close the outline', act: run(() => cad.setLineClosed(a.id, true)) })
  if (g?.closed) items.push({ label: 'Open the outline', act: run(() => cad.setLineClosed(a.id, false)) })
  if (a.kind === 'rect') items.push({ label: 'Convert to lines', act: run(() => cad.convertToLines(a.id)) })
  if (OFFSETTABLE.has(a.kind)) items.push({ label: 'Offset…', act: run(() => cad.startOffsetFrom(a.id)) })
  if (items.length) items.push('sep')
  items.push({ label: 'Duplicate', act: run(() => cad.paste([a])) })
  if (onSaveBlock) items.push({ label: cad.selected.length > 1 ? `Save ${cad.selected.length} items as CAD block…` : 'Save as CAD block…', act: run(onSaveBlock) })
  items.push({ label: 'Bring to front', act: run(() => cad.reorder('front')) })
  items.push({ label: 'Send to back', act: run(() => cad.reorder('back')) })
  items.push('sep')
  items.push({ label: 'Delete', act: run(cad.deleteSelected), danger: true })

  // Keep the menu on screen.
  const x = Math.min(m.x, window.innerWidth - 240), y = Math.min(m.y, window.innerHeight - items.length * 30 - 16)
  return (
    <div data-cad-menu className="fixed z-50 w-56 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1"
      style={{ left: x, top: y }} onContextMenu={e => e.preventDefault()}>
      {items.map((it, i) => it === 'sep'
        ? <div key={i} className="my-1 border-t border-gray-700" />
        : <button key={i} onClick={it.act}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 ${it.danger ? 'text-red-400' : 'text-gray-200'}`}>{it.label}</button>)}
    </div>
  )
}
