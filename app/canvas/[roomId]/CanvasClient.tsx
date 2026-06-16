'use client'

import { useState, useRef, useEffect, useCallback, useReducer, useMemo } from 'react'
import { supabase } from '@/src/lib/supabase'
import { Project, Room, Wall, CabinetInstance, CabinetDefinition, AssemblyClass, DEFAULT_DIMS, BenchtopInstance } from '@/src/lib/types'
import {
  Pt, MIN_ZOOM, MAX_ZOOM, MIN_WALL_LEN, SNAP_PX, WALL_SNAP_PX,
  toDeg, dist,
  wallEnd, wallDir,
  snapAngle,
  nearestWall, findFreeSlot, slideToFreeSlot, fitFreeSlot, cabsBlock, cabT, nextLabel,
  centroid, wallInwardNormal, cabWallPerp, cabWallSide, cabinetCornerPts,
} from '@/src/lib/geometry'
import { isEndpointUpdate, computeJointUpdates } from '@/src/lib/wallJoints'
import { dbSaveWall, dbUpdateWall, dbDeleteWall, dbInsertCabinet, dbResolveAndPersistCabinet, dbUpdateCabinet, dbDeleteCabinet, dbLoadCabinetDefinition, buildInstanceFromDefinition, dbInsertDefinitionParts, resolveKickRun } from './canvasDB'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { filterHiddenParts } from '@/src/lib/resolver/filterHidden'
import { useCanvasHistory } from './useCanvasHistory'
import { useMaterialColours } from './useMaterialColours'
import { useCabinetOps } from './useCabinetOps'
import { useMultiSelectOps } from './useMultiSelectOps'
import { buildMenus } from './canvasMenuConfig'
import {
  Mode, ArmedDefinition, Selected, CanvasView, ViewState, ViewAction, PlaceGhost, CabDrag, CabMoveDrag, CabResize, ContextMenuState, SectionCut,
  viewReducer, placeInfoFor, DisplayConfig, PresetId,
  DEFAULT_DISPLAY_CONFIG, applyPreset, toggleAnnotation,
} from './canvasTypes'
import { useBenchtopInteraction } from './useBenchtopInteraction'
import { DISPLAY_PRESETS } from '@/src/lib/displayConfig'
import CanvasMenubar from './CanvasMenubar'
import CanvasSidebar from './CanvasSidebar'
import CanvasSVG from './CanvasSVG'
import ElevationSVG from './ElevationSVG'
import SectionSVG from './SectionSVG'
import CanvasContextMenu from './CanvasContextMenu'
import { buildContextMenuGroups } from './canvasContextItems'
import DeleteWallModal from './DeleteWallModal'
import SplitCabinetModal from './SplitCabinetModal'
import SaveToLibraryModal from './SaveToLibraryModal'
import DrawingPanel, { type DrawingPanelHandle } from './DrawingPanel'
import WallDrawPanel from './WallDrawPanel'
import WallPanel from './WallPanel'
import CabinetPanel from './CabinetPanel'
import CabinetResizePanel from './CabinetResizePanel'
import CabinetEditModal from './CabinetEditModal'
import JobPropertiesModal, { type JobPropertiesTab } from './JobPropertiesModal'
import RoomPropertiesModal, { type RoomPropertiesTab } from './RoomPropertiesModal'
import { type RoomSwitcherHandle } from './RoomSwitcher'
import ObjectTreeModal from './ObjectTreeModal'
import ReportsModal, { type ReportScope } from './ReportsModal'
import Room3DScene, { type Camera3DState } from './Room3DScene'
import BenchtopPanel from './BenchtopPanel'
import SnapToolbar from './SnapToolbar'
import { getUserPrefs, setUserPrefs } from '@/src/lib/userPrefs'
import { computeSnap, SNAP_KINDS, SNAP_KIND_META, type SnapSettings, type SnapResult } from '@/src/lib/canvasSnap'
import { type ElevSnapSettings, type ElevSnapResult } from '@/src/lib/elevationSnap'

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
  // Library definition armed for placement (mode === 'place_definition').
  const [armedDef, setArmedDef] = useState<ArmedDefinition | null>(null)
  // Editable draft of the armed cabinet (drives the right-hand panel + what gets placed).
  const [armedDraft, setArmedDraft] = useState<CabinetInstance | null>(null)
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
  const [saveLibCabId, setSaveLibCabId] = useState<string | null>(null)
  const [libRefresh, setLibRefresh] = useState(0)   // bump to reload the library palette
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(t)
  }, [toast])
  const [clipboard, setClipboard] = useState<CabinetInstance | null>(null)
  // Keyboard copy/cut buffer — holds one or many cabinets (separate from the
  // context-menu `clipboard`, which drives the click-to-place ghost paste).
  const [clipboardGroup, setClipboardGroup] = useState<CabinetInstance[]>([])
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
    // Canvas opens in plan view → seed from the plan default layer.
    const preset = getUserPrefs().drawingPresets.plan
    return applyPreset(preset)
  })
  // Once the user manually changes the Detail dropdown, stop auto-applying per-view
  // defaults on switch — the dropdown then stays shared/sticky across views.
  const presetTouchedRef = useRef(false)
  const [jobModalTab, setJobModalTab]   = useState<JobPropertiesTab | null>(null)
  const [roomModalTab, setRoomModalTab] = useState<RoomPropertiesTab | null>(null)
  const [showObjectTree, setShowObjectTree] = useState(false)
  const [reportScope, setReportScope] = useState<ReportScope | null>(null)
  const [editCabId, setEditCabId] = useState<string | null>(null)
  const [editCabInitialView, setEditCabInitialView] = useState<'3d' | 'elevation' | 'joints'>('elevation')
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [benchtops, setBenchtops] = useState<BenchtopInstance[]>(initialBenchtops)
  const [sectionCut, setSectionCut] = useState<SectionCut | null>(null)
  const [sectionDrag, setSectionDrag] = useState<{ offsetX: number; offsetY: number } | null>(null)
  // Snapping (shared by wall/benchtop/measure tools). Persisted to localStorage.
  const [snapSettings, setSnapSettingsState] = useState<SnapSettings>(() => getUserPrefs().snapSettings)
  const [snapResult, setSnapResult] = useState<SnapResult | null>(null)
  // Measure tool: click two snapped points to read off a distance.
  const [measureStart, setMeasureStart] = useState<Pt | null>(null)
  const [measureEnd, setMeasureEnd] = useState<Pt | null>(null)
  const [measureCursor, setMeasureCursor] = useState<Pt | null>(null)
  // Elevation-view measure + snap (parallel to plan; lives in elevation 2D space).
  const [elevSnapSettings, setElevSnapSettingsState] = useState<ElevSnapSettings>(() => getUserPrefs().elevSnapSettings)
  const [elevSnapResult, setElevSnapResult] = useState<ElevSnapResult | null>(null)
  const [elevMeasureStart, setElevMeasureStart]   = useState<Pt | null>(null)
  const [elevMeasureEnd, setElevMeasureEnd]       = useState<Pt | null>(null)
  const [elevMeasureCursor, setElevMeasureCursor] = useState<Pt | null>(null)
  const ctrlRef = useRef(false)

  const updateSnapSettings = useCallback((next: SnapSettings) => {
    setSnapSettingsState(next)
    setUserPrefs({ snapSettings: next })
  }, [])
  const updateElevSnapSettings = useCallback((next: ElevSnapSettings) => {
    setElevSnapSettingsState(next)
    setUserPrefs({ elevSnapSettings: next })
  }, [])

  const { captureSnapshot, pushSnapshot, handleUndo, handleRedo, wallsRef, cabinetsRef, benchtopsRef, canUndo, canRedo } =
    useCanvasHistory(walls, cabinets, benchtops, setWalls, setCabinets, setBenchtops, setSelected)

  const {
    resolvedParts, setResolvedParts,
    matColours, ebByMatId,
    applyInputColours, applyInputEdgebands,
  } = useMaterialColours(initialCabinets)

  // Hidden-part-filtered view of the resolved map for on-canvas drawings (elevation
  // + 3D room). The raw map is kept for the edit modal, whose Parts tab needs the
  // full list; the modal filters its own geometry viewers internally.
  const visibleResolvedParts = useMemo(() => {
    const out = new Map<string, ResolvedCabinet>()
    for (const [id, r] of resolvedParts) out.set(id, filterHiddenParts(r))
    return out
  }, [resolvedParts])

  const svgRef = useRef<SVGSVGElement>(null)
  // Retained 3D camera state — survives the Room3DScene unmount when switching to
  // elevation/plan, so returning to 3D restores the last view instead of resetting.
  const camera3DStateRef = useRef<Camera3DState | null>(null)
  // Incrementing signal drives the "Reset view" button — snaps 3D back to default.
  const [reset3DSignal, setReset3DSignal] = useState(0)
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
  const roomSwitcherRef = useRef<RoomSwitcherHandle>(null)

  const bt = useBenchtopInteraction({
    room, walls, cabinets,
    benchtops, setBenchtops, benchtopsRef,
    wallsRef, cabinetsRef,
    mode, zoom: view.zoom,
    svgRef, svgPointerDownRef, ctrlRef, shiftRef,
    selected,
    setSelected, setContextMenu, setMode,
    captureSnapshot, pushSnapshot,
    snapSettings, setSnapResult,
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

  // Drop any in-progress measurement (and snap glyph) whenever the measure tool
  // is exited — via Esc, view switch, or picking another tool.
  useEffect(() => {
    if (mode !== 'measure') {
      setMeasureStart(null); setMeasureEnd(null); setMeasureCursor(null)
      setSnapResult(null)
      setElevMeasureStart(null); setElevMeasureEnd(null); setElevMeasureCursor(null)
      setElevSnapResult(null)
    }
  }, [mode])

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
      if (e.key === 'Escape') { setCabResize(null); setCabFollowing(null); setCabMoveDrag(null); setMultiSelect([]); setMode('select'); setArmedDef(null); setArmedDraft(null); setDrawStart(null); setDrawCursor(null); setPlaceGhost(null); setContextMenu(null); setMarquee(null); marqueeStartRef.current = null; bt.resetDraw(); setDeleteWallPending(null); setMeasureStart(null); setMeasureEnd(null); setMeasureCursor(null); setSnapResult(null) }
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

  // Copy / cut / paste cabinets via keyboard (works for single or multi-select).
  // Separate from the keydown effect above so it re-binds with fresh selection /
  // clipboard / cabinet state rather than the stale [selected]-only closure.
  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement ||
      (t instanceof HTMLElement && t.isContentEditable)
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      if (isField(e.target)) return
      const k = e.key.toLowerCase()
      if (k === 'c') {
        if (getSelectedCabinets().length) { e.preventDefault(); copySelectedCabinets() }
      } else if (k === 'x') {
        if (getSelectedCabinets().length) { e.preventDefault(); void cutSelectedCabinets() }
      } else if (k === 'v') {
        if (clipboardGroup.length && mode === 'select') { e.preventDefault(); startGroupPaste() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, multiSelect, clipboardGroup, mode, cabinets, walls, room])

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

  // Merge re-resolved kick-run siblings (from resolveKickRun / dbDeleteCabinet)
  // into the canvas so the lead and other members redraw after a run change.
  const applyKickSiblings = useCallback((byId: Map<string, ResolvedCabinet>) => {
    if (byId.size === 0) return
    setResolvedParts(m => { const next = new Map(m); for (const [cid, rc] of byId) next.set(cid, rc); return next })
    for (const cid of byId.keys()) { applyInputColours(cid); applyInputEdgebands(cid) }
  }, [applyInputColours, applyInputEdgebands])

  async function handleDeleteCabinet(id: string) {
    if (!confirm('Delete this cabinet?')) return
    captureSnapshot()
    setCabinets(cs => cs.filter(c => c.id !== id))
    setSelected(null)
    applyKickSiblings(await dbDeleteCabinet(id))
  }

  async function handleDeleteMultipleCabinets(ids: string[]) {
    if (!confirm(`Delete ${ids.length} cabinets?`)) return
    captureSnapshot()
    setCabinets(cs => cs.filter(c => !ids.includes(c.id)))
    setSelected(null)
    setMultiSelect([])
    setContextMenu(null)
    // Sequential so concurrent reconciles of the same run don't race.
    for (const id of ids) {
      const siblings = await dbDeleteCabinet(id)
      for (const did of ids) siblings.delete(did)   // drop any still-pending deletes
      applyKickSiblings(siblings)
    }
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
    // Kick-run member: a width/position change reshapes the run's continuous kick
    // (owned by the lead). Re-resolve the whole run and merge every member so the
    // lead — and any cabinet that just became/ceased to be the lead — redraw live.
    const runId = cabinetsRef.current.find(c => c.id === id)?.kick_run_id
    if (runId) applyKickSiblings(await resolveKickRun(runId))
  }, [applyKickSiblings])

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

  async function placeCabinet(wall: Wall, pos_x: number, pos_y: number, cls: AssemblyClass, isEP = false, islandFlip = false, dxOverride?: number) {
    captureSnapshot()
    const dims = DEFAULT_DIMS[cls] ?? DEFAULT_DIMS.base
    // Map corner variants back to their base class key to look up job dimension defaults
    const baseKey = cls.replace('_corner', '') as 'base' | 'wall' | 'tall'
    const jobDims = (project?.class_dimension_defaults as Record<string, { dy?: number; dz?: number }> | null)?.[baseKey]
    const data: Omit<CabinetInstance, 'id' | 'created_at' | 'updated_at'> = {
      room_id: room.id, wall_id: wall.id, cabinet_definition_id: null,
      label: nextLabel(cabinets, isEP ? 'ep' : cls), assembly_class: cls,
      pos_x, pos_y, pos_z: 0, rotation: islandFlip ? wall.angle + 180 : wall.angle,
      dx: dxOverride != null && dxOverride > 0 ? Math.round(dxOverride) : dims.dx,
      dy: jobDims?.dy ?? dims.dy, dz: jobDims?.dz ?? dims.dz,
      has_carcass: !isEP, has_internal: !isEP, has_face: true,
      has_toekick: cls === 'base' || cls === 'tall' || cls === 'base_corner' || cls === 'tall_corner',
      construction_method_id: null, top_type: 'front_rail', toe_type: 'ladder',
      left_neighbour_type: 'wall', right_neighbour_type: 'wall',
      exposed_interior: false, rule_overrides: {}, material_overrides: {},
      toekick_overrides: {}, drawerbox_overrides: {}, hardware_overrides: {},
      face_grid: null, internal_grid: null, carcase_joints: {}, schema_version: '0.4', notes: null,
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

  // Library placement — snapshots a definition into a new instance via the service
  // layer. Position/label/neighbour logic mirrors placeCabinet exactly; dxOverride
  // applies the gap-fit width like the legacy path.
  // Build an editable draft instance from a library definition (id '__draft', not in
  // the DB). The right-hand CabinetPanel edits this; placement inserts it.
  function buildDraftFromDefinition(def: CabinetDefinition): CabinetInstance {
    const data = buildInstanceFromDefinition(def, {
      room_id: room.id, wall_id: '', label: def.name, pos_x: 0, pos_y: 0, rotation: 0,
    })
    return { ...data, id: '__draft', created_at: '', updated_at: '' }
  }

  // Place the (possibly edited) armed draft. Follows the insert → setCabinets →
  // async-resolve pattern so the cabinet renders immediately.
  async function placeFromDraft(draft: CabinetInstance, wall: Wall, pos_x: number, pos_y: number, islandFlip = false, dxOverride?: number) {
    captureSnapshot()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, updated_at, ...rest } = draft
    const data: Omit<CabinetInstance, 'id' | 'created_at' | 'updated_at'> = {
      ...rest,
      room_id: room.id, wall_id: wall.id,
      label: nextLabel(cabinets, draft.assembly_class),
      pos_x, pos_y, rotation: islandFlip ? wall.angle + 180 : wall.angle,
      dx: dxOverride != null && dxOverride > 0 ? Math.round(dxOverride) : draft.dx,
    }
    const cabinet = await dbInsertCabinet(data)
    if (cabinet) {
      setCabinets(cs => [...cs, cabinet])
      setSelected({ type: 'cabinet', id: cabinet.id })
      // Copy the definition's custom parts first, then resolve (so their formulas evaluate).
      const parts = cabinet.cabinet_definition_id
        ? dbInsertDefinitionParts(cabinet.cabinet_definition_id, cabinet.id)
        : Promise.resolve()
      parts.then(() => dbResolveAndPersistCabinet(cabinet.id)).then(resolved => {
        if (resolved) { setResolvedParts(m => new Map(m).set(cabinet.id, resolved)); applyInputColours(cabinet.id); applyInputEdgebands(cabinet.id) }
      })
    }
  }

  // Drop a library definition onto the plan canvas at the drop point (drag-and-drop
  // placement). Self-contained: converts the screen point to world coords, snaps to
  // the nearest wall + gap, and places via the same draft path as click placement.
  async function dropDefinitionAt(definitionId: string, clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const wp = toWorld(clientX - rect.left, clientY - rect.top)
    const def = await dbLoadCabinetDefinition(definitionId)
    if (!def) return
    const draft = buildDraftFromDefinition(def)
    const raw = nearestWall(wp, walls, draft.dx, Infinity)
    if (!raw) return
    const wd = wallDir(raw.wall)
    const desired = (raw.pos_x - raw.wall.pos_x) * wd.x + (raw.pos_y - raw.wall.pos_y) * wd.y
    let flip: boolean
    if (raw.wall.wall_type === 'island') {
      const perp = { x: -wd.y, y: wd.x }
      flip = (wp.x - raw.wall.pos_x) * perp.x + (wp.y - raw.wall.pos_y) * perp.y < 0
    } else {
      const cxp = centroid(walls)
      const inward = wallInwardNormal(raw.wall, cxp.x, cxp.y)
      flip = (wp.x - raw.wall.pos_x) * inward.x + (wp.y - raw.wall.pos_y) * inward.y < 0
    }
    const side = flip ? 'back' : 'face'
    const occupied = cabinets
      .filter(c => c.wall_id === raw.wall.id && cabsBlock({ assembly_class: draft.assembly_class, dy: draft.dy }, c, raw.wall, room) && cabWallSide(c, raw.wall) === side)
      .map(c => ({ t: cabT(c, raw.wall), dx: c.dx }))
    const fit = fitFreeSlot(desired, draft.dx, raw.wall.length, occupied)
    await placeFromDraft(draft, raw.wall, raw.wall.pos_x + fit.t * wd.x, raw.wall.pos_y + fit.t * wd.y, flip, fit.dx)
  }

  // Unified placement descriptor for the current mode: the armed definition when
  // mode === 'place_definition', otherwise the legacy class-based modes. dx/dy are the
  // ghost footprint; definitionId routes the placement to the library path.
  function currentPlaceInfo() {
    return placeInfoFor(mode, armedDef)
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

  // ── Keyboard copy / cut / paste (single or multi cabinet) ───────────────────

  function getSelectedCabinets(): CabinetInstance[] {
    if (multiSelect.length >= 2) return cabinets.filter(c => multiSelect.includes(c.id))
    if (selected?.type === 'cabinet') {
      const c = cabinets.find(x => x.id === selected.id)
      return c ? [c] : []
    }
    return []
  }

  function copySelectedCabinets() {
    const cabs = getSelectedCabinets()
    if (cabs.length) setClipboardGroup(cabs)
  }

  async function cutSelectedCabinets() {
    const cabs = getSelectedCabinets()
    if (!cabs.length) return
    setClipboardGroup(cabs)
    captureSnapshot()
    const ids = cabs.map(c => c.id)
    setCabinets(cs => cs.filter(c => !ids.includes(c.id)))
    setSelected(null); setMultiSelect([])
    // Sequential so concurrent reconciles of the same kick run don't race.
    for (const id of ids) {
      const siblings = await dbDeleteCabinet(id)
      for (const did of ids) siblings.delete(did)
      applyKickSiblings(siblings)
    }
  }

  const cabWallT = (c: CabinetInstance) => {
    const w = walls.find(x => x.id === c.wall_id)
    return w ? cabT(c, w) : 0
  }

  // Ctrl+V → enter the click-to-place ghost paste. The lead (leftmost) copied
  // cabinet follows the pointer as an outline; on click the whole buffer is
  // stamped down relative to it (see pasteGroupAt). Single cabinet reuses the
  // existing single-cabinet paste flow.
  function startGroupPaste() {
    if (clipboardGroup.length === 0) return
    const sorted = [...clipboardGroup].sort((a, b) => cabWallT(a) - cabWallT(b))
    setClipboardGroup(sorted)
    setClipboard(sorted[0])
    setMode('paste')
  }

  // Stamp the whole keyboard buffer onto `wall`, anchored at the drop point and
  // preserving each cabinet's spacing relative to the lead cabinet. Each lands in
  // the nearest free slot so they don't overlap existing cabinets.
  async function pasteGroupAt(wall: Wall, anchorPosX: number, anchorPosY: number, flip: boolean) {
    if (clipboardGroup.length === 0) return
    captureSnapshot()
    const wd = wallDir(wall)
    const anchorT = (anchorPosX - wall.pos_x) * wd.x + (anchorPosY - wall.pos_y) * wd.y
    const baseT = cabWallT(clipboardGroup[0])
    const side = flip ? 'back' : 'face'
    const added: CabinetInstance[] = []
    let working = [...cabinets]
    for (const src of clipboardGroup) {
      const desired = anchorT + (cabWallT(src) - baseT)
      const occupied = working
        .filter(c => c.wall_id === wall.id && cabsBlock(src, c, wall, room) && cabWallSide(c, wall) === side)
        .map(c => ({ t: cabT(c, wall), dx: c.dx }))
      const t = findFreeSlot(desired, src.dx, wall.length, occupied)
      const pos_x = wall.pos_x + t * wd.x
      const pos_y = wall.pos_y + t * wd.y
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, created_at, updated_at, ...rest } = src
      const cab = await dbInsertCabinet({ ...rest, room_id: room.id, wall_id: wall.id, label: nextLabel(working, src.assembly_class), pos_x, pos_y, rotation: flip ? wall.angle + 180 : wall.angle })
      if (cab) {
        working = [...working, cab]
        added.push(cab)
        dbResolveAndPersistCabinet(cab.id).then(resolved => {
          if (resolved) { setResolvedParts(m => new Map(m).set(cab.id, resolved)); applyInputColours(cab.id); applyInputEdgebands(cab.id) }
        })
      }
    }
    if (added.length) {
      setCabinets(cs => [...cs, ...added])
      setSelected({ type: 'cabinet', id: added[0].id })
      setMultiSelect(added.length >= 2 ? added.map(c => c.id) : [])
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
    if (mode === 'measure') { e.preventDefault(); return }
    if (mode === 'draw_wall' || mode === 'draw_island') {
      e.preventDefault()
      if (!drawStart) {
        const snapped = computeSnap(wp, { walls, cabinets, benchtops }, snapSettings, SNAP_PX / view.zoom).pt
        setDrawStart(snapped); setDrawCursor(snapped)
        drawStartedThisDownRef.current = true
      }
      return
    }
    if (mode === 'draw_section') {
      e.preventDefault()
      if (!drawStart) {
        setDrawStart(wp); setDrawCursor(wp)
        drawStartedThisDownRef.current = true
      }
      return
    }
    if (currentPlaceInfo() || mode === 'paste') { svgRef.current.setPointerCapture(e.pointerId); return }
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
    // Snap glyph is recomputed by the snapping branches below; default to none.
    // (No-op re-render when already null, so this is cheap on every move.)
    setSnapResult(null)

    if (panRef.current) {
      dispatchView({ type: 'pan', dx: e.clientX - panRef.current.startX - (view.panX - panRef.current.panX), dy: e.clientY - panRef.current.startY - (view.panY - panRef.current.panY) })
      panRef.current.startX = e.clientX; panRef.current.startY = e.clientY
      panRef.current.panX = view.panX; panRef.current.panY = view.panY
      return
    }

    if (sectionDrag && sectionCut) {
      const newX1 = wp.x + sectionDrag.offsetX
      const newY1 = wp.y + sectionDrag.offsetY
      const ddx = sectionCut.x2 - sectionCut.x1, ddy = sectionCut.y2 - sectionCut.y1
      setSectionCut({ ...sectionCut, x1: newX1, y1: newY1, x2: newX1 + ddx, y2: newY1 + ddy })
      return
    }

    if (bt.handlePointerMove(wp, e)) return

    if (mode === 'measure') {
      const snap = computeSnap(wp, { walls, cabinets, benchtops }, snapSettings, SNAP_PX / view.zoom,
        measureStart, { ortho: ctrlRef.current, ortho45: shiftRef.current })
      setSnapResult(snap.kind ? snap : null)
      setMeasureCursor(snap.pt)
      return
    }

    if (mode === 'draw_wall' || mode === 'draw_island') {
      const snap = computeSnap(wp, { walls, cabinets, benchtops }, snapSettings, SNAP_PX / view.zoom)
      let end = snap.pt
      if (drawStart && snap.kind == null) {
        end = snapAngle(drawStart, end, shiftRef.current ? 5 : 22.5)
      }
      setSnapResult(snap.kind ? snap : null)
      setDrawCursor(end)
      return
    }
    if (mode === 'draw_section') {
      let end = wp
      if (drawStart && shiftRef.current) end = snapAngle(drawStart, end, 45)
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
      const occupied = cabinets.filter(c => c.wall_id === raw.wall.id && cabsBlock(clipboard, c, raw.wall, room) && cabWallSide(c, raw.wall) === side).map(c => ({ t: cabT(c, raw.wall), dx: c.dx }))
      const t = findFreeSlot(desired, clipboard.dx, raw.wall.length, occupied)
      setPlaceGhost({ wall: raw.wall, pos_x: raw.wall.pos_x + t * wd.x, pos_y: raw.wall.pos_y + t * wd.y, islandFlip: flip, freePos: wp })
      return
    }

    const clsInfo = currentPlaceInfo()
    if (clsInfo) {
      // No distance limit — the ghost floats at the cursor and always snaps to the nearest
      // wall, matching the elevation-view placement feel (carry-in-hand + snap landing).
      const raw = nearestWall(wp, walls, clsInfo.dx, Infinity)
      if (!raw) { setPlaceGhost(null); return }
      const wd = wallDir(raw.wall)
      const desired = (raw.pos_x - raw.wall.pos_x) * wd.x + (raw.pos_y - raw.wall.pos_y) * wd.y
      const flip = wallFlipFor(raw.wall)
      const side = flip ? 'back' : 'face'
      const occupied = cabinets.filter(c => c.wall_id === raw.wall.id && cabsBlock({ assembly_class: clsInfo.cls, dy: clsInfo.dy }, c, raw.wall, room) && cabWallSide(c, raw.wall) === side).map(c => ({ t: cabT(c, raw.wall), dx: c.dx }))
      // Fit into the available gap: shrink the new cabinet's width if the gap is
      // narrower than the default, rather than overlapping the neighbour.
      const fit = fitFreeSlot(desired, clsInfo.dx, raw.wall.length, occupied)
      setPlaceGhost({ wall: raw.wall, pos_x: raw.wall.pos_x + fit.t * wd.x, pos_y: raw.wall.pos_y + fit.t * wd.y, islandFlip: flip, freePos: wp, fitDx: fit.dx })
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
        const occupied = cabinets.filter(c => c.id !== cabId && c.wall_id === wall.id && cabsBlock(dragCab ?? { assembly_class: assemblyClass, dy: 9999 }, c, wall, room) && cabWallSide(c, wall) === dragSide).map(c => ({ t: cabT(c, wall), dx: c.dx }))
        const t = slideToFreeSlot(desired, cabDX, wall.length, occupied, dragCab ? cabT(dragCab, wall) : undefined)
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
          const occupied = cabinets.filter(c => c.id !== id && c.wall_id === raw.wall.id && cabsBlock(cab, c, raw.wall, room) && cabWallSide(c, raw.wall) === moveSide).map(c => ({ t: cabT(c, raw.wall), dx: c.dx }))
          // Same-wall move → keep it on the drag side (no bounce-back); cross-wall → free slot.
          const origT = raw.wall.id === cab.wall_id ? cabT(cab, raw.wall) : undefined
          const t = slideToFreeSlot(desired, cab.dx, raw.wall.length, occupied, origT)
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
        .filter(c => c.id !== cabId && c.wall_id === wall.id && cabsBlock(resizingCab ?? { assembly_class: resizingCls, dy: 9999 }, c, wall, room) && cabWallSide(c, wall) === resizingSide)
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
    if (sectionDrag) { setSectionDrag(null); return }
    if (cabFollowing) return

    const svgP = svgCoords(e)
    const wp = toWorld(svgP.x, svgP.y)

    if (await bt.handlePointerUp(wp, e)) return

    if (mode === 'measure') {
      const snap = computeSnap(wp, { walls, cabinets, benchtops }, snapSettings, SNAP_PX / view.zoom,
        measureStart, { ortho: ctrlRef.current, ortho45: shiftRef.current })
      if (!measureStart || measureEnd) {
        // Begin a fresh measurement (first click, or click after one is complete).
        setMeasureStart(snap.pt); setMeasureEnd(null); setMeasureCursor(snap.pt)
      } else {
        setMeasureEnd(snap.pt)
      }
      return
    }

    if (mode === 'draw_wall' || mode === 'draw_island') {
      if (drawStartedThisDownRef.current) { drawStartedThisDownRef.current = false; return }
      const isIsland = mode === 'draw_island'
      if (drawStart && !placingRef.current) {
        placingRef.current = true
        const snap = computeSnap(wp, { walls, cabinets, benchtops }, snapSettings, SNAP_PX / view.zoom)
        let end = snap.pt
        if (snap.kind == null) {
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

    if (mode === 'draw_section') {
      if (drawStartedThisDownRef.current) { drawStartedThisDownRef.current = false; return }
      if (drawStart && !placingRef.current) {
        placingRef.current = true
        let end = wp
        if (shiftRef.current) end = snapAngle(drawStart, end, 45)
        const len = dist(drawStart, end)
        if (len >= 20) {
          setSectionCut({ x1: drawStart.x, y1: drawStart.y, x2: end.x, y2: end.y, lookDir: 1 })
          switchView('section')
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
          const occupied = cabinets.filter(c => c.wall_id === raw.wall.id && cabsBlock(clipboard, c, raw.wall, room) && cabWallSide(c, raw.wall) === pasteSide).map(c => ({ t: cabT(c, raw.wall), dx: c.dx }))
          const t = findFreeSlot(desired, clipboard.dx, raw.wall.length, occupied)
          ghost = { wall: raw.wall, pos_x: raw.wall.pos_x + t * wd2.x, pos_y: raw.wall.pos_y + t * wd2.y, islandFlip: pasteFlip }
        }
      }
      if (ghost && clipboard) {
        if (clipboardGroup.length > 1) await pasteGroupAt(ghost.wall, ghost.pos_x, ghost.pos_y, ghost.islandFlip ?? false)
        else await pasteCabinet(ghost.wall, ghost.pos_x, ghost.pos_y, ghost.islandFlip)
        setMode('select'); setPlaceGhost(null)
      }
      return
    }

    const clsInfo = currentPlaceInfo()
    if (clsInfo) {
      if (placeGhost && !placingRef.current) {
        placingRef.current = true
        if (clsInfo.definitionId && armedDraft) {
          await placeFromDraft(armedDraft, placeGhost.wall, placeGhost.pos_x, placeGhost.pos_y, placeGhost.islandFlip, placeGhost.fitDx)
        } else {
          await placeCabinet(placeGhost.wall, placeGhost.pos_x, placeGhost.pos_y, clsInfo.cls, clsInfo.ep, placeGhost.islandFlip, placeGhost.fitDx)
        }
        setPlaceGhost(null); setMode('select'); setArmedDef(null); setArmedDraft(null)
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
          // Full enclosure: every corner of the cabinet must be inside the box.
          return cabinetCornerPts(cab, wall, perp).every(p =>
            p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY)
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
    const clickable = mode !== 'draw_wall' && mode !== 'draw_island' && mode !== 'paste' && !currentPlaceInfo()
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

  function onSectionLinePointerDown(e: React.PointerEvent) {
    if (!sectionCut || e.button !== 0) return
    e.stopPropagation()
    svgPointerDownRef.current = true
    const svgP = svgCoords(e)
    const wp = toWorld(svgP.x, svgP.y)
    setSectionDrag({ offsetX: sectionCut.x1 - wp.x, offsetY: sectionCut.y1 - wp.y })
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

  const { handleEqualizeWidths, handleAlignLeft, handleAlignRight } = useMultiSelectOps({
    multiSelect, cabinets, walls, room, handleUpdateCabinet, setContextMenu,
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
    : sectionDrag ? 'grabbing'
    : (mode === 'draw_wall' || mode === 'draw_island' || mode === 'draw_section' || mode === 'measure' || mode === 'draw_benchtop' || mode === 'draw_benchtop_rect' || mode === 'draw_benchtop_l') ? 'crosshair'
    : (currentPlaceInfo() || mode === 'paste') ? 'cell'
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
    setArmedDef(null); setArmedDraft(null)
    setDrawStart(null); setPlaceGhost(null)
  }

  // Arm a library definition for placement (click in the sidebar). Re-clicking the
  // armed definition cancels. Replaces arming a class-based Mode.
  function armDefinition(def: CabinetDefinition) {
    if (mode === 'place_definition' && armedDef?.id === def.id) {
      setArmedDef(null); setArmedDraft(null); setMode('select')
    } else {
      setArmedDef({ id: def.id, assembly_class: def.assembly_class, dx: def.default_dx, dy: def.default_dy, dz: def.default_dz, name: def.name })
      setArmedDraft(buildDraftFromDefinition(def))
      setMode('place_definition')
    }
    setDrawStart(null); setPlaceGhost(null)
  }

  // Edits from the right-hand CabinetPanel patch the draft. Dimension changes also
  // sync the lightweight armedDef so the placement ghost reflects the new size.
  async function patchDraft(_id: string, patch: Partial<CabinetInstance>) {
    setArmedDraft(d => d ? { ...d, ...patch } : d)
    setArmedDef(a => {
      if (!a) return a
      const next = { ...a }
      if (typeof patch.dx === 'number') next.dx = patch.dx
      if (typeof patch.dy === 'number') next.dy = patch.dy
      if (typeof patch.dz === 'number') next.dz = patch.dz
      return next
    })
  }

  function cancelArm() {
    setArmedDef(null); setArmedDraft(null); setMode('select'); setPlaceGhost(null)
  }

  function switchView(v: CanvasView) {
    if (v === 'elevation' && elevWallId === null) {
      setElevWallId(selectedWall?.id ?? walls[0]?.id ?? null)
    }
    if (v !== 'plan') {
      setMode('select'); setDrawStart(null); setPlaceGhost(null); setContextMenu(null)
    }
    // Apply the destination view's default layer until the user takes manual control
    // of the Detail dropdown (plan/elevation are the only views with a layer system).
    if (!presetTouchedRef.current && (v === 'plan' || v === 'elevation')) {
      setDisplayConfig(applyPreset(getUserPrefs().drawingPresets[v]))
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
    : mode === 'measure'         ? (() => {
        const start = canvasView === 'elevation' ? elevMeasureStart : measureStart
        const end   = canvasView === 'elevation' ? elevMeasureEnd   : measureEnd
        return !start || end ? 'Measure: click first point · snaps to corners · Ctrl=ortho · Esc=exit' : 'Click second point · Ctrl=ortho · Shift=45° · right-click=clear'
      })()
    : mode === 'draw_section'     ? (!drawStart ? 'Click to set start of section cut · Esc=cancel' : 'Click to finish · Shift=45° snap · Esc=cancel')
    : mode === 'draw_wall'       ? (!drawStart ? 'Click to set start point · snap rings show existing endpoints' : 'Click to finish · Shift = 5° snap · or type in panel →')
    : mode === 'draw_island'     ? (!drawStart ? 'Click to set island start · Shift = 5° snap · Right-click = cancel' : 'Click to finish island · cabinets snap to either side')
    : mode === 'place_base'        ? 'Click near a wall to place base cabinet · Esc = cancel'
    : mode === 'place_wall_unit'   ? 'Click near a wall to place wall unit · Esc = cancel'
    : mode === 'place_tall'        ? 'Click near a wall to place tall cabinet · Esc = cancel'
    : mode === 'place_end_panel'   ? 'Click near a wall to place end panel · Esc = cancel'
    : mode === 'place_base_corner' ? 'Click near a wall to place base corner cabinet · Esc = cancel'
    : mode === 'place_wall_corner' ? 'Click near a wall to place wall corner unit · Esc = cancel'
    : mode === 'place_tall_corner' ? 'Click near a wall to place tall corner cabinet · Esc = cancel'
    : mode === 'place_definition'  ? `Click near a wall to place ${armedDef?.name ?? 'cabinet'} · Esc = cancel`
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
    displayConfig,
    setDisplayConfig: (next => { presetTouchedRef.current = true; setDisplayConfig(next) }) as typeof setDisplayConfig,
    setJobModalTab, setRoomModalTab,
    openReportModal: setReportScope,
    openObjectTree: () => setShowObjectTree(true),
    openRoomSwitcher: () => roomSwitcherRef.current?.openSwitcher(),
    openAddRoom: () => roomSwitcherRef.current?.openAdd(),
    projectId: project?.id ?? null,
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
          {(['plan', 'elevation', 'section', '3d'] as CanvasView[]).map(v => (
            <button key={v} onClick={() => switchView(v)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                canvasView === v
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}>
              {v === 'plan' ? 'Plan' : v === 'elevation' ? 'Elevation' : v === 'section' ? 'Section' : '3D'}
            </button>
          ))}
          {canvasView === '3d' && (
            <button
              onClick={() => setReset3DSignal(s => s + 1)}
              title="Reset 3D view"
              className="ml-2 px-2 py-1 text-xs rounded transition-colors bg-gray-700 text-gray-100 hover:bg-gray-600 border border-gray-500"
            >
              ⟲ Reset view
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {(canvasView === 'plan' || canvasView === 'elevation') && (
            <button
              onClick={() => onSelectMode('measure')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                mode === 'measure'
                  ? 'bg-amber-500 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-gray-700'
              }`}
            >
              📏 Measure
            </button>
          )}
          {canvasView === 'plan' && (
            <button
              onClick={() => onSelectMode('draw_section')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                mode === 'draw_section'
                  ? 'bg-amber-500 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-gray-700'
              }`}
            >
              Section Cut
            </button>
          )}
          <span className="text-[10px] text-gray-600 uppercase tracking-wider select-none">Detail</span>
          <select
            value={displayConfig.activePreset}
            onChange={e => {
              const val = e.target.value as PresetId
              presetTouchedRef.current = true
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
          room={room}
          onOpenRoomProperties={() => setRoomModalTab('details')}
          roomSwitcherRef={roomSwitcherRef}
          mode={mode}
          onSelectMode={onSelectMode}
          armedDefinitionId={armedDef?.id ?? null}
          onArmDefinition={armDefinition}
          libRefresh={libRefresh}
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
            <div className="relative flex-1 flex min-w-0">
            <CanvasSVG
              svgRef={svgRef}
              walls={walls}
              cabinets={cabinets}
              view={view}
              svgSize={svgSize}
              selected={selected}
              mode={mode}
              armedDef={armedDef}
              resolvedParts={visibleResolvedParts}
              onCanvasDrop={dropDefinitionAt}
              displayConfig={displayConfig}
              drawStart={drawStart}
              drawCursor={drawCursor}
              drawThickness={drawThickness}
              placeGhost={placeGhost}
              clipboard={clipboard}
              clipboardGroup={clipboardGroup}
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
              sectionCut={sectionCut}
              onSectionFlipLook={() => setSectionCut(c => c ? { ...c, lookDir: (-c.lookDir) as 1 | -1 } : null)}
              onSectionClear={() => setSectionCut(null)}
              onSectionLinePointerDown={onSectionLinePointerDown}
              snapResult={snapResult}
              measureStart={measureStart}
              measureEnd={measureEnd}
              measureCursor={measureCursor}
              onMeasureCancel={() => { setMeasureStart(null); setMeasureEnd(null); setMeasureCursor(null); setSnapResult(null) }}
            />
              <SnapToolbar settings={snapSettings} onChange={updateSnapSettings} kinds={SNAP_KINDS} meta={SNAP_KIND_META} />
            </div>
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
            armedDef={armedDef}
            canEqualize={canEqualize}
            mode={mode}
            clipboard={clipboard}
            clipboardGroup={clipboardGroup}
            onSelectCabinet={id => { setSelected({ type: 'cabinet', id }); setMultiSelect([]); setCabResize(null) }}
            onSelectWall={id => setSelected({ type: 'wall', id })}
            onSetElevWall={setElevWallId}
            elevWallSide={elevWallSide}
            onSetElevWallSide={setElevWallSide}
            onUpdateCabinet={handleUpdateCabinet}
            onPlaceAtWall={async (wall, pos_x, pos_y, dx) => {
              if (mode === 'paste' && clipboard) {
                if (clipboardGroup.length > 1) await pasteGroupAt(wall, pos_x, pos_y, elevWallSide === 'back')
                else await pasteCabinet(wall, pos_x, pos_y, elevWallSide === 'back')
              } else {
                const clsInfo = currentPlaceInfo()
                if (clsInfo?.definitionId && armedDraft) await placeFromDraft(armedDraft, wall, pos_x, pos_y, elevWallSide === 'back', dx)
                else if (clsInfo) await placeCabinet(wall, pos_x, pos_y, clsInfo.cls, clsInfo.ep, elevWallSide === 'back', dx)
              }
              setMode('select'); setArmedDef(null); setArmedDraft(null)
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
            onMarqueeSelect={ids => {
              if (ids.length >= 2) {
                setMultiSelect(ids)
                setSelected({ type: 'cabinet', id: ids[0] })
              } else if (ids.length === 1) {
                setSelected({ type: 'cabinet', id: ids[0] })
                setMultiSelect([])
              }
            }}
            onEqualizeWidths={handleEqualizeWidths}
            cabResize={cabResize}
            onCabResizeStart={r => { setSelected({ type: 'cabinet', id: r.cabId }); setMultiSelect([]); setCabResize(r) }}
            onCabResizeUpdate={updates => setCabResize(r => r ? { ...r, ...updates } : r)}
            onCabResizeDone={() => setCabResize(null)}
            resolvedParts={visibleResolvedParts}
            elevSnapSettings={elevSnapSettings}
            onElevSnapSettingsChange={updateElevSnapSettings}
            elevSnapResult={elevSnapResult}
            setElevSnapResult={setElevSnapResult}
            elevMeasureStart={elevMeasureStart}
            elevMeasureEnd={elevMeasureEnd}
            elevMeasureCursor={elevMeasureCursor}
            setElevMeasureStart={setElevMeasureStart}
            setElevMeasureEnd={setElevMeasureEnd}
            setElevMeasureCursor={setElevMeasureCursor}
            onDeselect={() => setSelected(null)}
            onSeamClick={(cabId) => {
              setSelected({ type: 'cabinet', id: cabId })
              setMultiSelect([])
              setEditCabInitialView('joints')
              setEditCabId(cabId)
            }}
          />
        )}

        {canvasView === 'section' && (
          <SectionSVG
            walls={walls}
            cabinets={cabinets}
            room={room}
            sectionCut={sectionCut}
            onFlipLook={() => setSectionCut(c => c ? { ...c, lookDir: (-c.lookDir) as 1 | -1 } : null)}
            onClearCut={() => { setSectionCut(null); switchView('plan') }}
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
            resolvedParts={visibleResolvedParts}
            materialColours={matColours}
            ebByMatId={ebByMatId}
            cameraStateRef={camera3DStateRef}
            resetSignal={reset3DSignal}
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
        {/* Armed library definition → editable draft panel (takes precedence). Edits
            apply to the cabinet that will be placed; no wall yet, so wall-position is hidden. */}
        {mode === 'place_definition' && armedDraft && (
          <CabinetPanel
            key={armedDraft.cabinet_definition_id ?? armedDraft.id}
            cabinet={armedDraft}
            wall={null}
            wallCabinets={[]}
            room={room}
            onUpdate={patchDraft}
            onDelete={async () => cancelArm()}
            hideWallPosition
            autoFocusWidth
          />
        )}
        {mode !== 'place_definition' && selectedCab && (!cabResize || cabResize.cabId !== selectedCab.id) && (
          <CabinetPanel
            key={selectedCab.id}
            cabinet={selectedCab}
            wall={walls.find(w => w.id === selectedCab.wall_id) ?? null}
            wallCabinets={cabinets.filter(c => c.wall_id === selectedCab.wall_id)}
            room={room}
            onUpdate={handleUpdateCabinet}
            onDelete={handleDeleteCabinet}
            autoFocusWidth
          />
        )}
        {mode !== 'place_definition' && selectedBenchtop && (
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
              setClipboardGroup([])
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
                  .filter(c => c.wall_id === raw.wall.id && cabsBlock(cab, c, raw.wall, room) && cabWallSide(c, raw.wall) === copySide)
                  .map(c => ({ t: cabT(c, raw.wall), dx: c.dx }))
                const t = findFreeSlot(desired, cab.dx, raw.wall.length, occupied)
                setPlaceGhost({ wall: raw.wall, pos_x: raw.wall.pos_x + t * wd.x, pos_y: raw.wall.pos_y + t * wd.y, islandFlip: copyFlip, freePos: mouseWorld })
              } else {
                setPlaceGhost(null)
              }
            },
            onPaste: () => { if (clipboard) { setClipboardGroup([]); setMode('paste') } },
            onEdit: id => setEditCabId(id),
            onEqualizeWidths: handleEqualizeWidths,
            onAlignLeft: handleAlignLeft,
            onAlignRight: handleAlignRight,
            onSplit: id => { setContextMenu(null); setSplitCabId(id) },
            onSaveToLibrary: id => { setContextMenu(null); setSaveLibCabId(id) },
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
            onHiddenChange={(cabinetId, hidden) => setResolvedParts(m => {
              const r = m.get(cabinetId)
              if (!r) return m
              return new Map(m).set(cabinetId, { ...r, hidden_parts: hidden })
            })}
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

      {saveLibCabId && (() => {
        const cab = cabinets.find(c => c.id === saveLibCabId)
        if (!cab) return null
        return (
          <SaveToLibraryModal
            cab={cab}
            onClose={() => setSaveLibCabId(null)}
            onSaved={(_id, savedName) => { setSaveLibCabId(null); setLibRefresh(v => v + 1); setToast(`Saved “${savedName}” to library`) }}
          />
        )
      })()}

      {toast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[60] bg-gray-800 border border-gray-700 text-gray-100 text-sm px-4 py-2 rounded-lg shadow-xl pointer-events-none">
          {toast}
        </div>
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

      {showObjectTree && (
        <ObjectTreeModal
          room={room}
          walls={walls}
          cabinets={cabinets}
          resolvedParts={resolvedParts}
          onUpdateCabinet={handleUpdateCabinet}
          onClose={() => setShowObjectTree(false)}
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
