'use client'

// CAD mode (F7) — annotation authoring on the plan (z_CAD_tool A2).
// Owns the CAD tool, the annotation selection, drags (move / rotate / text-box width /
// marquee / text placement), the inline text editor state, clipboard and keyboard.
// Every change takes one undo snapshot first (shared canvas history) and is saved to
// room_annotations straight away; style edits from the ribbon are debounced.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RoomAnnotation, AnnotationKind, Room } from '@/src/lib/types'
import {
  type AnnotFrame, type Pt, type TextGeom, type Box,
  unmapPt, translateGeom, annotationFramePoints, boundsOf, boxesOverlap, layoutText, snapQuarter, rotatePt,
} from '@/src/lib/annotations/geometry'
import { resolveStyle, type AnnotationStyle, type ResolvedStyle } from '@/src/lib/annotations/style'
import { getUserPrefs, setUserPrefs } from '@/src/lib/userPrefs'
import { supabase } from '@/src/lib/supabase'
import { dbUpdateAnnotation, dbDeleteAnnotations } from './canvasDB'
import type { AnnotationEditProps, AnnotGrip } from './AnnotationLayer'

export type CadTool = 'select' | 'text' | 'textbox'

export const CAD_TOOL_KEYS: Record<string, CadTool> = { s: 'select', t: 'text', b: 'textbox' }

/** Text being typed in the inline editor. `draft` is the row as it will be saved. */
export interface AnnotEditing { draft: RoomAnnotation; text: string; isNew: boolean }

type Drag =
  | { kind: 'move'; start: Pt; orig: Map<string, RoomAnnotation['geom']>; moved: boolean }
  | { kind: 'rotate'; id: string; origRot: number; startAng: number; moved: boolean }
  | { kind: 'width'; id: string; moved: boolean }
  | { kind: 'marquee'; start: Pt; cur: Pt; additive: boolean }
  | { kind: 'place'; start: Pt; cur: Pt; tool: 'text' | 'textbox' }

const DRAG_PX = 4
const MIN_BOX_PAPER = 8   // text box narrower than this (paper mm) = point text

// Survives CAD mode toggles and room switches within the tab.
let clipboard: RoomAnnotation[] = []

export function useAnnotationTool({
  room, annotations, setAnnotations, captureSnapshot, frame, paper, zoom, active,
  toWorld, snap, enterCad, exitCad,
}: {
  room:            Room
  annotations:     RoomAnnotation[]
  setAnnotations:  React.Dispatch<React.SetStateAction<RoomAnnotation[]>>
  captureSnapshot: () => void
  frame:           AnnotFrame
  /** svg units per paper mm (the room's annotation scale on the plan). */
  paper:           number
  zoom:            number
  /** CAD mode is on and this view takes annotation clicks. */
  active:          boolean
  toWorld:         (e: { clientX: number; clientY: number }) => Pt
  snap:            (wp: Pt) => Pt
  enterCad:        () => void
  exitCad:         () => void
}) {
  const [tool, setTool] = useState<CadTool>('select')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<AnnotEditing | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const annRef = useRef(annotations)
  useEffect(() => { annRef.current = annotations }, [annotations])

  // frame mm per paper mm
  const k = paper / frame.s
  const toFrame = useCallback((e: { clientX: number; clientY: number }, snapIt: boolean) => {
    const wp = toWorld(e)
    return unmapPt(frame, snapIt ? snap(wp) : wp)
  }, [toWorld, snap, frame])

  // Drop ids that vanished (undo, delete elsewhere).
  const liveSelected = useMemo(() => {
    const ids = new Set(annotations.map(a => a.id))
    return new Set([...selectedIds].filter(id => ids.has(id)))
  }, [annotations, selectedIds])
  const selected = useMemo(() => annotations.filter(a => liveSelected.has(a.id)), [annotations, liveSelected])

  // Leaving CAD mode drops the tool back to Select and ends any edit.
  // (State adjusted during render, React's pattern for "reset when a prop changes".)
  const [wasActive, setWasActive] = useState(active)
  if (wasActive !== active) {
    setWasActive(active)
    if (!active) setTool('select')
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const [prefsTick, setPrefsTick] = useState(0)
  const defaultsFor = useCallback((kind: AnnotationKind): AnnotationStyle => {
    void prefsTick
    return getUserPrefs().annotStyleDefaults[kind] ?? {}
  }, [prefsTick])

  /** The style the ribbon shows: the edit in progress, else the first selected item,
   *  else the next new item's defaults. */
  const ribbonKind: AnnotationKind = editing?.draft.kind ?? selected[0]?.kind ?? 'text'
  const ribbonStyle: ResolvedStyle = useMemo(() => {
    if (editing) return resolveStyle(editing.draft.kind, editing.draft.style)
    if (selected[0]) return resolveStyle(selected[0].kind, selected[0].style)
    return resolveStyle('text', defaultsFor('text'))
  }, [editing, selected, defaultsFor])
  const ribbonRot: number | null = editing?.draft.kind === 'text'
    ? ((editing.draft.geom as TextGeom).rot ?? 0)
    : selected.length === 1 && selected[0].kind === 'text' ? ((selected[0].geom as TextGeom).rot ?? 0) : null

  const lastStyleEdit = useRef(0)
  const persistTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const persistSoon = useCallback((id: string) => {
    const t = persistTimers.current.get(id)
    if (t) clearTimeout(t)
    persistTimers.current.set(id, setTimeout(() => {
      persistTimers.current.delete(id)
      const a = annRef.current.find(x => x.id === id)
      if (a) void dbUpdateAnnotation(id, { geom: a.geom, style: a.style, text: a.text, sort_order: a.sort_order })
    }, 400))
  }, [])
  // One undo step per burst of edits (a colour picker drag fires dozens).
  const snapshotForBurst = useCallback(() => {
    const now = Date.now()
    if (now - lastStyleEdit.current > 800) captureSnapshot()
    lastStyleEdit.current = now
  }, [captureSnapshot])

  const rememberDefaults = useCallback((kind: AnnotationKind, patch: AnnotationStyle) => {
    const all = getUserPrefs().annotStyleDefaults
    setUserPrefs({ annotStyleDefaults: { ...all, [kind]: { ...(all[kind] ?? {}), ...patch } } })
    setPrefsTick(t => t + 1)
  }, [])

  const applyStyle = useCallback((patch: AnnotationStyle) => {
    rememberDefaults(ribbonKind, patch)
    if (editing) {   // saved with the text on commit
      setEditing(ed => ed && { ...ed, draft: { ...ed.draft, style: { ...ed.draft.style, ...patch } } })
      return
    }
    if (!liveSelected.size) return
    snapshotForBurst()
    setAnnotations(xs => xs.map(a => liveSelected.has(a.id) ? { ...a, style: { ...a.style, ...patch } } : a))
    for (const id of liveSelected) persistSoon(id)
  }, [editing, liveSelected, ribbonKind, rememberDefaults, snapshotForBurst, setAnnotations, persistSoon])

  const resetStyle = useCallback(() => {
    const all = getUserPrefs().annotStyleDefaults
    setUserPrefs({ annotStyleDefaults: { ...all, [ribbonKind]: {} } })
    setPrefsTick(t => t + 1)
    if (editing) { setEditing(ed => ed && { ...ed, draft: { ...ed.draft, style: {} } }); return }
    if (!liveSelected.size) return
    captureSnapshot()
    setAnnotations(xs => xs.map(a => liveSelected.has(a.id) ? { ...a, style: {} } : a))
    for (const id of liveSelected) persistSoon(id)
  }, [ribbonKind, editing, liveSelected, captureSnapshot, setAnnotations, persistSoon])

  const applyRotation = useCallback((deg: number) => {
    const rot = ((deg % 360) + 360) % 360
    if (editing) {
      setEditing(ed => ed && { ...ed, draft: { ...ed.draft, geom: { ...(ed.draft.geom as TextGeom), rot } } })
      return
    }
    const one = selected.length === 1 && selected[0].kind === 'text' ? selected[0] : null
    if (!one) return
    snapshotForBurst()
    setAnnotations(xs => xs.map(a => a.id === one.id ? { ...a, geom: { ...(a.geom as TextGeom), rot } } : a))
    persistSoon(one.id)
  }, [editing, selected, snapshotForBurst, setAnnotations, persistSoon])

  // ── Create / delete / order ───────────────────────────────────────────────

  const nextOrder = () => Math.max(0, ...annRef.current.map(a => a.sort_order)) + 1

  const newRow = useCallback((kind: AnnotationKind, geom: RoomAnnotation['geom'], text: string | null, style: AnnotationStyle): RoomAnnotation => {
    const now = new Date().toISOString()
    return {
      id: crypto.randomUUID(), room_id: room.id, view: 'plan', wall_id: null, cabinet_id: null, sheet_view: null,
      kind, geom, text, style, sort_order: nextOrder(), created_at: now, updated_at: now,
    }
  }, [room.id])

  const insertRows = useCallback(async (rows: RoomAnnotation[]) => {
    if (!rows.length) return
    const { error } = await supabase.from('room_annotations').insert(rows)
    if (error) console.error('[annotation insert]', error)
  }, [])

  const deleteSelected = useCallback(() => {
    if (!liveSelected.size) return
    captureSnapshot()
    const ids = [...liveSelected]
    setAnnotations(xs => xs.filter(a => !liveSelected.has(a.id)))
    setSelectedIds(new Set())
    void dbDeleteAnnotations(ids)
  }, [liveSelected, captureSnapshot, setAnnotations])

  const reorder = useCallback((to: 'front' | 'back') => {
    if (!liveSelected.size) return
    captureSnapshot()
    const orders = annRef.current.map(a => a.sort_order)
    let n = to === 'front' ? Math.max(0, ...orders) + 1 : Math.min(0, ...orders) - liveSelected.size
    const updated = new Map<string, number>()
    for (const a of [...annRef.current].sort((x, y) => x.sort_order - y.sort_order))
      if (liveSelected.has(a.id)) updated.set(a.id, n++)
    setAnnotations(xs => xs.map(a => updated.has(a.id) ? { ...a, sort_order: updated.get(a.id)! } : a))
    for (const [id, sort_order] of updated) void dbUpdateAnnotation(id, { sort_order })
  }, [liveSelected, captureSnapshot, setAnnotations])

  const paste = useCallback((src: RoomAnnotation[]) => {
    if (!src.length) return
    captureSnapshot()
    const off = 5 * k
    let order = nextOrder()
    const rows = src.map(a => ({ ...newRow(a.kind, translateGeom(a.kind, a.geom, off, off), a.text, a.style), sort_order: order++ }))
    setAnnotations(xs => [...xs, ...rows])
    setSelectedIds(new Set(rows.map(r => r.id)))
    clipboard = rows
    void insertRows(rows)
  }, [k, captureSnapshot, newRow, setAnnotations, insertRows])

  // ── Inline text editor ────────────────────────────────────────────────────

  const startEdit = useCallback((a: RoomAnnotation) => {
    if (a.kind !== 'text') return
    setSelectedIds(new Set([a.id]))
    setEditing({ draft: a, text: a.text ?? '', isNew: false })
  }, [])

  // Read through a ref: commit runs side effects (snapshot, insert), which must not sit
  // inside a state updater (StrictMode runs those twice).
  const editingRef = useRef(editing)
  useEffect(() => { editingRef.current = editing }, [editing])

  const commitEdit = useCallback(() => {
    const ed = editingRef.current
    editingRef.current = null
    setEditing(null)
    if (!ed) return
    const text = ed.text.replace(/\s+$/, '')
    if (ed.isNew) {
      if (!text.trim()) return
      const row = { ...ed.draft, text, sort_order: nextOrder() }
      captureSnapshot()
      setAnnotations(xs => [...xs, row])
      setSelectedIds(new Set([row.id]))
      void insertRows([row])
      return
    }
    const orig = annRef.current.find(a => a.id === ed.draft.id)
    if (!orig) return
    if (!text.trim()) {
      captureSnapshot()
      setAnnotations(xs => xs.filter(a => a.id !== orig.id))
      void dbDeleteAnnotations([orig.id])
      return
    }
    const next = { ...orig, text, style: ed.draft.style, geom: ed.draft.geom }
    if (JSON.stringify([orig.text, orig.style, orig.geom]) !== JSON.stringify([next.text, next.style, next.geom])) {
      captureSnapshot()
      setAnnotations(xs => xs.map(a => a.id === orig.id ? next : a))
      void dbUpdateAnnotation(orig.id, { text, style: next.style, geom: next.geom })
    }
  }, [captureSnapshot, setAnnotations, insertRows])

  const cancelEdit = useCallback(() => setEditing(null), [])
  const setEditText = useCallback((text: string) => setEditing(ed => ed && { ...ed, text }), [])

  // Leaving CAD mode (sidebar button, view tab, ribbon ✕) moves focus off the editor,
  // and its blur commits — no separate exit hook needed.

  // ── Pointer: drags via window listeners ───────────────────────────────────

  const beginDrag = useCallback((d: Drag, startClient: { x: number; y: number }) => {
    dragRef.current = d; setDrag(d)
    const move = (ev: PointerEvent) => {
      const cur = dragRef.current
      if (!cur) return
      const far = Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y) >= DRAG_PX
      if (cur.kind === 'move') {
        if (!cur.moved && !far) return
        if (!cur.moved) { captureSnapshot(); cur.moved = true }
        const p = toFrame(ev, !ev.shiftKey)
        const dx = p.x - cur.start.x, dy = p.y - cur.start.y
        setAnnotations(xs => xs.map(a => cur.orig.has(a.id) ? { ...a, geom: translateGeom(a.kind, cur.orig.get(a.id)!, dx, dy) } : a))
      } else if (cur.kind === 'rotate') {
        const a = annRef.current.find(x => x.id === cur.id); if (!a) return
        if (!cur.moved) { captureSnapshot(); cur.moved = true }
        const at = (a.geom as TextGeom).at, p = toFrame(ev, false)
        const ang = Math.atan2(p.y - at.y, p.x - at.x) * 180 / Math.PI
        const rot = ev.shiftKey ? Math.round(cur.origRot + ang - cur.startAng) : snapQuarter(cur.origRot + ang - cur.startAng)
        setAnnotations(xs => xs.map(x => x.id === cur.id ? { ...x, geom: { ...(x.geom as TextGeom), rot: ((rot % 360) + 360) % 360 } } : x))
      } else if (cur.kind === 'width') {
        const a = annRef.current.find(x => x.id === cur.id); if (!a) return
        if (!cur.moved) { captureSnapshot(); cur.moved = true }
        const g = a.geom as TextGeom, p = toFrame(ev, false)
        const local = rotatePt({ x: p.x - g.at.x, y: p.y - g.at.y }, -(g.rot ?? 0))
        const width = Math.max(MIN_BOX_PAPER, Math.round(local.x / k * 2) / 2)
        setAnnotations(xs => xs.map(x => x.id === cur.id ? { ...x, geom: { ...(x.geom as TextGeom), width } } : x))
      } else {
        const p = toFrame(ev, cur.kind === 'place' && !ev.shiftKey)
        const next = { ...cur, cur: p }
        dragRef.current = next; setDrag(next)
      }
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const cur = dragRef.current
      dragRef.current = null; setDrag(null)
      if (!cur) return
      if ((cur.kind === 'move' || cur.kind === 'rotate' || cur.kind === 'width') && cur.moved) {
        const ids = cur.kind === 'move' ? [...cur.orig.keys()] : [cur.id]
        for (const id of ids) {
          const a = annRef.current.find(x => x.id === id)
          if (a) void dbUpdateAnnotation(id, { geom: a.geom })
        }
      } else if (cur.kind === 'marquee') {
        const far = Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y) >= DRAG_PX
        if (!far) { if (!cur.additive) setSelectedIds(new Set()); return }
        const box: Box = {
          minX: Math.min(cur.start.x, cur.cur.x), maxX: Math.max(cur.start.x, cur.cur.x),
          minY: Math.min(cur.start.y, cur.cur.y), maxY: Math.max(cur.start.y, cur.cur.y),
        }
        const hit = annRef.current.filter(a => {
          if (a.view !== 'plan') return false
          const b = boundsOf(annotationFramePoints(a.kind, a.geom, a.text, resolveStyle(a.kind, a.style).size, k))
          return b && boxesOverlap(b, box)
        }).map(a => a.id)
        setSelectedIds(prev => new Set(cur.additive ? [...prev, ...hit] : hit))
      } else if (cur.kind === 'place') {
        const wPaper = Math.abs(cur.cur.x - cur.start.x) / k
        const box = cur.tool === 'textbox' && wPaper >= MIN_BOX_PAPER
        const at = box ? { x: Math.min(cur.start.x, cur.cur.x), y: Math.min(cur.start.y, cur.cur.y) } : cur.start
        const geom: TextGeom = box ? { at, width: Math.round(wPaper * 2) / 2 } : { at }
        setSelectedIds(new Set())
        setEditing({ draft: newRow('text', geom, '', defaultsFor('text')), text: '', isNew: true })
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [captureSnapshot, toFrame, setAnnotations, k, newRow, defaultsFor])

  /** Empty canvas under CAD mode: place text / start a marquee. */
  const onCaptureDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    if (editing) { commitEdit(); return }   // first click outside the editor just finishes it
    const p = toFrame(e, tool !== 'select' && !e.shiftKey)
    if (tool === 'select') beginDrag({ kind: 'marquee', start: p, cur: p, additive: e.shiftKey }, { x: e.clientX, y: e.clientY })
    else beginDrag({ kind: 'place', start: p, cur: p, tool }, { x: e.clientX, y: e.clientY })
  }, [editing, commitEdit, toFrame, tool, beginDrag])

  const editProps: AnnotationEditProps = {
    selectedIds: liveSelected,
    hiddenId: editing && !editing.isNew ? editing.draft.id : null,
    hitWidth: 10 / zoom,
    // In plain select mode a click on an annotation opens CAD mode on it (decision 9).
    hittable: !active || tool === 'select',
    onDown: (e, id) => {
      e.stopPropagation()
      if (editing) commitEdit()
      if (!active) enterCad()
      const additive = e.shiftKey
      let sel = liveSelected
      if (additive) {
        sel = new Set(liveSelected)
        if (sel.has(id)) sel.delete(id); else sel.add(id)
      } else if (!sel.has(id)) sel = new Set([id])
      setSelectedIds(sel)
      if (!sel.has(id)) return
      const orig = new Map(annRef.current.filter(a => sel.has(a.id)).map(a => [a.id, a.geom]))
      beginDrag({ kind: 'move', start: toFrame(e, !e.shiftKey), orig, moved: false }, { x: e.clientX, y: e.clientY })
    },
    onDouble: (e, id) => {
      e.stopPropagation()
      const a = annRef.current.find(x => x.id === id)
      if (a) { if (!active) enterCad(); startEdit(a) }
    },
    onGrip: (e, id, grip: AnnotGrip) => {
      const a = annRef.current.find(x => x.id === id)
      if (!a || a.kind !== 'text') return
      if (grip === 'rotate') {
        const at = (a.geom as TextGeom).at, p = toFrame(e, false)
        beginDrag({ kind: 'rotate', id, origRot: (a.geom as TextGeom).rot ?? 0,
          startAng: Math.atan2(p.y - at.y, p.x - at.x) * 180 / Math.PI, moved: false }, { x: e.clientX, y: e.clientY })
      } else beginDrag({ kind: 'width', id, moved: false }, { x: e.clientX, y: e.clientY })
    },
  }

  // ── Keyboard (capture phase, so the canvas-wide handler never sees these) ──

  useEffect(() => {
    if (!active) return
    const isInput = (t: EventTarget | null) =>
      t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement
    const onKey = (e: KeyboardEvent) => {
      if (isInput(e.target)) return
      const mod = e.ctrlKey || e.metaKey
      const take = () => { e.preventDefault(); e.stopPropagation() }
      if (e.key === 'Escape') {
        take()
        if (dragRef.current) return
        if (liveSelected.size) setSelectedIds(new Set())
        else if (tool !== 'select') setTool('select')
        else exitCad()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { take(); deleteSelected(); return }
      if (mod && (e.key === 'c' || e.key === 'C')) { take(); clipboard = selected; return }
      if (mod && (e.key === 'v' || e.key === 'V')) { take(); paste(clipboard); return }
      if (mod && (e.key === 'd' || e.key === 'D')) { take(); paste(selected); return }
      if (mod && (e.key === 'a' || e.key === 'A')) { take(); setSelectedIds(new Set(annRef.current.filter(a => a.view === 'plan').map(a => a.id))); return }
      if (e.key === 'Enter' && selected.length === 1 && selected[0].kind === 'text') { take(); startEdit(selected[0]); return }
      if (!mod && !e.altKey) {
        const t = CAD_TOOL_KEYS[e.key.toLowerCase()]
        if (t) { take(); setTool(t) }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, liveSelected, selected, tool, deleteSelected, paste, startEdit, exitCad])

  // Ghosts for the canvas: marquee box / text box being dragged out (frame coords).
  const ghost = drag && (drag.kind === 'marquee' || (drag.kind === 'place' && drag.tool === 'textbox'))
    ? { kind: drag.kind, a: drag.start, b: drag.cur }
    : null

  return {
    tool, setTool, selected, selectedIds: liveSelected, setSelectedIds,
    editing, setEditText, commitEdit, cancelEdit,
    ribbonKind, ribbonStyle, ribbonRot, applyStyle, resetStyle, applyRotation,
    deleteSelected, reorder, onCaptureDown, editProps, ghost,
    /** Text block size helper for the editor overlay. */
    layoutFor: (a: RoomAnnotation, text: string) => {
      const s = resolveStyle(a.kind, a.style)
      return layoutText(text, s.size, { bold: s.bold, lineSpacing: s.lineSpacing, width: (a.geom as TextGeom).width })
    },
  }
}

export type AnnotationTool = ReturnType<typeof useAnnotationTool>
