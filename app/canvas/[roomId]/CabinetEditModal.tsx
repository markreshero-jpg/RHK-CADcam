'use client'

import { useState, useEffect, useRef } from 'react'
import type { CabinetInstance, Wall } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { PartMeta, PartEdge, PartPropertiesPanel } from '@/src/components/three/PartViewer'
import {
  dbResolveAndPersistCabinet, dbLoadCustomParts, dbUpdateCustomPart,
  dbLoadPartPosOverrides, dbSavePartPosOverride, dbDeletePartPosOverride,
  type CabinetCustomPart, type PartPosOverrides,
} from './canvasDB'
import CabinetPanel from './CabinetPanel'
import Cabinet3DView from './Cabinet3DView'
import FaceGridEditor from './FaceGridEditor'
import { saveSVGEdge } from './cabinetEditSvgHelpers'
import { ResolvedElevation, ResolvedTop, ResolvedSide, TopView, ElevationView, SideView, PartPickerMenu } from './ResolvedViews'
import PartsView from './PartsView'
import JointsPanel from './JointsPanel'
import OverridesView from './OverridesView'

type ViewId = 'top' | 'elevation' | 'side' | 'parts' | '3d' | 'face' | 'joints' | 'overrides'

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'top',       label: 'Top' },
  { id: 'elevation', label: 'Elevation' },
  { id: 'side',      label: 'Side' },
  { id: 'face',      label: 'Face Grid' },
  { id: '3d',        label: '3D' },
  { id: 'parts',     label: 'Parts' },
  { id: 'joints',    label: 'Joints' },
  { id: 'overrides', label: 'Overrides' },
]

function PartPosOverridePanel({ part, cabinetId, customParts, partOverrides, onOverridesChange, setCustomParts }: {
  part: PartMeta
  cabinetId: string
  customParts: CabinetCustomPart[]
  partOverrides: PartPosOverrides
  onOverridesChange: (o: PartPosOverrides) => void
  setCustomParts: React.Dispatch<React.SetStateAction<CabinetCustomPart[]>>
}) {
  const isCustom = part.id.startsWith('custom_')
  const customPartId = isCustom ? part.id.slice(7) : null
  const cp = customPartId ? customParts.find(p => p.id === customPartId) ?? null : null
  const baseOv = partOverrides[part.id]

  const [ox, setOx] = useState(isCustom ? (cp?.x ?? 0) : (baseOv?.ox ?? 0))
  const [oy, setOy] = useState(isCustom ? (cp?.y ?? 0) : (baseOv?.oy ?? 0))
  const [oz, setOz] = useState(isCustom ? (cp?.z ?? 0) : (baseOv?.oz ?? 0))
  const [oax, setOax] = useState(baseOv?.oax ?? 0)
  const [oay, setOay] = useState(baseOv?.oay ?? 0)
  const [oaz, setOaz] = useState(baseOv?.oaz ?? 0)

  useEffect(() => {
    if (isCustom && cp) { setOx(cp.x); setOy(cp.y); setOz(cp.z) }
    else {
      const o = partOverrides[part.id]
      setOx(o?.ox ?? 0); setOy(o?.oy ?? 0); setOz(o?.oz ?? 0)
      setOax(o?.oax ?? 0); setOay(o?.oay ?? 0); setOaz(o?.oaz ?? 0)
    }
  }, [part.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function save(nx: number, ny: number, nz: number, nax = oax, nay = oay, naz = oaz) {
    if (isCustom && customPartId) {
      setCustomParts(prev => prev.map(p => p.id === customPartId ? { ...p, x: nx, y: ny, z: nz } : p))
      dbUpdateCustomPart(customPartId, { x: nx, y: ny, z: nz }).catch(console.error)
    } else {
      const ov = { ox: nx, oy: ny, oz: nz, oax: nax, oay: nay, oaz: naz }
      const updated = { ...partOverrides, [part.id]: ov }
      onOverridesChange(updated)
      dbSavePartPosOverride(cabinetId, part.id, ov, partOverrides).catch(console.error)
    }
  }

  function removeOverride() {
    const { [part.id]: _removed, ...updated } = partOverrides
    onOverridesChange(updated)
    dbDeletePartPosOverride(cabinetId, part.id, partOverrides).catch(console.error)
  }

  const hasOverride = !isCustom && !!partOverrides[part.id]
  const label = isCustom ? 'Position' : 'Offset'
  const inputCls = 'flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-right text-white focus:outline-none focus:border-blue-500'

  return (
    <div className="absolute bottom-3 right-3 w-52 bg-gray-900/95 border border-gray-700 rounded-lg shadow-xl pointer-events-auto select-none" onClick={e => e.stopPropagation()}>
      <div className="px-3 pt-2.5 pb-1.5 border-b border-gray-700 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">{label}</span>
        {hasOverride && (
          <button onClick={removeOverride}
            className="text-[10px] text-red-500 hover:text-red-300 transition-colors">Remove</button>
        )}
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-4 shrink-0">X</span>
          <input type="number" value={ox} step="1"
            onChange={e => setOx(parseFloat(e.target.value) || 0)}
            onBlur={e => { const v = parseFloat(e.target.value) || 0; setOx(v); save(v, oy, oz) }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            onFocus={e => e.target.select()}
            className={inputCls} />
          <span className="text-[10px] text-gray-600 shrink-0">mm</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-4 shrink-0">Y</span>
          <input type="number" value={oy} step="1"
            onChange={e => setOy(parseFloat(e.target.value) || 0)}
            onBlur={e => { const v = parseFloat(e.target.value) || 0; setOy(v); save(ox, v, oz) }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            onFocus={e => e.target.select()}
            className={inputCls} />
          <span className="text-[10px] text-gray-600 shrink-0">mm</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-4 shrink-0">Z</span>
          <input type="number" value={oz} step="1"
            onChange={e => setOz(parseFloat(e.target.value) || 0)}
            onBlur={e => { const v = parseFloat(e.target.value) || 0; setOz(v); save(ox, oy, v) }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            onFocus={e => e.target.select()}
            className={inputCls} />
          <span className="text-[10px] text-gray-600 shrink-0">mm</span>
        </div>
        {!isCustom && (
          <>
            <div className="border-t border-gray-800 pt-1.5" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-4 shrink-0">AX</span>
              <input type="number" value={oax} step="1"
                onChange={e => setOax(parseFloat(e.target.value) || 0)}
                onBlur={e => { const v = parseFloat(e.target.value) || 0; setOax(v); save(ox, oy, oz, v, oay, oaz) }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                onFocus={e => e.target.select()}
                className={inputCls} />
              <span className="text-[10px] text-gray-600 shrink-0">°</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-4 shrink-0">AY</span>
              <input type="number" value={oay} step="1"
                onChange={e => setOay(parseFloat(e.target.value) || 0)}
                onBlur={e => { const v = parseFloat(e.target.value) || 0; setOay(v); save(ox, oy, oz, oax, v, oaz) }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                onFocus={e => e.target.select()}
                className={inputCls} />
              <span className="text-[10px] text-gray-600 shrink-0">°</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-4 shrink-0">AZ</span>
              <input type="number" value={oaz} step="1"
                onChange={e => setOaz(parseFloat(e.target.value) || 0)}
                onBlur={e => { const v = parseFloat(e.target.value) || 0; setOaz(v); save(ox, oy, oz, oax, oay, v) }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                onFocus={e => e.target.select()}
                className={inputCls} />
              <span className="text-[10px] text-gray-600 shrink-0">°</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

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
  const [partOverrides, setPartOverrides] = useState<PartPosOverrides>({})

  const prevPartRef     = useRef<PartMeta | null>(null)
  const originalEdgeRef = useRef<PartEdge | null>(null)

  const isOrthoView = activeView !== '3d' && activeView !== 'parts' && activeView !== 'face' && activeView !== 'joints' && activeView !== 'overrides'

  useEffect(() => {
    if (resolvedCabinet) return
    setResolving(true)
    dbResolveAndPersistCabinet(cabinet.id).then(result => {
      if (result) setLocalRp(result)
    }).finally(() => setResolving(false))
  }, [cabinet.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    dbLoadCustomParts(cabinet.id).then(setCustomParts)
    dbLoadPartPosOverrides(cabinet.id).then(setPartOverrides)
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
              const overrideCount = v.id === 'overrides'
                ? Object.keys(partOverrides).length + customParts.length
                : 0
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
                  {v.label}{overrideCount > 0 ? ` (${overrideCount})` : ''}
                </button>
              )
            })}
            {(isOrthoView || activeView === 'face' || activeView === '3d') && rp && (
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
              activeView === 'parts'     ? 'bg-gray-900'
              : activeView === '3d'      ? 'bg-gray-950'
              : activeView === 'face'    ? 'bg-gray-950'
              : activeView === 'joints'  ? 'bg-gray-900'
              : activeView === 'overrides' ? 'bg-gray-900'
              : 'flex items-center justify-center bg-gray-950 p-6'
            }`}
            onClick={isOrthoView ? () => { setSelectedSVGPart(null); setPicker(null) } : undefined}
          >
            {activeView === 'top' && (
              rp ? <ResolvedTop cab={cabinet} rp={rp} wireMode={wireMode} showInternals={showInternals}
                selectedPartId={selectedSVGPart?.id ?? null} onPartsAtPoint={handlePartsAtPoint}
                customParts={customParts} partOverrides={partOverrides} />
              : <TopView cab={cabinet} />
            )}
            {activeView === 'elevation' && (
              rp ? <ResolvedElevation cab={cabinet} rp={rp} wireMode={wireMode} showInternals={showInternals}
                selectedPartId={selectedSVGPart?.id ?? null} onPartsAtPoint={handlePartsAtPoint}
                customParts={customParts} partOverrides={partOverrides} />
              : <ElevationView cab={cabinet} />
            )}
            {activeView === 'side' && (
              rp ? <ResolvedSide cab={cabinet} rp={rp} wireMode={wireMode} showInternals={showInternals}
                selectedPartId={selectedSVGPart?.id ?? null} onPartsAtPoint={handlePartsAtPoint}
                customParts={customParts} partOverrides={partOverrides} />
              : <SideView cab={cabinet} />
            )}
            {activeView === 'face' && <FaceGridEditor cabinet={cabinet} rp={rp} showInternals={showInternals} onUpdate={onUpdate} />}
            {activeView === '3d'     && rp && <Cabinet3DView cab={cabinet} rp={rp} materialColours={materialColours} ebByMatId={ebByMatId} customParts={customParts} partOverrides={partOverrides} wire={wireMode} />}
            {activeView === 'parts'  && rp && <PartsView rp={rp} cabinetId={cabinet.id} customParts={customParts} setCustomParts={setCustomParts} partOverrides={partOverrides} onDeletePosOverride={async id => { const u = await dbDeletePartPosOverride(cabinet.id, id, partOverrides); setPartOverrides(u) }} />}
            {activeView === 'joints' && <JointsPanel cabinet={cabinet} rp={rp} onUpdate={onUpdate} />}
            {activeView === 'overrides' && (
              <OverridesView
                cabinetId={cabinet.id}
                partOverrides={partOverrides}
                onOverridesChange={setPartOverrides}
                customParts={customParts}
                setCustomParts={setCustomParts}
              />
            )}
            {selectedSVGPart && isOrthoView && (
              <PartPropertiesPanel
                part={selectedSVGPart}
                onClose={() => setSelectedSVGPart(null)}
                onEdgeChange={handleSVGEdgeChange}
              />
            )}
            {selectedSVGPart && isOrthoView && (
              <PartPosOverridePanel
                part={selectedSVGPart}
                cabinetId={cabinet.id}
                customParts={customParts}
                partOverrides={partOverrides}
                onOverridesChange={setPartOverrides}
                setCustomParts={setCustomParts}
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
