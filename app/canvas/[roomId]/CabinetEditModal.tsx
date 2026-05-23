'use client'

import { useState, useEffect, useRef } from 'react'
import type { CabinetInstance, Wall } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { PartMeta, PartEdge, PartPropertiesPanel } from '@/src/components/three/PartViewer'
import { dbResolveAndPersistCabinet, dbLoadCustomParts, type CabinetCustomPart } from './canvasDB'
import CabinetPanel from './CabinetPanel'
import Cabinet3DView from './Cabinet3DView'
import FaceGridEditor from './FaceGridEditor'
import { saveSVGEdge } from './cabinetEditSvgHelpers'
import { ResolvedElevation, ResolvedTop, ResolvedSide, TopView, ElevationView, SideView, PartPickerMenu } from './ResolvedViews'
import PartsView from './PartsView'
import JointsPanel from './JointsPanel'

type ViewId = 'top' | 'elevation' | 'side' | 'parts' | '3d' | 'face' | 'joints'

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'top',       label: 'Top' },
  { id: 'elevation', label: 'Elevation' },
  { id: 'side',      label: 'Side' },
  { id: 'face',      label: 'Face Grid' },
  { id: '3d',        label: '3D' },
  { id: 'parts',     label: 'Parts' },
  { id: 'joints',    label: 'Joints' },
]

export default function CabinetEditModal({
  cabinet, wall, wallCabinets, resolvedCabinet, initialView, onUpdate, onDelete, onClose, materialColours, ebByMatId,
}: {
  cabinet: CabinetInstance
  wall: Wall | null
  wallCabinets: CabinetInstance[]
  resolvedCabinet?: ResolvedCabinet
  initialView?: ViewId | 'joints'
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
  materialColours?: Record<string, string | { face?: string; back?: string; edge?: string }>
  ebByMatId?: Record<string, { thickness: number; color: string | null }>
}) {
  const [activeView, setActiveView]       = useState<ViewId>(initialView ?? 'elevation')
  const [wireMode, setWireMode]           = useState(true)
  const [showInternals, setShowInternals] = useState(true)
  const [selectedSVGPart, setSelectedSVGPart] = useState<PartMeta | null>(null)
  const [picker, setPicker] = useState<{ parts: PartMeta[]; clientX: number; clientY: number } | null>(null)
  const [localRp, setLocalRp]             = useState<ResolvedCabinet | null>(null)
  const [resolving, setResolving]         = useState(false)
  const [customParts, setCustomParts]     = useState<CabinetCustomPart[]>([])

  const prevPartRef     = useRef<PartMeta | null>(null)
  const originalEdgeRef = useRef<PartEdge | null>(null)

  const isOrthoView = activeView !== '3d' && activeView !== 'parts' && activeView !== 'face' && activeView !== 'joints'

  useEffect(() => {
    if (resolvedCabinet) return
    setResolving(true)
    dbResolveAndPersistCabinet(cabinet.id).then(result => {
      if (result) setLocalRp(result)
    }).finally(() => setResolving(false))
  }, [cabinet.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    dbLoadCustomParts(cabinet.id).then(setCustomParts)
  }, [cabinet.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Auto-save edge changes when selection moves to another part
  useEffect(() => {
    const prev = prevPartRef.current
    if (prev && prev.id !== selectedSVGPart?.id && originalEdgeRef.current) {
      const orig = originalEdgeRef.current
      const changed = (Object.keys(orig) as (keyof PartEdge)[]).some(k => prev.edge[k] !== orig[k])
      if (changed) saveSVGEdge(cabinet.id, prev)
    }
    if (selectedSVGPart && selectedSVGPart.id !== prev?.id) {
      originalEdgeRef.current = { ...selectedSVGPart.edge }
    } else if (!selectedSVGPart) {
      originalEdgeRef.current = null
    }
    prevPartRef.current = selectedSVGPart
  }, [selectedSVGPart]) // eslint-disable-line react-hooks/exhaustive-deps

  function handlePartsAtPoint(parts: PartMeta[], cx: number, cy: number) {
    setPicker(null)
    if (parts.length === 0) {
      setSelectedSVGPart(null)
    } else if (parts.length === 1) {
      setSelectedSVGPart(prev => prev?.id === parts[0].id ? null : parts[0])
    } else {
      setPicker({ parts, clientX: cx, clientY: cy })
    }
  }

  function handleSVGEdgeChange(edge: PartEdge) {
    setSelectedSVGPart(prev => prev ? { ...prev, edge } : null)
  }

  // Hold the last known-good resolved data so the 3D view never blanks while the
  // parent re-resolves after a field edit (resolvedCabinet briefly becomes undefined).
  const lastRpRef = useRef<ResolvedCabinet | undefined>(undefined)
  const currentRp = resolvedCabinet ?? localRp ?? undefined
  if (currentRp !== undefined) lastRpRef.current = currentRp
  const rp = currentRp ?? lastRpRef.current

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onPointerDown={onClose}
    >
      <div
        className="flex w-full h-full max-w-7xl max-h-[92vh] bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Left: view tabs + canvas */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          {/* Header */}
          <div className="flex-none bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
            <div className="flex items-baseline gap-3">
              <span className="text-sm font-medium text-gray-200">
                {cabinet.label ?? cabinet.assembly_class.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-gray-500 font-mono">
                {cabinet.dx} × {cabinet.dy} × {cabinet.dz}mm
              </span>
              {!rp && resolving && (
                <span className="text-[10px] text-sky-500 italic">resolving…</span>
              )}
              {!rp && !resolving && (
                <span className="text-[10px] text-amber-600 italic">resolver data unavailable — showing approximate views</span>
              )}
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none px-1">✕</button>
          </div>
          {/* Tabs */}
          <div className="flex-none bg-gray-800/60 border-b border-gray-700 px-4 py-1.5 flex items-center gap-1">
            {VIEWS.map(v => {
              const disabled = (v.id === 'parts' || v.id === '3d') && !rp
              return (
                <button
                  key={v.id}
                  onClick={() => !disabled && setActiveView(v.id)}
                  disabled={disabled}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    activeView === v.id
                      ? 'bg-blue-600 text-white'
                      : disabled
                      ? 'text-gray-600 cursor-not-allowed'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  {v.label}
                </button>
              )
            })}
            {(isOrthoView || activeView === 'face') && rp && (
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  onClick={() => setWireMode(w => !w)}
                  title="Toggle wire / solid view"
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    wireMode
                      ? 'bg-sky-700/80 text-sky-200 hover:bg-sky-600/80'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  Wire
                </button>
                <button
                  onClick={() => setShowInternals(s => !s)}
                  title="Toggle drawer box / slide visibility"
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    showInternals
                      ? 'bg-emerald-800/80 text-emerald-300 hover:bg-emerald-700/80'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  Internals
                </button>
              </div>
            )}
          </div>
          {/* Content */}
          <div
            className={`flex-1 overflow-hidden relative ${
              activeView === 'parts'   ? 'bg-gray-900'
              : activeView === '3d'    ? 'bg-gray-950'
              : activeView === 'face'  ? 'bg-gray-950'
              : activeView === 'joints' ? 'bg-gray-900'
              : 'flex items-center justify-center bg-gray-950 p-6'
            }`}
            onClick={isOrthoView ? () => { setSelectedSVGPart(null); setPicker(null) } : undefined}
          >
            {activeView === 'top' && (
              rp ? <ResolvedTop cab={cabinet} rp={rp} wireMode={wireMode} showInternals={showInternals}
                selectedPartId={selectedSVGPart?.id ?? null} onPartsAtPoint={handlePartsAtPoint}
                customParts={customParts} />
              : <TopView cab={cabinet} />
            )}
            {activeView === 'elevation' && (
              rp ? <ResolvedElevation cab={cabinet} rp={rp} wireMode={wireMode} showInternals={showInternals}
                selectedPartId={selectedSVGPart?.id ?? null} onPartsAtPoint={handlePartsAtPoint}
                customParts={customParts} />
              : <ElevationView cab={cabinet} />
            )}
            {activeView === 'side' && (
              rp ? <ResolvedSide cab={cabinet} rp={rp} wireMode={wireMode} showInternals={showInternals}
                selectedPartId={selectedSVGPart?.id ?? null} onPartsAtPoint={handlePartsAtPoint}
                customParts={customParts} />
              : <SideView cab={cabinet} />
            )}
            {activeView === 'face' && <FaceGridEditor cabinet={cabinet} rp={rp} showInternals={showInternals} onUpdate={onUpdate} />}
            {activeView === '3d'     && rp && <Cabinet3DView cab={cabinet} rp={rp} materialColours={materialColours} ebByMatId={ebByMatId} customParts={customParts} />}
            {activeView === 'parts'  && rp && <PartsView rp={rp} cabinetId={cabinet.id} customParts={customParts} setCustomParts={setCustomParts} />}
            {activeView === 'joints' && <JointsPanel cabinet={cabinet} rp={rp} onUpdate={onUpdate} />}
            {selectedSVGPart && isOrthoView && (
              <PartPropertiesPanel
                part={selectedSVGPart}
                onClose={() => setSelectedSVGPart(null)}
                onEdgeChange={handleSVGEdgeChange}
              />
            )}
            {picker && (
              <PartPickerMenu
                parts={picker.parts}
                clientX={picker.clientX}
                clientY={picker.clientY}
                onPick={part => { setSelectedSVGPart(part); setPicker(null) }}
                onClose={() => setPicker(null)}
              />
            )}
          </div>
        </div>

        {/* Right: properties panel */}
        <div className="flex-none w-72 border-l border-gray-800 overflow-y-auto">
          <CabinetPanel
            cabinet={cabinet}
            wall={wall}
            wallCabinets={wallCabinets}
            room={null}
            onUpdate={onUpdate}
            onDelete={async id => { await onDelete(id); onClose() }}
          />
        </div>
      </div>
    </div>
  )
}
