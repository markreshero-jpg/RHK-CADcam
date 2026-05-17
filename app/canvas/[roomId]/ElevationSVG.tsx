'use client'
import { useState, useReducer, useRef, useEffect } from 'react'
import { Room, Wall, CabinetInstance, DEFAULT_DIMS } from '@/src/lib/types'
import { cabT, wallDir, wallEnd, dist, findFreeSlot, cabBlocks, CAB_FILL, CAB_FILL_SEL } from '@/src/lib/geometry'
import { Selected, CabResize, viewReducer, DisplayConfig, Mode, modeAssemblyClass } from './canvasTypes'
import { layerSVGProps } from '@/src/lib/displayConfig'
import { getUserPrefs } from '@/src/lib/userPrefs'
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

// ── Line-drawing mode colours ─────────────────────────────────
const LINE_DRAW_COLORS: Record<string, string> = {
  left_side: '#94a3b8', right_side: '#94a3b8',
  bottom: '#94a3b8', back: '#475569',
  full_top: '#4ade80', front_rail: '#4ade80', back_rail: '#4ade80',
  kick_front_face: '#fbbf24',
  kick_sub_front: '#f97316', kick_back: '#f97316',
  spreader_vertical: '#f97316', spreader_horizontal: '#f97316',
  adj_shelf: '#a78bfa', fixed_shelf: '#818cf8',
  inner_drawer_back: '#818cf8',
  door: '#60a5fa', drawer_face: '#f472b6', false_panel: '#60a5fa',
}

function caseElevRect(p: ResolvedCasePart) {
  if (p.part_key === 'left_side' || p.part_key === 'right_side') {
    return { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
  }
  return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
}

function tkElevRect(p: ResolvedToekickPart) {
  if (p.part_key === 'spreader_horizontal') {
    return { ex: p.X, ey: p.Y + p.DY, ew: p.DX, eh: p.DY }
  }
  return { ex: p.X, ey: p.Y + p.DX, ew: p.DY, eh: p.DX }
}

function zoneElevRect(z: ResolvedFaceZone) {
  return { ex: z.X, ey: z.Y + z.DX, ew: z.DY, eh: z.DX }
}

function shelfElevRect(p: ResolvedInternalPart) {
  if (p.part_type === 'inner_drawer_back') {
    return { ex: p.X, ey: p.Y + p.DX, ew: p.DY, eh: p.DX }
  }
  return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
}


// wall.soffit_height is stored as depth FROM THE TOP (e.g. 300 = soffit drops 300mm from ceiling).
// Convert to height-from-floor: wallHeight - soffit_height.
// room.soffit_height and room.wall_cabinet_top are stored as height-from-floor.
function wallCabTopFor(w: Wall | null, room: Room): number {
  if (w?.soffit_height != null) {
    const wallH = w.height ?? room.room_dy ?? 2400
    return wallH - w.soffit_height
  }
  return room.soffit_height ?? room.wall_cabinet_top ?? 2100
}

function cabBottomZ(cab: CabinetInstance, room: Room, elevWall?: Wall | null): number {
  if (cab.assembly_class === 'wall' || cab.assembly_class === 'wall_corner') {
    return wallCabTopFor(elevWall ?? null, room) - cab.dy
  }
  return 0
}

function computeElevChain(cabs: CabinetInstance[], wall: Wall) {
  const sorted = [...cabs].sort((a, b) => cabT(a, wall) - cabT(b, wall))
  const segs: { from: number; to: number; label: number }[] = []
  let cursor = 0
  for (const cab of sorted) {
    const t = cabT(cab, wall)
    if (t > cursor + 0.5) segs.push({ from: cursor, to: t, label: Math.round(t - cursor) })
    segs.push({ from: t, to: t + cab.dx, label: Math.round(cab.dx) })
    cursor = t + cab.dx
  }
  if (cursor < wall.length - 0.5) segs.push({ from: cursor, to: wall.length, label: Math.round(wall.length - cursor) })
  return segs
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
  onCabResizeDone: () => void
  resolvedParts?: Map<string, ResolvedCabinet>
  onDeselect: () => void
}

export default function ElevationSVG({
  walls, cabinets, room, elevWallId, selected, displayConfig,
  multiSelect, canEqualize, mode, clipboard,
  onSelectCabinet, onSelectWall, onSetElevWall, onUpdateCabinet, onPlaceAtWall, onCabinetContextMenu,
  onBlankWallContextMenu, onShiftSelectCabinet, onEqualizeWidths,
  cabResize, onCabResizeStart, onCabResizeUpdate, onCabResizeDone,
  resolvedParts, onDeselect,
}: ElevationSVGProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [view, dispatchView] = useReducer(viewReducer, { panX: 80, panY: 60, zoom: 1 })
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const spaceRef = useRef(false)
  const shiftRef = useRef(false)

  // Click-to-grab following state
  const [elevCabFollowing, setElevCabFollowing] = useState<{ id: string } | null>(null)
  // Cursor position in wall coords: t = along wall (mm), ht = height above floor (mm)
  const [elevCabFloat, setElevCabFloat] = useState<{ t: number; ht: number } | null>(null)

  const [hoveredCabId, setHoveredCabId] = useState<string | null>(null)
  const [placeGhost, setPlaceGhost] = useState<{ t: number; cls: string; dx: number; dy: number } | null>(null)
  const [elevResizeFollowing, setElevResizeFollowing] = useState<{
    cabId: string; dim: 'dx' | 'dy'; side: 'left' | 'right' | 'top'
    startCabT: number; startCabEndT: number
    resWall: Wall; neighbours: { t: number; dx: number }[]
  } | null>(null)
  const [elevResizeLive, setElevResizeLive] = useState<{
    cabId: string; dim: 'dx' | 'dy'; value: number; posX?: number; posY?: number
  } | null>(null)
  // Prevents onMarkerClick from re-starting a resize on the same pointerup→click that just confirmed one.
  const justConfirmedRef = useRef(false)
  // Sync ref updated every render — gives the native pointermove handler fresh values without stale closures.
  const rfData = useRef({ elevResizeFollowing, view, cabinets, room } as {
    elevResizeFollowing: typeof elevResizeFollowing
    view: typeof view
    cabinets: CabinetInstance[]
    room: Room
  })

  const wall = walls.find(w => w.id === elevWallId) ?? null
  const wallCabs = wall ? cabinets.filter(c => c.wall_id === wall.id) : []
  const roomH = room.room_dy ?? 2400
  // Keep rfData current on every render (synchronous assignment, no useEffect needed).
  rfData.current = { elevResizeFollowing, view, cabinets, room }

  useEffect(() => {
    setPlaceGhost(null)
    setElevCabFollowing(null)
    setElevCabFloat(null)
    setElevResizeFollowing(null)
    setElevResizeLive(null)
  }, [mode])

  // Fit to wall on wall change; also clears any in-progress following
  useEffect(() => {
    setElevCabFollowing(null)
    setElevCabFloat(null)
    setElevResizeFollowing(null)
    setElevResizeLive(null)
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
      const inv = getUserPrefs().invertScroll
      const factor = (e.deltaY < 0) !== inv ? 1.15 : 1 / 1.15
      dispatchView({ type: 'zoom', factor, svgX: e.clientX - r.left, svgY: e.clientY - r.top })
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [])

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === ' ') { spaceRef.current = true; e.preventDefault() }
      if (e.key === 'Shift') shiftRef.current = true
      if (e.key === 'Escape') {
        setElevCabFollowing(null); setElevCabFloat(null)
        setElevResizeFollowing(null); setElevResizeLive(null); onCabResizeDone()
      }
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
    if (elevCabFollowing || elevResizeFollowing) return
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

    // Resize following — read from ref so view/elevResizeFollowing are always fresh (no stale closure)
    const rf = rfData.current.elevResizeFollowing
    if (rf) {
      const { cabId, dim, side, startCabT, startCabEndT, resWall, neighbours } = rf
      const v = rfData.current.view
      const svgR = svgRef.current!.getBoundingClientRect()
      const vz = v.zoom
      const wd = wallDir(resWall)
      const snap10 = (n: number) => Math.round(n / 10) * 10
      if (side === 'right') {
        const cursorT = (e.clientX - svgR.left - v.panX) / vz
        const rightBound = neighbours.filter(o => o.t > startCabT + 1).reduce((min, o) => Math.min(min, o.t), resWall.length)
        const newDx = Math.max(50, Math.min(rightBound - startCabT, snap10(cursorT - startCabT)))
        setElevResizeLive({ cabId, dim, value: newDx })
        onCabResizeUpdate({ liveValue: newDx })
      } else if (side === 'left') {
        const cursorT = (e.clientX - svgR.left - v.panX) / vz
        const leftBound = neighbours.filter(o => o.t + o.dx < startCabEndT - 1).reduce((max, o) => Math.max(max, o.t + o.dx), 0)
        const newDx = Math.max(50, Math.min(startCabEndT - leftBound, snap10(startCabEndT - cursorT)))
        const newT = startCabEndT - newDx
        const livePosX = resWall.pos_x + newT * wd.x
        const livePosY = resWall.pos_y + newT * wd.y
        setElevResizeLive({ cabId, dim, value: newDx, posX: livePosX, posY: livePosY })
        onCabResizeUpdate({ liveValue: newDx, livePosX, livePosY })
      } else if (side === 'top') {
        const cursorY = (e.clientY - svgR.top - v.panY) / vz
        const cab = rfData.current.cabinets.find(c => c.id === cabId)
        if (cab) {
          const rm = rfData.current.room
          const rH = rm.room_dy ?? 2400
          const newDy = Math.max(50, Math.min(5000, snap10(rH - cabBottomZ(cab, rm, resWall) - cursorY)))
          setElevResizeLive({ cabId, dim: 'dy', value: newDy })
          onCabResizeUpdate({ liveValue: newDy })
        }
      }
      return
    }

    // Following mode — float ghost at cursor
    if (elevCabFollowing && wall && mode === 'select') {
      const svgR = svgRef.current!.getBoundingClientRect()
      const t  = (e.clientX - svgR.left - view.panX) / view.zoom
      const sy = (e.clientY - svgR.top  - view.panY) / view.zoom
      setElevCabFloat({ t, ht: roomH - sy })
      return
    }

    // Placement ghost — track cursor when in a place mode
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
  }

  async function onPointerUp() {
    const wasPanning = panRef.current !== null
    panRef.current = null
    if (wasPanning || elevCabFollowing) return

    if (elevResizeFollowing) { await confirmResize(); return }

    if ((modeAssemblyClass(mode) || mode === 'paste') && wall && placeGhost) {
      const wd = wallDir(wall)
      const pos_x = wall.pos_x + placeGhost.t * wd.x
      const pos_y = wall.pos_y + placeGhost.t * wd.y
      setPlaceGhost(null)
      await onPlaceAtWall(wall, pos_x, pos_y)
      return
    }

  }

  async function confirmResize() {
    if (!elevResizeFollowing || !elevResizeLive) return
    const { cabId, dim, side } = elevResizeFollowing
    const { value, posX, posY } = elevResizeLive
    const update: Partial<CabinetInstance> = { [dim]: Math.round(value) }
    if (side === 'left' && posX !== undefined) {
      update.pos_x = Math.round(posX)
      update.pos_y = Math.round(posY!)
    }
    justConfirmedRef.current = true
    setTimeout(() => { justConfirmedRef.current = false }, 0)
    setElevResizeFollowing(null)
    setElevResizeLive(null)
    onCabResizeDone()
    await onUpdateCabinet(cabId, update)
  }

  // Click on blank SVG area → confirm resize if active, or place/move a cabinet
  function onSVGClick() {
    if (elevResizeFollowing) { void confirmResize(); return }
    if (!elevCabFollowing || !elevCabFloat || !wall) return
    const { id } = elevCabFollowing
    const cab = cabinets.find(c => c.id === id)
    if (!cab) { setElevCabFollowing(null); setElevCabFloat(null); return }

    const isWallCab = cab.assembly_class === 'wall' || cab.assembly_class === 'wall_corner'
    const wcTop = wallCabTopFor(wall, room)
    const snapBottomZ = isWallCab ? Math.max(0, wcTop - cab.dy) : 0

    const occupied = cabinets
      .filter(c => c.id !== id && c.wall_id === wall.id && cabBlocks(cab.assembly_class, c.assembly_class))
      .map(c => ({ t: cabT(c, wall), dx: c.dx }))
    const snapT = findFreeSlot(
      Math.max(0, Math.min(wall.length - cab.dx, elevCabFloat.t - cab.dx / 2)),
      cab.dx, wall.length, occupied
    )
    const wd = wallDir(wall)
    const pos_x = wall.pos_x + snapT * wd.x
    const pos_y = wall.pos_y + snapT * wd.y

    setElevCabFollowing(null)
    setElevCabFloat(null)
    onUpdateCabinet(id, { wall_id: wall.id, pos_x, pos_y, pos_z: snapBottomZ, rotation: wall.angle })
  }

  function onCabCrosshairClick(e: React.MouseEvent, cab: CabinetInstance) {
    if (mode !== 'select' || !wall) return
    e.stopPropagation()
    if (elevCabFollowing?.id === cab.id) {
      setElevCabFollowing(null)
      setElevCabFloat(null)
    } else {
      // Seed ghost at cabinet's current centre
      const t  = cabT(cab, wall) + cab.dx / 2
      const ht = cabBottomZ(cab, room, wall) + cab.dy / 2
      setElevCabFollowing({ id: cab.id })
      setElevCabFloat({ t, ht })
      onSelectCabinet(cab.id)
    }
  }

  function onCabPointerDown(e: React.PointerEvent, cab: CabinetInstance) {
    if (e.button !== 0 || !wall || spaceRef.current) return
    e.stopPropagation()
    if (elevCabFollowing) {
      setElevCabFollowing(null)
      setElevCabFloat(null)
      return
    }
    if (shiftRef.current) {
      onShiftSelectCabinet(cab.id)
      return
    }
    onSelectCabinet(cab.id)
  }

  function onMarkerClick(e: React.MouseEvent, cab: CabinetInstance, side: 'left' | 'right' | 'top') {
    if (mode !== 'select' || !wall) return
    e.stopPropagation()
    if (justConfirmedRef.current) return
    onSelectCabinet(cab.id)
    const t = cabT(cab, wall)
    const wd = wallDir(wall)
    const perp = { x: -wd.y, y: wd.x }
    const dim: 'dx' | 'dy' = side === 'top' ? 'dy' : 'dx'
    const neighbours = cabinets
      .filter(c => c.id !== cab.id && c.wall_id === wall.id && cabBlocks(cab.assembly_class, c.assembly_class))
      .map(c => ({ t: cabT(c, wall), dx: c.dx }))
    setElevResizeFollowing({ cabId: cab.id, dim, side, startCabT: t, startCabEndT: t + cab.dx, resWall: wall, neighbours })
    setElevResizeLive({ cabId: cab.id, dim, value: dim === 'dx' ? cab.dx : cab.dy })
    onCabResizeStart({
      cabId: cab.id, dim, side, wall, perp,
      startCabT: t, startCabEndT: t + cab.dx,
      liveValue: dim === 'dx' ? cab.dx : cab.dy,
    })
  }

  const isLineDrawing = displayConfig.activePreset === 'line_drawing'

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
        style={{ cursor: elevCabFollowing ? 'crosshair' : elevResizeFollowing ? (elevResizeFollowing.side === 'top' ? 'ns-resize' : 'ew-resize') : spaceRef.current ? 'grab' : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={onSVGClick}
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
                  fill={isLineDrawing ? 'none' : '#1f2937'}
                  stroke={isWallSel ? '#3b82f6' : '#374151'}
                  strokeWidth={isWallSel ? 2 / z : 1 / z}
                  style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); onSelectWall(wall.id) }}
                  onContextMenu={cmHandler} />
              )
            })()}

            {/* Floor line */}
            <line x1={0} y1={roomH} x2={wall.length} y2={roomH}
              stroke="#4b5563" strokeWidth={2 / z} />

            {/* Ceiling / soffit / wall-cabinet-top — not applicable to islands */}
            {wall.wall_type !== 'island' && (() => {
              // soffitH = height from floor; wall.soffit_height stored as depth-from-top
              const soffitH = wall.soffit_height != null
                ? (wall.height ?? roomH) - wall.soffit_height
                : room.soffit_height ?? null
              const wcTop   = room.wall_cabinet_top ?? null
              return (<>
                <line x1={0} y1={0} x2={wall.length} y2={0}
                  stroke="#374151" strokeWidth={1 / z}
                  strokeDasharray={`${8 / z} ${4 / z}`} />
                {soffitH != null && (
                  <line x1={0} y1={roomH - soffitH} x2={wall.length} y2={roomH - soffitH}
                    stroke="#78350f" strokeWidth={0.5 / z} strokeDasharray={`${6 / z} ${3 / z}`} />
                )}
                {wcTop != null && (
                  <line x1={0} y1={roomH - wcTop} x2={wall.length} y2={roomH - wcTop}
                    stroke="#1e3a5f" strokeWidth={0.5 / z} strokeDasharray={`${4 / z} ${4 / z}`} />
                )}
              </>)
            })()}

            {/* Return walls */}
            {(() => {
              const TOL = 50
              const wS = { x: wall.pos_x, y: wall.pos_y }
              const wE = wallEnd(wall)
              let leftReturn: Wall | null = null
              let rightReturn: Wall | null = null
              for (const w of walls) {
                if (w.id === wall.id || w.wall_type === 'island') continue
                const s = { x: w.pos_x, y: w.pos_y }
                const e = wallEnd(w)
                if (!leftReturn  && (dist(s, wS) < TOL || dist(e, wS) < TOL)) leftReturn  = w
                if (!rightReturn && (dist(s, wE) < TOL || dist(e, wE) < TOL)) rightReturn = w
              }

              const dimFs2 = 10 / z
              const renderReturn = (rw: Wall, isLeft: boolean) => {
                const t    = rw.thickness
                const rwH  = rw.height ?? room.room_dy ?? 2400
                const x0   = isLeft ? -t : wall.length
                const slabY = roomH - rwH
                const midY  = slabY + rwH / 2
                const midX  = x0 + t / 2
                const clipId = `return-clip-${rw.id}`
                return (
                  <g key={rw.id} style={{ pointerEvents: 'none' }}>
                    <defs>
                      <clipPath id={clipId}>
                        <rect x={x0} y={slabY} width={t} height={rwH} />
                      </clipPath>
                    </defs>
                    <rect x={x0} y={slabY} width={t} height={rwH}
                      fill="#111827" stroke="#4b5563" strokeWidth={1 / z} />
                    <g clipPath={`url(#${clipId})`}>
                      {Array.from({ length: Math.floor(rwH / (t * 1.5)) + 2 }, (_, i) => {
                        const y1 = slabY + i * t * 1.5 - t
                        return <line key={i} x1={x0} y1={y1} x2={x0 + t} y2={y1 + t}
                          stroke="#1f2937" strokeWidth={1.5 / z} />
                      })}
                    </g>
                    {slabY > 1 && (
                      <line x1={x0} y1={slabY} x2={x0 + t} y2={slabY}
                        stroke="#6b7280" strokeWidth={1.5 / z}
                        strokeDasharray={`${4 / z} ${3 / z}`} />
                    )}
                    <text x={midX} y={midY}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={dimFs2} fill="#6b7280"
                      transform={`rotate(-90,${midX},${midY})`}
                      style={{ userSelect: 'none' }}>
                      {rw.name}
                    </text>
                    <line x1={x0} y1={slabY - tickH * 0.7} x2={x0 + t} y2={slabY - tickH * 0.7}
                      stroke="#4b5563" strokeWidth={1 / z} />
                    <line x1={x0}     y1={slabY - tickH * 0.3} x2={x0}     y2={slabY - tickH * 1.1} stroke="#4b5563" strokeWidth={1 / z} />
                    <line x1={x0 + t} y1={slabY - tickH * 0.3} x2={x0 + t} y2={slabY - tickH * 1.1} stroke="#4b5563" strokeWidth={1 / z} />
                    <text x={midX} y={slabY - tickH * 1.5}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={dimFs2} fill="#4b5563"
                      style={{ userSelect: 'none' }}>
                      {t}
                    </text>
                  </g>
                )
              }

              return (<>
                {leftReturn  && renderReturn(leftReturn,  true)}
                {rightReturn && renderReturn(rightReturn, false)}
              </>)
            })()}

            {/* Cabinets */}
            {wallCabs.map(cab => {
              const baseT   = cabT(cab, wall)
              const bottomZ = cabBottomZ(cab, room, wall)
              const isSel   = selected?.type === 'cabinet' && selected.id === cab.id
              const isMultiSel = multiSelect.includes(cab.id)
              const isFollowing = elevCabFollowing?.id === cab.id

              // Apply live resize values
              let displayDx = cab.dx
              let displayDy = cab.dy
              let displayT  = baseT
              if (elevResizeLive?.cabId === cab.id) {
                if (elevResizeLive.dim === 'dx') {
                  displayDx = elevResizeLive.value
                  if (elevResizeLive.posX !== undefined) {
                    const wd2 = wallDir(wall)
                    displayT = (elevResizeLive.posX - wall.pos_x) * wd2.x + (elevResizeLive.posY! - wall.pos_y) * wd2.y
                  }
                } else if (elevResizeLive.dim === 'dy') {
                  displayDy = elevResizeLive.value
                }
              }

              const rx = displayT
              const ry = roomH - bottomZ - displayDy

              const isBase = cab.assembly_class === 'base' || cab.assembly_class === 'base_corner'
              const isTall = cab.assembly_class === 'tall' || cab.assembly_class === 'tall_corner'
              const tkH = (isBase || isTall) && cab.has_toekick ? 150 : 0

              const baseColor = isSel ? CAB_FILL_SEL[cab.assembly_class] : CAB_FILL[cab.assembly_class]
              const isHover = hoveredCabId === cab.id && !isSel && !isMultiSel
              const cabStroke = isSel ? '#e2e8f0' : isMultiSel ? '#f59e0b' : isHover ? '#f97316' : '#3b82f6'
              const cabStrokeW = isSel || isMultiSel || isHover ? 2 / z : 1 / z

              const carcL = displayConfig.layers.carcass
              const faceL = displayConfig.layers.face
              const intL  = displayConfig.layers.internal
              const tkL   = displayConfig.layers.toekick
              const lblL  = displayConfig.layers.labels
              const dimL  = displayConfig.layers.dimensions

              const carcP = layerSVGProps(carcL.style, z)
              const faceP = layerSVGProps(faceL.style, z)
              const intP  = layerSVGProps(intL.style, z)
              const tkP   = layerSVGProps(tkL.style, z)

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

              return (
                <g key={cab.id}
                  style={{ cursor: 'default' }}
                  opacity={isFollowing ? 0.4 : 1}
                  onPointerDown={e => onCabPointerDown(e, cab)}
                  onPointerEnter={() => setHoveredCabId(cab.id)}
                  onPointerLeave={() => setHoveredCabId(null)}
                  onClick={e => { e.stopPropagation(); if (!shiftRef.current) onSelectCabinet(cab.id) }}
                  onContextMenu={e => onCabinetContextMenu(e, cab.id)}
                >
                  {/* Invisible hit area */}
                  <rect x={rx} y={ry} width={displayDx} height={displayDy} fill="transparent" stroke="none" />

                  {/* ── Resolved geometry — actual panels ── */}
                  {(() => {
                    // During live resize, resolved panel coords are stale (fixed at original dims).
                    // Fall back to simple rect so the resize renders live.
                    const isBeingResized = elevResizeLive?.cabId === cab.id
                    const rp = isBeingResized ? undefined : resolvedParts?.get(cab.id)
                    if (!rp) {
                      return (<>
                        {carcL.visible && (
                          <rect x={rx} y={ry} width={displayDx} height={displayDy}
                            fill={isLineDrawing ? 'none' : baseColor}
                            fillOpacity={isLineDrawing ? 0 : carcP.fillOpacity}
                            stroke={isLineDrawing ? (isSel ? '#e2e8f0' : '#94a3b8') : cabStroke}
                            strokeWidth={isLineDrawing ? 1 / z : cabStrokeW}
                            strokeDasharray={isLineDrawing ? undefined : carcP.strokeDasharray}
                            opacity={carcP.opacity} />
                        )}
                        {tkL.visible && cab.has_toekick && tkH > 0 && (
                          <rect x={rx} y={ry + displayDy - tkH} width={displayDx} height={tkH}
                            fill={isLineDrawing ? 'none' : baseColor}
                            fillOpacity={isLineDrawing ? 0 : (tkP.fillOpacity * 0.5) || 0}
                            stroke={isLineDrawing ? '#fbbf24' : (isSel ? '#e2e8f0' : '#475569')}
                            strokeWidth={1 / z}
                            strokeDasharray={isLineDrawing ? undefined : (tkP.strokeDasharray ?? `${4 / z} ${2 / z}`)}
                            opacity={tkP.opacity} />
                        )}
                        {intL.visible && shelfYs.map((sy, i) => (
                          <line key={i} x1={rx + 4 / z} y1={sy} x2={rx + displayDx - 4 / z} y2={sy}
                            stroke={isLineDrawing ? '#a78bfa' : (isSel ? '#cbd5e1' : '#4b5563')}
                            strokeWidth={1 / z}
                            strokeDasharray={isLineDrawing || intL.style === 'solid' ? undefined : `${8 / z} ${4 / z}`}
                            opacity={intP.opacity} />
                        ))}
                        {faceL.visible && cab.has_face && (() => {
                          const ins = 15; const fw = displayDx - ins * 2; const fh = displayDy - tkH - ins * 2
                          if (fw <= 0 || fh <= 0) return null
                          return <rect x={rx + ins} y={ry + ins} width={fw} height={fh}
                            fill={isLineDrawing ? 'none' : baseColor}
                            fillOpacity={isLineDrawing ? 0 : faceP.fillOpacity * 0.45}
                            stroke={isLineDrawing ? '#60a5fa' : (isSel ? '#e2e8f0' : baseColor)}
                            strokeWidth={isLineDrawing ? 1 / z : 0.75 / z}
                            strokeDasharray={isLineDrawing ? undefined : faceP.strokeDasharray}
                            opacity={faceP.opacity} />
                        })()}
                      </>)
                    }

                    const toSVG = (ex: number, ey: number, ew: number, eh: number) => ({
                      x: rx + ex, y: ry + displayDy - ey, w: ew, h: eh,
                    })

                    return (<>
                      {carcL.visible && rp.case_parts.filter(p => p.part_key !== 'back').map((p, i) => {
                        const { ex, ey, ew, eh } = caseElevRect(p)
                        const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                        const fill = PART_COLORS[p.part_key] ?? '#b8c8dc'
                        const ldStroke = LINE_DRAW_COLORS[p.part_key] ?? '#94a3b8'
                        return (
                          <rect key={`cp-${i}`} x={x} y={y} width={w} height={h}
                            fill={isLineDrawing ? 'none' : fill}
                            fillOpacity={isLineDrawing ? 0 : 0.6}
                            stroke={isLineDrawing ? ldStroke : (isSel ? '#e2e8f0' : fill)}
                            strokeWidth={isLineDrawing ? 1 / z : 0.5 / z}
                            opacity={carcP.opacity} style={{ pointerEvents: 'none' }} />
                        )
                      })}
                      {tkL.visible && rp.toekick_parts.map((p, i) => {
                        const { ex, ey, ew, eh } = tkElevRect(p)
                        const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                        const fill = PART_COLORS[p.part_key] ?? '#f59e0b'
                        const ldStroke = LINE_DRAW_COLORS[p.part_key] ?? '#fbbf24'
                        const isSpreader = p.part_key === 'spreader_vertical' || p.part_key === 'spreader_horizontal'
                        if (isLineDrawing) {
                          return (
                            <rect key={`tk-${i}`} x={x} y={y} width={w} height={h}
                              fill="none"
                              stroke={ldStroke} strokeWidth={1 / z}
                              strokeDasharray={isSpreader ? `${4 / z} ${3 / z}` : undefined}
                              opacity={tkP.opacity} style={{ pointerEvents: 'none' }} />
                          )
                        }
                        return isSpreader
                          ? <rect key={`tk-${i}`} x={x} y={y} width={w} height={h}
                              fill="none"
                              stroke={isSel ? '#e2e8f0' : fill} strokeWidth={1 / z}
                              strokeDasharray={`${4 / z} ${3 / z}`}
                              opacity={tkP.opacity} style={{ pointerEvents: 'none' }} />
                          : <rect key={`tk-${i}`} x={x} y={y} width={w} height={h}
                              fill={fill} fillOpacity={0.7}
                              stroke={isSel ? '#e2e8f0' : fill} strokeWidth={0.5 / z}
                              opacity={tkP.opacity} style={{ pointerEvents: 'none' }} />
                      })}
                      {intL.visible && rp.internal_parts.map((p, i) => {
                        const { ex, ey, ew, eh } = shelfElevRect(p)
                        const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                        const fill = PART_COLORS[p.part_type] ?? '#818cf8'
                        const ldStroke = LINE_DRAW_COLORS[p.part_type] ?? '#a78bfa'
                        return (
                          <rect key={`ip-${i}`} x={x} y={y} width={w} height={h}
                            fill={isLineDrawing ? 'none' : fill}
                            fillOpacity={isLineDrawing ? 0 : 0.6}
                            stroke={isLineDrawing ? ldStroke : fill}
                            strokeWidth={isLineDrawing ? 1 / z : 0.5 / z}
                            opacity={intP.opacity} style={{ pointerEvents: 'none' }} />
                        )
                      })}
                      {faceL.visible && rp.face_zones.map((fz, i) => {
                        const { ex, ey, ew, eh } = zoneElevRect(fz)
                        const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                        const fill = PART_COLORS[fz.face_type] ?? '#60a5fa'
                        const ldStroke = LINE_DRAW_COLORS[fz.face_type] ?? '#60a5fa'
                        const faceStroke = isLineDrawing ? ldStroke : (isSel ? '#e2e8f0' : fill)
                        const hingeLine = fz.hinge_side === 'left'
                          ? <line x1={x} y1={y} x2={x} y2={y + h} stroke={faceStroke} strokeWidth={isLineDrawing ? 1.5 / z : 2 / z} style={{ pointerEvents: 'none' }} />
                          : fz.hinge_side === 'right'
                          ? <line x1={x + w} y1={y} x2={x + w} y2={y + h} stroke={faceStroke} strokeWidth={isLineDrawing ? 1.5 / z : 2 / z} style={{ pointerEvents: 'none' }} />
                          : null
                        const chevron = displayConfig.annotations.elev_door_chevrons && fz.face_type === 'door' && fz.hinge_side
                          ? (() => {
                              const pts = fz.hinge_side === 'left'
                                ? `${x},${y} ${x + w},${y + h / 2} ${x},${y + h}`
                                : `${x + w},${y} ${x},${y + h / 2} ${x + w},${y + h}`
                              return <polyline points={pts} fill="none" stroke={faceStroke}
                                strokeWidth={0.5 / z} strokeOpacity={0.7}
                                strokeDasharray={`${6 / z} ${3 / z}`}
                                strokeLinejoin="miter" strokeLinecap="butt"
                                style={{ pointerEvents: 'none' }} />
                            })()
                          : null
                        return (
                          <g key={`fz-${i}`} style={{ pointerEvents: 'none' }}>
                            <rect x={x} y={y} width={w} height={h}
                              fill={isLineDrawing ? 'none' : fill}
                              fillOpacity={isLineDrawing ? 0 : 0.25}
                              stroke={faceStroke} strokeWidth={1 / z}
                              opacity={faceP.opacity} />
                            {hingeLine}
                            {chevron}
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

                  {/* Centre crosshair — visible only when selected */}
                  {isSel && (() => {
                    const cx = rx + displayDx / 2
                    const cy = ry + displayDy / 2
                    const arm = 10 / z
                    const isF = isFollowing
                    return (
                      <g>
                        <line x1={cx - arm} y1={cy} x2={cx + arm} y2={cy}
                          stroke={isF ? '#60a5fa' : 'white'} strokeWidth={1.5 / z}
                          opacity={isF ? 1 : 0.4} strokeLinecap="round"
                          style={{ pointerEvents: 'none' }} />
                        <line x1={cx} y1={cy - arm} x2={cx} y2={cy + arm}
                          stroke={isF ? '#60a5fa' : 'white'} strokeWidth={1.5 / z}
                          opacity={isF ? 1 : 0.4} strokeLinecap="round"
                          style={{ pointerEvents: 'none' }} />
                        <circle cx={cx} cy={cy} r={3 / z}
                          fill={isF ? '#60a5fa' : 'white'} opacity={isF ? 1 : 0.4}
                          style={{ pointerEvents: 'none' }} />
                        {/* Transparent hit circle — blocks body pointerDown, handles click */}
                        <circle cx={cx} cy={cy} r={8 / z} fill="transparent"
                          style={{ cursor: isF ? 'crosshair' : 'move' }}
                          onPointerDown={ev => ev.stopPropagation()}
                          onClick={ev => onCabCrosshairClick(ev, cab)} />
                      </g>
                    )
                  })()}

                  {/* Resize markers — selected cabinet only, hidden during multi-select */}
                  {isSel && multiSelect.length < 2 && (
                    <>
                      <circle cx={rx} cy={ry + displayDy / 2} r={mr}
                        fill="#1d4ed8" stroke="#93c5fd" strokeWidth={1.5 / z}
                        style={{ cursor: 'ew-resize' }}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => onMarkerClick(e, cab, 'left')}
                      />
                      <circle cx={rx + displayDx} cy={ry + displayDy / 2} r={mr}
                        fill="#1d4ed8" stroke="#93c5fd" strokeWidth={1.5 / z}
                        style={{ cursor: 'ew-resize' }}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => onMarkerClick(e, cab, 'right')}
                      />
                      <circle cx={rx + displayDx / 2} cy={ry} r={mr}
                        fill="#7c3aed" stroke="#c4b5fd" strokeWidth={1.5 / z}
                        style={{ cursor: 'ns-resize' }}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => onMarkerClick(e, cab, 'top')}
                      />
                    </>
                  )}
                </g>
              )
            })}

            {/* Placement ghost */}
            {placeGhost && (() => {
              const isWallCls = placeGhost.cls === 'wall' || placeGhost.cls === 'wall_corner'
              const wcTop = wallCabTopFor(wall, room)
              const ghostBZ = isWallCls ? Math.max(0, wcTop - placeGhost.dy) : 0
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

            {/* Following ghost — free-float at cursor, shows snap landing + arrow */}
            {elevCabFollowing && elevCabFloat && (() => {
              const followingCab = cabinets.find(c => c.id === elevCabFollowing.id)
              if (!followingCab || !wall) return null

              const isWallCab = followingCab.assembly_class === 'wall' || followingCab.assembly_class === 'wall_corner'
              const wcTop = wallCabTopFor(wall, room)
              const snapBottomZ = isWallCab ? Math.max(0, wcTop - followingCab.dy) : 0

              // Ghost centred on cursor
              const gx = elevCabFloat.t - followingCab.dx / 2
              const gy = roomH - elevCabFloat.ht - followingCab.dy / 2

              // Snap landing
              const occupied = cabinets
                .filter(c => c.id !== elevCabFollowing.id && c.wall_id === wall.id && cabBlocks(followingCab.assembly_class, c.assembly_class))
                .map(c => ({ t: cabT(c, wall), dx: c.dx }))
              const snapT = findFreeSlot(
                Math.max(0, Math.min(wall.length - followingCab.dx, elevCabFloat.t - followingCab.dx / 2)),
                followingCab.dx, wall.length, occupied
              )
              const snapX = snapT
              const snapY = roomH - snapBottomZ - followingCab.dy

              // Arrow: from ghost face (bottom for base/tall, top for wall) toward snap surface
              const arrowFromX = elevCabFloat.t
              const arrowFromY = isWallCab ? gy : gy + followingCab.dy
              const arrowToX   = snapT + followingCab.dx / 2
              const arrowToY   = isWallCab ? (roomH - wcTop) : roomH

              const arrowSize = 12 / z
              const adx = arrowToX - arrowFromX
              const ady = arrowToY - arrowFromY
              const alen = Math.sqrt(adx * adx + ady * ady)
              const showArrow = alen > arrowSize * 1.5

              const baseColor = CAB_FILL[followingCab.assembly_class]
              const selColor  = CAB_FILL_SEL[followingCab.assembly_class]

              return (<>
                {/* Snap landing outline */}
                <rect x={snapX} y={snapY} width={followingCab.dx} height={followingCab.dy}
                  fill="none" stroke="#60a5fa" strokeWidth={1 / z}
                  strokeDasharray={`${4 / z} ${4 / z}`} opacity={0.5}
                  style={{ pointerEvents: 'none' }} />

                {/* Arrow + arrowhead from ghost face to snap surface */}
                {showArrow && (<>
                  <line x1={arrowFromX} y1={arrowFromY} x2={arrowToX} y2={arrowToY}
                    stroke="#60a5fa" strokeWidth={1.5 / z}
                    strokeDasharray={`${8 / z} ${4 / z}`}
                    style={{ pointerEvents: 'none' }} />
                  <polygon
                    points={[
                      `${arrowToX},${arrowToY}`,
                      `${arrowToX - (adx / alen) * arrowSize - (ady / alen) * arrowSize * 0.4},${arrowToY - (ady / alen) * arrowSize + (adx / alen) * arrowSize * 0.4}`,
                      `${arrowToX - (adx / alen) * arrowSize + (ady / alen) * arrowSize * 0.4},${arrowToY - (ady / alen) * arrowSize - (adx / alen) * arrowSize * 0.4}`,
                    ].join(' ')}
                    fill="#60a5fa"
                    style={{ pointerEvents: 'none' }} />
                </>)}

                {/* Floating ghost */}
                <rect x={gx} y={gy} width={followingCab.dx} height={followingCab.dy}
                  fill={baseColor + 'cc'} stroke={selColor}
                  strokeWidth={2 / z} strokeDasharray={`${6 / z} ${3 / z}`}
                  style={{ pointerEvents: 'none' }} />
              </>)
            })()}

            {/* Top horizontal chain — overhead cabs (wall + wall_corner) */}
            {displayConfig.layers.dim_elev_wall_chain.visible && (() => {
              const overheadCabs = wallCabs.filter(c =>
                c.assembly_class === 'wall' || c.assembly_class === 'wall_corner'
              )
              if (overheadCabs.length === 0) return null
              const segs = computeElevChain(overheadCabs, wall)
              const chainY = -tickH * 2
              const col = '#cbd5e1'
              const sw = 1 / z, fs = 12 / z, tk = 8 / z
              const boundaries = Array.from(new Set(segs.flatMap(s => [s.from, s.to])))
              return (
                <g pointerEvents="none" style={{ userSelect: 'none' }}>
                  <line x1={0} y1={chainY} x2={wall.length} y2={chainY} stroke={col} strokeWidth={sw} />
                  {boundaries.map((x, i) => (
                    <line key={i} x1={x} y1={chainY - tk} x2={x} y2={chainY + tk} stroke={col} strokeWidth={sw} />
                  ))}
                  {segs.map((seg, i) => {
                    const mx = (seg.from + seg.to) / 2
                    const padX = fs * 1.8, padY = fs * 0.6
                    return (
                      <g key={i}>
                        <rect x={mx - padX} y={chainY - padY} width={padX * 2} height={padY * 2} fill="#030712" />
                        <text x={mx} y={chainY} textAnchor="middle" dominantBaseline="middle"
                          fontSize={fs} fill={col} style={{ userSelect: 'none', pointerEvents: 'none' }}>
                          {seg.label}
                        </text>
                      </g>
                    )
                  })}
                </g>
              )
            })()}

            {/* Bottom horizontal chain — floor-touching cabs (base + tall), closest to the elevation */}
            {displayConfig.layers.dim_elev_floor_chain.visible && (() => {
              const floorCabs = wallCabs.filter(c =>
                c.assembly_class === 'base' || c.assembly_class === 'base_corner' ||
                c.assembly_class === 'tall' || c.assembly_class === 'tall_corner'
              )
              if (floorCabs.length === 0) return null
              const segs = computeElevChain(floorCabs, wall)
              const chainY = roomH + tickH * 1.5
              const col = '#cbd5e1'
              const sw = 1 / z, fs = 12 / z, tk = 8 / z
              const boundaries = Array.from(new Set(segs.flatMap(s => [s.from, s.to])))
              return (
                <g pointerEvents="none" style={{ userSelect: 'none' }}>
                  <line x1={0} y1={chainY} x2={wall.length} y2={chainY} stroke={col} strokeWidth={sw} />
                  {boundaries.map((x, i) => (
                    <line key={i} x1={x} y1={chainY - tk} x2={x} y2={chainY + tk} stroke={col} strokeWidth={sw} />
                  ))}
                  {segs.map((seg, i) => {
                    const mx = (seg.from + seg.to) / 2
                    const padX = fs * 1.8, padY = fs * 0.6
                    return (
                      <g key={i}>
                        <rect x={mx - padX} y={chainY - padY} width={padX * 2} height={padY * 2} fill="#030712" />
                        <text x={mx} y={chainY} textAnchor="middle" dominantBaseline="middle"
                          fontSize={fs} fill={col} style={{ userSelect: 'none', pointerEvents: 'none' }}>
                          {seg.label}
                        </text>
                      </g>
                    )
                  })}
                </g>
              )
            })()}

            {/* Bottom dimension — overall wall length */}
            {(() => {
              const dimY = roomH + tickH * 4
              const fs = 12 / z, tk = 8 / z, sw = 1 / z, col = '#cbd5e1'
              const mx = wall.length / 2
              const padX = fs * 1.8, padY = fs * 0.6
              return (
                <g pointerEvents="none" style={{ userSelect: 'none' }}>
                  <line x1={0} y1={dimY} x2={wall.length} y2={dimY} stroke={col} strokeWidth={sw} />
                  <line x1={0}           y1={dimY - tk} x2={0}           y2={dimY + tk} stroke={col} strokeWidth={sw} />
                  <line x1={wall.length} y1={dimY - tk} x2={wall.length} y2={dimY + tk} stroke={col} strokeWidth={sw} />
                  <rect x={mx - padX} y={dimY - padY} width={padX * 2} height={padY * 2} fill="#030712" />
                  <text x={mx} y={dimY} textAnchor="middle" dominantBaseline="middle"
                    fontSize={fs} fill={col} style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {Math.round(wall.length)}
                  </text>
                </g>
              )
            })()}

            {/* Left dimension — Y-axis height chain */}
            {displayConfig.layers.dim_elevation_y.visible && (() => {
              const baseCabEl = wallCabs.find(c => c.assembly_class === 'base' || c.assembly_class === 'base_corner') ?? null
              const overheadCabEl = wallCabs.find(c => c.assembly_class === 'wall' || c.assembly_class === 'wall_corner') ?? null
              const kickH = baseCabEl?.has_toekick ? 150 : 0
              const baseDy = baseCabEl?.dy ?? 0
              const wallCabTop = wallCabTopFor(wall, room)
              const overheadDy = overheadCabEl?.dy ?? 0

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
