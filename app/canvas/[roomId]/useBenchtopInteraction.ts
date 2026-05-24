'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { BenchtopInstance, BenchtopArcSegment, Room, Wall, CabinetInstance } from '@/src/lib/types'
import { type Pt, dist, SNAP_PX } from '@/src/lib/geometry'
import { computeSnap, type SnapSettings, type SnapResult } from '@/src/lib/canvasSnap'
import type { Mode, Selected, ContextMenuState, BtMoveDrag, BtRotateDrag } from './canvasTypes'

type Snapshot = { walls: Wall[]; cabinets: CabinetInstance[]; benchtops: BenchtopInstance[] }

interface Params {
  room: Room
  walls: Wall[]
  cabinets: CabinetInstance[]
  benchtops: BenchtopInstance[]
  setBenchtops: React.Dispatch<React.SetStateAction<BenchtopInstance[]>>
  benchtopsRef: React.MutableRefObject<BenchtopInstance[]>
  wallsRef: React.MutableRefObject<Wall[]>
  cabinetsRef: React.MutableRefObject<CabinetInstance[]>
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
  pushSnapshot: (s: Snapshot) => void
  snapSettings: SnapSettings
  setSnapResult: (r: SnapResult | null) => void
}

// ── Polygon offset (inward/outward by amount mm) ──────────────────────────────

function signedArea(pts: Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return a / 2
}

function offsetPolygon(pts: Pt[], amount: number): Pt[] {
  const n = pts.length
  const sa = signedArea(pts)
  const sign = sa >= 0 ? 1 : -1  // CW in SVG Y-down = positive area
  return pts.map((curr, i) => {
    const prev = pts[(i - 1 + n) % n]
    const next = pts[(i + 1) % n]
    const d1x = curr.x - prev.x, d1y = curr.y - prev.y
    const l1 = Math.sqrt(d1x * d1x + d1y * d1y)
    const d2x = next.x - curr.x, d2y = next.y - curr.y
    const l2 = Math.sqrt(d2x * d2x + d2y * d2y)
    if (l1 < 0.01 || l2 < 0.01) return curr
    // Outward normals (right-hand normal, sign-adjusted for winding)
    const n1x = sign * d1y / l1,  n1y = -sign * d1x / l1
    const n2x = sign * d2y / l2,  n2y = -sign * d2x / l2
    let bx = n1x + n2x, by = n1y + n2y
    const blen = Math.sqrt(bx * bx + by * by)
    if (blen < 0.01) return { x: curr.x + n1x * amount, y: curr.y + n1y * amount }
    bx /= blen; by /= blen
    const dot = n1x * bx + n1y * by
    const scale = Math.abs(dot) > 0.05 ? amount / dot : amount * 4
    return { x: curr.x + bx * scale, y: curr.y + by * scale }
  })
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

export function useBenchtopInteraction(p: Params) {
  const {
    room, walls, cabinets,
    benchtops, setBenchtops, benchtopsRef,
    wallsRef, cabinetsRef,
    mode, zoom, svgRef, svgPointerDownRef, ctrlRef, shiftRef,
    selected,
    setSelected, setContextMenu, setMode,
    captureSnapshot, pushSnapshot,
    snapSettings, setSnapResult,
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
  const [benchtopMenuOpen, setBenchtopMenuOpen] = useState(false)

  // ── Tool settings ─────────────────────────────────────────────────────────
  const [filletRadius, setFilletRadius] = useState(100)

  // ── Drag refs ─────────────────────────────────────────────────────────────
  const btVertexDragRef = useRef<{
    btId: string; vertexIndex: number; hasMoved: boolean
    originX: number; originY: number
    originalPolygon: Pt[]; currentPolygon: Pt[]
  } | null>(null)
  const btArcDragRef = useRef<{
    btId: string; edgeIndex: number; hasMoved: boolean
    originX: number; originY: number
    currentArcs: BenchtopArcSegment[]
  } | null>(null)
  const btMoveDragRef = useRef<BtMoveDrag | null>(null)
  const btRotateDragRef = useRef<BtRotateDrag | null>(null)
  const preDragBenchtopsRef = useRef<BenchtopInstance[]>([])

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
    const data = {
      room_id: room.id,
      label: `Benchtop ${benchtops.length + 1}`,
      polygon,
      arc_segments: arcSegs,
      edge_tags: [] as { edge_index: number; type: string }[],
      join_types: [] as { vertex_index: number; join_type: string }[],
      cutout_polygons: [] as Array<Array<{x:number;y:number}>>,
      benchtop_build_method_id: null,
      benchtop_schedule_id: null,
      notes: null,
    }
    const { data: saved, error } = await supabase.from('benchtop_instances').insert(data).select().single()
    if (!error && saved) {
      setBenchtops(bs => [...bs, saved as BenchtopInstance])
      setSelected({ type: 'benchtop', id: (saved as BenchtopInstance).id })
      setMode('select')
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

  async function handleDeleteBenchtop(id: string) {
    if (!confirm('Delete this benchtop?')) return
    captureSnapshot()
    setBenchtops(bs => bs.filter(b => b.id !== id))
    setSelected(null)
    await supabase.from('benchtop_instances').delete().eq('id', id)
  }

  // ── Pointer-down initiators ────────────────────────────────────────────────

  function onBtVertexPointerDown(e: React.PointerEvent, btId: string, vi: number) {
    if (mode !== 'select') return
    const bt = benchtops.find(b => b.id === btId)
    if (!bt) return
    e.stopPropagation()
    svgPointerDownRef.current = true
    svgRef.current?.setPointerCapture(e.pointerId)
    preDragBenchtopsRef.current = benchtopsRef.current
    btVertexDragRef.current = {
      btId, vertexIndex: vi, hasMoved: false,
      originX: e.clientX, originY: e.clientY,
      originalPolygon: bt.polygon,
      currentPolygon: bt.polygon,
    }
  }

  function onBtArcPointerDown(e: React.PointerEvent, btId: string, edgeIndex: number) {
    if (mode !== 'select') return
    const bt = benchtops.find(b => b.id === btId)
    if (!bt) return
    e.stopPropagation()
    svgPointerDownRef.current = true
    svgRef.current?.setPointerCapture(e.pointerId)
    preDragBenchtopsRef.current = benchtopsRef.current
    btArcDragRef.current = {
      btId, edgeIndex, hasMoved: false,
      originX: e.clientX, originY: e.clientY,
      currentArcs: bt.arc_segments ?? [],
    }
  }

  function onBenchtopPointerDown(e: React.PointerEvent, id: string) {
    if (mode !== 'select') return
    const bt = benchtops.find(b => b.id === id)
    if (!bt) return
    svgPointerDownRef.current = true
    svgRef.current?.setPointerCapture(e.pointerId)
    preDragBenchtopsRef.current = benchtopsRef.current
    btMoveDragRef.current = {
      id, originX: e.clientX, originY: e.clientY,
      originalPolygon: bt.polygon,
      originalArcs: bt.arc_segments ?? [],
      hasMoved: false,
    }
  }

  function onBenchtopRotateHandlePointerDown(e: React.PointerEvent, id: string) {
    if (mode !== 'select') return
    const bt = benchtops.find(b => b.id === id)
    if (!bt) return
    e.stopPropagation()
    svgPointerDownRef.current = true
    svgRef.current?.setPointerCapture(e.pointerId)
    preDragBenchtopsRef.current = benchtopsRef.current
    const centX = bt.polygon.reduce((s, pt) => s + pt.x, 0) / bt.polygon.length
    const centY = bt.polygon.reduce((s, pt) => s + pt.y, 0) / bt.polygon.length
    btRotateDragRef.current = {
      id, originX: e.clientX, originY: e.clientY,
      centX, centY,
      startAngle: NaN,  // set on first pointer-move so world coords are available
      hasMoved: false,
      originalPolygon: bt.polygon,
      originalArcs: bt.arc_segments ?? [],
    }
  }

  // ── Click / context-menu handlers ──────────────────────────────────────────

  function onBenchtopEdgeClick(id: string, edgeIndex: number) {
    const bt = benchtops.find(b => b.id === id)
    if (!bt || mode !== 'select') return
    const existing = bt.edge_tags.find(t => t.edge_index === edgeIndex)
    const newType = !existing || existing.type === 'exposed' ? 'wall' : 'exposed'
    const edge_tags = bt.edge_tags.filter(t => t.edge_index !== edgeIndex)
    if (newType === 'wall') edge_tags.push({ edge_index: edgeIndex, type: 'wall' })
    void handleUpdateBenchtop(id, { edge_tags })
  }

  function onBenchtopEdgeShiftClick(id: string, edgeIndex: number) {
    const bt = benchtops.find(b => b.id === id)
    if (!bt || mode !== 'select') return
    const p = bt.polygon[edgeIndex]
    const next = bt.polygon[(edgeIndex + 1) % bt.polygon.length]
    const mid: Pt = { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 }
    const newPolygon = [...bt.polygon.slice(0, edgeIndex + 1), mid, ...bt.polygon.slice(edgeIndex + 1)]
    const oldTag = bt.edge_tags.find(t => t.edge_index === edgeIndex)
    const newEdgeTags = [
      ...bt.edge_tags.map(t => t.edge_index > edgeIndex ? { ...t, edge_index: t.edge_index + 1 } : t),
      ...(oldTag ? [{ edge_index: edgeIndex + 1, type: oldTag.type }] : []),
    ]
    const newJoinTypes = bt.join_types.map(j =>
      j.vertex_index > edgeIndex ? { ...j, vertex_index: j.vertex_index + 1 } : j
    )
    const newArcSegments = (bt.arc_segments ?? [])
      .filter(a => a.edge_index !== edgeIndex)
      .map(a => a.edge_index > edgeIndex ? { ...a, edge_index: a.edge_index + 1 } : a)
    void handleUpdateBenchtop(id, { polygon: newPolygon, edge_tags: newEdgeTags, join_types: newJoinTypes, arc_segments: newArcSegments })
  }

  function onBenchtopEdgeAltClick(id: string, edgeIndex: number) {
    const bt = benchtops.find(b => b.id === id)
    if (!bt || mode !== 'select') return
    const existing = (bt.arc_segments ?? []).find(a => a.edge_index === edgeIndex)
    if (existing) {
      const newArcs = (bt.arc_segments ?? []).filter(a => a.edge_index !== edgeIndex)
      void handleUpdateBenchtop(id, { arc_segments: newArcs })
    } else {
      const p = bt.polygon[edgeIndex]
      const next = bt.polygon[(edgeIndex + 1) % bt.polygon.length]
      const cx2 = (p.x + next.x) / 2, cy2 = (p.y + next.y) / 2
      const len = Math.sqrt((next.x - p.x) ** 2 + (next.y - p.y) ** 2)
      const nx = -(next.y - p.y) / len, ny = (next.x - p.x) / len
      const centX = bt.polygon.reduce((s, pt) => s + pt.x, 0) / bt.polygon.length
      const centY = bt.polygon.reduce((s, pt) => s + pt.y, 0) / bt.polygon.length
      const outward = (nx * (cx2 - centX) + ny * (cy2 - centY)) >= 0 ? 1 : -1
      const newArcs = [...(bt.arc_segments ?? []), { edge_index: edgeIndex, cpx: cx2 + nx * outward * len * 0.25, cpy: cy2 + ny * outward * len * 0.25 }]
      void handleUpdateBenchtop(id, { arc_segments: newArcs })
    }
  }

  function onBenchtopVertexClick(id: string, vertexIndex: number) {
    const bt = benchtops.find(b => b.id === id)
    if (!bt || mode !== 'select') return
    const existing = bt.join_types.find(j => j.vertex_index === vertexIndex)
    const newJoin = !existing || existing.join_type === 'butt' ? 'mitre' : 'butt'
    const join_types = bt.join_types.filter(j => j.vertex_index !== vertexIndex)
    if (newJoin === 'mitre') join_types.push({ vertex_index: vertexIndex, join_type: 'mitre' })
    void handleUpdateBenchtop(id, { join_types })
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
    const bt = benchtops.find(b => b.id === btId)
    if (!bt || bt.polygon.length <= 3) return
    setContextMenu(null)
    const newPolygon = bt.polygon.filter((_, i) => i !== vi)
    const prevEdge = (vi - 1 + bt.polygon.length) % bt.polygon.length
    const newEdgeTags = bt.edge_tags
      .filter(t => t.edge_index !== vi && t.edge_index !== prevEdge)
      .map(t => t.edge_index > vi ? { ...t, edge_index: t.edge_index - 1 } : t)
    const newJoinTypes = bt.join_types
      .filter(j => j.vertex_index !== vi)
      .map(j => j.vertex_index > vi ? { ...j, vertex_index: j.vertex_index - 1 } : j)
    const newArcSegments = (bt.arc_segments ?? [])
      .filter(a => a.edge_index !== vi && a.edge_index !== prevEdge)
      .map(a => a.edge_index > vi ? { ...a, edge_index: a.edge_index - 1 } : a)
    void handleUpdateBenchtop(btId, { polygon: newPolygon, edge_tags: newEdgeTags, join_types: newJoinTypes, arc_segments: newArcSegments })
  }

  function handleRoundCorner(btId: string, vi: number) {
    const bt = benchtops.find(b => b.id === btId)
    if (!bt) return
    setContextMenu(null)
    const n = bt.polygon.length
    const vertex = bt.polygon[vi]
    const prev   = bt.polygon[(vi - 1 + n) % n]
    const next   = bt.polygon[(vi + 1) % n]
    const dx1 = prev.x - vertex.x, dy1 = prev.y - vertex.y
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1)
    const dx2 = next.x - vertex.x, dy2 = next.y - vertex.y
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
    if (len1 < 1 || len2 < 1) return
    const r = Math.min(filletRadius, len1 * 0.4, len2 * 0.4)
    const p1 = { x: vertex.x + (dx1 / len1) * r, y: vertex.y + (dy1 / len1) * r }
    const p2 = { x: vertex.x + (dx2 / len2) * r, y: vertex.y + (dy2 / len2) * r }
    const newPolygon = [...bt.polygon]
    newPolygon.splice(vi, 1, p1, p2)
    const newEdgeTags = bt.edge_tags.map(t =>
      t.edge_index >= vi ? { ...t, edge_index: t.edge_index + 1 } : t
    )
    const newJoinTypes = bt.join_types.map(j =>
      j.vertex_index > vi ? { ...j, vertex_index: j.vertex_index + 1 } : j
    )
    const newArcSegments = [
      ...(bt.arc_segments ?? []).map(a =>
        a.edge_index >= vi ? { ...a, edge_index: a.edge_index + 1 } : a
      ),
      { edge_index: vi, cpx: vertex.x, cpy: vertex.y },
    ]
    void handleUpdateBenchtop(btId, { polygon: newPolygon, edge_tags: newEdgeTags, join_types: newJoinTypes, arc_segments: newArcSegments })
  }

  function handleChamfer(btId: string, vi: number) {
    const bt = benchtops.find(b => b.id === btId)
    if (!bt) return
    setContextMenu(null)
    const n = bt.polygon.length
    const vertex = bt.polygon[vi]
    const prev   = bt.polygon[(vi - 1 + n) % n]
    const next   = bt.polygon[(vi + 1) % n]
    const dx1 = prev.x - vertex.x, dy1 = prev.y - vertex.y
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1)
    const dx2 = next.x - vertex.x, dy2 = next.y - vertex.y
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
    if (len1 < 1 || len2 < 1) return
    const r = Math.min(filletRadius, len1 * 0.4, len2 * 0.4)
    const p1 = { x: vertex.x + (dx1 / len1) * r, y: vertex.y + (dy1 / len1) * r }
    const p2 = { x: vertex.x + (dx2 / len2) * r, y: vertex.y + (dy2 / len2) * r }
    const newPolygon = [...bt.polygon]
    newPolygon.splice(vi, 1, p1, p2)  // straight diagonal — no arc
    const newEdgeTags = bt.edge_tags.map(t =>
      t.edge_index >= vi ? { ...t, edge_index: t.edge_index + 1 } : t
    )
    const newJoinTypes = bt.join_types.map(j =>
      j.vertex_index > vi ? { ...j, vertex_index: j.vertex_index + 1 } : j
    )
    const newArcSegments = (bt.arc_segments ?? []).map(a =>
      a.edge_index >= vi ? { ...a, edge_index: a.edge_index + 1 } : a
    )
    void handleUpdateBenchtop(btId, { polygon: newPolygon, edge_tags: newEdgeTags, join_types: newJoinTypes, arc_segments: newArcSegments })
  }

  // ── Transform operations ──────────────────────────────────────────────────

  function handleMirrorH(btId: string) {
    const bt = benchtops.find(b => b.id === btId)
    if (!bt) return
    const centX = bt.polygon.reduce((s, pt) => s + pt.x, 0) / bt.polygon.length
    const newPolygon = bt.polygon.map(p => ({ x: 2 * centX - p.x, y: p.y })).reverse()
    const newArcs = (bt.arc_segments ?? []).map(a => ({
      ...a,
      edge_index: bt.polygon.length - 1 - a.edge_index,
      cpx: 2 * centX - a.cpx,
    }))
    void handleUpdateBenchtop(btId, { polygon: newPolygon, arc_segments: newArcs })
  }

  function handleMirrorV(btId: string) {
    const bt = benchtops.find(b => b.id === btId)
    if (!bt) return
    const centY = bt.polygon.reduce((s, pt) => s + pt.y, 0) / bt.polygon.length
    const newPolygon = bt.polygon.map(p => ({ x: p.x, y: 2 * centY - p.y })).reverse()
    const newArcs = (bt.arc_segments ?? []).map(a => ({
      ...a,
      edge_index: bt.polygon.length - 1 - a.edge_index,
      cpy: 2 * centY - a.cpy,
    }))
    void handleUpdateBenchtop(btId, { polygon: newPolygon, arc_segments: newArcs })
  }

  function handleOffset(btId: string, amount: number) {
    const bt = benchtops.find(b => b.id === btId)
    if (!bt || bt.polygon.length < 3) return
    const newPoly = offsetPolygon(bt.polygon, amount)
    // Move arc CPs by average displacement of their edge's endpoints
    const disps = bt.polygon.map((p, i) => ({ x: newPoly[i].x - p.x, y: newPoly[i].y - p.y }))
    const n = bt.polygon.length
    const newArcs = (bt.arc_segments ?? []).map(a => {
      const d1 = disps[a.edge_index], d2 = disps[(a.edge_index + 1) % n]
      return { ...a, cpx: a.cpx + (d1.x + d2.x) / 2, cpy: a.cpy + (d1.y + d2.y) / 2 }
    })
    void handleUpdateBenchtop(btId, { polygon: newPoly, arc_segments: newArcs })
  }

  function handleRotateByAngle(btId: string, angleDeg: number) {
    const bt = benchtops.find(b => b.id === btId)
    if (!bt) return
    const centX = bt.polygon.reduce((s, pt) => s + pt.x, 0) / bt.polygon.length
    const centY = bt.polygon.reduce((s, pt) => s + pt.y, 0) / bt.polygon.length
    const rad = (angleDeg * Math.PI) / 180
    const cos = Math.cos(rad), sin = Math.sin(rad)
    const rotate = (p: Pt): Pt => {
      const dx = p.x - centX, dy = p.y - centY
      return { x: centX + dx * cos - dy * sin, y: centY + dx * sin + dy * cos }
    }
    const newPolygon = bt.polygon.map(rotate)
    const newArcs = (bt.arc_segments ?? []).map(a => {
      const r = rotate({ x: a.cpx, y: a.cpy })
      return { ...a, cpx: r.x, cpy: r.y }
    })
    void handleUpdateBenchtop(btId, { polygon: newPolygon, arc_segments: newArcs })
  }

  // ── Cutout operations ──────────────────────────────────────────────────────

  function handleDeleteCutout(btId: string, cutoutIndex: number) {
    const bt = benchtops.find(b => b.id === btId)
    if (!bt) return
    setContextMenu(null)
    const cutout_polygons = (bt.cutout_polygons ?? []).filter((_, i) => i !== cutoutIndex)
    void handleUpdateBenchtop(btId, { cutout_polygons })
  }

  // ── Pointer-move delegation ────────────────────────────────────────────────

  function handlePointerMove(wp: Pt, e: React.PointerEvent): boolean {
    if (btArcDragRef.current) {
      const drag = btArcDragRef.current
      const dx = e.clientX - drag.originX, dy = e.clientY - drag.originY
      if (Math.sqrt(dx * dx + dy * dy) < 4 && !drag.hasMoved) return true
      drag.hasMoved = true
      drag.currentArcs = drag.currentArcs.map(a =>
        a.edge_index === drag.edgeIndex ? { ...a, cpx: wp.x, cpy: wp.y } : a
      )
      setBenchtops(bs => bs.map(b => b.id === drag.btId ? { ...b, arc_segments: drag.currentArcs } : b))
      return true
    }

    if (btMoveDragRef.current) {
      const drag = btMoveDragRef.current
      const screenDx = e.clientX - drag.originX, screenDy = e.clientY - drag.originY
      if (Math.sqrt(screenDx * screenDx + screenDy * screenDy) < 4 && !drag.hasMoved) return true
      drag.hasMoved = true
      const worldDx = screenDx / zoom, worldDy = screenDy / zoom
      const newPolygon = drag.originalPolygon.map(pt => ({ x: pt.x + worldDx, y: pt.y + worldDy }))
      const newArcs = drag.originalArcs.map(a => ({ ...a, cpx: a.cpx + worldDx, cpy: a.cpy + worldDy }))
      setBenchtops(bs => bs.map(b => b.id === drag.id ? { ...b, polygon: newPolygon, arc_segments: newArcs } : b))
      return true
    }

    if (btRotateDragRef.current) {
      const drag = btRotateDragRef.current
      const currentAngle = Math.atan2(wp.y - drag.centY, wp.x - drag.centX)
      if (isNaN(drag.startAngle)) {
        drag.startAngle = currentAngle
        return true
      }
      const screenDx = e.clientX - drag.originX, screenDy = e.clientY - drag.originY
      // Use screen distance to detect movement
      const screenDist = Math.sqrt(screenDx * screenDx + screenDy * screenDy)
      if (screenDist < 4 && !drag.hasMoved) {
        drag.startAngle = currentAngle
        return true
      }
      drag.hasMoved = true
      const delta = currentAngle - drag.startAngle
      const cos = Math.cos(delta), sin = Math.sin(delta)
      const cx = drag.centX, cy = drag.centY
      const newPolygon = drag.originalPolygon.map(pt => {
        const dx = pt.x - cx, dy = pt.y - cy
        return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
      })
      const newArcs = drag.originalArcs.map(a => {
        const dx = a.cpx - cx, dy = a.cpy - cy
        return { ...a, cpx: cx + dx * cos - dy * sin, cpy: cy + dx * sin + dy * cos }
      })
      setBenchtops(bs => bs.map(b => b.id === drag.id ? { ...b, polygon: newPolygon, arc_segments: newArcs } : b))
      return true
    }

    if (btVertexDragRef.current) {
      const drag = btVertexDragRef.current
      const dx = e.clientX - drag.originX, dy = e.clientY - drag.originY
      if (Math.sqrt(dx * dx + dy * dy) < 4 && !drag.hasMoved) return true
      drag.hasMoved = true
      const snapped = snapWorld(wp)
      const newPolygon = drag.originalPolygon.map((pt, i) => i === drag.vertexIndex ? snapped : pt)
      drag.currentPolygon = newPolygon
      setBenchtops(bs => bs.map(b => b.id === drag.btId ? { ...b, polygon: newPolygon } : b))
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

    return false
  }

  // ── Pointer-up delegation ──────────────────────────────────────────────────

  async function handlePointerUp(wp: Pt, e: React.PointerEvent): Promise<boolean> {
    if (btArcDragRef.current) {
      const drag = btArcDragRef.current
      btArcDragRef.current = null
      if (drag.hasMoved) {
        pushSnapshot({ walls: wallsRef.current, cabinets: cabinetsRef.current, benchtops: preDragBenchtopsRef.current })
        const { error } = await supabase.from('benchtop_instances').update({ arc_segments: drag.currentArcs }).eq('id', drag.btId)
        if (error) console.error('Failed to save arc:', error)
      }
      return true
    }

    if (btVertexDragRef.current) {
      const drag = btVertexDragRef.current
      btVertexDragRef.current = null
      if (drag.hasMoved) {
        pushSnapshot({ walls: wallsRef.current, cabinets: cabinetsRef.current, benchtops: preDragBenchtopsRef.current })
        const { error } = await supabase.from('benchtop_instances').update({ polygon: drag.currentPolygon }).eq('id', drag.btId)
        if (error) console.error('Failed to save benchtop polygon:', error)
      } else {
        onBenchtopVertexClick(drag.btId, drag.vertexIndex)
      }
      return true
    }

    if (btMoveDragRef.current) {
      const drag = btMoveDragRef.current
      btMoveDragRef.current = null
      if (drag.hasMoved) {
        const bt = benchtopsRef.current.find(b => b.id === drag.id)
        if (bt) {
          pushSnapshot({ walls: wallsRef.current, cabinets: cabinetsRef.current, benchtops: preDragBenchtopsRef.current })
          const { error } = await supabase.from('benchtop_instances').update({ polygon: bt.polygon, arc_segments: bt.arc_segments }).eq('id', drag.id)
          if (error) console.error('Failed to save benchtop move:', error)
        }
      } else {
        setSelected({ type: 'benchtop', id: drag.id })
      }
      return true
    }

    if (btRotateDragRef.current) {
      const drag = btRotateDragRef.current
      btRotateDragRef.current = null
      if (drag.hasMoved) {
        const bt = benchtopsRef.current.find(b => b.id === drag.id)
        if (bt) {
          pushSnapshot({ walls: wallsRef.current, cabinets: cabinetsRef.current, benchtops: preDragBenchtopsRef.current })
          const { error } = await supabase.from('benchtop_instances').update({ polygon: bt.polygon, arc_segments: bt.arc_segments }).eq('id', drag.id)
          if (error) console.error('Failed to save benchtop rotate:', error)
        }
      }
      return true
    }

    if (mode === 'draw_benchtop_rect') {
      const snapped = snapWorld(wp, btRectStart ?? undefined)
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
      const snapped = snapWorld(wp, btArcMode ? null : (last ?? undefined))

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
      const snapped = snapWorld(wp, last ?? undefined)
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
          const depth = 600
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
      const snapped = snapWorld(wp, last ?? undefined)
      if (btUPoints.length < 3) {
        setBtUPoints(prev => [...prev, snapped])
      } else {
        const [a, b, c] = btUPoints
        const d = snapped
        const polygon = buildUPolygon(a, b, c, d, 600)
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
        const bt = benchtops.find(b => b.id === selId)
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
        setMode('select')
        void handleUpdateBenchtop(selId, { cutout_polygons })
      }
      return true
    }

    return false
  }

  // ── Keyboard helpers ───────────────────────────────────────────────────────

  function resetDraw() {
    setBtDrawPoly([]); setBtDrawCursor(null); setBtDrawArcs([]); setBtArcMode(false); setBtArcMidpoint(null)
    setBtRectStart(null); setBtRectCursor(null)
    setBtLPoints([]); setBtLCursor(null)
    setBtUPoints([]); setBtUCursor(null)
    setBtCutoutStart(null); setBtCutoutCursor(null)
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

  const isDragging = !!(
    btVertexDragRef.current?.hasMoved ||
    btArcDragRef.current?.hasMoved ||
    btMoveDragRef.current?.hasMoved ||
    btRotateDragRef.current?.hasMoved
  )

  return {
    btDrawPoly, btDrawCursor,
    btDrawArcs, btArcMode, btArcMidpoint,
    btRectStart, btRectCursor,
    btLPoints, btLCursor,
    btUPoints, btUCursor,
    btCutoutStart, btCutoutCursor,
    benchtopMenuOpen, setBenchtopMenuOpen,
    isDragging,
    filletRadius, setFilletRadius,

    onBtVertexPointerDown,
    onBtArcPointerDown,
    onBenchtopPointerDown,
    onBenchtopRotateHandlePointerDown,
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

    handlePointerMove,
    handlePointerUp,

    resetDraw,
    undoVertex,
    toggleArcMode,
  }
}
