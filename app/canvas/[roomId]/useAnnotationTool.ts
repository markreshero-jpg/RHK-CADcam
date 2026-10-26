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
  angleSnap, dedupePts, leaderTextAt, type ArcGeom, type CircleGeom,
  offsetDistanceFor, offsetGeom, moveEdge, edgeDistanceFor, OFFSETTABLE, type OffsetKind,
  filletAt, chamferAt, allCorners, joinPolys, cornerJoin, boxToPoly, nearestSegIndex, type Poly,
  bulgeArc, isSpecialDim, chainedDim, type SpecialDim,
  arcFrom3, arcFromCentre, arcFromEndsRadius, arcPoint, angOf, arcStart, arcMid, arcEnd, sweepOf, setBoxCorner, rectPts, dimOffsetFor, dimAxisFor, type DimGeom,
} from '@/src/lib/annotations/geometry'
import { resolveStyle, styleKeyOf, ARROW_TOOL, type AnnotationStyle, type ResolvedStyle, type StyleKey } from '@/src/lib/annotations/style'
import { ownShapeGeometry, type SnapGeometry } from '@/src/lib/annotations/cadSnap'
import { ownedBy, ownerColumns, ownerKey, type AnnotOwner } from '@/src/lib/annotations/owner'
import { getUserPrefs, setUserPrefs } from '@/src/lib/userPrefs'
import { supabase } from '@/src/lib/supabase'
import { dbUpdateAnnotation, dbDeleteAnnotations } from './canvasDB'
import type { AnnotationEditProps, AnnotGrip } from './AnnotationLayer'
import type { LiveMeasure } from './CadMeasureOverlay'

export type CadTool = 'select' | 'text' | 'textbox' | 'leader' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'cloud' | 'dim' | 'arc' | 'circle' | 'offset' | 'fillet' | 'chamfer' | 'join'

/** How the Arc tool draws (B3): start / through / end, centre / start / end, or two ends + radius. */
export type ArcMode = '3pt' | 'centre' | 'ends'

/** Manual dimension mode: linear = horizontal / vertical (picked from the pull), aligned = along the points. */
export type DimMode = 'linear' | 'aligned' | 'angular' | 'radius' | 'diameter' | 'arclen' | 'continue' | 'baseline'
/** Dimension modes that start by clicking something rather than a point (B5). */
export const PICK_DIM_MODES = new Set<DimMode>(['radius', 'diameter', 'arclen', 'continue', 'baseline'])
/** The circle / arc a radial or arc-length dim measures (a0 / a1 only for arcs). */
export interface ArcSource { c: Pt; r: number; a0?: number; a1?: number }

export const CAD_TOOL_KEYS: Record<string, CadTool> = {
  s: 'select', t: 'text', b: 'textbox', q: 'leader', l: 'line', a: 'arrow', r: 'rect', e: 'ellipse', c: 'cloud', d: 'dim', k: 'arc', o: 'circle', f: 'offset', g: 'fillet', h: 'chamfer', j: 'join',
}

/** Tools that drag out a shape on the canvas. */
type PlaceTool = 'text' | 'textbox' | 'rect' | 'ellipse' | 'cloud'
const PLACE_TOOLS = new Set<CadTool>(['text', 'textbox', 'rect', 'ellipse', 'cloud'])

/** Tools that click out points one by one (each click → drawClick). A freehand cloud
 *  joins them once it has started. Every drawing tool must be here or in PLACE_TOOLS. */
const POINT_TOOLS = new Set<CadTool>(['line', 'arrow', 'leader', 'dim', 'arc', 'circle'])
export function clickRoute(tool: CadTool, drawingActive: boolean): 'point' | 'place' | 'marquee' | 'offset' | 'modify' | 'none' {
  if (tool === 'select') return 'marquee'
  if (tool === 'offset') return 'offset'
  if (tool === 'fillet' || tool === 'chamfer' || tool === 'join') return 'modify'   // picks come through the items' hit areas
  if (POINT_TOOLS.has(tool) || (tool === 'cloud' && drawingActive)) return 'point'
  return PLACE_TOOLS.has(tool) ? 'place' : 'none'
}

/** Kind of row a tool makes, and whose remembered style it starts from. */
const TOOL_KIND: Record<CadTool, AnnotationKind> = {
  select: 'text', text: 'text', textbox: 'text', leader: 'text', line: 'line', arrow: 'line', rect: 'rect', ellipse: 'ellipse', cloud: 'cloud', dim: 'dim', arc: 'arc', circle: 'circle', offset: 'line', fillet: 'line', chamfer: 'line', join: 'line',
}
const TOOL_STYLE_KEY: Record<CadTool, StyleKey> = {
  select: 'text', text: 'text', textbox: 'text', leader: 'text', line: 'line', arrow: 'arrow', rect: 'rect', ellipse: 'ellipse', cloud: 'cloud', dim: 'dim', arc: 'arc', circle: 'circle', offset: 'line', fillet: 'line', chamfer: 'line', join: 'line',
}

/** A line / arrow / leader being clicked out. attachId = adding a leader to that text. */
export interface AnnotDrawing {
  tool: 'line' | 'arrow' | 'leader' | 'cloud' | 'dim' | 'arc' | 'circle'; pts: Pt[]; cur: Pt | null; attachId?: string
  /** arc: the method chosen when it started. */
  arcMode?: ArcMode
  /** dim (B5): the type chosen when it started; src = the circle / arc a radial dim measures. */
  dimType?: DimMode
  src?: ArcSource
  /** dim: the axis a linear dim is showing (sticky while the cursor is between the points). */
  axis?: 'x' | 'y'
}

/** Typed sizes while drawing (Tab → the CAD panel's fields). Set values lock the shape:
 *  a segment's length / angle, a box's W / H, a dim's offset. Before the first click,
 *  x / y lock where the shape starts. */
export interface TypedEntry { length?: number; angle?: number; w?: number; h?: number; offset?: number; radius?: number; sweep?: number; distance?: number; x?: number; y?: number }

/** A line or box as a polyline (fillet / chamfer / join work on these). */
export function polyOfAnnotation(a: RoomAnnotation): Poly | null {
  if (a.kind === 'line') return { ...(a.geom as LineGeom) }
  if (a.kind === 'rect') return boxToPoly(a.geom as BoxGeom)
  return null
}

/** Offset tool (B4): the signed distance for a copy of `src` through p; a typed distance
 *  keeps the cursor's side. */
export function offsetDist(src: RoomAnnotation, p: Pt, t: TypedEntry): number {
  const d0 = offsetDistanceFor(src.kind as OffsetKind, src.geom, p)
  return t.distance != null ? Math.sign(d0 || 1) * Math.abs(t.distance) : d0
}
export type TypedField = keyof TypedEntry
const hasTyped = (t: TypedEntry) => Object.values(t).some(v => v != null)
/** The first click's point with a typed X / Y locked in (unset parts follow the cursor). */
export const typedStart = (raw: Pt, t: TypedEntry): Pt => ({ x: t.x ?? raw.x, y: t.y ?? raw.y })
const hasTypedStart = (t: TypedEntry) => t.x != null || t.y != null
/** Tools whose first click is a point that X / Y can be typed for. */
export function startTypable(tool: CadTool, dimMode: DimMode): boolean {
  return (POINT_TOOLS.has(tool) || PLACE_TOOLS.has(tool)) && !(tool === 'dim' && PICK_DIM_MODES.has(dimMode))
}

/** The segment end from `last` with typed length / angle; unset parts follow the cursor. */
export function typedSeg(last: Pt, raw: Pt, t: TypedEntry): Pt {
  if (t.length == null && t.angle == null) return raw
  const L = t.length ?? segLength(last, raw)
  return withAngle(last, { x: last.x + L, y: last.y }, t.angle ?? segAngle(last, raw))
}
/** The point being placed, with whatever's typed locked in. */
export function lockPoint(d: AnnotDrawing, raw: Pt, t: TypedEntry): Pt {
  const n = d.pts.length
  if (!n) return raw
  if (d.tool === 'dim' && n === 2) return raw                      // offset is applied to the dim itself
  if (d.tool === 'circle') return t.radius != null ? withLength(d.pts[0], raw, t.radius) : raw
  if (d.tool === 'arc' && n === 2) {
    if (d.arcMode === 'centre' && t.sweep != null) {                  // end = start turned anticlockwise on screen
      const c = d.pts[0], s = d.pts[1]
      return arcPoint({ c, r: segLength(c, s) }, angOf(c, s) - t.sweep)
    }
    return raw                                                       // 'ends' radius is applied when building
  }
  return typedSeg(d.pts[n - 1], raw, t)
}

/** Size fields offered for what's being drawn, in Tab order. */
export function typedFieldsFor(pendingActive: boolean, d: AnnotDrawing | null): TypedField[] {
  if (pendingActive) return ['w', 'h']
  if (!d || !d.pts.length || d.attachId) return []
  const n = d.pts.length
  if (d.tool === 'dim' && d.dimType && d.dimType !== 'linear' && d.dimType !== 'aligned') return []
  if (d.tool === 'dim' && n === 2) return ['offset']
  if (d.tool === 'circle') return ['radius']
  if (d.tool === 'arc' && n === 2) return d.arcMode === 'centre' ? ['sweep'] : d.arcMode === 'ends' ? ['radius'] : []
  return ['length', 'angle']
}

/** The arc a drawing makes with its last point at p (B3). */
export function arcFromDrawing(d: AnnotDrawing, p: Pt, t: TypedEntry): ArcGeom | null {
  const [a, b] = d.pts
  if (!a || !b) return null
  if (d.arcMode === 'centre') return arcFromCentre(a, b, p)
  if (d.arcMode === 'ends') return t.radius != null ? arcFromEndsRadius(a, b, t.radius, p) : arcFrom3(a, p, b)
  return arcFrom3(a, b, p)
}

/** The opposite corner from `start` with typed W / H; the cursor picks the direction. */
export function typedBox(start: Pt, raw: Pt, t: TypedEntry): Pt {
  const sx = raw.x >= start.x ? 1 : -1, sy = raw.y >= start.y ? 1 : -1
  return {
    x: t.w != null ? start.x + sx * t.w : raw.x,
    y: t.h != null ? start.y + sy * t.h : raw.y,
  }
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
  // B5: where an angular / radial dim's arc or text sits.
  | { kind: 'dimAt'; id: string; moved: boolean }
  // Arc end / middle (re-bent through the three points) or a circle's radius grip (B3).
  | { kind: 'arcGrip'; id: string; which: 'arcS' | 'arcE' | 'arcM' | 'rad'; moved: boolean }
  // Side i slid parallel (B4) — from the geometry and grab point at the start.
  | { kind: 'edge'; id: string; i: number; start: Pt; orig: RoomAnnotation['geom']; moved: boolean }
  | { kind: 'corner'; id: string; i: number; moved: boolean }

const DRAG_PX = 4
const MIN_BOX_PAPER = 8   // text box narrower than this (paper mm) = point text

// Survives CAD mode toggles and room switches within the tab.
let clipboard: RoomAnnotation[] = []
const NO_IDS: ReadonlySet<string> = new Set()

/** Where the tool saves what it draws (z_cabinet_shape_edit E4a). Default: the
 *  room_annotations table. Edit shape plugs in a store that writes the cabinet's
 *  footprint instead, so the same tools draw / edit it. */
export interface AnnotStore {
  insert: (rows: RoomAnnotation[]) => void | Promise<void>
  update: (id: string, patch: Parameters<typeof dbUpdateAnnotation>[1]) => void | Promise<void>
  remove: (ids: string[]) => void | Promise<void>
}
export const DB_ANNOT_STORE: AnnotStore = {
  async insert(rows) {
    if (!rows.length) return
    const { error } = await supabase.from('room_annotations').insert(rows)
    if (error) console.error('[annotation insert]', error)
  },
  update: dbUpdateAnnotation,
  remove: dbDeleteAnnotations,
}

export function useAnnotationTool({
  room, annotations, setAnnotations, captureSnapshot, owner, frame, paper, zoom, active,
  toWorld, snap, enterCad, exitCad, store, tools,
}: {
  room:            Room
  /** The drawing being annotated (plan, or one side of one wall — A6): new notes go to
   *  it, and marquee / Ctrl+A only pick its notes. */
  owner:           AnnotOwner
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
  /** own = targets on the shape being drawn / edited (it is excluded from the notes set). */
  snap:            (p: Pt, prev: Pt | null, exclude: ReadonlySet<string>, own?: SnapGeometry) => { pt: Pt; kind: string | null }
  enterCad:        () => void
  exitCad:         () => void
  /** Where new / changed / deleted items are saved (default: room_annotations). */
  store?:          AnnotStore
  /** Only these tools can be picked (default: all) — Edit shape offers the outline tools. */
  tools?:          ReadonlySet<CadTool>
}) {
  const storeRef = useRef<AnnotStore>(store ?? DB_ANNOT_STORE)
  useEffect(() => { storeRef.current = store ?? DB_ANNOT_STORE }, [store])
  const [tool, setToolState] = useState<CadTool>('select')
  const setTool = useCallback((t: CadTool) => { if (t === 'select' || !tools || tools.has(t)) setToolState(t) }, [tools])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<AnnotEditing | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [drawing, setDrawing] = useState<AnnotDrawing | null>(null)
  const [dimMode, setDimModeState] = useState<DimMode>('linear')
  // B5: the continue / baseline chain (first dim + latest), and the last dim drawn.
  const [chain, setChain] = useState<{ rootId: string; prevId: string } | null>(null)
  const [lastDimId, setLastDimId] = useState<string | null>(null)
  const [arcMode, setArcMode] = useState<ArcMode>('3pt')
  // Offset tool (B4): the item being offset (the last copy, after a placement) + cursor.
  const [offsetSrc, setOffsetSrcState] = useState<string | null>(null)
  const offsetSrcRef = useRef<string | null>(null)
  const setOffsetSrc = useCallback((id: string | null) => { offsetSrcRef.current = id; setOffsetSrcState(id) }, [])
  const [offsetCur, setOffsetCur] = useState<Pt | null>(null)
  // Fillet / chamfer / join (B4b): settings, the first pick, a status message; right-click menu.
  const [filletR, setFilletR] = useState(50)
  const [chamfer, setChamfer] = useState<{ d1: number; d2: number }>({ d1: 50, d2: 50 })
  const [modPick, setModPick] = useState<{ id: string; pt: Pt } | null>(null)
  const [modMsg, setModMsg] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; id: string; pt: Pt } | null>(null)
  // Typed entry (Tab): values + the raw cursor they're applied to, and focus requests for
  // the CAD panel's fields.
  const [typed, setTypedState] = useState<TypedEntry>({})
  const typedRef = useRef<TypedEntry>({})
  const rawCursorRef = useRef<Pt | null>(null)
  const [focusReq, setFocusReq] = useState<{ field: TypedField; n: number; seed?: string } | null>(null)
  // Several selected: Tab → the panel's X field (then Y) to move them by their extents' top-left.
  const [selFocusReq, setSelFocusReq] = useState<{ n: number; seed?: string } | null>(null)
  // Cloud tool: drag / click-click a rectangle, or click the corners of a freehand one.
  const [cloudMode, setCloudMode] = useState<'rect' | 'free'>('rect')
  // Click-click placement (B1): first click armed the shape, the next click finishes it.
  const [pending, setPending] = useState<{ tool: PlaceTool; start: Pt; cur: Pt } | null>(null)
  const pendingRef = useRef(pending)
  useEffect(() => { pendingRef.current = pending }, [pending])
  const drawingRef = useRef<AnnotDrawing | null>(null)
  useEffect(() => { drawingRef.current = drawing }, [drawing])
  /** Changing the dim type drops a half-picked radial dim and any chain. */
  const setDimMode = useCallback((m: DimMode) => {
    setDimModeState(m); setChain(null); drawingRef.current = null; setDrawing(null); setModMsg(null)
  }, [])
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
   *  when nothing snapped; exclude: annotation ids to ignore; own: the edited shape's own
   *  points (default: the line being drawn, so it snaps to its earlier points). */
  const toFrame = useCallback((e: { clientX: number; clientY: number }, snapIt: boolean, prev?: Pt | null, exclude?: ReadonlySet<string>, own?: SnapGeometry) => {
    const p = unmapPt(frame, toWorld(e))
    if (!snapIt) { setSnapHit(null); setCursor(p); return p }
    const r = snap(p, prev ?? null, exclude ?? NO_IDS, own ?? drawingSnapGeometry(drawingRef.current))
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
  // Another drawing (plan ↔ an elevation, another wall / side): drop what was going on.
  const [drawingOf, setDrawingOf] = useState(ownerKey(owner))
  if (drawingOf !== ownerKey(owner)) {
    setDrawingOf(ownerKey(owner))
    setSelectedIds(new Set()); setDrawing(null); setPending(null); setEditing(null); setOffsetSrcState(null); setModPick(null); setChain(null)
  }
  // A new tool abandons a half-drawn line.
  const [drawTool, setDrawTool] = useState(tool)
  if (drawTool !== tool) { setDrawTool(tool); setDrawing(null); setPending(null); setTypedState({}); setOffsetSrcState(null); setModPick(null); setModMsg(null); setChain(null) }

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
      if (a) void storeRef.current.update(id, { geom: a.geom, style: a.style, text: a.text, sort_order: a.sort_order })
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
      id: crypto.randomUUID(), room_id: room.id, ...ownerColumns(owner),
      kind, geom, text, style, sort_order: nextOrder(), created_at: now, updated_at: now,
    }
  }, [room.id, owner])

  const insertRows = useCallback(async (rows: RoomAnnotation[]) => {
    if (!rows.length) return
    await storeRef.current.insert(rows)
  }, [])

  const deleteSelected = useCallback(() => {
    if (!liveSelected.size) return
    captureSnapshot()
    const ids = [...liveSelected]
    setAnnotations(xs => xs.filter(a => !liveSelected.has(a.id)))
    setSelectedIds(new Set())
    void storeRef.current.remove(ids)
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
    for (const [id, sort_order] of updated) void storeRef.current.update(id, { sort_order })
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

  /** Drop items (already in frame mm, e.g. a placed CAD block) in as new notes,
   *  selected so they can be dragged into place. */
  const insertItems = useCallback((items: { kind: AnnotationKind; geom: RoomAnnotation['geom']; text: string | null; style: AnnotationStyle }[]) => {
    if (!items.length) return
    captureSnapshot()
    let order = nextOrder()
    const rows = items.map(it => ({ ...newRow(it.kind, it.geom, it.text, it.style), sort_order: order++ }))
    setAnnotations(xs => [...xs, ...rows])
    setSelectedIds(new Set(rows.map(r => r.id)))
    void insertRows(rows)
  }, [captureSnapshot, newRow, setAnnotations, insertRows])

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
      void storeRef.current.remove([orig.id])
      return
    }
    const next = { ...orig, text, style: ed.draft.style, geom: ed.draft.geom }
    if (JSON.stringify([orig.text, orig.style, orig.geom]) !== JSON.stringify([next.text, next.style, next.geom])) {
      captureSnapshot()
      setAnnotations(xs => xs.map(a => a.id === orig.id ? next : a))
      void storeRef.current.update(orig.id, { text, style: next.style, geom: next.geom })
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

  /** CAD panel: move the selection so its extents' top-left lands on x / y (either may
   *  be left out). One undo step, saved now. */
  const moveSelectionTo = useCallback((x: number | null, y: number | null) => {
    const sel = annRef.current.filter(a => liveSelected.has(a.id))
    const b = boundsOf(sel.flatMap(a => annotationFramePoints(a.kind, a.geom, a.text, resolveStyle(a.kind, a.style).size, k)))
    if (!b) return
    const dx = x != null ? x - b.minX : 0, dy = y != null ? y - b.minY : 0
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return
    captureSnapshot()
    const moved = new Map(sel.map(a => [a.id, translateGeom(a.kind, a.geom, dx, dy)]))
    setAnnotations(xs => xs.map(a => moved.has(a.id) ? { ...a, geom: moved.get(a.id)! } : a))
    for (const [id, geom] of moved) void storeRef.current.update(id, { geom })
  }, [liveSelected, k, captureSnapshot, setAnnotations])

  /** CAD panel: replace one item's geometry (a typed coordinate). One undo step, saved now. */
  const patchGeom = useCallback((id: string, geom: RoomAnnotation['geom']) => {
    if (!annRef.current.some(x => x.id === id)) return
    captureSnapshot()
    setAnnotations(xs => xs.map(x => x.id === id ? { ...x, geom } : x))
    void storeRef.current.update(id, { geom })
  }, [captureSnapshot, setAnnotations])

  const cancelEdit = useCallback(() => setEditing(null), [])
  const setEditText = useCallback((text: string) => setEditing(ed => ed && { ...ed, text }), [])

  // Leaving CAD mode (sidebar button, view tab, ribbon ✕) moves focus off the editor,
  // and its blur commits — no separate exit hook needed.

  // ── Lines, arrows, leaders (A3) ───────────────────────────────────────────

  /** The dim a drawing would place with its line through `cur`. */
  const dimGeomFor = useCallback((d: AnnotDrawing, cur: Pt): DimGeom => {
    const [p1, p2] = d.pts
    const axis = dimMode === 'aligned' ? undefined : dimAxisFor(p1, p2, cur, d.axis)
    const offset = dimOffsetFor({ p1, p2, axis }, cur)
    // A typed offset keeps the side the cursor is on.
    return { p1, p2, axis, offset: typed.offset != null ? Math.sign(offset || 1) * Math.abs(typed.offset) : offset }
  }, [dimMode, typed.offset])
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
    if (!d || d.tool === 'leader' || d.tool === 'arc' || d.tool === 'circle') return   // unfinished: nothing to keep
    if (d.tool === 'dim') {   // Enter with both points down places the dim where it's previewing
      const row = d.pts.length === 2 && d.cur ? dimRow(d, d.cur) : null
      if (row) setLastDimId(row.id)
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
    void storeRef.current.update(a.id, { geom })
  }, [selected, captureSnapshot, setAnnotations])

  /** A drawing click. Line / arrow: add a point. Leader: tip, then landing → type the note. */
  const drawClick = useCallback((p: Pt) => {
    const d = drawingRef.current
    const t = tool as AnnotDrawing['tool']
    if (!d) {
      const nd: AnnotDrawing = { tool: t, pts: [p], cur: p, arcMode: t === 'arc' ? arcMode : undefined, dimType: t === 'dim' ? dimMode : undefined }
      drawingRef.current = nd; setDrawing(nd)
      return
    }
    const eps = 1 / zoom / frame.s
    if (d.tool === 'circle') {   // centre, then a point on the circle
      drawingRef.current = null; setDrawing(null)
      const r = segLength(d.pts[0], p)
      if (r < eps) return
      const row = newRow('circle', { c: d.pts[0], r }, null, defaultsFor('circle'))
      captureSnapshot(); setAnnotations(xs => [...xs, row]); void insertRows([row])
      return
    }
    if (d.tool === 'arc') {      // three clicks; what they mean depends on the arc mode
      if (d.pts.length < 2) {
        if (segLength(d.pts[d.pts.length - 1], p) < eps) return
        const nd = { ...d, pts: [...d.pts, p], cur: p }
        drawingRef.current = nd; setDrawing(nd)
        return
      }
      drawingRef.current = null; setDrawing(null)
      const g = arcFromDrawing(d, p, typedRef.current)
      if (!g || g.r < eps) return
      const row = newRow('arc', g, null, defaultsFor('arc'))
      captureSnapshot(); setAnnotations(xs => [...xs, row]); void insertRows([row])
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
      void storeRef.current.update(a.id, { geom })
      return
    }
    if (d.tool === 'dim' && d.dimType === 'angular') {   // corner, a point on each side, then where the arc sits
      if (d.pts.length < 3) {
        if (segLength(d.pts[d.pts.length - 1], p) < 1 / zoom / frame.s) return
        const nd = { ...d, pts: [...d.pts, p], cur: p }
        drawingRef.current = nd; setDrawing(nd)
        return
      }
      drawingRef.current = null; setDrawing(null)
      const row = newRow('dim', { dt: 'angular', c: d.pts[0], a: d.pts[1], b: d.pts[2], at: p }, null, defaultsFor('dim'))
      captureSnapshot(); setAnnotations(xs => [...xs, row]); void insertRows([row])
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
      if (row) setLastDimId(row.id)
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
  }, [tool, zoom, frame.s, k, defaultsFor, newRow, captureSnapshot, setAnnotations, dimRow, insertRows, arcMode, dimMode])

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

  // ── Typed entry (Tab while drawing) ───────────────────────────────────────

  const clearTyped = useCallback(() => { typedRef.current = {}; setTypedState({}) }, [])

  /** Which fields the CAD panel offers for what's being drawn, in Tab order. */
  const typedFields: TypedField[] = tool === 'offset' && offsetSrc ? ['distance']
    : !pending && !drawing && !editing && startTypable(tool, dimMode) ? ['x', 'y']
    : typedFieldsFor(!!pending, drawing)

  /** Offset tool: place the copy through p, then carry on offsetting from the new copy. */
  const placeOffset = useCallback((p: Pt) => {
    const src = annRef.current.find(a => a.id === offsetSrcRef.current)
    if (!src || !OFFSETTABLE.has(src.kind)) return
    const d = offsetDist(src, p, typedRef.current)
    const g = Math.abs(d) > 1e-6 ? offsetGeom(src.kind as OffsetKind, src.geom, d) : null
    if (!g) return
    const row = newRow(src.kind, g, null, src.style)
    captureSnapshot(); setAnnotations(xs => [...xs, row]); void insertRows([row])
    setOffsetSrc(row.id); setSelectedIds(new Set([row.id]))
  }, [newRow, captureSnapshot, setAnnotations, insertRows, setOffsetSrc])

  /** Panel field typed into (undefined clears it): re-lock the preview at once. */
  const setTyped = useCallback((field: TypedField, value: number | undefined) => {
    const next = { ...typedRef.current, [field]: value }
    typedRef.current = next; setTypedState(next)
    const raw = rawCursorRef.current
    const pd = pendingRef.current, d = drawingRef.current
    if (pd && raw) { const np = { ...pd, cur: typedBox(pd.start, raw, next) }; pendingRef.current = np; setPending(np) }
    else if (d && raw && d.pts.length) {
      const nd = { ...d, cur: lockPoint(d, raw, next) }; drawingRef.current = nd; setDrawing(nd)
    }
    else if (!pd && !d && (field === 'x' || field === 'y')) {
      setCursor(typedStart(raw ?? { x: 0, y: 0 }, next))
      if (next.x != null && next.y != null) setSnapHit(null)
    }
  }, [])

  /** The first click of the current tool at p (a click on the canvas, or Enter on typed X / Y). */
  const startAt = useCallback((p: Pt) => {
    const route = clickRoute(tool, false)
    if (route === 'point') { drawClick(p); return }
    if (route !== 'place') return
    if (tool === 'text') { finishPlace('text', p, p); return }
    if (tool === 'cloud' && cloudMode === 'free') {
      const nd: AnnotDrawing = { tool: 'cloud', pts: [p], cur: p }
      drawingRef.current = nd; setDrawing(nd)
      return
    }
    const pd = { tool: tool as PlaceTool, start: p, cur: p }
    pendingRef.current = pd; setPending(pd)
  }, [tool, drawClick, finishPlace, cloudMode])

  /** Enter in a panel field: place the point / finish the shape with the typed values. */
  const commitTyped = useCallback(() => {
    if (offsetSrcRef.current) {   // offset: keep the typed distance for the next one
      const p = rawCursorRef.current
      if (p) placeOffset(p)
      return
    }
    const pd = pendingRef.current, d = drawingRef.current
    if (!pd && !d && hasTypedStart(typedRef.current)) {   // typed X / Y: start the shape there
      startAt(typedStart(rawCursorRef.current ?? { x: 0, y: 0 }, typedRef.current))
    } else if (pd) {
      pendingRef.current = null; setPending(null)
      finishPlace(pd.tool, pd.start, typedBox(pd.start, rawCursorRef.current ?? pd.cur, typedRef.current))
    } else if (d && d.pts.length) {
      const last = d.pts[d.pts.length - 1]
      const raw = rawCursorRef.current ?? d.cur ?? last
      void last
      drawClick(lockPoint(d, raw, typedRef.current))
    }
    clearTyped()
  }, [finishPlace, drawClick, clearTyped, placeOffset, startAt])

  // ── Fillet / chamfer / join (B4b) ─────────────────────────────────────────
  // Two picks: two sides of one line meeting at a corner → that corner; two separate
  // lines → trimmed / extended to meet and joined there (fillet / chamfer the corner).
  // Join: nearest ends joined (bridged if apart); the same line twice closes it.
  // A box picked with Fillet / Chamfer does all four corners (it becomes a line).

  /** Swap a row's shape (a box turns into a line) and drop others it absorbed — one undo step. */
  const replaceShape = useCallback((id: string, kind: AnnotationKind, geom: RoomAnnotation['geom'], removeIds: string[] = []) => {
    captureSnapshot()
    setAnnotations(xs => xs.filter(x => !removeIds.includes(x.id)).map(x => x.id === id ? { ...x, kind, geom } : x))
    void storeRef.current.update(id, { kind, geom })
    if (removeIds.length) void storeRef.current.remove(removeIds)
    setSelectedIds(new Set([id]))
  }, [captureSnapshot, setAnnotations])

  const cornerFn = useCallback((op: 'fillet' | 'chamfer') => (q: Poly, i: number) =>
    op === 'fillet' ? filletAt(q, i, filletR) : chamferAt(q, i, chamfer.d1, chamfer.d2), [filletR, chamfer])

  /** Fillet / chamfer one corner (vertex index) or every corner of a line or box. */
  const cornerOp = useCallback((id: string, op: 'fillet' | 'chamfer', corner: number | 'all') => {
    const a = annRef.current.find(x => x.id === id)
    if (!a) return
    const p = polyOfAnnotation(a)
    if (!p) { setModMsg('Fillet and chamfer work on lines and boxes'); return }
    const fn = cornerFn(op)
    const out = corner === 'all' ? allCorners(p, fn) : fn(p, corner)
    if (!out || out === p) {
      setModMsg(op === 'fillet' ? `A ${filletR} mm radius doesn't fit there` : `A ${chamfer.d1} × ${chamfer.d2} chamfer doesn't fit there`)
      return
    }
    setModMsg(null)
    replaceShape(id, 'line', out)
  }, [cornerFn, filletR, chamfer, replaceShape])

  const runModify = useCallback((op: 'fillet' | 'chamfer' | 'join', A: { id: string; pt: Pt }, B: { id: string; pt: Pt }) => {
    const a = annRef.current.find(x => x.id === A.id), b = annRef.current.find(x => x.id === B.id)
    if (!a || !b) return
    if (op === 'join') {
      if (a.id === b.id) {
        const g = a.geom as LineGeom
        if (a.kind !== 'line' || (g.pts?.length ?? 0) < 3) { setModMsg('Pick two different lines (a line of 3+ points picked twice closes)'); return }
        setModMsg(null); replaceShape(a.id, 'line', { ...g, closed: true }); return
      }
      const ga = a.geom as LineGeom, gb = b.geom as LineGeom
      if (a.kind !== 'line' || b.kind !== 'line' || ga.closed || gb.closed) { setModMsg('Join works on open lines'); return }
      const endPt = (g: LineGeom, e: 'start' | 'end') => e === 'start' ? g.pts[0] : g.pts[g.pts.length - 1]
      const pairs = [['start', 'start'], ['start', 'end'], ['end', 'start'], ['end', 'end']] as const
      const best = [...pairs].sort((p, q) => segLength(endPt(ga, p[0]), endPt(gb, p[1])) - segLength(endPt(ga, q[0]), endPt(gb, q[1])))[0]
      setModMsg(null)
      replaceShape(a.id, 'line', joinPolys(ga, best[0], gb, best[1], 2 / zoom / frame.s), [b.id])
      return
    }
    if (a.id === b.id) {
      const p = polyOfAnnotation(a)
      if (!p || a.kind !== 'line') { setModMsg('Pick two sides that meet at a corner'); return }
      const n = p.pts.length, closed = !!p.closed
      const iA = nearestSegIndex(p.pts, p.bulges, closed, A.pt), iB = nearestSegIndex(p.pts, p.bulges, closed, B.pt)
      const corner = Math.abs(iA - iB) === 1 ? Math.max(iA, iB)
        : closed && ((iA === 0 && iB === n - 1) || (iB === 0 && iA === n - 1)) ? 0 : -1
      if (corner < 0) { setModMsg('Pick two sides that meet at a corner'); return }
      cornerOp(a.id, op, corner)
      return
    }
    if (a.kind !== 'line' || b.kind !== 'line') { setModMsg('Pick two lines'); return }
    const cj = cornerJoin(a.geom as LineGeom, b.geom as LineGeom, A.pt, B.pt)
    if (!cj) { setModMsg('Those lines run parallel (or end in an arc) — no corner to make'); return }
    const plain = op === 'fillet' && filletR <= 0
    const done = plain ? cj.poly : (cornerFn(op)(cj.poly, cj.corner) ?? cj.poly)
    setModMsg(!plain && done === cj.poly ? 'Joined at the corner — the radius / chamfer is too big for those sides' : null)
    replaceShape(a.id, 'line', done, [b.id])
  }, [replaceShape, cornerOp, cornerFn, filletR, zoom, frame.s])

  /** Right-click menu actions. */
  const setLineClosed = useCallback((id: string, closed: boolean) => {
    const a = annRef.current.find(x => x.id === id)
    if (!a || a.kind !== 'line') return
    const g = { ...(a.geom as LineGeom) }
    if (closed) g.closed = true
    else { delete g.closed; if (g.bulges) g.bulges = g.bulges.slice(0, g.pts.length - 1) }
    replaceShape(id, 'line', g)
  }, [replaceShape])
  const convertToLines = useCallback((id: string) => {
    const a = annRef.current.find(x => x.id === id)
    if (a?.kind === 'rect') replaceShape(id, 'line', boxToPoly(a.geom as BoxGeom))
  }, [replaceShape])
  const startJoinFrom = useCallback((id: string, pt: Pt) => {
    setTool('join'); setDrawTool('join'); setModPick({ id, pt }); setModMsg(null)
  }, [])
  const startOffsetFrom = useCallback((id: string) => {
    setTool('offset'); setDrawTool('offset'); setOffsetSrc(id); setSelectedIds(new Set([id]))
  }, [setOffsetSrc])

  // ── More dimensions (B5) ──────────────────────────────────────────────────
  // Radius / diameter / arc length: click a circle, arc or rounded corner, then click
  // where the text (or dim arc) goes. Continue / baseline: click a linear / aligned dim
  // (or carry on from the last one drawn), then each click adds the next dim.

  /** The circle / arc a radial or arc-length dim measures, from a clicked item. */
  const arcSourceOf = useCallback((a: RoomAnnotation, pt: Pt): ArcSource | null => {
    if (a.kind === 'circle') { const g = a.geom as CircleGeom; return { c: g.c, r: g.r } }
    if (a.kind === 'arc') { const g = a.geom as ArcGeom; return { c: g.c, r: g.r, a0: g.a0, a1: g.a1 } }
    if (a.kind === 'line') {
      const g = a.geom as LineGeom
      if (!g.bulges?.some(Boolean)) return null
      const i = nearestSegIndex(g.pts, g.bulges, !!g.closed, pt)
      const p = g.pts[i], q = g.pts[(i + 1) % g.pts.length], bg = g.bulges[i] ?? 0
      const arc = bulgeArc(p, q, bg)
      if (!arc) return null
      // ArcGeom runs a0 → a1 increasing; a + bulge turns the other way (see sampleBulged).
      return bg > 0 ? { ...arc, a0: angOf(arc.c, q), a1: angOf(arc.c, p) } : { ...arc, a0: angOf(arc.c, p), a1: angOf(arc.c, q) }
    }
    return null
  }, [])

  const addRow = useCallback((row: RoomAnnotation) => {
    captureSnapshot(); setAnnotations(xs => [...xs, row]); void insertRows([row])
  }, [captureSnapshot, setAnnotations, insertRows])

  /** Radius / diameter / arc length: drop it with its text (or dim arc) at p. */
  const placeRadial = useCallback((p: Pt) => {
    const d = drawingRef.current
    if (!d?.src || !d.dimType) return
    const { c, r } = d.src
    let geom: SpecialDim
    if (d.dimType === 'arclen') {
      if (d.src.a0 == null || d.src.a1 == null) return
      geom = { dt: 'arclen', c, r, a0: d.src.a0, a1: d.src.a1, off: segLength(c, p) - r }
    } else geom = { dt: d.dimType as 'radius' | 'diameter', c, r, at: p }
    drawingRef.current = null; setDrawing(null)
    addRow(newRow('dim', geom, null, defaultsFor('dim')))
  }, [addRow, newRow, defaultsFor])

  /** Continue / baseline: the next dim to p. */
  const placeChain = useCallback((p: Pt) => {
    const ch = chain ?? (lastDimId ? { rootId: lastDimId, prevId: lastDimId } : null)
    const root = ch && annRef.current.find(x => x.id === ch.rootId), prev = ch && annRef.current.find(x => x.id === ch.prevId)
    if (!ch || !root || !prev || isSpecialDim(root.geom) || isSpecialDim(prev.geom)) {
      setChain(null); setModMsg('Click a linear or aligned dimension to carry on from'); return
    }
    const g = chainedDim(dimMode === 'baseline' ? 'baseline' : 'continue', root.geom as DimGeom, prev.geom as DimGeom, p, 8 * k)
    const row = newRow('dim', g, null, prev.style)
    addRow(row)
    setChain({ rootId: ch.rootId, prevId: row.id }); setModMsg(null)
    setLastDimId(row.id)
  }, [chain, dimMode, k, newRow, addRow, lastDimId])

  /** A click (on the canvas or an item) while the Dimension tool is in a pick mode. */
  const pickDimClick = useCallback((p: Pt, item: RoomAnnotation | null, rawPt: Pt) => {
    if (dimMode === 'radius' || dimMode === 'diameter' || dimMode === 'arclen') {
      if (drawingRef.current?.src) { placeRadial(p); return }
      const src = item ? arcSourceOf(item, rawPt) : null
      if (!src || (dimMode === 'arclen' && src.a0 == null)) {
        setModMsg(dimMode === 'arclen' ? 'Click an arc or a rounded corner' : 'Click a circle, arc or rounded corner'); return
      }
      setModMsg(null)
      const nd: AnnotDrawing = { tool: 'dim', dimType: dimMode, pts: [], cur: p, src }
      drawingRef.current = nd; setDrawing(nd)
      return
    }
    // continue / baseline: a click on a linear / aligned dim (re)starts the chain from it
    if (item?.kind === 'dim' && !isSpecialDim(item.geom) && (!chain || item.id !== chain.prevId)) {
      setChain({ rootId: item.id, prevId: item.id }); setSelectedIds(new Set([item.id])); setModMsg(null)
      return
    }
    placeChain(p)
  }, [dimMode, placeRadial, arcSourceOf, chain, placeChain])

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
            // A line's bulges split with it (the side was straight — arcs have no side bar).
            const split = (x: RoomAnnotation) => {
              const v = withVerts(x, pts), b = x.kind === 'line' ? (x.geom as LineGeom).bulges : undefined
              return b ? { ...v, geom: { ...(v.geom as LineGeom), bulges: [...b.slice(0, i + 1), 0, ...b.slice(i + 1)] } } : v
            }
            setAnnotations(xs => xs.map(x => x.id === a.id ? split(x) : x))
            annRef.current = annRef.current.map(x => x.id === a.id ? split(x) : x)
            cur.i = i + 1; cur.insertAfter = undefined
          }
        }
        const a2 = annRef.current.find(x => x.id === cur.id)!
        const pts = [...vertsOf(a2)]
        const prev = pts[cur.i - 1] ?? pts[cur.i + 1] ?? null
        pts[cur.i] = toFrame(ev, !ev.shiftKey, prev, new Set([cur.id]), ownShapeGeometry(pts, cur.i, a2.kind === 'cloud'))
        setAnnotations(xs => xs.map(x => x.id === cur.id ? withVerts(x, pts) : x))
      } else if (cur.kind === 'edge') {
        if (!cur.moved && !far) return
        if (!cur.moved) { captureSnapshot(); cur.moved = true }
        const p = toFrame(ev, !ev.shiftKey, null, new Set([cur.id]))
        setAnnotations(xs => xs.map(x => {
          if (x.id !== cur.id) return x
          if (x.kind === 'rect' || x.kind === 'ellipse') {   // boxCorners order: top, right, bottom, left
            const g = cur.orig as BoxGeom, dx = p.x - cur.start.x, dy = p.y - cur.start.y
            const ng = cur.i === 0 ? { ...g, a: { x: g.a.x, y: g.a.y + dy } }
              : cur.i === 1 ? { ...g, b: { x: g.b.x + dx, y: g.b.y } }
              : cur.i === 2 ? { ...g, b: { x: g.b.x, y: g.b.y + dy } }
              : { ...g, a: { x: g.a.x + dx, y: g.a.y } }
            return { ...x, geom: ng }
          }
          const orig = vertsOf({ ...x, geom: cur.orig })
          const d = edgeDistanceFor(orig, cur.i, p) - edgeDistanceFor(orig, cur.i, cur.start)
          return withVerts(x, moveEdge(orig, cur.i, d, x.kind === 'cloud' || !!(x.geom as LineGeom).closed))
        }))
      } else if (cur.kind === 'arcGrip') {
        if (!cur.moved && !far) return
        if (!cur.moved) { captureSnapshot(); cur.moved = true }
        const p = toFrame(ev, !ev.shiftKey, null, new Set([cur.id]))
        setAnnotations(xs => xs.map(x => {
          if (x.id !== cur.id) return x
          if (x.kind === 'circle') { const g = x.geom as CircleGeom; return { ...x, geom: { ...g, r: Math.max(1e-3, segLength(g.c, p)) } } }
          const g = x.geom as ArcGeom, s = arcStart(g), m = arcMid(g), e = arcEnd(g)
          const ng = cur.which === 'arcS' ? arcFrom3(p, m, e) : cur.which === 'arcE' ? arcFrom3(s, m, p) : arcFrom3(s, p, e)
          return ng ? { ...x, geom: ng } : x
        }))
      } else if (cur.kind === 'offset') {
        if (!cur.moved && !far) return
        if (!cur.moved) { captureSnapshot(); cur.moved = true }
        const p = toFrame(ev, !ev.shiftKey, null, new Set([cur.id]))
        setAnnotations(xs => xs.map(x => {
          if (x.id !== cur.id) return x
          if (isSpecialDim(x.geom) && x.geom.dt === 'arclen') return { ...x, geom: { ...x.geom, off: segLength(x.geom.c, p) - x.geom.r } }
          return { ...x, geom: { ...(x.geom as DimGeom), offset: dimOffsetFor(x.geom as DimGeom, p) } }
        }))
      } else if (cur.kind === 'dimAt') {
        if (!cur.moved && !far) return
        if (!cur.moved) { captureSnapshot(); cur.moved = true }
        const p = toFrame(ev, !ev.shiftKey, null, new Set([cur.id]))
        setAnnotations(xs => xs.map(x => x.id === cur.id && isSpecialDim(x.geom) && x.geom.dt !== 'arclen' ? { ...x, geom: { ...x.geom, at: p } } : x))
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
    // Click-to-move: the next click anywhere places (window capture, so it doesn't
    // also land on the dim or the canvas underneath).
    const carry = (id: string, orig: RoomAnnotation['geom'], start: Pt) => {
      let moved = false
      const follow = (ev: PointerEvent) => {
        if (!moved) { captureSnapshot(); moved = true }
        const p = toFrame(ev, !ev.shiftKey, null, new Set([id]))
        setAnnotations(xs => xs.map(a => a.id === id ? { ...a, geom: translateGeom(a.kind, orig, p.x - start.x, p.y - start.y) } : a))
      }
      const end = (keep: boolean) => {
        window.removeEventListener('pointermove', follow)
        window.removeEventListener('pointerdown', place, true)
        window.removeEventListener('keydown', key, true)
        window.removeEventListener('contextmenu', menu, true)
        document.body.style.cursor = ''
        setSnapHit(null)
        if (!moved) return
        if (!keep) { setAnnotations(xs => xs.map(a => a.id === id ? { ...a, geom: orig } : a)); return }
        const a = annRef.current.find(x => x.id === id)
        if (a) void storeRef.current.update(id, { geom: a.geom })
      }
      const place = (ev: PointerEvent) => {
        ev.stopPropagation(); ev.preventDefault()
        // The click / context menu this press makes is swallowed too (walls and
        // cabinets select on click).
        const swallow = ev.button === 0 ? 'click' : 'contextmenu'
        window.addEventListener(swallow, menu, { capture: true, once: true })
        setTimeout(() => window.removeEventListener(swallow, menu, true), 600)
        if (ev.button === 0 && moved) follow(ev)
        end(ev.button === 0)
      }
      const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); end(false) } }
      const menu = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault() }
      window.addEventListener('pointermove', follow)
      window.addEventListener('pointerdown', place, true)
      window.addEventListener('keydown', key, true)
      window.addEventListener('contextmenu', menu, true)
      document.body.style.cursor = 'move'
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const cur = dragRef.current
      dragRef.current = null; setDrag(null); setSnapHit(null)
      if (!cur) return
      // A click (no drag) on one dimension picks it up: it follows the cursor and the
      // next click places it (Mark, 2026-10-26). Esc / right-click puts it back.
      if (cur.kind === 'move' && !cur.moved && !ev.shiftKey && cur.orig.size === 1) {
        const [id, orig] = [...cur.orig][0]
        if (annRef.current.find(a => a.id === id)?.kind === 'dim') carry(id, orig, cur.start)
        return
      }
      if ((cur.kind === 'move' || cur.kind === 'rotate' || cur.kind === 'width' || cur.kind === 'vertex' || cur.kind === 'corner' || cur.kind === 'offset' || cur.kind === 'size' || cur.kind === 'arcGrip' || cur.kind === 'edge' || cur.kind === 'dimAt') && cur.moved) {
        const ids = cur.kind === 'move' ? [...cur.orig.keys()] : [cur.id]
        for (const id of ids) {
          const a = annRef.current.find(x => x.id === id)
          if (a) void storeRef.current.update(id, { geom: a.geom })
        }
      } else if (cur.kind === 'marquee') {
        const far = Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y) >= DRAG_PX
        if (!far) { if (!cur.additive) setSelectedIds(new Set()); return }
        const box: Box = {
          minX: Math.min(cur.start.x, cur.cur.x), maxX: Math.max(cur.start.x, cur.cur.x),
          minY: Math.min(cur.start.y, cur.cur.y), maxY: Math.max(cur.start.y, cur.cur.y),
        }
        const hit = annRef.current.filter(a => {
          if (!ownedBy(a, owner)) return false
          const b = boundsOf(annotationFramePoints(a.kind, a.geom, a.text, resolveStyle(a.kind, a.style).size, k))
          return b && boxesOverlap(b, box)
        }).map(a => a.id)
        setSelectedIds(prev => new Set(cur.additive ? [...prev, ...hit] : hit))
      } else if (cur.kind === 'place') {
        // Click to start, click to finish (Mark, 2026-10-22: no drag-to-finish — a click
        // that wobbled a few px used to finish a tiny shape). A drag just arms it like a
        // click; the next click finishes. Point text opens its editor on the click; a
        // freehand cloud starts here.
        if (cur.tool === 'text') { finishPlace('text', cur.start, cur.start); return }
        if (cur.tool === 'cloud' && cloudMode === 'free') {
          const nd: AnnotDrawing = { tool: 'cloud', pts: [cur.start], cur: cur.start }
          drawingRef.current = nd; setDrawing(nd)
          return
        }
        const pd = { tool: cur.tool, start: cur.start, cur: cur.cur }
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
    // …which also means a size field keeps focus; hand it back so Enter / keys reach the canvas.
    const ae = document.activeElement
    if (ae instanceof HTMLInputElement && ae.closest('[data-cad-panel]')) ae.blur()
    if (editing) { commitEdit(); return }   // first click outside the editor just finishes it
    const pd = pendingRef.current
    if (pd) {   // second click of a click-click shape (typed W / H win over the click)
      pendingRef.current = null; setPending(null)
      const hit = toFrame(e, !e.shiftKey)
      finishPlace(pd.tool, pd.start, hasTyped(typedRef.current) ? typedBox(pd.start, hit, typedRef.current) : hit)
      clearTyped()
      return
    }
    const route = clickRoute(tool, !!drawingRef.current)
    if (route === 'none') return
    if (route === 'modify') return   // empty canvas: nothing to pick
    if (route === 'offset') {   // empty canvas: place the copy if something is picked
      if (offsetSrcRef.current) placeOffset(toFrame(e, !e.shiftKey, null, new Set([offsetSrcRef.current])))
      return
    }
    if (route === 'point' && tool === 'dim' && PICK_DIM_MODES.has(dimMode)) {   // an empty-canvas click
      pickDimClick(toFrame(e, !e.shiftKey), null, toFrame(e, false))
      return
    }
    if (route === 'point') {
      const d = drawingRef.current
      // A typed length / angle locks the point; the click just confirms it.
      const hit = toFrame(e, !e.shiftKey, d?.pts[d.pts.length - 1])
      const locked = d && d.pts.length && hasTyped(typedRef.current)
      drawClick(locked ? lockPoint(d, hit, typedRef.current) : !d ? typedStart(hit, typedRef.current) : hit)
      clearTyped()
      return
    }
    const p = typedStart(toFrame(e, tool !== 'select' && !e.shiftKey), route === 'place' ? typedRef.current : {})
    if (route === 'place') clearTyped()
    if (route === 'marquee') beginDrag({ kind: 'marquee', start: p, cur: p, additive: e.shiftKey }, { x: e.clientX, y: e.clientY })
    else beginDrag({ kind: 'place', start: p, cur: p, tool: tool as PlaceTool }, { x: e.clientX, y: e.clientY })
  }, [editing, commitEdit, toFrame, tool, beginDrag, drawClick, finishPlace, clearTyped, placeOffset, dimMode, pickDimClick])

  /** Rubber band for the segment being drawn. */
  const onCaptureMove = useCallback((e: React.PointerEvent) => {
    const pd = pendingRef.current
    if (pd) {
      const raw = toFrame(e, !e.shiftKey)
      rawCursorRef.current = raw
      const np = { ...pd, cur: typedBox(pd.start, raw, typedRef.current) }
      pendingRef.current = np; setPending(np)
      return
    }
    const d = drawingRef.current
    if (!d) {   // hovering: a drawing tool shows what the first click would snap to
      if (tool === 'offset') {   // offset preview follows the cursor
        const p = toFrame(e, !e.shiftKey, null, offsetSrcRef.current ? new Set([offsetSrcRef.current]) : undefined)
        rawCursorRef.current = p; setOffsetCur(p)
      } else if (tool !== 'select' && !editing) {
        const p = toFrame(e, !e.shiftKey)
        rawCursorRef.current = p
        const t = typedRef.current
        if (hasTypedStart(t)) setCursor(typedStart(p, t))   // typed X / Y hold
        if (t.x != null && t.y != null) setSnapHit(null)
      }
      else setCursor(unmapPt(frame, toWorld(e)))
      return
    }
    // A dim's third point only places the line: snap, but no 15° lock off the second point.
    const placing = d.tool === 'dim' && d.pts.length === 2
    const raw = toFrame(e, !e.shiftKey, placing ? null : d.pts[d.pts.length - 1])
    rawCursorRef.current = raw
    const cur = lockPoint(d, raw, typedRef.current)
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
    hittable: !active || tool === 'select' || tool === 'offset' || tool === 'fillet' || tool === 'chamfer' || tool === 'join'
      || (tool === 'dim' && PICK_DIM_MODES.has(dimMode)),
    onMenu: (e, id) => {
      e.preventDefault(); e.stopPropagation()
      if (editing) commitEdit()
      if (!active) enterCad()
      // Right-click inside a multi-selection keeps it: the menu acts on all of them.
      if (!liveSelected.has(id)) setSelectedIds(new Set([id]))
      setMenu({ x: e.clientX, y: e.clientY, id, pt: unmapPt(frame, toWorld(e)) })
    },
    onDown: (e, id) => {
      e.stopPropagation()
      if (active && tool === 'dim' && PICK_DIM_MODES.has(dimMode)) {   // B5: pick a circle / arc / dim, or place
        const a = annRef.current.find(x => x.id === id) ?? null
        pickDimClick(toFrame(e, !e.shiftKey, null, new Set([id])), a, toFrame(e, false))
        return
      }
      if (active && (tool === 'fillet' || tool === 'chamfer' || tool === 'join')) {
        const a = annRef.current.find(x => x.id === id)
        if (!a) return
        const pt = toFrame(e, false)
        if (tool !== 'join' && a.kind === 'rect' && !modPick) { cornerOp(id, tool, 'all'); return }   // a box: every corner
        if (!modPick) { setModPick({ id, pt }); setSelectedIds(new Set([id])); setModMsg(null); return }
        setModPick(null)
        runModify(tool, modPick, { id, pt })
        return
      }
      if (active && tool === 'offset') {   // pick what to offset, or (once picked) place
        const a = annRef.current.find(x => x.id === id)
        if (offsetSrcRef.current) placeOffset(toFrame(e, !e.shiftKey, null, new Set([offsetSrcRef.current])))
        else if (a && OFFSETTABLE.has(a.kind)) { setOffsetSrc(id); setSelectedIds(new Set([id])) }
        return
      }
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
      if (grip.startsWith('e')) {   // side bar: slide that side parallel
        beginDrag({ kind: 'edge', id, i: Number(grip.slice(1)), start: toFrame(e, false), orig: a.geom, moved: false }, { x: e.clientX, y: e.clientY })
        return
      }
      if (grip === 'arcS' || grip === 'arcE' || grip === 'arcM' || grip === 'rad') {
        beginDrag({ kind: 'arcGrip', id, which: grip, moved: false }, { x: e.clientX, y: e.clientY })
        return
      }
      if (grip === 'dimAt') { beginDrag({ kind: 'dimAt', id, moved: false }, { x: e.clientX, y: e.clientY }); return }
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
  const menuOpen = !!menu, modPickOpen = !!modPick, chainOpen = !!chain

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
        if (hasTyped(typedRef.current)) { clearTyped(); return }
        if (offsetSrcRef.current) { setOffsetSrc(null); setSelectedIds(new Set()); return }
        if (menuOpen) { setMenu(null); return }
        if (chainOpen) { setChain(null); setSelectedIds(new Set()); return }
        if (modPickOpen) { setModPick(null); setModMsg(null); setSelectedIds(new Set()); return }
        if (pendingRef.current) { pendingRef.current = null; setPending(null); return }
        // Like right-click: keep what's been clicked (a line ends at its last point, a
        // dim with both points places), drop only the step following the cursor.
        if (drawingRef.current) { finishDrawing(); return }
        if (liveSelected.size) setSelectedIds(new Set())
        else if (tool !== 'select') setTool('select')
        else exitCad()
        return
      }
      if (mod && (e.key === 'c' || e.key === 'C')) { take(); clipboard = selected; return }
      if (mod && (e.key === 'v' || e.key === 'V')) { take(); paste(clipboard); return }
      if (mod && (e.key === 'd' || e.key === 'D')) { take(); paste(selected); return }
      if (mod && (e.key === 'a' || e.key === 'A')) { take(); setSelectedIds(new Set(annRef.current.filter(a => ownedBy(a, owner)).map(a => a.id))); return }
      // Tab (or a digit) while drawing → the CAD panel's first size field.
      // Several selected: Tab (or a digit) → the panel's X field to move them.
      if (tool === 'select' && liveSelected.size > 1 && !drawingRef.current && (e.key === 'Tab' || (/^[0-9.\-]$/.test(e.key) && !mod))) {
        take()
        setSelFocusReq(f => ({ n: (f?.n ?? 0) + 1, seed: e.key === 'Tab' ? undefined : e.key }))
        return
      }
      // Before the first click: Tab → X (then Tab → Y) for where the shape starts.
      const startOK = !pendingRef.current && !drawingRef.current && startTypable(tool, dimMode)
      const canType = startOK || !!pendingRef.current || (!!drawingRef.current?.pts.length && !drawingRef.current?.attachId) || (tool === 'offset' && !!offsetSrcRef.current)
      if (canType && (e.key === 'Tab' || (/^[0-9.\-]$/.test(e.key) && !mod))) {
        take()
        const d = drawingRef.current
        const field: TypedField | undefined = tool === 'offset' && offsetSrcRef.current ? 'distance' : startOK ? 'x' : typedFieldsFor(!!pendingRef.current, d)[0]
        if (!field) return
        setFocusReq(f => ({ field, n: (f?.n ?? 0) + 1, seed: e.key === 'Tab' ? undefined : e.key }))
        return
      }
      if (e.key === 'Enter' && startOK && hasTypedStart(typedRef.current)) { take(); commitTyped(); return }
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
  }, [active, liveSelected, selected, tool, deleteSelected, paste, startEdit, exitCad, finishDrawing, clearTyped, setOffsetSrc, menuOpen, modPickOpen, chainOpen, dimMode, commitTyped])

  // Ghosts for the canvas: marquee box / text box being dragged out (frame coords).
  // A shape being placed: by drag, or armed by a first click (B1).
  const placing = drag?.kind === 'place' ? { tool: drag.tool, start: drag.start, cur: drag.cur } : pending
  const ghost = drag?.kind === 'marquee' ? { kind: 'marquee' as const, a: drag.start, b: drag.cur }
    : placing?.tool === 'textbox' ? { kind: 'place' as const, a: placing.start, b: placing.cur }
    : null

  // Live readout while drawing: the segment being placed, or the box being dragged out
  // (a dim's last click only places its line, which shows its own value).
  const lastPt = drawing?.pts.length ? drawing.pts[drawing.pts.length - 1] : null
  const offsetSrcA = offsetSrc ? annotations.find(a => a.id === offsetSrc && OFFSETTABLE.has(a.kind)) ?? null : null
  const offsetLive: LiveMeasure = tool === 'offset' && offsetSrcA && offsetCur
    ? { mode: 'label', at: offsetCur, text: `Offset ${Math.round(Math.abs(offsetDist(offsetSrcA, offsetCur, typed)))}` }
    : null
  const liveArc = drawing?.tool === 'arc' && drawing.pts.length === 2 && drawing.cur ? arcFromDrawing(drawing, drawing.cur, typed) : null
  const liveMeasure: LiveMeasure = offsetLive ? offsetLive : drawing?.tool === 'circle' && drawing.cur && lastPt
    ? { mode: 'label', at: drawing.cur, text: `R ${Math.round(segLength(lastPt, drawing.cur))}  Ø ${Math.round(2 * segLength(lastPt, drawing.cur))}` }
    : liveArc && drawing?.cur
      ? { mode: 'label', at: drawing.cur, text: `R ${Math.round(liveArc.r)}  ${Math.round(sweepOf(liveArc.a0, liveArc.a1))}°` }
    : drawing?.cur && lastPt && !(drawing.tool === 'dim' && (drawing.pts.length === 2 && drawing.dimType !== 'angular' || drawing.pts.length === 3))
    ? { mode: 'seg', a: lastPt, b: drawing.cur }
    : placing && (placing.start.x !== placing.cur.x || placing.start.y !== placing.cur.y) && placing.tool !== 'text'
      ? { mode: 'box', a: placing.start, b: placing.cur }
    : !drawing && !placing && hasTypedStart(typed) && cursor && startTypable(tool, dimMode)
      ? { mode: 'label', at: cursor, text: owner.view === 'elevation' ? `Start  X ${Math.round(cursor.x)}  Z ${Math.round(-cursor.y)}` : `Start  X ${Math.round(cursor.x)}  Y ${Math.round(cursor.y)}`, dot: true }
      : null

  // The line / arrow / leader being drawn, as a row the layer can draw (frame coords).
  // A box / ellipse / cloud being dragged out previews as the real shape.
  const drawPreview: RoomAnnotation | null = useMemo(() => {
    const row = (kind: AnnotationKind, geom: RoomAnnotation['geom'], style: AnnotationStyle): RoomAnnotation => ({
      id: '__draw__', room_id: room.id, ...ownerColumns(owner),
      kind, geom, text: null, style, sort_order: 0, created_at: '', updated_at: '',
    })
    if (tool === 'offset' && offsetSrcA && offsetCur) {   // the copy that the next click places
      const g = offsetGeom(offsetSrcA.kind as OffsetKind, offsetSrcA.geom, offsetDist(offsetSrcA, offsetCur, typed))
      return g ? row(offsetSrcA.kind, g, { ...offsetSrcA.style, dash: 'dashed' }) : null
    }
    const pl = drag?.kind === 'place' ? drag : pending
    if (pl && (pl.tool === 'rect' || pl.tool === 'ellipse' || pl.tool === 'cloud')) {
      if (pl.start.x === pl.cur.x && pl.start.y === pl.cur.y) return null
      return pl.tool === 'cloud'
        ? row('cloud', { pts: rectPts(pl.start, pl.cur) }, defaultsFor('cloud'))
        : row(pl.tool, { a: pl.start, b: pl.cur }, defaultsFor(pl.tool))
    }
    // B5: radial / arc-length dims follow the cursor once their circle / arc is picked;
    // continue / baseline preview the next dim from the chain.
    if (drawing?.tool === 'dim' && drawing.src && drawing.cur && drawing.dimType) {
      const { c, r } = drawing.src
      if (drawing.dimType === 'arclen' && drawing.src.a0 != null && drawing.src.a1 != null)
        return row('dim', { dt: 'arclen', c, r, a0: drawing.src.a0, a1: drawing.src.a1, off: segLength(c, drawing.cur) - r }, defaultsFor('dim'))
      if (drawing.dimType === 'radius' || drawing.dimType === 'diameter')
        return row('dim', { dt: drawing.dimType, c, r, at: drawing.cur }, defaultsFor('dim'))
    }
    if (tool === 'dim' && (dimMode === 'continue' || dimMode === 'baseline') && cursor) {
      const ch = chain ?? (lastDimId ? { rootId: lastDimId, prevId: lastDimId } : null)
      const root = ch && annotations.find(x => x.id === ch.rootId), prev = ch && annotations.find(x => x.id === ch.prevId)
      if (root && prev && !isSpecialDim(root.geom) && !isSpecialDim(prev.geom))
        return row('dim', chainedDim(dimMode, root.geom as DimGeom, prev.geom as DimGeom, cursor, 8 * k), prev.style)
    }
    if (!drawing || !drawing.pts.length) return null
    if (drawing.tool === 'circle') {
      const r = drawing.cur ? segLength(drawing.pts[0], drawing.cur) : 0
      return r > 0 ? row('circle', { c: drawing.pts[0], r }, defaultsFor('circle')) : null
    }
    if (drawing.tool === 'arc') {
      if (!drawing.cur) return null
      if (drawing.pts.length === 1) return row('line', { pts: [drawing.pts[0], drawing.cur] }, { ...defaultsFor('arc'), arrowStart: 'none', arrowEnd: 'none', dash: 'dashed' })
      const g = arcFromDrawing(drawing, drawing.cur, typed)
      return g ? row('arc', g, defaultsFor('arc')) : null
    }
    if (drawing.tool === 'dim' && drawing.dimType === 'angular') {
      if (!drawing.cur) return null
      const dashed = { ...defaultsFor('dim'), arrowStart: 'none' as const, arrowEnd: 'none' as const, dash: 'dashed' as const }
      if (drawing.pts.length === 1) return row('line', { pts: [drawing.pts[0], drawing.cur] }, dashed)
      if (drawing.pts.length === 2) return row('line', { pts: [drawing.pts[1], drawing.pts[0], drawing.cur] }, dashed)
      return row('dim', { dt: 'angular', c: drawing.pts[0], a: drawing.pts[1], b: drawing.pts[2], at: drawing.cur }, defaultsFor('dim'))
    }
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
  }, [drag, pending, drawing, defaultsFor, room.id, dimGeomFor, typed, tool, offsetSrcA, offsetCur, dimMode, cursor, chain, lastDimId, annotations, k])

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
    dimMode, setDimMode, applyDimText, chain, arcMode, setArcMode, offsetSrc: offsetSrcA,
    filletR, setFilletR, chamfer, setChamfer, modPick, modMsg, cornerOp, setLineClosed, convertToLines,
    startJoinFrom, startOffsetFrom, menu, closeMenu: () => setMenu(null), paste, insertItems, cloudMode, setCloudMode, pending,
    /** Last object snap under the cursor (frame mm) — the canvas draws its marker. */
    snapHit: active ? snapHit : null,
    /** Cursor (frame mm) + the point Δ is measured from while drawing. */
    cursor: active ? cursor : null,
    fromPt: drawing?.pts.length ? drawing.pts[drawing.pts.length - 1] : pending ? pending.start : null,
    ribbonSize, applyLength, applyAngle, applyBoxSize, liveMeasure, patchGeom,
    typed, typedFields, setTyped, commitTyped, clearTyped, focusReq, selFocusReq, moveSelectionTo,
    /** Text block size helper for the editor overlay. */
    layoutFor: (a: RoomAnnotation, text: string) => {
      const s = resolveStyle(a.kind, a.style)
      return layoutText(text, s.size, { bold: s.bold, lineSpacing: s.lineSpacing, width: (a.geom as TextGeom).width, height: (a.geom as TextGeom).height })
    },
  }
}

export type AnnotationTool = ReturnType<typeof useAnnotationTool>

/** Editable vertices: a line's points, or a text's leader. */
/** A half-drawn line / arrow / cloud / leader snaps to its own fixed points and segments
 *  (back to its start to close it, a midpoint…), not to the point just placed. */
function drawingSnapGeometry(d: AnnotDrawing | null): SnapGeometry | undefined {
  if (!d || d.tool === 'dim' || d.pts.length < 2) return undefined
  return ownShapeGeometry(d.pts, d.pts.length - 1, false, true)
}

function vertsOf(a: RoomAnnotation): Pt[] {
  if (a.kind === 'dim') {
    if (isSpecialDim(a.geom)) return a.geom.dt === 'angular' ? [a.geom.c, a.geom.a, a.geom.b] : []
    const g = a.geom as DimGeom; return [g.p1, g.p2]
  }
  if (a.kind === 'line' || a.kind === 'cloud') return (a.geom as LineGeom).pts ?? []
  if (a.kind === 'text') return (a.geom as TextGeom).leader ?? []
  return []
}
function withVerts(a: RoomAnnotation, pts: Pt[]): RoomAnnotation {
  if (a.kind === 'dim') {
    if (isSpecialDim(a.geom)) return a.geom.dt === 'angular' ? { ...a, geom: { ...a.geom, c: pts[0], a: pts[1], b: pts[2] } } : a
    return { ...a, geom: { ...(a.geom as DimGeom), p1: pts[0], p2: pts[1] } }
  }
  if (a.kind === 'line' || a.kind === 'cloud') return { ...a, geom: { ...(a.geom as LineGeom), pts } }
  if (a.kind === 'text') return { ...a, geom: { ...(a.geom as TextGeom), leader: pts } }
  return a
}
