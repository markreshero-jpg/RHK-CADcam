'use client'
import { Fragment } from 'react'
import { Wall, CabinetInstance, DEFAULT_DIMS } from '@/src/lib/types'
import {
  Pt, MIN_WALL_LEN, SNAP_PX, CAB_FILL, CAB_FILL_SEL,
  toRad, toDeg, dist,
  wallEnd, wallDir, wallPolygon, wallMitrePolygon, wallInwardNormal, centroid,
  islandCabPerp, cabinetPolygon, cabinetCenterPt,
  gridDots,
} from '@/src/lib/geometry'
import WallDimensionChain from './WallDimensionChain'
import { Mode, Selected, ViewState, PlaceGhost, CabDrag, CabMoveDrag, CabResize, ContextMenuState, modeAssemblyClass, DisplayConfig } from './canvasTypes'
import { layerSVGProps } from '@/src/lib/displayConfig'

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
  onCabinetPointerDown: (e: React.PointerEvent, cab: CabinetInstance) => void
  onCabinetMovePointerDown: (e: React.PointerEvent, cab: CabinetInstance) => void
  onCabinetContextMenu: (e: React.MouseEvent, cabId: string) => void
  onCabinetDoubleClick: (e: React.MouseEvent, cabId: string) => void
  onCabMarkerPointerDown: (e: React.PointerEvent, cab: CabinetInstance, side: 'left' | 'right' | 'front', wall: Wall, perp: Pt) => void
}

export default function CanvasSVG({
  svgRef, walls, cabinets, view, svgSize, selected, mode, displayConfig,
  drawStart, drawCursor, drawThickness, placeGhost, clipboard, cabDrag, cabMoveDrag, cabResize, multiSelect, marquee, cursor,
  onPointerDown, onPointerMove, onPointerUp, onCancelDraw,
  setSelected, setContextMenu, onCabinetPointerDown, onCabinetMovePointerDown, onCabinetContextMenu, onCabinetDoubleClick,
  onCabMarkerPointerDown,
}: CanvasSVGProps) {
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
      onContextMenu={e => {
        e.preventDefault()
        if (mode === 'draw_wall' || mode === 'draw_island') onCancelDraw()
      }}
    >
      <g transform={`translate(${view.panX},${view.panY}) scale(${view.zoom})`}>

        {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={dotR} fill="#1f2937" />)}

        <line x1={-30 / view.zoom} y1={0} x2={30 / view.zoom} y2={0} stroke="#374151" strokeWidth={1 / view.zoom} />
        <line x1={0} y1={-30 / view.zoom} x2={0} y2={30 / view.zoom} stroke="#374151" strokeWidth={1 / view.zoom} />

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
          const perp = islandCabPerp(cab, wall, wallInwardNormal(wall, cx.x, cx.y))
          const isSel = selected?.type === 'cabinet' && selected.id === cab.id
          const isMultiSel = multiSelect.includes(cab.id)

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
            <g key={cab.id} opacity={isBeingMoved ? 0.25 : 1}>
              {/* Invisible hit polygon — always present so cabinet is always clickable */}
              <polygon points={pts} fill="transparent" stroke="none"
                style={{ cursor: mode === 'select' ? 'grab' : undefined }}
                onPointerDown={ev => onCabinetPointerDown(ev, displayCab)}
                onClick={ev => ev.stopPropagation()}
                onContextMenu={ev => onCabinetContextMenu(ev, cab.id)}
                onDoubleClick={ev => onCabinetDoubleClick(ev, cab.id)}
              />

              {/* Carcass — main cabinet footprint */}
              {carcL.visible && (
                <polygon points={pts}
                  fill={baseColor} fillOpacity={carcP.fillOpacity}
                  stroke={isSel ? '#e2e8f0' : isMultiSel ? '#f59e0b' : '#3b82f6'}
                  strokeWidth={isSel || isMultiSel ? 2 / view.zoom : 1 / view.zoom}
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
                    stroke={isSel ? '#cbd5e1' : '#4b5563'}
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
                  stroke={isSel ? '#e2e8f0' : baseColor}
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

              {/* Centre move handle */}
              {(() => {
                const arm = 10 / view.zoom
                return (
                  <g style={{ cursor: mode === 'select' ? 'move' : undefined }}>
                    <line x1={center.x - arm} y1={center.y} x2={center.x + arm} y2={center.y}
                      stroke="white" strokeWidth={1.5 / view.zoom} opacity={0.4} strokeLinecap="round"
                      style={{ pointerEvents: 'none' }} />
                    <line x1={center.x} y1={center.y - arm} x2={center.x} y2={center.y + arm}
                      stroke="white" strokeWidth={1.5 / view.zoom} opacity={0.4} strokeLinecap="round"
                      style={{ pointerEvents: 'none' }} />
                    <circle cx={center.x} cy={center.y} r={3 / view.zoom}
                      fill="white" opacity={0.4} style={{ pointerEvents: 'none' }} />
                    <circle cx={center.x} cy={center.y} r={8 / view.zoom}
                      fill="transparent"
                      onPointerDown={ev => { ev.stopPropagation(); onCabinetMovePointerDown(ev, displayCab) }} />
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
                      fill="#1d4ed8" stroke="#93c5fd" strokeWidth={1.5 / view.zoom}
                      style={{ cursor: 'ew-resize' }}
                      onPointerDown={e => { e.stopPropagation(); onCabMarkerPointerDown(e, displayCab, 'left', wall, perp) }}
                    />
                    <circle cx={rightPt.x} cy={rightPt.y} r={mr}
                      fill="#1d4ed8" stroke="#93c5fd" strokeWidth={1.5 / view.zoom}
                      style={{ cursor: 'ew-resize' }}
                      onPointerDown={e => { e.stopPropagation(); onCabMarkerPointerDown(e, displayCab, 'right', wall, perp) }}
                    />
                    <circle cx={frontPt.x} cy={frontPt.y} r={mr}
                      fill="#7c3aed" stroke="#c4b5fd" strokeWidth={1.5 / view.zoom}
                      style={{ cursor: 'crosshair' }}
                      onPointerDown={e => { e.stopPropagation(); onCabMarkerPointerDown(e, displayCab, 'front', wall, perp) }}
                    />
                  </>
                )
              })()}
            </g>
          )
        })}

        {/* ── Cabinet move ghost (cross-wall drag via centre handle) ── */}
        {cabMoveDrag && (() => {
          const movingCab = cabinets.find(c => c.id === cabMoveDrag.id)
          if (!movingCab) return null
          const moveWall = cabMoveDrag.wall
          const basePerp = wallInwardNormal(moveWall, cx.x, cx.y)
          const perp = moveWall.wall_type === 'island' && cabMoveDrag.islandFlip
            ? { x: -basePerp.x, y: -basePerp.y } : basePerp
          const ghostCab = { ...movingCab, pos_x: cabMoveDrag.pos_x, pos_y: cabMoveDrag.pos_y }
          const pts = cabinetPolygon(ghostCab, moveWall, perp)
          const gCenter = cabinetCenterPt(ghostCab, moveWall, perp)
          return (
            <>
              <polygon points={pts}
                fill={CAB_FILL[movingCab.assembly_class] + 'cc'}
                stroke={CAB_FILL_SEL[movingCab.assembly_class]}
                strokeWidth={2 / view.zoom} strokeDasharray={`${6 / view.zoom} ${3 / view.zoom}`}
                style={{ pointerEvents: 'none' }} />
              <text x={gCenter.x} y={gCenter.y} textAnchor="middle" dominantBaseline="middle"
                fontSize={cabLabelFs} fill="#e2e8f0"
                style={{ userSelect: 'none', pointerEvents: 'none' }}>
                {movingCab.label ?? movingCab.assembly_class}
              </text>
            </>
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
          const ghostCab = { pos_x: placeGhost.pos_x, pos_y: placeGhost.pos_y, dx: dims.dx, dy: dims.dy, dz: dims.dz } as CabinetInstance
          const pts = cabinetPolygon(ghostCab, wall, perp)
          const center = cabinetCenterPt(ghostCab, wall, perp)
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
