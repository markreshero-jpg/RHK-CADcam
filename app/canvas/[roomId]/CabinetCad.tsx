'use client'

// CAD in the Cabinet Edit modal (z_item_cad IC1). F7 / the CAD button on the Elevation
// tab draws notes on the cabinet's front with the room's CAD tools. Notes drawn here are
// "this cabinet only" (room_annotations, view cabinet_sheet / front) and show on the
// room elevation with the cabinet. "Move to library" turns selected notes into item
// CAD on a bin front or on the cabinet code, so every cabinet with one draws them.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CabinetInstance, Room, RoomAnnotation, Wall } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { cabinetSheetOwner, ownedBy } from '@/src/lib/annotations/owner'
import { mapPt, type AnnotFrame, type Box, type Pt } from '@/src/lib/annotations/geometry'
import { cadSnap, addOutline, type CadSnapSettings, type SnapGeometry } from '@/src/lib/annotations/cadSnap'
import { planSnapGeometry } from '@/src/lib/annotations/planSnapGeometry'
import { withFieldsFilled, annotationsBounds, type CadFieldValues } from '@/src/lib/annotations/blocks'
import { placeItemCad, asAnnotationRows, ownerId, type ItemCadTarget } from '@/src/lib/annotations/itemCad'
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
import { distinctTargets, type ItemCadApi } from './useItemCad'
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
}

const boxPts = (b: Box): Pt[] => [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }]
const centreOf = (b: Box): Pt => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 })
const inBox = (b: Box, p: Pt) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY

export function useCabinetCad({ ctx, cabinet, rp, viewOn, onEnter }: {
  ctx:     ModalCadContext | undefined
  cabinet: CabinetInstance
  rp:      ResolvedCabinet | undefined
  /** The Elevation tab is on show (the only view with CAD in IC1). */
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
  const owner = useMemo(() => cabinetSheetOwner(cabinet.id, 'front'), [cabinet.id])
  // Cabinet front frame (x from the left, y down from the bottom) → the view's svg.
  const frame = useMemo<AnnotFrame>(() => ({ ox: ELEV_PAD.pl, oy: ELEV_PAD.pt + cabinet.dy, s: 1, flipY: false }), [cabinet.dy])
  const zoom = 1 / unit
  const annotations = useMemo(() => ctx?.annotations ?? [], [ctx?.annotations])
  const own = useMemo(() => annotations.filter(a => ownedBy(a, owner)), [annotations, owner])

  // Snaps: the cabinet's outline + each front (corners, mids, centre) and the notes.
  const snapRoom = useMemo<SnapGeometry>(() => {
    const g: SnapGeometry = { segs: [], points: [] }
    addOutline(g, boxPts({ minX: 0, maxX: cabinet.dx, minY: -cabinet.dy, maxY: 0 }), 'cabinets', true, undefined, true)
    for (const z of rp?.face_zones ?? []) {
      if (z.face_type === 'open') continue
      const r = zoneElevRect(z)
      addOutline(g, boxPts({ minX: r.ex, maxX: r.ex + r.ew, minY: -r.ey, maxY: -(r.ey - r.eh) }), 'fronts', true, undefined, true)
    }
    return g
  }, [cabinet.dx, cabinet.dy, rp])
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

  // F7 toggles the modal's CAD on the Elevation tab (the canvas behind never sees it).
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
  const targets = useMemo(() => targetsFor ? targetsFor(cabinet, rp) : [], [targetsFor, cabinet, rp])
  const libraryNotes = useMemo(() => !ctx ? [] : targets.flatMap((t, i) =>
    asAnnotationRows(placeItemCad(ctx.itemCad.targetItems(t), t.box, paper), `itemcad:${cabinet.id}:${i}`, ctx.room.id)),
  [ctx, targets, paper, cabinet.id])

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
      <AnnotationLayer annotations={withFieldsFilled(libraryNotes, ctx.fields)} frame={frame} paper={paper} />
      <AnnotationLayer annotations={withFieldsFilled(cad.withEditing(own), ctx.fields)} frame={frame} paper={paper}
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
  const host: ModalCadHost = { on: active, overlay, setSvg, onUnit: setUnit }

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
    const err = await ctx.itemCad.saveToLibrary(target, selOwn)
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

  /** Library notes back into this cabinet's drawing to change, and cleared from the library. */
  async function editFromLibrary(t: ItemCadTarget) {
    if (!ctx || busy) return
    const items = placeItemCad(ctx.itemCad.targetItems(t), t.box, paper)
    if (!items.length) return
    setBusy(true); setMsg(null)
    const base = Math.max(0, ...own.map(a => a.sort_order)) + 1
    const rows = items.map((it, i) => ({
      id: crypto.randomUUID(), room_id: ctx.room.id, view: 'cabinet_sheet' as const, wall_id: null, wall_side: null,
      cabinet_id: cabinet.id, sheet_view: 'front' as const, kind: it.kind, geom: it.geom, text: it.text, style: it.style, sort_order: base + i,
    }))
    const { data, error } = await supabase.from('room_annotations').insert(rows).select('*')
    if (error || !data) { console.error('[item cad edit]', error); setMsg('Couldn’t bring the notes back.'); setBusy(false); return }
    const err = await ctx.itemCad.clearOwner(t)
    if (err) {
      void dbDeleteAnnotations(rows.map(r => r.id))
      setMsg(err); setBusy(false); return
    }
    ctx.captureSnapshot()
    ctx.setAnnotations(prev => [...prev, ...(data as RoomAnnotation[])])
    cad.setSelectedIds(new Set((data as RoomAnnotation[]).map(a => a.id)))
    setOn(true)
    setMsg(`${t.label} notes are back on this cabinet to edit. Select them and Move to library again when done.`)
    setBusy(false)
  }

  async function removeFromLibrary(t: ItemCadTarget) {
    if (!ctx || busy) return
    setBusy(true); setMsg(null); setConfirmRemove(null)
    const err = await ctx.itemCad.clearOwner(t)
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
      {distinctTargets(targets).filter(t => ctx.itemCad.targetItems(t).length).map(t => {
        const id = ownerId(t.kind, t.key), n = ctx.itemCad.targetItems(t).length
        return (
          <span key={id} className="flex items-center gap-1.5">
            <span className="text-gray-300">{t.label}: {n} note{n > 1 ? 's' : ''}</span>
            <button disabled={busy} onClick={() => void editFromLibrary(t)} className={`${btn} border-gray-600 text-gray-300 hover:bg-gray-800`}>Edit</button>
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
    <CadPanel cad={cad} annotations={own} paper={paper} walls={ctx.walls} fieldValues={ctx.fields} blockSaveReq={0}
      onClose={() => setOn(false)} elevation={`${cabinet.label ?? 'Cabinet'} — Front`} />
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
