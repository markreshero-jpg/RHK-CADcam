'use client'

// ============================================================
// Part Editor — single-part CNC operation editor. Opens as a
// modal-level overlay from the 3D view's right-click "Edit Part"
// action, isolating one part. Three-zone CAD/CAM layout:
//   left   = ordered operations list (partEditor/PartOpsList)
//   centre = the part in 3D + ortho views with measure/drag
//            (partEditor/PartOrthoView + partEditor/partOpGlyphs)
//   right  = contextual properties (partEditor/PartPropertiesPanel)
// Data + mutations (load, undo, live firing, joint library) live
// in partEditor/usePartOps; pure logic in partEditor/partEditorCore.
// See z_part_view/RHK-PartEditor-Phase1/2 specs.
//
// Operations load with the SAME query CabinetRoutesPanel runs
// (source_cabinet_id + source_part_key). A 3D PartMeta.id is exactly
// the source_part_key (e.g. case_left_side / zone_0_0 / int_…_N).
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { Part, PreviewCanvas, type PartMeta, type EbSpec } from '@/src/components/three/PartViewer'
import { fmtMm } from '@/src/lib/format'
import { type EditorView } from './partEditor/partEditorCore'
import { usePartOps } from './partEditor/usePartOps'
import { OpMarkers3D, buildOpSubtractions } from './partEditor/partOpGlyphs'
import PartOrthoView from './partEditor/PartOrthoView'
import PartOpsList from './partEditor/PartOpsList'
import PartPropertiesPanel from './partEditor/PartPropertiesPanel'

// Thin vertical divider that reports drag deltas (px) so a parent can resize an
// adjacent panel. Uses pointer capture so the drag survives leaving the 1.5px bar.
function ResizeHandle({ onDelta }: { onDelta: (dx: number) => void }) {
  const last = useRef<number | null>(null)
  return (
    <div
      className="flex-none w-1.5 cursor-col-resize bg-gray-800 hover:bg-blue-600 active:bg-blue-600 transition-colors"
      onPointerDown={e => { last.current = e.clientX; (e.currentTarget as Element).setPointerCapture(e.pointerId) }}
      onPointerMove={e => { if (last.current == null) return; const dx = e.clientX - last.current; last.current = e.clientX; onDelta(dx) }}
      onPointerUp={e => { last.current = null; try { (e.currentTarget as Element).releasePointerCapture(e.pointerId) } catch { /* ignore */ } }}
      onPointerCancel={() => { last.current = null }}
    />
  )
}

export default function PartEditor({ cabinetId, part, ebSpec, onClose }: {
  cabinetId: string
  part:      PartMeta
  ebSpec?:   EbSpec
  onClose:   () => void
}) {
  const [view, setView] = useState<EditorView>('front')
  // Active working face. Only a front panel (door / drawer front — resolves upright,
  // dxIsWidth) has a distinct decorative front vs machined back; everything else has
  // one working face and stays on 'front'. face_back ops (hinges, fixings) show on
  // the back; the other face's ops ghost through.
  const [face, setFace] = useState<'front' | 'back'>('front')
  const hasTwoFaces = !!part.dxIsWidth
  const [measuring, setMeasuring] = useState(false)
  // Wire / solid view (mirrors the cabinet edit modal's Wire toggle) — applies to
  // both the 3D scene and the ortho SVG views.
  const [wire, setWire] = useState(false)
  // Plane-pick mode (§7.2): the Front view exposes clickable edges/face.
  const [planePick, setPlanePick] = useState(false)
  // Drag-to-place snap (§8), persisted. Lazy init (no set-state-in-effect).
  const [snapOn, setSnapOn] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try { return localStorage.getItem('partEditor.snap') === '1' } catch { return false }
  })
  function toggleSnap() {
    setSnapOn(s => { const n = !s; try { localStorage.setItem('partEditor.snap', n ? '1' : '0') } catch { /* ignore */ } return n })
  }
  const dragRef = useRef(false)
  // Draggable side-panel widths (px). Clamped so neither panel can crowd out the scene.
  const [leftW, setLeftW]   = useState(288)   // 72 * 4 (was w-72)
  const [rightW, setRightW] = useState(288)
  const clampPanel = (w: number) => Math.max(200, Math.min(560, w))

  const {
    u, v, n,
    ops, loading, selectedId, setSelectedId, selected, sel, selLocked,
    issuesById, levels, errorCount, warnCount, selIssues, allGenerated,
    firing, jointTypes, slavesByMaster,
    undo, undoDepth,
    patchOp, addOp, deleteSelected, convertToManual, reorder,
    dragMoveOp, commitDragOp, pickJoint, resyncJointsFromLibrary,
    toolSets,
  } = usePartOps(cabinetId, part)

  // Turning plane-pick ON forces the Front view (where the pickable edges live).
  function onPlanePickChange(on: boolean) {
    if (on) { setView('front'); setMeasuring(false) }
    setPlanePick(on)
  }

  // Escape closes the editor. Capture phase + stopImmediatePropagation so the
  // cabinet modal's own Escape handler behind it doesn't also fire.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      e.stopImmediatePropagation(); e.preventDefault()
      // Esc exits the measure tool first (mirrors the cabinet modal); only when
      // not measuring does it close the editor.
      if (measuring) { setMeasuring(false); return }
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, measuring])

  // Arrow ↑/↓ move the list selection (ignored while typing). Delete is intentionally
  // NOT bound — the 3D view behind captures it (would hide the whole part); use the
  // panel's Delete button + undo instead.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      if (ops.length === 0) return
      e.preventDefault(); e.stopImmediatePropagation()
      const idx = ops.findIndex(o => o.id === selectedId)
      const nextIdx = e.key === 'ArrowDown'
        ? Math.min(ops.length - 1, idx + 1)
        : Math.max(0, (idx < 0 ? 0 : idx - 1))
      setSelectedId(ops[nextIdx]?.id ?? null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [ops, selectedId, setSelectedId])

  // Ctrl/Cmd+Z → session undo (ignored while typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      e.preventDefault(); e.stopImmediatePropagation()
      void undo()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [undo])

  // Display frame (see PartOrthoView): stand every part upright — width across the
  // screen, height up. Non-'side' panels store their height as part-local DX, so
  // their in-plane axes are swapped for display (both the 3D box and ortho views);
  // the X/Y position fields follow suit so X is always the across-screen number.
  // Front faces (dxIsWidth) already resolve width-along-DX, so they need no swap.
  const swap = part.panelKind !== 'side' && !part.dxIsWidth
  const sw = swap ? v : u   // screen width  (across)
  const sh = swap ? u : v   // screen height (up)
  // Right-hand parts (the right gable, right drawer-box side) are the mirror image
  // of their left twin, but flatten with the same footprint frame — so the editor
  // must flip the u/DX axis to show them interior-face-up. Without this the right
  // gable's drilling + edge banding land on the opposite edge from the cabinet view.
  const mirror = part.panelKind === 'side' && part.id.includes('right_side')
  // Edge banding follows the mirror: left/right (the u/DX extremes) swap sides.
  const displayEdge = mirror ? { ...part.edge, left: part.edge.right, right: part.edge.left } : part.edge

  // Area ops (pockets / routes) become real recesses cut into the panel so their
  // depth reads true in 3D; drills stay as surface discs (OpMarkers3D). When there
  // are none, Part keeps its normal multi-face colouring.
  const subtractions = useMemo(() => buildOpSubtractions(ops, u, v, n, swap, mirror), [ops, u, v, n, swap, mirror])

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/85 flex flex-col"
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex-none bg-gray-900 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="text-sm font-semibold text-white">Part Editor</span>
          <span className="text-xs text-gray-300 truncate">{part.label}</span>
          <span className="text-[11px] text-gray-500 font-mono whitespace-nowrap">{fmtMm(u)} × {fmtMm(v)} × {fmtMm(n)} mm</span>
          {(errorCount > 0 || warnCount > 0) && (
            <span className="flex items-center gap-1.5 text-[10px]">
              {errorCount > 0 && <span title="Operations with errors" className="px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 font-medium">{errorCount} error{errorCount > 1 ? 's' : ''}</span>}
              {warnCount > 0 && <span title="Operations with warnings" className="px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 font-medium">{warnCount} warning{warnCount > 1 ? 's' : ''}</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void undo()} disabled={undoDepth === 0}
            title="Undo (Ctrl+Z)"
            className="text-[11px] px-2 py-0.5 rounded border border-gray-700 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">
            ↺ Undo{undoDepth > 0 ? ` (${undoDepth})` : ''}
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none px-1" aria-label="Close">✕</button>
        </div>
      </div>

      {/* Body — three zones */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left — operations list */}
        <PartOpsList
          width={leftW}
          ops={ops} loading={loading} selectedId={selectedId} onSelect={setSelectedId}
          levels={levels} issuesById={issuesById} allGenerated={allGenerated}
          onAdd={kind => void addOp(kind, hasTwoFaces && face === 'back' ? 'face_back' : 'face_front')} onReorder={reorder}
        />
        <ResizeHandle onDelta={dx => setLeftW(w => clampPanel(w + dx))} />

        {/* Centre — single-part scene: 3D (R3F) + ortho Top/Front/Side (SVG, true mm). */}
        <div className="flex-1 relative bg-gray-950 min-w-0">
          <div className="absolute top-2 left-2 z-10 flex items-center gap-2 select-none">
            <div className="flex rounded-md overflow-hidden border border-gray-700 bg-gray-900/90">
              {(['3d', 'top', 'front', 'side'] as const).map(vm => (
                <button
                  key={vm}
                  onClick={() => { setView(vm); if (vm === '3d') setMeasuring(false) }}
                  className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    view === vm ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {vm === '3d' ? '3D' : vm[0].toUpperCase() + vm.slice(1)}
                </button>
              ))}
            </div>
            {hasTwoFaces && (
              <div
                className="flex rounded-md overflow-hidden border border-gray-700 bg-gray-900/90"
                title="Working face — Front (decorative) or Back (machined: hinges, fixings). Ops on the other face show ghosted."
              >
                {(['front', 'back'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFace(f)}
                    className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      face === f ? 'bg-violet-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {f === 'front' ? 'Front' : 'Back'}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setWire(w => !w)}
              title="Toggle wire / solid view"
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                wire
                  ? 'bg-sky-600 border-sky-500 text-white'
                  : 'bg-gray-900/90 border-gray-700 text-gray-300 hover:bg-gray-700'
              }`}
            >
              Wire
            </button>
            {view !== '3d' && (
              <button
                onClick={() => setMeasuring(m => !m)}
                title="Measure between part corners — click two points"
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                  measuring
                    ? 'bg-amber-600 border-amber-500 text-white'
                    : 'bg-gray-900/90 border-gray-700 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Measure
              </button>
            )}
            {view === 'front' && (
              <button
                onClick={toggleSnap}
                title="Snap dragged operations to a grid, part edges and other op centres (§8)"
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                  snapOn
                    ? 'bg-sky-600 border-sky-500 text-white'
                    : 'bg-gray-900/90 border-gray-700 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Snap
              </button>
            )}
          </div>

          {view === '3d' ? (
            <PreviewCanvas dx={sw} dy={sh} dz={n} bgColor="#0b1220">
              <group position={[-sw / 2, -sh / 2, -n / 2]}>
                <Part
                  b={{ x: 0, y: 0, z: 0, w: sw, h: sh, d: n }}
                  // face kind colours: [edge×4, +Z face, −Z back]. Index 0 doubles as
                  // the single material when recesses are CSG-cut, so keep it the light
                  // face colour → pockets show as the panel material.
                  faceColors={['#c9ccd4', '#5b6373', '#5b6373', '#5b6373', '#c9ccd4', '#9aa0ad']}
                  edgeLineColor="#1e293b"
                  // The editor lays every part flat as a front-facing panel (w=sw,h=sh,
                  // d=n); edgeStrips maps part.edge top/bottom/left/right straight onto
                  // this display frame for a 'face' kind, so the banding lands correctly.
                  meta={{ ...part, panelKind: 'face', edge: displayEdge }}
                  selected={false}
                  highlighted={false}
                  onSelect={() => {}}
                  dragRef={dragRef}
                  wire={wire}
                  subtractions={wire ? undefined : subtractions}
                  hoverHighlight={false}
                  ebSpec={ebSpec}
                />
                <OpMarkers3D ops={ops} pu={u} pv={v} n={n} swap={swap} mirror={mirror} activeFace={hasTwoFaces ? face : undefined} selectedId={selectedId} onSelect={setSelectedId} levels={levels} panelColor="#c9ccd4" />
              </group>
            </PreviewCanvas>
          ) : (
            <div className="w-full h-full flex items-center justify-center p-6">
              <PartOrthoView u={u} v={v} n={n} swap={swap} mirror={mirror} face={hasTwoFaces ? face : undefined} view={view} measuring={measuring} wire={wire}
                edge={part.edge} ebSpec={ebSpec}
                ops={ops} selectedId={selectedId} onSelect={setSelectedId} levels={levels}
                planePick={planePick && !selLocked}
                onPickPlane={patch => { void patchOp(patch); setPlanePick(false) }}
                snapOn={snapOn} onDragMove={dragMoveOp} onDragEnd={commitDragOp} />
            </div>
          )}
        </div>

        {/* Right — contextual properties */}
        <ResizeHandle onDelta={dx => setRightW(w => clampPanel(w - dx))} />
        <PartPropertiesPanel
          width={rightW}
          selected={selected} sel={sel} selLocked={selLocked} selIssues={selIssues}
          swap={swap} firing={firing}
          jointTypes={jointTypes} slavesByMaster={slavesByMaster} toolSets={toolSets}
          planePick={planePick} onPlanePickChange={onPlanePickChange}
          patchOp={changes => void patchOp(changes)}
          pickJoint={jt => void pickJoint(jt)}
          resyncJointsFromLibrary={() => void resyncJointsFromLibrary()}
          deleteSelected={() => void deleteSelected()}
          convertToManual={() => void convertToManual()}
        />
      </div>
    </div>
  )
}
