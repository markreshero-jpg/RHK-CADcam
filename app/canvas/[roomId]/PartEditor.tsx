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

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import * as THREE from 'three'
import { Part, PreviewCanvas, extForAxes, type PartMeta, type EbSpec } from '@/src/components/three/PartViewer'
import { fmtMm } from '@/src/lib/format'
import { sampleShapeOutline, type ShapePt } from '@/src/lib/shapePath'
import { type EditorView, displayExtents, roundStore } from './partEditor/partEditorCore'
import { usePartOps } from './partEditor/usePartOps'
import { OpMarkers3D, buildOpSubtractions } from './partEditor/partOpGlyphs'
import PartOrthoView from './partEditor/PartOrthoView'
import PartOpsList from './partEditor/PartOpsList'
import PartPropertiesPanel from './partEditor/PartPropertiesPanel'
import ShapeEditorPane from './partEditor/ShapeEditorPane'
import type { ShapeEditorHandle } from '@/src/components/ShapeEditor/ShapeEditor'
import type { RefOutline } from './partEditor/referenceOutlines'
import PartOverridesPanel from './partEditor/PartOverridesPanel'
import { dbLoadShapeOverrides, dbSaveShapeOverride, dbSavePartPosOverride, dbUpdateCustomPart, dbRestoreShapeRevision, dbDeleteShapeOverride } from './canvasDB'
import type { ShapeMeta, ShapeSegment, ShapeOverride, ShapeOverrides, ShapeRevisionEntry, PartPosOverrides, CabinetCustomPart } from './canvasDB'
import type { FormulaScope } from '@/src/lib/formula'
import { applyShapeSizeSync, clearShapeWrittenSlots, type ShapeSyncCtx } from './OverridesView'
import { customFieldForExtent } from '@/src/lib/customPartBox'
import { confirmDelete } from '@/src/components/ConfirmDeleteModal'

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

export default function PartEditor({
  cabinetId, part, ebSpec, onClose,
  partOverrides, onOverridesChange, customParts, setCustomParts, onPartMetaChange, partBase,
  shapeOverrides, onShapeOverridesChange, initialShapeOpen, referenceOutlines,
  formulaScope,
}: {
  cabinetId: string
  part:      PartMeta
  ebSpec?:   EbSpec
  onClose:   () => void
  // Shape-save plumbing (M3) — all owned by CabinetEditModal. Optional so a bare
  // mount still works; without them a shape save persists revisions but skips
  // the bbox→size write for resolved parts.
  partOverrides?:     PartPosOverrides
  onOverridesChange?: (o: PartPosOverrides) => void
  customParts?:       CabinetCustomPart[]
  setCustomParts?:    Dispatch<SetStateAction<CabinetCustomPart[]>>
  // Fires with the size-patched meta after a shape save so the host keeps this
  // editor's dims (and any part it re-renders) in step with what was written.
  onPartMetaChange?:  (m: PartMeta) => void
  // Base resolved dims (buildBaseDims: raw CV axes — dy=length, dx=width,
  // dz=thickness) — recorded into shape meta at save so the Overrides tab can
  // flag staleness.
  partBase?:          { dy: number; dx: number; dz: number }
  // Lifted shape state (CabinetEditModal): when provided, this editor reads the
  // part's shape from the map and pushes saves back up — no self-load, and the
  // cabinet 3D view / Overrides tab see the new shape immediately.
  shapeOverrides?:        ShapeOverrides
  onShapeOverridesChange?: (o: ShapeOverrides) => void
  // Open with the shape editor already active (3D right-click "⬠ Edit Shape",
  // Overrides tab row Edit).
  initialShapeOpen?:      boolean
  // Ghost outlines of neighbouring parts for the shape editor (M7c) —
  // computed by the modal from the resolved cabinet.
  referenceOutlines?:     RefOutline[]
  // Evaluation scope for size formulas in the Overrides sidebar (built by
  // CabinetEditModal from the resolved cabinet + cached input).
  formulaScope?:          FormulaScope | null
}) {
  const [view, setView] = useState<EditorView>('front')
  // Right sidebar tab: op properties (contextual) or this part's overrides —
  // the overrides live on the sidebar so revision restores preview LIVE in the
  // centre 3D/ortho views.
  const [rightTab, setRightTab] = useState<'op' | 'overrides'>('op')
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
  // Shape editing mode (M7: in-pane — the centre pane becomes the 2D profile
  // editor; Save/Cancel live in this header via the imperative handle). While
  // active, this editor's own keyboard handling goes inert — ShapeEditor has
  // its own Escape/undo/tool keys.
  // Slides are hardware, not panels — never shapeable.
  const shapeable = !part.id.startsWith('slide_')
  const [shapeOpen, setShapeOpen] = useState(!!initialShapeOpen && shapeable)
  const shapeEditorRef = useRef<ShapeEditorHandle | null>(null)
  // Latest saved shape override for this part (null = plain rectangle).
  // Controlled when the host passes shapeOverrides (the modal's lifted map);
  // otherwise self-loads — one indexed query for the whole cabinet.
  const shapesControlled = shapeOverrides !== undefined
  const [ownShapeOv, setOwnShapeOv] = useState<ShapeOverride | null>(null)
  const [ownShapeLoaded, setOwnShapeLoaded] = useState(false)
  useEffect(() => {
    if (shapesControlled) return
    let live = true
    dbLoadShapeOverrides(cabinetId)
      .then(m => { if (live) { setOwnShapeOv(m[part.id] ?? null); setOwnShapeLoaded(true) } })
      .catch(e => { console.error('[shape load]', e); if (live) setOwnShapeLoaded(true) })
    return () => { live = false }
  }, [cabinetId, part.id, shapesControlled])
  const shapeOv = shapesControlled ? (shapeOverrides?.[part.id] ?? null) : ownShapeOv
  const shapeLoaded = shapesControlled || ownShapeLoaded
  // Live revision preview (Overrides sidebar history): display-only — the
  // centre views show the previewed revision while the saved head stays put.
  const [shapePreview, setShapePreview] = useState<ShapeRevisionEntry | null>(null)
  useEffect(() => { setShapePreview(null) }, [part.id])
  // A shaped cabinet's clipped part shows its resolver outline until it gets a
  // drawn shape of its own (z_cabinet_shape 3c).
  const resolvedSegs = useMemo<ShapeSegment[] | null>(() => {
    const o = part.outline
    if (!o || o.length < 3) return null
    return o.map((p, i) => ({ type: 'line' as const, p0: { x: p.x, y: p.y }, p1: { x: o[(i + 1) % o.length].x, y: o[(i + 1) % o.length].y } }))
  }, [part.outline])
  const displaySegs = shapePreview?.segments ?? shapeOv?.segments ?? resolvedSegs
  // Sampled outline polygon (shape frame, mm) — drives the 3D face overlay and
  // the ops-outside-outline validation inside usePartOps.
  const shapePoly = useMemo(
    () => (displaySegs && displaySegs.length > 2 ? sampleShapeOutline(displaySegs) : null),
    [displaySegs],
  )
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
  } = usePartOps(cabinetId, part, shapePoly)

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
      if (shapeOpen) return   // ShapeEditor owns Escape (cancels its active tool)
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
  }, [onClose, measuring, shapeOpen])

  // Arrow ↑/↓ move the list selection (ignored while typing). Delete is intentionally
  // NOT bound — the 3D view behind captures it (would hide the whole part); use the
  // panel's Delete button + undo instead.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (shapeOpen) return
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
  }, [ops, selectedId, setSelectedId, shapeOpen])

  // Ctrl/Cmd+Z → session undo (ignored while typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      if (shapeOpen) return   // ShapeEditor has its own Ctrl+Z history
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      e.preventDefault(); e.stopImmediatePropagation()
      void undo()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [undo, shapeOpen])

  // Selecting an operation (list or glyph) pulls the sidebar back to its
  // properties — the natural expectation mid-edit; the Overrides tab is a
  // deliberate detour.
  useEffect(() => { if (selectedId) setRightTab('op') }, [selectedId])

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

  // Shape save (M3): persist the revision, then make the part's size the shape's
  // bounding box (locked decision #6). The shape frame is y-DOWN from the visual
  // top-left, but the part's op/CNC datum is the BOTTOM-left corner — so sizing
  // must preserve op-frame coordinates (opY = height − shapeY), not shape-frame
  // ones: new height = sh − minY with segments shifted up by minY, new width =
  // maxX (x axes agree, datum at the left edge, nothing moves). A shape drawn
  // inboard of an edge therefore keeps every op and drill exactly where it was.
  async function handleShapeSave(segments: ShapeSegment[], meta: ShapeMeta) {
    // Datum re-reference compensation (README originShift) is a Phase-1 cut:
    // ShapeEditor's bounds check blocks negative-coordinate saves, so geometry
    // always arrives datum-anchored. The shift is kept in the stored meta for a
    // later phase; no ox/oy is written.
    if (meta.originShift && (meta.originShift.dx !== 0 || meta.originShift.dy !== 0)) {
      console.warn('[shape save] originShift recorded but not compensated (Phase 1):', meta.originShift)
    }

    // Re-anchor to the op datum before storing, so stored segments always fill
    // [0..W]×[0..H] of the (possibly resized) part and reopen cleanly.
    const bnd = meta.bounds
    let segsOut = segments
    let metaOut = { ...meta }
    const shiftY = bnd ? roundStore(bnd.minY) : 0
    if (bnd && shiftY !== 0) {
      const mv = (p?: { x: number; y: number }) => (p ? { x: p.x, y: roundStore(p.y - shiftY) } : p)
      segsOut = segments.map(s => ({ ...s, p0: mv(s.p0)!, p1: mv(s.p1)!, cp1: mv(s.cp1), cp2: mv(s.cp2) }))
      metaOut.bounds = { minX: bnd.minX, maxX: bnd.maxX, minY: 0, maxY: roundStore(bnd.maxY - shiftY) }
    }

    // Plan the bbox→size write up front so the stored meta carries the replay
    // info the Overrides tab needs (sizeSlots for restore/remove, baseAtSave
    // for the stale flag).
    const isCustom = part.id.startsWith('custom_')
    const cpId = isCustom ? part.id.slice('custom_'.length) : null
    const cp = cpId ? customParts?.find(p => p.id === cpId) : undefined
    const { swExt, shExt } = displayExtents(part)
    const changes: Partial<Record<'w' | 'h' | 'd', number>> = {}
    const newSW = bnd ? roundStore(bnd.maxX) : sw
    const newSH = bnd ? roundStore(sh - bnd.minY) : sh
    if (bnd) {
      if (Math.abs(newSW - sw) > 0.05) changes[swExt] = newSW
      if (Math.abs(newSH - sh) > 0.05) changes[shExt] = newSH
    }
    if (isCustom && cp) {
      const across = customFieldForExtent(cp.orientation ?? 'flat', swExt)
      const up     = customFieldForExtent(cp.orientation ?? 'flat', shExt)
      metaOut.sizeSlots = { across, up, custom: true }
      // Custom dims are authoritative and just became the bbox — record the
      // post-save pair so only a LATER manual resize reads as stale.
      metaOut.baseAtSave = {
        w: across === 'dy' ? newSW : up === 'dy' ? newSH : cp.dy,
        h: across === 'dx' ? newSW : up === 'dx' ? newSH : cp.dx,
      }
    } else if (!isCustom) {
      metaOut.sizeSlots = { across: `s${swExt}` as 'sw' | 'sh' | 'sd', up: `s${shExt}` as 'sw' | 'sh' | 'sd' }
      // Stored meta keeps its w/h keys (an unordered in-plane pair) — fed from
      // the raw base dims (dy=length, dx=width).
      if (partBase) metaOut.baseAtSave = { w: partBase.dy, h: partBase.dx }
    }

    const saved = await dbSaveShapeOverride(cabinetId, part.id, segsOut, metaOut)
    if (!saved) {
      // Keep the overlay open — closing would discard the drawn shape.
      alert('Shape save failed — see console. The editor stays open so the drawing is not lost.')
      return
    }
    const savedWithCount = { ...saved, revisions: (shapeOv?.revisions ?? 0) + 1 }
    if (shapesControlled) onShapeOverridesChange?.({ ...shapeOverrides, [part.id]: savedWithCount })
    else setOwnShapeOv(savedWithCount)

    if (changes.w != null || changes.h != null || changes.d != null) {
      if (isCustom) {
        // Custom parts: dims are authoritative on the row (mirrors the 3D
        // inspector's handleSizeChange — a manual size clears that field's formula).
        if (cp && cpId) {
          const expressions = { ...(cp.expressions ?? {}) }
          const patch: Partial<CabinetCustomPart> = { expressions }
          for (const [ext, val] of Object.entries(changes) as ['w' | 'h' | 'd', number][]) {
            const field = customFieldForExtent(cp.orientation ?? 'flat', ext)
            patch[field] = val
            delete expressions[field]
          }
          setCustomParts?.(prev => prev.map(p => (p.id === cpId ? { ...p, ...patch } : p)))
          dbUpdateCustomPart(cpId, patch).catch(console.error)
        }
      } else {
        const cur = partOverrides?.[part.id] ?? { ox: 0, oy: 0, oz: 0 }
        const ov = { ...cur }
        if (changes.w != null) ov.sw = changes.w
        if (changes.h != null) ov.sh = changes.h
        if (changes.d != null) ov.sd = changes.d
        const updated = await dbSavePartPosOverride(cabinetId, part.id, ov, partOverrides ?? {})
        onOverridesChange?.(updated)
      }
      onPartMetaChange?.({ ...part, w: changes.w ?? part.w, h: changes.h ?? part.h, d: changes.d ?? part.d })
    }
    setShapePreview(null)
    setShapeOpen(false)
  }

  // Restore/remove from the per-part Overrides view — same shared helpers as
  // the cabinet Overrides tab, plus a meta patch so this open editor's frame
  // follows the size the action wrote.
  const shapeSyncCtx: ShapeSyncCtx = { partOverrides, onOverridesChange, customParts, setCustomParts }

  function setShapeForPart(next: ShapeOverride | null) {
    if (shapesControlled) {
      const map = { ...shapeOverrides }
      if (next) map[part.id] = next
      else delete map[part.id]
      onShapeOverridesChange?.(map)
    } else {
      setOwnShapeOv(next)
    }
  }

  async function handleShapeRestore(revision: number) {
    const restored = await dbRestoreShapeRevision(cabinetId, part.id, revision)
    if (!restored) return
    setShapePreview(null)
    setShapeForPart({ ...restored, revisions: (shapeOv?.revisions ?? 1) + 1 })
    applyShapeSizeSync(cabinetId, part.id, restored, shapeSyncCtx)
    const b = restored.meta?.bounds
    if (b && restored.meta?.sizeSlots) {
      const { swExt, shExt } = displayExtents(part)
      const next = { ...part }
      next[swExt] = b.maxX
      next[shExt] = b.maxY
      onPartMetaChange?.(next)
    }
  }

  async function handleShapeRemove() {
    if (!shapeOv) return
    const n = shapeOv.revisions ?? 1
    if (!(await confirmDelete({ title: 'Remove Shape', confirmLabel: 'Remove', message: `Remove the drawn shape for ${part.label}? All ${n} revision${n !== 1 ? 's' : ''} are deleted and the part reverts to a plain rectangle.` }))) return
    await dbDeleteShapeOverride(cabinetId, part.id)
    clearShapeWrittenSlots(cabinetId, part.id, shapeOv, shapeSyncCtx)
    setShapePreview(null)
    setShapeForPart(null)
    // Revert the two in-plane display extents to base (thickness — and any
    // manual thickness override — untouched; custom dims stay authoritative).
    if (!part.id.startsWith('custom_') && partBase) {
      const ext = extForAxes(part.panelKind, part.dxIsWidth)
      const next = { ...part }
      next[ext.DY] = partBase.dy
      next[ext.DX] = partBase.dx
      onPartMetaChange?.(next)
    }
  }

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
          <span className="text-[11px] text-gray-500 font-mono whitespace-nowrap" title="CV convention: DY = length (grain) · DX = width · DZ = thickness">
            {(() => { const e = extForAxes(part.panelKind, part.dxIsWidth); return `DY ${fmtMm(part[e.DY])} × DX ${fmtMm(part[e.DX])} × DZ ${fmtMm(part[e.DZ])} mm` })()}
          </span>
          {(errorCount > 0 || warnCount > 0) && (
            <span className="flex items-center gap-1.5 text-[10px]">
              {errorCount > 0 && <span title="Operations with errors" className="px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 font-medium">{errorCount} error{errorCount > 1 ? 's' : ''}</span>}
              {warnCount > 0 && <span title="Operations with warnings" className="px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 font-medium">{warnCount} warning{warnCount > 1 ? 's' : ''}</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {shapeOpen ? (
            <>
              <span className="text-[11px] text-sky-300 font-medium mr-1">⬠ Shaping</span>
              <button onClick={() => shapeEditorRef.current?.requestSave()}
                title="Save the drawn shape (must be a closed loop — you'll be offered Heal & Close if it isn't)"
                className="text-[11px] px-2.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-500 font-medium">
                Save Shape
              </button>
              <button onClick={() => setShapeOpen(false)}
                title="Leave shape editing without saving"
                className="text-[11px] px-2 py-0.5 rounded border border-gray-700 text-gray-300 hover:bg-gray-700">
                Cancel
              </button>
            </>
          ) : (
            <>
              {shapeable && (
                <button onClick={() => { setShapePreview(null); setShapeOpen(true) }} disabled={!shapeLoaded}
                  title={shapeLoaded ? "Edit the part's outline shape (2D profile editor)" : 'Loading saved shape…'}
                  className={`text-[11px] px-2 py-0.5 rounded border border-gray-700 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed ${
                    shapeOv ? 'text-emerald-300' : 'text-gray-300'
                  }`}>
                  ⬠ Edit Shape{shapeOv ? ` (r${shapeOv.revision})` : ''}
                </button>
              )}
              <button onClick={() => void undo()} disabled={undoDepth === 0}
                title="Undo (Ctrl+Z)"
                className="text-[11px] px-2 py-0.5 rounded border border-gray-700 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">
                ↺ Undo{undoDepth > 0 ? ` (${undoDepth})` : ''}
              </button>
            </>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none px-1" aria-label="Close">✕</button>
        </div>
      </div>

      {/* Body — three zones */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left — operations list (hidden while shaping: the drawing canvas
            gets the full window width, M8) */}
        {!shapeOpen && <>
          <PartOpsList
            width={leftW}
            ops={ops} loading={loading} selectedId={selectedId} onSelect={setSelectedId}
            levels={levels} issuesById={issuesById} allGenerated={allGenerated}
            onAdd={kind => void addOp(kind, hasTwoFaces && face === 'back' ? 'face_back' : 'face_front')} onReorder={reorder}
          />
          <ResizeHandle onDelta={dx => setLeftW(w => clampPanel(w + dx))} />
        </>}

        {/* Centre — single-part scene: 3D (R3F) + ortho Top/Front/Side (SVG, true
            mm) — or, in shaping mode, the in-pane 2D profile editor. */}
        <div className="flex-1 relative bg-gray-950 min-w-0">
          {shapeOpen && shapeLoaded && (
            <ShapeEditorPane
              ref={shapeEditorRef}
              key={shapeOv?.revision ?? 0}
              partLabel={part.label}
              partWidth={sw}
              partHeight={sh}
              edge={displayEdge}
              initialSegments={shapeOv?.segments ?? resolvedSegs}
              referenceOutlines={referenceOutlines}
              onSave={(segments: ShapeSegment[], meta: ShapeMeta) => void handleShapeSave(segments, meta)}
              onCancel={() => setShapeOpen(false)}
            />
          )}
          {!shapeOpen && <>
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
                {shapePoly && <ShapeOutline3D pts={shapePoly} sh={sh} n={n} />}
              </group>
            </PreviewCanvas>
          ) : (
            <div className="w-full h-full flex items-center justify-center p-6">
              <PartOrthoView u={u} v={v} n={n} swap={swap} mirror={mirror} face={hasTwoFaces ? face : undefined} view={view} measuring={measuring} wire={wire}
                edge={part.edge} ebSpec={ebSpec} shape={displaySegs}
                ops={ops} selectedId={selectedId} onSelect={setSelectedId} levels={levels}
                planePick={planePick && !selLocked}
                onPickPlane={patch => { void patchOp(patch); setPlanePick(false) }}
                snapOn={snapOn} onDragMove={dragMoveOp} onDragEnd={commitDragOp} />
            </div>
          )}
          </>}
        </div>

        {/* Right — contextual op properties / per-part overrides. Overrides sit
            here (not a centre view) so shape revision restores preview LIVE in
            the centre 3D/ortho views as they're clicked. Hidden while shaping
            (M8) — the canvas takes the full width. */}
        {!shapeOpen && <>
        <ResizeHandle onDelta={dx => setRightW(w => clampPanel(w - dx))} />
        <div className="flex-none h-full flex flex-col" style={{ width: rightW }}>
          <div className="flex-none flex bg-gray-900 border-l border-gray-800 border-b border-gray-700">
            {(['op', 'overrides'] as const).map(t => (
              <button key={t}
                onClick={() => setRightTab(t)}
                className={`flex-1 px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  rightTab === t ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/60'
                }`}>
                {t === 'op' ? 'Operation' : 'Overrides'}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 flex">
            {rightTab === 'op' ? (
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
            ) : (
              <PartOverridesPanel
                width={rightW}
                cabinetId={cabinetId}
                part={part}
                partBase={partBase}
                partOverrides={partOverrides}
                onOverridesChange={onOverridesChange}
                formulaScope={formulaScope}
                customParts={customParts}
                setCustomParts={setCustomParts}
                shapeOv={shapeOv}
                onEditShape={() => { setShapePreview(null); setShapeOpen(true) }}
                onRestoreRevision={r => void handleShapeRestore(r)}
                onRemoveShape={() => void handleShapeRemove()}
                previewRevision={shapePreview?.revision ?? null}
                onPreviewRevision={setShapePreview}
              />
            )}
          </div>
        </div>
        </>}
      </div>

    </div>
  )
}

// Saved shape outline drawn on both faces of the 3D box (shape frame is y-down
// from the part's visual top; three.js y is up → y3d = sh − shapeY). A hairline
// loop floats 0.4mm off each face so it never z-fights the panel material.
function ShapeOutline3D({ pts, sh, n }: { pts: ShapePt[]; sh: number; n: number }) {
  const geoms = useMemo(() => [n + 0.4, -0.4].map(z => {
    const g = new THREE.BufferGeometry()
    g.setFromPoints(pts.map(p => new THREE.Vector3(p.x, sh - p.y, z)))
    return g
  }), [pts, sh, n])
  useEffect(() => () => { geoms.forEach(g => g.dispose()) }, [geoms])
  return (
    <>
      {geoms.map((g, i) => (
        <lineLoop key={i} geometry={g}>
          <lineBasicMaterial color="#38bdf8" />
        </lineLoop>
      ))}
    </>
  )
}
