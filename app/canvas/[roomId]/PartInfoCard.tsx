'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import { getUserPrefs } from '@/src/lib/userPrefs'
import { fmtMm } from '@/src/lib/format'
import { extForAxes, type PartMeta } from '@/src/components/three/PartViewer'

// Compact read-only part card for the cabinet edit modal's 3D view on phones
// (z_mobile/MOBILE-SPEC.md): floor staff tap a part to see what it is — name,
// short description, Length × Width × Thickness and material — without the full
// editing panel covering the model. "Details" opens the full panel in the drawer.

// Material names by id, shared across cards (one fetch per material per session).
const matNames = new Map<string, string>()

function useMaterialName(id: string | undefined): string | null {
  const [name, setName] = useState<string | null>(id ? matNames.get(id) ?? null : null)
  useEffect(() => {
    if (!id || matNames.has(id)) return
    let live = true
    supabase.from('materials').select('id,name').eq('id', id).maybeSingle().then(({ data }) => {
      if (!data) return
      matNames.set(data.id, data.name)
      if (live) setName(data.name)
    })
    return () => { live = false }
  }, [id])
  return id ? (matNames.get(id) ?? name) : null
}

/** Length / Width / Thickness as the full PartPropertiesPanel reads them (CV
 *  convention DY / DX / DZ), cut size unless the banding-included pref is on. */
function displaySize(part: PartMeta, ebThickness?: number) {
  let disp = { w: part.w, h: part.h, d: part.d }
  const banded = part.edge.top || part.edge.bottom || part.edge.left || part.edge.right
  const cut = !!ebThickness && banded && !getUserPrefs().includeBandingInPartSize
  if (cut) {
    const t = ebThickness!
    const tb = (part.edge.top ? t : 0) + (part.edge.bottom ? t : 0)
    const lr = (part.edge.left ? t : 0) + (part.edge.right ? t : 0)
    disp = part.panelKind === 'side'
      ? { w: part.w, h: part.h - tb, d: part.d - lr }
      : part.panelKind === 'face'
      ? { w: part.w - lr, h: part.h - tb, d: part.d }
      : { w: part.w - lr, h: part.h, d: part.d - tb }
  }
  const ext = extForAxes(part.panelKind, part.dxIsWidth)
  return { length: disp[ext.DY], width: disp[ext.DX], thickness: disp[ext.DZ], cut }
}

const KIND_TEXT: Record<PartMeta['panelKind'], string> = {
  side: 'Upright panel',
  horizontal: 'Flat panel',
  face: 'Front face',
}

export default function PartInfoCard({ part, ebThickness, onClose, onDetails }: {
  part: PartMeta
  ebThickness?: number
  onClose: () => void
  /** Open the full part panel (edges, joints, editable sizes). */
  onDetails?: () => void
}) {
  const material = useMaterialName(part.materialId)
  const s = displaySize(part, ebThickness)
  const edges = (['top', 'bottom', 'left', 'right'] as const).filter(e => part.edge[e])
  const description = part.detail || part.comment || KIND_TEXT[part.panelKind]

  return (
    <div className="absolute left-2 right-2 top-2 sm:right-auto sm:w-72 z-10 pointer-events-auto select-none
        bg-gray-900/92 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl text-gray-200"
      onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <div className="flex items-start gap-2 px-3 pt-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{part.label}</p>
          <p className="text-[11px] text-gray-400 leading-snug line-clamp-2">{description}</p>
        </div>
        <button onClick={onClose} aria-label="Close" title="Close"
          className="flex-none -mr-1 w-8 h-8 rounded-md flex items-center justify-center text-gray-400 active:bg-gray-800">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div className="px-3 pt-1.5 pb-2.5 flex items-end gap-3">
        <div className="flex-1 min-w-0 grid grid-cols-3 gap-2 text-center">
          {([['Length', s.length], ['Width', s.width], ['Thick', s.thickness]] as const).map(([k, v]) => (
            <div key={k} className="rounded-md bg-gray-800/70 py-1">
              <p className="text-[9px] uppercase tracking-wider text-gray-500">{k}</p>
              <p className="text-sm font-mono text-gray-100">{fmtMm(v)}</p>
            </div>
          ))}
        </div>
        {onDetails && (
          <button onClick={onDetails}
            className="flex-none h-9 px-2.5 rounded-md border border-gray-600 bg-gray-800/60 text-[11px] text-gray-200 active:bg-gray-700">
            Details
          </button>
        )}
      </div>
      <div className="px-3 pb-2.5 -mt-1 text-[11px] text-gray-400 truncate">
        {material ?? (part.materialId ? 'Loading material…' : 'No material')}
        {edges.length > 0 && <span className="text-gray-500"> · banded {edges.join(', ')}</span>}
        {s.cut && <span className="text-amber-500/80"> · cut size</span>}
      </div>
    </div>
  )
}
