'use client'
import React, { Fragment, useState, useMemo } from 'react'
import { Wall, CabinetInstance, DEFAULT_DIMS, BenchtopInstance, BenchtopArcSegment } from '@/src/lib/types'
import {
  Pt, MIN_WALL_LEN, SNAP_PX, CAB_FILL, CAB_FILL_SEL,
  toRad, toDeg, dist,
  wallEnd, wallDir, wallPolygon, wallMitrePolygon, wallInwardNormal, centroid,
  cabWallPerp, cabinetPolygon, cabinetCenterPt, cabT,
  gridDots,
} from '@/src/lib/geometry'
import WallDimensionChain from './WallDimensionChain'
import { Mode, Selected, ViewState, PlaceGhost, CabDrag, CabMoveDrag, CabResize, ContextMenuState, modeAssemblyClass, DisplayConfig, SectionCut } from './canvasTypes'
import { layerSVGProps } from '@/src/lib/displayConfig'
import { roundMm } from '@/src/lib/format'
import { SNAP_KIND_META, type SnapResult } from '@/src/lib/canvasSnap'
import { getPalette } from '@/src/lib/partPalette'

function buildBenchtopPath(
  pts: Array<{ x: number; y: number }>,
  arcs: BenchtopArcSegment[],
  cutouts?: Array<Array<{ x: number; y: number }>>,
): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length; i++) {
    const next = pts[(i + 1) % pts.length]
    const arc = arcs.find(a => a.edge_index === i)
    if (arc) { d += ` Q ${arc.cpx} ${arc.cpy} ${next.x} ${next.y}` }
    else { d += ` L ${next.x} ${next.y}` }
  }
  d += ' Z'
  for (const cut of cutouts ?? []) {
    if (cut.length < 3) continue
    d += ` M ${cut[0].x} ${cut[0].y}`
    for (let i = 1; i < cut.length; i++) d += ` L ${cut[i].x} ${cut[i].y}`
    d += ' Z'
  }
  return d
}

interface CanvasSVGProps {
  displayConfig: DisplayConfig
  svgRef: React.RefObject<SVGSVGElement | null>
  walls: Wall[]
  cabinets: CabinetInstance[]
  view: ViewState
  svgSize: { w: number; h: number }
  selected: Selected
  mode: Mode
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
  onBenchtopVertexPointerDown: (e: React.PointerEvent, btId: string, vi: number) => void
  onBenchtopContextMenu: (e: React.MouseEvent, id: string) => void
  onBenchtopEdgeShiftClick: (id: string, edgeIndex: number) => void
  onBenchtopEdgeAltClick: (id: string, edgeIndex: number) => void
  onBenchtopArcPointerDown: (e: React.PointerEvent, btId: string, edgeIndex: number) => void
  onBtUndoVertex: () => void
  btDrawArcs: BenchtopArcSegment[]
  btArcMode: boolean
  btArcMidpoint: Pt | null
  btRectStart: Pt | null
  btRectCursor: Pt | null
  onBenchtopVertexContextMenu: (e: React.MouseEvent, btId: string, vi: number) => void
  onBenchtopPointerDown: (e: React.PointerEvent, id: string) => void
  onBenchtopRotateHandlePointerDown: (e: React.PointerEvent, id: string) => void
  // L-shape / U-shape draw state
  btLPoints: Pt[]
  btLCursor: Pt | null
  btUPoints: Pt[]
  btUCursor: Pt | null
  // Cutout draw state
  btCutoutStart: Pt | null
  btCutoutCursor: Pt | null
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
}

export default function CanvasSVG({
  svgRef, walls, cabinets, view, svgSize, selected, mode, displayConfig,
  drawStart, drawCursor, drawThickness, placeGhost, clipboard, clipboardGroup, cabDrag, cabMoveDrag, cabResize, multiSelect, marquee, cursor,
  onPointerDown, onPointerMove, onPointerUp, onCancelDraw,
  setSelected, setContextMenu, onWallPointerDown, onCabinetPointerDown, onCabinetCrosshairClick, onCabinetContextMenu, onCabinetDoubleClick,
  onCabMarkerClick, cabFollowing, onSVGClick,
  benchtops, selectedBenchtopId, btDrawPoly, btDrawCursor, onBenchtopClick, onBenchtopEdgeClick, onBenchtopVertexClick,
  onBenchtopVertexPointerDown, onBenchtopContextMenu, onBenchtopEdgeShiftClick, onBenchtopEdgeAltClick, onBenchtopArcPointerDown, onBtUndoVertex,
  btDrawArcs, btArcMode, btArcMidpoint, btRectStart, btRectCursor,
  onBenchtopVertexContextMenu, onBenchtopPointerDown, onBenchtopRotateHandlePointerDown,
  btLPoints, btLCursor,
  btUPoints, btUCursor,
  btCutoutStart, btCutoutCursor,
  sectionCut, onSectionFlipLook, onSectionClear, onSectionLinePointerDown,
  snapResult, measureStart, measureEnd, measureCursor, onMeasureCancel,
}: CanvasSVGProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // Editable part-line palette (src/lib/partPalette.ts); read once on mount.
  const palette = useMemo(() => getPalette(), [])

  const cx = centroid(walls)
  const dots = gridDots(view.panX, view.panY, view.zoom, svgSize.w, svgSize.h)
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
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onSVGClick}
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

        {/* ── Benchtop instances ── rendered below walls so cabinets/walls sit on top */}
        {benchtops.map(bt => {
          const pts = bt.polygon
          if (pts.length < 2) return null
          const isSel = bt.id === selectedBenchtopId
          const arcs = bt.arc_segments ?? []
          const bcx = pts.reduce((s, p) => s + p.x, 0) / pts.length
          const bcy = pts.reduce((s, p) => s + p.y, 0) / pts.length
          const vr = 5 / view.zoom
          const er = 6 / view.zoom

          return (
            <Fragment key={bt.id}>
              {/* Fill + border (evenodd fill-rule creates cutout holes) */}
              <path
                d={buildBenchtopPath(pts, arcs, bt.cutout_polygons ?? [])}
                fillRule="evenodd"
                fill={isSel ? 'rgba(20,184,166,0.22)' : 'rgba(20,184,166,0.10)'}
                stroke={isSel ? '#f59e0b' : '#0d9488'}
                strokeWidth={(isSel ? 2 : 1.5) / view.zoom}
                onPointerDown={e => { e.stopPropagation(); onBenchtopPointerDown(e, bt.id) }}
                onClick={e => { e.stopPropagation(); onBenchtopClick(bt.id) }}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onBenchtopContextMenu(e, bt.id) }}
                style={{ cursor: mode === 'select' ? 'move' : undefined }}
              />

              {/* Label */}
              <text x={bcx} y={bcy} textAnchor="middle" dominantBaseline="middle"
                fontSize={11 / view.zoom} fill={isSel ? '#fcd34d' : '#5eead4'}
                style={{ userSelect: 'none', pointerEvents: 'none' }}>
                {bt.label ?? '—'}
              </text>

              {/* Edge midpoint handles — W/E/A label, shift=insert vertex, alt=toggle arc */}
              {pts.map((p, i) => {
                const next = pts[(i + 1) % pts.length]
                const arcSeg = arcs.find(a => a.edge_index === i)
                const isArcEdge = !!arcSeg
                const mx = arcSeg ? 0.25 * p.x + 0.5 * arcSeg.cpx + 0.25 * next.x : (p.x + next.x) / 2
                const my = arcSeg ? 0.25 * p.y + 0.5 * arcSeg.cpy + 0.25 * next.y : (p.y + next.y) / 2
                const isWallEdge = bt.edge_tags.some(t => t.edge_index === i && t.type === 'wall')
                const hFill = isArcEdge ? '#7c3aed' : isWallEdge ? '#6b7280' : '#0d9488'
                const hStroke = isArcEdge ? '#a78bfa' : isWallEdge ? '#9ca3af' : '#14b8a6'
                const hLabel = isArcEdge ? 'A' : isWallEdge ? 'W' : 'E'
                const hTextFill = isArcEdge ? '#e9d5ff' : isWallEdge ? '#d1d5db' : '#ccfbf1'
                if (isSel) {
                  const ew = er * 2, eh = er * 2
                  return (
                    <g key={`e${i}`}>
                      <rect
                        x={mx - er} y={my - er} width={ew} height={eh}
                        rx={isArcEdge ? er : 1.5 / view.zoom}
                        fill={hFill} stroke={hStroke} strokeWidth={1 / view.zoom}
                        onClick={e => {
                          e.stopPropagation()
                          if (e.shiftKey) onBenchtopEdgeShiftClick(bt.id, i)
                          else if (e.altKey) onBenchtopEdgeAltClick(bt.id, i)
                          else onBenchtopEdgeClick(bt.id, i)
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <title>{isArcEdge
                          ? 'Arc edge · click to toggle wall/exposed · Alt-click to make straight · Shift-click to insert vertex'
                          : isWallEdge
                            ? 'Wall edge · click to set exposed · Alt-click to arc · Shift-click to insert vertex'
                            : 'Exposed edge · click to set wall · Alt-click to arc · Shift-click to insert vertex'}</title>
                      </rect>
                      <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle"
                        fontSize={er * 1.1} fill={hTextFill}
                        style={{ userSelect: 'none', pointerEvents: 'none' }}>
                        {hLabel}
                      </text>
                    </g>
                  )
                } else {
                  return (
                    <circle key={`edot${i}`} cx={mx} cy={my} r={2.5 / view.zoom}
                      fill={hFill} style={{ pointerEvents: 'none' }} />
                  )
                }
              })}

              {/* Edge length labels when selected */}
              {isSel && pts.map((p, i) => {
                const next = pts[(i + 1) % pts.length]
                const arcSeg = arcs.find(a => a.edge_index === i)
                const len = Math.round(Math.sqrt((next.x - p.x) ** 2 + (next.y - p.y) ** 2))
                const mx = arcSeg ? 0.25 * p.x + 0.5 * arcSeg.cpx + 0.25 * next.x : (p.x + next.x) / 2
                const my = arcSeg ? 0.25 * p.y + 0.5 * arcSeg.cpy + 0.25 * next.y : (p.y + next.y) / 2
                const ex = next.x - p.x, ey = next.y - p.y
                const el = Math.sqrt(ex * ex + ey * ey)
                if (el < 1) return null
                const nx = -ey / el, ny = ex / el
                const outward = (nx * (mx - bcx) + ny * (my - bcy)) >= 0 ? 1 : -1
                const off = 18 / view.zoom
                return (
                  <text
                    key={`len${i}`}
                    x={mx + nx * outward * off} y={my + ny * outward * off}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={9 / view.zoom} fill={arcSeg ? '#c4b5fd' : '#94a3b8'}
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                  >
                    {arcSeg ? `~${len}` : len}
                  </text>
                )
              })}

              {/* Vertex handles when selected — draggable */}
              {isSel && pts.map((p, i) => {
                const isMitre = bt.join_types.some(j => j.vertex_index === i && j.join_type === 'mitre')
                return isMitre ? (
                  <g key={`v${i}`}>
                    <polygon
                      points={`${p.x},${p.y - vr * 1.5} ${p.x + vr * 1.5},${p.y} ${p.x},${p.y + vr * 1.5} ${p.x - vr * 1.5},${p.y}`}
                      fill="#f59e0b" stroke="#111827" strokeWidth={1 / view.zoom}
                      onPointerDown={e => { e.stopPropagation(); onBenchtopVertexPointerDown(e, bt.id, i) }}
                      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onBenchtopVertexContextMenu(e, bt.id, i) }}
                      style={{ cursor: 'grab' }}
                    >
                      <title>Mitre join — drag to reshape · click to set butt · right-click for options</title>
                    </polygon>
                  </g>
                ) : (
                  <g key={`v${i}`}>
                    <circle
                      cx={p.x} cy={p.y} r={vr}
                      fill="#14b8a6" stroke="#111827" strokeWidth={1 / view.zoom}
                      onPointerDown={e => { e.stopPropagation(); onBenchtopVertexPointerDown(e, bt.id, i) }}
                      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onBenchtopVertexContextMenu(e, bt.id, i) }}
                      style={{ cursor: 'grab' }}
                    >
                      <title>Butt join — drag to reshape · click to set mitre · right-click for options</title>
                    </circle>
                  </g>
                )
              })}

              {/* Arc control point handles — draggable purple diamonds */}
              {isSel && arcs.map(arc => {
                const p0 = pts[arc.edge_index]
                const p1 = pts[(arc.edge_index + 1) % pts.length]
                if (!p0 || !p1) return null
                const dr = 4.5 / view.zoom
                const smx = (p0.x + p1.x) / 2
                const smy = (p0.y + p1.y) / 2
                return (
                  <g key={`acp${arc.edge_index}`}>
                    <line x1={smx} y1={smy} x2={arc.cpx} y2={arc.cpy}
                      stroke="#a855f7" strokeWidth={0.75 / view.zoom}
                      strokeDasharray={`${3 / view.zoom} ${2 / view.zoom}`}
                      style={{ pointerEvents: 'none' }} />
                    <polygon
                      points={`${arc.cpx},${arc.cpy - dr * 1.5} ${arc.cpx + dr * 1.5},${arc.cpy} ${arc.cpx},${arc.cpy + dr * 1.5} ${arc.cpx - dr * 1.5},${arc.cpy}`}
                      fill="#a855f7" stroke="#111827" strokeWidth={0.75 / view.zoom}
                      onPointerDown={e => { e.stopPropagation(); onBenchtopArcPointerDown(e, bt.id, arc.edge_index) }}
                      style={{ cursor: 'grab' }}
                    >
                      <title>Arc control point — drag to reshape curve</title>
                    </polygon>
                  </g>
                )
              })}

              {/* Rotate handle — amber circle above bounding box */}
              {isSel && (() => {
                const minY = Math.min(...pts.map(p => p.y))
                const rhr = 7 / view.zoom
                const rhOff = 22 / view.zoom
                return (
                  <g>
                    <line x1={bcx} y1={minY} x2={bcx} y2={minY - rhOff + rhr}
                      stroke="#f59e0b" strokeWidth={0.75 / view.zoom}
                      strokeDasharray={`${3 / view.zoom} ${2 / view.zoom}`}
                      style={{ pointerEvents: 'none' }} />
                    <circle
                      cx={bcx} cy={minY - rhOff}
                      r={rhr}
                      fill="#f59e0b" stroke="#111827" strokeWidth={1 / view.zoom}
                      onPointerDown={e => { e.stopPropagation(); onBenchtopRotateHandlePointerDown(e, bt.id) }}
                      style={{ cursor: 'grab' }}
                    >
                      <title>Drag to rotate benchtop</title>
                    </circle>
                    <text x={bcx} y={minY - rhOff}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={rhr * 1.4} fill="#111827"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>↻</text>
                  </g>
                )
              })()}
            </Fragment>
          )
        })}

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
                const depth = 600
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
                const dep = 600
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

        {/* ── Walls ── */}
        {walls.map(w => {
          const isSel = selected?.type === 'wall' && selected.id === w.id
          const wd = wallDir(w)
          const e = wallEnd(w)
          const midX = w.pos_x + w.length * 0.5 * wd.x
          const midY = w.pos_y + w.length * 0.5 * wd.y
          const clickable = mode !== 'draw_wall' && mode !== 'draw_island' && mode !== 'paste' && !modeAssemblyClass(mode)
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
                  wall={w} walls={walls} cabinets={cabinets}
                  centX={cx.x} centY={cx.y} zoom={view.zoom} selected={isSel}
                  layerOverall={displayConfig.layers.dim_wall_overall}
                  layerBase={displayConfig.layers.dim_base_chain}
                  layerWallCab={displayConfig.layers.dim_wall_chain}
                />
              </Fragment>
            )
          }

          return (
            <Fragment key={w.id}>
              <polygon
                points={wallMitrePolygon(w, walls, cx.x, cx.y)}
                fill={isSel ? '#1d3557' : '#1f2937'}
                stroke={isSel ? '#3b82f6' : '#374151'}
                strokeWidth={isSel ? 2 / view.zoom : 1 / view.zoom}
                style={{ cursor: mode === 'select' ? 'pointer' : undefined }}
                onPointerDown={ev => onWallPointerDown(ev, w.id)}
                onClick={onClick} onContextMenu={onCtx}
              />
              {(() => {
                const inorm = wallInwardNormal(w, cx.x, cx.y)
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
                wall={w} walls={walls} cabinets={cabinets}
                centX={cx.x} centY={cx.y} zoom={view.zoom} selected={isSel}
                layerOverall={displayConfig.layers.dim_wall_overall}
                layerBase={displayConfig.layers.dim_base_chain}
                layerWallCab={displayConfig.layers.dim_wall_chain}
              />
            </Fragment>
          )
        })}

        {/* ── Cabinets ── rendered low→high so overheads overlap bases in plan */}
        {[...cabinets].sort((a, b) => {
          const order: Record<string, number> = { base: 0, base_corner: 0, tall: 1, tall_corner: 1, wall: 2, wall_corner: 2 }
          return (order[a.assembly_class] ?? 0) - (order[b.assembly_class] ?? 0)
        }).map(cab => {
          const wall = walls.find(w => w.id === cab.wall_id)
          if (!wall) return null
          const perp = cabWallPerp(cab, wall, wallInwardNormal(wall, cx.x, cx.y))
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

          const baseColor = isSel ? CAB_FILL_SEL[cab.assembly_class] : CAB_FILL[cab.assembly_class]

          // Layer configs
          const carcL = displayConfig.layers.carcass
          const faceL = displayConfig.layers.face
          const intL  = displayConfig.layers.internal
          const lblL  = displayConfig.layers.labels
          const dimL  = displayConfig.layers.dimensions

          // SVG visual props per layer style
          const carcP = layerSVGProps(carcL.style, view.zoom)
          const faceP = layerSVGProps(faceL.style, view.zoom)
          const intP  = layerSVGProps(intL.style, view.zoom)

          // Front-edge endpoints for face layer
          const frontLeft  = { x: displayCab.pos_x + displayCab.dz * perp.x, y: displayCab.pos_y + displayCab.dz * perp.y }
          const frontRight = { x: displayCab.pos_x + displayCab.dx * wd.x + displayCab.dz * perp.x, y: displayCab.pos_y + displayCab.dx * wd.y + displayCab.dz * perp.y }

          const isBeingMoved = cabMoveDrag?.id === cab.id
          return (
            <g key={cab.id} opacity={isBeingMoved ? 0.4 : 1}>
              {/* Invisible hit polygon — always present so cabinet is always clickable */}
              <polygon points={pts} fill="transparent" stroke="none"
                style={{ cursor: mode === 'select' ? 'default' : undefined }}
                onPointerDown={ev => onCabinetPointerDown(ev, displayCab)}
                onPointerEnter={() => setHoveredId(cab.id)}
                onPointerLeave={() => setHoveredId(null)}
                onClick={ev => ev.stopPropagation()}
                onContextMenu={ev => onCabinetContextMenu(ev, cab.id)}
                onDoubleClick={ev => onCabinetDoubleClick(ev, cab.id)}
              />

              {/* Carcass — main cabinet footprint */}
              {carcL.visible && (
                <polygon points={pts}
                  fill={baseColor} fillOpacity={carcP.fillOpacity}
                  stroke={isSel ? '#e2e8f0' : isMultiSel ? '#f59e0b' : isHover ? '#f97316' : '#3b82f6'}
                  strokeWidth={isSel || isMultiSel || isHover ? 2 / view.zoom : 1 / view.zoom}
                  strokeDasharray={carcP.strokeDasharray}
                  opacity={carcP.opacity}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Internal — dashed inset polygon showing interior cavity */}
              {intL.visible && cab.has_internal && (() => {
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
                    stroke={isSel ? '#cbd5e1' : palette.internal}
                    strokeWidth={0.75 / view.zoom}
                    strokeDasharray={intL.style === 'solid' ? undefined : `${8 / view.zoom} ${4 / view.zoom}`}
                    opacity={intP.opacity}
                    style={{ pointerEvents: 'none' }}
                  />
                )
              })()}

              {/* Face — bold line along front edge representing door/drawer face */}
              {faceL.visible && cab.has_face && (
                <line
                  x1={frontLeft.x} y1={frontLeft.y}
                  x2={frontRight.x} y2={frontRight.y}
                  stroke={isSel ? '#e2e8f0' : palette.door}
                  strokeWidth={(isSel ? 2.5 : 2) / view.zoom}
                  strokeDasharray={faceP.strokeDasharray}
                  opacity={faceP.opacity}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Selection ring — only when selected and carcass is hidden */}
              {isSel && !carcL.visible && (
                <polygon points={pts}
                  fill="none" stroke="#3b82f6" strokeWidth={1.5 / view.zoom}
                  strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Label */}
              {lblL.visible && (
                <text x={center.x} y={center.y - cabLabelFs * 0.7}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={cabLabelFs} fontWeight="600"
                  fill={isSel ? '#fff' : '#93c5fd'}
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {cab.label ?? '—'}
                </text>
              )}

              {/* Dimensions */}
              {dimL.visible && (
                <text x={center.x} y={center.y + cabDimFs * 0.7}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={cabDimFs}
                  fill={isSel ? '#e2e8f0' : '#94a3b8'}
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

        {/* ── Door swings + drawer lines (plan annotations) ── */}
        {(displayConfig.annotations.plan_door_swings || displayConfig.annotations.plan_drawer_lines) && cabinets.flatMap(cab => {
          if (!cab.has_face) return []
          const wall = walls.find(w => w.id === cab.wall_id)
          if (!wall) return []
          const perp = cabWallPerp(cab, wall, wallInwardNormal(wall, cx.x, cx.y))
          const wd = wallDir(wall)
          const frontLeft = { x: cab.pos_x + cab.dz * perp.x, y: cab.pos_y + cab.dz * perp.y }

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
          if (displayConfig.annotations.plan_door_swings) {
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
                  fill="#3b82f615" stroke="#60a5fa60"
                  strokeWidth={0.75 / view.zoom} strokeDasharray={`${4 / view.zoom} ${2 / view.zoom}`}
                  style={{ pointerEvents: 'none' }} />)
              } else {
                const endX = colRight.x + r * (c15 * (-wd.x) + s15 * perp.x)
                const endY = colRight.y + r * (c15 * (-wd.y) + s15 * perp.y)
                nodes.push(<path key={`swing-${cab.id}-${col}`}
                  d={`M ${colRight.x} ${colRight.y} L ${colLeft.x} ${colLeft.y} A ${r} ${r} 0 0 ${rightSweep} ${endX} ${endY} Z`}
                  fill="#3b82f615" stroke="#60a5fa60"
                  strokeWidth={0.75 / view.zoom} strokeDasharray={`${4 / view.zoom} ${2 / view.zoom}`}
                  style={{ pointerEvents: 'none' }} />)
              }
            }
          }

          // Drawer lines — one dashed line per drawer zone, offset progressively from front
          // Stacked drawers (same col, different rows) each get their own line at +10px per step.
          if (displayConfig.annotations.plan_drawer_lines) {
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
                  stroke="#f59e0b90"
                  strokeWidth={0.75 / view.zoom}
                  strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`}
                  strokeLinecap="round"
                  style={{ pointerEvents: 'none' }} />)
              }
            }
          }

          return nodes
        })}

        {/* ── Cabinet move ghost ── */}
        {cabMoveDrag && (() => {
          const movingCab = cabinets.find(c => c.id === cabMoveDrag.id)
          if (!movingCab) return null
          const moveWall = cabMoveDrag.wall
          const basePerp = wallInwardNormal(moveWall, cx.x, cx.y)
          const perp = moveWall.wall_type === 'island' && cabMoveDrag.islandFlip
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

            return (
              <>
                {/* Floating ghost outline */}
                <polygon points={floatPts}
                  fill="none"
                  stroke={CAB_FILL_SEL[movingCab.assembly_class]}
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
              stroke={CAB_FILL_SEL[movingCab.assembly_class]}
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
            const m = modeAssemblyClass(mode)
            if (!m) return null
            dims = DEFAULT_DIMS[m.cls] ?? DEFAULT_DIMS.base
            cls = m.cls
          }
          const wall = placeGhost.wall
          const basePerp = wallInwardNormal(wall, cx.x, cx.y)
          const perp = wall.wall_type === 'island' && placeGhost.islandFlip
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
                <polygon points={pts} fill="none" stroke={CAB_FILL_SEL[cls]}
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
                <polygon points={floatPts} fill={CAB_FILL[cls] + 'cc'} stroke={CAB_FILL_SEL[cls]}
                  strokeWidth={2 / view.zoom} strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`}
                  style={{ pointerEvents: 'none' }} />
                <text x={floatCenter.x} y={floatCenter.y} textAnchor="middle" dominantBaseline="middle"
                  fontSize={cabLabelFs} fill="#e2e8f0" style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {dims.dx}
                </text>

                {/* Rest of the multi-paste group */}
                {groupExtras.map((ex, i) => (
                  <Fragment key={`gx${i}`}>
                    <polygon points={ex.landPts} fill="none" stroke={CAB_FILL_SEL[ex.cls]}
                      strokeWidth={1 / view.zoom} strokeDasharray={`${4 / view.zoom} ${4 / view.zoom}`}
                      opacity={0.5} style={{ pointerEvents: 'none' }} />
                    <polygon points={ex.floatPts} fill={CAB_FILL[ex.cls] + 'cc'} stroke={CAB_FILL_SEL[ex.cls]}
                      strokeWidth={2 / view.zoom} strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`}
                      style={{ pointerEvents: 'none' }} />
                  </Fragment>
                ))}
              </>
            )
          }

          return (
            <>
              <polygon points={pts} fill={CAB_FILL[cls] + 'aa'} stroke={CAB_FILL_SEL[cls]}
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
