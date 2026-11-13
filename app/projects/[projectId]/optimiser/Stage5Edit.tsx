'use client'

// ============================================================
// Stage 5 — Manual editing canvas (spec §5.7).
// Interactive raw-SVG sheet: drag parts (snap to nearest valid,
// kerf/pad/margin/grain aware), select, cut/copy/paste, delete,
// move-to-sheet, unplaced pool, sheet navigator + management,
// live efficiency, full undo/redo. No react-konva, no localStorage.
// ============================================================

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useOptiStore, orientsOn, bestFitOn, type PoolOrient } from '@/src/lib/optimiser/store'
import { findNearestValid, findBestPlacement, usableBounds, type ShapeOpts } from '@/src/lib/optimiser/edit'
import { blockOfUid, blockRectOn, grainMatchTags, grainMatchLine, type GrainBlockInfo } from '@/src/lib/optimiser/grainBlocks'
import { buildMargins } from '@/src/lib/optimiser/types'
import { loadResolvedDrillOps, projectSheetDrills, projectSheetRoutes, nestedParts, isTwoSidedSheet, type ResolvedDrillOps } from '@/src/lib/optimiser/sheetDrills'
import { anchorSixthFace } from '@/src/lib/optimiser/sixthFaceLayout'
import { type NestedSheet, type NestPartInput } from '@/src/lib/optimiser/nest'
import { placedOutline, placedHoles } from '@/src/lib/optimiser/shapes'
import { sheetNumbers, sheetPartOrder } from '@/src/lib/optimiser/labels'
import type { ShapePt } from '@/src/lib/shapePath'
import { PlacedOutline, PlacedHoles, GrainBlockOutlines } from './SheetSVG'
import type { SheetDrill, SheetRoute } from '@/src/lib/optimiser/gcode'
import { wheelZoomFactor } from '@/src/lib/wheelZoom'
import { snapPoint, rectLoop, type MeasureSnap, type SnapSources } from '@/src/lib/optimiser/measure'
import { confirmDelete } from '@/src/components/ConfirmDeleteModal'

const MAX_W = 860, MAX_H = 470

// Per-material nesting margin for a sheet (routing tool Ø + nest pad + tool-entry offset).
function gapForSheet(sh: NestedSheet): number {
  const st = useOptiStore.getState()
  const margins = st.snapshot ? buildMargins(st.snapshot, st.profileId) : { byMaterial: {} as Record<string, number>, fallback: 4 }
  return (sh.materialId != null ? margins.byMaterial[sh.materialId] : undefined) ?? margins.fallback
}

// Force place (Shift held while dropping, or the toolbar toggle): the part lands
// exactly where it's dropped — no snap, no gap/trim/collision check. Mark, 2026-11-11.
const FORCED_WARN = 'Force placed — it is inside the cut gap / trim or over another part. Check it before cutting.'

/** Where a dragged part lands. gx/gy follow the cursor; sx/sy = the landing spot
 *  (null = nowhere legal). forced = landing exactly at gx/gy; clean = that spot
 *  is legal anyway. */
export interface DropGhost { gx: number; gy: number; w: number; h: number; rotated?: boolean; sx: number | null; sy: number | null; forced: boolean; clean: boolean
  /** The part's true outline (placement-local), drawn instead of its rectangle. */
  loop?: ShapePt[] | null }

/** A chip in the pool strip: an unplaced part, or the copy clipboard. */
type PoolItem = { kind: 'unplaced' | 'clip'; def: NestPartInput }
type PoolPress = { item: PoolItem; x0: number; y0: number; cx: number; cy: number; shift: boolean; dragging: boolean; ghost: DropGhost | null }

const near = (a: number, b: number) => Math.abs(a - b) < 0.01

export default function Stage5Edit() {
  const nestResult = useOptiStore(s => s.nestResult)
  const currentSheet = useOptiStore(s => s.currentSheet)
  const selectedUid = useOptiStore(s => s.selectedUid)
  const clipboard = useOptiStore(s => s.clipboard)
  const clipboardMode = useOptiStore(s => s.clipboardMode)
  const editError = useOptiStore(s => s.editError)
  const setCurrentSheet = useOptiStore(s => s.setCurrentSheet)
  const selectPlacement = useOptiStore(s => s.selectPlacement)
  const setEditError = useOptiStore(s => s.setEditError)
  const movePartWithin = useOptiStore(s => s.movePartWithin)
  const moveBlockBy = useOptiStore(s => s.moveBlockBy)
  const removeToUnplaced = useOptiStore(s => s.removeToUnplaced)
  const placeFromUnplaced = useOptiStore(s => s.placeFromUnplaced)
  const relocatePart = useOptiStore(s => s.relocatePart)
  const rotatePart = useOptiStore(s => s.rotatePart)
  const turnPartRaw = useOptiStore(s => s.turnPart)
  const copyToClipboard = useOptiStore(s => s.copyToClipboard)
  const cutToClipboard = useOptiStore(s => s.cutToClipboard)
  const pasteClipboard = useOptiStore(s => s.pasteClipboard)
  const deleteSheet = useOptiStore(s => s.deleteSheet)
  const addSheet = useOptiStore(s => s.addSheet)
  const resizeSheet = useOptiStore(s => s.resizeSheet)
  const undo = useOptiStore(s => s.undo)
  const redo = useOptiStore(s => s.redo)
  const snap = useOptiStore(s => s.snapshot)
  const profileId = useOptiStore(s => s.profileId)
  // Nest was laid out at cut size when the profile deducts edgebanding — the
  // drill overlay must shift holes onto the deducted blanks the same way Stage 6 does.
  const deductEb = snap?.profiles.find(pr => pr.id === profileId)?.deduct_edgeband === true
  const partByUid = useMemo(() => new Map((snap?.parts ?? []).map(p => [p.uid, p])), [snap])
  // True outlines for the snap (edit.ts ShapeOpts): a shaped part only blocks
  // where it really is, so parts can tuck into an L's empty corner.
  const outlineOfPl = (pl: { baseUid: string; w: number; h: number; rotated: boolean; turned?: boolean; mirrored?: boolean }) => {
    const p = partByUid.get(pl.baseUid); return p ? placedOutline(p, pl, deductEb) : null
  }
  const shapesFor = (moving: { baseUid: string; w: number; h: number; rotated: boolean } | null): ShapeOpts =>
    ({ outlineOf: outlineOfPl, moving: moving ? outlineOfPl(moving) : null })
  // Drilling is read for the nested cabinets only — not the whole job. Keyed on
  // the nested part set so paste / re-place edits don't re-read it.
  const partIndex = useOptiStore(s => s.partIndex)
  const nestKey = useMemo(() => [...new Set(Object.values(partIndex).map(p => p.baseUid))].sort().join(','), [partIndex])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const drillParts = useMemo(() => nestedParts(snap?.parts ?? [], partIndex), [snap, nestKey])

  const [ctxMenu, setCtxMenu] = useState<{ uid: string; x: number; y: number } | null>(null)
  // Accordion: one material group open at a time. null = follow current sheet's
  // group; '' = all collapsed; otherwise the explicitly-opened group key.
  const [expandedMat, setExpandedMat] = useState<string | null>(null)

  // Drilling overlay — same source as Stage 6. The materialised holes are read
  // INSTANTLY (no sync); regenerating from joints (slow) only happens on first
  // load if nothing exists yet, or when the user hits ↻ after changing joints.
  const [showDrills, setShowDrills] = useState(true)
  // Routing overlay (shaker pockets, VJ grooves, rebates, notches) — the same
  // routes Stage 6 cuts, every face, one colour per router bit.
  const [showRoutes, setShowRoutes] = useState(true)
  // Measure tool: click two points (snaps to hole centres, part corners, edges).
  const [measuring, setMeasuring] = useState(false)
  // Force place toggle (Shift does the same for one drop).
  const [forcePlace, setForcePlace] = useState(false)
  // Drag from the pool strip (unplaced parts / copy clipboard) onto the sheet.
  const sheetSvgRef = useRef<SVGSVGElement | null>(null)
  const [press, setPress] = useState<PoolPress | null>(null)
  const pressRef = useRef<PoolPress | null>(null)
  const setPressBoth = (p: PoolPress | null) => { pressRef.current = p; setPress(p) }
  const forceRef = useRef(false)
  useEffect(() => { forceRef.current = forcePlace }, [forcePlace])
  const suppressClick = useRef(false)
  const [drillOps, setDrillOps] = useState<ResolvedDrillOps | null>(null)
  const [drillsLoading, setDrillsLoading] = useState(false)
  useEffect(() => {
    if (!snap) return
    let cancelled = false
    setDrillsLoading(true)
    // Fast path: read already-generated rows, then re-read once this snapshot's
    // nested cabinets' background drilling regeneration (started by the nest run) is done.
    loadResolvedDrillOps(drillParts, { sync: false, deductEdgeband: deductEb })
      .then(r => {
        if (cancelled) return
        setDrillOps(r)
        loadResolvedDrillOps(drillParts, { sync: true, deductEdgeband: deductEb })
          .then(r2 => { if (!cancelled) setDrillOps(r2) })
          .catch(e => console.error('[Stage5] background drill sync', e))
          .finally(() => { if (!cancelled) setDrillsLoading(false) })
      })
      .catch(e => { console.error('[Stage5] loadResolvedDrillOps', e); if (!cancelled) setDrillsLoading(false) })
    return () => { cancelled = true }
  }, [snap, drillParts, deductEb])
  // Manual regenerate (after editing joints) — runs the slow sync on demand.
  async function regenerateDrills() {
    if (!snap || drillsLoading) return
    setDrillsLoading(true)
    try { setDrillOps(await loadResolvedDrillOps(drillParts, { sync: 'force', deductEdgeband: deductEb })) }
    catch (e) { console.error('[Stage5] regenerate drills', e) }
    finally { setDrillsLoading(false) }
  }
  // 6th face sheets nest against the two trimmed edges (sixthFaceLayout.ts). Done
  // to a fresh nest only: never after a hand edit, never to a saved run's layout.
  const editCount = useOptiStore(s => s.editPast.length)
  const savedNest = useOptiStore(s => s.savedRun?.nest ?? null)
  const setNestQuiet = useOptiStore(s => s.setNestQuiet)
  const originCorner = snap?.profiles.find(pr => pr.id === profileId)?.origin_corner ?? 'top_left'
  useEffect(() => {
    if (!drillOps || !nestResult || editCount > 0 || savedNest === nestResult) return
    const anchored = anchorSixthFace(nestResult, s => isTwoSidedSheet(s, drillOps), { origin_corner: originCorner })
    if (anchored !== nestResult) setNestQuiet(anchored)
  }, [drillOps, nestResult, editCount, savedNest, originCorner, setNestQuiet])
  const drillsBySheet = useMemo(
    () => (drillOps && nestResult ? projectSheetDrills(nestResult.sheets, drillOps) : new Map<number, SheetDrill[]>()),
    [drillOps, nestResult],
  )
  // Sheets that will run as a 6th face pair (program A, flip, program Z) at G-code.
  const sixthFace = useMemo(
    () => new Set(drillOps && nestResult ? nestResult.sheets.filter(s => isTwoSidedSheet(s, drillOps)).map(s => s.index) : []),
    [drillOps, nestResult],
  )
  // Rotate 180 / Mirror / Flip. Turning a part over puts its blind work underneath,
  // so its sheet may now run as a 6th face pair — say so when it changes.
  const turnPart = (uid: string, how: 'rotate180' | 'mirror' | 'flip') => {
    const st0 = useOptiStore.getState()
    const sh0 = st0.nestResult?.sheets.find(s => s.placements.some(p => p.uid === uid))
    const was = !!(drillOps && sh0 && isTwoSidedSheet(sh0, drillOps))
    turnPartRaw(uid, how)
    const st1 = useOptiStore.getState()
    if (st1.editError || !drillOps || !sh0) return
    const sh1 = st1.nestResult?.sheets.find(s => s.index === sh0.index)
    const now = !!(sh1 && isTwoSidedSheet(sh1, drillOps))
    if (now && !was) st1.setEditError('Turned over — its machining is underneath now, so this sheet runs as a 6th face pair (program A, flip the sheet, program Z). Check it before cutting.')
    else if (was && !now) st1.setEditError('This sheet no longer needs a 6th face pair — it runs as one program again.')
  }
  const SIXTH_TIP = '6th face: parts on this sheet are machined on both faces. G-code makes two programs - A (back face + 5mm trims), flip the sheet over the long edge, then Z (face routes + parts out).'
  const routesBySheet = useMemo(
    () => (drillOps && nestResult ? projectSheetRoutes(nestResult.sheets, drillOps) : new Map<number, SheetRoute[]>()),
    [drillOps, nestResult],
  )

  // Canvas zoom (multiplier on the fit-to-view scale). Container is overflow-auto,
  // so panning is just scrolling once zoomed past the viewport. The wheel zooms
  // toward the cursor (see InteractiveSheet), so we hand it the scroll container.
  const ZMIN = 0.25, ZMAX = 16
  const [zoom, setZoom] = useState(1)
  const zoomBy = (f: number) => setZoom(z => Math.min(ZMAX, Math.max(ZMIN, z * f)))
  const scrollRef = useRef<HTMLDivElement>(null)

  // Keyboard shortcuts (read live state via getState to avoid stale closures).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      const st = useOptiStore.getState()
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); st.undo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); st.redo() }
      else if (mod && e.key.toLowerCase() === 'c') { if (st.selectedUid) { e.preventDefault(); st.copyToClipboard(st.selectedUid) } }
      else if (mod && e.key.toLowerCase() === 'x') { if (st.selectedUid) { e.preventDefault(); st.cutToClipboard(st.selectedUid) } }
      else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); st.pasteClipboard(st.currentSheet) }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (st.selectedUid) { e.preventDefault(); st.removeToUnplaced(st.selectedUid) } }
      else if (!mod && e.key.toLowerCase() === 'm') { setMeasuring(m => !m) }
      else if (!mod && e.key.toLowerCase() === 'f') { setForcePlace(f => !f) }
      else if (e.key === 'Escape') { st.selectPlacement(null); setCtxMenu(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Ghost for a pool-strip drag: the part centred under the cursor on the open
  // sheet (null = cursor off the sheet). Reads the store live so the window
  // listeners never see a stale sheet.
  function poolGhost(p: PoolPress): DropGhost | null {
    const st = useOptiStore.getState()
    const sh = st.nestResult?.sheets.find(s => s.index === st.currentSheet) ?? st.nestResult?.sheets[0]
    const el = sheetSvgRef.current
    if (!sh || !el) return null
    const r = el.getBoundingClientRect()
    if (p.cx < r.left || p.cx > r.right || p.cy < r.top || p.cy > r.bottom) return null
    const { w: W, h: H } = sh.stock
    const k = r.width / W
    const sameMat = (p.item.def.materialId ?? null) === (sh.materialId ?? null) && p.item.def.thickness === sh.thickness
    const mx = (p.cx - r.left) / k, my = H - (p.cy - r.top) / k
    // The way round it sat when cut first; the other way only if that won't go.
    const ghostFor = (o: PoolOrient): DropGhost => {
      const shapes = shapesFor({ baseUid: p.item.def.baseUid, ...o })
      const gx = Math.max(0, Math.min(W - o.w, mx - o.w / 2))
      const gy = Math.max(0, Math.min(H - o.h, my - o.h / 2))
      const fits = o.w <= W && o.h <= H
      const valid = sameMat ? findNearestValid(sh, null, o.w, o.h, gx, gy, gapForSheet(sh), shapes) : null
      const clean = !!valid && near(valid.x, gx) && near(valid.y, gy)
      const forced = sameMat && fits && (forceRef.current || p.shift)
      return { gx, gy, w: o.w, h: o.h, rotated: o.rotated, forced, clean, loop: shapes.moving ?? null,
        sx: forced ? gx : valid?.x ?? null, sy: forced ? gy : valid?.y ?? null }
    }
    const gs = orientsOn(p.item.def, sh.stock).map(ghostFor)
    if (gs[0].forced) return gs[0]
    return gs.find(g => g.clean) ?? gs.find(g => g.sx != null) ?? gs[0]
  }

  // Window listeners while a pool chip is pressed: past 4px it's a drag; on
  // release over the sheet the part lands at the ghost.
  const pressing = press !== null
  useEffect(() => {
    if (!pressing) return
    const move = (e: PointerEvent) => {
      const p = pressRef.current
      if (!p) return
      const n: PoolPress = { ...p, cx: e.clientX, cy: e.clientY, shift: e.shiftKey,
        dragging: p.dragging || Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 4 }
      setPressBoth({ ...n, ghost: n.dragging ? poolGhost(n) : null })
    }
    const up = (e: PointerEvent) => {
      const p = pressRef.current
      setPressBoth(null)
      if (!p?.dragging) return
      suppressClick.current = true
      const g = poolGhost({ ...p, cx: e.clientX, cy: e.clientY, shift: e.shiftKey })
      if (!g) return                                   // dropped off the sheet
      const st = useOptiStore.getState()
      if (g.sx == null || g.sy == null) {
        const sh = st.nestResult?.sheets.find(s => s.index === st.currentSheet)
        const sameMat = sh && (p.item.def.materialId ?? null) === (sh.materialId ?? null) && p.item.def.thickness === sh.thickness
        st.setEditError(sameMat ? 'No room there — hold Shift (or turn on Force) to place it anyway.' : 'Part material/thickness does not match this sheet.')
        return
      }
      if (p.item.kind === 'unplaced') st.placeFromUnplaced(p.item.def.uid, st.currentSheet, g.sx, g.sy, g.rotated)
      else st.pasteClipboard(st.currentSheet, { x: g.sx, y: g.sy }, g.rotated)
      if (g.forced && !g.clean) useOptiStore.getState().setEditError(FORCED_WARN)
    }
    const prevCursor = document.body.style.cursor
    document.body.style.cursor = 'grabbing'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      document.body.style.cursor = prevCursor
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // poolGhost reads the store live; the part outlines it uses can't change mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pressing])

  function onPoolDown(e: React.PointerEvent, item: PoolItem) {
    if (e.button !== 0) return
    e.preventDefault()                                 // no text selection while dragging
    suppressClick.current = false
    setPressBoth({ item, x0: e.clientX, y0: e.clientY, cx: e.clientX, cy: e.clientY, shift: e.shiftKey, dragging: false, ghost: null })
  }
  const extGhost = press?.ghost ?? null

  if (!nestResult || nestResult.sheets.length === 0) {
    return <div className="h-full flex items-center justify-center text-xs text-ink-subtle">Run nesting in Stage 4 first, or add a blank sheet below.</div>
  }

  const sheet = nestResult.sheets.find(s => s.index === currentSheet) ?? nestResult.sheets[0]
  const unplaced = nestResult.unplaced

  // Details of the selected part for the inspector panel.
  const selectedInfo = (() => {
    if (!selectedUid) return null
    for (const s of nestResult.sheets) {
      const idx = sheetPartOrder(s.placements).findIndex(pl => pl.uid === selectedUid)
      if (idx >= 0) {
        const pl = sheetPartOrder(s.placements)[idx]
        const part = snap?.parts.find(p => p.uid === pl.baseUid) ?? null
        return { pl, part, sheetIndex: s.index, num: idx + 1 }
      }
    }
    return null
  })()
  const matName = (id: string | null) => id ? (snap?.materials.find(m => m.id === id)?.name ?? '—') : '—'
  const matLabel = (s: NestedSheet) => `${s.materialId ? matName(s.materialId) : 'No material'} ${s.thickness}mm`
  // Sheet numbers restart per material (labels.sheetNumbers).
  const sheetNos = sheetNumbers(nestResult.sheets)
  const sheetNo = (s: NestedSheet) => sheetNos.get(s.index)?.no ?? s.index + 1

  // Sheets grouped by material+thickness for the left list.
  const sheetGroups = (() => {
    const m = new Map<string, { key: string; label: string; sheets: NestedSheet[] }>()
    for (const s of nestResult.sheets) {
      const key = `${s.materialId ?? 'none'}__${s.thickness}`
      const g = m.get(key) ?? { key, label: matLabel(s), sheets: [] }
      g.sheets.push(s); m.set(key, g)
    }
    return [...m.values()]
  })()
  const currentGroupKey = `${sheet.materialId ?? 'none'}__${sheet.thickness}`
  const openGroupKey = expandedMat === null ? currentGroupKey : expandedMat

  return (
    <div className="h-full flex overflow-hidden" onClick={() => setCtxMenu(null)}>
      {/* Left: sheets summary grouped by material */}
      <div className="flex-none w-56 border-r border-edge flex flex-col overflow-hidden">
        <div className="flex-none px-3 py-2 border-b border-edge flex items-center justify-between">
          <span className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider">Sheets ({nestResult.sheets.length})</span>
          <AddSheetButton onAdd={addSheet} />
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {sheetGroups.map(g => {
            const isOpen = openGroupKey === g.key
            const avgEff = g.sheets.reduce((a, s) => a + s.efficiency, 0) / g.sheets.length
            const parts = g.sheets.reduce((a, s) => a + s.placements.length, 0)
            return (
              <div key={g.key} className="mb-0.5 divide-y divide-edge/40 border-b border-edge/40">
                <button
                  onClick={() => setExpandedMat(prev => {
                    const cur = prev === null ? currentGroupKey : prev
                    return cur === g.key ? '' : g.key   // toggle this one; opening it collapses the rest
                  })}
                  className={`w-full px-3 py-1.5 transition-colors border-l-2 ${isOpen ? 'bg-accent/15 border-accent' : 'border-transparent hover:bg-surface-2'}`}>
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-[11px] font-semibold truncate ${isOpen ? 'text-accent-ink' : 'text-ink'}`}>{g.label}</span>
                    <span className="text-ink-subtle shrink-0 text-[11px]">{isOpen ? '▾' : '▸'}</span>
                  </div>
                  <div className="text-[10px] text-ink-subtle text-left font-mono">
                    {g.sheets.length} sheet{g.sheets.length === 1 ? '' : 's'} · {(avgEff * 100).toFixed(0)}% avg · {parts} parts
                  </div>
                </button>
                {isOpen && g.sheets.map(s => (
                  <button key={s.index} onClick={() => setCurrentSheet(s.index)}
                    className={`w-full text-left pl-5 pr-3 py-1.5 flex items-center justify-between gap-2 text-[11px] transition-colors ${s.index === sheet.index ? 'bg-accent/15 text-accent-ink' : 'text-ink-muted hover:bg-surface-2'}`}>
                    <span className="truncate">Sheet {sheetNo(s)}{sixthFace.has(s.index) && <span className="text-amber-400" title={SIXTH_TIP}> · 6th face</span>}{s.stock.isOffcut ? ' (offcut)' : ''}</span>
                    <span className="font-mono text-ink-subtle shrink-0">{(s.efficiency * 100).toFixed(0)}% · {s.placements.length}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Main canvas + unplaced pool */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex-none px-6 py-2 flex items-center gap-2 border-b border-edge text-xs">
          <button onClick={undo} className="px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">↶ Undo</button>
          <button onClick={redo} className="px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">↷ Redo</button>
          <span className="mx-1 text-ink-subtle">|</span>
          <button disabled={!selectedUid} onClick={() => selectedUid && copyToClipboard(selectedUid)} className="px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 disabled:opacity-40 transition-colors">Copy</button>
          <button disabled={!selectedUid} onClick={() => selectedUid && cutToClipboard(selectedUid)} className="px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 disabled:opacity-40 transition-colors">Cut</button>
          <button disabled={!clipboard.length} onClick={() => pasteClipboard(sheet.index)} className="px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 disabled:opacity-40 transition-colors">Paste{clipboard.length ? ` (${clipboard.length})` : ''}</button>
          <button disabled={!selectedUid} onClick={() => selectedUid && removeToUnplaced(selectedUid)} className="px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-red-900/30 hover:text-red-300 disabled:opacity-40 transition-colors">Delete</button>
          <span className="mx-1 text-ink-subtle">|</span>
          <button onClick={() => setForcePlace(f => !f)}
            title="Force place (F) — a dropped part lands exactly where you let go: no snap, no gap or overlap check. Or hold Shift while dropping for one part."
            className={`px-2 py-1 rounded border transition-colors ${forcePlace ? 'border-orange-500/70 text-orange-300 bg-orange-900/25' : 'border-edge-strong text-ink-muted hover:bg-surface-2'}`}>
            Force place{forcePlace ? ' ✓' : ''}
          </button>
          <span className="ml-auto text-ink-subtle">{matLabel(sheet)} · Sheet {sheetNo(sheet)}{sixthFace.has(sheet.index) ? ' · 6th face' : ''} · {(sheet.efficiency * 100).toFixed(1)}%{sheet.stock.isOffcut ? ' · offcut' : ''}</span>
        </div>

        {editError && (
          <div className="flex-none px-6 py-1.5 bg-amber-900/20 text-amber-400 text-[11px] flex items-center justify-between">
            <span>{editError}</span>
            <button onClick={() => setEditError(null)} className="hover:text-amber-200">✕</button>
          </div>
        )}

        {/* Canvas — overflow-auto for pan; child centres via mx-auto when it fits
            and stays fully scrollable to the edges when zoomed past the viewport
            (grid place-items-center would clip the overflow and block panning). */}
        <div ref={scrollRef} className="flex-1 overflow-auto p-6 bg-canvas">
          {/* Zoomed in: a buffer round the sheet (grows with zoom, up to 240px)
              so you can scroll a corner away from the viewport edge. */}
          <div className="mx-auto w-fit flex flex-col items-center gap-2"
            style={zoom > 1 ? { padding: Math.min(240, (zoom - 1) * 240) } : undefined}>
            <div className="text-lg font-semibold text-ink flex items-center gap-3">
              <span>Sheet {sheetNo(sheet)}
                {sixthFace.has(sheet.index) && <span className="ml-2 align-middle text-[11px] font-normal px-1.5 py-0.5 rounded border border-amber-600/60 text-amber-400 bg-amber-900/15" title={SIXTH_TIP}>6th face</span>}
                <span className="text-ink-subtle text-sm font-normal"> of {sheetNos.get(sheet.index)?.of ?? nestResult.sheets.length} · {matLabel(sheet)} · {sheet.stock.w}×{sheet.stock.h}mm{sheet.stock.isOffcut ? ' · offcut' : ''}</span>
              </span>
              <button onClick={() => setShowDrills(s => !s)}
                className={`text-[11px] px-2 py-0.5 rounded border font-normal transition-colors ${showDrills ? 'border-amber-600/60 text-amber-400 bg-amber-900/15' : 'border-edge-strong text-ink-subtle hover:bg-surface-2'}`}>
                {drillsLoading ? 'Drilling…' : `Drilling${showDrills ? ' ✓' : ''} (${drillsBySheet.get(sheet.index)?.length ?? 0})`}
              </button>
              <button onClick={() => setShowRoutes(s => !s)}
                title={`Routing — every route, groove and pocket the CNC cuts, one colour per bit${(() => { const ts = [...new Set((routesBySheet.get(sheet.index) ?? []).map(r => r.toolNumber))].sort((a, b) => a - b); return ts.length ? ': ' + ts.map(t => 'T' + t).join(', ') : '' })()}`}
                className={`text-[11px] px-2 py-0.5 rounded border font-normal transition-colors ${showRoutes ? 'border-fuchsia-600/60 text-fuchsia-300 bg-fuchsia-900/15' : 'border-edge-strong text-ink-subtle hover:bg-surface-2'}`}>
                {`Routes${showRoutes ? ' ✓' : ''} (${routesBySheet.get(sheet.index)?.length ?? 0})`}
              </button>
              <button onClick={regenerateDrills} disabled={drillsLoading}
                title="Regenerate joint drilling from the current joints (use after editing joints)"
                className="text-[11px] px-1.5 py-0.5 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 disabled:opacity-40 font-normal transition-colors">
                ↻
              </button>
              <button onClick={() => setMeasuring(m => !m)}
                title="Measure (M) — click two points; snaps to boring-hole centres, part corners and edges. Esc or right-click clears."
                className={`text-[11px] px-2 py-0.5 rounded border font-normal transition-colors ${measuring ? 'border-cyan-500/70 text-cyan-300 bg-cyan-900/20' : 'border-edge-strong text-ink-muted hover:bg-surface-2'}`}>
                📏 Measure{measuring ? ' ✓' : ''}
              </button>
              {/* Zoom controls */}
              <div className="flex items-center gap-px text-sm font-normal">
                <button onClick={() => zoomBy(1 / 1.25)} title="Zoom out (scroll)"
                  className="w-6 h-6 grid place-items-center rounded border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">−</button>
                <button onClick={() => setZoom(1)} title="Reset zoom to fit"
                  className="px-2 h-6 grid place-items-center rounded border border-edge-strong text-[11px] tabular-nums text-ink-muted hover:bg-surface-2 transition-colors min-w-[3rem]">
                  {Math.round(zoom * 100)}%
                </button>
                <button onClick={() => zoomBy(1.25)} title="Zoom in (scroll)"
                  className="w-6 h-6 grid place-items-center rounded border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">+</button>
              </div>
            </div>
            <InteractiveSheet
              sheet={sheet}
              selectedUid={selectedUid}
              drills={showDrills ? (drillsBySheet.get(sheet.index) ?? []) : []}
              routes={showRoutes ? (routesBySheet.get(sheet.index) ?? []) : []}
              zoom={zoom}
              measuring={measuring}
              onZoom={zoomBy}
              scrollRef={scrollRef}
              onSelect={selectPlacement}
              onMove={(uid, x, y) => movePartWithin(uid, x, y)}
              svgRef={sheetSvgRef}
              force={forcePlace}
              extGhost={extGhost}
              onForced={() => setEditError(FORCED_WARN)}
              blockFor={uid => blockOfUid(nestResult, uid)}
              blocks={nestResult.blocks ?? []}
              onMoveBlock={moveBlockBy}
              onContext={(uid, x, y) => { selectPlacement(uid); setCtxMenu({ uid, x, y }) }}
              outlineFor={outlineOfPl}
              holesFor={pl => { const p = partByUid.get(pl.baseUid); return p ? placedHoles(p, pl, deductEb) : [] }}
            />
          </div>
        </div>

        {/* Unplaced pool + copy clipboard — click a chip to auto-place, or drag it
            onto the sheet (Shift / Force place = exactly where you drop it). */}
        <div className="flex-none h-28 border-t border-edge px-6 py-2 overflow-y-auto">
          <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider mb-1.5">
            Unplaced ({unplaced.length}) — click to place on sheet {sheetNo(sheet)}, or drag onto the sheet (Shift = force)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {clipboardMode === 'copy' && clipboard.map(p => (
              <button key={'clip-' + p.uid}
                onPointerDown={e => onPoolDown(e, { kind: 'clip', def: p })}
                onClick={() => { if (suppressClick.current) { suppressClick.current = false; return } pasteClipboard(sheet.index) }}
                style={{ touchAction: 'none' }}
                className="px-2 py-1 rounded border border-dashed border-accent/60 text-[11px] text-accent-ink hover:bg-accent/10 transition-colors cursor-grab"
                title={`Clipboard copy — drag onto the sheet, or click to paste. ${Math.round(p.w)}×${Math.round(p.h)}mm`}>
                ⧉ {p.label} <span className="text-ink-subtle font-mono">{Math.round(p.w)}×{Math.round(p.h)}</span>
              </button>
            ))}
            {unplaced.length === 0 && !(clipboardMode === 'copy' && clipboard.length) && <span className="text-[11px] text-ink-subtle">All parts placed.</span>}
            {unplaced.map(p => {
              const isCut = clipboardMode === 'cut' && clipboard.some(c => c.uid === p.uid)
              return (
                <button key={p.uid}
                  onPointerDown={e => onPoolDown(e, { kind: 'unplaced', def: p })}
                  onClick={() => {
                    if (suppressClick.current) { suppressClick.current = false; return }
                    const gap = gapForSheet(sheet)
                    const fit = bestFitOn(sheet, p, gap, o => shapesFor({ baseUid: p.baseUid, ...o }))
                    if (fit) placeFromUnplaced(p.uid, sheet.index, fit.pos.x, fit.pos.y, fit.o.rotated)
                    else setEditError('No room on this sheet for this part — drag it on with Shift held to force it.')
                  }}
                  style={{ touchAction: 'none' }}
                  className={`px-2 py-1 rounded border text-[11px] hover:bg-surface-2 hover:text-ink transition-colors cursor-grab ${isCut ? 'border-dashed border-accent/60 text-accent-ink' : 'border-edge-strong text-ink-muted'}`}
                  title={`${isCut ? 'Cut part — ' : ''}${Math.round(p.w)}×${Math.round(p.h)}mm. Click to auto-place, or drag onto the sheet.`}>
                  {isCut && '✂ '}{p.label} <span className="text-ink-subtle font-mono">{Math.round(p.w)}×{Math.round(p.h)}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Chip following the cursor while dragging from the pool strip. */}
      {press?.dragging && (
        <div className="fixed z-50 pointer-events-none px-2 py-1 rounded border text-[11px] shadow-lg bg-surface border-edge-strong text-ink"
          style={{ left: press.cx + 12, top: press.cy + 12 }}>
          {press.item.def.label}
          {(forcePlace || press.shift) && <span className="ml-1 text-orange-300">· force</span>}
        </div>
      )}

      {/* Right: parts-on-sheet list + selected-part inspector */}
      <div className="flex-none w-64 border-l border-edge flex flex-col overflow-hidden">
        {/* Parts on the current sheet */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex-none px-3 py-2 border-b border-edge">
            <span className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider">Parts on sheet {sheet.index + 1} ({sheet.placements.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-edge/50">
            {sheet.placements.length === 0 && <p className="text-[11px] text-ink-subtle px-3 py-3">No parts on this sheet.</p>}
            {sheetPartOrder(sheet.placements).map((pl, idx) => {
              const on = selectedUid === pl.uid
              const part = snap?.parts.find(p => p.uid === pl.baseUid)
              return (
                <button key={pl.uid} onClick={() => selectPlacement(pl.uid)}
                  className={`w-full text-left px-3 py-1 flex items-center gap-2 text-[11px] transition-colors ${on ? 'bg-accent/20 text-accent-ink' : 'text-ink-muted hover:bg-surface-2'}`}>
                  <span className="font-mono w-5 shrink-0 text-right text-ink-subtle">{idx + 1}</span>
                  <span className="truncate flex-1">{part?.label ?? pl.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Selected part inspector */}
        <div className="flex-none border-t border-edge px-3 py-2.5">
          <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider mb-1.5">Selected part</p>
          {!selectedInfo ? (
            <p className="text-[11px] text-ink-subtle">Click a part on the sheet to inspect it.</p>
          ) : (
            <div className="space-y-1 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="inline-grid place-items-center w-5 h-5 rounded bg-accent/20 text-accent-ink font-mono font-semibold">{selectedInfo.num}</span>
                <span className="text-ink font-medium truncate">{selectedInfo.part?.label ?? selectedInfo.pl.label}</span>
              </div>
              <InfoRow label="Cabinet" value={selectedInfo.part?.cabinet_label ?? '—'} />
              <InfoRow label="Room" value={selectedInfo.part ? `${selectedInfo.part.job_number ? selectedInfo.part.job_number + ' · ' : ''}${selectedInfo.part.room_name}` : '—'} />
              <InfoRow label="Width (DX)" value={`${Math.round(selectedInfo.pl.w)} mm`} />
              <InfoRow label="Height (DY)" value={`${Math.round(selectedInfo.pl.h)} mm`} />
              <InfoRow label="Thk (DZ)" value={selectedInfo.part ? `${selectedInfo.part.thickness} mm` : '—'} />
              <InfoRow label="Material" value={matName(selectedInfo.part?.material_id ?? null)} />
              <InfoRow label="On sheet" value={`${selectedInfo.sheetIndex + 1}${selectedInfo.pl.rotated ? (selectedInfo.pl.turned ? ' · rotated 270°' : ' · rotated 90°') : selectedInfo.pl.turned ? ' · rotated 180°' : ''}${selectedInfo.pl.mirrored ? ' · turned over' : ''}`} />
              {(() => { const t = grainMatchTags(nestResult).get(selectedInfo.pl.uid); return t ? <InfoRow label="Grain match" value={`${grainMatchLine(t)} · ${t.direction}`} /> : null })()}
              {selectedInfo.part?.comment && <InfoRow label="Comment" value={selectedInfo.part.comment} />}

              {/* Actions */}
              <div className="flex items-center gap-1.5 pt-2">
                <button onClick={() => rotatePart(selectedInfo.pl.uid)}
                  className="px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">⟳ Rotate</button>
                <button onClick={() => removeToUnplaced(selectedInfo.pl.uid)}
                  className="px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-red-900/30 hover:text-red-300 transition-colors">Delete</button>
              </div>
              <div className="pt-1">
                <select value="" onChange={e => {
                  const target = Number(e.target.value)
                  if (Number.isNaN(target)) return
                  const st = useOptiStore.getState()
                  const sh = st.nestResult?.sheets.find(s => s.index === target)
                  if (!sh) return
                  const pos = findBestPlacement(sh, selectedInfo.pl.w, selectedInfo.pl.h, gapForSheet(sh), shapesFor(selectedInfo.pl))
                  if (pos) relocatePart(selectedInfo.pl.uid, target, pos.x, pos.y)
                  else setEditError('No room on that sheet for this part.')
                }}
                  className="w-full bg-surface-2 border border-edge-strong rounded px-2 py-1 text-[11px] text-ink-muted focus:outline-none focus:border-accent">
                  <option value="">Move to sheet…</option>
                  {nestResult.sheets.filter(s => s.index !== selectedInfo.sheetIndex).map(s => (
                    <option key={s.index} value={s.index}>{matLabel(s)} · Sheet {sheetNo(s)}{s.stock.isOffcut ? ' (offcut)' : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
        <SheetManagePanel sheet={sheet} sheetNo={sheetNo(sheet)} onDelete={() => deleteSheet(sheet.index)} onResize={(w, h) => resizeSheet(sheet.index, w, h)} />
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div className="fixed z-50 w-52 bg-surface border border-edge-strong rounded-lg shadow-xl py-1" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={e => e.stopPropagation()}>
          <CtxItem label="Rotate 90°" onClick={() => { rotatePart(ctxMenu.uid); setCtxMenu(null) }} />
          <CtxItem label="Rotate 180°" onClick={() => { turnPart(ctxMenu.uid, 'rotate180'); setCtxMenu(null) }} />
          <CtxItem label="Mirror part (left ↔ right)" onClick={() => { turnPart(ctxMenu.uid, 'mirror'); setCtxMenu(null) }} />
          <CtxItem label="Flip part (top ↔ bottom)" onClick={() => { turnPart(ctxMenu.uid, 'flip'); setCtxMenu(null) }} />
          <CtxItem label="Copy" onClick={() => { copyToClipboard(ctxMenu.uid); setCtxMenu(null) }} />
          <CtxItem label="Cut" onClick={() => { cutToClipboard(ctxMenu.uid); setCtxMenu(null) }} />
          <CtxItem label="Delete from run" onClick={() => { removeToUnplaced(ctxMenu.uid); setCtxMenu(null) }} danger />
          <div className="border-t border-edge my-1" />
          <p className="px-3 py-1 text-[10px] text-ink-subtle uppercase tracking-wider">Move to sheet</p>
          <div className="max-h-40 overflow-y-auto">
            {nestResult.sheets.filter(s => s.index !== sheet.index).map(s => (
              <CtxItem key={s.index} label={`${matLabel(s)} · Sheet ${sheetNo(s)}`} onClick={() => {
                const st = useOptiStore.getState()
                const part = st.partIndex[ctxMenu.uid]
                const target = st.nestResult?.sheets.find(x => x.index === s.index)
                if (part && target) {
                  const p = findBestPlacement(target, part.w, part.h, gapForSheet(target))
                  if (p) relocatePart(ctxMenu.uid, s.index, p.x, p.y)
                  else setEditError('No room on that sheet for this part.')
                }
                setCtxMenu(null)
              }} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Interactive sheet (pointer drag with live snap preview) ────────────────────────
function InteractiveSheet({ sheet, selectedUid, drills, routes, zoom, measuring, onZoom, scrollRef, onSelect, onMove, onContext, outlineFor, holesFor, blockFor, onMoveBlock, blocks, svgRef, force, extGhost, onForced }: {
  /** The sheet SVG — owned by the parent so a pool-strip drag can map the cursor. */
  svgRef: React.RefObject<SVGSVGElement | null>
  /** Force place on: drops land exactly where released (Shift does it per drop). */
  force: boolean
  /** Ghost of a part being dragged in from the pool strip (parent computes it). */
  extGhost: DropGhost | null
  /** A forced drop landed somewhere that isn't legal (gap / trim / overlap). */
  onForced: () => void
  blocks: GrainBlockInfo[]
  /** Grain match block holding a front (z_grain_match G4): it drags as one. */
  blockFor: (uid: string) => GrainBlockInfo | undefined
  onMoveBlock: (uids: string[], dx: number, dy: number) => void
  outlineFor: (pl: NestedSheet['placements'][number]) => ShapePt[] | null
  holesFor: (pl: NestedSheet['placements'][number]) => ShapePt[][]
  sheet: NestedSheet
  selectedUid: string | null
  drills: SheetDrill[]
  routes: SheetRoute[]
  zoom: number
  measuring: boolean
  onZoom: (factor: number) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  onSelect: (uid: string | null) => void
  onMove: (uid: string, x: number, y: number) => void
  onContext: (uid: string, clientX: number, clientY: number) => void
}) {
  const { w: W, h: H } = sheet.stock
  const scale = Math.min(MAX_W / W, MAX_H / H) * zoom
  const pxW = W * scale, pxH = H * scale
  // gx / gy = the dragged rect's live spot under the cursor (free: it may overlap
  // other parts while dragging) — the part, or a grain match block's bounding
  // rect (block = its members + where that rect started). sx / sy = where it
  // lands on release: the nearest legal spot (gap + trims), shown as a ghost;
  // null = nowhere on the sheet, so it goes back where it was. (Mark, 2026-11-05)
  // forced = landing exactly at gx / gy (Force place / Shift); clean = that spot is legal anyway.
  const [drag, setDrag] = useState<{ uid: string; offX: number; offY: number; gx: number; gy: number
    sx: number | null; sy: number | null; forced?: boolean; clean?: boolean
    block?: { uids: Set<string>; x0: number; y0: number; w: number; h: number } } | null>(null)
  // Cursor anchor captured on wheel, consumed after the zoom re-renders to keep
  // the point under the cursor fixed (zoom-to-cursor). Fraction within the SVG +
  // the client point it must stay at.
  const anchor = useRef<{ fx: number; fy: number; cx: number; cy: number } | null>(null)

  // Plain mouse-wheel zoom toward the cursor. Native non-passive listener so
  // preventDefault actually suppresses the page/container scroll (React's
  // synthetic onWheel can be passive). Pan is via the scrollbars once zoomed in.
  // Listens on the whole canvas area (not just the sheet), so the wheel zooms
  // off the sheet too; the anchor fraction can then sit outside 0..1.
  useEffect(() => {
    const el = svgRef.current, area = scrollRef.current
    if (!el || !area) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      anchor.current = {
        fx: (e.clientX - r.left) / r.width,
        fy: (e.clientY - r.top) / r.height,
        cx: e.clientX, cy: e.clientY,
      }
      onZoom(wheelZoomFactor(e))
    }
    area.addEventListener('wheel', onWheel, { passive: false })
    return () => area.removeEventListener('wheel', onWheel)
  }, [onZoom, scrollRef, svgRef])

  // After a wheel-zoom re-renders at the new scale, nudge the scroll container so
  // the anchored fraction lands back under the original cursor point.
  useLayoutEffect(() => {
    const a = anchor.current; anchor.current = null
    const el = svgRef.current, sc = scrollRef.current
    if (!a || !el || !sc) return
    const r = el.getBoundingClientRect()
    sc.scrollLeft += r.left + a.fx * r.width - a.cx
    sc.scrollTop += r.top + a.fy * r.height - a.cy
  }, [scale, scrollRef, svgRef])

  // client → sheet mm (bottom-left origin)
  function toMm(clientX: number, clientY: number) {
    const r = svgRef.current!.getBoundingClientRect()
    return { mx: (clientX - r.left) / scale, my: H - (clientY - r.top) / scale }
  }

  function onPointerDown(e: React.PointerEvent, uid: string) {
    e.stopPropagation()
    onSelect(uid)
    const p = sheet.placements.find(p => p.uid === uid)!
    const { mx, my } = toMm(e.clientX, e.clientY)
    const b = blockFor(uid)
    const r = b ? blockRectOn(sheet, b) : null
    if (b && r) setDrag({ uid, offX: mx - r.x, offY: my - r.y, gx: r.x, gy: r.y, sx: r.x, sy: r.y, block: { uids: new Set(b.memberUids), x0: r.x, y0: r.y, w: r.w, h: r.h } })
    else setDrag({ uid, offX: mx - p.x, offY: my - p.y, gx: p.x, gy: p.y, sx: p.x, sy: p.y })
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return
    const { mx, my } = toMm(e.clientX, e.clientY)
    const part = sheet.placements.find(p => p.uid === drag.uid)!
    const gap = gapForSheet(sheet)
    const w = drag.block ? drag.block.w : part.w, h = drag.block ? drag.block.h : part.h
    // Follow the cursor freely (kept on the sheet); work out the landing spot.
    const gx = Math.max(0, Math.min(W - w, mx - drag.offX))
    const gy = Math.max(0, Math.min(H - h, my - drag.offY))
    const pos = findNearestValid(sheet, drag.block ? drag.block.uids : drag.uid, w, h, gx, gy, gap,
      { outlineOf: outlineFor, moving: drag.block ? null : outlineFor(part) })
    const forced = force || e.shiftKey
    const clean = !!pos && near(pos.x, gx) && near(pos.y, gy)
    setDrag({ ...drag, gx, gy, forced, clean,
      sx: forced ? gx : pos?.x ?? null, sy: forced ? gy : pos?.y ?? null })
  }
  function onPointerUp() {
    if (!drag) return
    // A click (no move) isn't an edit — don't push an undo step for it.
    const from = drag.block ? { x: drag.block.x0, y: drag.block.y0 } : sheet.placements.find(p => p.uid === drag.uid)
    if (drag.sx != null && drag.sy != null && !(from && near(drag.sx, from.x) && near(drag.sy, from.y))) {
      if (drag.block) onMoveBlock([...drag.block.uids], drag.sx - drag.block.x0, drag.sy - drag.block.y0)
      else onMove(drag.uid, drag.sx, drag.sy)
      if (drag.forced && !drag.clean) onForced()
    }
    setDrag(null)
  }

  const fy = (y: number, h: number) => (H - y - h) * scale
  // A ghost box, or the part's outline when it has one (placement-local loop).
  const ghostShape = (x: number, y: number, w: number, h: number, loop: ShapePt[] | null, c: string, o: number, dash?: string) => loop && loop.length >= 3
    ? <polygon points={loop.map(q => `${(x + q.x) * scale},${(H - y - q.y) * scale}`).join(' ')}
        fill={c} fillOpacity={o} stroke={c} strokeWidth={1.5} strokeDasharray={dash} style={{ pointerEvents: 'none' }} />
    : <rect x={x * scale} y={fy(y, h)} width={w * scale} height={h * scale}
        fill={c} fillOpacity={o} stroke={c} strokeWidth={1.5} strokeDasharray={dash} style={{ pointerEvents: 'none' }} />
  const partNo = new Map(sheetPartOrder(sheet.placements).map((pl, i) => [pl.uid, i + 1]))

  // ── Measure tool ── snap targets in sheet mm: sheet border, each part's outline (or rect), cutouts, drill holes.
  const snapSrc = useMemo<SnapSources | null>(() => {
    if (!measuring) return null
    const loops = [rectLoop(0, 0, W, H)]
    for (const p of sheet.placements) {
      const ol = outlineFor(p)
      loops.push(ol ? ol.map(q => ({ x: p.x + q.x, y: p.y + q.y })) : rectLoop(p.x, p.y, p.w, p.h))
      for (const h of holesFor(p)) loops.push(h.map(q => ({ x: p.x + q.x, y: p.y + q.y })))
    }
    return { loops, holes: drills }
    // outlineFor / holesFor are fresh closures each render; the sheet + drills drive them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measuring, sheet, drills, W, H])
  const measureSnap = (clientX: number, clientY: number) => {
    const { mx, my } = toMm(clientX, clientY)
    return snapPoint(mx, my, snapSrc!, 10 / scale)   // 10px snap radius
  }

  return (
    <svg ref={svgRef} width={pxW} height={pxH} viewBox={`0 0 ${pxW} ${pxH}`}
      onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
      onClick={() => onSelect(null)} className="shadow-lg">
      <rect x={0} y={0} width={pxW} height={pxH} fill="#0f172a" stroke="#475569" strokeWidth={1} />
      {(() => { const u = usableBounds(sheet.stock); return (
        <rect x={u.x0 * scale} y={(H - u.y1) * scale} width={(u.x1 - u.x0) * scale} height={(u.y1 - u.y0) * scale}
          fill="none" stroke="#334155" strokeWidth={1} strokeDasharray="3 3" />
      ) })()}
      {sheet.placements.map((p, idx) => {
        const inBlock = !!drag?.block?.uids.has(p.uid)
        const isDrag = drag?.uid === p.uid && !drag.block
        const x = inBlock ? p.x + drag!.gx - drag!.block!.x0 : isDrag ? drag!.gx : p.x
        const y = inBlock ? p.y + drag!.gy - drag!.block!.y0 : isDrag ? drag!.gy : p.y
        const on = selectedUid === p.uid
        const num = partNo.get(p.uid) ?? idx + 1   // per-sheet part number (labels.sheetPartOrder)
        const outline = outlineFor(p)
        return (
          <g key={p.uid}
            onPointerDown={e => onPointerDown(e, p.uid)}
            onClick={e => e.stopPropagation()}
            onContextMenu={e => { e.preventDefault(); onContext(p.uid, e.clientX, e.clientY) }}
            style={{ cursor: 'move' }}>
            {/* Shaped parts: the bbox stays as a faint dashed footprint (it's
                still what the nest packs and what you drag) and the outline is drawn in it. */}
            <rect x={x * scale} y={fy(y, p.h)} width={p.w * scale} height={p.h * scale}
              fill={on ? '#2563eb' : '#1e3a5f'} fillOpacity={outline ? 0.14 : on ? 0.6 : 0.42}
              stroke={on ? '#60a5fa' : '#3b82f6'} strokeWidth={outline ? 0.6 : on ? 1.8 : 0.9}
              strokeDasharray={outline ? '4 3' : undefined} />
            {outline && <PlacedOutline local={outline} x={x} y={y} H={H} scale={scale} on={on} />}
            <PlacedHoles holes={holesFor(p)} x={x} y={y} H={H} scale={scale} />
            {(() => {
              const wpx = p.w * scale, hpx = p.h * scale
              const cx = (x + p.w / 2) * scale
              const cyc = fy(y, p.h) + hpx / 2
              // Orientation is chosen by FIT, not by the part's nest rotation:
              // keep text horizontal whenever the part is wide enough to show
              // it, and only rotate when the width is too narrow but the height
              // gives room. (A tall-but-wide-enough part stays horizontal.)
              const horizOK = hpx > 22 && wpx > 46
              const vertOK = wpx > 22 && hpx > 46
              const vertical = !horizOK && vertOK
              const along = vertical ? hpx : wpx         // text runs along this
              const across = vertical ? wpx : hpx        // text height sits across this
              const showNum = across > 11 && along > 16
              const showLabel = across > 22 && along > 46
              const numFont = Math.min(13, Math.max(8, across / 2.2))
              const labelFont = Math.min(9, Math.max(6, across / 4))
              const maxChars = Math.max(3, Math.floor(along / (labelFont * 0.62)))
              const label = p.label.length > maxChars ? p.label.slice(0, maxChars - 1) + '…' : p.label
              return (
                <g style={{ pointerEvents: 'none' }} transform={vertical ? `rotate(-90 ${cx} ${cyc})` : undefined}>
                  {showNum && (
                    <text x={cx} y={cyc + (showLabel ? -5 : 0)} textAnchor="middle" dominantBaseline="middle"
                      fill="#e2e8f0" fontSize={numFont} fontWeight={600} fontFamily="monospace">
                      {num}
                    </text>
                  )}
                  {showLabel && (
                    <text x={cx} y={cyc + 8} textAnchor="middle" dominantBaseline="middle"
                      fill="#94a3b8" fontSize={labelFont} fontFamily="monospace">
                      {p.mirrored ? '⇋ ' : ''}{label}
                    </text>
                  )}
                </g>
              )
            })()}
          </g>
        )
      })}
      {routes.length > 0 && <SheetRoutes routes={routes} H={H} scale={scale} />}
      {/* Drag landing ghost: where the part / block will sit when released. A
          shaped part's ghost is its true outline (the snap uses it too). */}
      {drag && (() => {
        const part = sheet.placements.find(p => p.uid === drag.uid)
        const w = drag.block ? drag.block.w : part?.w ?? 0, h = drag.block ? drag.block.h : part?.h ?? 0
        const loop = !drag.block && part ? outlineFor(part) : null
        const moved = Math.abs(drag.gx - (drag.sx ?? drag.gx)) > 0.5 || Math.abs(drag.gy - (drag.sy ?? drag.gy)) > 0.5
        if (drag.sx == null || drag.sy == null) return ghostShape(drag.gx, drag.gy, w, h, loop, '#ef4444', 0.18)
        if (drag.forced) return !drag.clean ? ghostShape(drag.sx, drag.sy, w, h, loop, '#f97316', 0.14, '5 3') : null
        return moved ? ghostShape(drag.sx, drag.sy, w, h, loop, '#22c55e', 0.12, '5 3') : null
      })()}
      {/* Pool-strip drag: the part under the cursor + where it will land
          (green = snapped, orange = forced into a gap / overlap, red = nowhere). */}
      {extGhost && (() => {
        const g = extGhost
        const at = (x: number, y: number, c: string, o: number, dash?: string) => ghostShape(x, y, g.w, g.h, g.loop ?? null, c, o, dash)
        if (g.sx == null || g.sy == null) return at(g.gx, g.gy, '#ef4444', 0.18)
        if (g.forced) return at(g.sx, g.sy, g.clean ? '#22c55e' : '#f97316', 0.2, g.clean ? undefined : '5 3')
        return <>{at(g.gx, g.gy, '#3b82f6', 0.15)}{at(g.sx, g.sy, '#22c55e', 0.12, '5 3')}</>
      })()}
      {/* Drill holes (sheet space, BL origin) — same source as Stage 6 G-code.
          Drawn at EXACT diameter (so ⌀5 vs ⌀8 vs ⌀35 read true-to-scale — zoom in
          to inspect). A real ⌀5 on a 2400mm sheet is ~1px when zoomed out, so a
          faint locator ring marks tiny holes; it disappears once the true size
          exceeds it as you zoom in. */}
      {drills.length > 0 && (
        <g style={{ pointerEvents: 'none' }}>
          {drills.map((d, i) => {
            const cx = d.x * scale, cy = (H - d.y) * scale
            const tr = Math.max(0.4, (d.diameter / 2) * scale)   // exact radius (px)
            const mr = Math.max(2.2, tr)                          // locator floor
            const inner = tr < mr - 0.5
            return (
              <g key={i}>
                {inner && <circle cx={cx} cy={cy} r={mr} fill="none" stroke="#f59e0b" strokeOpacity={0.4} strokeWidth={0.8} />}
                <circle cx={cx} cy={cy} r={tr} fill="#f59e0b" fillOpacity={0.95} stroke="#0f172a" strokeWidth={Math.min(0.7, tr * 0.4)} />
              </g>
            )
          })}
        </g>
      )}
      {/* Grain match blocks (z_grain_match G5) — follow a block being dragged. */}
      <GrainBlockOutlines sheet={sheet} blocks={blocks} H={H} scale={scale} fontPx={11}
        shift={drag?.block ? { uids: drag.block.uids, dx: drag.gx - drag.block.x0, dy: drag.gy - drag.block.y0 } : null} />
      {/* Keyed on the sheet: switching sheet or turning the tool off clears the points. */}
      {measuring && snapSrc && (
        <MeasureOverlay key={sheet.index} snap={measureSnap} H={H} scale={scale} pxW={pxW} pxH={pxH} />
      )}
    </svg>
  )
}

// Routing features (sheet space, BL origin) — same source as Stage 6 G-code, so a
// tool-set door shows every step: the pocket cleared, each outline as the band its
// bit cuts, square-off corners, grooves at their width. One colour per bit.
const ROUTE_COLOURS = ['#e879f9', '#22d3ee', '#a3e635', '#fb923c', '#f472b6', '#facc15', '#818cf8', '#34d399']
function SheetRoutes({ routes, H, scale }: { routes: SheetRoute[]; H: number; scale: number }) {
  const tools = [...new Set(routes.map(r => r.toolNumber))].sort((a, b) => a - b)
  const col = (t: number) => ROUTE_COLOURS[tools.indexOf(t) % ROUTE_COLOURS.length]
  const X = (x: number) => x * scale, Y = (y: number) => (H - y) * scale
  // A band `b` wide just inside (or centred on, onLine) the rectangle, as a stroked rect.
  const band = (key: string, x: number, y: number, w: number, h: number, b: number, c: string) => {
    const k = b / 2
    return w - b > 0 && h - b > 0
      ? <rect key={key} x={X(x + k)} y={Y(y + h - k)} width={(w - b) * scale} height={(h - b) * scale}
          fill="none" stroke={c} strokeOpacity={0.55} strokeWidth={Math.max(0.6, b * scale)} />
      : <rect key={key} x={X(x)} y={Y(y + h)} width={w * scale} height={h * scale} fill={c} fillOpacity={0.45} />
  }
  return (
    <g style={{ pointerEvents: 'none' }}>
      {routes.map((r, i) => {
        const c = col(r.toolNumber)
        const cw = r.cutWidth ?? r.toolDiameter   // V-bit: its width at depth, not its diameter
        if (r.kind === 'groove') return (
          <line key={i} x1={X(r.x1)} y1={Y(r.y1)} x2={X(r.x2)} y2={Y(r.y2)}
            stroke={c} strokeOpacity={0.8} strokeWidth={Math.max(0.8, r.width * scale)} />
        )
        if (r.corners) {
          // Square-off: the tool runs into each corner — mark a tool-wide square there.
          const d = r.toolDiameter
          return (
            <g key={i}>
              {[[r.x, r.y], [r.x + r.w - d, r.y], [r.x, r.y + r.h - d], [r.x + r.w - d, r.y + r.h - d]].map(([cx, cy], k) => (
                <rect key={k} x={X(cx)} y={Y(cy + d)} width={Math.max(1.5, d * scale)} height={Math.max(1.5, d * scale)}
                  fill={c} fillOpacity={0.9} />
              ))}
            </g>
          )
        }
        if (r.clear && r.ringWidth != null && r.ringWidth > 0) return band(String(i), r.x, r.y, r.w, r.h, r.ringWidth, c)
        if (r.clear) return (
          <rect key={i} x={X(r.x)} y={Y(r.y + r.h)} width={r.w * scale} height={r.h * scale}
            fill={c} fillOpacity={0.22} stroke={c} strokeOpacity={0.8} strokeWidth={0.8} />
        )
        return r.onLine
          ? band(String(i), r.x - cw / 2, r.y - cw / 2, r.w + cw, r.h + cw, cw, c)
          : band(String(i), r.x, r.y, r.w, r.h, cw, c)
      })}
    </g>
  )
}

// Measure overlay: transparent hit layer (blocks part drag while measuring),
// the A→B dimension with ΔX / ΔY legs, and the snap marker under the cursor
// (○+ hole centre, □ corner, △ on a line, × free point). Click A, click B;
// the next click starts a new measure. Esc / right-click clears.
function MeasureOverlay({ snap, H, scale, pxW, pxH }: {
  snap: (clientX: number, clientY: number) => MeasureSnap
  H: number; scale: number; pxW: number; pxH: number
}) {
  const [pts, setPts] = useState<{ a: MeasureSnap | null; b: MeasureSnap | null }>({ a: null, b: null })
  const [hover, setHover] = useState<MeasureSnap | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPts({ a: null, b: null }) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const a = pts.a, b = pts.b ?? (pts.a ? hover : null)
  const px = (p: { x: number; y: number }) => ({ x: p.x * scale, y: (H - p.y) * scale })
  const col = '#22d3ee'
  const fmt = (v: number) => (Math.round(v * 10) / 10).toString()
  const marker = (s: MeasureSnap, key: string) => {
    const { x, y } = px(s), r = 5
    return (
      <g key={key}>
        {s.kind === 'hole' && <><circle cx={x} cy={y} r={r} fill="none" stroke={col} strokeWidth={1.5} />
          <path d={`M${x - r - 2} ${y}H${x + r + 2}M${x} ${y - r - 2}V${y + r + 2}`} stroke={col} strokeWidth={1} /></>}
        {s.kind === 'corner' && <rect x={x - r} y={y - r} width={r * 2} height={r * 2} fill="none" stroke={col} strokeWidth={1.5} />}
        {s.kind === 'line' && <path d={`M${x} ${y - r}L${x + r} ${y + r}L${x - r} ${y + r}Z`} fill="none" stroke={col} strokeWidth={1.5} />}
        {s.kind === 'free' && <path d={`M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}`} stroke={col} strokeWidth={1} />}
      </g>
    )
  }
  let dim: React.ReactNode = null
  if (a && b) {
    const A = px(a), B = px(b)
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y), d = Math.hypot(dx, dy)
    const text = `${fmt(d)} mm   ΔX ${fmt(dx)}   ΔY ${fmt(dy)}`
    const tw = text.length * 6.6 + 10
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2
    const lx = Math.min(Math.max(mx - tw / 2, 2), pxW - tw - 2), ly = Math.min(Math.max(my - 26, 2), pxH - 20)
    dim = (
      <g>
        <path d={`M${A.x} ${A.y}H${B.x}V${B.y}`} fill="none" stroke={col} strokeOpacity={0.45} strokeWidth={1} strokeDasharray="4 3" />
        <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={col} strokeWidth={1.5} />
        <rect x={lx} y={ly} width={tw} height={18} rx={3} fill="#0f172a" fillOpacity={0.9} stroke={col} strokeWidth={1} />
        <text x={lx + 5} y={ly + 13} fontSize={11} fontFamily="monospace" fill={col}>{text}</text>
      </g>
    )
  }
  return (
    <g>
      <g style={{ pointerEvents: 'none' }}>
        {dim}
        {a && marker(a, 'a')}
        {b && b !== hover && marker(b, 'b')}
        {hover && marker(hover, 'h')}
      </g>
      <rect x={0} y={0} width={pxW} height={pxH} fill="transparent" style={{ cursor: 'crosshair' }}
        onPointerMove={e => setHover(snap(e.clientX, e.clientY))} onPointerLeave={() => setHover(null)}
        onClick={e => {
          e.stopPropagation()
          const s = snap(e.clientX, e.clientY)
          setPts(m => (!m.a || m.b) ? { a: s, b: null } : { a: m.a, b: s })
        }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setPts({ a: null, b: null }) }} />
    </g>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-ink-subtle shrink-0">{label}</span>
      <span className="text-ink-muted text-right truncate" title={value}>{value}</span>
    </div>
  )
}


function AddSheetButton({ onAdd }: { onAdd: (stock: { w: number; h: number; trimTop: number; trimBottom: number; trimLeft: number; trimRight: number; isOffcut: boolean; label: string | null }, materialId: string | null, thickness: number) => void }) {
  // Adds a blank standard-ish sheet for the first selected material group.
  const groups = useOptiStore(s => s.stock)
  function add() {
    const firstKey = Object.keys(groups)[0]
    const g = firstKey ? groups[firstKey] : null
    const [matId, thick] = firstKey ? firstKey.split('__') : ['none', '18']
    onAdd(g ? { ...g.standard, label: 'Blank' } : { w: 2400, h: 1200, trimTop: 0, trimBottom: 0, trimLeft: 0, trimRight: 0, isOffcut: false, label: 'Blank' },
      matId === 'none' ? null : matId, Number(thick))
  }
  return <button onClick={add} className="text-[11px] px-1.5 py-0.5 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">+ Sheet</button>
}

function SheetManagePanel({ sheet, sheetNo, onDelete, onResize }: { sheet: NestedSheet; sheetNo: number; onDelete: () => void; onResize: (w: number, h: number) => void }) {
  return (
    <div className="flex-none border-t border-edge p-3 space-y-2">
      <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider">Sheet {sheetNo}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-ink-subtle">W
          <input type="number" defaultValue={sheet.stock.w} key={`w${sheet.index}${sheet.stock.w}`}
            onBlur={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onResize(v, sheet.stock.h) }}
            className="w-full bg-surface-2 border border-edge-strong rounded px-1.5 py-0.5 text-xs text-ink font-mono mt-0.5 focus:outline-none focus:border-accent" />
        </label>
        <label className="text-[10px] text-ink-subtle">H
          <input type="number" defaultValue={sheet.stock.h} key={`h${sheet.index}${sheet.stock.h}`}
            onBlur={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onResize(sheet.stock.w, v) }}
            className="w-full bg-surface-2 border border-edge-strong rounded px-1.5 py-0.5 text-xs text-ink font-mono mt-0.5 focus:outline-none focus:border-accent" />
        </label>
      </div>
      <button onClick={async () => { if (await confirmDelete({ title: 'Delete Sheet', message: 'Delete this sheet? Its parts return to the unplaced pool.' })) onDelete() }}
        className="w-full text-[11px] px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-red-900/30 hover:text-red-300 transition-colors">
        Delete sheet
      </button>
    </div>
  )
}

function CtxItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${danger ? 'text-red-400 hover:bg-red-900/30' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}`}>
      {label}
    </button>
  )
}
