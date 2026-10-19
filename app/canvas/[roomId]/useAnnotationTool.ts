'use client'

// CAD mode (F7) — annotation authoring on the plan (z_CAD_tool A2 + A3).
// Owns the CAD tool, the annotation selection, drags (move / rotate / text-box width /
// vertex / marquee / text placement), line + leader drawing, the inline text editor
// state, clipboard and keyboard.
// Every change takes one undo snapshot first (shared canvas history) and is saved to
// room_annotations straight away; style edits from the ribbon are debounced.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RoomAnnotation, AnnotationKind, Room } from '@/src/lib/types'
import {
  type AnnotFrame, type Pt, type TextGeom, type Box,
  type LineGeom, type BoxGeom,
  unmapPt, translateGeom, annotationFramePoints, boundsOf, boxesOverlap, layoutText, snapQuarter, rotatePt,
  segAngle, segLength, withLength, withAngle, withBoxSize,
  angleSnap, dedupePts, leaderTextAt, setBoxCorner, rectPts, dimOffsetFor, dimAxisFor, type DimGeom,
} from '@/src/lib/annotations/geometry'
import { resolveStyle, styleKeyOf, ARROW_TOOL, type AnnotationStyle, type ResolvedStyle, type StyleKey } from '@/src/lib/annotations/style'
import { getUserPrefs, setUserPrefs } from '@/src/lib/userPrefs'
import { supabase } from '@/src/lib/supabase'
import { dbUpdateAnnotation, dbDeleteAnnotations } from './canvasDB'
import type { AnnotationEditProps, AnnotGrip } from './AnnotationLayer'
import type { LiveMeasure } from './CadMeasureOverlay'

export type CadTool = 'select' | 'text' | 'textbox' | 'leader' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'cloud' | 'dim'

/** Manual dimension mode: linear = horizontal / vertical (picked from the pull), aligned = along the points. */
export type DimMode = 'linear' | 'aligned'

export const CAD_TOOL_KEYS: Record<string, CadTool> = {
  s: 'select', t: 'text', b: 'textbox', q: 'leader', l: 'line', a: 'arrow', r: 'rect', e: 'ellipse', c: 'cloud', d: 'dim',
}

/** Tools that drag out a shape on the canvas. */
type PlaceTool = 'text' | 'textbox' | 'rect' | 'ellipse' | 'cloud'

/** Kind of row a tool makes, and whose remembered style it starts from. */
const TOOL_KIND: Record<CadTool, AnnotationKind> = {
  select: 'text', text: 'text', textbox: 'text', leader: 'text', line: 'line', arrow: 'line', rect: 'rect', ellipse: 'ellipse', cloud: 'cloud', dim: 'dim',
}
const TOOL_STYLE_KEY: Record<CadTool, StyleKey> = {
  select: 'text', text: 'text', textbox: 'text', leader: 'text', line: 'line', arrow: 'arrow', rect: 'rect', ellipse: 'ellipse', cloud: 'cloud', dim: 'dim',
}

/** A line / arrow / leader being clicked out. attachId = adding a leader to that text. */
export interface AnnotDrawing {
  tool: 'line' | 'arrow' | 'leader' | 'cloud' | 'dim'; pts: Pt[]; cur: Pt | null; attachId?: string
  /** dim: the axis a linear dim is showing (sticky while the cursor is between the points). */
  axis?: 'x' | 'y'
}

/** Text being typed in the inline editor. `draft` is the row as it will be saved. */
export interface AnnotEditing { draft: RoomAnnotation; text: string; isNew: boolean }

type Drag =
  | { kind: 'move'; start: Pt; orig: Map<string, RoomAnnotation['geom']>; moved: boolean }
  | { kind: 'rotate'; id: string; origRot: number; startAng: number; moved: boolean }
  | { kind: 'width'; id: string; moved: boolean }
  // Text box bottom-right corner: width + height together (B1).
  | { kind: 'size'; id: string; moved: boolean }
  // Vertex of a line (pts) or a text's leader. insertAfter: a midpoint grip — the new
  // point is only added once the pointer actually moves.
  | { kind: 'vertex'; id: string; i: number; insertAfter?: number; moved: boolean }
  | { kind: 'marquee'; start: Pt; cur: Pt; additive: boolean }
  | { kind: 'place'; start: Pt; cur: Pt; tool: PlaceTool }
  // Corner of an unrotated box / ellipse (boxCorners order).
  | { kind: 'offset'; id: string; moved: boolean }
  | { kind: 'corner'; id: string; i: number; moved: boolean }

const DRAG_PX = 4
const MIN_BOX_PAPER = 8   // text box narrower than this (paper mm) = point text

// Survives CAD mode toggles and room switches within the tab.
let clipboard: RoomAnnotation[] = []
const NO_IDS: ReadonlySet<string> = new Set()

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
  /** CAD object snap in frame mm (B2). prev = the shape's previous point (perpendicular);
   *  exclude = annotation ids not to snap to (the one being edited). kind null = nothing
   *  snapped — lines then angle-lock to 15°. */
  snap:            (p: Pt, prev: Pt | null, exclude: ReadonlySet<string>) => { pt: Pt; kind: string | null }
  enterCad:        () => void
  exitCad:         () => void
}) {
  const [tool, setTool] = useState<CadTool>('select')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<AnnotEditing | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [drawing, setDrawing] = useState<AnnotDrawing | null>(null)
  const [dimMode, setDimMode] = useState<DimMode>('linear')
  // Cloud tool: drag / click-click a rectangle, or click the corners of a freehand one.
  const [cloudMode, setCloudMode] = useState<'rect' | 'free'>('rect')
  // Click-click placement (B1): first click armed the shape, the next click finishes it.
  const [pending, setPending] = useState<{ tool: PlaceTool; start: Pt; cur: Pt } | null>(null)
  const pendingRef = useRef(pending)
  useEffect(() => { pendingRef.current = pending }, [pending])
  const drawingRef = useRef<AnnotDrawing | null>(null)
  useEffect(() => { drawingRef.current = drawing }, [drawing])
  const dragRef = useRef<Drag | null>(null)
  const annRef = useRef(annotations)
  useEffect(() => { annRef.current = annotations }, [annotations])

  // frame mm per paper mm
  const k = paper / frame.s
  // What the cursor last snapped to — the canvas draws a marker there.
  const [snapHit, setSnapHit] = useState<{ pt: Pt; kind: string } | null>(null)
  // Cursor in frame mm (snapped when a snap is on) — the ribbon's X / Y readout.
  const [cursor, setCursor] = useState<Pt | null>(null)

  /** Pointer → frame mm. snapIt: object snaps; prev: perpendicular from it, or a 15° lock
   *  when nothing snapped; exclude: annotation ids to ignore. */
  const toFrame = useCallback((e: { clientX: number; clientY: number }, snapIt: boolean, prev?: Pt | null, exclude?: ReadonlySet<string>) => {
    const p = unmapPt(frame, toWorld(e))
    if (!snapIt) { setSnapHit(null); setCursor(p); return p }
    const r = snap(p, prev ?? null, exclude ?? NO_IDS)
    if (r.kind) { setSnapHit({ pt: r.pt, kind: r.kind }); setCursor(r.pt); return r.pt }
    setSnapHit(null)
    const out = prev ? angleSnap(prev, p) : p
    setCursor(out)
    return out
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
    if (!active) { setTool('select'); setDrawing(null) }
  }
  // A new tool abandons a half-drawn line.
  const [drawTool, setDrawTool] = useState(tool)
  if (drawTool !== tool) { setDrawTool(tool); setDrawing(null); setPending(null) }

  // ── Styles ────────────────────────────────────────────────────────────────

  const [prefsTick, setPrefsTick] = useState(0)
  const defaultsFor = useCallback((key: StyleKey): AnnotationStyle => {
    void prefsTick
    const saved = getUserPrefs().annotStyleDefaults[key] ?? {}
    return key === 'arrow' ? { ...ARROW_TOOL, ...saved } : saved
  }, [prefsTick])

  /** The style the ribbon shows: the edit in progress, else the first selected item,
   *  else the next new item's defaults. */
  const ribbonKind: AnnotationKind = editing?.draft.kind ?? selected[0]?.kind ?? TOOL_KIND[tool]
  const ribbonKey: StyleKey = editing ? styleKeyOf(editing.draft.kind, editing.draft.style)
    : selected[0] ? styleKeyOf(selected[0].kind, selected[0].style) : TOOL_STYLE_KEY[tool]
  const ribbonStyle: ResolvedStyle = useMemo(() => {
    if (editing) return resolveStyle(editing.draft.kind, editing.draft.style)
    if (selected[0]) return resolveStyle(selected[0].kind, selected[0].style)
    return resolveStyle(TOOL_KIND[tool], defaultsFor(TOOL_STYLE_KEY[tool]))
  }, [editing, selected, defaultsFor, tool])
  /** The selected / edited text has a leader (ribbon shows leader controls). */
  const ribbonLeader = editing ? !!(editing.draft.geom as TextGeom).leader?.length
    : selected[0]?.kind === 'text' ? !!(selected[0].geom as TextGeom).leader?.length : tool === 'leader'
  const rotatable = (a: RoomAnnotation) => a.kind === 'text' || a.kind === 'rect' || a.kind === 'ellipse'
  const ribbonRot: number | null = editing?.draft.kind === 'text'
    ? ((editing.draft.geom as TextGeom).rot ?? 0)
    : selected.length === 1 && rotatable(selected[0]) ? ((selected[0].geom as TextGeom | BoxGeom).rot ?? 0) : null

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

  const rememberDefaults = useCallback((key: StyleKey, patch: AnnotationStyle) => {
    const all = getUserPrefs().annotStyleDefaults
    setUserPrefs({ annotStyleDefaults: { ...all, [key]: { ...(all[key] ?? {}), ...patch } } })
    setPrefsTick(t => t + 1)
  }, [])

  const applyStyle = useCallback((patch: AnnotationStyle) => {
    rememberDefaults(ribbonKey, patch)
    if (editing) {   // saved with the text on commit
      setEditing(ed => ed && { ...ed, draft: { ...ed.draft, style: { ...ed.draft.style, ...patch } } })
      return
    }
    if (!liveSelected.size) return
    snapshotForBurst()
    setAnnotations(xs => xs.map(a => liveSelected.has(a.id) ? { ...a, style: { ...a.style, ...patch } } : a))
    for (const id of liveSelected) persistSoon(id)
  }, [editing, liveSelected, ribbonKey, rememberDefaults, snapshotForBurst, setAnnotations, persistSoon])

  const resetStyle = useCallback(() => {
    const all = getUserPrefs().annotStyleDefaults
    setUserPrefs({ annotStyleDefaults: { ...all, [ribbonKey]: {} } })
    setPrefsTick(t => t + 1)
    if (editing) { setEditing(ed => ed && { ...ed, draft: { ...ed.draft, style: {} } }); return }
    if (!liveSelected.size) return
    captureSnapshot()
    setAnnotations(xs => xs.map(a => liveSelected.has(a.id) ? { ...a, style: {} } : a))
    for (const id of liveSelected) persistSoon(id)
  }, [ribbonKey, editing, liveSelected, captureSnapshot, setAnnotations, persistSoon])

  const applyRotation = useCallback((deg: number) => {
    const rot = ((deg % 360) + 360) % 360
    if (editing) {
      setEditing(ed => ed && { ...ed, draft: { ...ed.draft, geom: { ...(ed.draft.geom as TextGeom), rot } } })
      return
    }
    const one = selected.length === 1 && rotatable(selected[0]) ? selected[0] : null
    if (!one) return
    snapshotForBurst()
    setAnnotations(xs => xs.map(a => a.id === one.id ? { ...a, geom: { ...(a.geom as TextGeom | BoxGeom), rot } } : a))
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

  /** Ribbon: a selected dim's text override ('' = the measured value; <> = the value). */
  const applyDimText = useCallback((text: string) => {
    const one = selected.length === 1 && selected[0].kind === 'dim' ? selected[0] : null
    if (!one) return
    snapshotForBurst()
    setAnnotations(xs => xs.map(a => a.id === one.id ? { ...a, text: text || null } : a))
    persistSoon(one.id)
  }, [selected, snapshotForBurst, setAnnotations, persistSoon])

  // ── Typed sizes (ribbon): a 2-point line's length / angle, a box / ellipse's W × H ──

  const oneLine = selected.length === 1 && selected[0].kind === 'line' && ((selected[0].geom as LineGeom).pts?.length === 2) ? selected[0] : null
  const oneBox = selected.length === 1 && (selected[0].kind === 'rect' || selected[0].kind === 'ellipse') ? selected[0] : null
  const ribbonSize = oneLine
    ? { kind: 'line' as const, length: segLength((oneLine.geom as LineGeom).pts[0], (oneLine.geom as LineGeom).pts[1]), angle: segAngle((oneLine.geom as LineGeom).pts[0], (oneLine.geom as LineGeom).pts[1]) }
    : oneBox
      ? { kind: 'box' as const, w: Math.abs((oneBox.geom as BoxGeom).b.x - (oneBox.geom as BoxGeom).a.x), h: Math.abs((oneBox.geom as BoxGeom).b.y - (oneBox.geom as BoxGeom).a.y) }
      : null

  const editGeom = useCallback((a: RoomAnnotation, geom: RoomAnnotation['geom']) => {
    snapshotForBurst()
    setAnnotations(xs => xs.map(x => x.id === a.id ? { ...x, geom } : x))
    persistSoon(a.id)
  }, [snapshotForBurst, setAnnotations, persistSoon])
  const applyLength = useCallback((n: number) => {
    if (!oneLine || !(n > 0)) return
    const [p, q] = (oneLine.geom as LineGeom).pts
    editGeom(oneLine, { pts: [p, withLength(p, q, n)] })
  }, [oneLine, editGeom])
  const applyAngle = useCallback((deg: number) => {
    if (!oneLine || !Number.isFinite(deg)) return
    const [p, q] = (oneLine.geom as LineGeom).pts
    editGeom(oneLine, { pts: [p, withAngle(p, q, deg)] })
  }, [oneLine, editGeom])
  const applyBoxSize = useCallback((w: number | null, h: number | null) => {
    if (!oneBox) return
    const g = oneBox.geom as BoxGeom
    const cw = Math.abs(g.b.x - g.a.x), ch = Math.abs(g.b.y - g.a.y)
    const nw = w != null && w > 0 ? w : cw, nh = h != null && h > 0 ? h : ch
    editGeom(oneBox, withBoxSize(g, nw, nh))
  }, [oneBox, editGeom])

  const cancelEdit = useCallback(() => setEditing(null), [])
  const setEditText = useCallback((text: string) => setEditing(ed => ed && { ...ed, text }), [])

  // Leaving CAD mode (sidebar button, view tab, ribbon ✕) moves focus off the editor,
  // and its blur commits — no separate exit hook needed.

  // ── Lines, arrows, leaders (A3) ───────────────────────────────────────────

  /** The dim a drawing would place with its line through `cur`. */
  const dimGeomFor = useCallback((d: AnnotDrawing, cur: Pt): DimGeom => {
    const [p1, p2] = d.pts
    const axis = dimMode === 'aligned' ? undefined : dimAxisFor(p1, p2, cur, d.axis)
    return { p1, p2, axis, offset: dimOffsetFor({ p1, p2, axis }, cur) }
  }, [dimMode])
  const dimRow = useCallback((d: AnnotDrawing, cur: Pt): RoomAnnotation | null => {
    const g = dimGeomFor(d, cur)
    const span = g.axis === 'x' ? Math.abs(g.p2.x - g.p1.x) : g.axis === 'y' ? Math.abs(g.p2.y - g.p1.y) : Math.hypot(g.p2.x - g.p1.x, g.p2.y - g.p1.y)
    if (span < 1e-6) return null
    return newRow('dim', g, null, defaultsFor('dim'))
  }, [dimGeomFor, newRow, defaultsFor])

  /** Finish the line / arrow being clicked out (Enter, double-click, right-click). */
  const finishDrawing = useCallback(() => {
    const d = drawingRef.current
    drawingRef.current = null
    setDrawing(null)
    if (!d || d.tool === 'leader') return
    if (d.tool === 'dim') {   // Enter with both points down places the dim where it's previewing
      const row = d.pts.length === 2 && d.cur ? dimRow(d, d.cur) : null
      if (row) { captureSnapshot(); setAnnotations(xs => [...xs, row]); void insertRows([row]) }
      return
    }
    const pts = dedupePts(d.pts, 1 / zoom / frame.s)
    const cloud = d.tool === 'cloud'
    if (pts.length < (cloud ? 3 : 2)) return
    const row = cloud
      ? newRow('cloud', { pts }, null, defaultsFor('cloud'))
      : newRow('line', { pts }, null, defaultsFor(d.tool === 'arrow' ? 'arrow' : 'line'))
    captureSnapshot()
    setAnnotations(xs => [...xs, row])
    void insertRows([row])
  }, [zoom, frame.s, newRow, defaultsFor, captureSnapshot, setAnnotations, insertRows, dimRow])

  /** Ribbon: point a leader from the selected text (next click = arrow tip). */
  const startAddLeader = useCallback(() => {
    const a = selected.length === 1 && selected[0].kind === 'text' ? selected[0] : null
    if (!a) return
    setTool('leader')
    setDrawTool('leader')
    const d: AnnotDrawing = { tool: 'leader', pts: [], cur: null, attachId: a.id }
    drawingRef.current = d; setDrawing(d)
  }, [selected])

  const removeLeader = useCallback(() => {
    const a = selected.length === 1 && selected[0].kind === 'text' ? selected[0] : null
    if (!a || !(a.geom as TextGeom).leader?.length) return
    captureSnapshot()
    const geom: TextGeom = { ...(a.geom as TextGeom) }
    delete geom.leader
    setAnnotations(xs => xs.map(x => x.id === a.id ? { ...x, geom } : x))
    void dbUpdateAnnotation(a.id, { geom })
  }, [selected, captureSnapshot, setAnnotations])

  /** A drawing click. Line / arrow: add a point. Leader: tip, then landing → type the note. */
  const drawClick = useCallback((p: Pt) => {
    const d = drawingRef.current
    const t = tool as AnnotDrawing['tool']
    if (!d) {
      const nd: AnnotDrawing = { tool: t, pts: [p], cur: p }
      drawingRef.current = nd; setDrawing(nd)
      return
    }
    if (d.tool === 'leader' && d.attachId) {   // adding a leader to existing text: one click = tip
      drawingRef.current = null; setDrawing(null)
      const a = annRef.current.find(x => x.id === d.attachId)
      setTool('select')
      if (!a) return
      captureSnapshot()
      const geom: TextGeom = { ...(a.geom as TextGeom), leader: [p] }
      setAnnotations(xs => xs.map(x => x.id === a.id ? { ...x, geom } : x))
      setSelectedIds(new Set([a.id]))
      void dbUpdateAnnotation(a.id, { geom })
      return
    }
    if (d.tool === 'dim') {   // second click = other end; third click = where the line sits
      if (d.pts.length < 2) {
        if (Math.hypot(p.x - d.pts[0].x, p.y - d.pts[0].y) < 1 / zoom / frame.s) return
        const nd = { ...d, pts: [d.pts[0], p], cur: p }
        drawingRef.current = nd; setDrawing(nd)
        return
      }
      drawingRef.current = null; setDrawing(null)
      const row = dimRow(d, p)
      if (row) { captureSnapshot(); setAnnotations(xs => [...xs, row]); void insertRows([row]) }
      return
    }
    if (d.tool === 'leader') {
      drawingRef.current = null; setDrawing(null)
      const tip = d.pts[0]
      if (Math.hypot(p.x - tip.x, p.y - tip.y) < 1 / zoom / frame.s) return
      const style = defaultsFor('text')
      const at = leaderTextAt(p, tip, resolveStyle('text', style).size, k)
      setSelectedIds(new Set())
      setEditing({ draft: newRow('text', { at, leader: [tip, p] }, '', style), text: '', isNew: true })
      return
    }
    const nd = { ...d, pts: [...d.pts, p], cur: p }
    drawingRef.current = nd; setDrawing(nd)
  }, [tool, zoom, frame.s, k, defaultsFor, newRow, captureSnapshot, setAnnotations, dimRow, insertRows])

  /** Finish a dragged / click-click shape from corner a to corner b. Text: a = the click. */
  const finishPlace = useCallback((t: PlaceTool, a: Pt, b: Pt) => {
    if (t === 'rect' || t === 'ellipse' || t === 'cloud') {
      const eps = 1 / zoom / frame.s
      if (Math.abs(b.x - a.x) < eps || Math.abs(b.y - a.y) < eps) return
      const geom = t === 'cloud' ? { pts: rectPts(a, b) } : { a, b }
      const row = newRow(t, geom, null, defaultsFor(t))
      captureSnapshot()
      setAnnotations(xs => [...xs, row])
      void insertRows([row])
      return
    }
    const wPaper = Math.abs(b.x - a.x) / k, hPaper = Math.abs(b.y - a.y) / k
    const box = t === 'textbox' && wPaper >= MIN_BOX_PAPER
    const at = box ? { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) } : a
    const half = (n: number) => Math.round(n * 2) / 2
    const geom: TextGeom = box ? { at, width: half(wPaper), ...(hPaper >= 3 ? { height: half(hPaper) } : {}) } : { at }
    setSelectedIds(new Set())
    setEditing({ draft: newRow('text', geom, '', defaultsFor('text')), text: '', isNew: true })
  }, [zoom, frame.s, k, newRow, defaultsFor, captureSnapshot, setAnnotations, insertRows])

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
        const p = toFrame(ev, !ev.shiftKey, null, new Set(cur.orig.keys()))
        const dx = p.x - cur.start.x, dy = p.y - cur.start.y
        setAnnotations(xs => xs.map(a => cur.orig.has(a.id) ? { ...a, geom: translateGeom(a.kind, cur.orig.get(a.id)!, dx, dy) } : a))
      } else if (cur.kind === 'rotate') {
        const a = annRef.current.find(x => x.id === cur.id); if (!a) return
        if (!cur.moved) { captureSnapshot(); cur.moved = true }
        const at = (a.geom as TextGeom).at, p = toFrame(ev, false)
        const ang = Math.atan2(p.y - at.y, p.x - at.x) * 180 / Math.PI
        const rot = ev.shiftKey ? Math.round(cur.origRot + ang - cur.startAng) : snapQuarter(cur.origRot + ang - cur.startAng)
        setAnnotations(xs => xs.map(x => x.id === cur.id ? { ...x, geom: { ...(x.geom as TextGeom), rot: ((rot % 360) + 360) % 360 } } : x))
      } else if (cur.kind === 'vertex') {
        const a = annRef.current.find(x => x.id === cur.id); if (!a) return
        if (!cur.moved && !far) return
        if (!cur.moved) {
          captureSnapshot(); cur.moved = true
          if (cur.insertAfter != null) {   // midpoint grip: the new vertex appears now
            const pts = [...vertsOf(a)]
            const i = cur.insertAfter, j = (i + 1) % pts.length   // a cloud's closing segment wraps
            pts.splice(i + 1, 0, { x: (pts[i].x + pts[j].x) / 2, y: (pts[i].y + pts[j].y) / 2 })
            setAnnotations(xs => xs.map(x => x.id === a.id ? withVerts(x, pts) : x))
            annRef.current = annRef.current.map(x => x.id === a.id ? withVerts(x, pts) : x)
            cur.i = i + 1; cur.insertAfter = undefined
          }
        }
        const a2 = annRef.current.find(x => x.id === cur.id)!
        const pts = [...vertsOf(a2)]
        const prev = pts[cur.i - 1] ?? pts[cur.i + 1] ?? null
        pts[cur.i] = toFrame(ev, !ev.shiftKey, prev, new Set([cur.id]))
        setAnnotations(xs => xs.map(x => x.id === cur.id ? withVerts(x, pts) : x))
      } else if (cur.kind === 'offset') {
        if (!cur.moved && !far) return
        if (!cur.moved) { captureSnapshot(); cur.moved = true }
        const p = toFrame(ev, !ev.shiftKey, null, new Set([cur.id]))
        setAnnotations(xs => xs.map(x => x.id === cur.id ? { ...x, geom: { ...(x.geom as DimGeom), offset: dimOffsetFor(x.geom as DimGeom, p) } } : x))
      } else if (cur.kind === 'corner') {
        if (!cur.moved && !far) return
        if (!cur.moved) { captureSnapshot(); cur.moved = true }
        const p = toFrame(ev, !ev.shiftKey, null, new Set([cur.id]))
        setAnnotations(xs => xs.map(x => x.id === cur.id ? { ...x, geom: setBoxCorner(x.geom as BoxGeom, cur.i, p) } : x))
      } else if (cur.kind === 'size') {
        const a = annRef.current.find(x => x.id === cur.id); if (!a) return
        if (!cur.moved) { captureSnapshot(); cur.moved = true }
        const g = a.geom as TextGeom, p = toFrame(ev, !ev.shiftKey, null, new Set([cur.id]))
        const local = rotatePt({ x: p.x - g.at.x, y: p.y - g.at.y }, -(g.rot ?? 0))
        const width = Math.max(MIN_BOX_PAPER, Math.round(local.x / k * 2) / 2)
        const height = Math.max(3, Math.round(local.y / k * 2) / 2)
        setAnnotations(xs => xs.map(x => x.id === cur.id ? { ...x, geom: { ...(x.geom as TextGeom), width, height } } : x))
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
      dragRef.current = null; setDrag(null); setSnapHit(null)
      if (!cur) return
      if ((cur.kind === 'move' || cur.kind === 'rotate' || cur.kind === 'width' || cur.kind === 'vertex' || cur.kind === 'corner' || cur.kind === 'offset' || cur.kind === 'size') && cur.moved) {
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
        // A drag finishes the shape now; a plain click arms it and the next click finishes
        // it (B1). Point text opens its editor on the click; a freehand cloud starts here.
        const far = Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y) >= DRAG_PX
        if (far) { finishPlace(cur.tool, cur.start, cur.cur); return }
        if (cur.tool === 'text') { finishPlace('text', cur.start, cur.start); return }
        if (cur.tool === 'cloud' && cloudMode === 'free') {
          const nd: AnnotDrawing = { tool: 'cloud', pts: [cur.start], cur: cur.start }
          drawingRef.current = nd; setDrawing(nd)
          return
        }
        const pd = { tool: cur.tool, start: cur.start, cur: cur.start }
        pendingRef.current = pd; setPending(pd)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [captureSnapshot, toFrame, setAnnotations, k, finishPlace, cloudMode])

  /** Empty canvas under CAD mode: place text / click out lines / start a marquee. */
  const onCaptureDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    // No default mousedown: its focus move would blur a text editor this click opens
    // (the B1 leader bug — the note committed empty before you could type).
    e.preventDefault()
    if (editing) { commitEdit(); return }   // first click outside the editor just finishes it
    const pd = pendingRef.current
    if (pd) {   // second click of a click-click shape
      pendingRef.current = null; setPending(null)
      finishPlace(pd.tool, pd.start, toFrame(e, !e.shiftKey))
      return
    }
    if (tool === 'line' || tool === 'arrow' || tool === 'leader' || tool === 'dim' || (tool === 'cloud' && drawingRef.current)) {
      const d = drawingRef.current
      drawClick(toFrame(e, !e.shiftKey, d?.pts[d.pts.length - 1]))
      return
    }
    const p = toFrame(e, tool !== 'select' && !e.shiftKey)
    if (tool === 'select') beginDrag({ kind: 'marquee', start: p, cur: p, additive: e.shiftKey }, { x: e.clientX, y: e.clientY })
    else beginDrag({ kind: 'place', start: p, cur: p, tool: tool as PlaceTool }, { x: e.clientX, y: e.clientY })
  }, [editing, commitEdit, toFrame, tool, beginDrag, drawClick, finishPlace])

  /** Rubber band for the segment being drawn. */
  const onCaptureMove = useCallback((e: React.PointerEvent) => {
    const pd = pendingRef.current
    if (pd) {
      const np = { ...pd, cur: toFrame(e, !e.shiftKey) }
      pendingRef.current = np; setPending(np)
      return
    }
    const d = drawingRef.current
    if (!d) {   // hovering: a drawing tool shows what the first click would snap to
      if (tool !== 'select' && !editing) toFrame(e, !e.shiftKey)
      else setCursor(unmapPt(frame, toWorld(e)))
      return
    }
    // A dim's third point only places the line: snap, but no 15° lock off the second point.
    const placing = d.tool === 'dim' && d.pts.length === 2
    const cur = toFrame(e, !e.shiftKey, placing ? null : d.pts[d.pts.length - 1])
    const axis = placing && dimMode === 'linear' ? dimAxisFor(d.pts[0], d.pts[1], cur, d.axis) : d.axis
    const nd = { ...d, cur, axis }
    drawingRef.current = nd; setDrawing(nd)
  }, [toFrame, dimMode, tool, editing, frame, toWorld])

  const onCaptureDouble = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const t = drawingRef.current?.tool
    if (t && t !== 'leader' && t !== 'dim') finishDrawing()
  }, [finishDrawing])

  const onCaptureMenu = useCallback((e: React.MouseEvent) => {
    if (!drawingRef.current) return
    e.preventDefault(); e.stopPropagation()
    finishDrawing()
  }, [finishDrawing])

  const editProps: AnnotationEditProps = {
    selectedIds: liveSelected,
    hiddenId: editing ? editing.draft.id : null,
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
      if (!a) return
      if (grip === 'offset') {
        beginDrag({ kind: 'offset', id, moved: false }, { x: e.clientX, y: e.clientY })
        return
      }
      if (grip.startsWith('c')) {
        beginDrag({ kind: 'corner', id, i: Number(grip.slice(1)), moved: false }, { x: e.clientX, y: e.clientY })
        return
      }
      if (grip.startsWith('v') || grip.startsWith('m')) {
        const i = Number(grip.slice(1))
        beginDrag(grip.startsWith('v')
          ? { kind: 'vertex', id, i, moved: false }
          : { kind: 'vertex', id, i, insertAfter: i, moved: false }, { x: e.clientX, y: e.clientY })
        return
      }
      if (a.kind !== 'text') return
      if (grip === 'rotate') {
        const at = (a.geom as TextGeom).at, p = toFrame(e, false)
        beginDrag({ kind: 'rotate', id, origRot: (a.geom as TextGeom).rot ?? 0,
          startAng: Math.atan2(p.y - at.y, p.x - at.x) * 180 / Math.PI, moved: false }, { x: e.clientX, y: e.clientY })
      } else if (grip === 'size') beginDrag({ kind: 'size', id, moved: false }, { x: e.clientX, y: e.clientY })
      else beginDrag({ kind: 'width', id, moved: false }, { x: e.clientX, y: e.clientY })
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
        if (pendingRef.current) { pendingRef.current = null; setPending(null); return }
        if (drawingRef.current) { drawingRef.current = null; setDrawing(null); return }
        if (liveSelected.size) setSelectedIds(new Set())
        else if (tool !== 'select') setTool('select')
        else exitCad()
        return
      }
      if (mod && (e.key === 'c' || e.key === 'C')) { take(); clipboard = selected; return }
      if (mod && (e.key === 'v' || e.key === 'V')) { take(); paste(clipboard); return }
      if (mod && (e.key === 'd' || e.key === 'D')) { take(); paste(selected); return }
      if (mod && (e.key === 'a' || e.key === 'A')) { take(); setSelectedIds(new Set(annRef.current.filter(a => a.view === 'plan').map(a => a.id))); return }
      if (e.key === 'Enter' && drawingRef.current) { take(); finishDrawing(); return }
      if (e.key === 'Backspace' && drawingRef.current && drawingRef.current.pts.length > 1) {   // step back one point
        take()
        const d = drawingRef.current
        const nd = { ...d, pts: d.pts.slice(0, -1) }
        drawingRef.current = nd; setDrawing(nd)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { take(); deleteSelected(); return }
      if (e.key === 'Enter' && selected.length === 1 && selected[0].kind === 'text') { take(); startEdit(selected[0]); return }
      if (!mod && !e.altKey) {
        const t = CAD_TOOL_KEYS[e.key.toLowerCase()]
        if (t) { take(); setTool(t) }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, liveSelected, selected, tool, deleteSelected, paste, startEdit, exitCad, finishDrawing])

  // Ghosts for the canvas: marquee box / text box being dragged out (frame coords).
  // A shape being placed: by drag, or armed by a first click (B1).
  const placing = drag?.kind === 'place' ? { tool: drag.tool, start: drag.start, cur: drag.cur } : pending
  const ghost = drag?.kind === 'marquee' ? { kind: 'marquee' as const, a: drag.start, b: drag.cur }
    : placing?.tool === 'textbox' ? { kind: 'place' as const, a: placing.start, b: placing.cur }
    : null

  // Live readout while drawing: the segment being placed, or the box being dragged out
  // (a dim's last click only places its line, which shows its own value).
  const lastPt = drawing?.pts.length ? drawing.pts[drawing.pts.length - 1] : null
  const liveMeasure: LiveMeasure = drawing?.cur && lastPt && !(drawing.tool === 'dim' && drawing.pts.length === 2)
    ? { mode: 'seg', a: lastPt, b: drawing.cur }
    : placing && (placing.start.x !== placing.cur.x || placing.start.y !== placing.cur.y) && placing.tool !== 'text'
      ? { mode: 'box', a: placing.start, b: placing.cur }
      : null

  // The line / arrow / leader being drawn, as a row the layer can draw (frame coords).
  // A box / ellipse / cloud being dragged out previews as the real shape.
  const drawPreview: RoomAnnotation | null = useMemo(() => {
    const row = (kind: AnnotationKind, geom: RoomAnnotation['geom'], style: AnnotationStyle): RoomAnnotation => ({
      id: '__draw__', room_id: room.id, view: 'plan', wall_id: null, cabinet_id: null, sheet_view: null,
      kind, geom, text: null, style, sort_order: 0, created_at: '', updated_at: '',
    })
    const pl = drag?.kind === 'place' ? drag : pending
    if (pl && (pl.tool === 'rect' || pl.tool === 'ellipse' || pl.tool === 'cloud')) {
      if (pl.start.x === pl.cur.x && pl.start.y === pl.cur.y) return null
      return pl.tool === 'cloud'
        ? row('cloud', { pts: rectPts(pl.start, pl.cur) }, defaultsFor('cloud'))
        : row(pl.tool, { a: pl.start, b: pl.cur }, defaultsFor(pl.tool))
    }
    if (!drawing || !drawing.pts.length) return null
    if (drawing.tool === 'dim') {
      if (drawing.pts.length === 2 && drawing.cur) return row('dim', dimGeomFor(drawing, drawing.cur), defaultsFor('dim'))
      return drawing.cur ? row('line', { pts: [drawing.pts[0], drawing.cur] }, { ...defaultsFor('dim'), arrowStart: 'none', arrowEnd: 'none', dash: 'dashed' }) : null
    }
    const pts = drawing.cur ? [...drawing.pts, drawing.cur] : drawing.pts
    if (drawing.tool === 'cloud') {
      return pts.length >= 3 ? row('cloud', { pts }, defaultsFor('cloud')) : row('line', { pts }, defaultsFor('cloud'))
    }
    const style = drawing.tool === 'leader'
      ? { ...defaultsFor('text'), arrowEnd: 'none' as const }
      : defaultsFor(drawing.tool === 'arrow' ? 'arrow' : 'line')
    return row('line', { pts }, style)
  }, [drag, pending, drawing, defaultsFor, room.id, dimGeomFor])

  /** The list to draw: the note being typed swaps in live (new ones are added), so its
   *  leader shows and follows the text width while you type. */
  const withEditing = useCallback((list: RoomAnnotation[]): RoomAnnotation[] => {
    if (!editing) return list
    const live = { ...editing.draft, text: editing.text }
    return editing.isNew ? [...list, live] : list.map(a => a.id === live.id ? live : a)
  }, [editing])

  return {
    tool, setTool, selected, withEditing, selectedIds: liveSelected, setSelectedIds,
    editing, setEditText, commitEdit, cancelEdit,
    ribbonKind, ribbonStyle, ribbonRot, ribbonLeader, applyStyle, resetStyle, applyRotation,
    deleteSelected, reorder, onCaptureDown, onCaptureMove, onCaptureDouble, onCaptureMenu, editProps, ghost,
    drawing, drawPreview, finishDrawing, startAddLeader, removeLeader,
    dimMode, setDimMode, applyDimText, cloudMode, setCloudMode, pending,
    /** Last object snap under the cursor (frame mm) — the canvas draws its marker. */
    snapHit: active ? snapHit : null,
    /** Cursor (frame mm) + the point Δ is measured from while drawing. */
    cursor: active ? cursor : null,
    fromPt: drawing?.pts.length ? drawing.pts[drawing.pts.length - 1] : pending ? pending.start : null,
    ribbonSize, applyLength, applyAngle, applyBoxSize, liveMeasure,
    /** Text block size helper for the editor overlay. */
    layoutFor: (a: RoomAnnotation, text: string) => {
      const s = resolveStyle(a.kind, a.style)
      return layoutText(text, s.size, { bold: s.bold, lineSpacing: s.lineSpacing, width: (a.geom as TextGeom).width, height: (a.geom as TextGeom).height })
    },
  }
}

export type AnnotationTool = ReturnType<typeof useAnnotationTool>

/** Editable vertices: a line's points, or a text's leader. */
function vertsOf(a: RoomAnnotation): Pt[] {
  if (a.kind === 'dim') { const g = a.geom as DimGeom; return [g.p1, g.p2] }
  if (a.kind === 'line' || a.kind === 'cloud') return (a.geom as LineGeom).pts ?? []
  if (a.kind === 'text') return (a.geom as TextGeom).leader ?? []
  return []
}
function withVerts(a: RoomAnnotation, pts: Pt[]): RoomAnnotation {
  if (a.kind === 'dim') return { ...a, geom: { ...(a.geom as DimGeom), p1: pts[0], p2: pts[1] } }
  if (a.kind === 'line' || a.kind === 'cloud') return { ...a, geom: { ...(a.geom as LineGeom), pts } }
  if (a.kind === 'text') return { ...a, geom: { ...(a.geom as TextGeom), leader: pts } }
  return a
}
