'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import type { CabinetInstance, Wall } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { PartMeta, PartEdge, PartPropertiesPanel } from '@/src/components/three/PartViewer'
import {
  dbResolveAndPersistCabinet, dbLoadCustomParts, dbUpdateCustomPart, dbDeleteCustomPart,
  dbLoadPartPosOverrides, dbSavePartPosOverride, dbDeletePartPosOverride,
  dbLoadPartLabels, dbSavePartLabel,
  dbLoadPartComments, dbSavePartComment,
  dbLoadHiddenParts, dbSaveHiddenParts,
  type CabinetCustomPart, type PartPosOverrides, type PartLabels, type PartComments,
} from './canvasDB'
import { filterHiddenParts } from '@/src/lib/resolver/filterHidden'
import CabinetPanel from './CabinetPanel'
import Cabinet3DView from './Cabinet3DView'
import FaceGridEditor from './FaceGridEditor'
import InternalGridEditor from './InternalGridEditor'
import { saveSVGEdge } from './cabinetEditSvgHelpers'
import { ResolvedElevation, ResolvedTop, ResolvedSide, TopView, ElevationView, SideView, PartPickerMenu, PartContextMenu, type PartContextAction } from './ResolvedViews'
import PartsView from './PartsView'
import JointsPanel from './JointsPanel'
import PartEdgeJoints from './PartEdgeJoints'
import OverridesView from './OverridesView'
import CabinetTreePanel from './CabinetTreePanel'
import CabinetRoutesPanel from './CabinetRoutesPanel'
import { getUserPrefs } from '@/src/lib/userPrefs'

type ViewId = 'top' | 'elevation' | 'side' | 'parts' | '3d' | 'face' | 'interior' | 'joints' | 'overrides' | 'tree' | 'routes'

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'top',       label: 'Top' },
  { id: 'elevation', label: 'Elevation' },
  { id: 'side',      label: 'Side' },
  { id: 'face',      label: 'Face Grid' },
  { id: 'interior',  label: 'Interior' },
  { id: '3d',        label: '3D' },
  { id: 'parts',     label: 'Parts' },
  { id: 'joints',    label: 'Joints' },
  { id: 'overrides', label: 'Overrides' },
  { id: 'tree',      label: 'Tree' },
  { id: 'routes',    label: 'Routes' },
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
  cabinet, wall, wallCabinets, resolvedCabinet, initialView, onUpdate, onDelete, onClose, materialColours, ebByMatId, onHiddenChange,
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
  // Lets the parent canvas reflect hide/show toggles live (updates the shared
  // resolved map's hidden_parts so the on-canvas elevation / 3D update at once).
  onHiddenChange?: (cabinetId: string, hidden: string[]) => void
}) {
  const [activeView, setActiveView]       = useState<ViewId>(initialView ?? 'elevation')
  // Wire/solid is tracked per-view (Top/Elevation/Side/3D each individual), seeded
  // from the user's default view styles. Other views fall back to wire (no effect).
  const [wireByView, setWireByView]       = useState<Record<ViewId, boolean>>(() => {
    const s = getUserPrefs().cabinetViewStyles
    return {
      top:       s.top       === 'wire',
      elevation: s.elevation === 'wire',
      side:      s.side      === 'wire',
      '3d':      s['3d']      === 'wire',
      parts: true, face: true, interior: true, joints: true, overrides: true, tree: true, routes: true,
    }
  })
  const wireMode = wireByView[activeView]
  const setWireMode = () => setWireByView(m => ({ ...m, [activeView]: !m[activeView] }))
  const [showInternals, setShowInternals] = useState(true)
  const [showDrilling, setShowDrilling]   = useState(true)
  const [measureMode, setMeasureMode]     = useState(false)
  const measureModeRef = useRef(measureMode); measureModeRef.current = measureMode
  const [selectedSVGPart, setSelectedSVGPart] = useState<PartMeta | null>(null)
  const [picker, setPicker] = useState<{ parts: PartMeta[]; clientX: number; clientY: number } | null>(null)
  const [localRp, setLocalRp]             = useState<ResolvedCabinet | null>(null)
  const [resolving, setResolving]         = useState(false)
  const [customParts, setCustomParts]     = useState<CabinetCustomPart[]>([])
  const [partOverrides, setPartOverrides] = useState<PartPosOverrides>({})
  const [partLabels, setPartLabels]       = useState<PartLabels>({})
  const [partComments, setPartComments]   = useState<PartComments>({})
  const [hiddenParts, setHiddenParts]     = useState<string[]>([])
  const [contextMenu, setContextMenu]     = useState<{ part: PartMeta; cx: number; cy: number } | null>(null)

  const prevPartRef     = useRef<PartMeta | null>(null)
  const originalEdgeRef = useRef<PartEdge | null>(null)

  const isOrthoView = activeView !== '3d' && activeView !== 'parts' && activeView !== 'face' && activeView !== 'interior' && activeView !== 'joints' && activeView !== 'overrides' && activeView !== 'routes'

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
    dbLoadPartLabels(cabinet.id).then(setPartLabels)
    dbLoadPartComments(cabinet.id).then(setPartComments)
    dbLoadHiddenParts(cabinet.id).then(setHiddenParts)
  }, [cabinet.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleHidden(partId: string) {
    setHiddenParts(prev => {
      const next = prev.includes(partId) ? prev.filter(id => id !== partId) : [...prev, partId]
      dbSaveHiddenParts(cabinet.id, next).catch(console.error)
      onHiddenChange?.(cabinet.id, next)
      return next
    })
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // Let inputs (e.g. inline rename) handle their own Esc-to-cancel.
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      // The modal owns Escape while open: stop the canvas's global Escape handler
      // behind it from also firing. Esc first exits the measure tool; only when
      // not measuring does it close the modal. Read measureMode from a ref so the
      // capture-phase listener always sees the live value.
      e.stopImmediatePropagation()
      e.preventDefault()
      if (measureModeRef.current) { setMeasureMode(false); return }
      onClose()
    }
    // Capture phase → fires before the canvas's bubble-phase window listener.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
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

  function handlePartContextMenu(parts: PartMeta[], cx: number, cy: number) {
    if (!selectedSVGPart) return
    const hit = parts.find(p => p.id === selectedSVGPart.id)
    if (hit) setContextMenu({ part: hit, cx, cy })
  }

  function handleContextAction(action: PartContextAction, value?: string) {
    if (!contextMenu) return
    const { part } = contextMenu
    const isCustom = part.id.startsWith('custom_')
    const customPartId = isCustom ? part.id.slice(7) : null

    if (action === 'rename' && value) {
      if (isCustom && customPartId) {
        setCustomParts(prev => prev.map(p => p.id === customPartId ? { ...p, name: value } : p))
        dbUpdateCustomPart(customPartId, { name: value }).catch(console.error)
      } else {
        const updated = { ...partLabels, [part.id]: value }
        setPartLabels(updated)
        dbSavePartLabel(cabinet.id, part.id, value, partLabels).catch(console.error)
      }
    }

    if (action === 'comment') {
      const updated = value?.trim()
        ? { ...partComments, [part.id]: value.trim() }
        : (() => { const { [part.id]: _r, ...rest } = partComments; return rest })()
      setPartComments(updated)
      dbSavePartComment(cabinet.id, part.id, value ?? '', partComments).catch(console.error)
    }

    if (action === 'delete' && isCustom && customPartId) {
      setCustomParts(prev => prev.filter(p => p.id !== customPartId))
      dbDeleteCustomPart(customPartId).catch(console.error)
    }

    setContextMenu(null)
  }

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

  // Geometry viewers (Top/Elevation/Side/3D/Face/Interior) render the cabinet with
  // user-hidden parts removed; the Parts tab + inspector panels keep the full list.
  const visibleRp = useMemo(() => (rp ? filterHiddenParts(rp, hiddenParts) : rp), [rp, hiddenParts])

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
              const disabled = (v.id === 'parts' || v.id === '3d' || v.id === 'tree' || v.id === 'routes') && !rp
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
            {(isOrthoView || activeView === 'face' || activeView === 'interior' || activeView === '3d') && rp && (
              <div className="ml-auto flex items-center gap-1.5">
                {isOrthoView && (
                  <button
                    onClick={() => setMeasureMode(m => !m)}
                    title="Measure between part / hardware corners"
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      measureMode
                        ? 'bg-amber-600 text-white hover:bg-amber-500'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                    }`}
                  >
                    Measure
                  </button>
                )}
                <button
                  onClick={() => setWireMode()}
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
                {(isOrthoView || activeView === '3d') && (
                  <button
                    onClick={() => setShowDrilling(d => !d)}
                    title="Toggle carcase joint drilling"
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      showDrilling
                        ? 'bg-amber-800/80 text-amber-300 hover:bg-amber-700/80'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                    }`}
                  >
                    Drilling
                  </button>
                )}
              </div>
            )}
          </div>
          {/* Content */}
          <div
            className={`flex-1 overflow-hidden relative ${
              activeView === 'parts'     ? 'bg-gray-900'
              : activeView === '3d'      ? 'bg-gray-950'
              : activeView === 'face'    ? 'bg-gray-950'
              : activeView === 'interior'? 'bg-gray-950'
              : activeView === 'joints'  ? 'bg-gray-900'
              : activeView === 'overrides' ? 'bg-gray-900'
              : activeView === 'routes'  ? 'bg-gray-900'
              : 'flex items-center justify-center bg-gray-950 p-6'
            }`}
            onClick={isOrthoView ? () => { setSelectedSVGPart(null); setPicker(null) } : undefined}
          >
            {activeView === 'top' && (
              visibleRp ? <ResolvedTop cab={cabinet} rp={visibleRp} wireMode={wireMode} showInternals={showInternals} showDrilling={showDrilling} measureMode={measureMode}
                selectedPartId={selectedSVGPart?.id ?? null} onPartsAtPoint={handlePartsAtPoint}
                onPartContextMenu={handlePartContextMenu}
                customParts={customParts} partOverrides={partOverrides}
                partLabels={partLabels} partComments={partComments} />
              : <TopView cab={cabinet} />
            )}
            {activeView === 'elevation' && (
              visibleRp ? <ResolvedElevation cab={cabinet} rp={visibleRp} wireMode={wireMode} showInternals={showInternals} showDrilling={showDrilling} measureMode={measureMode}
                selectedPartId={selectedSVGPart?.id ?? null} onPartsAtPoint={handlePartsAtPoint}
                onPartContextMenu={handlePartContextMenu}
                customParts={customParts} partOverrides={partOverrides}
                partLabels={partLabels} partComments={partComments} />
              : <ElevationView cab={cabinet} />
            )}
            {activeView === 'side' && (
              visibleRp ? <ResolvedSide cab={cabinet} rp={visibleRp} wireMode={wireMode} showInternals={showInternals} showDrilling={showDrilling} measureMode={measureMode}
                selectedPartId={selectedSVGPart?.id ?? null} onPartsAtPoint={handlePartsAtPoint}
                onPartContextMenu={handlePartContextMenu}
                customParts={customParts} partOverrides={partOverrides}
                partLabels={partLabels} partComments={partComments} />
              : <SideView cab={cabinet} />
            )}
            {activeView === 'face'     && <FaceGridEditor     cabinet={cabinet} rp={visibleRp} showInternals={showInternals} onUpdate={onUpdate} />}
            {activeView === 'interior' && <InternalGridEditor cabinet={cabinet} rp={visibleRp} onUpdate={onUpdate} />}
            {activeView === '3d'     && visibleRp && <Cabinet3DView cab={cabinet} rp={visibleRp} materialColours={materialColours} ebByMatId={ebByMatId} customParts={customParts} partOverrides={partOverrides} wire={wireMode} showDrilling={showDrilling} onUpdate={onUpdate} />}
            {activeView === 'parts'  && rp && (
              <PartsView
                rp={rp} cabinetId={cabinet.id}
                hiddenParts={hiddenParts} onToggleHidden={toggleHidden}
                customParts={customParts} setCustomParts={setCustomParts}
                partOverrides={partOverrides}
                onDeletePosOverride={async id => { const u = await dbDeletePartPosOverride(cabinet.id, id, partOverrides); setPartOverrides(u) }}
                partLabels={partLabels} partComments={partComments}
                onLabelChange={(partId, label) => {
                  const updated = { ...partLabels, [partId]: label }
                  setPartLabels(updated)
                  dbSavePartLabel(cabinet.id, partId, label, partLabels).catch(console.error)
                }}
                onCommentChange={(partId, comment) => {
                  const updated = comment.trim()
                    ? { ...partComments, [partId]: comment.trim() }
                    : (() => { const { [partId]: _r, ...rest } = partComments; return rest })()
                  setPartComments(updated)
                  dbSavePartComment(cabinet.id, partId, comment, partComments).catch(console.error)
                }}
              />
            )}
            {activeView === 'joints' && <JointsPanel cabinet={cabinet} rp={rp} onUpdate={onUpdate} />}
            {activeView === 'tree'   && rp && <CabinetTreePanel rp={rp} partOverrides={partOverrides} />}
            {activeView === 'routes' && rp && <CabinetRoutesPanel cabinet={cabinet} rp={rp} />}
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
            {contextMenu && (
              <PartContextMenu
                part={contextMenu.part}
                clientX={contextMenu.cx}
                clientY={contextMenu.cy}
                isCustom={contextMenu.part.id.startsWith('custom_')}
                existingComment={partComments[contextMenu.part.id]}
                onAction={handleContextAction}
                onClose={() => setContextMenu(null)}
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
            hideWallPosition
          />
        </div>
      </div>
    </div>
  )
}
