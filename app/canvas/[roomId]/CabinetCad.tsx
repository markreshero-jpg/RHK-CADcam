'use client'

// CAD in the Cabinet Edit modal (z_item_cad IC1–IC2, IC3a). F7 / the CAD button on the
// Elevation, Top or Side tab draws notes on that view of the cabinet with the room's CAD
// tools. Notes drawn here are "this cabinet only" (room_annotations, view cabinet_sheet /
// front | top | side); front notes show on the room elevation with the cabinet. "Move to library" turns selected notes into item
// CAD on a bin front or on the cabinet code, so every cabinet with one draws them.
// Hide here / Detach (IC2) are per cabinet; {bin} {code} {w}… fill per cabinet / front.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CabinetInstance, Room, RoomAnnotation, Wall } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { cabinetSheetOwner, ownedBy, type SheetView } from '@/src/lib/annotations/owner'
import { mapPt, type AnnotFrame, type Box, type Pt } from '@/src/lib/annotations/geometry'
import { cadSnap, addOutline, type CadSnapSettings, type SnapGeometry } from '@/src/lib/annotations/cadSnap'
import { planSnapGeometry } from '@/src/lib/annotations/planSnapGeometry'
import { withFieldsFilled, annotationsBounds, type CadFieldValues } from '@/src/lib/annotations/blocks'
import { placeItemCad, asAnnotationRows, ownerId, sheetItemCadView, ITEM_CAD_FIELDS, type ItemCadTarget } from '@/src/lib/annotations/itemCad'
import { caseBox } from '@/src/lib/jointDrilling'
import { bifoldTracks, trackProfile } from '@/src/lib/resolver/resolveBifold'
import { SNAP_PX } from '@/src/lib/geometry'
import { supabase } from '@/src/lib/supabase'
import { useAnnotationTool } from './useAnnotationTool'
import AnnotationLayer from './AnnotationLayer'
import AnnotTextEditor from './AnnotTextEditor'
import CadContextMenu from './CadContextMenu'
import CadSnapMarker from './CadSnapMarker'
import CadMeasureOverlay from './CadMeasureOverlay'
import CadRibbon from './CadRibbon'
import CadPanel from './CadPanel'
import { ELEV_PAD, type ModalCadHost } from './ResolvedViews'
import { zoneElevRect } from './cabinetEditSvgHelpers'
import { dbDeleteAnnotations } from './canvasDB'
import { distinctTargets, hiddenOwners, type ItemCadApi } from './useItemCad'
import { useTutorial } from '@/src/lib/tutorial/store'

/** What the canvas hands the modal so its CAD shares the room's notes, undo and settings. */
export interface ModalCadContext {
  room:            Room
  walls:           Wall[]
  annotations:     RoomAnnotation[]
  setAnnotations:  React.Dispatch<React.SetStateAction<RoomAnnotation[]>>
  captureSnapshot: () => void
  /** frame mm per paper mm (the room's annotation scale) + its setter. */
  scale:           number
  onScale:         (n: number) => void
  snap:            CadSnapSettings
  onSnap:          (s: CadSnapSettings) => void
  fields:          CadFieldValues
  itemCad:         ItemCadApi
  /** Set the item CAD owners a cabinet hides (Hide / Detach, IC2). */
  setItemCadHidden: (cabinetId: string, hidden: string[]) => void
}

const boxPts = (b: Box): Pt[] => [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }]
const centreOf = (b: Box): Pt => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 })
const inBox = (b: Box, p: Pt) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY

const SHEET_NAME: Record<SheetView, string> = { front: 'Front', top: 'Top', side: 'Side' }

export function useCabinetCad({ ctx, cabinet, rp, sheet = 'front', viewOn, onEnter }: {
  ctx:     ModalCadContext | undefined
  cabinet: CabinetInstance
  rp:      ResolvedCabinet | undefined
  /** Which tab's drawing: front = Elevation, top = Top, side = Side (IC3a). */
  sheet?:  SheetView
  /** That tab is on show. */
  viewOn:  boolean
  /** CAD turning on (the modal drops its part selection / measure tool). */
  onEnter?: () => void
}) {
  const [on, setOnRaw] = useState(false)
  const setOn = useCallback((v: boolean | ((p: boolean) => boolean)) => setOnRaw(prev => {
    const next = typeof v === 'function' ? v(prev) : v
    if (next && !prev) queueMicrotask(() => { onEnter?.(); useTutorial.getState().emit('item_cad_on') })
    return next
  }), [onEnter])
  const active = !!ctx && on && viewOn
  const [unit, setUnit] = useState(1)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const paper = ctx?.scale ?? 20
  const owner = useMemo(() => cabinetSheetOwner(cabinet.id, sheet), [cabinet.id, sheet])
  const libView = sheetItemCadView(sheet)
  // Sheet frame (owner.ts) → the view's svg: the view reports where the frame's origin
  // sits (front / side: the cabinet's bottom left / back; top: its back left corner).
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const frame = useMemo<AnnotFrame>(() => origin
    ? { ox: origin.x, oy: origin.y, s: 1, flipY: false }
    : { ox: ELEV_PAD.pl, oy: ELEV_PAD.pt + cabinet.dy, s: 1, flipY: false }, [origin, cabinet.dy])
  const zoom = 1 / unit
  const annotations = useMemo(() => ctx?.annotations ?? [], [ctx?.annotations])
  const own = useMemo(() => annotations.filter(a => ownedBy(a, owner)), [annotations, owner])

  // Snaps: the cabinet's outline + each front (corners, mids, centre) and the notes.
  // Top / Side: also every carcass panel, the doors and the bi-fold tracks (its end
  // profile in Side), so a detail can be dimensioned off them.
  const snapRoom = useMemo<SnapGeometry>(() => {
    const g: SnapGeometry = { segs: [], points: [] }
    const rect = (b: Box, src: 'cabinets' | 'fronts') => addOutline(g, boxPts(b), src, true, undefined, true)
    if (sheet === 'front') {
      rect({ minX: 0, maxX: cabinet.dx, minY: -cabinet.dy, maxY: 0 }, 'cabinets')
      for (const z of rp?.face_zones ?? []) {
        if (z.face_type === 'open') continue
        const r = zoneElevRect(z)
        rect({ minX: r.ex, maxX: r.ex + r.ew, minY: -r.ey, maxY: -(r.ey - r.eh) }, 'fronts')
      }
      return g
    }
    // A cabinet-space box → this sheet's frame (top: x, z; side: z, y down).
    const put = (b: { x: number; y: number; z: number; w: number; h: number; d: number }, src: 'cabinets' | 'fronts') => rect(sheet === 'top'
      ? { minX: b.x, maxX: b.x + b.w, minY: b.z, maxY: b.z + b.d }
      : { minX: b.z, maxX: b.z + b.d, minY: -(b.y + b.h), maxY: -b.y }, src)
    rect(sheet === 'top' ? { minX: 0, maxX: cabinet.dx, minY: 0, maxY: cabinet.dz } : { minX: 0, maxX: cabinet.dz, minY: -cabinet.dy, maxY: 0 }, 'cabinets')
    for (const p of rp?.case_parts ?? []) if (!p.AY) put(caseBox(p), 'cabinets')
    for (const z of rp?.face_zones ?? []) {
      if (z.face_type === 'open' || z.AY) continue
      put({ x: z.X, y: z.Y, z: z.Z, w: z.DX, h: z.DY, d: z.DZ }, 'fronts')
    }
    for (const t of rp ? bifoldTracks(rp) : []) {
      if (sheet === 'side') addOutline(g, trackProfile(t).map(p => ({ x: p.z, y: -p.y })), 'cabinets', true, undefined, true)
      else put({ x: t.x, y: t.y, z: t.z, w: t.dx, h: t.dy, d: t.dz }, 'cabinets')
    }
    return g
  }, [sheet, cabinet.dx, cabinet.dy, cabinet.dz, rp])
  const snapNotes = useMemo(() => planSnapGeometry({ walls: [], cabinets: [], fixtures: [], benchtops: [], annotations: own, paperToFrame: paper }), [own, paper])

  const noop = useCallback(() => {}, [])
  const cad = useAnnotationTool({
    room: ctx?.room ?? ({ id: '' } as Room), annotations, setAnnotations: ctx?.setAnnotations ?? noop as never,
    captureSnapshot: ctx?.captureSnapshot ?? noop, owner, frame, paper, zoom, active,
    toWorld: e => {
      const svg = svgRef.current, m = svg?.getScreenCTM()
      if (!svg || !m) return { x: 0, y: 0 }
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
      return { x: p.x, y: p.y }
    },
    snap: (p, prev, exclude, ownGeo) => ctx
      ? cadSnap(p, ownGeo ? [snapRoom, snapNotes, ownGeo] : [snapRoom, snapNotes], ctx.snap, SNAP_PX / zoom, prev, exclude)
      : { pt: p, kind: null },
    enterCad: () => setOn(true), exitCad: () => setOn(false),
  })

  // F7 toggles the modal's CAD on this tab (the canvas behind never sees it).
  useEffect(() => {
    if (!ctx || !viewOn) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F7') return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      e.preventDefault(); e.stopPropagation()
      setOn(v => !v)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [ctx, viewOn, setOn])

  // Item CAD on this cabinet (read-only here; Edit pulls it back into the drawing).
  const targetsFor = ctx?.itemCad.targetsFor
  const targets = useMemo(() => targetsFor ? targetsFor(cabinet, rp, sheet) : [], [targetsFor, cabinet, rp, sheet])
  const hidden = useMemo(() => hiddenOwners(cabinet), [cabinet])
  // Fields: this cabinet's ({code}, {w}, {bin}…) over the job's; a front's notes read its own bin.
  const fieldsFor = ctx?.itemCad.fieldsFor
  const cabFields = useMemo<CadFieldValues>(() => ({ ...ctx?.fields, ...fieldsFor?.(cabinet, undefined, rp) }), [ctx?.fields, fieldsFor, cabinet, rp])
  const libraryNotes = useMemo(() => !ctx ? { shown: [], hidden: [] } : (() => {
    const shown: RoomAnnotation[] = [], hid: RoomAnnotation[] = []
    targets.forEach((t, i) => {
      const rows = withFieldsFilled(withFieldsFilled(asAnnotationRows(placeItemCad(ctx.itemCad.targetItems(t, libView), t.box, paper),
        `itemcad:${cabinet.id}:${sheet}:${i}`, ctx.room.id, sheet), ctx.itemCad.fieldsFor(cabinet, t, rp)), ctx.fields)
      ;(hidden.has(ownerId(t.kind, t.key)) ? hid : shown).push(...rows)
    })
    return { shown, hidden: hid }
  })(), [ctx, targets, paper, cabinet, rp, hidden, libView, sheet])

  const cursorStyle = cad.tool === 'select' ? 'default' : 'crosshair'
  const overlay = !ctx ? null : (
    <g>
      {active && (
        <rect x={-1e7} y={-1e7} width={2e7} height={2e7} fill="transparent"
          style={{ pointerEvents: 'all', cursor: cursorStyle }}
          onPointerDown={cad.onCaptureDown} onPointerMove={cad.onCaptureMove}
          onDoubleClick={cad.onCaptureDouble} onContextMenu={cad.onCaptureMenu} />
      )}
      {/* Where library item CAD attaches (CAD on): a dashed box per target. */}
      {active && distinctTargets(targets).map(t => {
        const a = mapPt(frame, { x: t.box.minX, y: t.box.minY }), b = mapPt(frame, { x: t.box.maxX, y: t.box.maxY })
        return <rect key={ownerId(t.kind, t.key)} x={a.x} y={a.y} width={b.x - a.x} height={b.y - a.y} fill="none"
          stroke="#22d3ee" strokeOpacity={0.7} strokeWidth={unit} strokeDasharray={`${6 * unit} ${4 * unit}`} style={{ pointerEvents: 'none' }} />
      })}
      <AnnotationLayer annotations={libraryNotes.shown} frame={frame} paper={paper} />
      {/* Hidden on this cabinet: ghosted here so it can be shown again; the room doesn't draw it. */}
      <g opacity={0.25}><AnnotationLayer annotations={libraryNotes.hidden} frame={frame} paper={paper} /></g>
      <AnnotationLayer annotations={withFieldsFilled(cad.withEditing(own), cabFields)} frame={frame} paper={paper}
        edit={{ ...cad.editProps, hittable: cad.editProps.hittable && active }} />
      {cad.drawPreview && <AnnotationLayer annotations={[cad.drawPreview]} frame={frame} paper={paper} />}
      {active && <CadMeasureOverlay live={cad.liveMeasure} frame={frame} zoom={zoom}
        selected={!cad.editing && cad.selected.length === 1 ? cad.selected[0] : null} />}
      {active && cad.snapHit && <CadSnapMarker pt={mapPt(frame, cad.snapHit.pt)} kind={cad.snapHit.kind} size={9 / zoom} />}
      {active && cad.ghost && (() => {
        const a = mapPt(frame, cad.ghost.a), b = mapPt(frame, cad.ghost.b)
        return <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)}
          fill={cad.ghost.kind === 'marquee' ? 'rgba(56,189,248,0.08)' : 'none'} stroke="#38bdf8"
          strokeWidth={unit} strokeDasharray={`${5 * unit} ${3 * unit}`} style={{ pointerEvents: 'none' }} />
      })()}
    </g>
  )

  const setSvg = useCallback((el: SVGSVGElement | null) => { svgRef.current = el }, [])
  const host: ModalCadHost = { on: active, overlay, setSvg, onUnit: setUnit, onOrigin: setOrigin }

  // ── Move to library / Edit / Remove ──
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const selOwn = cad.selected.filter(a => ownedBy(a, owner))

  /** The target of this owner the selection sits on (two bin fronts: the one under it). */
  function pickTarget(t: ItemCadTarget): ItemCadTarget {
    const same = targets.filter(x => x.kind === t.kind && x.key === t.key)
    const b = annotationsBounds(selOwn, paper)
    if (!b || same.length < 2) return t
    const c = centreOf(b)
    return same.find(x => inBox(x.box, c)) ?? same.reduce((best, x) => {
      const d = (q: ItemCadTarget) => (centreOf(q.box).x - c.x) ** 2 + (centreOf(q.box).y - c.y) ** 2
      return d(x) < d(best) ? x : best
    })
  }

  async function moveToLibrary(t: ItemCadTarget) {
    if (!ctx || !selOwn.length || busy) return
    setBusy(true); setMsg(null)
    const target = pickTarget(t)
    const err = await ctx.itemCad.saveToLibrary(target, selOwn, libView)
    if (err) { setMsg(err); setBusy(false); return }
    const ids = new Set(selOwn.map(a => a.id))
    ctx.captureSnapshot()
    ctx.setAnnotations(prev => prev.filter(a => !ids.has(a.id)))
    cad.setSelectedIds(new Set())
    void dbDeleteAnnotations([...ids])
    useTutorial.getState().emit('item_cad_moved')
    setMsg(`${ids.size} note${ids.size > 1 ? 's' : ''} moved to ${target.label}. New jobs and this job draw ${ids.size > 1 ? 'them' : 'it'}; other jobs keep theirs until Update job.`)
    setBusy(false)
  }

  /** Library notes on these targets → this cabinet's own notes (fields stay as tokens). */
  async function copyToCabinet(ts: ItemCadTarget[]): Promise<RoomAnnotation[] | null> {
    if (!ctx) return null
    const items = ts.flatMap(t => placeItemCad(ctx.itemCad.targetItems(t, libView), t.box, paper))
    if (!items.length) return null
    const base = Math.max(0, ...own.map(a => a.sort_order)) + 1
    const rows = items.map((it, i) => ({
      id: crypto.randomUUID(), room_id: ctx.room.id, view: 'cabinet_sheet' as const, wall_id: null, wall_side: null,
      cabinet_id: cabinet.id, sheet_view: sheet, kind: it.kind, geom: it.geom, text: it.text, style: it.style, sort_order: base + i,
    }))
    const { data, error } = await supabase.from('room_annotations').insert(rows).select('*')
    if (error || !data) { console.error('[item cad copy]', error); return null }
    return data as RoomAnnotation[]
  }

  /** Library notes back into this cabinet's drawing to change, and cleared from the library. */
  async function editFromLibrary(t: ItemCadTarget) {
    if (!ctx || busy || !ctx.itemCad.targetItems(t, libView).length) return
    setBusy(true); setMsg(null)
    const data = await copyToCabinet([t])
    if (!data) { setMsg('Couldn’t bring the notes back.'); setBusy(false); return }
    const err = await ctx.itemCad.clearOwner(t, libView)
    if (err) {
      void dbDeleteAnnotations(data.map(r => r.id))
      setMsg(err); setBusy(false); return
    }
    ctx.captureSnapshot()
    ctx.setAnnotations(prev => [...prev, ...data])
    cad.setSelectedIds(new Set(data.map(a => a.id)))
    setOn(true)
    setMsg(`${t.label} notes are back on this cabinet to edit. Select them and Move to library again when done.`)
    setBusy(false)
  }

  function setHidden(id: string, hide: boolean) {
    if (!ctx) return
    const next = new Set(hidden)
    if (hide) next.add(id); else next.delete(id)
    ctx.setItemCadHidden(cabinet.id, [...next])
  }

  /** Detach: the library notes become this cabinet's own (editable, this job only) and the
   *  library ones are hidden here. Every front of that type on the cabinet gets its copy. */
  async function detach(t: ItemCadTarget) {
    if (!ctx || busy) return
    setBusy(true); setMsg(null)
    const data = await copyToCabinet(targets.filter(x => x.kind === t.kind && x.key === t.key))
    if (!data) { setMsg('Couldn’t detach the notes.'); setBusy(false); return }
    ctx.captureSnapshot()
    ctx.setAnnotations(prev => [...prev, ...data])
    setHidden(ownerId(t.kind, t.key), true)
    cad.setSelectedIds(new Set(data.map(a => a.id)))
    setOn(true)
    useTutorial.getState().emit('item_cad_detached')
    setMsg(`${t.label} notes detached: they're this cabinet's own now. Library changes won't reach them.`)
    setBusy(false)
  }

  async function removeFromLibrary(t: ItemCadTarget) {
    if (!ctx || busy) return
    setBusy(true); setMsg(null); setConfirmRemove(null)
    const err = await ctx.itemCad.clearOwner(t, libView)
    setMsg(err ?? `${t.label} item CAD removed. Jobs already drawn keep theirs.`)
    setBusy(false)
  }

  const btn = 'px-2 py-0.5 rounded border text-[11px] transition-colors disabled:opacity-40'
  const bar = !ctx || !viewOn ? null : (
    <div className="flex-none bg-gray-900 border-b border-gray-800 px-3 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400"
      onPointerDown={e => e.stopPropagation()}>
      <span className="text-rose-300 font-medium">Item CAD</span>
      {active ? (
        <span className="flex items-center gap-1.5">
          {selOwn.length ? `${selOwn.length} selected → Move to library:` : 'Draw notes, then select them to move to the library.'}
          {selOwn.length > 0 && distinctTargets(targets).map(t => (
            <button key={ownerId(t.kind, t.key)} disabled={busy} onClick={() => void moveToLibrary(t)}
              title={t.kind === 'front_type' ? `Every cabinet with a ${t.label.toLowerCase()} draws it` : `Every ${t.label} cabinet draws it`}
              className={`${btn} border-rose-700 text-rose-200 hover:bg-rose-900/50`}>
              {t.kind === 'front_type' ? `${t.label} (all cabinets)` : `${t.label} (this code)`}
            </button>
          ))}
          {selOwn.length > 0 && !targets.length && <span className="text-gray-500">this cabinet has no bin front or library code</span>}
        </span>
      ) : <span className="text-gray-500">F7 or CAD to draw on this cabinet.</span>}
      {distinctTargets(targets).filter(t => ctx.itemCad.targetItems(t, libView).length).map(t => {
        const id = ownerId(t.kind, t.key), n = ctx.itemCad.targetItems(t, libView).length, isHidden = hidden.has(id)
        return (
          <span key={id} className="flex items-center gap-1.5">
            <span className="text-gray-300">{t.label}: {n} note{n > 1 ? 's' : ''}{isHidden ? ' (hidden here)' : ''}</span>
            <button disabled={busy} onClick={() => setHidden(id, !isHidden)} title={isHidden ? 'Draw the library notes on this cabinet again' : 'Don’t draw the library notes on this cabinet (the library keeps them)'}
              className={`${btn} border-gray-600 text-gray-300 hover:bg-gray-800`}>{isHidden ? 'Show here' : 'Hide here'}</button>
            {!isHidden && <button disabled={busy} onClick={() => void detach(t)} title="Copy the notes onto this cabinet to change for this job only; the library ones are hidden here"
              className={`${btn} border-gray-600 text-gray-300 hover:bg-gray-800`}>Detach</button>}
            <button disabled={busy} onClick={() => void editFromLibrary(t)} title="Bring the library notes back onto this cabinet to change, then Move to library again"
              className={`${btn} border-gray-600 text-gray-300 hover:bg-gray-800`}>Edit</button>
            {confirmRemove === id
              ? <button disabled={busy} onClick={() => void removeFromLibrary(t)} className={`${btn} border-red-700 text-red-300 hover:bg-red-900/50`}>Remove from library?</button>
              : <button disabled={busy} onClick={() => setConfirmRemove(id)} className={`${btn} border-gray-600 text-gray-400 hover:bg-gray-800`}>Remove</button>}
          </span>
        )
      })}
      {msg && <span className="text-amber-300">{msg}</span>}
    </div>
  )

  const ribbon = active && ctx ? (
    <div className="flex-none w-64 border-r border-gray-800 bg-gray-900 overflow-y-auto" onPointerDown={e => e.stopPropagation()}>
      <CadRibbon cad={cad} viewSupported scale={ctx.scale} onScale={ctx.onScale} snap={ctx.snap} onSnap={ctx.onSnap} />
    </div>
  ) : null

  const panel = active && ctx ? (
    <CadPanel cad={cad} annotations={own} paper={paper} walls={ctx.walls} fieldValues={cabFields} blockSaveReq={0}
      onClose={() => setOn(false)} elevation={`${cabinet.label ?? 'Cabinet'} — ${SHEET_NAME[sheet]}`} itemFields={ITEM_CAD_FIELDS} sheet={sheet} />
  ) : null

  // Text editor + right-click menu (fixed-position, so they sit over the modal).
  const floating = active && ctx ? (
    <>
      <CadContextMenu cad={cad} annotations={own} zoom={zoom} />
      {cad.editing && (
        <AnnotTextEditor key={cad.editing.draft.id} editing={cad.editing} frame={frame} paper={paper} zoom={zoom}
          toClient={p => {
            const m = svgRef.current?.getScreenCTM()
            if (!m) return p
            const q = new DOMPoint(p.x, p.y).matrixTransform(m)
            return { x: q.x, y: q.y }
          }}
          onChange={cad.setEditText} onCommit={cad.commitEdit} onCancel={cad.cancelEdit} />
      )}
    </>
  ) : null

  return { available: !!ctx, on: active, toggle: () => setOn(v => !v), setOn, host, bar, ribbon, panel, floating }
}
