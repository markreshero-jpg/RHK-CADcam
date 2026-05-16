'use client'
import { useState, useReducer, useRef, useEffect } from 'react'
import { Room, Wall, CabinetInstance, AssemblyClass, DEFAULT_DIMS } from '@/src/lib/types'
import { cabT, wallDir, findFreeSlot, cabBlocks, nearestWall, CAB_FILL, CAB_FILL_SEL } from '@/src/lib/geometry'
import { Selected, CabResize, viewReducer, DisplayConfig, Mode, modeAssemblyClass } from './canvasTypes'
import { layerSVGProps } from '@/src/lib/displayConfig'
import type { ResolvedCabinet, ResolvedCasePart, ResolvedToekickPart, ResolvedFaceZone, ResolvedInternalPart } from '@/src/lib/resolver/types'

// ── Colour coding per spec ────────────────────────────────────
const PART_COLORS: Record<string, string> = {
  left_side: '#b8c8dc', right_side: '#b8c8dc',
  bottom: '#b8c8dc', back: '#b8c8dc',
  full_top: '#34d399', front_rail: '#34d399', back_rail: '#34d399',
  kick_front_face: '#f59e0b',
  kick_sub_front: '#d97706', kick_back: '#ea580c',
  spreader_vertical: '#dc2626', spreader_horizontal: '#dc2626',
  adj_shelf: '#818cf8', fixed_shelf: '#a78bfa',
  door: '#60a5fa', drawer_face: '#f472b6', false_panel: '#60a5fa',
}

// Project case part onto elevation (X-Y) plane.
// Returns coords relative to cabinet origin (0,0 = bottom-left of cabinet).
function caseElevRect(p: ResolvedCasePart) {
  if (p.part_key === 'left_side' || p.part_key === 'right_side') {
    return { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
  }
  return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
}

function tkElevRect(p: ResolvedToekickPart) {
  if (p.part_key === 'spreader_horizontal') {
    // Lies flat at top of kick: DX = X extent (width), DY = Y extent (material thickness)
    return { ex: p.X, ey: p.Y + p.DY, ew: p.DX, eh: p.DY }
  }
  // Vertical panels (kick faces, spreader_vertical): DX = Y height, DY = X width
  return { ex: p.X, ey: p.Y + p.DX, ew: p.DY, eh: p.DX }
}

function zoneElevRect(z: ResolvedFaceZone) {
  // DX = zone height, DY = zone width
  return { ex: z.X, ey: z.Y + z.DX, ew: z.DY, eh: z.DX }
}

function shelfElevRect(p: ResolvedInternalPart) {
  if (p.part_type === 'inner_drawer_back') {
    // Vertical panel: DX = Y height, DY = X width
    return { ex: p.X, ey: p.Y + p.DX, ew: p.DY, eh: p.DX }
  }
  // Flat panels (shelves, drawer bottoms): DY = width, DZ = thickness
  return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
}

// Height above floor (mm) for the bottom of each assembly class
function cabBottomZ(cab: CabinetInstance, room: Room): number {
  if (cab.assembly_class === 'wall' || cab.assembly_class === 'wall_corner') {
    const top = room.wall_cabinet_top ?? 2100
    return top - cab.dy
  }
  return 0
}

interface ElevationSVGProps {
  walls: Wall[]
  cabinets: CabinetInstance[]
  room: Room
  elevWallId: string | null
  selected: Selected
  displayConfig: DisplayConfig
  multiSelect: string[]
  canEqualize: boolean
  mode: Mode
  clipboard: CabinetInstance | null
  onSelectCabinet: (id: string) => void
  onSelectWall: (id: string) => void
  onSetElevWall: (id: string) => void
  onUpdateCabinet: (id: string, u: Partial<CabinetInstance>) => void
  onPlaceAtWall: (wall: Wall, pos_x: number, pos_y: number) => Promise<void>
  onCabinetContextMenu: (e: React.MouseEvent, cabId: string) => void
  onBlankWallContextMenu: (e: React.MouseEvent, wallId: string, wallT: number) => void
  onShiftSelectCabinet: (id: string) => void
  onEqualizeWidths: () => void
  cabResize: CabResize | null
  onCabResizeStart: (r: CabResize) => void
  onCabResizeUpdate: (updates: { liveValue: number; livePosX?: number; livePosY?: number }) => void
  resolvedParts?: Map<string, ResolvedCabinet>
  onDeselect: () => void
}

export default function ElevationSVG({
  walls, cabinets, room, elevWallId, selected, displayConfig,
  multiSelect, canEqualize, mode, clipboard,
  onSelectCabinet, onSelectWall, onSetElevWall, onUpdateCabinet, onPlaceAtWall, onCabinetContextMenu,
  onBlankWallContextMenu, onShiftSelectCabinet, onEqualizeWidths,
  cabResize, onCabResizeStart, onCabResizeUpdate,
  resolvedParts, onDeselect,
}: ElevationSVGProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [view, dispatchView] = useReducer(viewReducer, { panX: 80, panY: 60, zoom: 1 })
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const spaceRef = useRef(false)
  const shiftRef = useRef(false)
  const [cabDrag, setCabDrag] = useState<{ id: string; t: number } | null>(null)
  const cabDragRef = useRef<{ cabId: string; assemblyClass: AssemblyClass; cabDX: number; dragOffset: number } | null>(null)
  const cabDragOriginRef = useRef<{ x: number; y: number } | null>(null)
  const [cabMoveDrag, setCabMoveDrag] = useState<{ id: string; wall: Wall; t: number } | null>(null)
  const cabMoveDragRef = useRef<{ cabId: string; assemblyClass: AssemblyClass; cabDX: number } | null>(null)
  const [placeGhost, setPlaceGhost] = useState<{ t: number; cls: string; dx: number; dy: number } | null>(null)

  useEffect(() => { setPlaceGhost(null) }, [mode])
  const cabResizeDragging = useRef(false)
  const cabResizeLiveRef = useRef<{ value: number; livePosX?: number; livePosY?: number } | null>(null)

  const wall = walls.find(w => w.id === elevWallId) ?? null
  const wallCabs = wall ? cabinets.filter(c => c.wall_id === wall.id) : []
  const roomH = room.room_dy ?? 2400

  // Fit to wall on wall change (skip during cross-wall drag to avoid coordinate jump)
  useEffect(() => {
    if (cabMoveDragRef.current) return
    if (!svgRef.current || !wall) return
    const { width, height } = svgRef.current.getBoundingClientRect()
    const pad = 100
    const zx = (width  - pad * 2) / wall.length
    const zy = (height - pad * 2) / roomH
    const z  = Math.min(3, Math.max(0.02, Math.min(zx, zy)))
    dispatchView({
      type: 'set',
      panX: (width  - wall.length * z) / 2,
      panY: (height - roomH       * z) / 2,
      zoom: z,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elevWallId])

  useEffect(() => {
    const svg = svgRef.current; if (!svg) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const r = svg.getBoundingClientRect()
      dispatchView({ type: 'zoom', factor: e.deltaY < 0 ? 1 / 1.15 : 1.15, svgX: e.clientX - r.left, svgY: e.clientY - r.top })
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [])

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === ' ') { spaceRef.current = true; e.preventDefault() }
      if (e.key === 'Shift') shiftRef.current = true
    }
    const ku = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceRef.current = false
      if (e.key === 'Shift') shiftRef.current = false
    }
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [])

  function onPointerDown(e: React.PointerEvent) {
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault()
      panRef.current = { startX: e.clientX, startY: e.clientY, panX: view.panX, panY: view.panY }
      svgRef.current?.setPointerCapture(e.pointerId)
      return
    }
    if (e.button === 0 && wall && (modeAssemblyClass(mode) || mode === 'paste')) {
      svgRef.current?.setPointerCapture(e.pointerId)
      return
    }
    if (e.button === 0 && mode === 'select') onDeselect()
  }

  function onPointerMove(e: React.PointerEvent) {
    if (panRef.current) {
      dispatchView({
        type: 'pan',
        dx: e.clientX - panRef.current.startX - (view.panX - panRef.current.panX),
        dy: e.clientY - panRef.current.startY - (view.panY - panRef.current.panY),
      })
      panRef.current.startX = e.clientX; panRef.current.startY = e.clientY
      panRef.current.panX = view.panX; panRef.current.panY = view.panY
      return
    }

    if (cabResizeDragging.current && cabResize && wall) {
      const svgR = svgRef.current!.getBoundingClientRect()
      const z = view.zoom
      const cursorT = (e.clientX - svgR.left - view.panX) / z
      const { side, wall: resWall, startCabT, startCabEndT, cabId } = cabResize
      const wd = wallDir(resWall)
      const resizingCls = cabinets.find(c => c.id === cabId)?.assembly_class ?? 'base'
      const neighbours = cabinets
        .filter(c => c.id !== cabId && c.wall_id === resWall.id && cabBlocks(resizingCls, c.assembly_class))
        .map(c => ({ t: cabT(c, resWall), dx: c.dx }))

      if (side === 'right') {
        const rightBound = neighbours.filter(o => o.t > startCabT + 1).reduce((min, o) => Math.min(min, o.t), resWall.length)
        const newDx = Math.round(Math.max(50, Math.min(rightBound - startCabT, cursorT - startCabT)))
        cabResizeLiveRef.current = { value: newDx }
        onCabResizeUpdate({ liveValue: newDx })
      } else if (side === 'left') {
        const leftBound = neighbours.filter(o => o.t + o.dx < startCabEndT - 1).reduce((max, o) => Math.max(max, o.t + o.dx), 0)
        const newT = Math.max(leftBound, Math.min(startCabEndT - 50, cursorT))
        const newDx = Math.round(startCabEndT - newT)
        const livePosX = resWall.pos_x + newT * wd.x
        const livePosY = resWall.pos_y + newT * wd.y
        cabResizeLiveRef.current = { value: newDx, livePosX, livePosY }
        onCabResizeUpdate({ liveValue: newDx, livePosX, livePosY })
      } else if (side === 'top') {
        const cursorY = (e.clientY - svgR.top - view.panY) / z
        const cab = cabinets.find(c => c.id === cabId)
        if (cab) {
          const newDy = Math.round(Math.max(50, Math.min(5000, roomH - cabBottomZ(cab, room) - cursorY)))
          cabResizeLiveRef.current = { value: newDy }
          onCabResizeUpdate({ liveValue: newDy })
        }
      }
      return
    }

    // Placement ghost — track cursor position when a cabinet/paste mode is active
    const clsInfo = modeAssemblyClass(mode)
    if ((clsInfo || mode === 'paste') && wall) {
      const svgR = svgRef.current!.getBoundingClientRect()
      const cursorT = (e.clientX - svgR.left - view.panX) / view.zoom
      const dims = clsInfo
        ? (DEFAULT_DIMS[clsInfo.cls] ?? DEFAULT_DIMS.base)
        : clipboard ? { dx: clipboard.dx, dy: clipboard.dy, dz: clipboard.dz } : null
      if (dims) {
        const cls = clsInfo?.cls ?? clipboard!.assembly_class
        const occ = cabinets
          .filter(c => c.wall_id === wall.id && cabBlocks(cls, c.assembly_class))
          .map(c => ({ t: cabT(c, wall), dx: c.dx }))
        const t = findFreeSlot(Math.max(0, Math.min(wall.length - dims.dx, cursorT)), dims.dx, wall.length, occ)
        setPlaceGhost({ t, cls, dx: dims.dx, dy: dims.dy })
      }
      return
    }
    if (mode === 'select') setPlaceGhost(null)

    if (cabMoveDragRef.current) {
      const { cabId, assemblyClass, cabDX } = cabMoveDragRef.current
      const svgR = svgRef.current!.getBoundingClientRect()
      const displayedWall = walls.find(w => w.id === elevWallId) ?? wall
      if (!displayedWall) return
      const cursorT = (e.clientX - svgR.left - view.panX) / view.zoom
      const d = wallDir(displayedWall)
      // Convert elevation cursor X to a world XY point along the displayed wall's line
      const worldPt = { x: displayedWall.pos_x + cursorT * d.x, y: displayedWall.pos_y + cursorT * d.y }

      let targetWall = displayedWall
      // If cursor goes past the wall edges, snap to the nearest other wall
      if (cursorT < -80 || cursorT > displayedWall.length + 80) {
        const snap = nearestWall(worldPt, walls.filter(w => w.id !== displayedWall.id), cabDX, 6000)
        if (snap) {
          targetWall = snap.wall
          onSetElevWall(targetWall.id)
        }
      }

      const wd = wallDir(targetWall)
      const desiredT = (worldPt.x - targetWall.pos_x) * wd.x + (worldPt.y - targetWall.pos_y) * wd.y
      const occ = cabinets
        .filter(c => c.id !== cabId && c.wall_id === targetWall.id && cabBlocks(assemblyClass, c.assembly_class))
        .map(c => ({ t: cabT(c, targetWall), dx: c.dx }))
      const t = findFreeSlot(Math.max(0, Math.min(targetWall.length - cabDX, desiredT)), cabDX, targetWall.length, occ)
      setCabMoveDrag({ id: cabId, wall: targetWall, t })
      return
    }

    if (cabDragRef.current && wall) {
      if (cabDragOriginRef.current) {
        const dx = e.clientX - cabDragOriginRef.current.x
        const dy = e.clientY - cabDragOriginRef.current.y
        if (Math.sqrt(dx * dx + dy * dy) < 5) return
      }
      const { cabId, assemblyClass, cabDX, dragOffset } = cabDragRef.current
      const svgR = svgRef.current!.getBoundingClientRect()
      const cursorT = (e.clientX - svgR.left - view.panX) / view.zoom
      const desired = Math.max(0, Math.min(wall.length - cabDX, cursorT - dragOffset))
      const occupied = cabinets.filter(c => c.id !== cabId && c.wall_id === wall.id && cabBlocks(assemblyClass, c.assembly_class)).map(c => ({ t: cabT(c, wall), dx: c.dx }))
      const t = findFreeSlot(desired, cabDX, wall.length, occupied)
      setCabDrag({ id: cabId, t })
    }
  }

  async function onPointerUp() {
    panRef.current = null

    if ((modeAssemblyClass(mode) || mode === 'paste') && wall && placeGhost) {
      const wd = wallDir(wall)
      const pos_x = wall.pos_x + placeGhost.t * wd.x
      const pos_y = wall.pos_y + placeGhost.t * wd.y
      setPlaceGhost(null)
      await onPlaceAtWall(wall, pos_x, pos_y)
      return
    }

    if (cabResizeDragging.current) {
      cabResizeDragging.current = false
      if (cabResize && cabResizeLiveRef.current) {
        const update: Partial<CabinetInstance> = { [cabResize.dim]: cabResizeLiveRef.current.value }
        if (cabResize.side === 'left' && cabResizeLiveRef.current.livePosX !== undefined) {
          update.pos_x = cabResizeLiveRef.current.livePosX
          update.pos_y = cabResizeLiveRef.current.livePosY
        }
        await onUpdateCabinet(cabResize.cabId, update)
      }
      cabResizeLiveRef.current = null
      return
    }

    if (cabMoveDragRef.current) {
      const { cabId } = cabMoveDragRef.current
      cabMoveDragRef.current = null
      if (cabMoveDrag) {
        const { wall: targetWall, t } = cabMoveDrag
        const wd = wallDir(targetWall)
        const pos_x = targetWall.pos_x + t * wd.x
        const pos_y = targetWall.pos_y + t * wd.y
        setCabMoveDrag(null)
        await onUpdateCabinet(cabId, { wall_id: targetWall.id, pos_x, pos_y, rotation: targetWall.angle })
        onSetElevWall(targetWall.id)
      } else {
        setCabMoveDrag(null)
      }
      return
    }

    if (cabDragRef.current && wall) {
      const { cabId } = cabDragRef.current
      cabDragRef.current = null
      cabDragOriginRef.current = null
      if (cabDrag) {
        const wd = wallDir(wall)
        const pos_x = wall.pos_x + cabDrag.t * wd.x
        const pos_y = wall.pos_y + cabDrag.t * wd.y
        setCabDrag(null)
        await onUpdateCabinet(cabId, { pos_x, pos_y })
      }
    }
  }

  function onCabMovePointerDown(e: React.PointerEvent, cab: CabinetInstance) {
    if (e.button !== 0 || !wall || spaceRef.current) return
    e.stopPropagation()
    onSelectCabinet(cab.id)
    cabMoveDragRef.current = { cabId: cab.id, assemblyClass: cab.assembly_class, cabDX: cab.dx }
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  function onCabPointerDown(e: React.PointerEvent, cab: CabinetInstance) {
    if (e.button !== 0 || !wall || spaceRef.current) return
    e.stopPropagation()
    if (shiftRef.current) {
      onShiftSelectCabinet(cab.id)
      return
    }
    onSelectCabinet(cab.id)
    const svgR = svgRef.current!.getBoundingClientRect()
    const cursorT = (e.clientX - svgR.left - view.panX) / view.zoom
    cabDragRef.current = { cabId: cab.id, assemblyClass: cab.assembly_class, cabDX: cab.dx, dragOffset: cursorT - cabT(cab, wall) }
    cabDragOriginRef.current = { x: e.clientX, y: e.clientY }
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  function onMarkerPointerDown(e: React.PointerEvent, cab: CabinetInstance, side: 'left' | 'right' | 'top') {
    if (e.button !== 0 || !wall) return
    e.stopPropagation()
    onSelectCabinet(cab.id)
    const t = cabT(cab, wall)
    const wd = wallDir(wall)
    const perp = { x: -wd.y, y: wd.x }
    const dim: 'dx' | 'dy' = side === 'top' ? 'dy' : 'dx'
    onCabResizeStart({
      cabId: cab.id, dim, side, wall, perp,
      startCabT: t, startCabEndT: t + cab.dx,
      liveValue: dim === 'dx' ? cab.dx : cab.dy,
    })
    cabResizeDragging.current = true
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  const z = view.zoom
  const labelFs = 11 / z
  const dimFs   =  9 / z
  const tickH   = 30 / z
  const mr      =  6 / z

  return (
    <div className="flex-1 flex flex-col bg-gray-950 overflow-hidden">

      {/* Wall picker + equalize strip */}
      <div className="flex-none flex items-center gap-1 px-3 py-1.5 bg-gray-900 border-b border-gray-800 overflow-x-auto shrink-0">
        <span className="text-[10px] text-gray-500 mr-2 whitespace-nowrap select-none">Wall:</span>
        {walls.length === 0
          ? <span className="text-[10px] text-gray-600">No walls — draw them in Plan view first</span>
          : walls.map(w => (
            <button key={w.id} onClick={() => onSetElevWall(w.id)}
              className={`px-2.5 py-0.5 text-[10px] rounded whitespace-nowrap transition-colors ${
                elevWallId === w.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}>
              {w.name}
            </button>
          ))
        }
        {canEqualize && (
          <>
            <div className="mx-2 h-4 border-l border-gray-700" />
            <button onClick={onEqualizeWidths}
              className="px-2.5 py-0.5 text-[10px] rounded bg-amber-700/40 text-amber-300 hover:bg-amber-700/60 whitespace-nowrap transition-colors">
              Equalise Widths
            </button>
          </>
        )}
        {multiSelect.length >= 2 && (
          <span className="ml-2 text-[10px] text-gray-500 whitespace-nowrap select-none">
            {multiSelect.length} selected · Shift+click to add/remove
          </span>
        )}
      </div>

      {/* SVG */}
      <svg
        ref={svgRef}
        className="flex-1 bg-gray-950 select-none"
        style={{ cursor: cabMoveDrag || cabDrag ? 'grabbing' : spaceRef.current ? 'grab' : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {!wall ? (
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
            fontSize={14} fill="#4b5563" style={{ userSelect: 'none', pointerEvents: 'none' }}>
            Select a wall above to view its elevation
          </text>
        ) : (
          <g transform={`translate(${view.panX},${view.panY}) scale(${z})`}>

            {/* Wall title */}
            <text x={wall.length / 2} y={-24 / z}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={labelFs} fill="#6b7280"
              style={{ userSelect: 'none', pointerEvents: 'none' }}>
              {wall.name} — Elevation
            </text>

            {/* Wall face */}
            {(() => {
              const isWallSel = selected?.type === 'wall' && selected.id === wall.id
              const isIsland = wall.wall_type === 'island'
              const cmHandler = (e: React.MouseEvent) => {
                e.preventDefault(); e.stopPropagation()
                const svgR = svgRef.current!.getBoundingClientRect()
                const wallT = (e.clientX - svgR.left - view.panX) / z
                onBlankWallContextMenu(e, wall.id, wallT)
              }
              return isIsland ? (
                <rect x={0} y={0} width={wall.length} height={roomH}
                  fill="transparent" stroke="none"
                  style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); onSelectWall(wall.id) }}
                  onContextMenu={cmHandler} />
              ) : (
                <rect x={0} y={0} width={wall.length} height={roomH}
                  fill="#1f2937"
                  stroke={isWallSel ? '#3b82f6' : '#374151'}
                  strokeWidth={isWallSel ? 2 / z : 1 / z}
                  style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); onSelectWall(wall.id) }}
                  onContextMenu={cmHandler} />
              )
            })()}

            {/* Floor line — shows island width even without a solid wall */}
            <line x1={0} y1={roomH} x2={wall.length} y2={roomH}
              stroke="#4b5563" strokeWidth={2 / z} />

            {/* Ceiling / soffit / wall-cabinet-top — not applicable to islands */}
            {wall.wall_type !== 'island' && (<>
              <line x1={0} y1={0} x2={wall.length} y2={0}
                stroke="#374151" strokeWidth={1 / z}
                strokeDasharray={`${8 / z} ${4 / z}`} />
              {room.soffit_height != null && (
                <line x1={0} y1={roomH - room.soffit_height} x2={wall.length} y2={roomH - room.soffit_height}
                  stroke="#78350f" strokeWidth={0.5 / z} strokeDasharray={`${6 / z} ${3 / z}`} />
              )}
              {room.wall_cabinet_top != null && (
                <line x1={0} y1={roomH - room.wall_cabinet_top} x2={wall.length} y2={roomH - room.wall_cabinet_top}
                  stroke="#1e3a5f" strokeWidth={0.5 / z} strokeDasharray={`${4 / z} ${4 / z}`} />
              )}
            </>)}

            {/* Cabinets */}
            {wallCabs.map(cab => {
              const baseT   = cabDrag?.id === cab.id ? cabDrag.t : cabT(cab, wall)
              const bottomZ = cabBottomZ(cab, room)
              const isSel   = selected?.type === 'cabinet' && selected.id === cab.id
              const isMultiSel = multiSelect.includes(cab.id)

              // Apply live resize values
              let displayDx = cab.dx
              let displayDy = cab.dy
              let displayT  = baseT
              if (cabResize?.cabId === cab.id) {
                if (cabResize.dim === 'dx') {
                  displayDx = cabResize.liveValue
                  if (cabResize.livePosX !== undefined) {
                    const wd = wallDir(wall)
                    displayT = (cabResize.livePosX - wall.pos_x) * wd.x + (cabResize.livePosY! - wall.pos_y) * wd.y
                  }
                } else if (cabResize.dim === 'dy') {
                  displayDy = cabResize.liveValue
                }
              }

              const rx = displayT
              const ry = roomH - bottomZ - displayDy

              const isBase = cab.assembly_class === 'base' || cab.assembly_class === 'base_corner'
              const isTall = cab.assembly_class === 'tall' || cab.assembly_class === 'tall_corner'

              // Toekick height — 150mm default; only base and tall have toekicks
              const tkH = (isBase || isTall) && cab.has_toekick ? 150 : 0

              const baseColor = isSel ? CAB_FILL_SEL[cab.assembly_class] : CAB_FILL[cab.assembly_class]
              const cabStroke = isSel ? '#e2e8f0' : isMultiSel ? '#f59e0b' : '#3b82f6'
              const cabStrokeW = isSel || isMultiSel ? 2 / z : 1 / z

              // Layer configs
              const carcL = displayConfig.layers.carcass
              const faceL = displayConfig.layers.face
              const intL  = displayConfig.layers.internal
              const tkL   = displayConfig.layers.toekick
              const lblL  = displayConfig.layers.labels
              const dimL  = displayConfig.layers.dimensions

              // SVG visual props per layer style
              const carcP = layerSVGProps(carcL.style, z)
              const faceP = layerSVGProps(faceL.style, z)
              const intP  = layerSVGProps(intL.style, z)
              const tkP   = layerSVGProps(tkL.style, z)

              // Shelf Y positions for the internal layer
              const shelfYs: number[] = []
              if (intL.visible && cab.has_internal) {
                const bottom = ry + displayDy - tkH
                if (isTall) {
                  for (let offset = 300; offset < displayDy - tkH - 150; offset += 350)
                    shelfYs.push(ry + offset)
                } else {
                  shelfYs.push(ry + (displayDy - tkH) * 0.5)
                }
                shelfYs.splice(0, shelfYs.length, ...shelfYs.filter(sy => sy > ry + 20 / z && sy < bottom - 20 / z))
              }

              const isBeingMoved = cabMoveDrag?.id === cab.id
              return (
                <g key={cab.id}
                  style={{ cursor: 'grab' }}
                  opacity={isBeingMoved ? 0.25 : 1}
                  onPointerDown={e => onCabPointerDown(e, cab)}
                  onClick={e => { e.stopPropagation(); if (!shiftRef.current) onSelectCabinet(cab.id) }}
                  onContextMenu={e => onCabinetContextMenu(e, cab.id)}
                >
                  {/* Invisible hit area */}
                  <rect x={rx} y={ry} width={displayDx} height={displayDy} fill="transparent" stroke="none" />

                  {/* ── Resolved geometry — actual panels ── */}
                  {(() => {
                    const rp = resolvedParts?.get(cab.id)
                    if (!rp) {
                      // Fallback: approximate bounding box + toekick zone
                      return (<>
                        {carcL.visible && (
                          <rect x={rx} y={ry} width={displayDx} height={displayDy}
                            fill={baseColor} fillOpacity={carcP.fillOpacity}
                            stroke={cabStroke} strokeWidth={cabStrokeW}
                            strokeDasharray={carcP.strokeDasharray} opacity={carcP.opacity} />
                        )}
                        {tkL.visible && cab.has_toekick && tkH > 0 && (
                          <rect x={rx} y={ry + displayDy - tkH} width={displayDx} height={tkH}
                            fill={baseColor} fillOpacity={(tkP.fillOpacity * 0.5) || 0}
                            stroke={isSel ? '#e2e8f0' : '#475569'} strokeWidth={1 / z}
                            strokeDasharray={tkP.strokeDasharray ?? `${4 / z} ${2 / z}`} opacity={tkP.opacity} />
                        )}
                        {intL.visible && shelfYs.map((sy, i) => (
                          <line key={i} x1={rx + 4 / z} y1={sy} x2={rx + displayDx - 4 / z} y2={sy}
                            stroke={isSel ? '#cbd5e1' : '#4b5563'} strokeWidth={1 / z}
                            strokeDasharray={intL.style === 'solid' ? undefined : `${8 / z} ${4 / z}`} opacity={intP.opacity} />
                        ))}
                        {faceL.visible && cab.has_face && (() => {
                          const ins = 15; const fw = displayDx - ins * 2; const fh = displayDy - tkH - ins * 2
                          if (fw <= 0 || fh <= 0) return null
                          return <rect x={rx + ins} y={ry + ins} width={fw} height={fh}
                            fill={baseColor} fillOpacity={faceP.fillOpacity * 0.45}
                            stroke={isSel ? '#e2e8f0' : baseColor} strokeWidth={0.75 / z}
                            strokeDasharray={faceP.strokeDasharray} opacity={faceP.opacity} />
                        })()}
                      </>)
                    }

                    // Resolved: render actual panels
                    // Coordinate conversion: svgX = rx + ex, svgY = ry + displayDy - ey
                    const toSVG = (ex: number, ey: number, ew: number, eh: number) => ({
                      x: rx + ex, y: ry + displayDy - ey, w: ew, h: eh,
                    })

                    return (<>
                      {/* Case parts — back panel is hidden in front elevation and its
                          PartTransform doesn't encode full height, so we skip it */}
                      {carcL.visible && rp.case_parts.filter(p => p.part_key !== 'back').map((p, i) => {
                        const { ex, ey, ew, eh } = caseElevRect(p)
                        const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                        const fill = PART_COLORS[p.part_key] ?? '#b8c8dc'
                        return (
                          <rect key={`cp-${i}`} x={x} y={y} width={w} height={h}
                            fill={fill} fillOpacity={0.6}
                            stroke={isSel ? '#e2e8f0' : fill} strokeWidth={0.5 / z}
                            opacity={carcP.opacity} style={{ pointerEvents: 'none' }} />
                        )
                      })}

                      {/* Toekick parts */}
                      {tkL.visible && rp.toekick_parts.map((p, i) => {
                        const { ex, ey, ew, eh } = tkElevRect(p)
                        const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                        const fill = PART_COLORS[p.part_key] ?? '#f59e0b'
                        return (
                          <rect key={`tk-${i}`} x={x} y={y} width={w} height={h}
                            fill={fill} fillOpacity={0.7}
                            stroke={isSel ? '#e2e8f0' : fill} strokeWidth={0.5 / z}
                            opacity={tkP.opacity} style={{ pointerEvents: 'none' }} />
                        )
                      })}

                      {/* Internal parts (shelves) */}
                      {intL.visible && rp.internal_parts.map((p, i) => {
                        const { ex, ey, ew, eh } = shelfElevRect(p)
                        const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                        const fill = PART_COLORS[p.part_type] ?? '#818cf8'
                        return (
                          <rect key={`ip-${i}`} x={x} y={y} width={w} height={h}
                            fill={fill} fillOpacity={0.6}
                            stroke={fill} strokeWidth={0.5 / z}
                            opacity={intP.opacity} style={{ pointerEvents: 'none' }} />
                        )
                      })}

                      {/* Face zones (doors, drawers) */}
                      {faceL.visible && rp.face_zones.map((fz, i) => {
                        const { ex, ey, ew, eh } = zoneElevRect(fz)
                        const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                        const fill = PART_COLORS[fz.face_type] ?? '#60a5fa'
                        const hingeLine = fz.hinge_side === 'left'
                          ? <line x1={x} y1={y} x2={x} y2={y + h} stroke={fill} strokeWidth={2 / z} style={{ pointerEvents: 'none' }} />
                          : fz.hinge_side === 'right'
                          ? <line x1={x + w} y1={y} x2={x + w} y2={y + h} stroke={fill} strokeWidth={2 / z} style={{ pointerEvents: 'none' }} />
                          : null
                        return (
                          <g key={`fz-${i}`} style={{ pointerEvents: 'none' }}>
                            <rect x={x} y={y} width={w} height={h}
                              fill={fill} fillOpacity={0.25}
                              stroke={isSel ? '#e2e8f0' : fill} strokeWidth={1 / z}
                              opacity={faceP.opacity} />
                            {hingeLine}
                          </g>
                        )
                      })}
                    </>)
                  })()}

                  {/* Selection ring when carcass layer is hidden */}
                  {isSel && !carcL.visible && (
                    <rect
                      x={rx} y={ry} width={displayDx} height={displayDy}
                      fill="none" stroke="#3b82f6" strokeWidth={1.5 / z}
                      strokeDasharray={`${6 / z} ${3 / z}`}
                    />
                  )}

                  {/* Label */}
                  {lblL.visible && (
                    <text
                      x={rx + displayDx / 2} y={ry + displayDy / 2 - labelFs * 0.6}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={labelFs} fontWeight="600"
                      fill={isSel ? '#fff' : '#93c5fd'}
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>
                      {cab.label ?? '—'}
                    </text>
                  )}

                  {/* Dimensions */}
                  {dimL.visible && (
                    <text
                      x={rx + displayDx / 2} y={ry + displayDy / 2 + dimFs * 0.8}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={dimFs} fill={isSel ? '#e2e8f0' : '#94a3b8'}
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>
                      {displayDx}W × {displayDy}H
                    </text>
                  )}

                  {/* Centre move handle */}
                  {(() => {
                    const cx = rx + displayDx / 2
                    const cy = ry + displayDy / 2
                    const arm = 10 / z
                    return (
                      <g style={{ cursor: 'move' }}>
                        <line x1={cx - arm} y1={cy} x2={cx + arm} y2={cy}
                          stroke="white" strokeWidth={1.5 / z} opacity={0.4} strokeLinecap="round"
                          style={{ pointerEvents: 'none' }} />
                        <line x1={cx} y1={cy - arm} x2={cx} y2={cy + arm}
                          stroke="white" strokeWidth={1.5 / z} opacity={0.4} strokeLinecap="round"
                          style={{ pointerEvents: 'none' }} />
                        <circle cx={cx} cy={cy} r={3 / z}
                          fill="white" opacity={0.4} style={{ pointerEvents: 'none' }} />
                        <circle cx={cx} cy={cy} r={8 / z} fill="transparent"
                          onPointerDown={e => { e.stopPropagation(); onCabMovePointerDown(e, cab) }} />
                      </g>
                    )
                  })()}

                  {/* Resize markers — selected cabinet only, hidden during multi-select */}
                  {isSel && multiSelect.length < 2 && (
                    <>
                      <circle cx={rx} cy={ry + displayDy / 2} r={mr}
                        fill="#1d4ed8" stroke="#93c5fd" strokeWidth={1.5 / z}
                        style={{ cursor: 'ew-resize' }}
                        onPointerDown={e => { e.stopPropagation(); onMarkerPointerDown(e, cab, 'left') }}
                      />
                      <circle cx={rx + displayDx} cy={ry + displayDy / 2} r={mr}
                        fill="#1d4ed8" stroke="#93c5fd" strokeWidth={1.5 / z}
                        style={{ cursor: 'ew-resize' }}
                        onPointerDown={e => { e.stopPropagation(); onMarkerPointerDown(e, cab, 'right') }}
                      />
                      <circle cx={rx + displayDx / 2} cy={ry} r={mr}
                        fill="#7c3aed" stroke="#c4b5fd" strokeWidth={1.5 / z}
                        style={{ cursor: 'ns-resize' }}
                        onPointerDown={e => { e.stopPropagation(); onMarkerPointerDown(e, cab, 'top') }}
                      />
                    </>
                  )}
                </g>
              )
            })}

            {/* Placement ghost */}
            {placeGhost && (() => {
              const isWallCls = placeGhost.cls === 'wall' || placeGhost.cls === 'wall_corner'
              const ghostBZ = isWallCls ? Math.max(0, (room.wall_cabinet_top ?? 2100) - placeGhost.dy) : 0
              const gx = placeGhost.t
              const gy = roomH - ghostBZ - placeGhost.dy
              const fill = CAB_FILL[placeGhost.cls] ?? CAB_FILL.base
              const sel  = CAB_FILL_SEL[placeGhost.cls] ?? CAB_FILL_SEL.base
              return (
                <rect x={gx} y={gy} width={placeGhost.dx} height={placeGhost.dy}
                  fill={fill + '66'} stroke={sel}
                  strokeWidth={2 / z} strokeDasharray={`${6 / z} ${3 / z}`}
                  style={{ pointerEvents: 'none' }} />
              )
            })()}

            {/* Cross-wall move ghost */}
            {cabMoveDrag && cabMoveDrag.wall.id === wall.id && (() => {
              const movingCab = cabinets.find(c => c.id === cabMoveDrag.id)
              if (!movingCab) return null
              const gx = cabMoveDrag.t
              const gy = roomH - cabBottomZ(movingCab, room) - movingCab.dy
              const baseColor = CAB_FILL[movingCab.assembly_class]
              return (
                <>
                  <rect x={gx} y={gy} width={movingCab.dx} height={movingCab.dy}
                    fill={baseColor + 'cc'}
                    stroke={CAB_FILL_SEL[movingCab.assembly_class]}
                    strokeWidth={2 / z} strokeDasharray={`${6 / z} ${3 / z}`}
                    style={{ pointerEvents: 'none' }} />
                  <text x={gx + movingCab.dx / 2} y={gy + movingCab.dy / 2}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={labelFs} fill="#e2e8f0"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {movingCab.label ?? movingCab.assembly_class}
                  </text>
                </>
              )
            })()}

            {/* Bottom dimension — wall length */}
            <g>
              <line x1={0} y1={roomH + tickH} x2={wall.length} y2={roomH + tickH}
                stroke="#cbd5e1" strokeWidth={1 / z} />
              <line x1={0}           y1={roomH + tickH * 0.5} x2={0}           y2={roomH + tickH * 1.5} stroke="#cbd5e1" strokeWidth={1 / z} />
              <line x1={wall.length} y1={roomH + tickH * 0.5} x2={wall.length} y2={roomH + tickH * 1.5} stroke="#cbd5e1" strokeWidth={1 / z} />
              {(() => {
                const fs = 12 / z
                const mx = wall.length / 2
                const my = roomH + tickH * 2.2
                return (
                  <g>
                    <rect x={mx - fs * 2.5} y={my - fs * 0.6} width={fs * 5} height={fs * 1.2} fill="#030712" />
                    <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle"
                      fontSize={fs} fill="#cbd5e1"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>
                      {Math.round(wall.length)}
                    </text>
                  </g>
                )
              })()}
            </g>

            {/* Left dimension — Y-axis height chain */}
            {displayConfig.layers.dim_elevation_y.visible && (() => {
              const baseCabEl = wallCabs.find(c => c.assembly_class === 'base' || c.assembly_class === 'base_corner') ?? null
              const overheadCabEl = wallCabs.find(c => c.assembly_class === 'wall' || c.assembly_class === 'wall_corner') ?? null
              const kickH = baseCabEl?.has_toekick ? 150 : 0
              const baseDy = baseCabEl?.dy ?? 0
              const wallCabTop = room.wall_cabinet_top ?? 2100
              const overheadDy = overheadCabEl?.dy ?? 0

              // Build segments in SVG Y coords (y=0 ceiling, y=roomH floor)
              // cursorY tracks position as we move upward (decreasing y)
              const segs: { fromY: number; toY: number; label: string }[] = []
              let cursorY = roomH

              if (baseDy > 0) {
                if (kickH > 0) {
                  const kickTopY = roomH - kickH
                  segs.push({ fromY: kickTopY, toY: cursorY, label: `${kickH}` })
                  cursorY = kickTopY
                }
                const baseCarcTopY = roomH - baseDy
                segs.push({ fromY: baseCarcTopY, toY: cursorY, label: `${baseDy - kickH}` })
                cursorY = baseCarcTopY
              }

              if (overheadDy > 0) {
                const overheadBotY = roomH - (wallCabTop - overheadDy)
                const overheadTopY = roomH - wallCabTop
                if (overheadBotY < cursorY - 0.5) {
                  segs.push({ fromY: overheadBotY, toY: cursorY, label: `${Math.round(cursorY - overheadBotY)}` })
                }
                segs.push({ fromY: overheadTopY, toY: overheadBotY, label: `${overheadDy}` })
                cursorY = overheadTopY
              }

              if (cursorY > 0.5) {
                segs.push({ fromY: 0, toY: cursorY, label: `${Math.round(cursorY)}` })
              }

              if (segs.length === 0) {
                segs.push({ fromY: 0, toY: roomH, label: `${roomH}` })
              }

              const chainX = -70 / z
              const tkLen = 8 / z
              const sw = 1 / z
              const fs = 12 / z
              const dimCol = '#cbd5e1'
              const boundaries = Array.from(new Set(segs.flatMap(s => [s.fromY, s.toY])))

              return (
                <g pointerEvents="none" style={{ userSelect: 'none' }}>
                  <line x1={chainX} y1={0} x2={chainX} y2={roomH} stroke={dimCol} strokeWidth={sw} />
                  {boundaries.map((y, i) => (
                    <line key={i}
                      x1={chainX - tkLen} y1={y} x2={chainX + tkLen} y2={y}
                      stroke={dimCol} strokeWidth={sw}
                    />
                  ))}
                  {segs.map((seg, i) => {
                    const midY = (seg.fromY + seg.toY) / 2
                    const padX = fs * 1.8
                    const padY = fs * 0.6
                    return (
                      <g key={i} transform={`rotate(-90,${chainX},${midY})`}>
                        <rect x={chainX - padX} y={midY - padY} width={padX * 2} height={padY * 2} fill="#030712" />
                        <text x={chainX} y={midY}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize={fs} fill={dimCol}
                          style={{ userSelect: 'none', pointerEvents: 'none' }}>
                          {seg.label}
                        </text>
                      </g>
                    )
                  })}
                </g>
              )
            })()}

          </g>
        )}
      </svg>
    </div>
  )
}
