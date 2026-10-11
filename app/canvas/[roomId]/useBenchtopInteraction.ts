'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { BenchtopInstance, BenchtopArcSegment, BenchtopSegment, BenchtopEdge, BenchtopJoinLine, BenchtopJoinType, Room, Wall, CabinetInstance } from '@/src/lib/types'
import { type Pt, dist, SNAP_PX, centroid } from '@/src/lib/geometry'
import { computeSnap, type SnapSettings, type SnapResult } from '@/src/lib/canvasSnap'
import {
  btSegments, shapeWrite, segmentsFromLegacy, transformBenchtop, translateFn, rotateFn, mapSegments,
  splitSegment, deleteVertex, toggleCurve, filletVertex,
  chamferVertex, offsetSegments, outlineCentroid, nearestOnOutline, lineHitOnOutline,
} from '@/src/lib/benchtopGeometry'
import {
  autoAnchor, wallContacts, wallFrame, positionFn, reanchorFn, btTouches, stretchFn, type WallSide, type StretchEnd,
} from '@/src/lib/benchtopAnchor'
import type { Mode, Selected, ContextMenuState, BtShapeSnapshot } from './canvasTypes'
import { confirmDelete } from '@/src/components/ConfirmDeleteModal'

interface Params {
  room: Room
  walls: Wall[]
  cabinets: CabinetInstance[]
  benchtops: BenchtopInstance[]
  setBenchtops: React.Dispatch<React.SetStateAction<BenchtopInstance[]>>
  mode: Mode
  zoom: number
  svgRef: React.RefObject<SVGSVGElement | null>
  svgPointerDownRef: React.MutableRefObject<boolean>
  ctrlRef: React.MutableRefObject<boolean>
  shiftRef: React.MutableRefObject<boolean>
  selected: Selected
  setSelected: React.Dispatch<React.SetStateAction<Selected>>
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>
  setMode: React.Dispatch<React.SetStateAction<Mode>>
  captureSnapshot: () => void
  snapSettings: SnapSettings
  setSnapResult: (r: SnapResult | null) => void
  /** Join type a new join line starts with — the build method default (P-b). */
  defaultJoinType?: (bt: BenchtopInstance) => BenchtopJoinType
}

// ── Circle polygon approximation (32 pts, CCW for cutout hole) ───────────────

function circlePolygon(cx: number, cy: number, r: number, steps = 32): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return pts
}

// ── U-shape miter corner ──────────────────────────────────────────────────────

function miterCorner(p: Pt, n1: Pt, n2: Pt, depth: number): Pt {
  const bx = n1.x + n2.x, by = n1.y + n2.y
  const blen = Math.sqrt(bx * bx + by * by)
  if (blen < 0.01) return { x: p.x + n1.x * depth, y: p.y + n1.y * depth }
  const nx = bx / blen, ny = by / blen
  const dot = n1.x * nx + n1.y * ny
  const scale = Math.abs(dot) > 0.05 ? depth / dot : depth * 4
  return { x: p.x + nx * scale, y: p.y + ny * scale }
}

// ── Build U-shape polygon from 4 inner clicks ────────────────────────────────

function buildUPolygon(a: Pt, b: Pt, c: Pt, d: Pt, depth: number): Pt[] {
  const d1x = b.x - a.x, d1y = b.y - a.y
  const l1 = Math.sqrt(d1x * d1x + d1y * d1y)
  const d2x = c.x - b.x, d2y = c.y - b.y
  const l2 = Math.sqrt(d2x * d2x + d2y * d2y)
  const d3x = d.x - c.x, d3y = d.y - c.y
  const l3 = Math.sqrt(d3x * d3x + d3y * d3y)
  if (l1 < 1 || l2 < 1 || l3 < 1) return []
  const u1x = d1x / l1, u1y = d1y / l1
  const u2x = d2x / l2, u2y = d2y / l2
  const u3x = d3x / l3, u3y = d3y / l3
  // Determine outward side from cross product of arm1 and base
  const cross = u1x * u2y - u1y * u2x
  const s = cross >= 0 ? 1 : -1
  const p1: Pt = { x:  s * u1y, y: -s * u1x }
  const p2: Pt = { x:  s * u2y, y: -s * u2x }
  const p3: Pt = { x:  s * u3y, y: -s * u3x }
  const aOut: Pt = { x: a.x + p1.x * depth, y: a.y + p1.y * depth }
  const bOut = miterCorner(b, p1, p2, depth)
  const cOut = miterCorner(c, p2, p3, depth)
  const dOut: Pt = { x: d.x + p3.x * depth, y: d.y + p3.y * depth }
  return [a, aOut, bOut, cOut, dOut, d, c, b]
}

const snapshotOf = (bt: BenchtopInstance): BtShapeSnapshot => ({
  segments: btSegments(bt), polygon: bt.polygon, arc_segments: bt.arc_segments, edge_tags: bt.edge_tags,
  joins: bt.joins ?? [], cutout_polygons: bt.cutout_polygons ?? [],
})

// ── Hook ──────────────────────────────────────────────────────────────────────
// Every outline edit goes through the segment helpers in benchtopGeometry and
// is written with shapeWrite (segments + derived polygon/arcs/tags). Whole-
// benchtop transforms (move / rotate / mirror) carry joins and cutouts along.
//
// Movement lock (Phase 3b, P-f): nothing on the plan drags a top. Click
// selects, double-click opens the Shape Editor. Position changes are
// deliberate: typed Position (panel), the Move command (base → target
// point) or Re-anchor. Every top is anchored to a wall + side (P-e).
// Tops are only pickable in F4 Benchtop mode ('benchtop_select'); every tool
// here returns to that mode when it finishes, not to plain Select.

export function useBenchtopInteraction(p: Params) {
  const {
    room, walls, cabinets,
    benchtops, setBenchtops,
    mode, zoom, svgRef, svgPointerDownRef, ctrlRef, shiftRef,
    selected,
    setSelected, setContextMenu, setMode,
    captureSnapshot,
    snapSettings, setSnapResult, defaultJoinType,
  } = p

  // ── Draw state ────────────────────────────────────────────────────────────
  const [btDrawPoly, setBtDrawPoly] = useState<Pt[]>([])
  const [btDrawCursor, setBtDrawCursor] = useState<Pt | null>(null)
  const [btDrawArcs, setBtDrawArcs] = useState<BenchtopArcSegment[]>([])
  const [btArcMode, setBtArcMode] = useState(false)
  const [btArcMidpoint, setBtArcMidpoint] = useState<Pt | null>(null)
  const [btRectStart, setBtRectStart] = useState<Pt | null>(null)
  const [btRectCursor, setBtRectCursor] = useState<Pt | null>(null)
  const [btLPoints, setBtLPoints] = useState<Pt[]>([])
  const [btLCursor, setBtLCursor] = useState<Pt | null>(null)
  const [btUPoints, setBtUPoints] = useState<Pt[]>([])
  const [btUCursor, setBtUCursor] = useState<Pt | null>(null)
  const [btCutoutStart, setBtCutoutStart] = useState<Pt | null>(null)
  const [btCutoutCursor, setBtCutoutCursor] = useState<Pt | null>(null)
  const [btJoinStart, setBtJoinStart] = useState<Pt | null>(null)
  const [btJoinCursor, setBtJoinCursor] = useState<Pt | null>(null)
  const [benchtopMenuOpen, setBenchtopMenuOpen] = useState(false)
  // Benchtop open in the full Shape Editor overlay (double-click / panel button).
  const [shapeEditId, setShapeEditId] = useState<string | null>(null)
  // A not-yet-saved benchtop open in the overlay (F4 → Draw in Shape Editor).
  // Only inserted when the editor saves; cancel leaves nothing behind.
  const [shapeEditDraft, setShapeEditDraft] = useState<BenchtopInstance | null>(null)

  // ── Tool settings ─────────────────────────────────────────────────────────
  const [filletRadius, setFilletRadius] = useState(100)
  // L / U quick-draw depth (was a fixed 600) — set from the draw panel.
  const [btDepth, setBtDepth] = useState(600)

  // ── Move command (base point → target point) ─────────────────────────────
  const [btMoveBase, setBtMoveBase] = useState<Pt | null>(null)
  const [btMoveCursor, setBtMoveCursor] = useState<Pt | null>(null)

  // A press on a top: the pointer-up selects it (a drag does nothing more).
  const btPressRef = useRef<{ id: string } | null>(null)
  // Double-click detection: the plan SVG captures the pointer on pointer-down,
  // so a native dblclick never reaches the benchtop path — count clicks here.
  const lastBtClickRef = useRef<{ id: string; t: number } | null>(null)

  const roomCx = centroid(walls)
  const anchorOf = (segs: BenchtopSegment[]) => autoAnchor(segs, walls, roomCx)

  // Anchor every top that has none yet (rows from before Phase 3b, or whose
  // wall was deleted). Not an undo step — it doesn't change the drawing.
  useEffect(() => {
    if (!walls.length) return
    const cx = centroid(walls)
    for (const b of benchtops) {
      if (b.wall_id && walls.some(w => w.id === b.wall_id)) continue
      const a = autoAnchor(btSegments(b), walls, cx)
      if (!a) continue
      setBenchtops(bs => bs.map(x => x.id === b.id ? { ...x, ...a } : x))
      void supabase.from('benchtop_instances').update(a).eq('id', b.id)
        .then(({ error }) => { if (error) console.error('Failed to anchor benchtop:', error) })
    }
  }, [benchtops, walls, setBenchtops])

  // ── Shared snap helper ────────────────────────────────────────────────────

  function snapWorld(wp: Pt, prevPt?: Pt | null): Pt {
    const res = computeSnap(
      wp,
      { walls, cabinets, benchtops },
      snapSettings,
      SNAP_PX / zoom,
      prevPt,
      { ortho: ctrlRef.current, ortho45: shiftRef.current },
    )
    setSnapResult(res.kind ? res : null)
    return res.pt
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function saveBenchtop(polygon: Pt[], arcSegs: BenchtopArcSegment[] = []) {
    captureSnapshot()
    const segs = segmentsFromLegacy(polygon, arcSegs)
    const data = {
      room_id: room.id,
      label: `Benchtop ${benchtops.length + 1}`,
      ...shapeWrite(segs),
      ...(anchorOf(segs) ?? {}),
      joins: [] as BenchtopJoinLine[],
      cutout_polygons: [] as Array<Array<{x:number;y:number}>>,
      benchtop_build_method_id: null,
      benchtop_schedule_id: null,
      notes: null,
    }
    const { data: saved, error } = await supabase.from('benchtop_instances').insert(data).select().single()
    if (error) console.error('Failed to create benchtop:', error)
    if (!error && saved) {
      setBenchtops(bs => [...bs, saved as BenchtopInstance])
      setSelected({ type: 'benchtop', id: (saved as BenchtopInstance).id })
      setMode('benchtop_select')
      setBenchtopMenuOpen(false)
      resetDraw()
    }
  }

  async function handleUpdateBenchtop(id: string, u: Partial<BenchtopInstance>) {
    captureSnapshot()
    setBenchtops(bs => bs.map(b => b.id === id ? { ...b, ...u } : b))
    const { error } = await supabase.from('benchtop_instances').update(u).eq('id', id)
    if (error) console.error('Failed to save benchtop:', error)
  }

  const findBt = (id: string) => benchtops.find(b => b.id === id)

  // Apply an outline edit to one benchtop and persist it.
  function editSegments(id: string, fn: (segs: BenchtopSegment[]) => BenchtopSegment[]) {
    const bt = findBt(id)
    if (!bt) return
    const before = btSegments(bt)
    const after = fn(before)
    if (after === before) return
    void handleUpdateBenchtop(id, shapeWrite(after))
  }

  async function handleDeleteBenchtop(id: string) {
    if (!(await confirmDelete({ title: 'Delete Benchtop', message: 'Delete this benchtop?' }))) return
    captureSnapshot()
    setBenchtops(bs => bs.filter(b => b.id !== id))
    setSelected(null)
    await supabase.from('benchtop_instances').delete().eq('id', id)
  }

  // ── Pointer-down ───────────────────────────────────────────────────────────

  // Press on a top: capture so the canvas doesn't start a marquee / pan, but
  // never move it (P-f). Pointer-up decides click / double-click.
  function onBenchtopPointerDown(e: React.PointerEvent, id: string) {
    if (mode !== 'benchtop_select') return
    if (!findBt(id)) return
    svgPointerDownRef.current = true
    svgRef.current?.setPointerCapture(e.pointerId)
    btPressRef.current = { id }
  }

  // ── Click / context-menu handlers ──────────────────────────────────────────

  // Edge click: toggle wall ↔ exposed. A wall edge drops its profile (P-d).
  function onBenchtopEdgeClick(id: string, edgeIndex: number) {
    if (mode !== 'benchtop_select') return
    editSegments(id, segs => segs.map((s, i) => {
      if (i !== edgeIndex) return s
      const wall = !s.edge?.wall
      return { ...s, edge: wall ? { wall: true } : { ...s.edge, wall: false } }
    }))
  }

  function onBenchtopEdgeShiftClick(id: string, edgeIndex: number) {
    if (mode !== 'benchtop_select') return
    editSegments(id, segs => splitSegment(segs, edgeIndex))
  }

  function onBenchtopEdgeAltClick(id: string, edgeIndex: number) {
    if (mode !== 'benchtop_select') return
    editSegments(id, segs => toggleCurve(segs, edgeIndex))
  }

  // Set one or more edges' finish (BenchtopPanel profile picker).
  function setBenchtopEdges(id: string, edgeIndices: number[], patch: BenchtopEdge) {
    editSegments(id, segs => segs.map((s, i) => {
      if (!edgeIndices.includes(i)) return s
      const edge = { ...s.edge, ...patch }
      if (edge.wall) delete edge.profile_id
      return { ...s, edge }
    }))
  }

  // Vertex click (no drag): just select. Butt/mitre now lives on join lines (P-b).
  function onBenchtopVertexClick(id: string) {
    setSelected({ type: 'benchtop', id })
  }

  function onBenchtopContextMenu(e: React.MouseEvent, id: string) {
    setSelected({ type: 'benchtop', id })
    setContextMenu({ x: e.clientX, y: e.clientY, benchtopId: id })
  }

  function onBenchtopVertexContextMenu(e: React.MouseEvent, btId: string, vi: number) {
    e.preventDefault(); e.stopPropagation()
    setSelected({ type: 'benchtop', id: btId })
    setContextMenu({ x: e.clientX, y: e.clientY, benchtopId: btId, vertexContext: { btId, vi } })
  }

  // ── Vertex / edge operations ──────────────────────────────────────────────

  function handleDeleteBenchtopVertex(btId: string, vi: number) {
    setContextMenu(null)
    editSegments(btId, segs => deleteVertex(segs, vi))
  }

  function handleRoundCorner(btId: string, vi: number) {
    setContextMenu(null)
    editSegments(btId, segs => filletVertex(segs, vi, filletRadius))
  }

  function handleChamfer(btId: string, vi: number) {
    setContextMenu(null)
    editSegments(btId, segs => chamferVertex(segs, vi, filletRadius))
  }

  // ── Transform operations ──────────────────────────────────────────────────

  function transformWhole(btId: string, fn: (p: Pt) => Pt, mirror = false) {
    const bt = findBt(btId)
    if (!bt) return
    void handleUpdateBenchtop(btId, transformBenchtop(snapshotOf(bt), fn, mirror))
  }

  function handleMirrorH(btId: string) {
    const bt = findBt(btId)
    if (!bt) return
    const c = outlineCentroid(btSegments(bt))
    transformWhole(btId, p => ({ x: 2 * c.x - p.x, y: p.y }), true)
  }

  function handleMirrorV(btId: string) {
    const bt = findBt(btId)
    if (!bt) return
    const c = outlineCentroid(btSegments(bt))
    transformWhole(btId, p => ({ x: p.x, y: 2 * c.y - p.y }), true)
  }

  function handleOffset(btId: string, amount: number) {
    editSegments(btId, segs => (segs.length < 3 ? segs : offsetSegments(segs, amount)))
  }

  function handleRotateByAngle(btId: string, angleDeg: number) {
    const bt = findBt(btId)
    if (!bt) return
    transformWhole(btId, rotateFn(outlineCentroid(btSegments(bt)), (angleDeg * Math.PI) / 180))
  }

  // ── Position / anchor (P-e, P-f) ───────────────────────────────────────────

  const anchorWall = (bt: BenchtopInstance) => walls.find(w => w.id === bt.wall_id) ?? null

  // Typed position: start along the anchor wall, distance off its face.
  function handleSetPosition(btId: string, target: { along?: number; off?: number }) {
    const bt = findBt(btId)
    const wall = bt && anchorWall(bt)
    if (!bt || !wall) return
    const fn = positionFn(btSegments(bt), wallFrame(wall, bt.wall_side, roomCx), target)
    if (fn) void handleUpdateBenchtop(btId, transformBenchtop(snapshotOf(bt), fn))
  }

  // Re-anchor: a top already on that face just changes its anchor; otherwise
  // it is carried onto the new wall, turned to face it — flush against a wall
  // face, same distance off an island line.
  function handleReanchor(btId: string, wallId: string, side: WallSide) {
    const bt = findBt(btId)
    const to = walls.find(w => w.id === wallId)
    if (!bt || !to) return
    const segs = btSegments(bt)
    const from = anchorWall(bt)
    const anchor = { wall_id: wallId, wall_side: side }
    if (!from || btTouches(segs, wallContacts(segs, walls, roomCx), to, side, roomCx)) {
      void handleUpdateBenchtop(btId, anchor)
      return
    }
    const fn = reanchorFn(segs, wallFrame(from, bt.wall_side, roomCx), wallFrame(to, side, roomCx),
      to.wall_type === 'island' ? undefined : 0)
    if (fn) void handleUpdateBenchtop(btId, { ...transformBenchtop(snapshotOf(bt), fn), ...anchor })
  }

  // Typed size change (panel): grow / shrink the chosen end by delta mm.
  // Outline + joins stretch; a cutout moves whole (a sink keeps its size).
  function handleStretch(btId: string, end: StretchEnd, delta: number) {
    const bt = findBt(btId)
    const wall = bt && anchorWall(bt)
    if (!bt || !wall || !delta) return
    const segs = btSegments(bt)
    const fn = stretchFn(segs, wallFrame(wall, bt.wall_side, roomCx), end, delta)
    if (!fn) return
    const cutout_polygons = (bt.cutout_polygons ?? []).map(c => {
      const cx = c.reduce((a, q) => a + q.x, 0) / c.length, cy = c.reduce((a, q) => a + q.y, 0) / c.length
      const m = fn({ x: cx, y: cy }), dx = m.x - cx, dy = m.y - cy
      return c.map(q => ({ x: q.x + dx, y: q.y + dy }))
    })
    void handleUpdateBenchtop(btId, {
      ...shapeWrite(mapSegments(segs, fn)),
      joins: (bt.joins ?? []).map(j => ({ ...j, p0: fn(j.p0), p1: fn(j.p1) })),
      cutout_polygons,
    })
  }

  function startMoveBenchtop() {
    if (selected?.type !== 'benchtop') return
    resetDraw()
    setMode('move_benchtop')
  }

  // After a Move: keep the anchor while the top still touches it (or touches
  // nothing); landed against another wall → anchor there.
  function moveTo(btId: string, delta: Pt) {
    const bt = findBt(btId)
    if (!bt) return
    const moved = transformBenchtop(snapshotOf(bt), translateFn(delta.x, delta.y))
    const segs = moved.segments
    const contacts = wallContacts(segs, walls, roomCx)
    const keeps = !contacts.length || contacts.some(c => c.wallId === bt.wall_id && c.side === bt.wall_side)
    void handleUpdateBenchtop(btId, keeps ? moved : { ...moved, ...(anchorOf(segs) ?? {}) })
  }

  // ── Shape Editor overlay ───────────────────────────────────────────────────

  function openShapeEditor(id: string) {
    setSelected({ type: 'benchtop', id })
    setShapeEditId(id)
  }

  // Segments arrive back in the room frame (the overlay undoes its local shift).
  async function handleShapeEditorSave(id: string, segs: BenchtopSegment[]) {
    await handleUpdateBenchtop(id, shapeWrite(segs))
    setShapeEditId(null)
  }

  // New benchtop straight into the editor, seeded with a rectangle (room frame).
  function openNewInShapeEditor(seed: Pt[]) {
    setMode('benchtop_select')
    resetDraw()
    const now = new Date().toISOString()
    setShapeEditDraft({
      id: 'new', room_id: room.id, label: `Benchtop ${benchtops.length + 1}`,
      ...shapeWrite(segmentsFromLegacy(seed)), joins: [], join_types: [], cutout_polygons: [],
      wall_id: null, wall_side: 'face', height_mm: null,
      benchtop_build_method_id: null, benchtop_schedule_id: null, notes: null,
      created_at: now, updated_at: now,
    })
  }

  async function handleDraftSave(segs: BenchtopSegment[]) {
    const draft = shapeEditDraft
    if (!draft) return
    captureSnapshot()
    const { data: saved, error } = await supabase.from('benchtop_instances').insert({
      room_id: room.id, label: draft.label, ...shapeWrite(segs), ...(anchorOf(segs) ?? {}),
      joins: [], cutout_polygons: [],
      benchtop_build_method_id: null, benchtop_schedule_id: null, notes: null,
    }).select().single()
    if (error || !saved) {
      console.error('Failed to create benchtop:', error)
      alert('Saving the benchtop failed — see console. The editor stays open so the drawing is not lost.')
      return
    }
    setBenchtops(bs => [...bs, saved as BenchtopInstance])
    setSelected({ type: 'benchtop', id: (saved as BenchtopInstance).id })
    setShapeEditDraft(null)
  }

  // ── Cutout operations ──────────────────────────────────────────────────────

  function handleDeleteCutout(btId: string, cutoutIndex: number) {
    const bt = findBt(btId)
    if (!bt) return
    setContextMenu(null)
    const cutout_polygons = (bt.cutout_polygons ?? []).filter((_, i) => i !== cutoutIndex)
    void handleUpdateBenchtop(btId, { cutout_polygons })
  }

  // ── Join lines (P-b) ───────────────────────────────────────────────────────

  function updateJoins(btId: string, fn: (j: BenchtopJoinLine[]) => BenchtopJoinLine[]) {
    const bt = findBt(btId)
    if (!bt) return
    void handleUpdateBenchtop(btId, { joins: fn(bt.joins ?? []) })
  }
  const handleDeleteJoin = (btId: string, i: number) => updateJoins(btId, js => js.filter((_, k) => k !== i))
  const handleSetJoinType = (btId: string, i: number, type: BenchtopJoinType) =>
    updateJoins(btId, js => js.map((j, k) => (k === i ? { ...j, type } : j)))

  // Join ends always sit ON the outline: snap to the nearest edge point; with
  // Ctrl the second end is where the ortho line from the first crosses the outline.
  function joinPoint(wp: Pt, start: Pt | null): Pt | null {
    const selId = selected?.type === 'benchtop' ? selected.id : null
    const bt = selId ? findBt(selId) : null
    if (!bt) return null
    const segs = btSegments(bt)
    if (start && ctrlRef.current) {
      const dx = wp.x - start.x, dy = wp.y - start.y
      const dir = Math.abs(dx) >= Math.abs(dy) ? { x: 1, y: 0 } : { x: 0, y: 1 }
      return lineHitOnOutline(segs, start, dir, wp)
    }
    const hit = nearestOnOutline(segs, wp)
    if (!hit || hit.d > (SNAP_PX * 3) / zoom) return null
    return hit.pt
  }

  // ── Pointer-move delegation ────────────────────────────────────────────────

  function handlePointerMove(wp: Pt): boolean {
    // A press on a top never drags it (P-f) — just swallow the move.
    if (btPressRef.current) return true

    if (mode === 'move_benchtop') {
      setBtMoveCursor(snapWorld(wp, btMoveBase ?? undefined))
      return true
    }

    if (mode === 'draw_benchtop_rect') {
      const snapped = snapWorld(wp, btRectStart ?? undefined)
      setBtRectCursor(snapped)
      return true
    }

    if (mode === 'draw_benchtop') {
      const last = btDrawPoly.length > 0 ? btDrawPoly[btDrawPoly.length - 1] : null
      const snapped = snapWorld(wp, btArcMode ? null : (last ?? undefined))
      setBtDrawCursor(snapped)
      return true
    }

    if (mode === 'draw_benchtop_l') {
      const last = btLPoints.length > 0 ? btLPoints[btLPoints.length - 1] : null
      const snapped = snapWorld(wp, last ?? undefined)
      setBtLCursor(snapped)
      return true
    }

    if (mode === 'draw_benchtop_u') {
      const last = btUPoints.length > 0 ? btUPoints[btUPoints.length - 1] : null
      const snapped = snapWorld(wp, last ?? undefined)
      setBtUCursor(snapped)
      return true
    }

    if (mode === 'draw_benchtop_cutout_rect' || mode === 'draw_benchtop_cutout_circle') {
      const snapped = snapWorld(wp, btCutoutStart ?? undefined)
      setBtCutoutCursor(snapped)
      return true
    }

    if (mode === 'draw_benchtop_join') {
      setBtJoinCursor(joinPoint(wp, btJoinStart) ?? wp)
      return true
    }

    return false
  }

  // ── Pointer-up delegation ──────────────────────────────────────────────────

  async function handlePointerUp(wp: Pt, exact = false): Promise<boolean> {
    // exact = a point typed in the draw panel: use it as-is, no snapping.
    const pick = (prev?: Pt | null) => (exact ? wp : snapWorld(wp, prev))
    if (btPressRef.current) {
      const { id } = btPressRef.current
      btPressRef.current = null
      setSelected({ type: 'benchtop', id })
      const now = Date.now(), last = lastBtClickRef.current
      if (last && last.id === id && now - last.t < 400) { lastBtClickRef.current = null; openShapeEditor(id) }
      else lastBtClickRef.current = { id, t: now }
      return true
    }

    if (mode === 'move_benchtop') {
      const selId = selected?.type === 'benchtop' ? selected.id : null
      if (!selId) { setMode('benchtop_select'); return true }
      const snapped = snapWorld(wp, btMoveBase ?? undefined)
      if (!btMoveBase) {
        setBtMoveBase(snapped)
      } else {
        const delta = { x: snapped.x - btMoveBase.x, y: snapped.y - btMoveBase.y }
        setBtMoveBase(null); setBtMoveCursor(null); setSnapResult(null)
        setMode('benchtop_select')
        if (Math.hypot(delta.x, delta.y) > 0.5) moveTo(selId, delta)
      }
      return true
    }

    if (mode === 'draw_benchtop_rect') {
      const snapped = pick(btRectStart ?? undefined)
      if (!btRectStart) {
        setBtRectStart(snapped)
      } else {
        const x1 = btRectStart.x, y1 = btRectStart.y, x2 = snapped.x, y2 = snapped.y
        if (Math.abs(x2 - x1) > 10 && Math.abs(y2 - y1) > 10) {
          const polygon: Pt[] = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
          setBtRectStart(null); setBtRectCursor(null)
          await saveBenchtop(polygon)
        }
      }
      return true
    }

    if (mode === 'draw_benchtop') {
      const snapDist = SNAP_PX / zoom
      const last = btDrawPoly.length > 0 ? btDrawPoly[btDrawPoly.length - 1] : null
      const snapped = pick(btArcMode ? null : (last ?? undefined))

      if (!btArcMode && btDrawPoly.length >= 3 && dist(snapped, btDrawPoly[0]) < snapDist) {
        const polygon = [...btDrawPoly]
        const arcs = [...btDrawArcs]
        setBtDrawPoly([]); setBtDrawCursor(null); setBtDrawArcs([]); setBtArcMode(false); setBtArcMidpoint(null)
        await saveBenchtop(polygon, arcs)
        return true
      }
      if (btArcMode && btDrawPoly.length > 0) {
        if (!btArcMidpoint) {
          setBtArcMidpoint(snapped)
        } else {
          const start = btDrawPoly[btDrawPoly.length - 1]
          const end = snapped
          const mid = btArcMidpoint
          const cpx = 2 * mid.x - (start.x + end.x) / 2
          const cpy = 2 * mid.y - (start.y + end.y) / 2
          const edgeIndex = btDrawPoly.length - 1
          setBtDrawArcs(prev => [...prev, { edge_index: edgeIndex, cpx, cpy }])
          setBtDrawPoly(prev => [...prev, end])
          setBtArcMidpoint(null)
          setBtArcMode(false)
        }
        return true
      }
      if (btDrawPoly.length === 0 || dist(snapped, btDrawPoly[btDrawPoly.length - 1]) > 10) {
        setBtDrawPoly(prev => [...prev, snapped])
      }
      return true
    }

    if (mode === 'draw_benchtop_l') {
      const last = btLPoints.length > 0 ? btLPoints[btLPoints.length - 1] : null
      const snapped = pick(last ?? undefined)
      if (btLPoints.length < 2) {
        setBtLPoints(prev => [...prev, snapped])
      } else {
        const [a, b] = btLPoints
        const c = snapped
        const d1x = b.x - a.x, d1y = b.y - a.y
        const d1len = Math.sqrt(d1x * d1x + d1y * d1y)
        const d2x = c.x - b.x, d2y = c.y - b.y
        const d2len = Math.sqrt(d2x * d2x + d2y * d2y)
        if (d1len > 10 && d2len > 10) {
          const u1x = d1x / d1len, u1y = d1y / d1len
          const u2x = d2x / d2len, u2y = d2y / d2len
          const cross = u1x * u2y - u1y * u2x
          const sign = cross >= 0 ? 1 : -1
          const depth = btDepth
          const p1x = sign * u1y, p1y = -sign * u1x
          const p2x = sign * u2y, p2y = -sign * u2x
          const polygon: Pt[] = [
            a,
            { x: a.x + depth * p1x, y: a.y + depth * p1y },
            { x: b.x + depth * p1x + depth * p2x, y: b.y + depth * p1y + depth * p2y },
            { x: c.x + depth * p2x, y: c.y + depth * p2y },
            c, b,
          ]
          setBtLPoints([]); setBtLCursor(null)
          await saveBenchtop(polygon)
        } else {
          setBtLPoints(prev => [...prev, snapped])
        }
      }
      return true
    }

    if (mode === 'draw_benchtop_u') {
      const last = btUPoints.length > 0 ? btUPoints[btUPoints.length - 1] : null
      const snapped = pick(last ?? undefined)
      if (btUPoints.length < 3) {
        setBtUPoints(prev => [...prev, snapped])
      } else {
        const [a, b, c] = btUPoints
        const d = snapped
        const polygon = buildUPolygon(a, b, c, d, btDepth)
        if (polygon.length === 8) {
          setBtUPoints([]); setBtUCursor(null)
          await saveBenchtop(polygon)
        } else {
          setBtUPoints(prev => [...prev, snapped])
        }
      }
      return true
    }

    if (mode === 'draw_benchtop_cutout_rect' || mode === 'draw_benchtop_cutout_circle') {
      const snapped = snapWorld(wp, btCutoutStart ?? undefined)
      const selId = selected?.type === 'benchtop' ? selected.id : null
      if (!selId) return true

      if (!btCutoutStart) {
        setBtCutoutStart(snapped)
      } else {
        const bt = findBt(selId)
        if (!bt) { setBtCutoutStart(null); setBtCutoutCursor(null); return true }
        let newCutout: Array<{x:number;y:number}>
        if (mode === 'draw_benchtop_cutout_rect') {
          const x1 = btCutoutStart.x, y1 = btCutoutStart.y, x2 = snapped.x, y2 = snapped.y
          if (Math.abs(x2 - x1) < 10 || Math.abs(y2 - y1) < 10) { setBtCutoutStart(null); setBtCutoutCursor(null); return true }
          newCutout = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
        } else {
          const r = dist(btCutoutStart, snapped)
          if (r < 10) { setBtCutoutStart(null); setBtCutoutCursor(null); return true }
          newCutout = circlePolygon(btCutoutStart.x, btCutoutStart.y, r)
        }
        const cutout_polygons = [...(bt.cutout_polygons ?? []), newCutout]
        setBtCutoutStart(null); setBtCutoutCursor(null)
        setMode('benchtop_select')
        void handleUpdateBenchtop(selId, { cutout_polygons })
      }
      return true
    }

    if (mode === 'draw_benchtop_join') {
      const selId = selected?.type === 'benchtop' ? selected.id : null
      if (!selId) return true
      const pt = joinPoint(wp, btJoinStart)
      if (!pt) return true   // ends must land on the outline
      if (!btJoinStart) {
        setBtJoinStart(pt)
      } else if (dist(pt, btJoinStart) > 10) {
        const bt = findBt(selId)
        const type: BenchtopJoinType = (bt && defaultJoinType?.(bt)) ?? 'butt'
        setBtJoinStart(null); setBtJoinCursor(null)
        setMode('benchtop_select')
        if (bt) void handleUpdateBenchtop(selId, { joins: [...(bt.joins ?? []), { p0: btJoinStart, p1: pt, type }] })
      }
      return true
    }

    return false
  }

  // ── Typed sizes from the draw panel ────────────────────────────────────────
  // The panel previews by moving the tool's cursor and commits by feeding the
  // same pointer-up path an exact (unsnapped) point — one code path for mouse
  // and keyboard.

  /** The fixed point the current side is measured from (null = nothing clicked yet). */
  function drawAnchor(): Pt | null {
    switch (mode) {
      case 'draw_benchtop_rect': return btRectStart
      case 'draw_benchtop':      return btDrawPoly[btDrawPoly.length - 1] ?? null
      case 'draw_benchtop_l':    return btLPoints[btLPoints.length - 1] ?? null
      case 'draw_benchtop_u':    return btUPoints[btUPoints.length - 1] ?? null
      default:                   return null
    }
  }
  function drawCursor(): Pt | null {
    switch (mode) {
      case 'draw_benchtop_rect': return btRectCursor
      case 'draw_benchtop':      return btDrawCursor
      case 'draw_benchtop_l':    return btLCursor
      case 'draw_benchtop_u':    return btUCursor
      default:                   return null
    }
  }
  function setDrawCursorPt(pt: Pt) {
    if (mode === 'draw_benchtop_rect') setBtRectCursor(pt)
    else if (mode === 'draw_benchtop') setBtDrawCursor(pt)
    else if (mode === 'draw_benchtop_l') setBtLCursor(pt)
    else if (mode === 'draw_benchtop_u') setBtUCursor(pt)
  }
  const polarPt = (a: Pt, len: number, angDeg: number): Pt =>
    ({ x: a.x + len * Math.cos(angDeg * Math.PI / 180), y: a.y + len * Math.sin(angDeg * Math.PI / 180) })
  // Rectangle: width / depth keep the direction the mouse is pulling in.
  function rectPt(a: Pt, w: number, d: number): Pt {
    const c = btRectCursor ?? { x: a.x + 1, y: a.y + 1 }
    return { x: a.x + (c.x < a.x ? -w : w), y: a.y + (c.y < a.y ? -d : d) }
  }

  function previewTyped(v: { len?: number; ang?: number; w?: number; d?: number }) {
    const a = drawAnchor()
    if (!a) return
    if (mode === 'draw_benchtop_rect') { if (v.w != null && v.d != null) setDrawCursorPt(rectPt(a, v.w, v.d)) }
    else if (v.len != null && v.ang != null) setDrawCursorPt(polarPt(a, v.len, v.ang))
  }

  async function placeTyped(v: { len?: number; ang?: number; w?: number; d?: number }) {
    const a = drawAnchor()
    if (!a) return
    if (mode === 'draw_benchtop_rect') { if (v.w && v.d) await handlePointerUp(rectPt(a, v.w, v.d), true) }
    else if (v.len && v.ang != null) await handlePointerUp(polarPt(a, v.len, v.ang), true)
  }

  // Polygon: finish without clicking back on the first vertex.
  async function closePolygon() {
    if (mode !== 'draw_benchtop' || btDrawPoly.length < 3) return
    const polygon = [...btDrawPoly], arcs = [...btDrawArcs]
    setBtDrawPoly([]); setBtDrawCursor(null); setBtDrawArcs([]); setBtArcMode(false); setBtArcMidpoint(null)
    await saveBenchtop(polygon, arcs)
  }

  // ── Keyboard helpers ───────────────────────────────────────────────────────

  function resetDraw() {
    setBtDrawPoly([]); setBtDrawCursor(null); setBtDrawArcs([]); setBtArcMode(false); setBtArcMidpoint(null)
    setBtRectStart(null); setBtRectCursor(null)
    setBtLPoints([]); setBtLCursor(null)
    setBtUPoints([]); setBtUCursor(null)
    setBtCutoutStart(null); setBtCutoutCursor(null)
    setBtJoinStart(null); setBtJoinCursor(null)
    setBtMoveBase(null); setBtMoveCursor(null)
    setBenchtopMenuOpen(false)
  }

  function undoVertex() {
    setBtDrawPoly(prev => prev.slice(0, -1))
    setBtDrawArcs(prev => prev.filter(a => a.edge_index < btDrawPoly.length - 2))
    setBtArcMode(false)
    setBtArcMidpoint(null)
  }

  function toggleArcMode() {
    setBtArcMode(v => !v)
    setBtArcMidpoint(null)
  }

  return {
    btDrawPoly, btDrawCursor,
    btDrawArcs, btArcMode, btArcMidpoint,
    btRectStart, btRectCursor,
    btLPoints, btLCursor,
    btUPoints, btUCursor,
    btCutoutStart, btCutoutCursor,
    btJoinStart, btJoinCursor,
    benchtopMenuOpen, setBenchtopMenuOpen,
    filletRadius, setFilletRadius,
    shapeEditId, setShapeEditId, openShapeEditor, handleShapeEditorSave,
    shapeEditDraft, setShapeEditDraft, openNewInShapeEditor, handleDraftSave,

    onBenchtopPointerDown,
    onBenchtopEdgeClick,
    onBenchtopEdgeShiftClick,
    onBenchtopEdgeAltClick,
    onBenchtopVertexClick,
    onBenchtopContextMenu,
    onBenchtopVertexContextMenu,
    handleUpdateBenchtop,
    handleDeleteBenchtop,
    handleDeleteBenchtopVertex,
    handleDeleteCutout,
    handleRoundCorner,
    handleChamfer,
    handleMirrorH,
    handleMirrorV,
    handleOffset,
    handleRotateByAngle,
    setBenchtopEdges,
    handleDeleteJoin,
    handleSetJoinType,
    handleSetPosition,
    handleStretch,
    handleReanchor,
    startMoveBenchtop,
    btMoveBase, btMoveCursor,
    btDepth, setBtDepth, drawAnchor, drawCursor, previewTyped, placeTyped, closePolygon,

    handlePointerMove,
    handlePointerUp,

    resetDraw,
    undoVertex,
    toggleArcMode,
  }
}
