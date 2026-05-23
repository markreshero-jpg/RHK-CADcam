'use client'

import { useState, useRef, useEffect, useCallback, useReducer } from 'react'
import { supabase } from '@/src/lib/supabase'
import { Project, Room, Wall, CabinetInstance, AssemblyClass, DEFAULT_DIMS, BenchtopInstance } from '@/src/lib/types'
import {
  Pt, MIN_ZOOM, MAX_ZOOM, MIN_WALL_LEN, SNAP_PX, WALL_SNAP_PX,
  toDeg, dist,
  wallEnd, wallDir,
  snapEndpoint, snapAngle, ptToSeg,
  nearestWall, findFreeSlot, cabBlocks, cabT, nextLabel,
  centroid, wallInwardNormal, cabWallPerp, cabWallSide, cabinetCenterPt,
} from '@/src/lib/geometry'
import { isEndpointUpdate, computeJointUpdates } from '@/src/lib/wallJoints'
import { dbSaveWall, dbUpdateWall, dbDeleteWall, dbInsertCabinet, dbResolveAndPersistCabinet, dbUpdateCabinet, dbDeleteCabinet } from './canvasDB'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { useCanvasHistory } from './useCanvasHistory'
import { useMaterialColours } from './useMaterialColours'
import { useCabinetOps } from './useCabinetOps'
import { useMultiSelectOps } from './useMultiSelectOps'
import { buildMenus } from './canvasMenuConfig'
import {
  Mode, Selected, CanvasView, ViewState, ViewAction, PlaceGhost, CabDrag, CabMoveDrag, CabResize, ContextMenuState,
  viewReducer, modeAssemblyClass, DisplayConfig, PresetId,
  DEFAULT_DISPLAY_CONFIG, applyPreset, toggleAnnotation,
} from './canvasTypes'
import { useBenchtopInteraction } from './useBenchtopInteraction'
import { DISPLAY_PRESETS } from '@/src/lib/displayConfig'
import CanvasMenubar from './CanvasMenubar'
import CanvasSidebar from './CanvasSidebar'
import CanvasSVG from './CanvasSVG'
import ElevationSVG from './ElevationSVG'
import CanvasContextMenu from './CanvasContextMenu'
import { buildContextMenuGroups } from './canvasContextItems'
import DeleteWallModal from './DeleteWallModal'
import SplitCabinetModal from './SplitCabinetModal'
import DrawingPanel, { type DrawingPanelHandle } from './DrawingPanel'
import WallDrawPanel from './WallDrawPanel'
import WallPanel from './WallPanel'
import CabinetPanel from './CabinetPanel'
import CabinetResizePanel from './CabinetResizePanel'
import CabinetEditModal from './CabinetEditModal'
import JobPropertiesModal, { type JobPropertiesTab } from './JobPropertiesModal'
import RoomPropertiesModal, { type RoomPropertiesTab } from './RoomPropertiesModal'
import ReportsModal, { type ReportScope } from './ReportsModal'
import Room3DScene from './Room3DScene'
import BenchtopPanel from './BenchtopPanel'
import { getUserPrefs } from '@/src/lib/userPrefs'

export default function CanvasClient({ project: initProject, room: initRoom, walls: initWalls, initialCabinets, initialBenchtops }: {
  project: Project | null
  room: Room
  walls: Wall[]
  initialCabinets: CabinetInstance[]
  initialBenchtops: BenchtopInstance[]
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
  const [cabFollowing, setCabFollowing] = useState<{ id: string; assemblyClass: string } | null>(null)
  const [multiSelect, setMultiSelect] = useState<string[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [deleteWallPending, setDeleteWallPending] = useState<string | null>(null)
  const [splitCabId, setSplitCabId] = useState<string | null>(null)
  const [clipboard, setClipboard] = useState<CabinetInstance | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [wallMenuOpen, setWallMenuOpen] = useState(false)
  const [cabMenuOpen, setCabMenuOpen] = useState(false)
  const [drawHeight, setDrawHeight] = useState<number | null>(null)
  const [sidebarW, setSidebarW] = useState(192)
  const [mouseWorld, setMouseWorld] = useState<Pt>({ x: 0, y: 0 })
  const [canvasView, setCanvasView] = useState<CanvasView>('plan')
  const [elevWallId, setElevWallId] = useState<string | null>(null)
  const [elevWallSide, setElevWallSide] = useState<'face' | 'back'>('face')
  const [displayConfig, setDisplayConfig] = useState<DisplayConfig>(() => {
    const preset = getUserPrefs().defaultDrawingPreset
    return applyPreset(preset)
  })
  const [jobModalTab, setJobModalTab] = useState<JobPropertiesTab | null>(null)
  const [roomModalTab, setRoomModalTab] = useState<RoomPropertiesTab | null>(null)
  const [reportScope, setReportScope] = useState<ReportScope | null>(null)
  const [editCabId, setEditCabId] = useState<string | null>(null)
  const [editCabInitialView, setEditCabInitialView] = useState<'3d' | 'elevation' | 'joints'>('elevation')
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [benchtops, setBenchtops] = useState<BenchtopInstance[]>(initialBenchtops)
  const ctrlRef = useRef(false)

  const { captureSnapshot, pushSnapshot, handleUndo, handleRedo, wallsRef, cabinetsRef, benchtopsRef, canUndo, canRedo } =
    useCanvasHistory(walls, cabinets, benchtops, setWalls, setCabinets, setBenchtops, setSelected)

  const {
    resolvedParts, setResolvedParts,
    matColours, ebByMatId,
    applyInputColours, applyInputEdgebands,
  } = useMaterialColours(initialCabinets)

  const svgRef = useRef<SVGSVGElement>(null)
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const cabDragRef = useRef<{ cabId: string; assemblyClass: AssemblyClass; wall: Wall; cabDX: number; dragOffset: number } | null>(null)
  const cabDragOriginRef = useRef<Pt | null>(null)
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

  const bt = useBenchtopInteraction({
    room, walls, cabinets,
    benchtops, setBenchtops, benchtopsRef,
    wallsRef, cabinetsRef,
    mode, zoom: view.zoom,
    svgRef, svgPointerDownRef, ctrlRef, shiftRef,
    selected,
    setSelected, setContextMenu, setMode,
    captureSnapshot, pushSnapshot,
  })

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

  useEffect(() => {
    if (canvasView !== 'plan') return
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

  useEffect(() => { setElevWallSide('face') }, [elevWallId])

  useEffect(() => {
    const isInput = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement
    const kd = (e: KeyboardEvent) => {
      if (e.key === ' ' && !isInput(e.target)) { spaceRef.current = true; e.preventDefault() }
      if (e.key === 'Shift') shiftRef.current = true
      if (e.key === 'Control') ctrlRef.current = true
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
      if (e.key === 'F4' && !isInput(e.target)) {
        e.preventDefault()
        const isBt = mode === 'draw_benchtop' || mode === 'draw_benchtop_rect' || mode === 'draw_benchtop_l' || mode === 'draw_benchtop_u' || mode === 'draw_benchtop_cutout_rect' || mode === 'draw_benchtop_cutout_circle'
        const next = isBt ? 'select' : 'draw_benchtop'
        setMode(next)
        bt.resetDraw()
        bt.setBenchtopMenuOpen(next === 'draw_benchtop')
      }
      if (e.key === 'a' && !isInput(e.target) && (mode === 'draw_benchtop') && bt.btDrawPoly.length > 0) {
        e.preventDefault()
        bt.toggleArcMode()
      }
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey && !isInput(e.target)) { e.preventDefault(); void handleUndo() }
      if (((e.key === 'y' || e.key === 'Y') && (e.ctrlKey || e.metaKey) && !isInput(e.target)) || ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && e.shiftKey && !isInput(e.target))) { e.preventDefault(); void handleRedo() }
      if (e.key === 'Escape') { setCabResize(null); setCabFollowing(null); setCabMoveDrag(null); setMultiSelect([]); setMode('select'); setDrawStart(null); setDrawCursor(null); setPlaceGhost(null); setContextMenu(null); setMarquee(null); marqueeStartRef.current = null; bt.resetDraw(); setDeleteWallPending(null) }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput(e.target)) {
        if (mode === 'draw_benchtop' && e.key === 'Backspace') { bt.undoVertex(); return }
        if (selected?.type === 'cabinet') handleDeleteCabinet(selected.id)
        if (selected?.type === 'wall') handleDeleteWall(selected.id)
        if (selected?.type === 'benchtop') void bt.handleDeleteBenchtop(selected.id)
      }
    }
    const ku = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceRef.current = false
      if (e.key === 'Shift') shiftRef.current = false
      if (e.key === 'Control') ctrlRef.current = false
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

    // When soffit_height changes, reposition wall-class cabinets on this wall
    if ('soffit_height' in u && old) {
      const updatedWall = { ...old, ...u } as Wall
      const wallH = updatedWall.height ?? room.room_dy ?? 2400
      const wcTop = updatedWall.soffit_height != null
        ? wallH - updatedWall.soffit_height
        : room.soffit_height ?? room.wall_cabinet_top ?? 2100
      const affected = cabinetsRef.current.filter(c =>
        c.wall_id === id && (c.assembly_class === 'wall' || c.assembly_class === 'wall_corner')
      )
      if (affected.length > 0) {
        const cabUpdates = affected.map(c => ({ id: c.id, pos_z: Math.max(0, wcTop - c.dy) }))
        setCabinets(cs => cs.map(c => {
          const upd = cabUpdates.find(cu => cu.id === c.id)
          return upd ? { ...c, pos_z: upd.pos_z } : c
        }))
        await Promise.all(cabUpdates.map(({ id: cid, pos_z }) => dbUpdateCabinet(cid, { pos_z })))
      }
    }

    await dbUpdateWall(id, u)
    await Promise.all(propagated.map(({ id: pid, update }) => dbUpdateWall(pid, update)))
  }, [room])

  async function handleDeleteCabinet(id: string) {
    if (!confirm('Delete this cabinet?')) return
    captureSnapshot()
    setCabinets(cs => cs.filter(c => c.id !== id))
    setSelected(null)
    await dbDeleteCabinet(id)
  }

  async function handleDeleteMultipleCabinets(ids: string[]) {
    if (!confirm(`Delete ${ids.length} cabinets?`)) return
    captureSnapshot()
    setCabinets(cs => cs.filter(c => !ids.includes(c.id)))
    setSelected(null)
    setMultiSelect([])
    setContextMenu(null)
    await Promise.all(ids.map(id => dbDeleteCabinet(id)))
  }

  const handleUpdateCabinet = useCallback(async (id: string, u: Partial<CabinetInstance>) => {
    setCabinets(cs => cs.map(c => c.id === id ? { ...c, ...u } : c))
    // Drop stale resolved geometry immediately on dimension changes so the cabinet shows a
    // clean simple-rect at the new size rather than mismatched old panel coords while re-resolving.
    if ('dx' in u || 'dy' in u || 'dz' in u || 'rule_overrides' in u) {
      setResolvedParts(m => { const next = new Map(m); next.delete(id); return next })
    }
    const resolved = await dbUpdateCabinet(id, u)
    if (resolved) { setResolvedParts(m => new Map(m).set(id, resolved)); applyInputColours(id); applyInputEdgebands(id) }
  }, [])

  function commitResize() {
    if (!cabResize) return
    captureSnapshot()
    const { cabId, dim, side, liveValue, livePosX, livePosY } = cabResize
    const update: Partial<CabinetInstance> = { [dim]: liveValue }
    if (side === 'left' && livePosX !== undefined) {
      update.pos_x = livePosX
      update.pos_y = livePosY
    }
    setCabResize(null)
    void handleUpdateCabinet(cabId, update)
  }

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
      face_grid: null, carcase_joints: {}, schema_version: '0.4', notes: null,
    }
    const cabinet = await dbInsertCabinet(data)
    if (cabinet) {
      setCabinets(cs => [...cs, cabinet])
      setSelected({ type: 'cabinet', id: cabinet.id })
      dbResolveAndPersistCabinet(cabinet.id).then(resolved => {
        if (resolved) { setResolvedParts(m => new Map(m).set(cabinet.id, resolved)); applyInputColours(cabinet.id); applyInputEdgebands(cabinet.id) }
      })
    }
  }

  async function pasteCabinet(wall: Wall, pos_x: number, pos_y: number, sideFlip = false) {
    if (!clipboard) return
    captureSnapshot()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, updated_at, ...rest } = clipboard
    const cabinet = await dbInsertCabinet({ ...rest, room_id: room.id, wall_id: wall.id, label: nextLabel(cabinets, clipboard.assembly_class), pos_x, pos_y, rotation: sideFlip ? wall.angle + 180 : wall.angle })
    if (cabinet) {
      setCabinets(cs => [...cs, cabinet])
      setSelected({ type: 'cabinet', id: cabinet.id })
      dbResolveAndPersistCabinet(cabinet.id).then(resolved => {
        if (resolved) { setResolvedParts(m => new Map(m).set(cabinet.id, resolved)); applyInputColours(cabinet.id); applyInputEdgebands(cabinet.id) }
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
      soffit_height: null,
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
    if (cabFollowing) return
    if (mode === 'draw_benchtop' || mode === 'draw_benchtop_rect' || mode === 'draw_benchtop_l') {
      e.preventDefault()
      return
    }
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
    commitResize()
    setSelected(null)
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

    if (bt.handlePointerMove(wp, e)) return

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

    function wallFlipFor(w: Wall): boolean {
      const wd = wallDir(w)
      if (w.wall_type === 'island') {
        const perp = { x: -wd.y, y: wd.x }
        return (wp.x - w.pos_x) * perp.x + (wp.y - w.pos_y) * perp.y < 0
      }
      const cx = centroid(walls)
      const inward = wallInwardNormal(w, cx.x, cx.y)
      return (wp.x - w.pos_x) * inward.x + (wp.y - w.pos_y) * inward.y < 0
    }

    if (mode === 'paste' && clipboard) {
      const raw = nearestWall(wp, walls, clipboard.dx, WALL_SNAP_PX / view.zoom)
      if (!raw) { setPlaceGhost(null); return }
      const wd = wallDir(raw.wall)
      const desired = (raw.pos_x - raw.wall.pos_x) * wd.x + (raw.pos_y - raw.wall.pos_y) * wd.y
      const flip = wallFlipFor(raw.wall)
      const side = flip ? 'back' : 'face'
      const occupied = cabinets.filter(c => c.wall_id === raw.wall.id && cabBlocks(clipboard.assembly_class, c.assembly_class) && cabWallSide(c, raw.wall) === side).map(c => ({ t: cabT(c, raw.wall), dx: c.dx }))
      const t = findFreeSlot(desired, clipboard.dx, raw.wall.length, occupied)
      setPlaceGhost({ wall: raw.wall, pos_x: raw.wall.pos_x + t * wd.x, pos_y: raw.wall.pos_y + t * wd.y, islandFlip: flip })
      return
    }

    const clsInfo = modeAssemblyClass(mode)
    if (clsInfo) {
      const dims = DEFAULT_DIMS[clsInfo.cls] ?? DEFAULT_DIMS.base
      const raw = nearestWall(wp, walls, dims.dx, WALL_SNAP_PX / view.zoom)
      if (!raw) { setPlaceGhost(null); return }
      const wd = wallDir(raw.wall)
      const desired = (raw.pos_x - raw.wall.pos_x) * wd.x + (raw.pos_y - raw.wall.pos_y) * wd.y
      const flip = wallFlipFor(raw.wall)
      const side = flip ? 'back' : 'face'
      const occupied = cabinets.filter(c => c.wall_id === raw.wall.id && cabBlocks(clsInfo.cls, c.assembly_class) && cabWallSide(c, raw.wall) === side).map(c => ({ t: cabT(c, raw.wall), dx: c.dx }))
      const t = findFreeSlot(desired, dims.dx, raw.wall.length, occupied)
      setPlaceGhost({ wall: raw.wall, pos_x: raw.wall.pos_x + t * wd.x, pos_y: raw.wall.pos_y + t * wd.y, islandFlip: flip })
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
        const dragCab = cabinets.find(c => c.id === cabId)
        const dragSide = dragCab ? cabWallSide(dragCab, wall) : 'face'
        const occupied = cabinets.filter(c => c.id !== cabId && c.wall_id === wall.id && cabBlocks(assemblyClass, c.assembly_class) && cabWallSide(c, wall) === dragSide).map(c => ({ t: cabT(c, wall), dx: c.dx }))
        const t = findFreeSlot(desired, cabDX, wall.length, occupied)
        setCabDrag({ id: cabId, pos_x: wall.pos_x + t * wd.x, pos_y: wall.pos_y + t * wd.y })
      }
    }

    if (cabFollowing && mode === 'select') {
      const { id, assemblyClass } = cabFollowing
      const cab = cabinets.find(c => c.id === id)
      if (cab) {
        // No distance limit — ghost always snaps to nearest wall regardless of cursor position
        const raw = nearestWall(wp, walls, cab.dx, Infinity)
        if (raw) {
          const wd = wallDir(raw.wall)
          const desired = (raw.pos_x - raw.wall.pos_x) * wd.x + (raw.pos_y - raw.wall.pos_y) * wd.y
          const moveSide = cabWallSide(cab, raw.wall)
          const occupied = cabinets.filter(c => c.id !== id && c.wall_id === raw.wall.id && cabBlocks(assemblyClass, c.assembly_class) && cabWallSide(c, raw.wall) === moveSide).map(c => ({ t: cabT(c, raw.wall), dx: c.dx }))
          const t = findFreeSlot(desired, cab.dx, raw.wall.length, occupied)
          setCabMoveDrag({ id, wall: raw.wall, pos_x: raw.wall.pos_x + t * wd.x, pos_y: raw.wall.pos_y + t * wd.y, islandFlip: wallFlipFor(raw.wall), freePos: wp })
        }
      }
    }

    if (cabResize && mode === 'select') {
      const { side, wall, perp, startCabT, startCabEndT, cabId } = cabResize
      const wd = wallDir(wall)
      const resizingCab = cabinets.find(c => c.id === cabId)
      const resizingCls = resizingCab?.assembly_class ?? 'base'
      const resizingSide = resizingCab ? cabWallSide(resizingCab, wall) : 'face'
      // Neighbours on the same wall side used for collision clamping
      const neighbours = cabinets
        .filter(c => c.id !== cabId && c.wall_id === wall.id && cabBlocks(resizingCls, c.assembly_class) && cabWallSide(c, wall) === resizingSide)
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
    if (cabFollowing) return

    const svgP = svgCoords(e)
    const wp = toWorld(svgP.x, svgP.y)

    if (await bt.handlePointerUp(wp, e)) return

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
            soffit_height: null,
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
          const pasteFlip = (() => {
            const d = wallDir(raw.wall)
            if (raw.wall.wall_type === 'island') {
              const p = { x: -d.y, y: d.x }
              return (wp.x - raw.wall.pos_x) * p.x + (wp.y - raw.wall.pos_y) * p.y < 0
            }
            const cx2 = centroid(walls)
            const inw = wallInwardNormal(raw.wall, cx2.x, cx2.y)
            return (wp.x - raw.wall.pos_x) * inw.x + (wp.y - raw.wall.pos_y) * inw.y < 0
          })()
          const pasteSide = pasteFlip ? 'back' : 'face'
          const occupied = cabinets.filter(c => c.wall_id === raw.wall.id && cabBlocks(clipboard.assembly_class, c.assembly_class) && cabWallSide(c, raw.wall) === pasteSide).map(c => ({ t: cabT(c, raw.wall), dx: c.dx }))
          const t = findFreeSlot(desired, clipboard.dx, raw.wall.length, occupied)
          ghost = { wall: raw.wall, pos_x: raw.wall.pos_x + t * wd2.x, pos_y: raw.wall.pos_y + t * wd2.y, islandFlip: pasteFlip }
        }
      }
      if (ghost && clipboard) {
        await pasteCabinet(ghost.wall, ghost.pos_x, ghost.pos_y, ghost.islandFlip)
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
          const perp = cabWallPerp(cab, wall, basePerp)
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

  function onWallPointerDown(e: React.PointerEvent, wallId: string) {
    const clickable = mode !== 'draw_wall' && mode !== 'draw_island' && mode !== 'paste' && !modeAssemblyClass(mode)
    if (!clickable || e.button !== 0 || spaceRef.current) return
    e.stopPropagation()
    svgPointerDownRef.current = true
    setContextMenu(null); setOpenMenu(null); setWallMenuOpen(false); setCabMenuOpen(false)
    setSelected({ type: 'wall', id: wallId })
    setCabResize(null)
    setMultiSelect([])
  }

  function onCabinetPointerDown(e: React.PointerEvent, cab: CabinetInstance) {
    if (mode !== 'select' || e.button !== 0) return
    e.stopPropagation()
    // stopPropagation blocks the SVG onPointerDown, so set this ref here —
    // otherwise onPointerUp's phantom-event guard exits early and the drag save never fires.
    svgPointerDownRef.current = true
    setContextMenu(null); setOpenMenu(null); setCabMenuOpen(false)
    commitResize()
    if (cabFollowing) { setCabFollowing(null); setCabMoveDrag(null) }
    setSelected({ type: 'cabinet', id: cab.id })

    if (shiftRef.current) {
      setMultiSelect(prev => {
        const base = prev.length === 0 && selected?.type === 'cabinet' ? [selected.id] : prev
        return base.includes(cab.id) ? base.filter(id => id !== cab.id) : [...base, cab.id]
      })
      return
    }

    setMultiSelect([])
  }

  function onCabinetCrosshairClick(e: React.MouseEvent, cab: CabinetInstance) {
    if (mode !== 'select') return
    e.stopPropagation()
    if (cabFollowing?.id === cab.id) {
      setCabFollowing(null)
      setCabMoveDrag(null)
    } else {
      setCabResize(null); setMultiSelect([])
      setSelected({ type: 'cabinet', id: cab.id })
      // Seed ghost immediately at cabinet's current position so it's visible before any cursor movement
      const wall = walls.find(w => w.id === cab.wall_id)
      if (wall) {
        const islandFlip = wall.wall_type === 'island' &&
          (((cab.rotation - wall.angle) % 360 + 360) % 360) > 90
        setCabMoveDrag({ id: cab.id, wall, pos_x: cab.pos_x, pos_y: cab.pos_y, islandFlip })
      }
      setCabFollowing({ id: cab.id, assemblyClass: cab.assembly_class })
    }
  }

  async function onSVGClick(e: React.MouseEvent) {
    if (cabResize) { commitResize(); return }
    if (!cabFollowing) return
    if (!cabMoveDrag) { setCabFollowing(null); return }
    const { id } = cabFollowing
    const { wall, pos_x, pos_y, islandFlip } = cabMoveDrag
    setCabFollowing(null)
    setCabMoveDrag(null)
    captureSnapshot()
    const newRotation = islandFlip ? wall.angle + 180 : wall.angle
    await handleUpdateCabinet(id, { wall_id: wall.id, pos_x, pos_y, rotation: newRotation })
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

  const { handleInsertAdjacent, handleSplitCabinet, handleInsertCabinetAtElevT } = useCabinetOps({
    cabinets, walls, room, captureSnapshot,
    setCabinets, setSelected, setResolvedParts, setSplitCabId,
    applyInputColours, applyInputEdgebands,
    handleUpdateCabinet, placeCabinet,
  })

  function onCabinetDoubleClick(e: React.MouseEvent, cabId: string) {
    e.stopPropagation()
    setContextMenu(null)
    setEditCabId(cabId)
  }

  function onCabMarkerClick(e: React.MouseEvent, cab: CabinetInstance, side: 'left' | 'right' | 'front', wall: Wall, perp: { x: number; y: number }) {
    if (mode !== 'select') return
    e.stopPropagation()
    setContextMenu(null); setOpenMenu(null); setCabMenuOpen(false)
    setSelected({ type: 'cabinet', id: cab.id })
    // Commit any existing resize before starting a new one
    commitResize()
    const t = cabT(cab, wall)
    const dim: 'dx' | 'dz' = side === 'front' ? 'dz' : 'dx'
    setCabResize({
      cabId: cab.id, dim, side, wall, perp,
      startCabT: t, startCabEndT: t + cab.dx,
      liveValue: dim === 'dx' ? cab.dx : cab.dz,
    })
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

  const { handleEqualizeWidths, handleAlignLeft, handleAlignRight } = useMultiSelectOps({
    multiSelect, cabinets, walls, handleUpdateCabinet, setContextMenu,
  })

  // ── Project / Room save handlers ──────────────────────────────────────────

  function reResolveAllCabinets() {
    for (const cab of cabinets) {
      dbResolveAndPersistCabinet(cab.id).then(resolved => {
        if (resolved) {
          setResolvedParts(m => new Map(m).set(cab.id, resolved))
          applyInputColours(cab.id)
          applyInputEdgebands(cab.id)
        }
      })
    }
  }

  async function handleUpdateProject(updates: Partial<Project>) {
    if (!project) return
    setProjectState(prev => prev ? { ...prev, ...updates } : prev)
    const { error } = await supabase.from('projects').update(updates).eq('id', project.id)
    if (error) { console.error('Failed to save project:', error); return }
    reResolveAllCabinets()
  }

  async function handleUpdateRoom(updates: Partial<Room>) {
    setRoomState(prev => ({ ...prev, ...updates }))
    const { error } = await supabase.from('rooms').update(updates).eq('id', room.id)
    if (error) { console.error('Failed to save room:', error); return }
    reResolveAllCabinets()
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedWall      = selected?.type === 'wall'      ? walls.find(w => w.id === selected.id) ?? null      : null
  const selectedCab       = selected?.type === 'cabinet'   ? cabinets.find(c => c.id === selected.id) ?? null   : null
  const selectedBenchtop  = selected?.type === 'benchtop'  ? benchtops.find(b => b.id === selected.id) ?? null  : null

  const multiSelectCabs = multiSelect.length >= 2 ? cabinets.filter(c => multiSelect.includes(c.id)) : []
  const canEqualize = multiSelectCabs.length >= 2 && new Set(multiSelectCabs.map(c => c.wall_id)).size === 1

  const cursor = spaceRef.current ? 'grab'
    : bt.isDragging ? 'grabbing'
    : (mode === 'draw_wall' || mode === 'draw_island' || mode === 'draw_benchtop' || mode === 'draw_benchtop_rect' || mode === 'draw_benchtop_l') ? 'crosshair'
    : (modeAssemblyClass(mode) || mode === 'paste') ? 'cell'
    : cabResize ? 'crosshair'
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
    mode === 'draw_benchtop_rect'? (!bt.btRectStart ? 'Click first corner · Shift=45° · Ctrl=ortho' : 'Click opposite corner to finish · Esc=cancel · Ctrl=ortho')
    : mode === 'draw_benchtop_l' ? (bt.btLPoints.length === 0 ? 'L-shape: click start of first leg · Ctrl=ortho · Esc=cancel' : bt.btLPoints.length === 1 ? 'Click inner corner · Ctrl=ortho' : 'Click end of second leg to complete L-shape')
    : mode === 'draw_benchtop_u' ? (['U-shape: click start of arm 1 · Ctrl=ortho · Esc=cancel', 'Click inner corner 1', 'Click inner corner 2', 'Click end of arm 2'][bt.btUPoints.length] ?? 'Click end of arm 2')
    : mode === 'draw_benchtop_cutout_rect' ? (!bt.btCutoutStart ? 'Cutout: click first corner of rectangle · Esc=cancel' : 'Click opposite corner to finish cutout')
    : mode === 'draw_benchtop_cutout_circle' ? (!bt.btCutoutStart ? 'Cutout: click centre of circle · Esc=cancel' : 'Click to set radius and finish cutout')
    : mode === 'draw_benchtop'   ? (bt.btArcMode
        ? (!bt.btArcMidpoint ? 'Arc mode: click a point ON the arc curve' : 'Arc mode: click the arc endpoint')
        : bt.btDrawPoly.length === 0 ? 'Click first vertex · Shift=45° · Ctrl=ortho · A=arc · Esc=cancel'
        : bt.btDrawPoly.length < 3 ? `${bt.btDrawPoly.length} ${bt.btDrawPoly.length === 1 ? 'vertex' : 'vertices'} · Backspace=undo · Shift=45° · Ctrl=ortho · A=arc`
        : `${bt.btDrawPoly.length} vertices · click near first vertex to close · Backspace=undo · A=arc`)
    : mode === 'draw_wall'       ? (!drawStart ? 'Click to set start point · snap rings show existing endpoints' : 'Click to finish · Shift = 5° snap · or type in panel →')
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
    multiSelect.length >= 2                             ? `${multiSelect.length} cabinets selected · right-click to equalize widths`
    : selected?.type === 'wall'       && selectedWall       ? `${selectedWall.name} · ${Math.round(selectedWall.length)}mm · ${Math.round(selectedWall.angle)}°`
    : selected?.type === 'cabinet'    && selectedCab        ? `${selectedCab.assembly_class.replace(/_/g,' ')} · ${selectedCab.label ?? '—'} · ${selectedCab.dx}×${selectedCab.dy}×${selectedCab.dz}`
    : selected?.type === 'benchtop'   && selectedBenchtop   ? `Benchtop · ${selectedBenchtop.label ?? '—'} · ${selectedBenchtop.polygon.length} vertices · drag vertices to reshape · click edges to tag · click vertices to toggle join · Delete = remove`
    : null

  const menus = buildMenus({
    canUndo, canRedo, handleUndo, handleRedo,
    selected, cabinets, clipboard, setClipboard, setMode, setPlaceGhost,
    handleDeleteCabinet, handleDeleteWall,
    dispatchView, svgSize, fitToWalls, switchView,
    displayConfig, setDisplayConfig,
    setJobModalTab, setRoomModalTab,
    openReportModal: setReportScope,
  })

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
          benchtopMenuOpen={bt.benchtopMenuOpen}
          setBenchtopMenuOpen={bt.setBenchtopMenuOpen}
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
              onWallPointerDown={onWallPointerDown}
              onCabinetPointerDown={onCabinetPointerDown}
              onCabinetCrosshairClick={onCabinetCrosshairClick}
              onCabinetContextMenu={onCabinetContextMenu}
              onCabinetDoubleClick={onCabinetDoubleClick}
              onCabMarkerClick={onCabMarkerClick}
              cabMoveDrag={cabMoveDrag}
              cabFollowing={cabFollowing}
              onSVGClick={onSVGClick}
              benchtops={benchtops}
              selectedBenchtopId={selectedBenchtop?.id ?? null}
              btDrawPoly={bt.btDrawPoly}
              btDrawCursor={bt.btDrawCursor}
              onBenchtopClick={id => { setSelected({ type: 'benchtop', id }); setMultiSelect([]) }}
              onBenchtopEdgeClick={bt.onBenchtopEdgeClick}
              onBenchtopEdgeShiftClick={bt.onBenchtopEdgeShiftClick}
              onBenchtopEdgeAltClick={bt.onBenchtopEdgeAltClick}
              onBenchtopVertexClick={bt.onBenchtopVertexClick}
              onBenchtopVertexPointerDown={bt.onBtVertexPointerDown}
              onBenchtopContextMenu={bt.onBenchtopContextMenu}
              onBenchtopArcPointerDown={bt.onBtArcPointerDown}
              onBtUndoVertex={bt.undoVertex}
              btDrawArcs={bt.btDrawArcs}
              btArcMode={bt.btArcMode}
              btArcMidpoint={bt.btArcMidpoint}
              btRectStart={bt.btRectStart}
              btRectCursor={bt.btRectCursor}
              onBenchtopVertexContextMenu={bt.onBenchtopVertexContextMenu}
              onBenchtopPointerDown={bt.onBenchtopPointerDown}
              onBenchtopRotateHandlePointerDown={bt.onBenchtopRotateHandlePointerDown}
              btLPoints={bt.btLPoints}
              btLCursor={bt.btLCursor}
              btUPoints={bt.btUPoints}
              btUCursor={bt.btUCursor}
              btCutoutStart={bt.btCutoutStart}
              btCutoutCursor={bt.btCutoutCursor}
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
            elevWallSide={elevWallSide}
            onSetElevWallSide={setElevWallSide}
            onUpdateCabinet={handleUpdateCabinet}
            onPlaceAtWall={async (wall, pos_x, pos_y) => {
              if (mode === 'paste' && clipboard) {
                await pasteCabinet(wall, pos_x, pos_y, elevWallSide === 'back')
              } else {
                const clsInfo = modeAssemblyClass(mode)
                if (clsInfo) await placeCabinet(wall, pos_x, pos_y, clsInfo.cls, clsInfo.ep, elevWallSide === 'back')
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
            onCabResizeDone={() => setCabResize(null)}
            resolvedParts={resolvedParts}
            onDeselect={() => setSelected(null)}
            onSeamClick={(cabId) => {
              setSelected({ type: 'cabinet', id: cabId })
              setMultiSelect([])
              setEditCabInitialView('joints')
              setEditCabId(cabId)
            }}
          />
        )}

        {canvasView === '3d' && (
          <Room3DScene
            walls={walls}
            cabinets={cabinets}
            room={room}
            selectedId={selected?.type === 'cabinet' ? selected.id : null}
            onSelectCabinet={id => { setSelected({ type: 'cabinet', id }); setMultiSelect([]) }}
            onDeselect={() => { setSelected(null); setMultiSelect([]) }}
            onEditCabinet={id => { setEditCabInitialView('3d'); setEditCabId(id) }}
            onDeleteCabinet={id => handleDeleteCabinet(id)}
            resolvedParts={resolvedParts}
            materialColours={matColours}
          />
        )}

        {mode !== 'draw_wall' && mode !== 'draw_island' && selectedWall && (canvasView === 'plan' || canvasView === 'elevation') && (
          <WallPanel wall={selectedWall} roomHeight={room.room_dy ?? undefined} onUpdate={handleUpdateWall} onDelete={handleDeleteWall} />
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
        {selectedBenchtop && (
          <BenchtopPanel
            benchtop={selectedBenchtop}
            onUpdate={bt.handleUpdateBenchtop}
            onDelete={bt.handleDeleteBenchtop}
            filletRadius={bt.filletRadius}
            setFilletRadius={bt.setFilletRadius}
            onMirrorH={bt.handleMirrorH}
            onMirrorV={bt.handleMirrorV}
            onOffset={bt.handleOffset}
            onRotate={bt.handleRotateByAngle}
            onDeleteCutout={bt.handleDeleteCutout}
            onDrawCutoutRect={() => setMode('draw_benchtop_cutout_rect')}
            onDrawCutoutCircle={() => setMode('draw_benchtop_cutout_circle')}
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
            benchtopId: contextMenu.benchtopId,
            vertexContext: contextMenu.vertexContext,
            onDeleteBenchtop: id => void bt.handleDeleteBenchtop(id),
            onDeleteBenchtopVertex: bt.handleDeleteBenchtopVertex,
            onRoundCorner: bt.handleRoundCorner,
            onChamfer: bt.handleChamfer,
            canEqualize,
            clipboard,
            cabinets,
            multiSelect,
            onDeleteWall: handleDeleteWall,
            onDeleteCabinet: id => void handleDeleteCabinet(id),
            onDeleteMultiple: ids => void handleDeleteMultipleCabinets(ids),
            onInsertCabinet: (wId, t, cls) => { void handleInsertCabinetAtElevT(wId, t, cls) },
            onInsertAdjacent: (cabId, type, side) => { void handleInsertAdjacent(cabId, type, side) },
            onCopy: cab => {
              setClipboard(cab)
              setMode('paste')
              const raw = nearestWall(mouseWorld, walls, cab.dx, WALL_SNAP_PX / view.zoom)
              if (raw) {
                const wd = wallDir(raw.wall)
                const desired = (raw.pos_x - raw.wall.pos_x) * wd.x + (raw.pos_y - raw.wall.pos_y) * wd.y
                const copyFlip = (() => {
                  const d = wallDir(raw.wall)
                  if (raw.wall.wall_type === 'island') {
                    const p = { x: -d.y, y: d.x }
                    return (mouseWorld.x - raw.wall.pos_x) * p.x + (mouseWorld.y - raw.wall.pos_y) * p.y < 0
                  }
                  const cx2 = centroid(walls)
                  const inw = wallInwardNormal(raw.wall, cx2.x, cx2.y)
                  return (mouseWorld.x - raw.wall.pos_x) * inw.x + (mouseWorld.y - raw.wall.pos_y) * inw.y < 0
                })()
                const copySide = copyFlip ? 'back' : 'face'
                const occupied = cabinets
                  .filter(c => c.wall_id === raw.wall.id && cabBlocks(cab.assembly_class, c.assembly_class) && cabWallSide(c, raw.wall) === copySide)
                  .map(c => ({ t: cabT(c, raw.wall), dx: c.dx }))
                const t = findFreeSlot(desired, cab.dx, raw.wall.length, occupied)
                setPlaceGhost({ wall: raw.wall, pos_x: raw.wall.pos_x + t * wd.x, pos_y: raw.wall.pos_y + t * wd.y, islandFlip: copyFlip })
              } else {
                setPlaceGhost(null)
              }
            },
            onPaste: () => { if (clipboard) setMode('paste') },
            onEdit: id => setEditCabId(id),
            onEqualizeWidths: handleEqualizeWidths,
            onAlignLeft: handleAlignLeft,
            onAlignRight: handleAlignRight,
            onSplit: id => { setContextMenu(null); setSplitCabId(id) },
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
            materialColours={matColours}
            ebByMatId={ebByMatId}
          />
        )
      })()}

      {deleteWallPending && (
        <DeleteWallModal
          onConfirm={confirmDeleteWall}
          onCancel={() => setDeleteWallPending(null)}
        />
      )}

      {splitCabId && (() => {
        const cab = cabinets.find(c => c.id === splitCabId)
        if (!cab) return null
        return (
          <SplitCabinetModal
            width={cab.dx}
            onSplit={count => void handleSplitCabinet(splitCabId, count)}
            onCancel={() => setSplitCabId(null)}
          />
        )
      })()}

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

      {reportScope && (
        <ReportsModal
          initialScope={reportScope}
          project={project}
          room={room}
          walls={walls}
          cabinets={cabinets}
          resolvedParts={resolvedParts}
          benchtops={benchtops}
          onClose={() => setReportScope(null)}
        />
      )}

    </div>
  )
}
