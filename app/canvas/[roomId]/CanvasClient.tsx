'use client'

import { useState, useRef, useEffect, useCallback, useReducer, useMemo } from 'react'
import { supabase } from '@/src/lib/supabase'
import { useIsAdmin } from '@/src/lib/useRole'
import { Project, Room, Wall, CabinetInstance, CabinetDefinition, AssemblyClass, DEFAULT_DIMS, BenchtopInstance, BenchtopSegment, RoomFixture, FixtureCatalogItem } from '@/src/lib/types'
import {
  Pt, MIN_ZOOM, MAX_ZOOM, MIN_WALL_LEN, SNAP_PX, WALL_SNAP_PX,
  toDeg, dist,
  wallEnd, wallDir,
  snapAngle,
  nearestWall, findFreeSlot, slideToFreeSlot, fitFreeSlot, cabsBlock, cabT, nextLabel,
  centroid, wallInwardNormal, cabWallPerp, cabWallSide, cabinetCornerPts, wallAnchorPoint,
} from '@/src/lib/geometry'
import { waterfallLegs, waterfallOccupancy } from '@/src/lib/waterfallObstacles'
import { btSegments, effectiveProfileId } from '@/src/lib/benchtopGeometry'
import { btPosition, wallFrame, btOverhangs } from '@/src/lib/benchtopAnchor'
import { isEndpointUpdate, computeJointUpdates } from '@/src/lib/wallJoints'
import { dbSaveWall, dbUpdateWall, dbDeleteWall, dbInsertCabinet, dbResolveAndPersistCabinet, dbUpdateCabinet, dbDeleteCabinet, dbLoadCabinetDefinition, buildInstanceFromDefinition, dbInsertDefinitionParts, dbMigrateLegacyKickMembers, type KickRunMutation } from './canvasDB'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { usePinchZoom } from './usePinchZoom'
import { resolveClassDims, shopDimsFromSettings, type ShopDimDefaults } from '@/src/lib/resolver/resolveClassDims'
import { filterHiddenParts } from '@/src/lib/resolver/filterHidden'
import { invalidateResolverCaches } from '@/src/lib/resolver/resolveCabinetFromDB'
import { useCanvasHistory } from './useCanvasHistory'
import { useMaterialColours } from './useMaterialColours'
import { useCabinetOps } from './useCabinetOps'
import { useMultiSelectOps } from './useMultiSelectOps'
import { useKickRunOps } from './useKickRunOps'
import { buildMenus } from './canvasMenuConfig'
import {
  Mode, ArmedDefinition, Selected, CanvasView, ViewState, ViewAction, PlaceGhost, CabDrag, CabMoveDrag, CabResize, ContextMenuState, SectionCut,
  viewReducer, placeInfoFor, isBenchtopMode, MIN_STRETCH,
} from './canvasTypes'
import { useBenchtopInteraction } from './useBenchtopInteraction'
import { useFixtureInteraction } from './useFixtureInteraction'
import FixturesPlan from './FixturesPlan'
import FixturePanel from './FixturePanel'
import FixtureViewModal from './FixtureViewModal'
import { withFixtureCutouts, benchtopAt } from '@/src/lib/fixtureGeometry'
import { useLayerSets } from '@/src/lib/displayLayers/useLayerSets'
import { resolveLayerView } from '@/src/lib/displayLayers/resolve'
import { findLayerSet } from '@/src/lib/displayLayers/legacy'
import type { LayerSet } from '@/src/lib/displayLayers/registry'
import LayerManagerPanel from './LayerManagerPanel'
import CanvasMenubar from './CanvasMenubar'
import CanvasSidebar from './CanvasSidebar'
import CanvasSVG from './CanvasSVG'
import ElevationSVG from './ElevationSVG'
import SectionSVG from './SectionSVG'
import CanvasContextMenu from './CanvasContextMenu'
import { buildContextMenuGroups } from './canvasContextItems'
import ConfirmDeleteModal from '@/src/components/ConfirmDeleteModal'
import SplitCabinetModal from './SplitCabinetModal'
import SaveToLibraryModal from './SaveToLibraryModal'
import ReplaceCabinetModal from './ReplaceCabinetModal'
import KickRunSettingsModal from './KickRunSettingsModal'
import DrawingPanel, { type DrawingPanelHandle } from './DrawingPanel'
import BenchtopDrawPanel, { type BenchtopDrawPanelHandle } from './BenchtopDrawPanel'
import WallDrawPanel from './WallDrawPanel'
import WallPanel from './WallPanel'
import CabinetPanel from './CabinetPanel'
import CabinetGroupPanel from './CabinetGroupPanel'
import CabinetResizePanel from './CabinetResizePanel'
import CabinetEditModal from './CabinetEditModal'
import JobPropertiesModal, { type JobPropertiesTab } from './JobPropertiesModal'
import RoomPropertiesModal, { type RoomPropertiesTab } from './RoomPropertiesModal'
import { type RoomSwitcherHandle } from './RoomSwitcher'
import ObjectTreeModal from './ObjectTreeModal'
import ReportsModal, { type ReportScope } from './ReportsModal'
import Room3DScene, { type Camera3DState } from './Room3DScene'
import BenchtopPanel from './BenchtopPanel'
import BenchtopShapeEditPanel, { SaveShapePrompt } from './BenchtopShapeEditPanel'
import BenchtopEdgeEditPanel from './BenchtopEdgeEditPanel'
import { edgeTape } from '@/src/lib/benchtopEdgeband'
import { useBenchtopCatalog } from './useBenchtopCatalog'
import dynamic from 'next/dynamic'
import SnapToolbar from './SnapToolbar'
import { getUserPrefs, setUserPrefs, type PlanGridPrefs, type ViewStyle, type WallDrawPrefs } from '@/src/lib/userPrefs'
import { wheelZoomFactor } from '@/src/lib/wheelZoom'
import { computeSnap, cabinetCorners, SNAP_KINDS, SNAP_KIND_META, type SnapSettings, type SnapResult } from '@/src/lib/canvasSnap'
import { type ElevSnapSettings, type ElevSnapResult } from '@/src/lib/elevationSnap'
import { benchtopSeedFromCabinets, btFrontOverhang } from '@/src/lib/benchtopSeed'
import { loadRoomHandleSchedule } from '@/src/lib/resolver/loadCabinetInput'

// Shape Editor overlay is client-only and heavy — load it when first opened.
const BenchtopShapeEditor = dynamic(() => import('./BenchtopShapeEditor'), { ssr: false })

export default function CanvasClient({ project: initProject, room: initRoom, walls: initWalls, initialCabinets, initialBenchtops, initialFixtures }: {
  project: Project | null
  room: Room
  walls: Wall[]
  initialCabinets: CabinetInstance[]
  initialBenchtops: BenchtopInstance[]
  initialFixtures?: RoomFixture[]
}) {
  const [project, setProjectState] = useState<Project | null>(initProject)
  const [room, setRoomState] = useState<Room>(initRoom)
  // Shop-level cabinet size defaults (lowest cascade level above the system
  // constant). Loaded once; null until fetched / when no shop_settings row.
  const [shopDims, setShopDims] = useState<ShopDimDefaults | null>(null)
  useEffect(() => {
    let cancelled = false
    supabase.from('shop_settings')
      .select('default_base_dy, default_base_dz, default_wall_dy, default_wall_dz, default_tall_dy, default_tall_dz')
      .limit(1).maybeSingle()
      .then(({ data }) => { if (!cancelled) setShopDims(shopDimsFromSettings(data)) })
    return () => { cancelled = true }
  }, [])
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
  // Wall draw tool settings (chain / thickness / angle snap), remembered per user.
  const [wallDraw, setWallDrawState] = useState<WallDrawPrefs>(() => getUserPrefs().wallDraw)
  const updateWallDraw = useCallback((patch: Partial<WallDrawPrefs>) => {
    setWallDrawState(prev => { const next = { ...prev, ...patch }; setUserPrefs({ wallDraw: next }); return next })
  }, [])
  const drawThickness = wallDraw.thickness
  const setDrawThickness = useCallback((v: number) => updateWallDraw({ thickness: v }), [updateWallDraw])
  const [drawSoffit, setDrawSoffit] = useState<number | null>(null)
  const [drawStart, setDrawStart] = useState<Pt | null>(null)
  // Chained wall drawing: first point of the chain (click it again to close the
  // loop) and how many walls the current chain has placed.
  const chainStartRef = useRef<Pt | null>(null)
  const [chainCount, setChainCount] = useState(0)
  const drawStartRef = useRef<Pt | null>(null)
  drawStartRef.current = drawStart
  const wallDrawRef = useRef(wallDraw)
  wallDrawRef.current = wallDraw
  const [drawCursor, setDrawCursor] = useState<Pt | null>(null)
  const [placeGhost, setPlaceGhost] = useState<PlaceGhost | null>(null)
  const [cabDrag, setCabDrag] = useState<CabDrag | null>(null)
  const [cabResize, setCabResize] = useState<CabResize | null>(null)
  // Esc in Edit shape with unsaved changes → ask to save (Mark 2026-10-12).
  const [btSavePrompt, setBtSavePrompt] = useState(false)
  // Edit edges: hovering an edge in the panel drawing lights it on the plan (Phase 7b).
  const [btEdgeHover, setBtEdgeHover] = useState<{ btId: string; i: number } | null>(null)
  const [cabMoveDrag, setCabMoveDrag] = useState<CabMoveDrag | null>(null)
  const [cabFollowing, setCabFollowing] = useState<{ id: string; assemblyClass: string } | null>(null)
  const [multiSelect, setMultiSelect] = useState<string[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [deleteWallPending, setDeleteWallPending] = useState<string | null>(null)
  const [deleteCabsPending, setDeleteCabsPending] = useState<string[] | null>(null)
  const [splitCabId, setSplitCabId] = useState<string | null>(null)
  const [saveLibCabId, setSaveLibCabId] = useState<string | null>(null)
  const isAdmin = useIsAdmin()   // testers can't write the shared library
  const [replaceCabId, setReplaceCabId] = useState<string | null>(null)
  const [kickSettingsRunId, setKickSettingsRunId] = useState<string | null>(null)
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
  // Display layer sets (z_display_layers spec): ONE active set drives plan,
  // elevation and 3D (each set carries per-view item settings). The choice is
  // remembered per user.
  const layerSetsApi = useLayerSets()
  const [layerSetPref, setLayerSetPref] = useState(() => getUserPrefs().layerSetId)
  const activeLayerSet = findLayerSet(layerSetsApi.sets, layerSetPref)
  function chooseLayerSet(id: string) {
    setLayerSetPref(id)
    setUserPrefs({ layerSetId: id })
  }
  const [showLayerManager, setShowLayerManager] = useState(false)
  // Set being edited in the Layer Manager — previewed live on the canvas.
  const [layerPreview, setLayerPreview] = useState<LayerSet | null>(null)
  const shownLayerSet = layerPreview ?? activeLayerSet
  const planLayers = useMemo(() => resolveLayerView(shownLayerSet, 'plan'),      [shownLayerSet])
  const elevLayers = useMemo(() => resolveLayerView(shownLayerSet, 'elevation'), [shownLayerSet])
  const layers3D   = useMemo(() => resolveLayerView(shownLayerSet, '3d'),        [shownLayerSet])
  const [jobModalTab, setJobModalTab]   = useState<JobPropertiesTab | null>(null)
  const [roomModalTab, setRoomModalTab] = useState<RoomPropertiesTab | null>(null)
  const [showObjectTree, setShowObjectTree] = useState(false)
  const [reportScope, setReportScope] = useState<ReportScope | null>(null)
  const [editCabId, setEditCabId] = useState<string | null>(null)
  const [viewFixtureId, setViewFixtureId] = useState<string | null>(null)
  const [editCabInitialView, setEditCabInitialView] = useState<'3d' | 'elevation' | 'joints'>('elevation')
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [benchtops, setBenchtops] = useState<BenchtopInstance[]>(initialBenchtops)
  const [fixtures, setFixtures] = useState<RoomFixture[]>(initialFixtures ?? [])
  const [sectionCut, setSectionCut] = useState<SectionCut | null>(null)
  const [sectionDrag, setSectionDrag] = useState<{ offsetX: number; offsetY: number } | null>(null)
  // Plan reference grid (dots). Per-user, persisted to localStorage.
  const [planGrid, setPlanGridState] = useState<PlanGridPrefs>(() => getUserPrefs().planGrid)
  // Room 3D solid / wire (3D tab dropdown), remembered per user.
  const [room3DStyle, setRoom3DStyleState] = useState<ViewStyle>(() => getUserPrefs().room3DStyle)
  const [view3DMenuOpen, setView3DMenuOpen] = useState(false)
  function setRoom3DStyle(v: ViewStyle) {
    setRoom3DStyleState(v)
    setUserPrefs({ room3DStyle: v })
  }
  useEffect(() => {
    if (!view3DMenuOpen) return
    const close = () => setView3DMenuOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [view3DMenuOpen])
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

  const setPlanGrid = useCallback((next: PlanGridPrefs) => {
    setPlanGridState(next)
    setUserPrefs({ planGrid: next })
  }, [])
  const updateSnapSettings = useCallback((next: SnapSettings) => {
    setSnapSettingsState(next)
    setUserPrefs({ snapSettings: next })
  }, [])
  const updateElevSnapSettings = useCallback((next: ElevSnapSettings) => {
    setElevSnapSettingsState(next)
    setUserPrefs({ elevSnapSettings: next })
  }, [])

  const { captureSnapshot, handleUndo, handleRedo, wallsRef, cabinetsRef, canUndo, canRedo } =
    useCanvasHistory(walls, cabinets, benchtops, setWalls, setCabinets, setBenchtops, setSelected, fixtures, setFixtures)

  const {
    resolvedParts, setResolvedParts,
    matColours, ebByMatId,
    applyInputColours, applyInputEdgebands,
  } = useMaterialColours(initialCabinets)

  // Opening the edit modal live re-resolves that cabinet: the page-load map
  // (dbLoadResolvedParts) rebuilds seam joints only from per-cabinet overrides —
  // construction-method joint defaults and slide hardware aren't reconstructable
  // there — so without this the modal's Top/Elevation/Side/3D under-report
  // drilling on untouched cabinets.
  useEffect(() => {
    if (!editCabId) return
    let cancelled = false
    dbResolveAndPersistCabinet(editCabId).then(resolved => {
      if (!cancelled && resolved) setResolvedParts(m => new Map(m).set(editCabId, resolved))
    })
    return () => { cancelled = true }
  }, [editCabId, setResolvedParts])

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
  const btDrawPanelRef = useRef<BenchtopDrawPanelHandle>(null)
  const roomSwitcherRef = useRef<RoomSwitcherHandle>(null)

  const btCatalog = useBenchtopCatalog(room, project)
  const fx = useFixtureInteraction({
    room, walls, fixtures, setFixtures, mode, setMode, selected, setSelected, captureSnapshot,
    benchTopAt: p => { const b = benchtopAt(benchtops, p); return b ? btInfo(b).topZ : null },
  })
  // Benchtops as drawn: own cutouts + sink / cooktop cutouts from the fixtures on
  // them (z_fixtures P3). Render-only — state and saves keep the stored outline.
  const benchtopsDrawn = useMemo(() => benchtops.map(b => withFixtureCutouts(b, fixtures)), [benchtops, fixtures])
  const bt = useBenchtopInteraction({
    room, walls, cabinets,
    benchtops, setBenchtops,
    mode, zoom: view.zoom,
    svgRef, svgPointerDownRef, ctrlRef, shiftRef,
    selected,
    setSelected, setContextMenu, setMode,
    captureSnapshot,
    snapSettings, setSnapResult,
    defaultJoinType: b => btCatalog.methodFor(b)?.default_join_type ?? 'butt',
  })

  // F4 Benchtop mode owns selection: entering it drops a cabinet / wall
  // selection, leaving it drops a benchtop one (adjusted during render, so no
  // stale panel flashes). The cabinets selected on the way in are kept as the
  // footprint for F4 → Draw in Shape Editor.
  const [selModeSide, setSelModeSide] = useState(isBenchtopMode(mode))
  const [btSeedCabIds, setBtSeedCabIds] = useState<string[]>([])
  if (selModeSide !== isBenchtopMode(mode)) {
    const bm = isBenchtopMode(mode)
    setSelModeSide(bm)
    setBtSeedCabIds(bm ? [...new Set([...multiSelect, ...(selected?.type === 'cabinet' ? [selected.id] : [])])] : [])
    if (selected && (selected.type === 'benchtop') !== bm) setSelected(null)
    if (bm && multiSelect.length) setMultiSelect([])
  }


  // Benchtop height + thickness for elevation / 3D (Phase 3b, P-g): a top SITS ON
  // the base cabinets — its underside is the base-height cascade (room → job →
  // shop) unless the top overrides it; the surface is that + its thickness.
  const btBaseHeight = resolveClassDims('base', { room, project, shop: shopDims }).dy
  const btInfo = (b: BenchtopInstance) => {
    const thick = btCatalog.thicknessFor(b)
    return { topZ: (b.height_mm ?? btBaseHeight) + thick.total, thick, defaultProfileId: btCatalog.defaultProfileIdFor(b) }
  }
  // Edit edges (Phase 7b): the editing top's default tape + profile lookup, for painting.
  const edgeEditBt = bt.edgeEdit ? benchtops.find(b => b.id === bt.edgeEdit!.btId) ?? null : null
  const btEdgeAux = edgeEditBt ? {
    defaultTape: btCatalog.tapeContextFor(edgeEditBt).defaultTape,
    profileOf: (s: BenchtopSegment) => {
      const pid = effectiveProfileId(s, btCatalog.defaultProfileIdFor(edgeEditBt))
      return pid ? btCatalog.profileById[pid] : undefined
    },
  } : null
  // Right-click → Edit edges (or the panel button). The tape chip starts on the
  // schedule tape, else the first tape already on the top.
  const startEdgeEdit = (id: string) => {
    const b = benchtops.find(x => x.id === id)
    if (!b) return
    if (canvasView !== 'plan') switchView('plan')
    const ctx = btCatalog.tapeContextFor(b)
    const def = btCatalog.defaultProfileIdFor(b)
    const firstTape = btSegments(b).map(s => {
      const pid = effectiveProfileId(s, def)
      return edgeTape(s, pid ? btCatalog.profileById[pid] : undefined, ctx.defaultTape)
    }).find((t): t is string => !!t) ?? null
    bt.startEdgeEdit(id, 'profile', ctx.defaultTape ?? firstTape)
  }

  // Waterfall legs block cabinets (place / move / stretch) like another unit would.
  const wfLegs = waterfallLegs(benchtops, btInfo, btCatalog.profileById)
  const wfOcc = (w: Wall, side: 'face' | 'back', mover: { assembly_class: string; dy: number; dz?: number }) =>
    waterfallOccupancy(wfLegs, w, side, centroid(walls), room, mover)

  // F4 → Draw in Shape Editor. Starting outline = the selected base cabinets'
  // plan outlines merged, fronts (angled facets too) pushed out by the front
  // overhang — 40 with handles, 25 with finger pulls (z_cabinet_shape 4c).
  // Falls back to their bbox, else 1200 × 600 at the middle of the view.
  async function drawBenchtopInShapeEditor() {
    const ids = new Set([...multiSelect, ...(selected?.type === 'cabinet' ? [selected.id] : []), ...btSeedCabIds])
    const cx = centroid(walls)
    const picked = cabinets.filter(c => ids.has(c.id))
    const bases = picked.filter(c => !c.is_kick_assembly && (c.assembly_class === 'base' || c.assembly_class === 'base_corner'))
    const under = (bases.length ? bases : picked).flatMap(c => {
      const w = walls.find(x => x.id === c.wall_id)
      return w ? [{ cab: c, wall: w, perp: cabWallPerp(c, w, wallInwardNormal(w, cx)) }] : []
    })
    if (under.length) {
      const oh = btFrontOverhang(await loadRoomHandleSchedule(room.id, project?.id).catch(() => ({})))
      const segs = benchtopSeedFromCabinets(under, oh)
      if (segs) {
        setMultiSelect([])
        bt.openNewInShapeEditor(segs)
        return
      }
    }
    const pts = under.flatMap(u => cabinetCorners(u.cab, u.wall, cx))
    let seed: Pt[]
    if (pts.length) {
      const x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x))
      const y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y))
      seed = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
    } else {
      const c = { x: (svgSize.w / 2 - view.panX) / view.zoom, y: (svgSize.h / 2 - view.panY) / view.zoom }
      seed = [{ x: c.x - 600, y: c.y - 300 }, { x: c.x + 600, y: c.y - 300 }, { x: c.x + 600, y: c.y + 300 }, { x: c.x - 600, y: c.y + 300 }]
    }
    setMultiSelect([])
    bt.openNewInShapeEditor(seed)
  }

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
      const factor = wheelZoomFactor(e)
      dispatchView({ type: 'zoom', factor, svgX: e.clientX - r.left, svgY: e.clientY - r.top })
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [canvasView])

  usePinchZoom(svgRef, dispatchView, canvasView === 'plan')

  // Reset interaction state on every mount — handles the Next.js router cache
  // case where the component is reused with stale mode/drawStart.
  useEffect(() => {
    setMode('select')
    setDrawStart(null)
    setDrawCursor(null)
    setPlaceGhost(null)
    svgPointerDownRef.current = false
  }, [])

  // Changing wall resets to the face side, unless the switch asked for a side
  // (opening elevation on a selected back-face cabinet).
  const pendingElevSideRef = useRef<'face' | 'back' | null>(null)
  useEffect(() => {
    setElevWallSide(pendingElevSideRef.current ?? 'face')
    pendingElevSideRef.current = null
  }, [elevWallId])

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

  // Esc is two-stage: first press cancels whatever is in progress (stretch, move,
  // draw, armed placement, menu); a press with nothing in progress deselects.
  // Read through a ref so the keydown closure (deps [selected, mode]) sees it fresh.
  const escBusyRef = useRef(false)
  escBusyRef.current = !!(cabResize || cabFollowing || cabMoveDrag || drawStart || armedDef || contextMenu || measureStart || fx.carry)

  useEffect(() => {
    const isInput = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement
    const kd = (e: KeyboardEvent) => {
      if (e.key === ' ' && !isInput(e.target)) { spaceRef.current = true; e.preventDefault() }
      if (e.key === 'Shift') shiftRef.current = true
      if (e.key === 'Control') ctrlRef.current = true
      if (e.key === 'Tab' && mode === 'draw_wall' && drawStartRef.current && !isInput(e.target)) {
        e.preventDefault(); drawingPanelRef.current?.focusLength()
      }
      // Chained walls: Esc ends the chain but keeps the wall tool armed;
      // a second Esc (nothing in progress) leaves the tool.
      if (e.key === 'Escape' && mode === 'draw_wall' && drawStartRef.current && wallDrawRef.current.chain && !isInput(e.target)) {
        endWallChain(); return
      }
      // Benchtop quick-draw: Tab jumps into the size fields (BenchtopDrawPanel).
      if (e.key === 'Tab' && (mode === 'draw_benchtop' || mode === 'draw_benchtop_rect' || mode === 'draw_benchtop_l' || mode === 'draw_benchtop_u') && !isInput(e.target)) {
        e.preventDefault(); btDrawPanelRef.current?.focusFirst()
      }
      // F2 / F3 / F4 behave identically: open / close that sidebar section only.
      // A section lights up once one of its tools is picked (z_sidebar spec §2).
      if (e.key === 'F2' && !isInput(e.target)) {
        e.preventDefault()
        setWallMenuOpen(v => !v)
      }
      if (e.key === 'F3' && !isInput(e.target)) {
        e.preventDefault()
        setCabMenuOpen(v => !v)
      }
      if (e.key === 'F4' && !isInput(e.target)) {
        e.preventDefault()
        bt.setBenchtopMenuOpen(v => !v)
      }
      // F6 Fixtures & appliances (z_fixtures). R turns a free-floating carried item;
      // M picks up the selected fixture.
      if (e.key === 'F6' && !isInput(e.target)) {
        e.preventDefault()
        fx.setMenuOpen(v => !v)
      }
      if ((e.key === 'r' || e.key === 'R') && mode === 'place_fixture' && !e.ctrlKey && !e.metaKey && !isInput(e.target)) {
        e.preventDefault(); fx.rotateCarry()
      }
      if ((e.key === 'm' || e.key === 'M') && selected?.type === 'fixture' && mode === 'select' && !e.ctrlKey && !e.metaKey && !isInput(e.target)) {
        e.preventDefault(); fx.startMove(selected.id)
      }
      if (e.key === 'a' && !isInput(e.target) && (mode === 'draw_benchtop') && bt.btDrawPoly.length > 0) {
        e.preventDefault()
        bt.toggleArcMode()
      }
      // In-plan shape edit (Phase 6): Enter saves, Ctrl+Z steps back inside the edit, Delete removes the picked corner.
      if (mode === 'edit_benchtop_shape' && !isInput(e.target)) {
        if (e.key === 'Escape') {
          e.preventDefault()
          if (bt.shapeStretch) bt.cancelStretch()            // first Esc: drop the stretch
          else if (bt.shapeEdit?.history.length) setBtSavePrompt(true)
          else bt.cancelShapeEdit()
          return
        }
        if (e.key === 'Enter') { e.preventDefault(); bt.commitShapeEdit(); return }
        if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); bt.shapeEditUndo(); return }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          const sel = bt.shapeEdit?.sel
          if (sel?.kind === 'v') bt.shapeOps.deleteCorner(sel.i)
          return
        }
      }
      // Edit edges (Phase 7b): Enter saves, Esc asks if anything changed, Ctrl+Z steps back inside.
      if (mode === 'edit_benchtop_edges' && !isInput(e.target)) {
        if (e.key === 'Escape') { e.preventDefault(); if (bt.edgeEdit?.history.length) setBtSavePrompt(true); else bt.cancelEdgeEdit(); return }
        if (e.key === 'Enter') { e.preventDefault(); bt.commitEdgeEdit(); return }
        if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); bt.edgeEditUndo(); return }
      }
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey && !isInput(e.target)) { e.preventDefault(); void handleUndo() }
      if (((e.key === 'y' || e.key === 'Y') && (e.ctrlKey || e.metaKey) && !isInput(e.target)) || ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && e.shiftKey && !isInput(e.target))) { e.preventDefault(); void handleRedo() }
      if (e.key === 'Escape' && !isInput(e.target)) fx.cancel()
      if (e.key === 'Escape') { if (!escBusyRef.current && !isInput(e.target) && (mode === 'select' || mode === 'benchtop_select')) setSelected(null); setCabResize(null); setCabFollowing(null); setCabMoveDrag(null); setMultiSelect([]); setMode(isBenchtopMode(mode) && mode !== 'benchtop_select' ? 'benchtop_select' : 'select'); setArmedDef(null); setArmedDraft(null); setDrawStart(null); setDrawCursor(null); setPlaceGhost(null); setContextMenu(null); setMarquee(null); marqueeStartRef.current = null; bt.resetDraw(); setDeleteWallPending(null); setDeleteCabsPending(null); setMeasureStart(null); setMeasureEnd(null); setMeasureCursor(null); setSnapResult(null) }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput(e.target)) {
        if (mode === 'draw_benchtop' && e.key === 'Backspace') { bt.undoVertex(); return }
        if (selected?.type === 'cabinet') handleDeleteCabinet(selected.id)
        if (selected?.type === 'wall') handleDeleteWall(selected.id)
        if (selected?.type === 'benchtop') void bt.handleDeleteBenchtop(selected.id)
        if (selected?.type === 'fixture') void fx.remove(selected.id)
      }
    }
    const ku = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceRef.current = false
      if (e.key === 'Shift') shiftRef.current = false
      if (e.key === 'Control') ctrlRef.current = false
    }
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [selected, mode, bt.shapeEdit, bt.shapeStretch])

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
    // FK sets the anchor null; the benchtop hook re-anchors the top to another wall.
    setBenchtops(bs => bs.map(b => b.wall_id === id ? { ...b, wall_id: null } : b))
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
      const soffit = updatedWall.soffit_height ?? room.soffit_height
      const wcTop = soffit != null
        ? wallH - soffit
        : room.wall_cabinet_top ?? 2100
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

  // Apply a kick-run mutation to the canvas: add/remove the standalone kick
  // assembly cabinet, patch its geometry, and merge re-resolved members.
  const applyKickMutation = useCallback((m: KickRunMutation) => {
    if (m.addedAssembly) {
      const asm = m.addedAssembly
      setCabinets(cs => cs.some(c => c.id === asm.id) ? cs : [...cs, asm])
    }
    if (m.assemblyPatch) {
      const { id, u } = m.assemblyPatch
      setCabinets(cs => cs.map(c => c.id === id ? { ...c, ...u } : c))
    }
    if (m.memberPatches && m.memberPatches.length > 0) {
      const byId = new Map(m.memberPatches.map(p => [p.id, p.u]))
      setCabinets(cs => cs.map(c => byId.has(c.id) ? { ...c, ...byId.get(c.id)! } : c))
    }
    if (m.removedCabinetIds.length > 0) {
      setCabinets(cs => cs.filter(c => !m.removedCabinetIds.includes(c.id)))
      setResolvedParts(rp => { const next = new Map(rp); for (const rid of m.removedCabinetIds) next.delete(rid); return next })
    }
    if (m.resolved.size > 0) {
      setResolvedParts(rp => { const next = new Map(rp); for (const [cid, rc] of m.resolved) next.set(cid, rc); return next })
      for (const cid of m.resolved.keys()) { applyInputColours(cid); applyInputEdgebands(cid) }
    }
  }, [applyInputColours, applyInputEdgebands])

  const { handleJoinKicks, handleDetachKickSingle, handleSeparateKicks } = useKickRunOps({
    cabinets, walls, room, setCabinets, applyKickMutation, setContextMenu,
  })

  // Library, shop and job settings can be edited on other routes while these
  // module-level caches stay warm (client-side nav never reloads the module), so
  // start every canvas session from a clean cascade.
  useEffect(() => { invalidateResolverCaches() }, [])

  // One-time self-heal: migrate any kick-run members detached under the old model
  // (kick still on the cabinet) to the current kick-less-carcase model.
  const migratedLegacyKicksRef = useRef(false)
  useEffect(() => {
    if (migratedLegacyKicksRef.current) return
    migratedLegacyKicksRef.current = true
    dbMigrateLegacyKickMembers(room.id).then(m => { if (m) applyKickMutation(m) }).catch(e => console.error('legacy kick migrate', e))
  }, [room.id, applyKickMutation])

  // Both open the confirm modal; confirmDeleteCabinets does the work.
  function handleDeleteCabinet(id: string) {
    setDeleteCabsPending([id])
    setContextMenu(null)
  }

  function handleDeleteMultipleCabinets(ids: string[]) {
    if (!ids.length) return
    setDeleteCabsPending(ids)
    setContextMenu(null)
  }

  async function confirmDeleteCabinets() {
    if (!deleteCabsPending) return
    const ids = deleteCabsPending
    setDeleteCabsPending(null)
    captureSnapshot()
    setCabinets(cs => cs.filter(c => !ids.includes(c.id)))
    setSelected(null)
    setMultiSelect([])
    setContextMenu(null)
    // Sequential so concurrent reconciles of the same run don't race.
    for (const id of ids) {
      const mut = await dbDeleteCabinet(id)
      for (const did of ids) mut.resolved.delete(did)   // drop any still-pending deletes
      applyKickMutation(mut)
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
    // NB: once a kick run is joined, the standalone kick assembly is fully
    // independent — moving or resizing a member cabinet does NOT re-fit it. The
    // assembly only changes when you move/resize it directly, or when the run is
    // dissolved (explicit Separate, or a delete dropping it below 2 members).
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

  async function placeCabinet(wall: Wall, pos_x: number, pos_y: number, cls: AssemblyClass, isEP = false, islandFlip = false, dxOverride?: number) {
    captureSnapshot()
    const dims = DEFAULT_DIMS[cls] ?? DEFAULT_DIMS.base
    // Height/depth cascade room → job → shop → system constant; width stays intrinsic.
    const { dy, dz } = resolveClassDims(cls, { room, project, shop: shopDims })
    const data: Omit<CabinetInstance, 'id' | 'created_at' | 'updated_at'> = {
      room_id: room.id, wall_id: wall.id, cabinet_definition_id: null,
      label: nextLabel(cabinets, isEP ? 'ep' : cls), assembly_class: cls,
      pos_x, pos_y, pos_z: 0, rotation: islandFlip ? wall.angle + 180 : wall.angle,
      dx: dxOverride != null && dxOverride > 0 ? Math.round(dxOverride) : dims.dx,
      dy, dz,
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
    // Resolve the class's cascade height/depth so an unpreserved definition adopts
    // this room/job's standards; preserved axes keep the definition's frozen size.
    const { dy, dz } = resolveClassDims(def.assembly_class, { room, project, shop: shopDims })
    const data = buildInstanceFromDefinition(def, {
      room_id: room.id, wall_id: '', label: def.name, pos_x: 0, pos_y: 0, rotation: 0,
      cascade_dy: dy, cascade_dz: dz,
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

  // Swap a placed cabinet for a library definition in place (right-click → Replace).
  // Keeps wall, anchor, rotation, notes, neighbour types, width + height (each optional) and the
  // label (when the class is unchanged); everything else — construction, faces,
  // internals, depth — comes from the definition exactly as a fresh placement.
  // A kick-run member stays in its run as a kick-less raised carcase. Inserts the new
  // row BEFORE deleting the old one so the run never drops below its member count;
  // the old row's per-part overrides/custom parts go with it (they belong to the old
  // part set).
  async function handleReplaceCabinet(cabId: string, definitionId: string, keepWidth: boolean, keepHeight: boolean) {
    const old = cabinets.find(c => c.id === cabId)
    if (!old || old.is_kick_assembly) return
    const def = await dbLoadCabinetDefinition(definitionId)
    if (!def) { setToast('Replace failed — library cabinet not found'); return }
    captureSnapshot()
    const sameClass = def.assembly_class === old.assembly_class
    const { dy, dz } = resolveClassDims(def.assembly_class, { room, project, shop: shopDims })
    const data = buildInstanceFromDefinition(def, {
      room_id: room.id, wall_id: old.wall_id ?? '',
      label: sameClass && old.label ? old.label : nextLabel(cabinets, def.assembly_class),
      pos_x: old.pos_x, pos_y: old.pos_y, rotation: old.rotation,
      dx: keepWidth ? old.dx : undefined,
      cascade_dy: dy, cascade_dz: dz,
      left_neighbour_type: old.left_neighbour_type ?? undefined, right_neighbour_type: old.right_neighbour_type ?? undefined,
    })
    data.wall_id = old.wall_id
    data.notes = old.notes
    if (keepHeight) data.dy = old.dy
    if (sameClass) data.pos_z = old.pos_z
    const floorKick = (def.assembly_class === 'base' || def.assembly_class === 'tall')
      && def.has_toekick && def.toe_type !== 'leg' && def.toe_type !== 'none'
    if (old.kick_run_id && floorKick) {
      const kickH = cabinets.find(c => c.is_kick_assembly && c.kick_run_id === old.kick_run_id)?.dy ?? (old.pos_z || 0)
      data.kick_run_id = old.kick_run_id
      data.has_toekick = false
      data.dy = keepHeight ? old.dy : Math.max(1, data.dy - kickH)   // member dy is already kick-less
      data.pos_z = old.pos_z
    }
    const cabinet = await dbInsertCabinet(data)
    if (!cabinet) { setToast('Replace failed — see console'); return }
    setCabinets(cs => cs.map(c => c.id === old.id ? cabinet : c))
    setResolvedParts(m => { const next = new Map(m); next.delete(old.id); return next })
    setSelected({ type: 'cabinet', id: cabinet.id })
    setMultiSelect(ms => ms.filter(id => id !== old.id))
    const mut = await dbDeleteCabinet(old.id)
    mut.resolved.delete(old.id)
    applyKickMutation(mut)
    await dbInsertDefinitionParts(def.id, cabinet.id)
    const resolved = await dbResolveAndPersistCabinet(cabinet.id)
    if (resolved) { setResolvedParts(m => new Map(m).set(cabinet.id, resolved)); applyInputColours(cabinet.id); applyInputEdgebands(cabinet.id) }
    setToast(`Replaced ${cabinet.label ?? 'cabinet'} with “${def.name}”`)
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
    const gc = centroid(walls)
    const inward = wallInwardNormal(raw.wall, gc)
    const flip = (wp.x - raw.wall.pos_x) * inward.x + (wp.y - raw.wall.pos_y) * inward.y < 0
    const side = flip ? 'back' : 'face'
    const occupied = cabinets
      .filter(c => c.wall_id === raw.wall.id && !c.is_kick_assembly && cabsBlock({ assembly_class: draft.assembly_class, dy: draft.dy }, c, raw.wall, room) && cabWallSide(c, raw.wall) === side)
      .map(c => ({ t: cabT(c, raw.wall), dx: c.dx })).concat(wfOcc(raw.wall, side, draft))
    const fit = fitFreeSlot(desired, draft.dx, raw.wall.length, occupied)
    const a = wallAnchorPoint(raw.wall, fit.t, flip, gc)
    await placeFromDraft(draft, raw.wall, a.x, a.y, flip, fit.dx)
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
      const mut = await dbDeleteCabinet(id)
      for (const did of ids) mut.resolved.delete(did)
      applyKickMutation(mut)
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
    const cxp = centroid(walls)
    const added: CabinetInstance[] = []
    let working = [...cabinets]
    for (const src of clipboardGroup) {
      const desired = anchorT + (cabWallT(src) - baseT)
      const occupied = working
        .filter(c => c.wall_id === wall.id && !c.is_kick_assembly && cabsBlock(src, c, wall, room) && cabWallSide(c, wall) === side)
        .map(c => ({ t: cabT(c, wall), dx: c.dx })).concat(wfOcc(wall, side, src))
      const t = findFreeSlot(desired, src.dx, wall.length, occupied)
      const { x: pos_x, y: pos_y } = wallAnchorPoint(wall, t, flip, cxp)
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

  /** Wall/island angle snap: Shift = 5°, else the tool's step (0 = free). */
  function wallAngleSnap(start: Pt, pt: Pt): Pt {
    const step = shiftRef.current ? 5 : wallDraw.angleStep
    return step > 0 ? snapAngle(start, pt, step) : pt
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
      soffit_height: drawSoffit,
      wall_type: 'standard',
    }
    const saved = await dbSaveWall(data)
    if (saved) { setWalls(ws => [...ws, saved]); setSelected({ type: 'wall', id: saved.id }) }
    const rad = (angle * Math.PI) / 180
    afterWallPlaced({ x: drawStart.x + length * Math.cos(rad), y: drawStart.y + length * Math.sin(rad) }, !!saved)
  }

  /** After a standard wall is placed: chain mode starts the next wall from its
   *  end (closing on the chain's first point ends it); otherwise the draw ends. */
  function afterWallPlaced(end: Pt, ok: boolean) {
    const first = chainStartRef.current
    if (ok && mode === 'draw_wall' && wallDraw.chain && !(first && dist(first, end) < 1)) {
      setDrawStart(end); setDrawCursor(end); setChainCount(n => n + 1)
      return
    }
    endWallChain()
  }

  /** Drop the pending start point (wall tool stays armed). */
  function endWallChain() {
    chainStartRef.current = null
    setChainCount(0)
    setDrawStart(null); setDrawCursor(null); setSnapResult(null)
  }

  /** Right-click / panel cancel: ends a chain in progress, else leaves the tool. */
  function cancelWallDraw() {
    if (mode === 'draw_wall' && wallDraw.chain && drawStart) { endWallChain(); return }
    endWallChain(); setMode('select')
  }

  // ── Dev automation bridge ─────────────────────────────────────────────────
  // Dev-only scripting surface for browser automation (window.__canvasApi).
  // Routes through the same handlers as the UI so labels, cascades, snapshots
  // and resolution behave identically to hand placement. Offsets are mm from
  // the wall's start point along its angle ("from left end").
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      const findWall = (ref: string) => {
        const w = walls.find(x => x.id === ref || x.name.toLowerCase() === ref.toLowerCase())
        if (!w) throw new Error(`Wall not found: ${ref} (have: ${walls.map(x => x.name).join(', ') || 'none'})`)
        return w
      }
      const wallOffsetPos = (w: Wall, offset: number) => {
        const rad = (w.angle * Math.PI) / 180
        return { pos_x: w.pos_x + offset * Math.cos(rad), pos_y: w.pos_y + offset * Math.sin(rad) }
      }
      const api = {
        async drawWall(opts: { x: number; y: number; length: number; angle?: number; thickness?: number; height?: number | null }) {
          captureSnapshot()
          const data: Omit<Wall, 'id' | 'created_at'> = {
            room_id: room.id,
            name: `Wall ${walls.length + 1}`,
            sort_order: walls.length, length: opts.length, angle: opts.angle ?? 0,
            pos_x: opts.x, pos_y: opts.y,
            thickness: opts.thickness ?? drawThickness, height: opts.height ?? drawHeight,
            soffit_height: null,
            wall_type: 'standard',
          }
          const saved = await dbSaveWall(data)
          if (!saved) throw new Error('drawWall: insert failed')
          setWalls(ws => [...ws, saved])
          return { id: saved.id, name: saved.name, length: saved.length, angle: saved.angle }
        },
        async placeCabinet(opts: { def: string; wall: string; offset: number; dx?: number }) {
          const w = findWall(opts.wall)
          const { data: defRow } = await supabase.from('cabinet_definitions').select('*').ilike('name', opts.def).limit(1).maybeSingle()
          if (!defRow) throw new Error(`Definition not found: ${opts.def}`)
          const draft = buildDraftFromDefinition(defRow as CabinetDefinition)
          const { pos_x, pos_y } = wallOffsetPos(w, opts.offset)
          await placeFromDraft(draft, w, pos_x, pos_y, false, opts.dx)
          return { placed: opts.def, wall: w.name, offset: opts.offset, dx: opts.dx ?? draft.dx }
        },
        async updateCabinet(ref: string, patch: { dx?: number; dy?: number; dz?: number; offset?: number }) {
          const cab = cabinets.find(c => c.id === ref || c.label?.toLowerCase() === ref.toLowerCase())
          if (!cab) throw new Error(`Cabinet not found: ${ref}`)
          const u: Partial<CabinetInstance> = {}
          if (patch.dx != null) u.dx = patch.dx
          if (patch.dy != null) u.dy = patch.dy
          if (patch.dz != null) u.dz = patch.dz
          if (patch.offset != null) {
            const w = walls.find(x => x.id === cab.wall_id)
            if (!w) throw new Error(`Cabinet ${cab.label} is not on a wall`)
            Object.assign(u, wallOffsetPos(w, patch.offset))
          }
          await handleUpdateCabinet(cab.id, u)
          return { updated: cab.label, ...u }
        },
        // Open the cabinet edit modal — same path as double-clicking the cabinet
        // in the plan (lets headless tests reach the Part/Shape editors).
        openCabinet(ref: string) {
          const cab = cabinets.find(c => c.id === ref || c.label?.toLowerCase() === ref.toLowerCase())
          if (!cab) throw new Error(`Cabinet not found: ${ref}`)
          setEditCabId(cab.id)
          return { opened: cab.label, id: cab.id }
        },
        async getIssues() {
          const out = []
          for (const c of cabinets) {
            // awaitPersist: headless callers close the page right after this
            // returns — a background persist would be killed mid delete+insert.
            const resolved = await dbResolveAndPersistCabinet(c.id, { awaitPersist: true })
            out.push({
              id: c.id, label: c.label, class: c.assembly_class,
              dims: `${c.dx}x${c.dy}x${c.dz}`,
              errors: resolved?.errors ?? [], warnings: resolved?.warnings ?? [],
            })
          }
          return out
        },
        getState() {
          return {
            room: { id: room.id, name: room.name },
            walls: walls.map(w => ({ id: w.id, name: w.name, length: w.length, angle: w.angle, x: w.pos_x, y: w.pos_y })),
            cabinets: cabinets.map(c => {
              const w = walls.find(x => x.id === c.wall_id)
              const rad = w ? (w.angle * Math.PI) / 180 : 0
              const offset = w ? Math.round((c.pos_x - w.pos_x) * Math.cos(rad) + (c.pos_y - w.pos_y) * Math.sin(rad)) : null
              return { id: c.id, label: c.label, wall: w?.name ?? null, offset, dx: c.dx, dy: c.dy, dz: c.dz, class: c.assembly_class }
            }),
          }
        },
      }
      ;(window as unknown as { __canvasApi?: typeof api }).__canvasApi = api
    }
  })

  // ── Pointer handlers ──────────────────────────────────────────────────────

  function onPointerDown(e: React.PointerEvent) {
    if (!svgRef.current) return
    svgPointerDownRef.current = true
    setContextMenu(null); setOpenMenu(null)
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
    // Carrying a fixture: the drop happens on pointer-up (useFixtureInteraction).
    if (mode === 'place_fixture') { e.preventDefault(); svgRef.current.setPointerCapture(e.pointerId); return }
    // Benchtop draw tools finish on pointer-up (useBenchtopInteraction). Cutouts
    // and joins act on the selected benchtop, so they must not deselect here.
    if (mode === 'draw_benchtop' || mode === 'draw_benchtop_rect' || mode === 'draw_benchtop_l' || mode === 'draw_benchtop_u'
      || mode === 'draw_benchtop_cutout_rect' || mode === 'draw_benchtop_cutout_circle' || mode === 'draw_benchtop_join'
      || mode === 'move_benchtop') {
      e.preventDefault()
      return
    }
    // Benchtop mode: a press that reaches the canvas missed every top (tops stop
    // propagation; walls / cabinets are click-through) → deselect.
    if (mode === 'benchtop_select') {
      e.preventDefault()
      setSelected(null)
      return
    }
    // Shape edit: a press off the handles only clears the corner / edge pick.
    if (mode === 'edit_benchtop_shape') {
      e.preventDefault()
      // While a stretch follows the mouse this click places it (on pointer-up).
      if (!bt.shapeStretch) bt.setShapeSel(null)
      return
    }
    // Edit edges: clicks land on the edges (plan overlay); a press elsewhere does nothing.
    if (mode === 'edit_benchtop_edges') { e.preventDefault(); return }
    if (mode === 'measure') { e.preventDefault(); return }
    if (mode === 'draw_wall' || mode === 'draw_island') {
      e.preventDefault()
      if (!drawStart) {
        const snapped = computeSnap(wp, { walls, cabinets, benchtops }, snapSettings, SNAP_PX / view.zoom).pt
        setDrawStart(snapped); setDrawCursor(snapped)
        chainStartRef.current = snapped; setChainCount(0)
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

    if (bt.handlePointerMove(wp)) return
    if (fx.handlePointerMove(wp, shiftRef.current)) return

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
        end = wallAngleSnap(drawStart, end)
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
      const cx = centroid(walls)
      const inward = wallInwardNormal(w, cx)
      return (wp.x - w.pos_x) * inward.x + (wp.y - w.pos_y) * inward.y < 0
    }

    // Cursor's along-wall position (unclamped). The floating ghost is drawn
    // centred on the cursor, so landings are centred on this too.
    function cursorT(w: Wall): number {
      const wd = wallDir(w)
      return (wp.x - w.pos_x) * wd.x + (wp.y - w.pos_y) * wd.y
    }

    if (mode === 'paste' && clipboard) {
      const raw = nearestWall(wp, walls, clipboard.dx, WALL_SNAP_PX / view.zoom)
      if (!raw) { setPlaceGhost(null); return }
      const desired = cursorT(raw.wall) - clipboard.dx / 2
      const flip = wallFlipFor(raw.wall)
      const side = flip ? 'back' : 'face'
      const occupied = cabinets.filter(c => c.wall_id === raw.wall.id && !c.is_kick_assembly && cabsBlock(clipboard, c, raw.wall, room) && cabWallSide(c, raw.wall) === side).map(c => ({ t: cabT(c, raw.wall), dx: c.dx })).concat(wfOcc(raw.wall, side, clipboard))
      const t = findFreeSlot(desired, clipboard.dx, raw.wall.length, occupied)
      const cxp = centroid(walls)
      const a = wallAnchorPoint(raw.wall, t, flip, cxp)
      setPlaceGhost({ wall: raw.wall, pos_x: a.x, pos_y: a.y, islandFlip: flip, freePos: wp })
      return
    }

    const clsInfo = currentPlaceInfo()
    if (clsInfo) {
      // No distance limit — the ghost floats at the cursor and always snaps to the nearest
      // wall, matching the elevation-view placement feel (carry-in-hand + snap landing).
      const raw = nearestWall(wp, walls, clsInfo.dx, Infinity)
      if (!raw) { setPlaceGhost(null); return }
      const flip = wallFlipFor(raw.wall)
      const side = flip ? 'back' : 'face'
      const occupied = cabinets.filter(c => c.wall_id === raw.wall.id && !c.is_kick_assembly && cabsBlock({ assembly_class: clsInfo.cls, dy: clsInfo.dy }, c, raw.wall, room) && cabWallSide(c, raw.wall) === side).map(c => ({ t: cabT(c, raw.wall), dx: c.dx })).concat(wfOcc(raw.wall, side, { assembly_class: clsInfo.cls, dy: clsInfo.dy, dz: clsInfo.dz }))
      // Fit into the available gap: shrink the new cabinet's width if the gap is
      // narrower than the default, rather than overlapping the neighbour.
      // fitFreeSlot centres on the cursor point itself.
      const fit = fitFreeSlot(cursorT(raw.wall), clsInfo.dx, raw.wall.length, occupied)
      const cxp = centroid(walls)
      const a = wallAnchorPoint(raw.wall, fit.t, flip, cxp)
      setPlaceGhost({ wall: raw.wall, pos_x: a.x, pos_y: a.y, islandFlip: flip, freePos: wp, fitDx: fit.dx })
      return
    }

    if (marqueeStartRef.current && mode === 'select') {
      setMarquee({ x1: marqueeStartRef.current.x, y1: marqueeStartRef.current.y, x2: wp.x, y2: wp.y })
    }

    if (cabDragRef.current && mode === 'select') {
      // Require 3 screen pixels of movement before activating drag — prevents accidental
      // micro-drags when clicking quickly.
      if (!cabDragOriginRef.current || dist(svgP, cabDragOriginRef.current) >= 3) {
        const { cabId, assemblyClass, wall, cabDX, dragOffset } = cabDragRef.current
        const wd = wallDir(wall)
        const cursorT = (wp.x - wall.pos_x) * wd.x + (wp.y - wall.pos_y) * wd.y
        const desired = Math.max(0, Math.min(wall.length - cabDX, cursorT - dragOffset))
        const dragCab = cabinets.find(c => c.id === cabId)
        const dragSide = dragCab ? cabWallSide(dragCab, wall) : 'face'
        const occupied = cabinets.filter(c => c.id !== cabId && c.wall_id === wall.id && !c.is_kick_assembly && cabsBlock(dragCab ?? { assembly_class: assemblyClass, dy: 9999 }, c, wall, room) && cabWallSide(c, wall) === dragSide).map(c => ({ t: cabT(c, wall), dx: c.dx })).concat(wfOcc(wall, dragSide, dragCab ?? { assembly_class: assemblyClass, dy: 9999 }))
        const t = slideToFreeSlot(desired, cabDX, wall.length, occupied, dragCab ? cabT(dragCab, wall) : undefined)
        const cxp = centroid(walls)
        const a = wallAnchorPoint(wall, t, dragSide === 'back', cxp)
        setCabDrag({ id: cabId, pos_x: a.x, pos_y: a.y })
      }
    }

    if (cabFollowing && mode === 'select') {
      const { id, assemblyClass } = cabFollowing
      const cab = cabinets.find(c => c.id === id)
      if (cab) {
        // No distance limit — ghost always snaps to nearest wall regardless of cursor position
        const raw = nearestWall(wp, walls, cab.dx, Infinity)
        if (raw) {
          const desired = cursorT(raw.wall) - cab.dx / 2
          // Side the cabinet will land on (cursor side of the wall) — not its current
          // rotation, which is meaningless against a different wall.
          const flip = wallFlipFor(raw.wall)
          const moveSide = flip ? 'back' : 'face'
          const occupied = cabinets.filter(c => c.id !== id && c.wall_id === raw.wall.id && !c.is_kick_assembly && cabsBlock(cab, c, raw.wall, room) && cabWallSide(c, raw.wall) === moveSide).map(c => ({ t: cabT(c, raw.wall), dx: c.dx })).concat(wfOcc(raw.wall, moveSide, cab))
          // Same-wall move → keep it on the drag side (no bounce-back); cross-wall → free slot.
          const origT = raw.wall.id === cab.wall_id ? cabT(cab, raw.wall) : undefined
          const t = slideToFreeSlot(desired, cab.dx, raw.wall.length, occupied, origT)
          const cxp = centroid(walls)
          const a = wallAnchorPoint(raw.wall, t, flip, cxp)
          setCabMoveDrag({ id, wall: raw.wall, pos_x: a.x, pos_y: a.y, islandFlip: flip, freePos: wp })
        }
      }
    }

    if (cabResize && mode === 'select') {
      const { side, wall, perp, startCabT, startCabEndT, cabId } = cabResize
      const wd = wallDir(wall)
      const resizingCab = cabinets.find(c => c.id === cabId)
      const resizingCls = resizingCab?.assembly_class ?? 'base'
      const resizingSide = resizingCab ? cabWallSide(resizingCab, wall) : 'face'
      // Neighbours on the same wall side used for collision clamping. A kick
      // assembly is a plinth that sits in front of the cabinets it spans, so it
      // resizes freely (clamped only by the wall) — never by the units it overlaps.
      const neighbours = resizingCab?.is_kick_assembly ? [] : cabinets
        .filter(c => c.id !== cabId && c.wall_id === wall.id && !c.is_kick_assembly && cabsBlock(resizingCab ?? { assembly_class: resizingCls, dy: 9999 }, c, wall, room) && cabWallSide(c, wall) === resizingSide)
        .map(c => ({ t: cabT(c, wall), dx: c.dx })).concat(wfOcc(wall, resizingSide, resizingCab ?? { assembly_class: resizingCls, dy: 9999 }))
      if (side === 'right') {
        const cursorT = (wp.x - wall.pos_x) * wd.x + (wp.y - wall.pos_y) * wd.y
        // Hard limit: left edge of nearest neighbour to the right
        const rightBound = neighbours
          .filter(o => o.t > startCabT + 1)
          .reduce((min, o) => Math.min(min, o.t), wall.length)
        const newDx = Math.max(MIN_STRETCH, Math.min(rightBound - startCabT, cursorT - startCabT))
        setCabResize(r => r ? { ...r, liveValue: Math.round(newDx) } : r)
      } else if (side === 'left') {
        const cursorT = (wp.x - wall.pos_x) * wd.x + (wp.y - wall.pos_y) * wd.y
        // Hard limit: right edge of nearest neighbour to the left
        const leftBound = neighbours
          .filter(o => o.t + o.dx < startCabEndT - 1)
          .reduce((max, o) => Math.max(max, o.t + o.dx), 0)
        const newT = Math.max(leftBound, Math.min(startCabEndT - MIN_STRETCH, cursorT))
        const newDx = startCabEndT - newT
        // Shift the anchor along the wall (keeps a back-side cabinet on the outer face).
        const base = resizingCab ? { x: resizingCab.pos_x, y: resizingCab.pos_y, t: cabT(resizingCab, wall) } : { x: wall.pos_x, y: wall.pos_y, t: 0 }
        setCabResize(r => r ? { ...r, liveValue: Math.round(newDx), livePosX: base.x + (newT - base.t) * wd.x, livePosY: base.y + (newT - base.t) * wd.y } : r)
      } else {
        const cab = cabinets.find(c => c.id === cabId)
        if (cab) {
          const cursorPerp = (wp.x - cab.pos_x) * perp.x + (wp.y - cab.pos_y) * perp.y
          const newDz = Math.max(MIN_STRETCH, Math.min(2000, cursorPerp))
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

    if (await bt.handlePointerUp(wp)) return
    if (await fx.handlePointerUp(wp, shiftRef.current)) return

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
          end = wallAngleSnap(drawStart, end)
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
            soffit_height: isIsland ? null : drawSoffit,
            wall_type: isIsland ? 'island' : 'standard',
          }
          const saved = await dbSaveWall(data)
          if (saved) { setWalls(ws => [...ws, saved]); setSelected({ type: 'wall', id: saved.id }) }
          if (isIsland) { setDrawStart(null); setDrawCursor(null) }
          else afterWallPlaced(adjEnd, !!saved)
        } else {
          // A click on the start point (e.g. double-click) finishes the chain.
          endWallChain()
        }
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
          const desired = (wp.x - raw.wall.pos_x) * wd2.x + (wp.y - raw.wall.pos_y) * wd2.y - clipboard.dx / 2
          const pasteFlip = (() => {
            const cx2 = centroid(walls)
            const inw = wallInwardNormal(raw.wall, cx2)
            return (wp.x - raw.wall.pos_x) * inw.x + (wp.y - raw.wall.pos_y) * inw.y < 0
          })()
          const pasteSide = pasteFlip ? 'back' : 'face'
          const occupied = cabinets.filter(c => c.wall_id === raw.wall.id && !c.is_kick_assembly && cabsBlock(clipboard, c, raw.wall, room) && cabWallSide(c, raw.wall) === pasteSide).map(c => ({ t: cabT(c, raw.wall), dx: c.dx })).concat(wfOcc(raw.wall, pasteSide, clipboard))
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
          const basePerp = wallInwardNormal(wall, cxpt)
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
    setContextMenu(null); setOpenMenu(null)
    setSelected({ type: 'wall', id: wallId })
    setCabResize(null)
    setMultiSelect([])
  }

  function onCabinetPointerDown(e: React.PointerEvent, cab: CabinetInstance) {
    if (mode !== 'select' || e.button !== 0) return
    e.stopPropagation()
    // Moving a cabinet → clicking on any cabinet (usually the moving one itself,
    // on a small move) drops it rather than cancelling the move.
    if (cabFollowing) { void commitCabMove(); return }
    // stopPropagation blocks the SVG onPointerDown, so set this ref here —
    // otherwise onPointerUp's phantom-event guard exits early and the drag save never fires.
    svgPointerDownRef.current = true
    setContextMenu(null); setOpenMenu(null)
    commitResize()
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
    if (cabFollowing) {
      // Already moving a cabinet → this click drops it (Esc cancels).
      void commitCabMove()
    } else {
      setCabResize(null); setMultiSelect([])
      setSelected({ type: 'cabinet', id: cab.id })
      // Seed ghost immediately at cabinet's current position so it's visible before any cursor movement.
      // islandFlip carries the back-side flag (for both islands and standard walls) so a seeded
      // back cabinet keeps its orientation if committed before the cursor moves.
      const wall = walls.find(w => w.id === cab.wall_id)
      if (wall) {
        const islandFlip = cabWallSide(cab, wall) === 'back'
        setCabMoveDrag({ id: cab.id, wall, pos_x: cab.pos_x, pos_y: cab.pos_y, islandFlip })
      }
      setCabFollowing({ id: cab.id, assemblyClass: cab.assembly_class })
    }
  }

  async function onSVGClick(e: React.MouseEvent) {
    if (cabResize) { commitResize(); return }
    if (!cabFollowing) return
    await commitCabMove()
  }

  // Drop the crosshair-moved cabinet at its landing spot. Called by ANY click while
  // following — a small move leaves the cursor over the cabinet itself (or its
  // crosshair), and those clicks must drop it, not cancel. No-op drops just end.
  async function commitCabMove() {
    if (!cabFollowing) return
    const { id } = cabFollowing
    const move = cabMoveDrag
    setCabFollowing(null)
    setCabMoveDrag(null)
    if (!move) return
    const { wall, pos_x, pos_y, islandFlip } = move
    const cab = cabinets.find(c => c.id === id)
    const newRotation = islandFlip ? wall.angle + 180 : wall.angle
    const moved = !cab || cab.wall_id !== wall.id ||
      Math.hypot(pos_x - cab.pos_x, pos_y - cab.pos_y) > 0.01 ||
      ((cab.rotation - newRotation) % 360 + 360) % 360 !== 0
    if (!moved) return
    captureSnapshot()
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
    setContextMenu(null); setOpenMenu(null)
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
    // Room/job settings feed the cascade every cabinet resolves through, so the
    // shared cascade cache must go before anything re-resolves.
    invalidateResolverCaches()
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
  const selectedFixture   = selected?.type === 'fixture'   ? fixtures.find(f => f.id === selected.id) ?? null   : null
  // Selected top measured against its anchor wall face (panel sizes / ends).
  // While shaping in plan (Phase 6) it follows the working outline, so the overhang is live.
  const selectedBtPos = (() => {
    const aw = selectedBenchtop && walls.find(w => w.id === selectedBenchtop.wall_id)
    if (!selectedBenchtop || !aw) return null
    const segs = bt.shapeEdit?.btId === selectedBenchtop.id ? bt.shapeEdit.segs : btSegments(selectedBenchtop)
    return btPosition(segs, wallFrame(aw, selectedBenchtop.wall_side, centroid(walls)))
  })()
  // Overhang past the base cabinets on the anchor wall + side (an island top
  // spans both sides, so islands count either side), as along-wall spans.
  const selectedBtOverhang = (() => {
    const aw = selectedBenchtop && walls.find(w => w.id === selectedBenchtop.wall_id)
    if (!selectedBenchtop || !aw || !selectedBtPos) return null
    const under = cabinets
      .filter(c => c.wall_id === aw.id && !c.is_kick_assembly && (c.assembly_class === 'base' || c.assembly_class === 'base_corner')
        && (aw.wall_type === 'island' || cabWallSide(c, aw) === selectedBenchtop.wall_side))
      .map(c => ({ t: cabT(c, aw), dx: c.dx, dz: c.dz }))
    return btOverhangs(selectedBtPos, under)
  })()

  const multiSelectCabs = multiSelect.length >= 2 ? cabinets.filter(c => multiSelect.includes(c.id)) : []
  const canEqualize = multiSelectCabs.length >= 2 && new Set(multiSelectCabs.map(c => c.wall_id)).size === 1

  const cursor = spaceRef.current ? 'grab'
    : sectionDrag ? 'grabbing'
    : (mode === 'draw_wall' || mode === 'draw_island' || mode === 'draw_section' || mode === 'measure' || mode === 'draw_benchtop' || mode === 'draw_benchtop_rect' || mode === 'draw_benchtop_l' || mode === 'draw_benchtop_join' || mode === 'move_benchtop') ? 'crosshair'
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
    // Re-clicking a benchtop tool drops back to Benchtop mode, not Select.
    setMode(prev => prev === m ? (isBenchtopMode(m) && m !== 'benchtop_select' ? 'benchtop_select' : 'select') : m)
    setArmedDef(null); setArmedDraft(null)
    setDrawStart(null); setPlaceGhost(null)
  }

  // F6: arm a catalogue fixture (re-click the armed one to stop).
  function armFixture(item: FixtureCatalogItem) {
    setArmedDef(null); setArmedDraft(null); setDrawStart(null); setPlaceGhost(null)
    if (mode === 'place_fixture' && fx.carry?.kind === 'place' && fx.carry.item.id === item.id) { fx.cancel(); return }
    if (canvasView !== 'plan') switchView('plan')
    fx.arm(item)
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
    // A selected cabinet opens its own wall (and side — back-face cabinets show the
    // wall's back elevation); a selected wall opens that wall; otherwise keep the
    // last wall viewed.
    const selCab = v === 'elevation' && selected?.type === 'cabinet' ? cabinets.find(c => c.id === selected.id) : undefined
    const selCabWall = selCab ? walls.find(w => w.id === selCab.wall_id) : undefined
    if (selCab && selCabWall) {
      const side = cabWallSide(selCab, selCabWall)
      if (selCabWall.id !== elevWallId) pendingElevSideRef.current = side
      setElevWallId(selCabWall.id)
      setElevWallSide(side)
    } else if (v === 'elevation' && selectedWall) {
      setElevWallId(selectedWall.id)
    } else if (v === 'elevation' && elevWallId === null) {
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
    : mode === 'benchtop_select' ? 'Benchtop mode: click a benchtop to select · right-click = Edit shape / Edit edges · double-click = Shape Editor · cabinets are locked · F4 / Esc = back to cabinets'
    : mode === 'edit_benchtop_shape' ? (bt.shapeStretch ? 'Stretch: move the mouse (snaps) · click to place · or type the size in the panel · Esc = cancel the stretch'
      : 'Edit shape: click a line to stretch it · drag a line to move it · click a corner for X / Y · Shift-click a line = add corner · Enter = save · Esc = finish · Ctrl+Z = undo')
    : mode === 'edit_benchtop_edges' ? 'Edit edges: pick a chip in the panel, then click edges on the plan · click again = take it off · Alt-click = default · Enter = save · Esc = finish · Ctrl+Z = undo'
    : mode === 'move_benchtop' ? (!bt.btMoveBase ? 'Move benchtop: click a base point (snaps) · Esc=cancel' : 'Click the point to move it to · Ctrl=ortho · Esc=cancel')
    : mode === 'draw_benchtop_join' ? (!bt.btJoinStart ? 'Join line: click a point on the benchtop edge · Esc=cancel' : 'Click the opposite edge to finish the join · Ctrl=ortho')
    : mode === 'draw_benchtop_cutout_circle' ? (!bt.btCutoutStart ? 'Cutout: click centre of circle · Esc=cancel' : 'Click to set radius and finish cutout')
    : mode === 'draw_benchtop'   ? (bt.btArcMode
        ? (!bt.btArcMidpoint ? 'Arc mode: click a point ON the arc curve' : 'Arc mode: click the arc endpoint')
        : bt.btDrawPoly.length === 0 ? 'Click first vertex · Shift=45° · Ctrl=ortho · A=arc · Esc=cancel'
        : bt.btDrawPoly.length < 3 ? `${bt.btDrawPoly.length} ${bt.btDrawPoly.length === 1 ? 'vertex' : 'vertices'} · Backspace=undo · Shift=45° · Ctrl=ortho · A=arc`
        : `${bt.btDrawPoly.length} vertices · click near first vertex to close · Backspace=undo · A=arc`)
    : mode === 'measure' && canvasView === '3d' ? 'Measure: hover a face · click it, then click a second face · parallel faces give the square gap · click again = new · right-click = clear · Esc = exit'
    : mode === 'measure'         ? (() => {
        const start = canvasView === 'elevation' ? elevMeasureStart : measureStart
        const end   = canvasView === 'elevation' ? elevMeasureEnd   : measureEnd
        return !start || end ? 'Measure: click first point · snaps to corners · Ctrl=ortho · Esc=exit' : 'Click second point · Ctrl=ortho · Shift=45° · right-click=clear'
      })()
    : mode === 'draw_section'     ? (!drawStart ? 'Click to set start of section cut · Esc=cancel' : 'Click to finish · Shift=45° snap · Esc=cancel')
    : mode === 'draw_wall'       ? (!drawStart ? 'Click to set start point · snap rings show existing endpoints' : (wallDraw.chain ? 'Click to place & continue · click first point to close · double-click / Esc = finish · Shift = 5° snap' : 'Click to finish · Shift = 5° snap · or type in panel →'))
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
    : selected?.type === 'benchtop'   && selectedBenchtop   ? `Benchtop · ${selectedBenchtop.label ?? '—'} · ${selectedBenchtop.polygon.length} vertices · anchored to ${walls.find(w => w.id === selectedBenchtop.wall_id)?.name ?? '—'} · double-click to edit shape + edge profiles · move it from the panel (Position / Move…) · Delete = remove`
    : null

  const menus = buildMenus({
    canUndo, canRedo, handleUndo, handleRedo,
    selected, cabinets, clipboard, setClipboard, setMode, setPlaceGhost,
    handleDeleteCabinet, handleDeleteWall,
    dispatchView, svgSize, fitToWalls, switchView,
    openLayerManager: () => setShowLayerManager(true),
    planGrid, setPlanGrid,
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
      <div className="flex-none h-8 bg-gray-900 border-b border-gray-800 flex items-center px-3 shrink-0 relative z-30">
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
          {(['plan', 'elevation', 'section', '3d'] as CanvasView[]).map(v => (
            <button key={v} onClick={() => switchView(v)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                canvasView === v
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}>
              {v === 'plan' ? 'Plan' : v === 'elevation' ? 'Elevation' : v === 'section' ? 'Section' : room3DStyle === 'wire' ? '3D · Wire' : '3D'}
            </button>
          ))}
          {/* 3D style dropdown: solid / wire (see-through parts) */}
          <div className="relative -ml-1" onPointerDown={e => e.stopPropagation()}>
            <button
              onClick={() => setView3DMenuOpen(o => !o)}
              title="3D view style"
              className={`px-1.5 py-1 text-xs rounded transition-colors ${
                canvasView === '3d'
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              ▾
            </button>
            {view3DMenuOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-gray-800 border border-gray-600 rounded shadow-xl py-1 min-w-[130px]">
                {([['solid', 'Solid view'], ['wire', 'Wire view']] as const).map(([v, label]) => (
                  <button key={v}
                    onClick={() => { setRoom3DStyle(v); setView3DMenuOpen(false); if (canvasView !== '3d') switchView('3d') }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-200 hover:bg-gray-700"
                  >
                    <span className="w-3 text-blue-400">{room3DStyle === v ? '✓' : ''}</span>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
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
          {(canvasView === 'plan' || canvasView === 'elevation' || canvasView === '3d') && (
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
          {canvasView !== 'section' && (<>
            <span className="text-[10px] text-gray-600 uppercase tracking-wider select-none">Layers</span>
            <select
              value={activeLayerSet?.id ?? ''}
              onChange={e => {
                if (e.target.value === '__manage__') { setShowLayerManager(true); return }
                chooseLayerSet(e.target.value)
              }}
              className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-0.5 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {!activeLayerSet && <option value="">{layerSetsApi.loading ? 'Loading…' : 'Default'}</option>}
              {layerSetsApi.sets.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              <option value="__manage__">Manage layers…</option>
            </select>
          </>)}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">

        <CanvasSidebar
          room={room}
          onOpenRoomProperties={() => setRoomModalTab('details')}
          roomSwitcherRef={roomSwitcherRef}
          mode={mode}
          onSelectMode={onSelectMode}
          armedDefinitionId={armedDef?.id ?? null}
          onArmDefinition={armDefinition}
          armedDraft={mode === 'place_definition' ? armedDraft : null}
          matColours={matColours}
          ebByMatId={ebByMatId}
          libRefresh={libRefresh}
          wallMenuOpen={wallMenuOpen}
          setWallMenuOpen={setWallMenuOpen}
          cabMenuOpen={cabMenuOpen}
          setCabMenuOpen={setCabMenuOpen}
          benchtopMenuOpen={bt.benchtopMenuOpen}
          setBenchtopMenuOpen={bt.setBenchtopMenuOpen}
          onDrawBenchtopInShapeEditor={drawBenchtopInShapeEditor}
          fixtureMenuOpen={fx.menuOpen}
          setFixtureMenuOpen={fx.setMenuOpen}
          armedFixtureId={fx.carry?.kind === 'place' ? fx.carry.item.id : null}
          onArmFixture={armFixture}
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
              planGrid={planGrid}
              walls={walls}
              cabinets={cabinets}
              view={view}
              svgSize={svgSize}
              selected={selected}
              mode={mode}
              armedDef={armedDef}
              resolvedParts={visibleResolvedParts}
              onCanvasDrop={dropDefinitionAt}
              layers={planLayers}
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
              onCancelDraw={cancelWallDraw}
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
              benchtops={benchtopsDrawn}
              selectedBenchtopId={selectedBenchtop?.id ?? null}
              btDrawPoly={bt.btDrawPoly}
              btDrawCursor={bt.btDrawCursor}
              onBenchtopClick={id => { setSelected({ type: 'benchtop', id }); setMultiSelect([]) }}
              onBenchtopEdgeClick={bt.onBenchtopEdgeClick}
              onBenchtopEdgeShiftClick={bt.onBenchtopEdgeShiftClick}
              onBenchtopEdgeAltClick={bt.onBenchtopEdgeAltClick}
              onBenchtopVertexClick={bt.onBenchtopVertexClick}
              onBenchtopContextMenu={bt.onBenchtopContextMenu}
              onBtUndoVertex={bt.undoVertex}
              btDrawArcs={bt.btDrawArcs}
              btArcMode={bt.btArcMode}
              btArcMidpoint={bt.btArcMidpoint}
              btRectStart={bt.btRectStart}
              btRectCursor={bt.btRectCursor}
              onBenchtopVertexContextMenu={bt.onBenchtopVertexContextMenu}
              onBenchtopPointerDown={bt.onBenchtopPointerDown}
              btMoveBase={bt.btMoveBase}
              btMoveCursor={bt.btMoveCursor}
              btDepth={bt.btDepth}
              onBenchtopDoubleClick={bt.openShapeEditor}
              btShapeEdit={bt.shapeEdit}
              btEdgeHover={btEdgeHover}
              btEdgeEdit={mode === 'edit_benchtop_edges' ? bt.edgeEdit : null}
              onBtEdgePaint={(i, reset) => btEdgeAux && bt.paintEdge(i, reset, btEdgeAux)}
              onBtEdgeHover={i => setBtEdgeHover(i == null || !bt.edgeEdit ? null : { btId: bt.edgeEdit.btId, i })}
              btTapeIds={btCatalog.tapes.map(t => t.id)}
              btTapeContextFor={btCatalog.tapeContextFor}
              onShapeHandleDown={(e, kind, i) => {
                svgPointerDownRef.current = true
                svgRef.current?.setPointerCapture(e.pointerId)
                const p = svgCoords(e)
                bt.shapeHandleDown(kind, i, toWorld(p.x, p.y), { alt: e.altKey, shift: e.shiftKey })
              }}
              btJoinStart={bt.btJoinStart}
              btJoinCursor={bt.btJoinCursor}
              edgeProfiles={btCatalog.profileById}
              btDefaultProfileId={btCatalog.defaultProfileIdFor}
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
              fixturesLayer={
                <FixturesPlan
                  fixtures={fixtures}
                  ghost={mode === 'place_fixture' ? fx.ghost : null}
                  ghostBody={fx.carried}
                  hiddenId={mode === 'place_fixture' && fx.carry?.kind === 'move' ? fx.carry.id : null}
                  selectedId={selected?.type === 'fixture' ? selected.id : null}
                  zoom={view.zoom}
                  layers={planLayers}
                  interactive={mode === 'select'}
                  onPointerDown={(_e, id) => { setSelected({ type: 'fixture', id }); setMultiSelect([]); setCabResize(null); setContextMenu(null) }}
                  onContextMenu={(e, id) => { setSelected({ type: 'fixture', id }); setMultiSelect([]); setContextMenu({ x: e.clientX, y: e.clientY, fixtureId: id }) }}
                  onDoubleClick={(_e, id) => { setSelected({ type: 'fixture', id }); setViewFixtureId(id) }}
                />
              }
            />
              <SnapToolbar settings={snapSettings} onChange={updateSnapSettings} kinds={SNAP_KINDS} meta={SNAP_KIND_META} />
            </div>
            {(mode === 'draw_wall' || mode === 'draw_island') && (
              <WallDrawPanel
                mode={mode as 'draw_wall' | 'draw_island'}
                drawing={!!drawStart}
                chainCount={chainCount}
                settings={wallDraw}
                onSettings={updateWallDraw}
                height={drawHeight}
                setHeight={setDrawHeight}
                soffit={drawSoffit}
                setSoffit={setDrawSoffit}
                onFinishChain={endWallChain}
                onCancel={() => { endWallChain(); setMode('select') }}
              >
                {mode === 'draw_wall' && drawStart && (
                  <DrawingPanel
                    ref={drawingPanelRef}
                    drawStart={drawStart}
                    drawCursor={drawCursor}
                    onPlace={onPlaceFromPanel}
                    onCancel={cancelWallDraw}
                    onUpdatePreview={onUpdateDrawPreview}
                  />
                )}
              </WallDrawPanel>
            )}
            {(mode === 'draw_benchtop' || mode === 'draw_benchtop_rect' || mode === 'draw_benchtop_l' || mode === 'draw_benchtop_u') && !bt.btArcMode && (
              <BenchtopDrawPanel
                ref={btDrawPanelRef}
                mode={mode}
                anchor={bt.drawAnchor()}
                cursor={bt.drawCursor()}
                pointCount={mode === 'draw_benchtop' ? bt.btDrawPoly.length : mode === 'draw_benchtop_l' ? bt.btLPoints.length : mode === 'draw_benchtop_u' ? bt.btUPoints.length : (bt.btRectStart ? 1 : 0)}
                depth={bt.btDepth}
                setDepth={bt.setBtDepth}
                onPreview={bt.previewTyped}
                onPlace={v => void bt.placeTyped(v)}
                onClosePolygon={() => void bt.closePolygon()}
                onCancel={() => { bt.resetDraw(); setMode('benchtop_select') }}
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
            layers={elevLayers}
            multiSelect={multiSelect}
            armedDef={armedDef}
            canEqualize={canEqualize}
            mode={mode}
            clipboard={clipboard}
            clipboardGroup={clipboardGroup}
            onSelectCabinet={id => { setSelected({ type: 'cabinet', id }); setMultiSelect([]); setCabResize(null) }}
            onSelectWall={id => { if (!isBenchtopMode(mode)) setSelected({ type: 'wall', id }) }}
            onSetElevWall={setElevWallId}
            elevWallSide={elevWallSide}
            onSetElevWallSide={setElevWallSide}
            onUpdateCabinet={handleUpdateCabinet}
            onPlaceAtWall={async (wall, rawX, rawY, dx) => {
              // Re-anchor to the canonical landing: back-side cabinets sit on the wall's
              // outer face (shifted by thickness). Idempotent — uses only the along-wall
              // component, so any perpendicular in the incoming point is discarded.
              const wd = wallDir(wall)
              const t = (rawX - wall.pos_x) * wd.x + (rawY - wall.pos_y) * wd.y
              const gc = centroid(walls)
              const { x: pos_x, y: pos_y } = wallAnchorPoint(wall, t, elevWallSide === 'back', gc)
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
            benchtops={benchtops}
            benchtopInfo={btInfo}
            waterfallOcc={wfOcc}
            edgeProfiles={btCatalog.profileById}
            onSelectBenchtop={id => { setSelected({ type: 'benchtop', id }); setMultiSelect([]); setCabResize(null) }}
            fixtures={fixtures}
            onSelectFixture={id => { setSelected({ type: 'fixture', id }); setMultiSelect([]); setCabResize(null) }}
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
            pickBenchtops={isBenchtopMode(mode)}
            measuring={mode === 'measure'}
            onDeselect={() => { setSelected(null); setMultiSelect([]) }}
            onEditCabinet={id => { setEditCabInitialView('3d'); setEditCabId(id) }}
            onDeleteCabinet={id => handleDeleteCabinet(id)}
            onReplaceCabinet={id => setReplaceCabId(id)}
            resolvedParts={visibleResolvedParts}
            materialColours={matColours}
            ebByMatId={ebByMatId}
            cameraStateRef={camera3DStateRef}
            resetSignal={reset3DSignal}
            layers={layers3D}
            wire={room3DStyle === 'wire'}
            bt={{
              benchtops: benchtopsDrawn, info: btInfo, profiles: btCatalog.profileById,
              selectedId: selected?.type === 'benchtop' ? selected.id : null,
              onSelect: id => { setSelected({ type: 'benchtop', id }); setMultiSelect([]) },
            }}
            fx={{
              fixtures,
              selectedId: selected?.type === 'fixture' ? selected.id : null,
              onSelect: id => { setSelected({ type: 'fixture', id }); setMultiSelect([]) },
            }}
          />
        )}

        {mode !== 'draw_wall' && mode !== 'draw_island' && selectedWall && (canvasView === 'plan' || canvasView === 'elevation') && (
          <WallPanel wall={selectedWall} roomHeight={room.room_dy ?? undefined} onUpdate={handleUpdateWall} onDelete={handleDeleteWall} />
        )}
        {/* In 3D the right-hand panels float over the canvas instead of taking flex
            space — otherwise selecting/deselecting resizes the WebGL canvas and the
            view jumps sideways. Plan/elevation keep the docked column (`contents`). */}
        <div className={canvasView === '3d' ? 'absolute top-0 right-0 bottom-0 z-20 flex shadow-xl' : 'contents'}>
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
                update.pos_x = cab.pos_x + (newT - cabT(cab, w)) * wd.x
                update.pos_y = cab.pos_y + (newT - cabT(cab, w)) * wd.y
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
                update.pos_x = cab.pos_x + (newT - cabT(cab, w)) * wd.x
                update.pos_y = cab.pos_y + (newT - cabT(cab, w)) * wd.y
              }
              captureSnapshot()
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
        {mode !== 'place_definition' && multiSelectCabs.length >= 2 && (
          <CabinetGroupPanel
            cabinets={multiSelectCabs}
            wallCabinets={new Set(multiSelectCabs.map(c => c.wall_id)).size === 1
              ? cabinets.filter(c => c.wall_id === multiSelectCabs[0].wall_id)
              : []}
            walls={walls}
            room={room}
            onUpdateMany={u => { multiSelect.forEach(id => void handleUpdateCabinet(id, u)) }}
            onMoveAlongWall={deltaT => {
              const w = walls.find(wl => wl.id === multiSelectCabs[0]?.wall_id)
              if (!w || !deltaT) return
              const wd = wallDir(w)
              multiSelectCabs.forEach(c => void handleUpdateCabinet(c.id, {
                pos_x: c.pos_x + deltaT * wd.x,
                pos_y: c.pos_y + deltaT * wd.y,
              }))
            }}
            onDeleteMany={() => void handleDeleteMultipleCabinets(multiSelect)}
          />
        )}
        {mode !== 'place_definition' && multiSelectCabs.length < 2 && selectedCab && (!cabResize || cabResize.cabId !== selectedCab.id) && (
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
        {mode === 'edit_benchtop_shape' && selectedBenchtop && bt.shapeEdit?.btId === selectedBenchtop.id && (
          <BenchtopShapeEditPanel
            benchtop={selectedBenchtop}
            edit={bt.shapeEdit}
            overhang={selectedBtOverhang}
            ops={bt.shapeOps}
            onSelect={bt.setShapeSel}
            onSave={bt.commitShapeEdit}
            onCancel={bt.cancelShapeEdit}
            onUndo={bt.shapeEditUndo}
            stretch={bt.shapeStretch}
            onStretchSize={bt.stretchToSize}
            onStretchCancel={bt.cancelStretch}
          />
        )}
        {btSavePrompt && (
          <SaveShapePrompt
            what={mode === 'edit_benchtop_edges' ? 'edges' : 'shape'}
            onSave={() => { setBtSavePrompt(false); if (mode === 'edit_benchtop_edges') bt.commitEdgeEdit(); else bt.commitShapeEdit() }}
            onDiscard={() => { setBtSavePrompt(false); if (mode === 'edit_benchtop_edges') bt.cancelEdgeEdit(); else bt.cancelShapeEdit() }}
            onKeep={() => setBtSavePrompt(false)}
          />
        )}
        {mode === 'edit_benchtop_edges' && selectedBenchtop && bt.edgeEdit?.btId === selectedBenchtop.id && btEdgeAux && (
          <BenchtopEdgeEditPanel
            benchtop={selectedBenchtop}
            edit={bt.edgeEdit}
            frame={bt.viewFrameFor(selectedBenchtop)}
            profiles={btCatalog.profiles}
            defaultProfileId={btCatalog.defaultProfileIdFor(selectedBenchtop)}
            tapes={btCatalog.tapes}
            tapeCtx={btCatalog.tapeContextFor(selectedBenchtop)}
            legHeight={(selectedBenchtop.height_mm ?? btBaseHeight) + btCatalog.thicknessFor(selectedBenchtop).total}
            edgeThickness={btCatalog.thicknessFor(selectedBenchtop).total}
            onPaint={(i, reset) => bt.paintEdge(i, reset, btEdgeAux)}
            onApply={fn => bt.applyEdges(fn)}
            onUi={bt.setEdgeEditUi}
            onHover={i => setBtEdgeHover(i == null ? null : { btId: selectedBenchtop.id, i })}
            onSave={bt.commitEdgeEdit}
            onCancel={bt.cancelEdgeEdit}
            onUndo={bt.edgeEditUndo}
          />
        )}
        {mode !== 'place_fixture' && selectedFixture && (
          <FixturePanel
            fixture={selectedFixture}
            walls={walls}
            onUpdate={(id, patch) => void fx.update(id, patch)}
            onDelete={id => void fx.remove(id)}
            onMove={id => { if (canvasView !== 'plan') switchView('plan'); fx.startMove(id) }}
            onTurn={(id, deg) => void fx.rotateBy(id, deg)}
            onOpen={id => setViewFixtureId(id)}
          />
        )}
        {mode !== 'place_definition' && mode !== 'edit_benchtop_shape' && mode !== 'edit_benchtop_edges' && selectedBenchtop && (
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
            profiles={btCatalog.profiles}
            method={btCatalog.methodFor(selectedBenchtop)}
            onEditShape={bt.openShapeEditor}
            onDrawJoin={() => { bt.resetDraw(); setMode('draw_benchtop_join') }}
            onDeleteJoin={bt.handleDeleteJoin}
            onSetJoinType={bt.handleSetJoinType}
            walls={walls}
            position={selectedBtPos}
            wallLength={walls.find(w => w.id === selectedBenchtop.wall_id)?.length ?? null}
            overhang={selectedBtOverhang}
            onStretch={bt.handleStretch}
            baseHeight={btBaseHeight}
            thickness={btCatalog.thicknessFor(selectedBenchtop)}
            onSetPosition={bt.handleSetPosition}
            onReanchor={bt.handleReanchor}
            onMove={() => { if (canvasView !== 'plan') switchView('plan'); bt.startMoveBenchtop() }}
            tapes={btCatalog.tapes}
            tapeCtx={btCatalog.tapeContextFor(selectedBenchtop)}
            onEditEdges={startEdgeEdit}
            edgesChanged={bt.edgesChangedId === selectedBenchtop.id}
            onResolved={() => bt.setEdgesChangedId(null)}
          />
        )}
        {bt.shapeEditDraft && (() => {
          const method = btCatalog.methodFor(bt.shapeEditDraft)
          return (
            <BenchtopShapeEditor
              key="new"
              isNew
              benchtop={bt.shapeEditDraft}
              benchtops={benchtops}
              walls={walls}
              cabinets={cabinets}
              profiles={btCatalog.profiles}
              defaultProfileId={method?.default_edge_profile_id ?? null}
              defaultLabel={method ? `${method.name} default` : 'Method default'}
              onSave={segs => bt.handleDraftSave(segs)}
              onClose={() => bt.setShapeEditDraft(null)}
            />
          )
        })()}
        {bt.shapeEditId && (() => {
          const editing = benchtops.find(b => b.id === bt.shapeEditId)
          if (!editing) return null
          const method = btCatalog.methodFor(editing)
          return (
            <BenchtopShapeEditor
              key={editing.id}
              benchtop={editing}
              benchtops={benchtops}
              walls={walls}
              cabinets={cabinets}
              profiles={btCatalog.profiles}
              defaultProfileId={method?.default_edge_profile_id ?? null}
              defaultLabel={method ? `${method.name} default` : 'Method default'}
              onSave={segs => bt.handleShapeEditorSave(editing.id, segs)}
              onClose={() => bt.setShapeEditId(null)}
            />
          )
        })()}
        </div>

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
            fixtureId: contextMenu.fixtureId,
            fixture: {
              onView:   id => { setContextMenu(null); setViewFixtureId(id) },
              onMove:   id => { setContextMenu(null); if (canvasView !== 'plan') switchView('plan'); fx.startMove(id) },
              onTurn:   id => { setContextMenu(null); void fx.rotateBy(id, 90) },
              onDelete: id => { setContextMenu(null); setSelected(null); void fx.remove(id) },
            },
            onDeleteBenchtop: id => void bt.handleDeleteBenchtop(id),
            onDeleteBenchtopVertex: bt.handleDeleteBenchtopVertex,
            onRoundCorner: bt.handleRoundCorner,
            onChamfer: bt.handleChamfer,
            onEditBenchtopShape: id => { if (canvasView !== 'plan') switchView('plan'); bt.startShapeEdit(id) },
            onEditBenchtopEdges: startEdgeEdit,
            onOpenShapeEditor: id => { setContextMenu(null); bt.openShapeEditor(id) },
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
                  const cx2 = centroid(walls)
                  const inw = wallInwardNormal(raw.wall, cx2)
                  return (mouseWorld.x - raw.wall.pos_x) * inw.x + (mouseWorld.y - raw.wall.pos_y) * inw.y < 0
                })()
                const copySide = copyFlip ? 'back' : 'face'
                const occupied = cabinets
                  .filter(c => c.wall_id === raw.wall.id && !c.is_kick_assembly && cabsBlock(cab, c, raw.wall, room) && cabWallSide(c, raw.wall) === copySide)
                  .map(c => ({ t: cabT(c, raw.wall), dx: c.dx })).concat(wfOcc(raw.wall, copySide, cab))
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
            onSaveToLibrary: isAdmin ? id => { setContextMenu(null); setSaveLibCabId(id) } : undefined,
            onReplace: id => { setContextMenu(null); setReplaceCabId(id) },
            onJoinKicks: id => { void handleJoinKicks(id) },
            onDetachKick: id => { void handleDetachKickSingle(id) },
            onSeparateKicks: id => { void handleSeparateKicks(id) },
            onKickSettings: id => {
              setContextMenu(null)
              const rid = cabinets.find(c => c.id === id)?.kick_run_id
              if (rid) setKickSettingsRunId(rid)
            },
          })}
          onClose={() => setContextMenu(null)}
        />
      )}

      {viewFixtureId && (() => {
        const f = fixtures.find(x => x.id === viewFixtureId)
        if (!f) return null
        return (
          <FixtureViewModal
            fixture={f}
            walls={walls}
            onUpdate={(id, patch) => void fx.update(id, patch)}
            onDelete={id => void fx.remove(id)}
            onMove={id => { if (canvasView !== 'plan') switchView('plan'); fx.startMove(id) }}
            onTurn={(id, deg) => void fx.rotateBy(id, deg)}
            onClose={() => setViewFixtureId(null)}
          />
        )
      })()}

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
            onCustomPartsChange={(cabinetId, parts) => setResolvedParts(m => {
              const r = m.get(cabinetId)
              if (!r) return m
              return new Map(m).set(cabinetId, { ...r, custom_parts: parts as unknown as typeof r.custom_parts })
            })}
          />
        )
      })()}

      {deleteWallPending && (
        <ConfirmDeleteModal
          title="Delete Wall"
          message="Cabinets on this wall will also be removed. This cannot be undone."
          onConfirm={confirmDeleteWall}
          onCancel={() => setDeleteWallPending(null)}
        />
      )}

      {deleteCabsPending && (
        <ConfirmDeleteModal
          title={deleteCabsPending.length === 1 ? 'Delete Cabinet' : `Delete ${deleteCabsPending.length} Cabinets`}
          message={deleteCabsPending.length === 1
            ? 'Delete this cabinet?'
            : `Delete the ${deleteCabsPending.length} selected cabinets?`}
          onConfirm={() => void confirmDeleteCabinets()}
          onCancel={() => setDeleteCabsPending(null)}
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

      {replaceCabId && (() => {
        const cab = cabinets.find(c => c.id === replaceCabId)
        if (!cab) return null
        return (
          <ReplaceCabinetModal
            cab={cab}
            onClose={() => setReplaceCabId(null)}
            onReplace={(defId, keepWidth, keepHeight) => { setReplaceCabId(null); void handleReplaceCabinet(cab.id, defId, keepWidth, keepHeight) }}
          />
        )
      })()}

      {kickSettingsRunId && (() => {
        const asm = cabinets.find(c => c.kick_run_id === kickSettingsRunId && c.is_kick_assembly)
        if (!asm) return null
        return (
          <KickRunSettingsModal
            runId={kickSettingsRunId}
            runLength={asm.dx}
            onClose={() => setKickSettingsRunId(null)}
            onSaved={applyKickMutation}
          />
        )
      })()}

      {toast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[60] bg-gray-800 border border-gray-700 text-gray-100 text-sm px-4 py-2 rounded-lg shadow-xl pointer-events-none">
          {toast}
        </div>
      )}

      {showLayerManager && (
        <LayerManagerPanel
          api={layerSetsApi}
          initialView={canvasView === 'section' ? 'plan' : canvasView}
          activeSetId={activeLayerSet?.id ?? null}
          onPreview={setLayerPreview}
          onUse={chooseLayerSet}
          onClose={() => { setLayerPreview(null); setShowLayerManager(false) }}
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

      {showObjectTree && (
        <ObjectTreeModal
          room={room}
          walls={walls}
          cabinets={cabinets}
          resolvedParts={resolvedParts}
          fixtures={fixtures}
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
          layerSets={layerSetsApi.sets}
          activeLayerSetId={activeLayerSet?.id ?? null}
          onClose={() => setReportScope(null)}
        />
      )}

    </div>
  )
}
