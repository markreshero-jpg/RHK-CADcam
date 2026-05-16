'use client'

import { useState, useRef, useEffect, useCallback, useReducer } from 'react'
import { supabase } from '@/src/lib/supabase'
import { Project, Room, Wall, CabinetInstance, AssemblyClass, DEFAULT_DIMS } from '@/src/lib/types'
import {
  Pt, MIN_ZOOM, MAX_ZOOM, MIN_WALL_LEN, SNAP_PX, WALL_SNAP_PX,
  toDeg, dist,
  wallEnd, wallDir,
  snapEndpoint, snapAngle,
  nearestWall, findFreeSlot, cabBlocks, cabT, nextLabel,
  centroid, wallInwardNormal, islandCabPerp, cabinetCenterPt,
} from '@/src/lib/geometry'
import { isEndpointUpdate, computeJointUpdates } from '@/src/lib/wallJoints'
import { dbSaveWall, dbUpdateWall, dbDeleteWall, dbInsertCabinet, dbResolveAndPersistCabinet, dbUpdateCabinet, dbDeleteCabinet, dbLoadResolvedParts } from './canvasDB'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { useCanvasHistory } from './useCanvasHistory'
import {
  Mode, Selected, CanvasView, ViewState, ViewAction, PlaceGhost, CabDrag, CabMoveDrag, CabResize, ContextMenuState, MenuGroup,
  viewReducer, modeAssemblyClass, DisplayConfig, PresetId,
  DEFAULT_DISPLAY_CONFIG, applyPreset,
} from './canvasTypes'
import { DISPLAY_PRESETS } from '@/src/lib/displayConfig'
import CanvasMenubar from './CanvasMenubar'
import CanvasSidebar from './CanvasSidebar'
import CanvasSVG from './CanvasSVG'
import ElevationSVG from './ElevationSVG'
import CanvasContextMenu from './CanvasContextMenu'
import { buildContextMenuGroups } from './canvasContextItems'
import DeleteWallModal from './DeleteWallModal'
import DrawingPanel, { type DrawingPanelHandle } from './DrawingPanel'
import WallDrawPanel from './WallDrawPanel'
import WallPanel from './WallPanel'
import CabinetPanel from './CabinetPanel'
import CabinetResizePanel from './CabinetResizePanel'
import CabinetEditModal from './CabinetEditModal'
import JobPropertiesModal, { type JobPropertiesTab } from './JobPropertiesModal'
import RoomPropertiesModal, { type RoomPropertiesTab } from './RoomPropertiesModal'
import Room3DScene from './Room3DScene'

export default function CanvasClient({ project: initProject, room: initRoom, walls: initWalls, initialCabinets }: {
  project: Project | null
  room: Room
  walls: Wall[]
  initialCabinets: CabinetInstance[]
}) {
  const [project, setProjectState] = useState<Project | null>(initProject)
  const [room, setRoomState] = useState<Room>(initRoom)
  const [walls, setWalls] = useState<Wall[]>(initWalls)
  const [cabinets, setCabinets] = useState<CabinetInstance[]>(initialCabinets)
  const [mode, setMode] = useState<Mode>('select')
  const [selected, setSelected] = useState<Selected>(null)
  const [view, dispatchView] = useReducer(viewReducer, { panX: 200, panY: 200, zoom: 0.15 })
  const [svgSize, setSvgSize] = useState({ w: 1200, h: 800 })
  const [drawThickness, setDrawThickness] = useState(90)
  const [drawStart, setDrawStart] = useState<Pt | null>(null)
  const [drawCursor, setDrawCursor] = useState<Pt | null>(null)
  const [placeGhost, setPlaceGhost] = useState<PlaceGhost | null>(null)
  const [cabDrag, setCabDrag] = useState<CabDrag | null>(null)
  const [cabResize, setCabResize] = useState<CabResize | null>(null)
  const [cabMoveDrag, setCabMoveDrag] = useState<CabMoveDrag | null>(null)
  const [multiSelect, setMultiSelect] = useState<string[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [deleteWallPending, setDeleteWallPending] = useState<string | null>(null)
  const [clipboard, setClipboard] = useState<CabinetInstance | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [wallMenuOpen, setWallMenuOpen] = useState(false)
  const [cabMenuOpen, setCabMenuOpen] = useState(false)
  const [drawHeight, setDrawHeight] = useState<number | null>(null)
  const [sidebarW, setSidebarW] = useState(192)
  const [mouseWorld, setMouseWorld] = useState<Pt>({ x: 0, y: 0 })
  const [canvasView, setCanvasView] = useState<CanvasView>('plan')
  const [elevWallId, setElevWallId] = useState<string | null>(null)
  const [displayConfig, setDisplayConfig] = useState<DisplayConfig>(DEFAULT_DISPLAY_CONFIG)
  const [jobModalTab, setJobModalTab] = useState<JobPropertiesTab | null>(null)
  const [roomModalTab, setRoomModalTab] = useState<RoomPropertiesTab | null>(null)
  const [editCabId, setEditCabId] = useState<string | null>(null)
  const [editCabInitialView, setEditCabInitialView] = useState<'3d' | 'elevation'>('elevation')
  const [resolvedParts, setResolvedParts] = useState<Map<string, ResolvedCabinet>>(new Map())
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  const { captureSnapshot, handleUndo, handleRedo, wallsRef, cabinetsRef, canUndo, canRedo } =
    useCanvasHistory(walls, cabinets, setWalls, setCabinets, setSelected)

  const svgRef = useRef<SVGSVGElement>(null)
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const cabDragRef = useRef<{ cabId: string; assemblyClass: AssemblyClass; wall: Wall; cabDX: number; dragOffset: number } | null>(null)
  const cabDragOriginRef = useRef<Pt | null>(null)
  const cabResizeDragging = useRef(false)
  const cabMoveDragRef = useRef<{ cabId: string; assemblyClass: AssemblyClass } | null>(null)
  const spaceRef = useRef(false)
  const shiftRef = useRef(false)
  const placingRef = useRef(false)
  const sidebarResizeRef = useRef<{ startX: number; startW: number } | null>(null)
  const marqueeStartRef = useRef<Pt | null>(null)
  // Tracks whether a pointerdown actually fired on the SVG — guards against phantom
  // pointerup events that arrive when Next.js mounts the canvas mid-navigation-click.
  const svgPointerDownRef = useRef(false)
  // Set to true when pointerDown starts the draw (so the matching pointerUp doesn't finish it).
  const drawStartedThisDownRef = useRef(false)
  const drawingPanelRef = useRef<DrawingPanelHandle>(null)

  // ── Coordinate helpers ────────────────────────────────────────────────────

  const toWorld = useCallback((svgX: number, svgY: number): Pt => ({
    x: (svgX - view.panX) / view.zoom,
    y: (svgY - view.panY) / view.zoom,
  }), [view])

  function svgCoords(e: React.PointerEvent | PointerEvent | MouseEvent): Pt {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!svgRef.current) return
    const { width, height } = svgRef.current.getBoundingClientRect()
    setSvgSize({ w: width, h: height })
    if (walls.length > 0) {
      const pts = walls.flatMap(w => [{ x: w.pos_x, y: w.pos_y }, wallEnd(w)])
      const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x))
      const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y))
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((width * 0.6) / (maxX - minX + 500), (height * 0.6) / (maxY - minY + 500))))
      dispatchView({ type: 'set', panX: width / 2 - ((minX + maxX) / 2) * z, panY: height / 2 - ((minY + maxY) / 2) * z, zoom: z })
    } else {
      dispatchView({ type: 'set', panX: width / 2, panY: height / 2, zoom: 0.15 })
    }
  }, []) // intentionally mount-only

  useEffect(() => {
    const svg = svgRef.current; if (!svg) return
    const ro = new ResizeObserver(([e]) => setSvgSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(svg); return () => ro.disconnect()
  }, [])

  // Load persisted resolved parts for all cabinets that exist on page mount
  useEffect(() => {
    const ids = initialCabinets.map(c => c.id)
    if (ids.length === 0) return
    dbLoadResolvedParts(ids).then(map => {
      if (map.size > 0) setResolvedParts(map)
    })
  }, []) // intentionally mount-only

  useEffect(() => {
    if (canvasView !== 'plan') return
    const svg = svgRef.current; if (!svg) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const r = svg.getBoundingClientRect()
      dispatchView({ type: 'zoom', factor: e.deltaY < 0 ? 1 / 1.15 : 1.15, svgX: e.clientX - r.left, svgY: e.clientY - r.top })
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [canvasView])

  // Reset interaction state on every mount — handles the Next.js router cache
  // case where the component is reused with stale mode/drawStart.
  useEffect(() => {
    setMode('select')
    setDrawStart(null)
    setDrawCursor(null)
    setPlaceGhost(null)
    svgPointerDownRef.current = false
  }, [])

  useEffect(() => {
    const isInput = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement
    const kd = (e: KeyboardEvent) => {
      if (e.key === ' ' && !isInput(e.target)) { spaceRef.current = true; e.preventDefault() }
      if (e.key === 'Shift') shiftRef.current = true
      if (e.key === 'Tab' && mode === 'draw_wall' && drawStart && !isInput(e.target)) {
        e.preventDefault(); drawingPanelRef.current?.focusLength()
      }
      if (e.key === 'F2' && !isInput(e.target)) {
        e.preventDefault()
        const next = mode === 'draw_wall' ? 'select' : 'draw_wall'
        setMode(next)
        setWallMenuOpen(next === 'draw_wall')
        setDrawStart(null); setPlaceGhost(null)
      }
      if (e.key === 'F3' && !isInput(e.target)) {
        e.preventDefault()
        setCabMenuOpen(v => !v)
      }
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey && !isInput(e.target)) { e.preventDefault(); void handleUndo() }
      if (((e.key === 'y' || e.key === 'Y') && (e.ctrlKey || e.metaKey) && !isInput(e.target)) || ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && e.shiftKey && !isInput(e.target))) { e.preventDefault(); void handleRedo() }
      if (e.key === 'Escape') { setCabResize(null); setMultiSelect([]); setMode('select'); setDrawStart(null); setDrawCursor(null); setPlaceGhost(null); setContextMenu(null); setMarquee(null); marqueeStartRef.current = null }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput(e.target)) {
        if (selected?.type === 'cabinet') handleDeleteCabinet(selected.id)
        if (selected?.type === 'wall') handleDeleteWall(selected.id)
      }
    }
    const ku = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceRef.current = false
      if (e.key === 'Shift') shiftRef.current = false
    }
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [selected])

  // ── Actions ───────────────────────────────────────────────────────────────

  function handleDeleteWall(id: string) {
    setDeleteWallPending(id)
    setContextMenu(null)
  }

  async function confirmDeleteWall() {
    if (!deleteWallPending) return
    captureSnapshot()
    const id = deleteWallPending
    setDeleteWallPending(null)
    setWalls(ws => ws.filter(w => w.id !== id))
    setCabinets(cs => cs.filter(c => c.wall_id !== id))
    setSelected(null)
    // Cabinets must be deleted first — wall delete fails with FK violation if they exist
    await supabase.from('cabinet_instances').delete().eq('wall_id', id)
    await dbDeleteWall(id)
  }

  const handleUpdateWall = useCallback(async (id: string, u: Partial<Wall>) => {
    const currentWalls = wallsRef.current
    const old = currentWalls.find(w => w.id === id)
    const propagated = old && isEndpointUpdate(u)
      ? computeJointUpdates(currentWalls, id, old, { ...old, ...u })
      : []

    setWalls(ws => {
      let next = ws.map(w => w.id === id ? { ...w, ...u } : w)
      for (const { id: pid, update } of propagated) {
        next = next.map(w => w.id === pid ? { ...w, ...update } : w)
      }
      return next
    })

    await dbUpdateWall(id, u)
    await Promise.all(propagated.map(({ id: pid, update }) => dbUpdateWall(pid, update)))
  }, [])

  async function handleDeleteCabinet(id: string) {
    if (!confirm('Delete this cabinet?')) return
    captureSnapshot()
    setCabinets(cs => cs.filter(c => c.id !== id))
    setSelected(null)
    await dbDeleteCabinet(id)
  }

  const handleUpdateCabinet = useCallback(async (id: string, u: Partial<CabinetInstance>) => {
    setCabinets(cs => cs.map(c => c.id === id ? { ...c, ...u } : c))
    const resolved = await dbUpdateCabinet(id, u)
    if (resolved) setResolvedParts(m => new Map(m).set(id, resolved))
  }, [])

  async function placeCabinet(wall: Wall, pos_x: number, pos_y: number, cls: AssemblyClass, isEP = false, islandFlip = false) {
    captureSnapshot()
    const dims = DEFAULT_DIMS[cls] ?? DEFAULT_DIMS.base
    // Map corner variants back to their base class key to look up job dimension defaults
    const baseKey = cls.replace('_corner', '') as 'base' | 'wall' | 'tall'
    const jobDims = (project?.class_dimension_defaults as Record<string, { dy?: number; dz?: number }> | null)?.[baseKey]
    const data: Omit<CabinetInstance, 'id' | 'created_at' | 'updated_at'> = {
      room_id: room.id, wall_id: wall.id, cabinet_definition_id: null,
      label: nextLabel(cabinets, isEP ? 'ep' : cls), assembly_class: cls,
      pos_x, pos_y, pos_z: 0, rotation: islandFlip ? wall.angle + 180 : wall.angle,
      dx: dims.dx, dy: jobDims?.dy ?? dims.dy, dz: jobDims?.dz ?? dims.dz,
      has_carcass: !isEP, has_internal: !isEP, has_face: true,
      has_toekick: cls === 'base' || cls === 'tall' || cls === 'base_corner' || cls === 'tall_corner',
      construction_method_id: null, top_type: 'front_rail', toe_type: 'ladder',
      left_neighbour_type: 'wall', right_neighbour_type: 'wall',
      exposed_interior: false, rule_overrides: {}, material_overrides: {},
      toekick_overrides: {}, drawerbox_overrides: {}, hardware_overrides: {},
      face_grid: null, schema_version: '0.4', notes: null,
    }
    const cabinet = await dbInsertCabinet(data)
    if (cabinet) {
      setCabinets(cs => [...cs, cabinet])
      setSelected({ type: 'cabinet', id: cabinet.id })
      dbResolveAndPersistCabinet(cabinet.id).then(resolved => {
        if (resolved) setResolvedParts(m => new Map(m).set(cabinet.id, resolved))
      })
    }
  }

  async function pasteCabinet(wall: Wall, pos_x: number, pos_y: number) {
    if (!clipboard) return
    captureSnapshot()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, updated_at, ...rest } = clipboard
    const cabinet = await dbInsertCabinet({ ...rest, room_id: room.id, wall_id: wall.id, label: nextLabel(cabinets, clipboard.assembly_class), pos_x, pos_y, rotation: wall.angle })
    if (cabinet) {
      setCabinets(cs => [...cs, cabinet])
      setSelected({ type: 'cabinet', id: cabinet.id })
      dbResolveAndPersistCabinet(cabinet.id).then(resolved => {
        if (resolved) setResolvedParts(m => new Map(m).set(cabinet.id, resolved))
      })
    }
  }

  function onUpdateDrawPreview(length: number, angle: number) {
    if (!drawStart) return
    const rad = (angle * Math.PI) / 180
    setDrawCursor({ x: drawStart.x + length * Math.cos(rad), y: drawStart.y + length * Math.sin(rad) })
  }

  async function onPlaceFromPanel(length: number, angle: number) {
    if (!drawStart || length < MIN_WALL_LEN) return
    captureSnapshot()
    const data: Omit<Wall, 'id' | 'created_at'> = {
      room_id: room.id,
      name: `Wall ${walls.length + 1}`,
      sort_order: walls.length, length, angle,
      pos_x: drawStart.x, pos_y: drawStart.y,
      thickness: drawThickness, height: drawHeight,
      wall_type: 'standard',
    }
    const saved = await dbSaveWall(data)
    if (saved) { setWalls(ws => [...ws, saved]); setSelected({ type: 'wall', id: saved.id }) }
    setDrawStart(null); setDrawCursor(null)
  }

  // ── Pointer handlers ──────────────────────────────────────────────────────

  function onPointerDown(e: React.PointerEvent) {
    if (!svgRef.current) return
    svgPointerDownRef.current = true
    setContextMenu(null); setOpenMenu(null); setWallMenuOpen(false); setCabMenuOpen(false)
    const svgP = svgCoords(e)
    const wp = toWorld(svgP.x, svgP.y)
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault()
      panRef.current = { startX: e.clientX, startY: e.clientY, panX: view.panX, panY: view.panY }
      svgRef.current.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0) return
    if (mode === 'draw_wall' || mode === 'draw_island') {
      e.preventDefault()
      if (!drawStart) {
        const snapped = snapEndpoint(wp, walls, SNAP_PX / view.zoom)
        setDrawStart(snapped); setDrawCursor(snapped)
        drawStartedThisDownRef.current = true
      }
      return
    }
    if (modeAssemblyClass(mode) || mode === 'paste') { svgRef.current.setPointerCapture(e.pointerId); return }
    setSelected(null)
    setCabResize(null)
    setMultiSelect([])
    marqueeStartRef.current = wp
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    const svgP = svgCoords(e)
    const wp = toWorld(svgP.x, svgP.y)
    setMouseWorld(wp)

    if (panRef.current) {
      dispatchView({ type: 'pan', dx: e.clientX - panRef.current.startX - (view.panX - panRef.current.panX), dy: e.clientY - panRef.current.startY - (view.panY - panRef.current.panY) })
      panRef.current.startX = e.clientX; panRef.current.startY = e.clientY
      panRef.current.panX = view.panX; panRef.current.panY = view.panY
      return
    }

    if (mode === 'draw_wall' || mode === 'draw_island') {
      const cornerSnap = snapEndpoint(wp, walls, SNAP_PX / view.zoom)
      const hitCorner = dist(cornerSnap, wp) > 0.5
      let end = cornerSnap
      if (drawStart && !hitCorner) {
        end = snapAngle(drawStart, end, shiftRef.current ? 5 : 22.5)
      }
      setDrawCursor(end)
      return
    }

    function islandFlipFor(w: Wall): boolean {
      if (w.wall_type !== 'island') return false
      const wd = wallDir(w)
      const perp = { x: -wd.y, y: wd.x }
      return (wp.x - w.pos_x) * perp.x + (wp.y - w.pos_y) * perp.y < 0
    }

    if (mode === 'paste' && clipboard) {
      const raw = nearestWall(wp, walls, clipboard.dx, WALL_SNAP_PX / view.zoom)
      if (!raw) { setPlaceGhost(null); return }
      const wd = wallDir(raw.wall)
      const desired = (raw.pos_x - raw.wall.pos_x) * wd.x + (raw.pos_y - raw.wall.pos_y) * wd.y
      const occupied = cabinets.filter(c => c.wall_id === raw.wall.id && cabBlocks(clipboard.assembly_class, c.assembly_class)).map(c => ({ t: cabT(c, raw.wall), dx: c.dx }))
      const t = findFreeSlot(desired, clipboard.dx, raw.wall.length, occupied)
      setPlaceGhost({ wall: raw.wall, pos_x: raw.wall.pos_x + t * wd.x, pos_y: raw.wall.pos_y + t * wd.y, islandFlip: islandFlipFor(raw.wall) })
      return
    }

    const clsInfo = modeAssemblyClass(mode)
    if (clsInfo) {
      const dims = DEFAULT_DIMS[clsInfo.cls] ?? DEFAULT_DIMS.base
      const raw = nearestWall(wp, walls, dims.dx, WALL_SNAP_PX / view.zoom)
      if (!raw) { setPlaceGhost(null); return }
      const wd = wallDir(raw.wall)
      const desired = (raw.pos_x - raw.wall.pos_x) * wd.x + (raw.pos_y - raw.wall.pos_y) * wd.y
      const occupied = cabinets.filter(c => c.wall_id === raw.wall.id && cabBlocks(clsInfo.cls, c.assembly_class)).map(c => ({ t: cabT(c, raw.wall), dx: c.dx }))
      const t = findFreeSlot(desired, dims.dx, raw.wall.length, occupied)
      setPlaceGhost({ wall: raw.wall, pos_x: raw.wall.pos_x + t * wd.x, pos_y: raw.wall.pos_y + t * wd.y, islandFlip: islandFlipFor(raw.wall) })
      return
    }

    if (marqueeStartRef.current && mode === 'select') {
      setMarquee({ x1: marqueeStartRef.current.x, y1: marqueeStartRef.current.y, x2: wp.x, y2: wp.y })
    }

    if (cabDragRef.current && mode === 'select') {
      // Require 6 SVG pixels of movement before activating drag — prevents accidental
      // micro-drags when clicking quickly.
      if (!cabDragOriginRef.current || dist(svgP, cabDragOriginRef.current) >= 6) {
        const { cabId, assemblyClass, wall, cabDX, dragOffset } = cabDragRef.current
        const wd = wallDir(wall)
        const cursorT = (wp.x - wall.pos_x) * wd.x + (wp.y - wall.pos_y) * wd.y
        const desired = Math.max(0, Math.min(wall.length - cabDX, cursorT - dragOffset))
        const occupied = cabinets.filter(c => c.id !== cabId && c.wall_id === wall.id && cabBlocks(assemblyClass, c.assembly_class)).map(c => ({ t: cabT(c, wall), dx: c.dx }))
        const t = findFreeSlot(desired, cabDX, wall.length, occupied)
        setCabDrag({ id: cabId, pos_x: wall.pos_x + t * wd.x, pos_y: wall.pos_y + t * wd.y })
      }
    }

    if (cabMoveDragRef.current && mode === 'select') {
      const { cabId, assemblyClass } = cabMoveDragRef.current
      const cab = cabinets.find(c => c.id === cabId)
      if (cab) {
        const raw = nearestWall(wp, walls, cab.dx, WALL_SNAP_PX / view.zoom)
        if (raw) {
          const wd = wallDir(raw.wall)
          const desired = (raw.pos_x - raw.wall.pos_x) * wd.x + (raw.pos_y - raw.wall.pos_y) * wd.y
          const occupied = cabinets.filter(c => c.id !== cabId && c.wall_id === raw.wall.id && cabBlocks(assemblyClass, c.assembly_class)).map(c => ({ t: cabT(c, raw.wall), dx: c.dx }))
          const t = findFreeSlot(desired, cab.dx, raw.wall.length, occupied)
          setCabMoveDrag({ id: cabId, wall: raw.wall, pos_x: raw.wall.pos_x + t * wd.x, pos_y: raw.wall.pos_y + t * wd.y, islandFlip: islandFlipFor(raw.wall) })
        } else {
          setCabMoveDrag(null)
        }
      }
    }

    if (cabResizeDragging.current && cabResize && mode === 'select') {
      const { side, wall, perp, startCabT, startCabEndT, cabId } = cabResize
      const wd = wallDir(wall)
      const resizingCls = cabinets.find(c => c.id === cabId)?.assembly_class ?? 'base'
      // Neighbours on the same wall used for collision clamping
      const neighbours = cabinets
        .filter(c => c.id !== cabId && c.wall_id === wall.id && cabBlocks(resizingCls, c.assembly_class))
        .map(c => ({ t: cabT(c, wall), dx: c.dx }))
      if (side === 'right') {
        const cursorT = (wp.x - wall.pos_x) * wd.x + (wp.y - wall.pos_y) * wd.y
        // Hard limit: left edge of nearest neighbour to the right
        const rightBound = neighbours
          .filter(o => o.t > startCabT + 1)
          .reduce((min, o) => Math.min(min, o.t), wall.length)
        const newDx = Math.max(50, Math.min(rightBound - startCabT, cursorT - startCabT))
        setCabResize(r => r ? { ...r, liveValue: Math.round(newDx) } : r)
      } else if (side === 'left') {
        const cursorT = (wp.x - wall.pos_x) * wd.x + (wp.y - wall.pos_y) * wd.y
        // Hard limit: right edge of nearest neighbour to the left
        const leftBound = neighbours
          .filter(o => o.t + o.dx < startCabEndT - 1)
          .reduce((max, o) => Math.max(max, o.t + o.dx), 0)
        const newT = Math.max(leftBound, Math.min(startCabEndT - 50, cursorT))
        const newDx = startCabEndT - newT
        setCabResize(r => r ? { ...r, liveValue: Math.round(newDx), livePosX: wall.pos_x + newT * wd.x, livePosY: wall.pos_y + newT * wd.y } : r)
      } else {
        const cab = cabinets.find(c => c.id === cabId)
        if (cab) {
          const cursorPerp = (wp.x - cab.pos_x) * perp.x + (wp.y - cab.pos_y) * perp.y
          const newDz = Math.max(50, Math.min(2000, cursorPerp))
          setCabResize(r => r ? { ...r, liveValue: Math.round(newDz) } : r)
        }
      }
    }
  }

  async function onPointerUp(e: React.PointerEvent) {
    // Discard any pointerup that has no matching pointerdown on this SVG.
    // This prevents phantom events from navigation clicks creating walls/cabinets.
    if (!svgPointerDownRef.current) return
    svgPointerDownRef.current = false

    if (panRef.current) { panRef.current = null; return }
    if (e.button !== 0) return

    const svgP = svgCoords(e)
    const wp = toWorld(svgP.x, svgP.y)

    if (mode === 'draw_wall' || mode === 'draw_island') {
      if (drawStartedThisDownRef.current) { drawStartedThisDownRef.current = false; return }
      const isIsland = mode === 'draw_island'
      if (drawStart && !placingRef.current) {
        placingRef.current = true
        const cornerSnap = snapEndpoint(wp, walls, SNAP_PX / view.zoom)
        const hitCorner = dist(cornerSnap, wp) > 0.5
        let end = cornerSnap
        if (!hitCorner) {
          end = snapAngle(drawStart, end, shiftRef.current ? 5 : 22.5)
        }
        const adjStart = drawStart
        const adjEnd   = end
        const len = dist(adjStart, adjEnd)
        if (len >= MIN_WALL_LEN) {
          captureSnapshot()
          const angle = toDeg(Math.atan2(adjEnd.y - adjStart.y, adjEnd.x - adjStart.x))
          const data: Omit<Wall, 'id' | 'created_at'> = {
            room_id: room.id,
            name: isIsland ? `Island ${walls.filter(w => w.wall_type === 'island').length + 1}` : `Wall ${walls.length + 1}`,
            sort_order: walls.length, length: len, angle,
            pos_x: adjStart.x, pos_y: adjStart.y,
            thickness: isIsland ? 0 : drawThickness, height: drawHeight,
            wall_type: isIsland ? 'island' : 'standard',
          }
          const saved = await dbSaveWall(data)
          if (saved) { setWalls(ws => [...ws, saved]); setSelected({ type: 'wall', id: saved.id }) }
        }
        setDrawStart(null); setDrawCursor(null)
        placingRef.current = false
      }
      return
    }

    if (mode === 'paste') {
      let ghost = placeGhost
      if (!ghost && clipboard) {
        const raw = nearestWall(wp, walls, clipboard.dx, WALL_SNAP_PX / view.zoom)
        if (raw) {
          const wd2 = wallDir(raw.wall)
          const desired = (raw.pos_x - raw.wall.pos_x) * wd2.x + (raw.pos_y - raw.wall.pos_y) * wd2.y
          const occupied = cabinets.filter(c => c.wall_id === raw.wall.id && cabBlocks(clipboard.assembly_class, c.assembly_class)).map(c => ({ t: cabT(c, raw.wall), dx: c.dx }))
          const t = findFreeSlot(desired, clipboard.dx, raw.wall.length, occupied)
          ghost = { wall: raw.wall, pos_x: raw.wall.pos_x + t * wd2.x, pos_y: raw.wall.pos_y + t * wd2.y, islandFlip: false }
        }
      }
      if (ghost && clipboard) {
        await pasteCabinet(ghost.wall, ghost.pos_x, ghost.pos_y)
        setMode('select'); setPlaceGhost(null)
      }
      return
    }

    const clsInfo = modeAssemblyClass(mode)
    if (clsInfo) {
      if (placeGhost && !placingRef.current) {
        placingRef.current = true
        await placeCabinet(placeGhost.wall, placeGhost.pos_x, placeGhost.pos_y, clsInfo.cls, clsInfo.ep, placeGhost.islandFlip)
        setPlaceGhost(null); setMode('select')
        placingRef.current = false
      }
      return
    }

    if (cabResizeDragging.current) {
      cabResizeDragging.current = false
      if (cabResize) {
        captureSnapshot()
        const update: Partial<CabinetInstance> = { [cabResize.dim]: cabResize.liveValue }
        if (cabResize.side === 'left' && cabResize.livePosX !== undefined) {
          update.pos_x = cabResize.livePosX
          update.pos_y = cabResize.livePosY
        }
        await handleUpdateCabinet(cabResize.cabId, update)
      }
      return
    }

    if (cabMoveDragRef.current) {
      const { cabId } = cabMoveDragRef.current
      cabMoveDragRef.current = null
      if (cabMoveDrag) {
        captureSnapshot()
        const { wall, pos_x, pos_y, islandFlip } = cabMoveDrag
        const newRotation = islandFlip ? wall.angle + 180 : wall.angle
        setCabMoveDrag(null)
        await handleUpdateCabinet(cabId, { wall_id: wall.id, pos_x, pos_y, rotation: newRotation })
      }
      return
    }

    if (cabDragRef.current) {
      const { cabId } = cabDragRef.current
      cabDragRef.current = null; cabDragOriginRef.current = null
      if (cabDrag) {
        const origCab = cabinets.find(c => c.id === cabId)
        const moved = !origCab ||
          Math.abs(cabDrag.pos_x - origCab.pos_x) + Math.abs(cabDrag.pos_y - origCab.pos_y) > 2
        setCabDrag(null)
        if (moved) {
          captureSnapshot()
          await handleUpdateCabinet(cabId, { pos_x: cabDrag.pos_x, pos_y: cabDrag.pos_y })
        }
      }
      return
    }

    if (marqueeStartRef.current) {
      const start = marqueeStartRef.current
      marqueeStartRef.current = null
      setMarquee(null)
      const widthPx = Math.abs(wp.x - start.x) * view.zoom
      const heightPx = Math.abs(wp.y - start.y) * view.zoom
      if (widthPx > 5 || heightPx > 5) {
        const minX = Math.min(start.x, wp.x), maxX = Math.max(start.x, wp.x)
        const minY = Math.min(start.y, wp.y), maxY = Math.max(start.y, wp.y)
        const cxpt = centroid(walls)
        const ids = cabinets.filter(cab => {
          const wall = walls.find(w => w.id === cab.wall_id)
          if (!wall) return false
          const basePerp = wallInwardNormal(wall, cxpt.x, cxpt.y)
          const perp = islandCabPerp(cab, wall, basePerp)
          const center = cabinetCenterPt(cab, wall, perp)
          return center.x >= minX && center.x <= maxX && center.y >= minY && center.y <= maxY
        }).map(c => c.id)
        if (ids.length >= 2) {
          setMultiSelect(ids)
          setSelected({ type: 'cabinet', id: ids[0] })
        } else if (ids.length === 1) {
          setSelected({ type: 'cabinet', id: ids[0] })
          setMultiSelect([])
        }
      }
    }
  }

  function onCabinetPointerDown(e: React.PointerEvent, cab: CabinetInstance) {
    if (mode !== 'select' || e.button !== 0) return
    e.stopPropagation()
    // stopPropagation blocks the SVG onPointerDown, so set this ref here —
    // otherwise onPointerUp's phantom-event guard exits early and the drag save never fires.
    svgPointerDownRef.current = true
    setContextMenu(null); setOpenMenu(null); setCabMenuOpen(false)
    setCabResize(null)
    setSelected({ type: 'cabinet', id: cab.id })

    if (shiftRef.current) {
      setMultiSelect(prev => {
        const base = prev.length === 0 && selected?.type === 'cabinet' ? [selected.id] : prev
        return base.includes(cab.id) ? base.filter(id => id !== cab.id) : [...base, cab.id]
      })
      return
    }

    setMultiSelect([])
    const wall = walls.find(w => w.id === cab.wall_id)
    if (!wall) return
    const svgP0 = svgCoords(e)
    const wp0 = toWorld(svgP0.x, svgP0.y)
    const wd0 = wallDir(wall)
    const cursorT0 = (wp0.x - wall.pos_x) * wd0.x + (wp0.y - wall.pos_y) * wd0.y
    cabDragRef.current = { cabId: cab.id, assemblyClass: cab.assembly_class, wall, cabDX: cab.dx, dragOffset: cursorT0 - cabT(cab, wall) }
    cabDragOriginRef.current = svgP0
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  function onCabinetMovePointerDown(e: React.PointerEvent, cab: CabinetInstance) {
    if (mode !== 'select' || e.button !== 0) return
    e.stopPropagation()
    svgPointerDownRef.current = true
    setContextMenu(null); setOpenMenu(null); setCabMenuOpen(false)
    setCabResize(null); setMultiSelect([])
    setSelected({ type: 'cabinet', id: cab.id })
    cabMoveDragRef.current = { cabId: cab.id, assemblyClass: cab.assembly_class }
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  function onCabinetContextMenu(e: React.MouseEvent, cabId: string) {
    e.preventDefault(); e.stopPropagation()
    if (!multiSelect.includes(cabId)) setMultiSelect([])
    setSelected({ type: 'cabinet', id: cabId })
    setContextMenu({ x: e.clientX, y: e.clientY, cabId })
  }

  function onBlankWallContextMenu(e: React.MouseEvent, wallId: string, wallT: number) {
    setContextMenu({ x: e.clientX, y: e.clientY, elevWallId: wallId, elevWallT: wallT })
  }

  async function handleInsertAdjacent(cabId: string, type: 'panel' | 'filler', side: 'left' | 'right') {
    const cab = cabinets.find(c => c.id === cabId)
    if (!cab) return
    const wall = walls.find(w => w.id === cab.wall_id)
    if (!wall) return
    const dx = type === 'panel' ? 18 : 50
    const t = cabT(cab, wall)
    const occ = cabinets
      .filter(c => c.id !== cab.id && c.wall_id === wall.id && cabBlocks('base', c.assembly_class))
      .map(c => ({ t: cabT(c, wall), dx: c.dx }))
    const desired = side === 'right'
      ? Math.min(wall.length - dx, t + cab.dx)       // snap in from the right edge of the cabinet
      : Math.max(0, t - dx)                           // snap in from the left edge of the cabinet
    const freeT = findFreeSlot(desired, dx, wall.length, occ)
    const wd = wallDir(wall)
    captureSnapshot()
    const data: Omit<CabinetInstance, 'id' | 'created_at' | 'updated_at'> = {
      room_id: room.id, wall_id: wall.id, cabinet_definition_id: null,
      label: nextLabel(cabinets, 'ep'),
      assembly_class: 'base',
      pos_x: wall.pos_x + freeT * wd.x,
      pos_y: wall.pos_y + freeT * wd.y,
      pos_z: 0, rotation: wall.angle,
      dx, dy: cab.dy, dz: cab.dz,
      has_carcass: false, has_internal: false, has_face: true, has_toekick: false,
      construction_method_id: null, top_type: 'front_rail', toe_type: 'ladder',
      left_neighbour_type: 'wall', right_neighbour_type: 'wall',
      exposed_interior: false, rule_overrides: {}, material_overrides: {},
      toekick_overrides: {}, drawerbox_overrides: {}, hardware_overrides: {},
      face_grid: null, schema_version: '0.4', notes: null,
    }
    const cabinet = await dbInsertCabinet(data)
    if (cabinet) {
      setCabinets(cs => [...cs, cabinet])
      setSelected({ type: 'cabinet', id: cabinet.id })
      dbResolveAndPersistCabinet(cabinet.id).then(resolved => {
        if (resolved) setResolvedParts(m => new Map(m).set(cabinet.id, resolved))
      })
    }
  }

  async function handleInsertCabinetAtElevT(wallId: string, wallT: number, cls: AssemblyClass) {
    const wall = walls.find(w => w.id === wallId)
    if (!wall) return
    const dims = DEFAULT_DIMS[cls] ?? DEFAULT_DIMS.base
    const occ = cabinets
      .filter(c => c.wall_id === wallId && cabBlocks(cls, c.assembly_class))
      .map(c => ({ t: cabT(c, wall), dx: c.dx }))
    const t = findFreeSlot(Math.max(0, Math.min(wall.length - dims.dx, wallT)), dims.dx, wall.length, occ)
    const wd = wallDir(wall)
    await placeCabinet(wall, wall.pos_x + t * wd.x, wall.pos_y + t * wd.y, cls)
  }

  function onCabinetDoubleClick(e: React.MouseEvent, cabId: string) {
    e.stopPropagation()
    setContextMenu(null)
    setEditCabId(cabId)
  }

  function onCabMarkerPointerDown(e: React.PointerEvent, cab: CabinetInstance, side: 'left' | 'right' | 'front', wall: Wall, perp: { x: number; y: number }) {
    if (mode !== 'select' || e.button !== 0) return
    e.stopPropagation()
    svgPointerDownRef.current = true
    setContextMenu(null); setOpenMenu(null); setCabMenuOpen(false)
    setSelected({ type: 'cabinet', id: cab.id })
    const t = cabT(cab, wall)
    const dim: 'dx' | 'dz' = side === 'front' ? 'dz' : 'dx'
    setCabResize({
      cabId: cab.id, dim, side, wall, perp,
      startCabT: t, startCabEndT: t + cab.dx,
      liveValue: dim === 'dx' ? cab.dx : cab.dz,
    })
    cabResizeDragging.current = true
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  function onResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    sidebarResizeRef.current = { startX: e.clientX, startW: sidebarW }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!sidebarResizeRef.current) return
    setSidebarW(Math.max(120, Math.min(480, sidebarResizeRef.current.startW + e.clientX - sidebarResizeRef.current.startX)))
  }
  function onResizePointerUp() { sidebarResizeRef.current = null }

  async function handleEqualizeWidths() {
    if (multiSelect.length < 2) return
    const sel = cabinets.filter(c => multiSelect.includes(c.id))
    const wallIds = [...new Set(sel.map(c => c.wall_id))]
    if (wallIds.length !== 1) return
    const wall = walls.find(w => w.id === wallIds[0])
    if (!wall) return
    const sorted = [...sel].sort((a, b) => cabT(a, wall) - cabT(b, wall))
    const newDx = Math.round(sorted.reduce((sum, c) => sum + c.dx, 0) / sorted.length)
    const wd = wallDir(wall)
    let t = cabT(sorted[0], wall)
    await Promise.all(sorted.map(cab => {
      const pos_x = wall.pos_x + t * wd.x
      const pos_y = wall.pos_y + t * wd.y
      t += newDx
      return handleUpdateCabinet(cab.id, { dx: newDx, pos_x, pos_y })
    }))
    setContextMenu(null)
  }

  // ── Project / Room save handlers ──────────────────────────────────────────

  async function handleUpdateProject(updates: Partial<Project>) {
    if (!project) return
    setProjectState(prev => prev ? { ...prev, ...updates } : prev)
    const { error } = await supabase.from('projects').update(updates).eq('id', project.id)
    if (error) console.error('Failed to save project:', error)
  }

  async function handleUpdateRoom(updates: Partial<Room>) {
    setRoomState(prev => ({ ...prev, ...updates }))
    const { error } = await supabase.from('rooms').update(updates).eq('id', room.id)
    if (error) console.error('Failed to save room:', error)
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedWall = selected?.type === 'wall' ? walls.find(w => w.id === selected.id) ?? null : null
  const selectedCab  = selected?.type === 'cabinet' ? cabinets.find(c => c.id === selected.id) ?? null : null

  const multiSelectCabs = multiSelect.length >= 2 ? cabinets.filter(c => multiSelect.includes(c.id)) : []
  const canEqualize = multiSelectCabs.length >= 2 && new Set(multiSelectCabs.map(c => c.wall_id)).size === 1

  const cursor = spaceRef.current ? 'grab'
    : (mode === 'draw_wall' || mode === 'draw_island') ? 'crosshair'
    : (modeAssemblyClass(mode) || mode === 'paste') ? 'cell'
    : 'default'

  function fitToWalls() {
    if (!svgRef.current) return
    const { width, height } = svgRef.current.getBoundingClientRect()
    if (walls.length > 0) {
      const pts = walls.flatMap(w => [{ x: w.pos_x, y: w.pos_y }, wallEnd(w)])
      const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x))
      const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y))
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(width * 0.7 / (maxX - minX + 600), height * 0.7 / (maxY - minY + 600))))
      dispatchView({ type: 'set', panX: width / 2 - ((minX + maxX) / 2) * z, panY: height / 2 - ((minY + maxY) / 2) * z, zoom: z })
    } else {
      dispatchView({ type: 'set', panX: width / 2, panY: height / 2, zoom: 0.15 })
    }
  }

  function onSelectMode(m: Mode) {
    setMode(prev => prev === m ? 'select' : m)
    setDrawStart(null); setPlaceGhost(null)
  }

  function switchView(v: CanvasView) {
    if (v === 'elevation' && elevWallId === null) {
      setElevWallId(selectedWall?.id ?? walls[0]?.id ?? null)
    }
    if (v !== 'plan') {
      setMode('select'); setDrawStart(null); setPlaceGhost(null); setContextMenu(null)
    }
    setCanvasView(v)
  }

  const modeHint =
    mode === 'draw_wall'         ? (!drawStart ? 'Click to set start point · snap rings show existing endpoints' : 'Click to finish · Shift = 5° snap · or type in panel →')
    : mode === 'draw_island'     ? (!drawStart ? 'Click to set island start · Shift = 5° snap · Right-click = cancel' : 'Click to finish island · cabinets snap to either side')
    : mode === 'place_base'        ? 'Click near a wall to place base cabinet · Esc = cancel'
    : mode === 'place_wall_unit'   ? 'Click near a wall to place wall unit · Esc = cancel'
    : mode === 'place_tall'        ? 'Click near a wall to place tall cabinet · Esc = cancel'
    : mode === 'place_end_panel'   ? 'Click near a wall to place end panel · Esc = cancel'
    : mode === 'place_base_corner' ? 'Click near a wall to place base corner cabinet · Esc = cancel'
    : mode === 'place_wall_corner' ? 'Click near a wall to place wall corner unit · Esc = cancel'
    : mode === 'place_tall_corner' ? 'Click near a wall to place tall corner cabinet · Esc = cancel'
    : mode === 'paste'             ? `Click near a wall to paste ${clipboard?.label ?? 'cabinet'} · Esc = cancel`
    : null

  const selectionInfo =
    multiSelect.length >= 2                        ? `${multiSelect.length} cabinets selected · right-click to equalize widths`
    : selected?.type === 'wall'    && selectedWall ? `${selectedWall.name} · ${Math.round(selectedWall.length)}mm · ${Math.round(selectedWall.angle)}°`
    : selected?.type === 'cabinet' && selectedCab  ? `${selectedCab.assembly_class.replace(/_/g,' ')} · ${selectedCab.label ?? '—'} · ${selectedCab.dx}×${selectedCab.dy}×${selectedCab.dz}`
    : null

  const menus: MenuGroup[] = [
    { label: 'File', items: [
      { label: '← Back to Projects', action: () => { window.location.href = '/' } },
      null,
      { label: 'Export…', disabled: true },
    ]},
    { label: 'Edit', items: [
      { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !canUndo, action: () => { void handleUndo() } },
      { label: 'Redo', shortcut: 'Ctrl+Y', disabled: !canRedo, action: () => { void handleRedo() } },
      null,
      { label: 'Copy Cabinet', shortcut: 'Ctrl+C', disabled: selected?.type !== 'cabinet',
        action: () => { const cab = cabinets.find(c => c.id === selected?.id); if (cab) { setClipboard(cab); setMode('paste'); setPlaceGhost(null) } } },
      { label: 'Paste Cabinet', shortcut: 'Ctrl+V', disabled: !clipboard,
        action: () => { if (clipboard) { setMode('paste'); setPlaceGhost(null) } } },
      null,
      { label: 'Delete', shortcut: 'Del', disabled: !selected,
        action: () => { if (selected?.type === 'cabinet') handleDeleteCabinet(selected.id); if (selected?.type === 'wall') handleDeleteWall(selected.id) } },
    ]},
    { label: 'View', items: [
      { label: 'Zoom In',  shortcut: '+', action: () => dispatchView({ type: 'zoom', factor: 1.25,   svgX: svgSize.w/2, svgY: svgSize.h/2 }) },
      { label: 'Zoom Out', shortcut: '−', action: () => dispatchView({ type: 'zoom', factor: 1/1.25, svgX: svgSize.w/2, svgY: svgSize.h/2 }) },
      { label: 'Fit to Screen', shortcut: 'F', action: fitToWalls },
      null,
      { label: '3D View', action: () => switchView('3d') },
    ]},
    { label: 'Job', items: [
      { label: 'Details',      action: () => setJobModalTab('details') },
      { label: 'Dimensions',   action: () => setJobModalTab('dimensions') },
      { label: 'Construction', action: () => setJobModalTab('construction') },
      { label: 'Hardware',     action: () => setJobModalTab('hardware') },
      null,
      { label: 'Overrides',   action: () => setJobModalTab('overrides') },
    ]},
    { label: 'Room', items: [
      { label: 'Room Details', action: () => setRoomModalTab('details') },
      { label: 'Construction', action: () => setRoomModalTab('construction') },
      { label: 'Hardware',     action: () => setRoomModalTab('hardware') },
      null,
      { label: 'Overrides',   action: () => setRoomModalTab('overrides') },
    ]},
    { label: 'Production', items: [
      { label: 'Cut List…',          disabled: true },
      { label: 'Material Schedule…', disabled: true },
      { label: 'Shop Drawings…',     disabled: true },
      null,
      { label: 'Generate CNC…',      disabled: true },
    ]},
    { label: 'Help', items: [
      { label: 'Documentation',    disabled: true },
      { label: 'About RHK CADcam', disabled: true },
    ]},
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden">

      <CanvasMenubar
        projectName={project?.name ?? 'Untitled'}
        roomName={room.name}
        openMenu={openMenu}
        setOpenMenu={setOpenMenu}
        menus={menus}
      />

      {/* View tab bar */}
      <div className="flex-none h-8 bg-gray-900 border-b border-gray-800 flex items-center px-3 shrink-0 relative">
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
          {(['plan', 'elevation', '3d'] as CanvasView[]).map(v => (
            <button key={v} onClick={() => switchView(v)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                canvasView === v
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}>
              {v === 'plan' ? 'Plan' : v === 'elevation' ? 'Elevation' : '3D'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider select-none">Detail</span>
          <select
            value={displayConfig.activePreset}
            onChange={e => {
              const val = e.target.value as PresetId
              if (val !== 'custom') setDisplayConfig(applyPreset(val))
            }}
            className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-0.5 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            {(Object.entries(DISPLAY_PRESETS) as [Exclude<PresetId, 'custom'>, { label: string }][]).map(([id, { label }]) => (
              <option key={id} value={id}>{label}</option>
            ))}
            {displayConfig.activePreset === 'custom' && (
              <option value="custom">Custom</option>
            )}
          </select>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        <CanvasSidebar
          mode={mode}
          onSelectMode={onSelectMode}
          wallMenuOpen={wallMenuOpen}
          setWallMenuOpen={setWallMenuOpen}
          cabMenuOpen={cabMenuOpen}
          setCabMenuOpen={setCabMenuOpen}
          clipboard={clipboard}
          sidebarW={sidebarW}
        />

        <div
          className="flex-none w-1 bg-gray-800 hover:bg-blue-500/60 active:bg-blue-500 cursor-col-resize transition-colors"
          style={{ touchAction: 'none' }}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
        />

        {canvasView === 'plan' && (
          <>
            <CanvasSVG
              svgRef={svgRef}
              walls={walls}
              cabinets={cabinets}
              view={view}
              svgSize={svgSize}
              selected={selected}
              mode={mode}
              displayConfig={displayConfig}
              drawStart={drawStart}
              drawCursor={drawCursor}
              drawThickness={drawThickness}
              placeGhost={placeGhost}
              clipboard={clipboard}
              cabDrag={cabDrag}
              cabResize={cabResize}
              multiSelect={multiSelect}
              marquee={marquee}
              cursor={cursor}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onCancelDraw={() => { setDrawStart(null); setDrawCursor(null); setMode('select') }}
              setSelected={setSelected}
              setContextMenu={setContextMenu}
              onCabinetPointerDown={onCabinetPointerDown}
              onCabinetMovePointerDown={onCabinetMovePointerDown}
              onCabinetContextMenu={onCabinetContextMenu}
              onCabinetDoubleClick={onCabinetDoubleClick}
              onCabMarkerPointerDown={onCabMarkerPointerDown}
              cabMoveDrag={cabMoveDrag}
            />
            {(mode === 'draw_wall' || mode === 'draw_island') && !drawStart && (
              <WallDrawPanel
                mode={mode as 'draw_wall' | 'draw_island'}
                thickness={drawThickness}
                setThickness={setDrawThickness}
                height={drawHeight}
                setHeight={setDrawHeight}
                onCancel={() => setMode('select')}
              />
            )}
            {mode === 'draw_wall' && drawStart && (
              <DrawingPanel
                ref={drawingPanelRef}
                drawStart={drawStart}
                drawCursor={drawCursor}
                onPlace={onPlaceFromPanel}
                onCancel={() => { setDrawStart(null); setDrawCursor(null); setMode('select') }}
                onUpdatePreview={onUpdateDrawPreview}
              />
            )}
          </>
        )}

        {canvasView === 'elevation' && (
          <ElevationSVG
            walls={walls}
            cabinets={cabinets}
            room={room}
            elevWallId={elevWallId}
            selected={selected}
            displayConfig={displayConfig}
            multiSelect={multiSelect}
            canEqualize={canEqualize}
            mode={mode}
            clipboard={clipboard}
            onSelectCabinet={id => { setSelected({ type: 'cabinet', id }); setMultiSelect([]); setCabResize(null) }}
            onSelectWall={id => setSelected({ type: 'wall', id })}
            onSetElevWall={setElevWallId}
            onUpdateCabinet={handleUpdateCabinet}
            onPlaceAtWall={async (wall, pos_x, pos_y) => {
              if (mode === 'paste' && clipboard) {
                await pasteCabinet(wall, pos_x, pos_y)
              } else {
                const clsInfo = modeAssemblyClass(mode)
                if (clsInfo) await placeCabinet(wall, pos_x, pos_y, clsInfo.cls, clsInfo.ep)
              }
              setMode('select')
              setPlaceGhost(null)
            }}
            onCabinetContextMenu={onCabinetContextMenu}
            onBlankWallContextMenu={onBlankWallContextMenu}
            onShiftSelectCabinet={id => {
              setSelected({ type: 'cabinet', id })
              setMultiSelect(prev => {
                const base = prev.length === 0 && selected?.type === 'cabinet' ? [selected.id] : prev
                return base.includes(id) ? base.filter(x => x !== id) : [...base, id]
              })
            }}
            onEqualizeWidths={handleEqualizeWidths}
            cabResize={cabResize}
            onCabResizeStart={r => { setSelected({ type: 'cabinet', id: r.cabId }); setMultiSelect([]); setCabResize(r) }}
            onCabResizeUpdate={updates => setCabResize(r => r ? { ...r, ...updates } : r)}
            resolvedParts={resolvedParts}
            onDeselect={() => setSelected(null)}
          />
        )}

        {canvasView === '3d' && (
          <Room3DScene
            walls={walls}
            cabinets={cabinets}
            room={room}
            selectedId={selected?.type === 'cabinet' ? selected.id : null}
            onSelectCabinet={id => { setSelected({ type: 'cabinet', id }); setMultiSelect([]) }}
            onEditCabinet={id => { setEditCabInitialView('3d'); setEditCabId(id) }}
            onDeleteCabinet={id => handleDeleteCabinet(id)}
            resolvedParts={resolvedParts}
          />
        )}

        {mode !== 'draw_wall' && mode !== 'draw_island' && selectedWall && (canvasView === 'plan' || canvasView === 'elevation') && (
          <WallPanel wall={selectedWall} onUpdate={handleUpdateWall} onDelete={handleDeleteWall} />
        )}
        {selectedCab && cabResize?.cabId === selectedCab.id && (
          <CabinetResizePanel
            key={`${cabResize.cabId}-${cabResize.dim}`}
            dim={cabResize.dim}
            liveValue={cabResize.liveValue}
            onCancel={() => setCabResize(null)}
            onTabApply={v => {
              const cab = cabinets.find(c => c.id === cabResize.cabId)
              const w = walls.find(wl => wl.id === cab?.wall_id)
              if (!cab || !w) return
              const update: Partial<CabinetInstance> = { [cabResize.dim]: v }
              if (cabResize.dim === 'dx' && cabResize.side === 'left') {
                const wd = wallDir(w)
                const rightEndT = cabT(cab, w) + cab.dx
                const newT = Math.max(0, rightEndT - v)
                update.pos_x = w.pos_x + newT * wd.x
                update.pos_y = w.pos_y + newT * wd.y
              }
              handleUpdateCabinet(cabResize.cabId, update)
              setCabResize(r => r ? { ...r, liveValue: v } : r)
            }}
            onApply={v => {
              const cab = cabinets.find(c => c.id === cabResize.cabId)
              const w = walls.find(wl => wl.id === cab?.wall_id)
              if (!cab || !w) return
              const update: Partial<CabinetInstance> = { [cabResize.dim]: v }
              if (cabResize.dim === 'dx' && cabResize.side === 'left') {
                const wd = wallDir(w)
                const rightEndT = cabT(cab, w) + cab.dx
                const newT = Math.max(0, rightEndT - v)
                update.pos_x = w.pos_x + newT * wd.x
                update.pos_y = w.pos_y + newT * wd.y
              }
              handleUpdateCabinet(cabResize.cabId, update)
              setCabResize(null)
            }}
          />
        )}
        {selectedCab && (!cabResize || cabResize.cabId !== selectedCab.id) && (
          <CabinetPanel
            cabinet={selectedCab}
            wall={walls.find(w => w.id === selectedCab.wall_id) ?? null}
            wallCabinets={cabinets.filter(c => c.wall_id === selectedCab.wall_id)}
            room={room}
            onUpdate={handleUpdateCabinet}
            onDelete={handleDeleteCabinet}
          />
        )}

      </div>

      <footer className="flex-none h-6 bg-gray-900 border-t border-gray-800 flex items-center text-[10px] text-gray-500 select-none">
        <div className="px-3 border-r border-gray-800 font-mono whitespace-nowrap">
          X: {String(Math.round(mouseWorld.x)).padStart(5)}&nbsp;&nbsp;Y: {String(Math.round(mouseWorld.y)).padStart(5)}
        </div>
        <div className="px-3 flex-1 truncate border-r border-gray-800">
          {modeHint
            ? <span className="text-blue-400">{modeHint}</span>
            : selectionInfo
              ? <span className="text-gray-400">{selectionInfo}</span>
              : <span className="text-gray-600">Nothing selected · click to select · right-click for menu</span>
          }
        </div>
        <div className="px-3 flex items-center gap-1 whitespace-nowrap">
          <button onClick={() => dispatchView({ type: 'zoom', factor: 1/1.25, svgX: svgSize.w/2, svgY: svgSize.h/2 })}
            className="hover:text-gray-300 w-4 text-center">−</button>
          <span className="font-mono w-9 text-center">{Math.round(view.zoom * 100)}%</span>
          <button onClick={() => dispatchView({ type: 'zoom', factor: 1.25, svgX: svgSize.w/2, svgY: svgSize.h/2 })}
            className="hover:text-gray-300 w-4 text-center">+</button>
          <button onClick={fitToWalls} title="Fit to screen" className="ml-1 hover:text-gray-300">⊡</button>
        </div>
      </footer>

      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          groups={buildContextMenuGroups({
            cabId: contextMenu.cabId,
            wallId: contextMenu.wallId,
            elevWallId: contextMenu.elevWallId,
            elevWallT: contextMenu.elevWallT,
            canEqualize,
            clipboard,
            cabinets,
            onDeleteWall: handleDeleteWall,
            onDeleteCabinet: id => void handleDeleteCabinet(id),
            onInsertCabinet: (wId, t, cls) => { void handleInsertCabinetAtElevT(wId, t, cls) },
            onInsertAdjacent: (cabId, type, side) => { void handleInsertAdjacent(cabId, type, side) },
            onCopy: cab => {
              setClipboard(cab)
              setMode('paste')
              const raw = nearestWall(mouseWorld, walls, cab.dx, WALL_SNAP_PX / view.zoom)
              if (raw) {
                const wd = wallDir(raw.wall)
                const desired = (raw.pos_x - raw.wall.pos_x) * wd.x + (raw.pos_y - raw.wall.pos_y) * wd.y
                const occupied = cabinets
                  .filter(c => c.wall_id === raw.wall.id && cabBlocks(cab.assembly_class, c.assembly_class))
                  .map(c => ({ t: cabT(c, raw.wall), dx: c.dx }))
                const t = findFreeSlot(desired, cab.dx, raw.wall.length, occupied)
                const perp = { x: -wd.y, y: wd.x }
                const islandFlip = raw.wall.wall_type === 'island' &&
                  (mouseWorld.x - raw.wall.pos_x) * perp.x + (mouseWorld.y - raw.wall.pos_y) * perp.y < 0
                setPlaceGhost({ wall: raw.wall, pos_x: raw.wall.pos_x + t * wd.x, pos_y: raw.wall.pos_y + t * wd.y, islandFlip })
              } else {
                setPlaceGhost(null)
              }
            },
            onPaste: () => { if (clipboard) setMode('paste') },
            onEdit: id => setEditCabId(id),
            onEqualizeWidths: handleEqualizeWidths,
          })}
          onClose={() => setContextMenu(null)}
        />
      )}

      {editCabId && (() => {
        const cab = cabinets.find(c => c.id === editCabId)
        if (!cab) return null
        const wall = walls.find(w => w.id === cab.wall_id) ?? null
        return (
          <CabinetEditModal
            cabinet={cab}
            wall={wall}
            wallCabinets={wall ? cabinets.filter(c => c.wall_id === wall.id) : []}
            resolvedCabinet={resolvedParts.get(cab.id)}
            initialView={editCabInitialView}
            onUpdate={handleUpdateCabinet}
            onDelete={handleDeleteCabinet}
            onClose={() => { setEditCabId(null); setEditCabInitialView('elevation') }}
          />
        )
      })()}

      {deleteWallPending && (
        <DeleteWallModal
          onConfirm={confirmDeleteWall}
          onCancel={() => setDeleteWallPending(null)}
        />
      )}

      {jobModalTab && project && (
        <JobPropertiesModal
          project={project}
          initialTab={jobModalTab}
          onClose={() => setJobModalTab(null)}
          onSave={handleUpdateProject}
        />
      )}

      {roomModalTab && (
        <RoomPropertiesModal
          room={room}
          project={project}
          initialTab={roomModalTab}
          onClose={() => setRoomModalTab(null)}
          onSave={handleUpdateRoom}
        />
      )}

    </div>
  )
}
