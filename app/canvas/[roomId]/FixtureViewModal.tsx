'use client'

// ── Fixture view modal (z_fixtures) ───────────────────────────────────────────
// Double-click a placed fixture → a big viewer (3D + Front/Back/Left/Right/Top
// ortho, measure) beside the same edit fields as the right-docked FixturePanel.
// Edits are per placement (the job copy), exactly as in the panel.

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { RoomFixture, Wall } from '@/src/lib/types'
import type { ViewMode } from '@/src/components/three/PartViewer'
import FixturePanel from './FixturePanel'

const PreviewCanvas = dynamic(
  () => import('@/src/components/three/PartViewer').then(m => ({ default: m.PreviewCanvas })),
  { ssr: false },
)
const FixtureModel = dynamic(
  () => import('@/src/components/three/FixtureModel').then(m => ({ default: m.FixtureModel })),
  { ssr: false },
)

const VIEWS: ViewMode[] = ['3d', 'front', 'back', 'left', 'side', 'top']
const VIEW_LABELS: Partial<Record<ViewMode, string>> = { back: 'Back', left: 'Left', side: 'Right' }

export default function FixtureViewModal({ fixture, walls, onUpdate, onDelete, onMove, onTurn, onClose }: {
  fixture:  RoomFixture
  walls:    Wall[]
  onUpdate: (id: string, patch: Partial<RoomFixture>) => void
  onDelete: (id: string) => void
  onMove:   (id: string) => void
  onTurn:   (id: string, deg: number) => void
  onClose:  () => void
}) {
  const f = fixture
  const [outline, setOutline] = useState(true)

  // The modal owns Escape while open (capture phase, before the canvas handler).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      e.stopImmediatePropagation(); e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onPointerDown={onClose}
    >
      <div
        className="flex w-full h-full max-w-6xl max-h-[88vh] bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <div className="flex-none bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
            <div className="flex items-baseline gap-3 min-w-0">
              <span className="text-sm font-medium text-gray-200 truncate">{f.label || f.name}</span>
              <span className="text-xs text-gray-500 font-mono whitespace-nowrap">{f.width} × {f.depth} × {f.height}mm</span>
              <span className="text-[10px] text-gray-500 whitespace-nowrap">W × D × H</span>
            </div>
            <div className="flex items-center gap-3">
              {f.model_url && (
                <label className="flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer select-none">
                  <input type="checkbox" checked={outline} onChange={e => setOutline(e.target.checked)} />
                  Size box
                </label>
              )}
              <button onClick={onClose} className="text-gray-500 hover:text-white text-sm" title="Close (Esc)">✕</button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <PreviewCanvas
              key={f.id}
              dx={f.width} dy={f.height} dz={f.depth}
              bgColor="#111827"
              viewModes measure enablePan
              views={VIEWS} viewLabels={VIEW_LABELS}
            >
              <group position={[-f.width / 2, -f.height / 2, -f.depth / 2]}>
                <FixtureModel f={f} outline={!!f.model_url && outline} />
              </group>
            </PreviewCanvas>
          </div>
          {!f.model_url && (
            <div className="flex-none px-4 py-1.5 text-[11px] text-gray-500 border-t border-gray-800">
              No 3D model on this item — add one in Settings → Library → Fixtures &amp; Appliances.
            </div>
          )}
        </div>
        <FixturePanel
          fixture={f}
          walls={walls}
          onUpdate={onUpdate}
          onDelete={id => { onClose(); onDelete(id) }}
          onMove={id => { onClose(); onMove(id) }}
          onTurn={onTurn}
        />
      </div>
    </div>
  )
}
