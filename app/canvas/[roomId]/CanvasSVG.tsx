'use client'
import React, { Fragment, useState, useMemo, useEffect } from 'react'
import { Wall, CabinetInstance, BenchtopInstance, BenchtopArcSegment, BenchtopEdgeProfile } from '@/src/lib/types'
import {
  btSegments, outlinePath, outlineCentroid, outwardNormal, segMid, segLength, waterfallJoin,
  edgePath, edgeProfileColor, effectiveProfileId,
} from '@/src/lib/benchtopGeometry'
import { edgeTape, tapeable, tapeOverridden, tapeColour } from '@/src/lib/benchtopEdgeband'
import type { BtTapeContext } from './useBenchtopCatalog'
import type { ResolvedCabinet, HardwareTurn } from '@/src/lib/resolver/types'
import { turnPoint } from '@/src/lib/resolver/hardwareTurn'
import { customExtents } from '@/src/lib/customPartBox'
import {
  Pt, MIN_WALL_LEN, SNAP_PX,
  toRad, toDeg, dist,
  wallEnd, wallDir, wallPolygon, wallMitrePolygon, wallInwardNormal, centroid,
  cabWallPerp, cabinetPolygon, cabinetCenterPt, cabT, cabinetToPlan, cabinetPlanFrame,
  gridDots,
} from '@/src/lib/geometry'
import { footprintEdgesPlan } from '@/src/lib/cabinetShape/footprint'
import { isShapedPanelKey, zonePartId } from '@/src/lib/cabinetShape/partKeys'
import WallDimensionChain from './WallDimensionChain'
import { Mode, ArmedDefinition, Selected, ViewState, PlaceGhost, CabDrag, CabMoveDrag, CabResize, ContextMenuState, placeInfoFor, SectionCut, isBenchtopMode, type BtShapeEdit, btLocal } from './canvasTypes'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import { casePartItem, kickPartItem, faceZoneItem } from '@/src/lib/displayLayers/registry'
import { handleShape } from '@/src/lib/handleGeometry'
import { customPartItem, CUSTOM_PART_ITEMS } from '@/src/lib/displayLayers/customPartKinds'
import { planShowsCabinet } from '@/src/lib/displayLayers/cabinetShown'
import { roundMm } from '@/src/lib/format'
import { SNAP_KIND_META, type SnapResult } from '@/src/lib/canvasSnap'
import type { PlanGridPrefs } from '@/src/lib/userPrefs'
import { getPalette } from '@/src/lib/partPalette'
import { caseBox, caseBoxAABB, casePlanCorners, isSide, tkPlanBox, tkPlanCorners, tkBoxAABB, zoneBevelOutline, rotEulerXYZ } from '@/src/lib/jointDrilling'
import { dbBox, slideBox } from '@/src/lib/drawerHardwareBoxes'
import { rotatedBoxPolygon } from './cabinetEditSvgHelpers'
import { dbLoadRoomPartDetails, type PartPosOverrides } from './canvasDB'
import { shapedFrontMarks, sweepFlag, type LocalPt } from '@/src/lib/cabinetShape/planSwings'

// Union of cabinet-local plan rects (X along wall, Z = depth) → the cabinet's
// click area. null = nothing of the cabinet is drawn (not selectable, no labels).
type LocalRect = { x: number; z: number; w: number; d: number }
function unionRect(rects: LocalRect[]): LocalRect | null {
  const ok = rects.filter(r => r.w > 0 && r.d > 0)
  if (!ok.length) return null
  const x0 = Math.min(...ok.map(r => r.x)), z0 = Math.min(...ok.map(r => r.z))
  const x1 = Math.max(...ok.map(r => r.x + r.w)), z1 = Math.max(...ok.map(r => r.z + r.d))
  return { x: x0, z: z0, w: x1 - x0, d: z1 - z0 }
}

interface CanvasSVGProps {
  layers: LayerView
  /** Plan reference grid: visibility + spacing (0 = automatic by zoom). */
  planGrid: PlanGridPrefs
  svgRef: React.RefObject<SVGSVGElement | null>
  walls: Wall[]
  cabinets: CabinetInstance[]
  view: ViewState
  svgSize: { w: number; h: number }
  selected: Selected
  mode: Mode
  armedDef: ArmedDefinition | null
  resolvedParts?: Map<string, ResolvedCabinet>
  onCanvasDrop?: (defId: string, clientX: number, clientY: number) => void
  drawStart: Pt | null
  drawCursor: Pt | null
  drawThickness: number
  placeGhost: PlaceGhost | null
  clipboard: CabinetInstance | null
  clipboardGroup: CabinetInstance[]
  cabDrag: CabDrag | null
  cabMoveDrag: CabMoveDrag | null
  cabResize: CabResize | null
  multiSelect: string[]
  marquee: { x1: number; y1: number; x2: number; y2: number } | null
  cursor: string
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onCancelDraw: () => void
  setSelected: (s: Selected) => void
  setContextMenu: (m: ContextMenuState | null) => void
  onWallPointerDown: (e: React.PointerEvent, wallId: string) => void
  onCabinetPointerDown: (e: React.PointerEvent, cab: CabinetInstance) => void
  onCabinetCrosshairClick: (e: React.MouseEvent, cab: CabinetInstance) => void
  onCabinetContextMenu: (e: React.MouseEvent, cabId: string) => void
  onCabinetDoubleClick: (e: React.MouseEvent, cabId: string) => void
  onCabMarkerClick: (e: React.MouseEvent, cab: CabinetInstance, side: 'left' | 'right' | 'front', wall: Wall, perp: Pt) => void
  cabFollowing: { id: string } | null
  onSVGClick: (e: React.MouseEvent) => void
  // Benchtop drawing
  benchtops: BenchtopInstance[]
  selectedBenchtopId: string | null
  btDrawPoly: Pt[]
  btDrawCursor: Pt | null
  onBenchtopClick: (id: string) => void
  onBenchtopEdgeClick: (id: string, edgeIndex: number) => void
  onBenchtopVertexClick: (id: string, vertexIndex: number) => void
  onBenchtopContextMenu: (e: React.MouseEvent, id: string) => void
  onBenchtopEdgeShiftClick: (id: string, edgeIndex: number) => void
  onBenchtopEdgeAltClick: (id: string, edgeIndex: number) => void
  onBtUndoVertex: () => void
  btDrawArcs: BenchtopArcSegment[]
  btArcMode: boolean
  btArcMidpoint: Pt | null
  btRectStart: Pt | null
  btRectCursor: Pt | null
  onBenchtopVertexContextMenu: (e: React.MouseEvent, btId: string, vi: number) => void
  onBenchtopPointerDown: (e: React.PointerEvent, id: string) => void
  // L-shape / U-shape draw state
  btLPoints: Pt[]
  btLCursor: Pt | null
  btUPoints: Pt[]
  btUCursor: Pt | null
  // Cutout draw state
  btCutoutStart: Pt | null
  btCutoutCursor: Pt | null
  // Join line draw state + edge profile display (Phase 3)
  btJoinStart?: Pt | null
  btJoinCursor?: Pt | null
  edgeProfiles?: Record<string, BenchtopEdgeProfile>
  /** The build method default profile for a benchtop (edges with no profile of their own). */
  btDefaultProfileId?: (bt: BenchtopInstance) => string | null
  onBenchtopDoubleClick?: (id: string) => void
  // Move command preview (Phase 3b): base point picked, cursor = target
  btMoveBase?: Pt | null
  btMoveCursor?: Pt | null
  /** L / U quick-draw depth (draw panel) — previews match what will be saved. */
  btDepth?: number
  /** In-plan shape edit (Phase 6): the working outline + a press on a corner / edge. */
  btShapeEdit?: BtShapeEdit | null
  onShapeHandleDown?: (e: React.PointerEvent, kind: 'v' | 'e', i: number) => void
  /** Edit edges (Phase 7b): panel hover lights an edge; the working copy's edges are painted on click. */
  btEdgeHover?: { btId: string; i: number } | null
  btEdgeEdit?: import('./canvasTypes').BtEdgeEdit | null
  onBtEdgePaint?: (i: number, reset: boolean) => void
  onBtEdgeHover?: (i: number | null) => void
  btTapeIds?: string[]
  btTapeContextFor?: (bt: BenchtopInstance) => BtTapeContext
  // Section cut
  sectionCut?: SectionCut | null
  onSectionFlipLook?: () => void
  onSectionClear?: () => void
  onSectionLinePointerDown?: (e: React.PointerEvent) => void
  // Snapping + measure
  snapResult: SnapResult | null
  measureStart: Pt | null
  measureEnd: Pt | null
  measureCursor: Pt | null
  onMeasureCancel?: () => void
  /** Fixtures & appliances (z_fixtures) — drawn in world space above cabinets. */
  fixturesLayer?: React.ReactNode
}

export default function CanvasSVG({
  svgRef, walls, cabinets, view, svgSize, selected, mode, armedDef, onCanvasDrop, layers, planGrid,
  drawStart, drawCursor, drawThickness, placeGhost, clipboard, clipboardGroup, cabDrag, cabMoveDrag, cabResize, multiSelect, marquee, cursor,
  onPointerDown, onPointerMove, onPointerUp, onCancelDraw,
  setSelected, setContextMenu, onWallPointerDown, onCabinetPointerDown, onCabinetCrosshairClick, onCabinetContextMenu, onCabinetDoubleClick,
  onCabMarkerClick, cabFollowing, onSVGClick,
  benchtops, selectedBenchtopId, btDrawPoly, btDrawCursor, onBenchtopClick, onBenchtopEdgeClick, onBenchtopVertexClick,
  onBenchtopContextMenu, onBenchtopEdgeShiftClick, onBenchtopEdgeAltClick, onBtUndoVertex,
  btDrawArcs, btArcMode, btArcMidpoint, btRectStart, btRectCursor,
  onBenchtopVertexContextMenu, onBenchtopPointerDown,
  btLPoints, btLCursor,
  btUPoints, btUCursor,
  btCutoutStart, btCutoutCursor,
  btJoinStart, btJoinCursor, edgeProfiles, btDefaultProfileId, onBenchtopDoubleClick, btMoveBase, btMoveCursor, btDepth,
  btShapeEdit, onShapeHandleDown, btEdgeHover, btEdgeEdit, onBtEdgePaint, onBtEdgeHover, btTapeIds, btTapeContextFor,
  sectionCut, onSectionFlipLook, onSectionClear, onSectionLinePointerDown,
  snapResult, measureStart, measureEnd, measureCursor, onMeasureCancel,
  resolvedParts, fixturesLayer,
}: CanvasSVGProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // Editable part-line palette (src/lib/partPalette.ts); read once on mount.
  const palette = useMemo(() => getPalette(), [])

  // Per-part position / size / rotation overrides (part editor) — fronts are drawn
  // with them applied so plan matches 3D. Re-fetched when the resolved map changes
  // (an edit re-resolves → new map), same as Room3DScene.
  const cabIdsKey = cabinets.map(c => c.id).join(',')
  const [posOvById, setPosOvById] = useState<Map<string, PartPosOverrides>>(new Map())
  useEffect(() => {
    let cancelled = false
    dbLoadRoomPartDetails(cabIdsKey ? cabIdsKey.split(',') : []).then(d => { if (!cancelled) setPosOvById(d.posById) })
    return () => { cancelled = true }
  }, [cabIdsKey, resolvedParts])

  const cx = centroid(walls)
  // Dimension chains measure only cabinets the layer set draws.
  const chainCabs = cabinets.filter(c => planShowsCabinet(c, layers, resolvedParts?.get(c.id)))
  const dots = planGrid.visible
    ? gridDots(view.panX, view.panY, view.zoom, svgSize.w, svgSize.h, planGrid.step)
    : []
  const dotR = 1.5 / view.zoom
  const wallNameFs = 14 / view.zoom
  const cabLabelFs = 11 / view.zoom
  const cabDimFs   = 9 / view.zoom

  const drawLen = drawStart && drawCursor ? Math.round(dist(drawStart, drawCursor)) : 0
  const drawMidX = drawStart && drawCursor ? (drawStart.x + drawCursor.x) / 2 : 0
  const drawMidY = drawStart && drawCursor ? (drawStart.y + drawCursor.y) / 2 : 0

  return (
    <svg
      ref={svgRef}
      className="flex-1 bg-gray-950 select-none"
      style={{ cursor, background: layers.background }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onSVGClick}
      onDragOver={onCanvasDrop ? (e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }) : undefined}
      onDrop={onCanvasDrop ? (e => {
        e.preventDefault()
        const id = e.dataTransfer.getData('application/x-rhk-cab-def')
        if (id) onCanvasDrop(id, e.clientX, e.clientY)
      }) : undefined}
      onContextMenu={e => {
        e.preventDefault()
        if (mode === 'draw_wall' || mode === 'draw_island') onCancelDraw()
        if (mode === 'draw_benchtop') onBtUndoVertex()
        if (mode === 'measure') onMeasureCancel?.()
      }}
    >
      <g transform={`translate(${view.panX},${view.panY}) scale(${view.zoom})`}>

        {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={dotR} fill="#1f2937" />)}

        <line x1={-30 / view.zoom} y1={0} x2={30 / view.zoom} y2={0} stroke="#374151" strokeWidth={1 / view.zoom} />
        <line x1={0} y1={-30 / view.zoom} x2={0} y2={30 / view.zoom} stroke="#374151" strokeWidth={1 / view.zoom} />

        {/* ── Benchtop instances ── rendered below walls so cabinets/walls sit on top.
            Outline from segments (Phase 3); edge finishes + join lines are
            their own layer items (benchtop_edges / benchtop_joins). */}
        {layers.show('benchtops') && benchtops.map(bt => {
          // Phase 6: the top being shaped draws its working outline; the others dim.
          const shaping = mode === 'edit_benchtop_shape' && btShapeEdit?.btId === bt.id
          const edging = mode === 'edit_benchtop_edges' && btEdgeEdit?.btId === bt.id
          const dimmed = (mode === 'edit_benchtop_shape' && !shaping) || (mode === 'edit_benchtop_edges' && !edging)
          const segs = shaping ? btShapeEdit!.segs : edging ? btEdgeEdit!.segs : btSegments(bt)
          if (segs.length < 2) return null
          const isSel = bt.id === selectedBenchtopId
          const c = outlineCentroid(segs)
          const bcx = c.x, bcy = c.y
          const vr = 5 / view.zoom
          const er = 6 / view.zoom
          const defaultProfileId = btDefaultProfileId?.(bt) ?? null
          const showEdges = layers.show('benchtop_edges')
          const showJoins = layers.show('benchtop_joins')
          const handles = isSel && mode === 'benchtop_select'   // edit handles only in F4 Benchtop mode

          return (
            <g key={bt.id} opacity={dimmed ? 0.35 : undefined}>
              {/* Fill + border (evenodd fill-rule creates cutout holes) */}
              <path
                d={outlinePath(segs, bt.cutout_polygons ?? [])}
                fillRule="evenodd"
                fill={layers.colorOf('benchtops') ?? (isSel ? 'rgba(20,184,166,0.22)' : 'rgba(20,184,166,0.10)')}
                fillOpacity={layers.colorOf('benchtops') ? (isSel ? 0.22 : 0.1) : undefined}
                stroke={isSel ? '#f59e0b' : layers.color('benchtops', '#0d9488')}
                opacity={layers.op('benchtops')}
                strokeWidth={layers.w('benchtops', isSel ? 2 : 1.5) / view.zoom}
                // Only Select mode owns the click: draw tools (cutouts, joins) need the
                // pointer to reach the SVG handlers, which start the click.
                onPointerDown={e => { if (mode !== 'benchtop_select') return; e.stopPropagation(); onBenchtopPointerDown(e, bt.id) }}
                onClick={e => { if (mode !== 'benchtop_select') return; e.stopPropagation(); onBenchtopClick(bt.id) }}
                onDoubleClick={e => { e.stopPropagation(); onBenchtopDoubleClick?.(bt.id) }}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onBenchtopContextMenu(e, bt.id) }}
                // Only F4 Benchtop mode can pick a top (click selects, never drags —
                // P-f); everywhere else tops are click-through so cabinets own clicks.
                style={{ cursor: mode === 'benchtop_select' ? 'pointer' : undefined, pointerEvents: mode === 'benchtop_select' ? undefined : 'none' }}
              />

              {/* Edge finishes: wall edges grey, exposed edges in their profile colour + code */}
              {showEdges && !edging && segs.map((s, i) => {
                const pid = effectiveProfileId(s, defaultProfileId)
                const prof = pid ? edgeProfiles?.[pid] : undefined
                const n = outwardNormal(segs, i)
                const m = segMid(s)
                const off = 4 / view.zoom
                const col = s.edge?.wall ? '#6b7280' : edgeProfileColor(prof)
                return (
                  <g key={`ef${i}`} style={{ pointerEvents: 'none' }} opacity={layers.op('benchtop_edges')}>
                    <path d={edgePath(s)} fill="none" stroke={layers.color('benchtop_edges', col)}
                      strokeWidth={layers.w('benchtop_edges', s.edge?.wall ? 3 : 2.5) / view.zoom}
                      strokeDasharray={s.edge?.wall ? `${4 / view.zoom} ${3 / view.zoom}` : undefined}
                      transform={`translate(${n.x * off} ${n.y * off})`} />
                    {!s.edge?.wall && prof && (
                      <text x={m.x + n.x * 14 / view.zoom} y={m.y + n.y * 14 / view.zoom}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={8 * layers.w('benchtop_edges', 1) / view.zoom} fontWeight={600}
                        fill={layers.color('benchtop_edges', col)}
                        style={{ userSelect: 'none' }}>
                        {prof.code ?? prof.name}{prof.generates === 'waterfall' ? (waterfallJoin(s) === 'mitre' ? ' ▼M' : ' ▼B') : ''}
                      </text>
                    )}
                  </g>
                )
              })}

              {/* Edit edges (Phase 7b): the working copy's edges in the active tab's
                  colours, clickable. Mode feedback like the shape-edit handles —
                  not a layer item. */}
              {edging && (() => {
                const ee = btEdgeEdit!
                const ctx = btTapeContextFor?.(bt) ?? { applies: false, defaultTape: null }
                const defPid = btDefaultProfileId?.(bt) ?? null
                const off = 4 / view.zoom
                return segs.map((s, i) => {
                  const pid = effectiveProfileId(s, defPid)
                  const prof = pid ? edgeProfiles?.[pid] : undefined
                  const wall = !!s.edge?.wall
                  let col = '#6b7280', w = 1.5, faded = false, label: string | null = null, clickable = true
                  if (ee.tab === 'profile') {
                    if (wall) { w = 3 } else if (prof) {
                      col = edgeProfileColor(prof); w = 4; faded = !s.edge?.profile_id
                      label = (prof.code ?? prof.name) + (prof.generates === 'waterfall' ? (waterfallJoin(s) === 'mitre' ? ' ▼M' : ' ▼B') : '')
                    }
                  } else {
                    clickable = ctx.applies && tapeable(s, prof)
                    const t = ctx.applies ? edgeTape(s, prof, ctx.defaultTape) : null
                    if (t) { col = tapeColour(t, btTapeIds ?? []); w = 4; faded = !tapeOverridden(s) }
                    else if (!wall && !clickable) col = '#a855f7'
                  }
                  const n = outwardNormal(segs, i)
                  const m = segMid(s)
                  const lit = btEdgeHover?.btId === bt.id && btEdgeHover.i === i
                  return (
                    <g key={`ee${i}`} transform={`translate(${n.x * off} ${n.y * off})`}>
                      {(lit || ee.sel === i) && clickable && (
                        <path d={edgePath(s)} fill="none" stroke="#fbbf24" strokeOpacity={lit ? 0.8 : 0.35}
                          strokeWidth={9 / view.zoom} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
                      )}
                      <path d={edgePath(s)} fill="none" stroke={col} strokeOpacity={faded ? 0.55 : 1}
                        strokeWidth={w / view.zoom} strokeLinecap="round"
                        strokeDasharray={wall ? `${4 / view.zoom} ${3 / view.zoom}` : undefined} style={{ pointerEvents: 'none' }} />
                      {label && (
                        <text x={m.x + n.x * 12 / view.zoom} y={m.y + n.y * 12 / view.zoom} textAnchor="middle" dominantBaseline="middle"
                          fontSize={8 / view.zoom} fontWeight={600} fill={col} style={{ userSelect: 'none', pointerEvents: 'none' }}>{label}</text>
                      )}
                      <path d={edgePath(s)} fill="none" stroke="transparent" strokeWidth={14 / view.zoom}
                        style={{ pointerEvents: 'stroke', cursor: clickable ? 'pointer' : 'not-allowed' }}
                        onPointerDown={e => { e.stopPropagation() }}
                        onClick={e => { e.stopPropagation(); if (clickable) onBtEdgePaint?.(i, e.altKey) }}
                        onMouseEnter={() => onBtEdgeHover?.(i)} onMouseLeave={() => onBtEdgeHover?.(null)} />
                    </g>
                  )
                })
              })()}

              {/* Join lines — B = butt, M = mitre */}
              {showJoins && (bt.joins ?? []).map((j, i) => {
                const mx = (j.p0.x + j.p1.x) / 2, my = (j.p0.y + j.p1.y) / 2
                const col = layers.color('benchtop_joins', '#ef4444')
                return (
                  <g key={`j${i}`} style={{ pointerEvents: 'none' }} opacity={layers.op('benchtop_joins')}>
                    <line x1={j.p0.x} y1={j.p0.y} x2={j.p1.x} y2={j.p1.y} stroke={col}
                      strokeWidth={layers.w('benchtop_joins', 1.5) / view.zoom}
                      strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`} />
                    <circle cx={mx} cy={my} r={6 / view.zoom} fill="#111827" stroke={col} strokeWidth={1 / view.zoom} />
                    <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle"
                      fontSize={7 / view.zoom} fill={col} style={{ userSelect: 'none' }}>
                      {j.type === 'mitre' ? 'M' : 'B'}
                    </text>
                  </g>
                )
              })}

              {/* Label */}
              <text x={bcx} y={bcy} textAnchor="middle" dominantBaseline="middle"
                fontSize={11 / view.zoom} fill={isSel ? '#fcd34d' : '#5eead4'}
                style={{ userSelect: 'none', pointerEvents: 'none' }}>
                {bt.label ?? '—'}
              </text>

              {/* Edge midpoint handles — click = wall/exposed, shift = insert vertex, alt = curve */}
              {handles && segs.map((s, i) => {
                const { x: mx, y: my } = segMid(s)
                const isCurve = s.type !== 'line'
                const isWallEdge = !!s.edge?.wall
                const hFill = isCurve ? '#7c3aed' : isWallEdge ? '#6b7280' : '#0d9488'
                const hStroke = isCurve ? '#a78bfa' : isWallEdge ? '#9ca3af' : '#14b8a6'
                const hLabel = isWallEdge ? 'W' : 'E'
                const hTextFill = isCurve ? '#e9d5ff' : isWallEdge ? '#d1d5db' : '#ccfbf1'
                // A plain curve's midpoint handle is its drag handle (below) — put the tag beside it.
                const tagOff = s.type === 'curve' ? er * 2.4 : 0
                const n = outwardNormal(segs, i)
                const tx = mx - n.x * tagOff, ty = my - n.y * tagOff
                return (
                  <g key={`e${i}`}>
                    <rect
                      x={tx - er} y={ty - er} width={er * 2} height={er * 2}
                      rx={isCurve ? er : 1.5 / view.zoom}
                      fill={hFill} stroke={hStroke} strokeWidth={1 / view.zoom}
                      onClick={e => {
                        e.stopPropagation()
                        if (e.shiftKey) onBenchtopEdgeShiftClick(bt.id, i)
                        else if (e.altKey) onBenchtopEdgeAltClick(bt.id, i)
                        else onBenchtopEdgeClick(bt.id, i)
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <title>{`${isWallEdge ? 'Wall' : 'Exposed'} edge · click to set ${isWallEdge ? 'exposed' : 'wall'} · Alt-click to ${isCurve ? 'straighten' : 'curve'} · Shift-click to insert vertex`}</title>
                    </rect>
                    <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
                      fontSize={er * 1.1} fill={hTextFill}
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>
                      {hLabel}
                    </text>
                  </g>
                )
              })}

              {/* Edge length labels when selected */}
              {isSel && segs.map((s, i) => {
                const len = Math.round(segLength(s))
                if (len < 1) return null
                const m = segMid(s)
                const n = outwardNormal(segs, i)
                const off = (showEdges ? 26 : 18) / view.zoom
                return (
                  <text
                    key={`len${i}`}
                    x={m.x + n.x * off} y={m.y + n.y * off}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={9 / view.zoom} fill={s.type !== 'line' ? '#c4b5fd' : '#94a3b8'}
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                  >
                    {s.type !== 'line' ? `~${len}` : len}
                  </text>
                )
              })}

              {/* Phase 6 edit handles: press an edge (straight = push / pull, curve =
                  bulge), a corner (drag), double-click an edge = add a corner. */}
              {shaping && onShapeHandleDown && (() => {
                const sel = btShapeEdit!.sel
                const hit = 14 / view.zoom
                const fr = btShapeEdit!.frame
                const ax = 60 / view.zoom
                const fs = 9 / view.zoom
                const pick = sel?.kind === 'v' ? segs[sel.i]?.p0 : null
                const pl = pick ? btLocal(fr, pick) : null
                return (
                  <g>
                    {/* 0,0 = back-left corner; arrows show +X / +Y for the typed corner coordinates */}
                    <g style={{ pointerEvents: 'none' }} stroke="#22c55e" strokeWidth={1.5 / view.zoom} fill="#22c55e">
                      <line x1={fr.o.x} y1={fr.o.y} x2={fr.o.x + fr.d.x * ax} y2={fr.o.y + fr.d.y * ax} />
                      <line x1={fr.o.x} y1={fr.o.y} x2={fr.o.x + fr.n.x * ax} y2={fr.o.y + fr.n.y * ax} />
                      <circle cx={fr.o.x} cy={fr.o.y} r={3.5 / view.zoom} />
                      <text x={fr.o.x + fr.d.x * ax * 1.15} y={fr.o.y + fr.d.y * ax * 1.15} fontSize={fs} stroke="none" textAnchor="middle" dominantBaseline="middle">X</text>
                      <text x={fr.o.x + fr.n.x * ax * 1.15} y={fr.o.y + fr.n.y * ax * 1.15} fontSize={fs} stroke="none" textAnchor="middle" dominantBaseline="middle">Y</text>
                      <text x={fr.o.x - (fr.d.x + fr.n.x) * 14 / view.zoom} y={fr.o.y - (fr.d.y + fr.n.y) * 14 / view.zoom} fontSize={fs} stroke="none" textAnchor="middle" dominantBaseline="middle">0,0</text>
                    </g>
                    {pick && pl && (
                      <text x={pick.x} y={pick.y - 16 / view.zoom} fontSize={10 / view.zoom} fill="#fbbf24" textAnchor="middle"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}>{Math.round(pl.x)}, {Math.round(pl.y)}</text>
                    )}
                    {segs.map((s, i) => {
                      const on = sel?.kind === 'e' && sel.i === i
                      return (
                        <g key={`se${i}`}>
                          {on && <path d={edgePath(s)} fill="none" stroke="#f59e0b" strokeWidth={3 / view.zoom} style={{ pointerEvents: 'none' }} />}
                          {/* The selected edge's start corner (typed length: "Start fixed") */}
                          {on && <circle cx={s.p0.x} cy={s.p0.y} r={9 / view.zoom} fill="none" stroke="#22c55e" strokeWidth={2 / view.zoom} style={{ pointerEvents: 'none' }} />}
                          <path d={edgePath(s)} fill="none" stroke="transparent" strokeWidth={hit}
                            style={{ cursor: s.type === 'line' ? (Math.abs(s.p1.x - s.p0.x) > Math.abs(s.p1.y - s.p0.y) ? 'ns-resize' : 'ew-resize') : 'pointer' }}
                            onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); onShapeHandleDown(e, 'e', i) }}>
                            <title>{s.type === 'line'
                              ? 'Click to stretch (follows the mouse, click to place) · drag to move · Shift-click to add a corner · Alt-click to curve'
                              : 'Alt-click to straighten · drag the round handle to change the curve'}</title>
                          </path>
                          {s.type !== 'line' && (() => {
                            const m = segMid(s)
                            return (
                              <circle cx={m.x} cy={m.y} r={5 / view.zoom} fill="#7c3aed" stroke="#e9d5ff" strokeWidth={1 / view.zoom}
                                style={{ cursor: 'grab' }}
                                onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); onShapeHandleDown(e, 'e', i) }} />
                            )
                          })()}
                        </g>
                      )
                    })}
                    {segs.map((s, i) => {
                      const on = sel?.kind === 'v' && sel.i === i
                      return (
                        <rect key={`sv${i}`}
                          x={s.p0.x - (on ? 7 : 5.5) / view.zoom} y={s.p0.y - (on ? 7 : 5.5) / view.zoom}
                          width={(on ? 14 : 11) / view.zoom} height={(on ? 14 : 11) / view.zoom}
                          fill={on ? '#f59e0b' : '#f8fafc'} stroke="#0f172a" strokeWidth={1.2 / view.zoom}
                          style={{ cursor: 'crosshair' }}
                          onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); onShapeHandleDown(e, 'v', i) }}>
                          <title>Click to type its X / Y · drag to move it (snaps) · Delete removes it</title>
                        </rect>
                      )
                    })}
                  </g>
                )
              })()}

              {/* Vertex markers when selected — right-click only; reshaping is in the
                  Shape Editor (double-click), never a drag on the plan (P-f). */}
              {handles && segs.map((s, i) => (
                <circle
                  key={`v${i}`}
                  cx={s.p0.x} cy={s.p0.y} r={vr}
                  fill="#14b8a6" stroke="#111827" strokeWidth={1 / view.zoom}
                  onPointerDown={e => e.stopPropagation()}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onBenchtopVertexContextMenu(e, bt.id, i) }}
                  style={{ cursor: 'context-menu' }}
                >
                  <title>Right-click for round / chamfer / remove · double-click the top to reshape</title>
                </circle>
              ))}

            </g>
          )
        })}

        {/* ── Move command preview: ghost of the selected top at the target ── */}
        {mode === 'move_benchtop' && btMoveBase && btMoveCursor && (() => {
          const mv = benchtops.find(b => b.id === selectedBenchtopId)
          if (!mv) return null
          const dx = btMoveCursor.x - btMoveBase.x, dy = btMoveCursor.y - btMoveBase.y
          return (
            <g style={{ pointerEvents: 'none' }}>
              <path d={outlinePath(btSegments(mv))} transform={`translate(${dx} ${dy})`}
                fill="rgba(245,158,11,0.10)" stroke="#f59e0b" strokeWidth={1.5 / view.zoom}
                strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`} />
              <line x1={btMoveBase.x} y1={btMoveBase.y} x2={btMoveCursor.x} y2={btMoveCursor.y}
                stroke="#f59e0b" strokeWidth={1 / view.zoom} />
              <circle cx={btMoveBase.x} cy={btMoveBase.y} r={4 / view.zoom} fill="#f59e0b" />
              <text x={(btMoveBase.x + btMoveCursor.x) / 2} y={(btMoveBase.y + btMoveCursor.y) / 2 - 10 / view.zoom}
                textAnchor="middle" fontSize={10 / view.zoom} fill="#fcd34d">{Math.round(Math.hypot(dx, dy))}</text>
            </g>
          )
        })()}

        {/* ── In-progress join line ── */}
        {mode === 'draw_benchtop_join' && btJoinStart && btJoinCursor && (
          <g style={{ pointerEvents: 'none' }}>
            <line x1={btJoinStart.x} y1={btJoinStart.y} x2={btJoinCursor.x} y2={btJoinCursor.y}
              stroke="#ef4444" strokeWidth={1.5 / view.zoom} strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`} />
            <circle cx={btJoinStart.x} cy={btJoinStart.y} r={4 / view.zoom} fill="#ef4444" />
            <text x={(btJoinStart.x + btJoinCursor.x) / 2} y={(btJoinStart.y + btJoinCursor.y) / 2 - 10 / view.zoom}
              textAnchor="middle" fontSize={10 / view.zoom} fill="#fca5a5">{Math.round(dist(btJoinStart, btJoinCursor))}</text>
          </g>
        )}
        {mode === 'draw_benchtop_join' && !btJoinStart && btJoinCursor && (
          <circle cx={btJoinCursor.x} cy={btJoinCursor.y} r={4 / view.zoom} fill="none" stroke="#ef4444"
            strokeWidth={1.5 / view.zoom} style={{ pointerEvents: 'none' }} />
        )}

        {/* ── In-progress benchtop polygon ── */}
        {mode === 'draw_benchtop' && (() => {
          const snapDist = SNAP_PX / view.zoom
          const nearClose = btDrawPoly.length >= 3 && btDrawCursor != null && dist(btDrawCursor, btDrawPoly[0]) < snapDist
          const last = btDrawPoly.length > 0 ? btDrawPoly[btDrawPoly.length - 1] : null
          const segLen = last && btDrawCursor ? Math.round(dist(last, btDrawCursor)) : 0
          const segAngle = last && btDrawCursor ? Math.round(toDeg(Math.atan2(btDrawCursor.y - last.y, btDrawCursor.x - last.x))) : 0
          const labelFs = 10 / view.zoom
          const labelPad = 6 / view.zoom

          // Arc preview: if btArcMidpoint set, compute bezier CP and show curve
          const showArcPreview = btArcMode && btArcMidpoint != null && last != null && btDrawCursor != null
          const arcCpx = showArcPreview ? 2 * btArcMidpoint!.x - (last!.x + btDrawCursor!.x) / 2 : 0
          const arcCpy = showArcPreview ? 2 * btArcMidpoint!.y - (last!.y + btDrawCursor!.y) / 2 : 0

          return (
            <Fragment>
              {/* Committed segments (including any arc segments already placed) */}
              {btDrawPoly.length >= 2 && (() => {
                let d = `M ${btDrawPoly[0].x} ${btDrawPoly[0].y}`
                for (let i = 0; i < btDrawPoly.length - 1; i++) {
                  const next = btDrawPoly[i + 1]
                  const arc = btDrawArcs.find(a => a.edge_index === i)
                  d += arc ? ` Q ${arc.cpx} ${arc.cpy} ${next.x} ${next.y}` : ` L ${next.x} ${next.y}`
                }
                return (
                  <path d={d} fill="none" stroke="#14b8a6"
                    strokeWidth={1.5 / view.zoom}
                    strokeDasharray={`${8 / view.zoom} ${4 / view.zoom}`}
                    style={{ pointerEvents: 'none' }}
                  />
                )
              })()}

              {/* Live segment/arc to cursor */}
              {last && btDrawCursor && !nearClose && !showArcPreview && (
                <line
                  x1={last.x} y1={last.y}
                  x2={btDrawCursor.x} y2={btDrawCursor.y}
                  stroke={btArcMode ? '#a855f7' : '#14b8a6'} strokeWidth={1.5 / view.zoom}
                  strokeDasharray={`${5 / view.zoom} ${3 / view.zoom}`}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Arc curve preview when midpoint is placed */}
              {showArcPreview && (
                <path
                  d={`M ${last!.x} ${last!.y} Q ${arcCpx} ${arcCpy} ${btDrawCursor!.x} ${btDrawCursor!.y}`}
                  fill="none" stroke="#a855f7" strokeWidth={1.5 / view.zoom}
                  strokeDasharray={`${5 / view.zoom} ${3 / view.zoom}`}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Arc midpoint dot */}
              {btArcMidpoint && (
                <circle cx={btArcMidpoint.x} cy={btArcMidpoint.y} r={3.5 / view.zoom}
                  fill="#a855f7" stroke="#111827" strokeWidth={1 / view.zoom}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Snap ring on first vertex when close enough to close */}
              {nearClose && (
                <circle
                  cx={btDrawPoly[0].x} cy={btDrawPoly[0].y}
                  r={snapDist}
                  fill="rgba(20,184,166,0.25)" stroke="#14b8a6"
                  strokeWidth={1.5 / view.zoom}
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {/* Placed vertex dots */}
              {btDrawPoly.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={4 / view.zoom}
                  fill={i === 0 ? '#14b8a6' : '#e5e7eb'}
                  stroke="#0d9488" strokeWidth={1 / view.zoom}
                  style={{ pointerEvents: 'none' }}
                />
              ))}
              {/* Cursor dot — purple in arc mode */}
              {btDrawCursor && !nearClose && (
                <circle cx={btDrawCursor.x} cy={btDrawCursor.y} r={3 / view.zoom}
                  fill={btArcMode ? '#a855f7' : '#f59e0b'} stroke="#111827" strokeWidth={1 / view.zoom}
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {/* Arc mode badge near cursor */}
              {btArcMode && btDrawCursor && !nearClose && (
                <text x={btDrawCursor.x + 8 / view.zoom} y={btDrawCursor.y - 8 / view.zoom}
                  fontSize={8 / view.zoom} fill="#a855f7"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {btArcMidpoint ? 'arc→end' : 'arc mid'}
                </text>
              )}
              {/* Segment length + angle readout near cursor */}
              {last && btDrawCursor && segLen > 0 && !nearClose && !btArcMode && (
                <g style={{ pointerEvents: 'none' }}>
                  <rect
                    x={btDrawCursor.x + labelPad} y={btDrawCursor.y - labelFs * 1.5 - labelPad}
                    width={labelFs * 5.5} height={labelFs * 3 + labelPad}
                    rx={2 / view.zoom}
                    fill="rgba(17,24,39,0.85)" stroke="#374151" strokeWidth={0.5 / view.zoom}
                  />
                  <text x={btDrawCursor.x + labelPad * 2} y={btDrawCursor.y - labelFs * 0.5}
                    fontSize={labelFs} fill="#f3f4f6"
                    style={{ userSelect: 'none' }}>
                    {segLen}mm
                  </text>
                  <text x={btDrawCursor.x + labelPad * 2} y={btDrawCursor.y + labelFs * 0.8}
                    fontSize={labelFs * 0.85} fill="#9ca3af"
                    style={{ userSelect: 'none' }}>
                    {segAngle < 0 ? segAngle + 360 : segAngle}°
                  </text>
                </g>
              )}
            </Fragment>
          )
        })()}

        {/* ── In-progress L-shape benchtop ── */}
        {mode === 'draw_benchtop_l' && (() => {
          const snapDist = SNAP_PX / view.zoom
          return (
            <Fragment>
              {/* Placed corner dots */}
              {btLPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={4 / view.zoom}
                  fill={i === 0 ? '#14b8a6' : '#f59e0b'} stroke="#111827" strokeWidth={1 / view.zoom}
                  style={{ pointerEvents: 'none' }} />
              ))}

              {/* Preview line from last placed to cursor */}
              {btLPoints.length > 0 && btLCursor && (
                <line
                  x1={btLPoints[btLPoints.length - 1].x} y1={btLPoints[btLPoints.length - 1].y}
                  x2={btLCursor.x} y2={btLCursor.y}
                  stroke="#14b8a6" strokeWidth={1.5 / view.zoom}
                  strokeDasharray={`${5 / view.zoom} ${3 / view.zoom}`}
                  style={{ pointerEvents: 'none' }} />
              )}

              {/* L-shape preview after 2 points placed */}
              {btLPoints.length === 2 && btLCursor && (() => {
                const [a, b] = btLPoints
                const c = btLCursor
                const d1x = b.x - a.x, d1y = b.y - a.y
                const d1len = Math.sqrt(d1x * d1x + d1y * d1y)
                const d2x = c.x - b.x, d2y = c.y - b.y
                const d2len = Math.sqrt(d2x * d2x + d2y * d2y)
                if (d1len < 1 || d2len < 1) return null
                const u1x = d1x / d1len, u1y = d1y / d1len
                const u2x = d2x / d2len, u2y = d2y / d2len
                const cross = u1x * u2y - u1y * u2x
                const sign = cross >= 0 ? 1 : -1
                const depth = btDepth ?? 600
                const p1x = sign * u1y, p1y = -sign * u1x
                const p2x = sign * u2y, p2y = -sign * u2x
                const polygon = [
                  a,
                  { x: a.x + depth * p1x, y: a.y + depth * p1y },
                  { x: b.x + depth * p1x + depth * p2x, y: b.y + depth * p1y + depth * p2y },
                  { x: c.x + depth * p2x, y: c.y + depth * p2y },
                  c,
                  b,
                ]
                const pts2 = polygon.map(p => `${p.x},${p.y}`).join(' ')
                return (
                  <polygon points={pts2}
                    fill="rgba(20,184,166,0.12)" stroke="#14b8a6"
                    strokeWidth={1.5 / view.zoom}
                    strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`}
                    style={{ pointerEvents: 'none' }} />
                )
              })()}

              {/* Cursor dot */}
              {btLCursor && (
                <circle cx={btLCursor.x} cy={btLCursor.y} r={3 / view.zoom}
                  fill="#f59e0b" stroke="#111827" strokeWidth={1 / view.zoom}
                  style={{ pointerEvents: 'none' }} />
              )}

              {/* Hint label */}
              {btLCursor && (
                <text x={btLCursor.x + 10 / view.zoom} y={btLCursor.y - 8 / view.zoom}
                  fontSize={9 / view.zoom} fill="#5eead4"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {btLPoints.length === 0 ? 'click inner corner start' : btLPoints.length === 1 ? 'click inner corner' : 'click end'}
                </text>
              )}
            </Fragment>
          )
        })()}

        {/* ── In-progress U-shape benchtop ── */}
        {mode === 'draw_benchtop_u' && (() => {
          return (
            <Fragment>
              {btUPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={4 / view.zoom}
                  fill={i === 0 ? '#14b8a6' : '#f59e0b'} stroke="#111827" strokeWidth={1 / view.zoom}
                  style={{ pointerEvents: 'none' }} />
              ))}
              {btUPoints.length > 0 && btUCursor && (
                <line x1={btUPoints[btUPoints.length - 1].x} y1={btUPoints[btUPoints.length - 1].y}
                  x2={btUCursor.x} y2={btUCursor.y}
                  stroke="#14b8a6" strokeWidth={1.5 / view.zoom}
                  strokeDasharray={`${5 / view.zoom} ${3 / view.zoom}`}
                  style={{ pointerEvents: 'none' }} />
              )}
              {/* Ghost U after 3 points */}
              {btUPoints.length === 3 && btUCursor && (() => {
                const [a, b, upc] = btUPoints; const d = btUCursor
                const d1x = b.x-a.x, d1y = b.y-a.y, l1 = Math.sqrt(d1x*d1x+d1y*d1y)
                const d2x = upc.x-b.x, d2y = upc.y-b.y, l2 = Math.sqrt(d2x*d2x+d2y*d2y)
                const d3x = d.x-upc.x, d3y = d.y-upc.y, l3 = Math.sqrt(d3x*d3x+d3y*d3y)
                if (l1 < 1 || l2 < 1 || l3 < 1) return null
                const u1x=d1x/l1, u1y=d1y/l1, u2x=d2x/l2, u2y=d2y/l2, u3x=d3x/l3, u3y=d3y/l3
                const cross = u1x*u2y - u1y*u2x; const s = cross >= 0 ? 1 : -1
                const p1 = {x: s*u1y, y:-s*u1x}, p2 = {x: s*u2y, y:-s*u2x}, p3 = {x: s*u3y, y:-s*u3x}
                const dep = btDepth ?? 600
                // miter corners
                const miter = (pt: Pt, n1: Pt, n2: Pt) => {
                  const bx=n1.x+n2.x, by=n1.y+n2.y, bl=Math.sqrt(bx*bx+by*by)
                  if(bl<0.01) return {x:pt.x+n1.x*dep,y:pt.y+n1.y*dep}
                  const nx=bx/bl, ny=by/bl, dot=n1.x*nx+n1.y*ny, sc=Math.abs(dot)>0.05?dep/dot:dep*4
                  return {x:pt.x+nx*sc,y:pt.y+ny*sc}
                }
                const poly = [a,{x:a.x+p1.x*dep,y:a.y+p1.y*dep},miter(b,p1,p2),miter(upc,p2,p3),{x:d.x+p3.x*dep,y:d.y+p3.y*dep},d,upc,b]
                return (
                  <polygon points={poly.map(p=>`${p.x},${p.y}`).join(' ')}
                    fill="rgba(20,184,166,0.12)" stroke="#14b8a6"
                    strokeWidth={1.5/view.zoom} strokeDasharray={`${6/view.zoom} ${3/view.zoom}`}
                    style={{ pointerEvents: 'none' }} />
                )
              })()}
              {btUCursor && (
                <circle cx={btUCursor.x} cy={btUCursor.y} r={3/view.zoom}
                  fill="#f59e0b" stroke="#111827" strokeWidth={1/view.zoom}
                  style={{ pointerEvents: 'none' }} />
              )}
            </Fragment>
          )
        })()}

        {/* ── In-progress rectangle benchtop ── */}
        {mode === 'draw_benchtop_rect' && (() => {
          if (!btRectStart) return null
          if (btRectCursor) {
            const rx = Math.min(btRectStart.x, btRectCursor.x)
            const ry = Math.min(btRectStart.y, btRectCursor.y)
            const rw = Math.abs(btRectCursor.x - btRectStart.x)
            const rh = Math.abs(btRectCursor.y - btRectStart.y)
            return (
              <Fragment>
                <rect x={rx} y={ry} width={rw} height={rh}
                  fill="rgba(20,184,166,0.12)" stroke="#14b8a6"
                  strokeWidth={1.5 / view.zoom}
                  strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`}
                  style={{ pointerEvents: 'none' }} />
                {rw > 20 / view.zoom && rh > 12 / view.zoom && (
                  <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle"
                    fontSize={10 / view.zoom} fill="#5eead4"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {Math.round(rw)}×{Math.round(rh)}
                  </text>
                )}
                <circle cx={btRectStart.x} cy={btRectStart.y} r={4 / view.zoom}
                  fill="#14b8a6" stroke="#111827" strokeWidth={1 / view.zoom}
                  style={{ pointerEvents: 'none' }} />
                <circle cx={btRectCursor.x} cy={btRectCursor.y} r={3 / view.zoom}
                  fill="#f59e0b" stroke="#111827" strokeWidth={1 / view.zoom}
                  style={{ pointerEvents: 'none' }} />
              </Fragment>
            )
          }
          return (
            <circle cx={btRectStart.x} cy={btRectStart.y} r={4 / view.zoom}
              fill="#14b8a6" stroke="#111827" strokeWidth={1 / view.zoom}
              style={{ pointerEvents: 'none' }} />
          )
        })()}

        {/* ── In-progress cutout rectangle ── */}
        {mode === 'draw_benchtop_cutout_rect' && btCutoutStart && btCutoutCursor && (() => {
          const rx = Math.min(btCutoutStart.x, btCutoutCursor.x)
          const ry = Math.min(btCutoutStart.y, btCutoutCursor.y)
          const rw = Math.abs(btCutoutCursor.x - btCutoutStart.x)
          const rh = Math.abs(btCutoutCursor.y - btCutoutStart.y)
          return (
            <Fragment>
              <rect x={rx} y={ry} width={rw} height={rh}
                fill="rgba(239,68,68,0.15)" stroke="#ef4444"
                strokeWidth={1.5/view.zoom} strokeDasharray={`${5/view.zoom} ${3/view.zoom}`}
                style={{ pointerEvents: 'none' }} />
              {rw > 20/view.zoom && rh > 12/view.zoom && (
                <text x={rx+rw/2} y={ry+rh/2} textAnchor="middle" dominantBaseline="middle"
                  fontSize={10/view.zoom} fill="#fca5a5"
                  style={{ userSelect:'none', pointerEvents:'none' }}>
                  {Math.round(rw)}×{Math.round(rh)}
                </text>
              )}
              <circle cx={btCutoutStart.x} cy={btCutoutStart.y} r={4/view.zoom}
                fill="#ef4444" stroke="#111827" strokeWidth={1/view.zoom} style={{ pointerEvents:'none' }} />
              <circle cx={btCutoutCursor.x} cy={btCutoutCursor.y} r={3/view.zoom}
                fill="#f59e0b" stroke="#111827" strokeWidth={1/view.zoom} style={{ pointerEvents:'none' }} />
            </Fragment>
          )
        })()}

        {/* ── In-progress cutout circle ── */}
        {mode === 'draw_benchtop_cutout_circle' && btCutoutStart && (() => {
          const r = btCutoutCursor ? Math.sqrt((btCutoutCursor.x-btCutoutStart.x)**2+(btCutoutCursor.y-btCutoutStart.y)**2) : 0
          return (
            <Fragment>
              <circle cx={btCutoutStart.x} cy={btCutoutStart.y} r={Math.max(r, 1/view.zoom)}
                fill="rgba(239,68,68,0.15)" stroke="#ef4444"
                strokeWidth={1.5/view.zoom} strokeDasharray={`${5/view.zoom} ${3/view.zoom}`}
                style={{ pointerEvents:'none' }} />
              {r > 10 && (
                <text x={btCutoutStart.x} y={btCutoutStart.y} textAnchor="middle" dominantBaseline="middle"
                  fontSize={10/view.zoom} fill="#fca5a5"
                  style={{ userSelect:'none', pointerEvents:'none' }}>
                  ⌀{Math.round(r*2)}
                </text>
              )}
              <circle cx={btCutoutStart.x} cy={btCutoutStart.y} r={4/view.zoom}
                fill="#ef4444" stroke="#111827" strokeWidth={1/view.zoom} style={{ pointerEvents:'none' }} />
              {btCutoutCursor && (
                <circle cx={btCutoutCursor.x} cy={btCutoutCursor.y} r={3/view.zoom}
                  fill="#f59e0b" stroke="#111827" strokeWidth={1/view.zoom} style={{ pointerEvents:'none' }} />
              )}
            </Fragment>
          )
        })()}

        {/* Walls + cabinets go click-through in F4 Benchtop mode — only tops pick. */}
        <g style={{ pointerEvents: isBenchtopMode(mode) ? 'none' : undefined }}>
        {/* ── Walls ── */}
        {walls.map(w => {
          const isSel = selected?.type === 'wall' && selected.id === w.id
          const wd = wallDir(w)
          const e = wallEnd(w)
          const midX = w.pos_x + w.length * 0.5 * wd.x
          const midY = w.pos_y + w.length * 0.5 * wd.y
          const clickable = mode !== 'draw_wall' && mode !== 'draw_island' && mode !== 'paste' && !placeInfoFor(mode, armedDef)
          const onCtx = (ev: React.MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); setSelected({ type: 'wall', id: w.id }); setContextMenu({ x: ev.clientX, y: ev.clientY, wallId: w.id }) }
          const onClick = (ev: React.MouseEvent) => { if (clickable) { ev.stopPropagation(); setSelected({ type: 'wall', id: w.id }) } }

          if (w.wall_type === 'island') {
            return (
              <Fragment key={w.id}>
                <line x1={w.pos_x} y1={w.pos_y} x2={e.x} y2={e.y}
                  stroke="transparent" strokeWidth={12 / view.zoom}
                  style={{ cursor: mode === 'select' ? 'pointer' : undefined }}
                  onPointerDown={ev => onWallPointerDown(ev, w.id)}
                  onClick={onClick} onContextMenu={onCtx} />
                <line x1={w.pos_x} y1={w.pos_y} x2={e.x} y2={e.y}
                  stroke={isSel ? '#f59e0b' : '#78350f'}
                  strokeWidth={(isSel ? 2.5 : 1.5) / view.zoom}
                  strokeDasharray={`${10 / view.zoom} ${5 / view.zoom}`}
                  style={{ pointerEvents: 'none' }} />
                <text x={midX} y={midY} textAnchor="middle" dominantBaseline="middle"
                  fontSize={wallNameFs} fill={isSel ? '#fcd34d' : '#78350f'}
                  transform={`rotate(${Math.cos(toRad(w.angle)) < -0.001 ? w.angle + 180 : w.angle}, ${midX}, ${midY})`}
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {w.name}
                </text>
                <WallDimensionChain
                  wall={w} walls={walls} cabinets={chainCabs}
                  rc={cx} zoom={view.zoom} selected={isSel}
                  layerOverall={layers.setting('dim_wall_overall')}
                  layerBase={layers.setting('dim_base_chain')}
                  layerWallCab={layers.setting('dim_wall_chain')}
                  labelBg={layers.background}
                />
              </Fragment>
            )
          }

          return (
            <Fragment key={w.id}>
              <polygon
                points={wallMitrePolygon(w, walls, cx)}
                fill={isSel ? '#1d3557' : '#1f2937'}
                stroke={isSel ? '#3b82f6' : '#374151'}
                strokeWidth={isSel ? 2 / view.zoom : 1 / view.zoom}
                style={{ cursor: mode === 'select' ? 'pointer' : undefined }}
                onPointerDown={ev => onWallPointerDown(ev, w.id)}
                onClick={onClick} onContextMenu={onCtx}
              />
              {(() => {
                const inorm = wallInwardNormal(w, cx)
                const tx = midX - inorm.x * w.thickness / 2
                const ty = midY - inorm.y * w.thickness / 2
                return (
                  <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
                    fontSize={wallNameFs} fill={isSel ? '#93c5fd' : '#4b5563'}
                    transform={`rotate(${Math.cos(toRad(w.angle)) < -0.001 ? w.angle + 180 : w.angle}, ${tx}, ${ty})`}
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {w.name}
                  </text>
                )
              })()}
              <WallDimensionChain
                wall={w} walls={walls} cabinets={chainCabs}
                rc={cx} zoom={view.zoom} selected={isSel}
                layerOverall={layers.setting('dim_wall_overall')}
                layerBase={layers.setting('dim_base_chain')}
                layerWallCab={layers.setting('dim_wall_chain')}
                  labelBg={layers.background}
              />
            </Fragment>
          )
        })}

        {/* ── Cabinets ── rendered low→high so overheads overlap bases in plan */}
        {[...cabinets].sort((a, b) => {
          // Kick assemblies first (underneath): where a kick and its member cabinets
          // are both shown, the cabinet above wins the click.
          const order: Record<string, number> = { base: 0, base_corner: 0, tall: 1, tall_corner: 1, wall: 2, wall_corner: 2 }
          const rank = (c: CabinetInstance) => c.is_kick_assembly ? -1 : (order[c.assembly_class] ?? 0)
          return rank(a) - rank(b)
        }).map(cab => {
          const wall = walls.find(w => w.id === cab.wall_id)
          if (!wall) return null
          const perp = cabWallPerp(cab, wall, wallInwardNormal(wall, cx))
          // Kick assemblies (joined toe kicks) take the normal cabinet path — names,
          // sizes, move handle, stretch markers — but draw only their kick parts (no
          // full-depth footprint over the run); click area = drawn kick extent.
          const isKickAsm = !!cab.is_kick_assembly
          const isSel = selected?.type === 'cabinet' && selected.id === cab.id
          const isMultiSel = multiSelect.includes(cab.id)
          const isHover = hoveredId === cab.id && !isSel && !isMultiSel

          // Apply position drag and resize live values
          let displayCab = cabDrag?.id === cab.id ? { ...cab, pos_x: cabDrag.pos_x, pos_y: cabDrag.pos_y } : cab
          if (cabResize?.cabId === cab.id) {
            if (cabResize.dim === 'dx') {
              displayCab = { ...displayCab, dx: cabResize.liveValue }
              if (cabResize.livePosX !== undefined) displayCab = { ...displayCab, pos_x: cabResize.livePosX, pos_y: cabResize.livePosY! }
            } else if (cabResize.dim === 'dz') {
              displayCab = { ...displayCab, dz: cabResize.liveValue }
            }
          }

          const isBase = cab.assembly_class === 'base' || cab.assembly_class === 'base_corner'
          const wd     = wallDir(wall)
          const pts    = cabinetPolygon(displayCab, wall, perp)
          const center = cabinetCenterPt(displayCab, wall, perp)
          const mr     = 6 / view.zoom

          const baseColor = isSel ? layers.cabFillSel(cab.assembly_class) : layers.cabFill(cab.assembly_class)

          // Layer items (z_display_layers spec)
          // Kick assembly: no footprint box, except mid-resize (resolved kick parts
          // are stale then) so the stretch stays visible.
          const showOutline = isKickAsm
            ? cabResize?.cabId === cab.id && layers.any('kick_faces', 'kick_spreaders')
            : layers.show('carcass_outline')
          const carcP = layers.props('carcass_outline', view.zoom)
          const showFace = layers.any('doors', 'drawer_fronts')
          const faceP = layers.props(layers.show('doors') ? 'doors' : 'drawer_fronts', view.zoom)
          const intP  = layers.props('internal_outline', view.zoom)

          // Cabinet frame → plan (turned, never mirrored, on left-handed walls).
          const toPlanC = cabinetToPlan(displayCab, wall, perp)
          // Front-edge endpoints for face layer
          const frontLeft  = { x: displayCab.pos_x + displayCab.dz * perp.x, y: displayCab.pos_y + displayCab.dz * perp.y }
          const frontRight = { x: displayCab.pos_x + displayCab.dx * wd.x + displayCab.dz * perp.x, y: displayCab.pos_y + displayCab.dx * wd.y + displayCab.dz * perp.y }

          // Resolved part outlines (carcase / kick). Hidden mid-resize: resolved
          // parts still reflect the committed width. On shaped cabinets
          // (z_cabinet_shape) the carcass and kick (4b) follow the footprint;
          // drawer hardware is still hidden.
          const shaped = !!displayCab.footprint?.segments?.length
          const rpAll  = cabResize?.cabId === cab.id ? undefined : resolvedParts?.get(cab.id)
          const rpPlan = shaped ? undefined : rpAll
          const casePartsR = (rpAll?.case_parts ?? []).filter(p => layers.show(casePartItem(p.part_key)))
          const kickPartsR = (rpAll?.toekick_parts ?? []).filter(p => layers.show(kickPartItem(p.part_key)))
          const partPoly = (b: { x: number; z: number; w: number; d: number }) => {
            const c = (lx: number, lz: number) => { const q = toPlanC(lx, lz); return `${q.x},${q.y}` }
            return `${c(b.x, b.z)} ${c(b.x + b.w, b.z)} ${c(b.x + b.w, b.z + b.d)} ${c(b.x, b.z + b.d)}`
          }
          // Drawer hardware on a turned facet (z_cabinet_shape 3b) is zone-frame:
          // turn its corners into cabinet coords first.
          const turnedCorners = (b: { x: number; z: number; w: number; d: number }, t: HardwareTurn | undefined) =>
            ([[b.x, b.z], [b.x + b.w, b.z], [b.x + b.w, b.z + b.d], [b.x, b.z + b.d]] as const)
              .map(([x, z]) => { const [X, , Z] = turnPoint(t, x, 0, z); return { x: X, z: Z } })
          const hwPoly = (b: { x: number; z: number; w: number; d: number }, t: HardwareTurn | undefined) =>
            turnedCorners(b, t).map(p => { const q = toPlanC(p.x, p.z); return `${q.x},${q.y}` }).join(' ')
          const hwRect = (b: { x: number; z: number; w: number; d: number }, t: HardwareTurn | undefined): LocalRect => {
            if (!t) return b
            const c = turnedCorners(b, t), xs = c.map(p => p.x), zs = c.map(p => p.z)
            return { x: Math.min(...xs), z: Math.min(...zs), w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) }
          }

          // Click area + labels follow the layer set: the extent of everything this
          // cabinet actually draws. Nothing drawn → not selectable, no name / size.
          const drawnRects: LocalRect[] = []
          if (showOutline) drawnRects.push({ x: 0, z: 0, w: displayCab.dx, d: displayCab.dz })
          for (const p of casePartsR) drawnRects.push(caseBoxAABB(p))
          for (const p of kickPartsR) { const b = tkBoxAABB(p); drawnRects.push({ x: b.x, z: b.z, w: b.w, d: b.d }) }
          if (layers.show('drawer_boxes'))   for (const ds of rpPlan?.drawer_stacks ?? []) for (const p of ds.box_parts) drawnRects.push(hwRect(dbBox(p), ds.turn))
          if (layers.show('drawer_runners')) for (const ds of rpPlan?.drawer_stacks ?? []) for (const sl of ds.slides) drawnRects.push(hwRect(slideBox(sl), ds.turn))
          for (const p of resolvedParts?.get(cab.id)?.custom_parts ?? []) {
            if (!p.show_in_room || !layers.show(customPartItem(p))) continue
            const { ex, ez } = customExtents(p.orientation, Number(p.dx), Number(p.dy), Number(p.dz))
            drawnRects.push({ x: p.x, z: p.z, w: ex, d: ez })
          }
          // Fronts — each resolved face zone's real plan footprint: resolved Z (inset /
          // overlay / buffer) + thickness, then the part editor's offset, size and
          // rotation overrides (same transforms as Cabinet3DView). Without resolved
          // parts (mid-resize) fall back to a line along the carcass front.
          const posOv = posOvById.get(cab.id)
          // Shaped cabinets: fronts resolve per facet (Phase 3), turned by z.AY.
          const faceRects = ((shaped ? rpAll : rpPlan)?.face_zones ?? []).flatMap(z => {
            const item = faceZoneItem(z.face_type)
            if (!item || !layers.show(item)) return []
            const id = zonePartId(z)
            const ov = posOv?.[id]
            const box = { x: z.X, y: z.Y, z: z.Z, w: ov?.sw ?? z.DX, h: ov?.sh ?? z.DY, d: ov?.sd ?? z.DZ }
            if (box.w <= 0 || box.d <= 0) return []
            const rect: LocalRect = { x: box.x + (ov?.ox ?? 0), z: box.z + (ov?.oz ?? 0), w: box.w, d: box.d }
            const turn = z.AY
              ? { ox: ov?.ox ?? 0, oy: ov?.oy ?? 0, oz: ov?.oz ?? 0, oax: ov?.oax, oay: (ov?.oay ?? 0) + z.AY, oaz: ov?.oaz }
              : ov
            const rotPoly = rotatedBoxPolygon(box, turn, (lx, _ly, lz) => toPlanC(lx, lz))
            // Mitred door (facet corner): its true top-view outline, turned by AY.
            const bevel = !ov && zoneBevelOutline(z)
            const bevelPoly = bevel ? bevel.map(q => {
              const [rx, , rz] = rotEulerXYZ(0, z.AY, 0, q.x, 0, q.z)
              const lx = z.X + rx, lz = z.Z + rz
              const p = toPlanC(lx, lz)
              return `${p.x},${p.y}`
            }).join(' ') : null
            return [{ id, item, rect, poly: bevelPoly ?? rotPoly ?? partPoly(rect) }]
          })
          const faceLine = showFace && cab.has_face && !rpPlan && !shaped
          if (faceLine) drawnRects.push({ x: 0, z: displayCab.dz - 20, w: displayCab.dx, d: 40 })
          // Shaped: the face fallback runs along every front-role edge instead.
          const shapedFronts = shaped && showFace && cab.has_face && !rpAll
            ? footprintEdgesPlan(displayCab.footprint!, { w: displayCab.dx, d: displayCab.dz }, cabinetToPlan(displayCab, wall, perp))
                .filter(e => e.edge.role === 'front')
            : []
          if (shapedFronts.length && !showOutline) drawnRects.push({ x: 0, z: 0, w: displayCab.dx, d: displayCab.dz })
          for (const f of faceRects) drawnRects.push(f.rect)
          // Handles (z_handles H2): projection footprint in front of each drawn
          // front. Plan hides them by default.
          const handleRects = layers.show('handles')
            ? ((shaped ? rpAll : rpPlan)?.face_zones ?? []).flatMap(z => {
                const item = faceZoneItem(z.face_type)
                if (!item || !layers.show(item)) return []
                const hs = handleShape(z)
                return hs ? [{ id: zonePartId(z), poly: partPoly({ x: hs.cx - hs.w / 2, z: hs.frontZ, w: hs.w, d: hs.projection }) }] : []
              })
            : []
          if (layers.show('internal_outline') && cab.has_internal) drawnRects.push({ x: 20, z: 20, w: displayCab.dx - 40, d: displayCab.dz - 40 })
          const hitRect = unionRect(drawnRects)
          // Label anchor: footprint centre; kick assemblies label just behind their
          // kick face (front) so the text clears the member cabinets' labels and the
          // front stretch marker.
          const kickFace = isKickAsm ? kickPartsR.find(p => p.part_key === 'kick_front_face') : undefined
          const labelPt = kickFace ? (() => {
            const b = tkPlanBox(kickFace)
            const lx = b.x + b.w / 2, lz = Math.max(0, b.z - 150)
            return toPlanC(lx, lz)
          })() : center

          const isBeingMoved = cabMoveDrag?.id === cab.id
          return (
            <g key={cab.id} opacity={isBeingMoved ? 0.4 : 1}>
              {/* Invisible hit polygon — the extent of what's drawn (see hitRect) */}
              {hitRect && <polygon points={showOutline ? pts : partPoly(hitRect)} fill="transparent" stroke="none"
                style={{ cursor: mode === 'select' ? 'default' : undefined }}
                onPointerDown={ev => onCabinetPointerDown(ev, displayCab)}
                onPointerEnter={() => setHoveredId(cab.id)}
                onPointerLeave={() => setHoveredId(null)}
                onClick={ev => ev.stopPropagation()}
                onContextMenu={ev => onCabinetContextMenu(ev, cab.id)}
                onDoubleClick={ev => onCabinetDoubleClick(ev, cab.id)}
              />}

              {/* Carcass — main cabinet footprint */}
              {showOutline && (
                <polygon points={pts}
                  fill={baseColor} fillOpacity={carcP.fillOpacity * layers.cabFillOpacity}
                  stroke={isSel ? '#e2e8f0' : isMultiSel ? '#f59e0b' : isHover ? '#f97316' : layers.color('carcass_outline', '#3b82f6')}
                  strokeWidth={layers.w('carcass_outline', isSel || isMultiSel || isHover ? 2 : 1) / view.zoom}
                  strokeDasharray={carcP.strokeDasharray}
                  opacity={carcP.opacity}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Carcase parts — each case part's plan footprint (cabinet-local X along
                  the wall, Z into the room — the same boxes Room3DScene extrudes).
                  Vertical panels (gables, back) read as filled strips; horizontal ones
                  (bottom, top, rails) as outlines. */}
              {casePartsR.map((p, i) => {
                const b = caseBox(p)
                if (b.w <= 0 || b.d <= 0) return null
                const it = casePartItem(p.part_key)
                const lp = layers.props(it, view.zoom)
                const col = layers.color(it, palette.carcase)
                const vertical = isSide(p.part_key) || p.part_key === 'back' || isShapedPanelKey(p.part_key)
                const toPlan = cabinetToPlan(displayCab, wall, perp)
                const pts = casePlanCorners(p).map(q => toPlan(q.x, q.z)).map(q => `${q.x},${q.y}`).join(' ')
                return (
                  <polygon key={`case-${i}`} points={pts} data-part={p.part_key}
                    fill={vertical ? col : 'none'} fillOpacity={vertical ? 0.55 * lp.fillOpacity : 0}
                    stroke={isSel ? '#e2e8f0' : col} strokeWidth={layers.w(it, 0.75) / view.zoom}
                    strokeDasharray={lp.strokeDasharray} opacity={lp.opacity} style={{ pointerEvents: 'none' }} />
                )
              })}

              {/* Toe-kick parts — plan footprint, outlines only */}
              {kickPartsR.map((p, i) => {
                const b = tkPlanBox(p)
                if (b.w <= 0 || b.d <= 0) return null
                const it = kickPartItem(p.part_key)
                const lp = layers.props(it, view.zoom)
                // Turned / mitred boards on shaped cabinets (4b) draw their true corners.
                const pts = tkPlanCorners(p).map(q => toPlanC(q.x, q.z)).map(q => `${q.x},${q.y}`).join(' ')
                return (
                  <polygon key={`kick-${i}`} points={pts} data-part={p.part_key}
                    fill="none" stroke={isSel ? '#e2e8f0' : layers.color(it, palette.toekick)} strokeWidth={layers.w(it, 0.75) / view.zoom}
                    strokeDasharray={lp.strokeDasharray} opacity={lp.opacity} style={{ pointerEvents: 'none' }} />
                )
              })}

              {/* Drawer boxes + runners — plan footprint outlines (hardware items) */}
              {layers.show('drawer_boxes') && (rpPlan?.drawer_stacks ?? []).flatMap((ds, si) => ds.box_parts.map((p, i) => {
                const b = dbBox(p)
                if (b.w <= 0 || b.d <= 0) return null
                const lp = layers.props('drawer_boxes', view.zoom)
                return (
                  <polygon key={`db-${si}-${i}`} points={hwPoly(b, ds.turn)} data-part={p.part_type}
                    fill="none" stroke={isSel ? '#e2e8f0' : layers.color('drawer_boxes', palette.drawer_box)} strokeWidth={layers.w('drawer_boxes', 0.6) / view.zoom}
                    strokeDasharray={lp.strokeDasharray} opacity={lp.opacity} style={{ pointerEvents: 'none' }} />
                )
              }))}
              {layers.show('drawer_runners') && (rpPlan?.drawer_stacks ?? []).flatMap((ds, si) => ds.slides.map((s, i) => {
                const b = slideBox(s)
                if (b.w <= 0 || b.d <= 0) return null
                const lp = layers.props('drawer_runners', view.zoom)
                return (
                  <polygon key={`sl-${si}-${i}`} points={hwPoly(b, ds.turn)} data-part={`slide_${s.side}`}
                    fill={layers.color('drawer_runners', palette.slides)} fillOpacity={0.5 * lp.fillOpacity} stroke={isSel ? '#e2e8f0' : layers.color('drawer_runners', palette.slides)} strokeWidth={layers.w('drawer_runners', 0.6) / view.zoom}
                    strokeDasharray={lp.strokeDasharray} opacity={lp.opacity} style={{ pointerEvents: 'none' }} />
                )
              }))}

              {/* Custom parts (panels / fillers) — plan footprint, room-visible only */}
              {layers.any(...CUSTOM_PART_ITEMS) && (resolvedParts?.get(cab.id)?.custom_parts ?? []).filter(p => p.show_in_room && layers.show(customPartItem(p))).map((p, i) => {
                const cpi = customPartItem(p)
                const cpp = layers.props(cpi, view.zoom)
                const { ex, ez } = customExtents(p.orientation, Number(p.dx), Number(p.dy), Number(p.dz))
                if (ex <= 0 || ez <= 0) return null
                const c = (lx: number, lz: number) => { const q = toPlanC(lx, lz); return `${q.x},${q.y}` }
                const poly = `${c(p.x, p.z)} ${c(p.x + ex, p.z)} ${c(p.x + ex, p.z + ez)} ${c(p.x, p.z + ez)}`
                return (
                  <polygon key={`cust-${i}`} points={poly} data-part={cpi}
                    fill={layers.color(cpi, '#a78bfa')} fillOpacity={0.35}
                    stroke={isSel ? '#e2e8f0' : layers.color(cpi, '#7c3aed')} strokeWidth={layers.w(cpi, 1) / view.zoom}
                    strokeDasharray={cpp.strokeDasharray} opacity={cpp.opacity} style={{ pointerEvents: 'none' }} />
                )
              })}

              {/* Internal — dashed inset polygon marking a cabinet with internals */}
              {layers.show('internal_outline') && cab.has_internal && (() => {
                const ins = 20
                const intCab = {
                  ...displayCab,
                  pos_x: displayCab.pos_x + ins * wd.x + ins * perp.x,
                  pos_y: displayCab.pos_y + ins * wd.y + ins * perp.y,
                  dx: Math.max(10, displayCab.dx - ins * 2),
                  dz: Math.max(10, displayCab.dz - ins * 2),
                }
                const intPts = cabinetPolygon(intCab, wall, perp)
                return (
                  <polygon points={intPts}
                    fill="none"
                    stroke={isSel ? '#cbd5e1' : layers.color('internal_outline', palette.internal)}
                    strokeWidth={layers.w('internal_outline', 0.75) / view.zoom}
                    strokeDasharray={layers.style('internal_outline') === 'solid' ? undefined : `${8 / view.zoom} ${4 / view.zoom}`}
                    opacity={intP.opacity}
                    style={{ pointerEvents: 'none' }}
                  />
                )
              })()}

              {/* Fronts — doors / drawer fronts at their true thickness + position */}
              {faceRects.map(f => {
                const fp = layers.props(f.item, view.zoom)
                const col = layers.color(f.item, palette.door)
                return (
                  <polygon key={f.id} points={f.poly} data-part={f.id}
                    fill={col} fillOpacity={0.35 * fp.fillOpacity}
                    stroke={isSel ? '#e2e8f0' : col} strokeWidth={layers.w(f.item, isSel ? 1.25 : 1) / view.zoom}
                    strokeDasharray={fp.strokeDasharray} opacity={fp.opacity} style={{ pointerEvents: 'none' }} />
                )
              })}

              {handleRects.map(hr => (
                <polygon key={`hd-${hr.id}`} points={hr.poly}
                  fill={layers.color('handles', '#64748b')} fillOpacity={0.6}
                  stroke={layers.color('handles', '#334155')} strokeWidth={layers.w('handles', 0.75) / view.zoom}
                  opacity={layers.op('handles')} style={{ pointerEvents: 'none' }} />
              ))}

              {/* Face fallback — bold line along the carcass front (no resolved parts) */}
              {faceLine && (
                <line
                  x1={frontLeft.x} y1={frontLeft.y}
                  x2={frontRight.x} y2={frontRight.y}
                  stroke={isSel ? '#e2e8f0' : layers.color(layers.show('doors') ? 'doors' : 'drawer_fronts', palette.door)}
                  strokeWidth={layers.w(layers.show('doors') ? 'doors' : 'drawer_fronts', isSel ? 2.5 : 2) / view.zoom}
                  strokeDasharray={faceP.strokeDasharray}
                  opacity={faceP.opacity}
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {shapedFronts.map(f => (
                <polyline key={`front-${f.edge.id}`} data-edge={f.edge.id}
                  points={f.pts.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={isSel ? '#e2e8f0' : layers.color(layers.show('doors') ? 'doors' : 'drawer_fronts', palette.door)}
                  strokeWidth={layers.w(layers.show('doors') ? 'doors' : 'drawer_fronts', isSel ? 2.5 : 2) / view.zoom}
                  strokeDasharray={faceP.strokeDasharray}
                  opacity={faceP.opacity}
                  style={{ pointerEvents: 'none' }}
                />
              ))}

              {/* Selection ring — only when selected and the outline is hidden */}
              {isSel && !showOutline && hitRect && (
                <polygon points={partPoly(hitRect)}
                  fill="none" stroke="#3b82f6" strokeWidth={1.5 / view.zoom}
                  strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Label */}
              {hitRect && layers.show('cabinet_labels') && (
                <text x={labelPt.x} y={labelPt.y - layers.w('cabinet_labels', cabLabelFs) * 0.7}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={layers.w('cabinet_labels', cabLabelFs)} fontWeight="600"
                  fill={isSel ? '#fff' : layers.color('cabinet_labels', '#93c5fd')} opacity={layers.op('cabinet_labels')}
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {cab.label ?? '—'}
                </text>
              )}

              {/* Dimensions */}
              {hitRect && layers.show('cabinet_sizes') && (
                <text x={labelPt.x} y={labelPt.y + layers.w('cabinet_sizes', cabDimFs) * 0.7}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={layers.w('cabinet_sizes', cabDimFs)}
                  fill={isSel ? '#e2e8f0' : layers.color('cabinet_sizes', '#94a3b8')} opacity={layers.op('cabinet_sizes')}
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {displayCab.dx}×{displayCab.dz}
                </text>
              )}

              {/* Centre move handle — only visible when selected */}
              {isSel && (() => {
                const arm = 10 / view.zoom
                const isFollowing = cabFollowing?.id === cab.id
                const crosshairOpacity = isFollowing ? 1 : 0.5
                return (
                  <g style={{ cursor: mode === 'select' ? (isFollowing ? 'crosshair' : 'move') : undefined }}>
                    <line x1={center.x - arm} y1={center.y} x2={center.x + arm} y2={center.y}
                      stroke={isFollowing ? '#60a5fa' : 'white'} strokeWidth={1.5 / view.zoom} opacity={crosshairOpacity} strokeLinecap="round"
                      style={{ pointerEvents: 'none' }} />
                    <line x1={center.x} y1={center.y - arm} x2={center.x} y2={center.y + arm}
                      stroke={isFollowing ? '#60a5fa' : 'white'} strokeWidth={1.5 / view.zoom} opacity={crosshairOpacity} strokeLinecap="round"
                      style={{ pointerEvents: 'none' }} />
                    <circle cx={center.x} cy={center.y} r={3 / view.zoom}
                      fill={isFollowing ? '#60a5fa' : 'white'} opacity={crosshairOpacity} style={{ pointerEvents: 'none' }} />
                    <circle cx={center.x} cy={center.y} r={8 / view.zoom}
                      fill="transparent"
                      onPointerDown={ev => ev.stopPropagation()}
                      onClick={ev => { ev.stopPropagation(); onCabinetCrosshairClick(ev, displayCab) }} />
                  </g>
                )
              })()}

              {/* ── Resize markers (selected cabinet only, hidden during multi-select) ── */}
              {isSel && multiSelect.length < 2 && (() => {
                const leftPt  = { x: displayCab.pos_x + (displayCab.dz / 2) * perp.x, y: displayCab.pos_y + (displayCab.dz / 2) * perp.y }
                const rightPt = { x: displayCab.pos_x + displayCab.dx * wd.x + (displayCab.dz / 2) * perp.x, y: displayCab.pos_y + displayCab.dx * wd.y + (displayCab.dz / 2) * perp.y }
                const frontPt = {
                  x: displayCab.pos_x + (displayCab.dx / 2) * wd.x + displayCab.dz * perp.x,
                  y: displayCab.pos_y + (displayCab.dx / 2) * wd.y + displayCab.dz * perp.y,
                }
                return (
                  <>
                    <circle cx={leftPt.x} cy={leftPt.y} r={mr}
                      fill={cabResize?.cabId === cab.id && cabResize.side === 'left' ? '#3b82f6' : '#1d4ed8'}
                      stroke="#93c5fd" strokeWidth={1.5 / view.zoom}
                      style={{ cursor: 'ew-resize' }}
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => onCabMarkerClick(e, displayCab, 'left', wall, perp)}
                    />
                    <circle cx={rightPt.x} cy={rightPt.y} r={mr}
                      fill={cabResize?.cabId === cab.id && cabResize.side === 'right' ? '#3b82f6' : '#1d4ed8'}
                      stroke="#93c5fd" strokeWidth={1.5 / view.zoom}
                      style={{ cursor: 'ew-resize' }}
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => onCabMarkerClick(e, displayCab, 'right', wall, perp)}
                    />
                    <circle cx={frontPt.x} cy={frontPt.y} r={mr}
                      fill={cabResize?.cabId === cab.id && cabResize.side === 'front' ? '#a855f7' : '#7c3aed'}
                      stroke="#c4b5fd" strokeWidth={1.5 / view.zoom}
                      style={{ cursor: 'crosshair' }}
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => onCabMarkerClick(e, displayCab, 'front', wall, perp)}
                    />
                  </>
                )
              })()}
            </g>
          )
        })}
        </g>

        {/* ── Door swings + drawer lines (plan annotations) ── */}
        {layers.any('door_swings', 'drawer_lines') && cabinets.flatMap(cab => {
          if (!cab.has_face) return []
          const wall = walls.find(w => w.id === cab.wall_id)
          if (!wall) return []
          const perp = cabWallPerp(cab, wall, wallInwardNormal(wall, cx))
          // Cabinet frame: column 0 / hinge 'left' sit on the cabinet's own left —
          // turned on left-handed walls (back side), never mirrored.
          const { o: fo, x: wd } = cabinetPlanFrame(cab, wall, perp)
          const frontLeft = { x: fo.x + cab.dz * perp.x, y: fo.y + cab.dz * perp.y }

          // Shaped cabinets (z_cabinet_shape 3c): swings + drawer lines from the
          // resolved zones on every facet.
          if (cab.footprint?.segments?.length) {
            const rpS = resolvedParts?.get(cab.id)
            if (!rpS) return []
            const toP = (p: LocalPt) => ({ x: fo.x + p.x * wd.x + p.z * perp.x, y: fo.y + p.x * wd.y + p.z * perp.y })
            const vec = (v: LocalPt) => ({ x: v.x * wd.x + v.z * perp.x, y: v.x * wd.y + v.z * perp.y })
            const marks = shapedFrontMarks(rpS.face_zones)
            const out: React.ReactNode[] = []
            if (layers.show('door_swings')) {
              const swingCol = layers.colorOf('door_swings')
              const swingPaint = swingCol
                ? { fill: swingCol, fillOpacity: 0.08, stroke: swingCol, strokeOpacity: 0.4, opacity: layers.op('door_swings') }
                : { fill: '#3b82f615', stroke: '#60a5fa60', opacity: layers.op('door_swings') }
              for (const s of marks.swings) {
                const h = toP(s.hinge), f = toP(s.free), e = toP(s.end)
                out.push(<path key={`swing-${cab.id}-${s.key}`}
                  d={`M ${h.x} ${h.y} L ${f.x} ${f.y} A ${s.r} ${s.r} 0 0 ${sweepFlag(h, f, e)} ${e.x} ${e.y} Z`}
                  {...swingPaint}
                  strokeWidth={layers.w('door_swings', 0.75) / view.zoom} strokeDasharray={`${4 / view.zoom} ${2 / view.zoom}`}
                  style={{ pointerEvents: 'none' }} />)
              }
            }
            if (layers.show('drawer_lines')) {
              for (const d of marks.drawers) {
                const o = vec(d.out), al = vec(d.along)
                const off = d.step * 10 / view.zoom, ins = d.step * 20 / view.zoom
                const a = toP(d.a), b = toP(d.b)
                out.push(<line key={`drawer-${cab.id}-${d.key}`}
                  x1={a.x + off * o.x + ins * al.x} y1={a.y + off * o.y + ins * al.y}
                  x2={b.x + off * o.x - ins * al.x} y2={b.y + off * o.y - ins * al.y}
                  stroke={layers.color('drawer_lines', '#f59e0b')} strokeOpacity={0.56} opacity={layers.op('drawer_lines')}
                  strokeWidth={layers.w('drawer_lines', 0.75) / view.zoom}
                  strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`} strokeLinecap="round"
                  style={{ pointerEvents: 'none' }} />)
              }
            }
            return out
          }

          type FgZone = { col_index: number; row_index: number; face_type: string; hinge_side?: string }
          type FgCol  = { col_index: number }
          const fg = cab.face_grid as { cols?: FgCol[]; zones?: FgZone[] } | null

          // Match resolver default when face_grid is null: 2 cols, left+right hinge doors
          const cols  = fg?.cols  ?? [{ col_index: 0 }, { col_index: 1 }]
          const zones: FgZone[] = fg?.zones ?? [
            { row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'left'  },
            { row_index: 0, col_index: 1, face_type: 'door', hinge_side: 'right' },
          ]
          const nCols = cols.length
          const colW  = cab.dx / nCols

          const nodes: React.ReactNode[] = []

          // Door swing arcs — one per column (rows irrelevant in plan view)
          if (layers.show('door_swings')) {
            const swingCol = layers.colorOf('door_swings')
            const swingPaint = swingCol
              ? { fill: swingCol, fillOpacity: 0.08, stroke: swingCol, strokeOpacity: 0.4, opacity: layers.op('door_swings') }
              : { fill: '#3b82f615', stroke: '#60a5fa60', opacity: layers.op('door_swings') }
            const baseCross  = wd.x * perp.y - wd.y * perp.x
            const leftSweep  = baseCross > 0 ? 1 : 0
            const rightSweep = 1 - leftSweep
            const seenDoor = new Set<number>()
            for (const z of zones) {
              if (z.face_type !== 'door' || seenDoor.has(z.col_index)) continue
              seenDoor.add(z.col_index)
              const { col, hinge } = { col: z.col_index, hinge: (z.hinge_side ?? 'left') as 'left' | 'right' }
              const colLeft  = { x: frontLeft.x + col * colW * wd.x, y: frontLeft.y + col * colW * wd.y }
              const colRight = { x: colLeft.x + colW * wd.x, y: colLeft.y + colW * wd.y }
              const r = colW
              // End point at 15° of opening: interpolate between start direction and perp
              // cos(θ)·startDir + sin(θ)·perp works for any wall orientation
              const θ = 15 * Math.PI / 180
              const c15 = Math.cos(θ), s15 = Math.sin(θ)
              if (hinge === 'left') {
                const endX = colLeft.x + r * (c15 * wd.x + s15 * perp.x)
                const endY = colLeft.y + r * (c15 * wd.y + s15 * perp.y)
                nodes.push(<path key={`swing-${cab.id}-${col}`}
                  d={`M ${colLeft.x} ${colLeft.y} L ${colRight.x} ${colRight.y} A ${r} ${r} 0 0 ${leftSweep} ${endX} ${endY} Z`}
                  {...swingPaint}
                  strokeWidth={layers.w('door_swings', 0.75) / view.zoom} strokeDasharray={`${4 / view.zoom} ${2 / view.zoom}`}
                  style={{ pointerEvents: 'none' }} />)
              } else {
                const endX = colRight.x + r * (c15 * (-wd.x) + s15 * perp.x)
                const endY = colRight.y + r * (c15 * (-wd.y) + s15 * perp.y)
                nodes.push(<path key={`swing-${cab.id}-${col}`}
                  d={`M ${colRight.x} ${colRight.y} L ${colLeft.x} ${colLeft.y} A ${r} ${r} 0 0 ${rightSweep} ${endX} ${endY} Z`}
                  {...swingPaint}
                  strokeWidth={layers.w('door_swings', 0.75) / view.zoom} strokeDasharray={`${4 / view.zoom} ${2 / view.zoom}`}
                  style={{ pointerEvents: 'none' }} />)
              }
            }
          }

          // Drawer lines — one dashed line per drawer zone, offset progressively from front
          // Stacked drawers (same col, different rows) each get their own line at +10px per step.
          if (layers.show('drawer_lines')) {
            // Group rows per column so each column tracks its own step count
            const colRowsSeen = new Map<number, number[]>()
            for (const z of zones) {
              if (z.face_type !== 'drawer_face') continue
              if (!colRowsSeen.has(z.col_index)) colRowsSeen.set(z.col_index, [])
              const rows = colRowsSeen.get(z.col_index)!
              if (!rows.includes(z.row_index)) rows.push(z.row_index)
            }
            for (const [col, rowIndices] of colRowsSeen) {
              rowIndices.sort((a, b) => a - b)
              const colLeft  = { x: frontLeft.x + col * colW * wd.x, y: frontLeft.y + col * colW * wd.y }
              const colRight = { x: colLeft.x + colW * wd.x, y: colLeft.y + colW * wd.y }
              for (let i = 0; i < rowIndices.length; i++) {
                const perpOff   = (i + 1) * 10 / view.zoom  // 10 screen-px out per step
                const widthInset = (i + 1) * 20 / view.zoom  // 20 screen-px inset per end per step
                nodes.push(<line key={`drawer-${cab.id}-${col}-${rowIndices[i]}`}
                  x1={colLeft.x  + perpOff * perp.x + widthInset * wd.x}
                  y1={colLeft.y  + perpOff * perp.y + widthInset * wd.y}
                  x2={colRight.x + perpOff * perp.x - widthInset * wd.x}
                  y2={colRight.y + perpOff * perp.y - widthInset * wd.y}
                  stroke={layers.color('drawer_lines', '#f59e0b')} strokeOpacity={0.56} opacity={layers.op('drawer_lines')}
                  strokeWidth={layers.w('drawer_lines', 0.75) / view.zoom}
                  strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`}
                  strokeLinecap="round"
                  style={{ pointerEvents: 'none' }} />)
              }
            }
          }

          return nodes
        })}

        {fixturesLayer}

        {/* ── Cabinet move ghost ── */}
        {cabMoveDrag && (() => {
          const movingCab = cabinets.find(c => c.id === cabMoveDrag.id)
          if (!movingCab) return null
          const moveWall = cabMoveDrag.wall
          const basePerp = wallInwardNormal(moveWall, cx)
          // islandFlip carries the back-side flag for any wall; flip perp outward so the
          // preview matches the committed cabinet (which flips via cabWallPerp).
          const perp = cabMoveDrag.islandFlip
            ? { x: -basePerp.x, y: -basePerp.y } : basePerp
          const wd = wallDir(moveWall)

          if (cabMoveDrag.freePos) {
            // Free-floating ghost: cabinet centered on cursor, oriented by nearest wall
            const fp = cabMoveDrag.freePos
            const freeBackLeft = {
              x: fp.x - (movingCab.dx / 2) * wd.x - (movingCab.dz / 2) * perp.x,
              y: fp.y - (movingCab.dx / 2) * wd.y - (movingCab.dz / 2) * perp.y,
            }
            const floatCab = { ...movingCab, pos_x: freeBackLeft.x, pos_y: freeBackLeft.y }
            const floatPts = cabinetPolygon(floatCab, moveWall, perp)

            // Back-centre of floating ghost (on the wall-touching edge)
            const ghostBackCx = freeBackLeft.x + (movingCab.dx / 2) * wd.x
            const ghostBackCy = freeBackLeft.y + (movingCab.dx / 2) * wd.y
            // Back-centre of snap landing spot
            const snapBackCx = cabMoveDrag.pos_x + (movingCab.dx / 2) * wd.x
            const snapBackCy = cabMoveDrag.pos_y + (movingCab.dx / 2) * wd.y

            const adx = snapBackCx - ghostBackCx
            const ady = snapBackCy - ghostBackCy
            const alen = Math.sqrt(adx * adx + ady * ady)
            const arrowSize = 10 / view.zoom

            const landPts = cabinetPolygon({ ...movingCab, pos_x: cabMoveDrag.pos_x, pos_y: cabMoveDrag.pos_y }, moveWall, perp)

            return (
              <>
                {/* Snap landing outline — exactly where the click will drop it */}
                <polygon points={landPts} fill="none" stroke={layers.cabFillSel(movingCab.assembly_class)}
                  strokeWidth={1 / view.zoom} strokeDasharray={`${4 / view.zoom} ${4 / view.zoom}`}
                  opacity={0.5} style={{ pointerEvents: 'none' }} />

                {/* Floating ghost outline */}
                <polygon points={floatPts}
                  fill="none"
                  stroke={layers.cabFillSel(movingCab.assembly_class)}
                  strokeWidth={2 / view.zoom} strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`}
                  style={{ pointerEvents: 'none' }} />

                {/* Snap arrow: dashed line + arrowhead from ghost back → snap landing */}
                {alen > arrowSize * 1.5 && (() => {
                  const ux = adx / alen, uy = ady / alen
                  const px = -uy, py = ux  // perpendicular
                  const tipX = snapBackCx, tipY = snapBackCy
                  const baseX = tipX - ux * arrowSize, baseY = tipY - uy * arrowSize
                  return (
                    <>
                      <line
                        x1={ghostBackCx} y1={ghostBackCy}
                        x2={baseX} y2={baseY}
                        stroke="#60a5fa" strokeWidth={1.5 / view.zoom}
                        strokeDasharray={`${5 / view.zoom} ${3 / view.zoom}`}
                        strokeLinecap="round"
                        style={{ pointerEvents: 'none' }} />
                      <polygon
                        points={`${tipX},${tipY} ${baseX + px * arrowSize * 0.45},${baseY + py * arrowSize * 0.45} ${baseX - px * arrowSize * 0.45},${baseY - py * arrowSize * 0.45}`}
                        fill="#60a5fa"
                        style={{ pointerEvents: 'none' }} />
                    </>
                  )
                })()}
              </>
            )
          }

          // Seeded ghost at current cabinet position (before cursor moves)
          const ghostCab = { ...movingCab, pos_x: cabMoveDrag.pos_x, pos_y: cabMoveDrag.pos_y }
          const pts = cabinetPolygon(ghostCab, moveWall, perp)
          return (
            <polygon points={pts}
              fill="none"
              stroke={layers.cabFillSel(movingCab.assembly_class)}
              strokeWidth={2 / view.zoom} strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`}
              style={{ pointerEvents: 'none' }} />
          )
        })()}

        {/* ── Draw wall preview ── */}
        {(mode === 'draw_wall' || mode === 'draw_island') && drawCursor && (
          <>
            <circle cx={drawCursor.x} cy={drawCursor.y} r={6 / view.zoom}
              fill="#7c3aed55" stroke="#a78bfa" strokeWidth={1.5 / view.zoom}
              style={{ pointerEvents: 'none' }} />
            {drawStart && (
              <>
                <line x1={drawStart.x} y1={drawStart.y} x2={drawCursor.x} y2={drawCursor.y}
                  stroke="#7c3aed66" strokeWidth={1 / view.zoom}
                  strokeDasharray={`${5 / view.zoom} ${3 / view.zoom}`}
                  style={{ pointerEvents: 'none' }} />
                {drawLen >= MIN_WALL_LEN && (mode === 'draw_island' ? (
                  <line x1={drawStart.x} y1={drawStart.y} x2={drawCursor.x} y2={drawCursor.y}
                    stroke="#f59e0b" strokeWidth={2 / view.zoom}
                    strokeDasharray={`${10 / view.zoom} ${5 / view.zoom}`}
                    style={{ pointerEvents: 'none' }} />
                ) : (() => {
                  const pang = toDeg(Math.atan2(drawCursor.y - drawStart.y, drawCursor.x - drawStart.x))
                  const pw = { pos_x: drawStart.x, pos_y: drawStart.y, length: drawLen, angle: pang, thickness: drawThickness, wall_type: 'standard' } as Wall
                  return <polygon points={wallPolygon(pw)} fill="#7c3aed22" stroke="#7c3aed"
                    strokeWidth={2 / view.zoom} strokeDasharray={`${8 / view.zoom} ${4 / view.zoom}`}
                    style={{ pointerEvents: 'none' }} />
                })())}
                <circle cx={drawStart.x} cy={drawStart.y} r={8 / view.zoom}
                  fill="none" stroke="#7c3aed" strokeWidth={2 / view.zoom}
                  style={{ pointerEvents: 'none' }} />
                {drawLen >= MIN_WALL_LEN && (
                  <text x={drawMidX} y={drawMidY - (13 / view.zoom)}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={11 / view.zoom} fontWeight="600" fill="#a78bfa"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {drawLen}
                  </text>
                )}
              </>
            )}
          </>
        )}

        {/* ── Snap indicators (inside face corners only) ── */}
        {mode === 'draw_wall' && walls.filter(w => w.wall_type !== 'island').flatMap((w, wi) =>
          [{ x: w.pos_x, y: w.pos_y }, wallEnd(w)].map((pt, ci) => {
            const isSnapped = drawCursor ? dist(pt, drawCursor) < 3 / view.zoom : false
            return (
              <rect key={`sc-${wi}-${ci}`}
                x={pt.x - SNAP_PX * 0.55 / view.zoom} y={pt.y - SNAP_PX * 0.55 / view.zoom}
                width={SNAP_PX * 1.1 / view.zoom} height={SNAP_PX * 1.1 / view.zoom}
                fill={isSnapped ? '#7c3aed33' : 'none'}
                stroke={isSnapped ? '#a78bfa' : '#7c3aed44'}
                strokeWidth={1 / view.zoom} style={{ pointerEvents: 'none' }} />
            )
          })
        )}

        {/* ── Place / paste cabinet ghost ── */}
        {placeGhost && (() => {
          let dims: { dx: number; dy: number; dz: number } | null = null
          let cls = 'base'
          if (mode === 'paste' && clipboard) {
            dims = { dx: clipboard.dx, dy: clipboard.dy, dz: clipboard.dz }
            cls = clipboard.assembly_class
          } else {
            const m = placeInfoFor(mode, armedDef)
            if (!m) return null
            dims = { dx: m.dx, dy: m.dy, dz: m.dz }
            cls = m.cls
          }
          const wall = placeGhost.wall
          const basePerp = wallInwardNormal(wall, cx)
          // islandFlip carries the back-side flag for any wall; flip perp outward so the
          // preview matches the committed cabinet (which flips via cabWallPerp).
          const perp = placeGhost.islandFlip
            ? { x: -basePerp.x, y: -basePerp.y } : basePerp
          // Snap-landing width honours the fit-to-gap shrink; the floating in-hand
          // ghost below stays at the full default width.
          const landDx = placeGhost.fitDx ?? dims.dx
          const ghostCab = { pos_x: placeGhost.pos_x, pos_y: placeGhost.pos_y, dx: landDx, dy: dims.dy, dz: dims.dz } as CabinetInstance
          const pts = cabinetPolygon(ghostCab, wall, perp)
          const center = cabinetCenterPt(ghostCab, wall, perp)

          // Free-float placement (sidebar place modes): cabinet floats at the cursor with a
          // dashed snap-landing outline + arrow, matching the elevation-view placement feel.
          if (placeGhost.freePos) {
            const wd = wallDir(wall)
            const fp = placeGhost.freePos
            const freeBackLeft = {
              x: fp.x - (dims.dx / 2) * wd.x - (dims.dz / 2) * perp.x,
              y: fp.y - (dims.dx / 2) * wd.y - (dims.dz / 2) * perp.y,
            }
            const floatCab = { pos_x: freeBackLeft.x, pos_y: freeBackLeft.y, dx: dims.dx, dy: dims.dy, dz: dims.dz } as CabinetInstance
            const floatPts = cabinetPolygon(floatCab, wall, perp)
            const floatCenter = cabinetCenterPt(floatCab, wall, perp)

            // Arrow from floating ghost back-centre → snap landing back-centre
            const ghostBackCx = freeBackLeft.x + (dims.dx / 2) * wd.x
            const ghostBackCy = freeBackLeft.y + (dims.dx / 2) * wd.y
            const snapBackCx = placeGhost.pos_x + (landDx / 2) * wd.x
            const snapBackCy = placeGhost.pos_y + (landDx / 2) * wd.y
            const adx = snapBackCx - ghostBackCx
            const ady = snapBackCy - ghostBackCy
            const alen = Math.sqrt(adx * adx + ady * ady)
            const arrowSize = 10 / view.zoom

            // Multi-paste: outline the rest of the copied group at their spacing
            // relative to the lead cabinet, both floating and at the snap landing.
            const tOf = (c: CabinetInstance) => { const w = walls.find(x => x.id === c.wall_id); return w ? cabT(c, w) : 0 }
            const groupExtras = (mode === 'paste' && clipboardGroup.length > 1)
              ? clipboardGroup.slice(1).map(gc => {
                  const o = tOf(gc) - tOf(clipboardGroup[0])
                  const landBL  = { pos_x: placeGhost.pos_x + o * wd.x, pos_y: placeGhost.pos_y + o * wd.y, dx: gc.dx, dy: gc.dy, dz: gc.dz } as CabinetInstance
                  const floatBL = { pos_x: freeBackLeft.x + o * wd.x, pos_y: freeBackLeft.y + o * wd.y, dx: gc.dx, dy: gc.dy, dz: gc.dz } as CabinetInstance
                  return { cls: gc.assembly_class, landPts: cabinetPolygon(landBL, wall, perp), floatPts: cabinetPolygon(floatBL, wall, perp) }
                })
              : []

            return (
              <>
                {/* Snap landing outline */}
                <polygon points={pts} fill="none" stroke={layers.cabFillSel(cls)}
                  strokeWidth={1 / view.zoom} strokeDasharray={`${4 / view.zoom} ${4 / view.zoom}`}
                  opacity={0.5} style={{ pointerEvents: 'none' }} />

                {/* Snap arrow: dashed line + arrowhead from ghost back → snap landing */}
                {alen > arrowSize * 1.5 && (() => {
                  const ux = adx / alen, uy = ady / alen
                  const px = -uy, py = ux
                  const tipX = snapBackCx, tipY = snapBackCy
                  const baseX = tipX - ux * arrowSize, baseY = tipY - uy * arrowSize
                  return (
                    <>
                      <line x1={ghostBackCx} y1={ghostBackCy} x2={baseX} y2={baseY}
                        stroke="#60a5fa" strokeWidth={1.5 / view.zoom}
                        strokeDasharray={`${5 / view.zoom} ${3 / view.zoom}`} strokeLinecap="round"
                        style={{ pointerEvents: 'none' }} />
                      <polygon
                        points={`${tipX},${tipY} ${baseX + px * arrowSize * 0.45},${baseY + py * arrowSize * 0.45} ${baseX - px * arrowSize * 0.45},${baseY - py * arrowSize * 0.45}`}
                        fill="#60a5fa" style={{ pointerEvents: 'none' }} />
                    </>
                  )
                })()}

                {/* Floating ghost centred on cursor */}
                <polygon points={floatPts} fill={layers.cabFill(cls) + 'cc'} stroke={layers.cabFillSel(cls)}
                  strokeWidth={2 / view.zoom} strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`}
                  style={{ pointerEvents: 'none' }} />
                <text x={floatCenter.x} y={floatCenter.y} textAnchor="middle" dominantBaseline="middle"
                  fontSize={cabLabelFs} fill="#e2e8f0" style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {dims.dx}
                </text>

                {/* Rest of the multi-paste group */}
                {groupExtras.map((ex, i) => (
                  <Fragment key={`gx${i}`}>
                    <polygon points={ex.landPts} fill="none" stroke={layers.cabFillSel(ex.cls)}
                      strokeWidth={1 / view.zoom} strokeDasharray={`${4 / view.zoom} ${4 / view.zoom}`}
                      opacity={0.5} style={{ pointerEvents: 'none' }} />
                    <polygon points={ex.floatPts} fill={layers.cabFill(ex.cls) + 'cc'} stroke={layers.cabFillSel(ex.cls)}
                      strokeWidth={2 / view.zoom} strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`}
                      style={{ pointerEvents: 'none' }} />
                  </Fragment>
                ))}
              </>
            )
          }

          return (
            <>
              <polygon points={pts} fill={layers.cabFill(cls) + 'aa'} stroke={layers.cabFillSel(cls)}
                strokeWidth={2 / view.zoom} strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`}
                style={{ pointerEvents: 'none' }} />
              <text x={center.x} y={center.y} textAnchor="middle" dominantBaseline="middle"
                fontSize={cabLabelFs} fill="#e2e8f0" style={{ userSelect: 'none', pointerEvents: 'none' }}>
                {dims.dx}
              </text>
            </>
          )
        })()}

        {/* ── Section cut line ── */}
        {sectionCut && (() => {
          const { x1, y1, x2, y2, lookDir } = sectionCut
          const dx = x2 - x1, dy = y2 - y1
          const len = Math.sqrt(dx * dx + dy * dy)
          if (len < 1) return null
          const ux = dx / len, uy = dy / len
          const nx = -uy, ny = ux
          const aDir = { x: nx * lookDir, y: ny * lookDir }
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
          const aLen = 50 / view.zoom
          const tipX = mx + aDir.x * aLen, tipY = my + aDir.y * aLen
          const aW = 10 / view.zoom
          const tickLen = 14 / view.zoom
          const delR = 8 / view.zoom
          return (
            <g>
              {/* Wide invisible hit area for drag */}
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="transparent" strokeWidth={20 / view.zoom}
                style={{ cursor: 'move' }}
                onPointerDown={e => { e.stopPropagation(); onSectionLinePointerDown?.(e) }}
              />
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#f59e0b" strokeWidth={2 / view.zoom}
                strokeDasharray={`${8 / view.zoom} ${4 / view.zoom}`}
                style={{ pointerEvents: 'none' }} />
              <line x1={x1 - nx * tickLen / 2} y1={y1 - ny * tickLen / 2} x2={x1 + nx * tickLen / 2} y2={y1 + ny * tickLen / 2}
                stroke="#f59e0b" strokeWidth={2 / view.zoom} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
              <line x1={x2 - nx * tickLen / 2} y1={y2 - ny * tickLen / 2} x2={x2 + nx * tickLen / 2} y2={y2 + ny * tickLen / 2}
                stroke="#f59e0b" strokeWidth={2 / view.zoom} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
              <g onClick={e => { e.stopPropagation(); onSectionFlipLook?.() }} style={{ cursor: 'pointer' }}>
                <line x1={mx} y1={my} x2={tipX} y2={tipY}
                  stroke="#f59e0b" strokeWidth={2 / view.zoom} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
                <polygon
                  points={`${tipX},${tipY} ${tipX - aDir.x * aW - aDir.y * aW * 0.5},${tipY - aDir.y * aW + aDir.x * aW * 0.5} ${tipX - aDir.x * aW + aDir.y * aW * 0.5},${tipY - aDir.y * aW - aDir.x * aW * 0.5}`}
                  fill="#f59e0b" style={{ pointerEvents: 'none' }} />
                <circle cx={tipX} cy={tipY} r={16 / view.zoom} fill="transparent" />
              </g>
              <g onClick={e => { e.stopPropagation(); onSectionClear?.() }} style={{ cursor: 'pointer' }}>
                <circle cx={x1} cy={y1} r={delR} fill="#111827" stroke="#f59e0b" strokeWidth={1.5 / view.zoom} />
                <line x1={x1 - delR * 0.55} y1={y1 - delR * 0.55} x2={x1 + delR * 0.55} y2={y1 + delR * 0.55}
                  stroke="#f59e0b" strokeWidth={1.5 / view.zoom} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
                <line x1={x1 + delR * 0.55} y1={y1 - delR * 0.55} x2={x1 - delR * 0.55} y2={y1 + delR * 0.55}
                  stroke="#f59e0b" strokeWidth={1.5 / view.zoom} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
              </g>
            </g>
          )
        })()}

        {/* ── Section cut draft line ── */}
        {mode === 'draw_section' && drawStart && drawCursor && (
          <>
            <line x1={drawStart.x} y1={drawStart.y} x2={drawCursor.x} y2={drawCursor.y}
              stroke="#f59e0b88" strokeWidth={2 / view.zoom}
              strokeDasharray={`${8 / view.zoom} ${4 / view.zoom}`}
              style={{ pointerEvents: 'none' }} />
            <circle cx={drawStart.x} cy={drawStart.y} r={5 / view.zoom}
              fill="#f59e0b" style={{ pointerEvents: 'none' }} />
          </>
        )}

        {/* ── Marquee selection rect ── */}
        {marquee && (
          <rect
            x={Math.min(marquee.x1, marquee.x2)} y={Math.min(marquee.y1, marquee.y2)}
            width={Math.abs(marquee.x2 - marquee.x1)} height={Math.abs(marquee.y2 - marquee.y1)}
            fill="rgba(59,130,246,0.08)" stroke="#3b82f6"
            strokeWidth={1 / view.zoom} strokeDasharray={`${4 / view.zoom} ${2 / view.zoom}`}
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* ── Measure tool overlay ── */}
        {(() => {
          const a = measureStart
          const b = measureEnd ?? measureCursor
          if (!a) return null
          const ep = 4 / view.zoom
          if (!b) {
            return <circle cx={a.x} cy={a.y} r={ep} fill="#f59e0b" stroke="#111827" strokeWidth={1 / view.zoom} style={{ pointerEvents: 'none' }} />
          }
          const d  = roundMm(dist(a, b))
          const dx = roundMm(Math.abs(b.x - a.x))
          const dy = roundMm(Math.abs(b.y - a.y))
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
          const fs = 11 / view.zoom, pad = 5 / view.zoom
          const boxW = fs * 6.5, boxH = fs * 2.6 + pad
          return (
            <g style={{ pointerEvents: 'none' }}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="#f59e0b" strokeWidth={1.5 / view.zoom}
                strokeDasharray={measureEnd ? undefined : `${6 / view.zoom} ${3 / view.zoom}`} />
              <circle cx={a.x} cy={a.y} r={ep} fill="#f59e0b" stroke="#111827" strokeWidth={1 / view.zoom} />
              <circle cx={b.x} cy={b.y} r={ep} fill="#f59e0b" stroke="#111827" strokeWidth={1 / view.zoom} />
              <rect x={mx - boxW / 2} y={my - boxH - pad} width={boxW} height={boxH} rx={2 / view.zoom}
                fill="rgba(17,24,39,0.9)" stroke="#f59e0b" strokeWidth={0.75 / view.zoom} />
              <text x={mx} y={my - boxH + fs * 0.5} textAnchor="middle" dominantBaseline="middle"
                fontSize={fs} fontWeight="600" fill="#fcd34d" style={{ userSelect: 'none' }}>
                {d}mm
              </text>
              <text x={mx} y={my - boxH + fs * 1.7} textAnchor="middle" dominantBaseline="middle"
                fontSize={fs * 0.8} fill="#9ca3af" style={{ userSelect: 'none' }}>
                x {dx}  y {dy}
              </text>
            </g>
          )
        })()}

        {/* ── Snap indicator glyph (active snap point) ── */}
        {snapResult?.kind && (() => {
          const { pt, kind } = snapResult
          const s = 5 / view.zoom
          const color = SNAP_KIND_META[kind].color
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={pt.x - s} y={pt.y - s} width={s * 2} height={s * 2}
                fill="none" stroke={color} strokeWidth={1.5 / view.zoom} />
              <line x1={pt.x - s * 1.7} y1={pt.y} x2={pt.x + s * 1.7} y2={pt.y}
                stroke={color} strokeWidth={0.75 / view.zoom} />
              <line x1={pt.x} y1={pt.y - s * 1.7} x2={pt.x} y2={pt.y + s * 1.7}
                stroke={color} strokeWidth={0.75 / view.zoom} />
            </g>
          )
        })()}

      </g>

      {walls.length === 0 && mode === 'select' && (
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
          fontSize={14} fill="#4b5563" style={{ userSelect: 'none', pointerEvents: 'none' }}>
          Select ✏ Wall in the toolbar, then click to place start point and click again to finish
        </text>
      )}
    </svg>
  )
}
