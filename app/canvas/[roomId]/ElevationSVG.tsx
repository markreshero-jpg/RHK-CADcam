'use client'
import { useState, useReducer, useRef, useEffect, useMemo } from 'react'
import { useLineScale } from '@/src/lib/usePhone'
import { frontViewHardwareMap } from '@/src/lib/drawerHardwareBoxes'
import { Room, Wall, CabinetInstance, BenchtopInstance, BenchtopEdgeProfile } from '@/src/lib/types'
import { cabT, wallDir, wallEnd, dist, findFreeSlot, slideToFreeSlot, fitFreeSlot, cabsBlock, cabWallSide, centroid, wallAnchorPoint, SNAP_PX, wallCabTop, cabBottomZ, type Pt } from '@/src/lib/geometry'
import { Selected, CabResize, viewReducer, Mode, ArmedDefinition, placeInfoFor, isBenchtopMode, MIN_STRETCH } from './canvasTypes'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import { casePartItem, kickPartItem, internalPartItem, faceZoneItem } from '@/src/lib/displayLayers/registry'
import { customPartItem, CUSTOM_PART_ITEMS } from '@/src/lib/displayLayers/customPartKinds'
import { roundMm } from '@/src/lib/format'
import { customExtents } from '@/src/lib/customPartBox'
import { wheelZoomFactor } from '@/src/lib/wheelZoom'
import { getPalette, paletteToPartColors } from '@/src/lib/partPalette'
import type { ResolvedCabinet, ResolvedCasePart, ResolvedToekickPart, ResolvedFaceZone, ResolvedInternalPart, ResolvedDrawerStack, ResolvedDrawerBoxPart, ResolvedDrawerSlide } from '@/src/lib/resolver/types'
import { computeElevSeams } from '@/src/lib/cabinetSeams'
import {
  computeElevSnap, cabinetElevCorners, ELEV_SNAP_KINDS, ELEV_SNAP_KIND_META,
  type ElevSnapSettings, type ElevSnapResult,
} from '@/src/lib/elevationSnap'
import SnapToolbar from './SnapToolbar'
import { usePinchZoom } from './usePinchZoom'
import { useRightDragPan } from './useRightDragPan'
import { SlideShape, slideBox3, doorProfileSvg } from './cabinetEditSvgHelpers'
import { useSlideTriangles, triKey } from '@/src/lib/slideSilhouette'
import { useHandOpMarkersMulti, HandOpMarkersSVG } from './HandOpMarkers'
import { elevationShowsCabinet } from '@/src/lib/displayLayers/cabinetShown'
import { kickLocal, kickHeightMarks } from '@/src/lib/kickDims'
import BenchtopElevation, { type BtElevInfo } from './BenchtopElevation'
import FixturesElevation, { OpeningHoles } from './FixturesElevation'
import { openingOnWall, elevationFrame, fixtureChainSpans, fixtureLayer, type StretchSide, type FixtureSnap } from '@/src/lib/fixtureGeometry'
import type { RoomFixture } from '@/src/lib/types'
import { isShapedPanelKey } from '@/src/lib/cabinetShape/partKeys'
import { caseBoxAABB, zoneBoxAABB, tkBoxAABB } from '@/src/lib/jointDrilling'
import { handleShapes } from '@/src/lib/handleGeometry'
import { binOutlines } from '@/src/lib/binGeometry'
import { HandleElevSVG, HandleHolesSVG, SharknoseLinesSVG } from './HandleSVG'

// Part line/fill colours come from the editable part palette (src/lib/partPalette.ts),
// resolved per render below. PART_COLORS / LINE_DRAW_COLORS keep their `MAP[key]`
// shape so the call sites are unchanged; both now follow the same palette so a
// category's colour is consistent across normal and line-drawing presets.

function caseElevRect(p: ResolvedCasePart) {
  if (p.part_key === 'left_side' || p.part_key === 'right_side') {
    return { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
  }
  // Shaped-cabinet panels / facet rails: their front-view footprint after AY
  // (true-width facet elevations are z_cabinet_shape Phase 5).
  if (isShapedPanelKey(p.part_key) || p.AY) {
    const b = caseBoxAABB(p)
    return { ex: b.x, ey: b.y + b.h, ew: b.w, eh: b.h }
  }
  return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
}

function tkElevRect(p: ResolvedToekickPart) {
  // Turned bounds: shaped cabinets turn kick boards onto their facet (4b).
  const b = tkBoxAABB(p)
  return { ex: b.x, ey: b.y + b.h, ew: b.w, eh: b.h }
}

function zoneElevRect(z: ResolvedFaceZone) {
  const b = zoneBoxAABB(z)   // face: DX=width, DY=height; facet zones turn by AY (true width = Phase 5)
  return { ex: b.x, ey: b.y + b.h, ew: b.w, eh: b.h }
}

function shelfElevRect(p: ResolvedInternalPart) {
  switch (p.part_type) {
    case 'inner_drawer_front':
    case 'inner_drawer_back':
    case 'pull_out_back':
      // Face panel (drawer-box convention): DY = width (X), DX = height (Y)
      return { ex: p.X, ey: p.Y + p.DX, ew: p.DY, eh: p.DX }
    case 'inner_drawer_side':
    case 'pull_out_side':
      // Side panel edge-on: DZ = visible thickness (X), DY = height (Y)
      return { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
    case 'inner_drawer_bottom':
    case 'pull_out_bottom':
      // Bottom panel edge-on: DY = width (X), DZ = visible thickness (Y)
      return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
    case 'divider':
      // Divider edge-on: DZ = thickness (X), DY = height (Y)
      return { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
    default:
      // adj_shelf, fixed_shelf, accessory — shelf-like (Y = thickness DZ)
      return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
  }
}

function drawerBoxPartElevRect(p: ResolvedDrawerBoxPart) {
  switch (p.part_type) {
    case 'db_front':
    case 'db_back':
      // Face-on panels: DX = height, DY = width
      return { ex: p.X, ey: p.Y + p.DX, ew: p.DY, eh: p.DX }
    case 'db_left_side':
    case 'db_right_side':
      // Side panels, edge-on from front: DY = height, DZ = visible thickness
      return { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
    case 'db_bottom':
      // Bottom panel, edge-on: DY = width, DZ = visible thickness
      return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
  }
}

function slideElevRect(s: ResolvedDrawerSlide) {
  // Slide rail seen edge-on from front: DZ = visible thickness (runner), DY = height
  return { ex: s.X, ey: s.Y + s.DY, ew: s.DZ, eh: s.DY }
}


// xOf = the cabinet's left edge in elevation x (mirrored on the back side);
// `extra` = appliances in the row, already in elevation x.
function computeElevChain(cabs: CabinetInstance[], wall: Wall, xOf: (c: CabinetInstance) => number, extra: { t: number; dx: number }[] = []) {
  const sorted = [...cabs.map(c => ({ t: xOf(c), dx: c.dx })), ...extra].sort((a, b) => a.t - b.t)
  const segs: { from: number; to: number; label: number }[] = []
  let cursor = 0
  for (const { t, dx } of sorted) {
    if (t > cursor + 0.5) segs.push({ from: cursor, to: t, label: roundMm(t - cursor) })
    segs.push({ from: t, to: t + dx, label: roundMm(dx) })
    cursor = t + dx
  }
  if (cursor < wall.length - 0.5) segs.push({ from: cursor, to: wall.length, label: roundMm(wall.length - cursor) })
  return segs
}

interface ElevationSVGProps {
  walls: Wall[]
  cabinets: CabinetInstance[]
  room: Room
  elevWallId: string | null
  selected: Selected
  layers: LayerView
  multiSelect: string[]
  canEqualize: boolean
  mode: Mode
  armedDef: ArmedDefinition | null
  clipboard: CabinetInstance | null
  clipboardGroup: CabinetInstance[]
  onSelectCabinet: (id: string) => void
  onSelectWall: (id: string) => void
  onSetElevWall: (id: string) => void
  elevWallSide: 'face' | 'back'
  onSetElevWallSide: (side: 'face' | 'back') => void
  onUpdateCabinet: (id: string, u: Partial<CabinetInstance>) => void
  onPlaceAtWall: (wall: Wall, pos_x: number, pos_y: number, dx?: number) => Promise<void>
  onCabinetContextMenu: (e: React.MouseEvent, cabId: string) => void
  onBlankWallContextMenu: (e: React.MouseEvent, wallId: string, wallT: number) => void
  onFixtureContextMenu?: (e: React.MouseEvent, fixtureId: string) => void
  onShiftSelectCabinet: (id: string) => void
  onMarqueeSelect: (ids: string[]) => void
  onEqualizeWidths: (targetDx?: number) => void
  cabResize: CabResize | null
  onCabResizeStart: (r: CabResize) => void
  onCabResizeUpdate: (updates: { liveValue: number; livePosX?: number; livePosY?: number }) => void
  onCabResizeDone: () => void
  resolvedParts?: Map<string, ResolvedCabinet>
  onDeselect: () => void
  onSeamClick?: (cabId: string, edgeKey: string, label: string) => void
  onCabinetDoubleClick?: (e: React.MouseEvent, cabId: string) => void
  // Measure-tool + snap state (parent-owned so view switches clear it cleanly)
  elevSnapSettings:  ElevSnapSettings
  onElevSnapSettingsChange: (s: ElevSnapSettings) => void
  elevSnapResult:    ElevSnapResult | null
  setElevSnapResult: (r: ElevSnapResult | null) => void
  elevMeasureStart:  Pt | null
  elevMeasureEnd:    Pt | null
  elevMeasureCursor: Pt | null
  setElevMeasureStart:  (p: Pt | null) => void
  setElevMeasureEnd:    (p: Pt | null) => void
  setElevMeasureCursor: (p: Pt | null) => void
  // Benchtops (Phase 3b, P-h) — drawn over the cabinets at their top height
  benchtops?: BenchtopInstance[]
  benchtopInfo?: (bt: BenchtopInstance) => BtElevInfo
  edgeProfiles?: Record<string, BenchtopEdgeProfile>
  onSelectBenchtop?: (id: string) => void
  // Along-wall ranges of waterfall legs that block a mover on this wall + side
  waterfallOcc?: (wall: Wall, side: 'face' | 'back', mover: { assembly_class: string; dy: number; dz?: number }) => { t: number; dx: number }[]
  // Fixtures & appliances (z_fixtures P2)
  fixtures?: RoomFixture[]
  /** Fixtures that overlap a cabinet / another fixture (red, like plan). */
  fixtureClashIds?: Set<string>
  onSelectFixture?: (id: string) => void
  /** P7: fixture edge stretch — handle grab, live cursor, commit (the canvas owns the state). */
  fixtureStretching?: { id: string; side: StretchSide } | null
  onFixtureStretchHandle?: (id: string, side: StretchSide) => void
  onFixtureStretchMove?: (cursor: { p?: Pt; z?: number }) => void
  onFixtureStretchCommit?: () => void
  /** Placing / moving a fixture here (mode 'place_fixture'): cursor → plan point just off this face. */
  fixtureGhost?: { snap: FixtureSnap; body: Pick<RoomFixture, 'category' | 'name' | 'width' | 'depth' | 'height'>; z: number } | null
  onFixtureCarryMove?: (p: Pt) => void
  onFixtureCarryDrop?: (p: Pt) => void
  onFixtureMoveHandle?: (id: string) => void
}

export default function ElevationSVG({
  walls, cabinets, room, elevWallId, selected, layers,
  multiSelect, canEqualize, mode, armedDef, clipboard, clipboardGroup,
  onSelectCabinet, onSelectWall, onSetElevWall, onUpdateCabinet, onPlaceAtWall, onCabinetContextMenu,
  onBlankWallContextMenu, onFixtureContextMenu, onShiftSelectCabinet, onMarqueeSelect, onEqualizeWidths,
  cabResize, onCabResizeStart, onCabResizeUpdate, onCabResizeDone,
  resolvedParts: resolvedPartsRaw, onDeselect, onSeamClick, onCabinetDoubleClick, elevWallSide, onSetElevWallSide,
  elevSnapSettings, onElevSnapSettingsChange,
  elevSnapResult, setElevSnapResult,
  elevMeasureStart, elevMeasureEnd, elevMeasureCursor,
  setElevMeasureStart, setElevMeasureEnd, setElevMeasureCursor,
  benchtops, benchtopInfo, edgeProfiles, onSelectBenchtop, waterfallOcc,
  fixtures, fixtureClashIds, onSelectFixture,
  fixtureStretching, onFixtureStretchHandle, onFixtureStretchMove, onFixtureStretchCommit,
  fixtureGhost, onFixtureCarryMove, onFixtureCarryDrop, onFixtureMoveHandle,
}: ElevationSVGProps) {
  // Turned facet hardware (z_cabinet_shape 3b) flattened to cabinet X/Y for this front view.
  const resolvedParts = useMemo(() => frontViewHardwareMap(resolvedPartsRaw), [resolvedPartsRaw])
  const svgRef = useRef<SVGSVGElement>(null)
  const lineScale = useLineScale()
  const [view, dispatchView] = useReducer(viewReducer, { panX: 80, panY: 60, zoom: 1 })
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const spaceRef = useRef(false)
  const shiftRef = useRef(false)
  const ctrlRef  = useRef(false)
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null)
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  // Click-to-grab following state
  const [elevCabFollowing, setElevCabFollowing] = useState<{ id: string } | null>(null)
  // Cursor position in wall coords: t = along wall (mm), ht = height above floor (mm)
  const [elevCabFloat, setElevCabFloat] = useState<{ t: number; ht: number } | null>(null)

  const [hoveredCabId, setHoveredCabId] = useState<string | null>(null)
  const [sectionMode, setSectionMode] = useState(false)
  const [sectionDepth, setSectionDepth] = useState(0)
  const [placeGhost, setPlaceGhost] = useState<{ t: number; cls: string; dx: number; dy: number; cursorT: number; cursorSY: number } | null>(null)
  const [elevResizeFollowing, setElevResizeFollowing] = useState<{
    cabId: string; dim: 'dx' | 'dy'; side: 'left' | 'right' | 'top'
    startCabT: number; startCabEndT: number
    resWall: Wall; neighbours: { t: number; dx: number }[]
  } | null>(null)
  const [elevResizeLive, setElevResizeLive] = useState<{
    cabId: string; dim: 'dx' | 'dy'; value: number; posX?: number; posY?: number
  } | null>(null)
  // The parent can end the resize without us (typed value + Enter / Apply / Esc in
  // CabinetResizePanel). Drop the local mouse-follow state with it, otherwise the
  // cabinet keeps tracking the cursor and the next click overwrites the typed value.
  if (!cabResize && (elevResizeFollowing || elevResizeLive)) {
    setElevResizeFollowing(null)
    setElevResizeLive(null)
  }
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
  const wallCabs = wall ? cabinets.filter(c => c.wall_id === wall.id && cabWallSide(c, wall) === elevWallSide) : []
  // Elevation x runs left→right as seen by someone facing that side of the wall.
  // The face side looks from inside the room, so x = along-wall distance t. The
  // back side looks from outside, so the wall runs right-to-left: x = length − t.
  // Everything in this view (occupancy, snapping, ghosts, chains) works in
  // elevation x; only the commit sites convert back to wall space via elevPos.
  const isBack = elevWallSide === 'back'
  const mirrorX = (t: number, dx: number) => (isBack && wall ? wall.length - t - dx : t)
  /** Cabinet's left edge in elevation x. */
  const elevX = (c: CabinetInstance) => (wall ? mirrorX(cabT(c, wall), c.dx) : 0)
  /** Wall-space anchor (pos_x/pos_y) for a cabinet whose left edge sits at
   *  elevation x with width dx — the canonical landing for this side (back-side
   *  cabinets sit on the wall's outer face, see wallAnchorPoint). */
  const elevPos = (w: Wall, x: number, dx: number) => {
    const gc = centroid(walls)
    return wallAnchorPoint(w, isBack ? w.length - x - dx : x, isBack, gc)
  }
  // Waterfall legs on this wall + side, as occupied ranges for the given mover.
  const wfOcc = (mover: { assembly_class: string; dy: number; dz?: number }) =>
    wall && waterfallOcc
      ? waterfallOcc(wall, elevWallSide, mover).map(o => ({ t: mirrorX(o.t, o.dx), dx: o.dx }))
      : []
  // Dimension chains measure only cabinets the layer set draws.
  const chainCabs = wallCabs.filter(c => elevationShowsCabinet(c, layers, resolvedParts?.get(c.id)))
  // Free-standing appliances on this face, in elevation x, for the floor / wall rows.
  const chainFx = wall && fixtures
    ? fixtureChainSpans(fixtures.filter(f => layers.show(fixtureLayer(f.category))), wall, centroid(walls))
      .filter(s => s.side === elevWallSide).map(s => ({ row: s.row, t: mirrorX(s.t, s.dx), dx: s.dx }))
    : []
  const chainFxWall = chainFx.filter(s => s.row === 'wall'), chainFxFloor = chainFx.filter(s => s.row === 'floor')
  // Hand-added part_operations for every cabinet on this wall → cabinet-space markers.
  const handMarkersByCab = useHandOpMarkersMulti(wallCabs.map(c => c.id), resolvedParts)

  // Drawer-slide model outlines: load every slide's uploaded 3D model across all
  // cabinets on this wall (a hook, so it must run unconditionally at the top level).
  // The elevation then draws each rail's TRUE projected silhouette instead of its
  // bounding box — falling back to the box for slides with no model attached.
  const allWallSlides: ResolvedDrawerSlide[] = []
  for (const cab of wallCabs) {
    const rp = resolvedParts?.get(cab.id)
    if (rp) allWallSlides.push(...(rp.drawer_stacks ?? []).flatMap(s => s.slides), ...(rp.internal_slides ?? []))
  }
  const triMap = useSlideTriangles(allWallSlides)

  const roomH = wall?.height ?? room.room_dy ?? 2400
  const maxDz = wallCabs.length > 0 ? Math.max(300, ...wallCabs.map(c => c.dz)) : 600
  const FACE_THICK = 20

  // Measure-tool snap points: the corners of every drawn resolved part / runner /
  // face on this wall, in elevation coords. Mirrors the render's per-cabinet
  // transform (rx = cabT, top y = roomH − bottomZ − dy; part rect ey is top-up) so
  // each snap point sits exactly on a drawn corner. Drilling is intentionally
  // excluded — it isn't drawn in this view.
  const partSnapPoints = useMemo<Pt[]>(() => {
    if (!wall) return []
    const pts: Pt[] = []
    for (const cab of wallCabs) {
      const rp = resolvedParts?.get(cab.id)
      if (!rp) continue
      const rx = elevX(cab)
      const topY = roomH - cabBottomZ(cab, room, wall) - cab.dy
      const push = (ex: number, ey: number, ew: number, eh: number) => {
        const x0 = rx + ex, x1 = rx + ex + ew
        const y0 = topY + cab.dy - ey, y1 = y0 + eh
        pts.push({ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 })
      }
      rp.case_parts.filter(p => p.part_key !== 'back').forEach(p => { const r = caseElevRect(p); push(r.ex, r.ey, r.ew, r.eh) })
      rp.toekick_parts.forEach(p => { const r = tkElevRect(p); push(r.ex, r.ey, r.ew, r.eh) })
      rp.internal_parts.forEach(p => { const r = shelfElevRect(p); push(r.ex, r.ey, r.ew, r.eh) })
      ;(rp.internal_slides ?? []).forEach(s => { const r = slideElevRect(s); push(r.ex, r.ey, r.ew, r.eh) })
      rp.drawer_stacks.forEach(ds => {
        ds.box_parts.forEach(p => { const r = drawerBoxPartElevRect(p); push(r.ex, r.ey, r.ew, r.eh) })
        ds.slides.forEach(s => { const r = slideElevRect(s); push(r.ex, r.ey, r.ew, r.eh) })
      })
      rp.face_zones.forEach(fz => { const r = zoneElevRect(fz); push(r.ex, r.ey, r.ew, r.eh) })
    }
    return pts
  }, [wallCabs, resolvedParts, wall, room, roomH, isBack])

  // All enabled snap candidates, used to draw the faint white "near the cursor"
  // dot hints (mirrors the modal). Same set computeElevSnap considers.
  const snapHintPoints = useMemo<Pt[]>(() => {
    if (!wall || !elevSnapSettings.enabled) return []
    const pts: Pt[] = []
    if (elevSnapSettings.kinds['wall-corner']) {
      pts.push({ x: 0, y: 0 }, { x: wall.length, y: 0 }, { x: 0, y: roomH }, { x: wall.length, y: roomH })
    }
    if (elevSnapSettings.kinds['cabinet-corner']) {
      for (const cab of wallCabs) for (const c of cabinetElevCorners(cab, wall, room, roomH, isBack)) pts.push(c)
    }
    if (elevSnapSettings.kinds['part-corner']) pts.push(...partSnapPoints)
    return pts
  }, [wall, elevSnapSettings, wallCabs, room, roomH, partSnapPoints])
  // Keep rfData current on every render (synchronous assignment, no useEffect needed).
  rfData.current = { elevResizeFollowing, view, cabinets, room }

  useEffect(() => {
    setPlaceGhost(null)
    setElevCabFollowing(null)
    setElevCabFloat(null)
    setElevResizeFollowing(null)
    setElevResizeLive(null)
    marqueeStartRef.current = null
    setMarquee(null)
  }, [mode])

  // Fit to wall on wall change; also clears any in-progress following
  useEffect(() => {
    setElevCabFollowing(null)
    setElevCabFloat(null)
    setElevResizeFollowing(null)
    setElevResizeLive(null)
    marqueeStartRef.current = null
    setMarquee(null)
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
      const factor = wheelZoomFactor(e)
      dispatchView({ type: 'zoom', factor, svgX: e.clientX - r.left, svgY: e.clientY - r.top })
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [])

  usePinchZoom(svgRef, dispatchView)
  useRightDragPan(svgRef, dispatchView)

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === ' ') { spaceRef.current = true; e.preventDefault() }
      if (e.key === 'Shift') shiftRef.current = true
      if (e.key === 'Control') ctrlRef.current = true
      if (e.key === 'Escape') {
        setElevCabFollowing(null); setElevCabFloat(null)
        setElevResizeFollowing(null); setElevResizeLive(null); onCabResizeDone()
        marqueeStartRef.current = null; setMarquee(null)
        setElevMeasureStart(null); setElevMeasureEnd(null); setElevMeasureCursor(null)
        setElevSnapResult(null)
      }
    }
    const ku = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceRef.current = false
      if (e.key === 'Shift') shiftRef.current = false
      if (e.key === 'Control') ctrlRef.current = false
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
    // Measure tool — the click itself is handled in onPointerUp (plan-canvas pattern).
    if (e.button === 0 && wall && mode === 'measure') { e.preventDefault(); return }
    if (e.button === 0 && wall && (placeInfoFor(mode, armedDef) || mode === 'paste')) {
      svgRef.current?.setPointerCapture(e.pointerId)
      return
    }
    if (e.button === 0 && mode === 'select' && wall) {
      onDeselect()
      const svgR = svgRef.current!.getBoundingClientRect()
      const x = (e.clientX - svgR.left - view.panX) / view.zoom
      const y = (e.clientY - svgR.top  - view.panY) / view.zoom
      marqueeStartRef.current = { x, y }
      svgRef.current?.setPointerCapture(e.pointerId)
    }
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

    // Carrying a fixture (F6 place / Move): elevation x → a plan point just in front of
    // this face, so it snaps to this wall and side.
    if (mode === 'place_fixture' && wall && onFixtureCarryMove) {
      onFixtureCarryMove(fixtureCarryPoint(e))
      return
    }

    // Fixture edge stretch (P7): elevation x → a plan point on this face's frame, y → height.
    if (fixtureStretching && wall && onFixtureStretchMove) {
      const svgR = svgRef.current!.getBoundingClientRect()
      const ex = (e.clientX - svgR.left - view.panX) / view.zoom
      const ey = (e.clientY - svgR.top - view.panY) / view.zoom
      const fr = elevationFrame(wall, elevWallSide, centroid(walls))
      onFixtureStretchMove({ p: { x: fr.o.x + fr.d.x * ex, y: fr.o.y + fr.d.y * ex }, z: roomH - ey })
      return
    }

    // Resize following — read from ref so view/elevResizeFollowing are always fresh (no stale closure)
    const rf = rfData.current.elevResizeFollowing
    if (rf) {
      const { cabId, dim, side, startCabT, startCabEndT, resWall, neighbours } = rf
      const v = rfData.current.view
      const svgR = svgRef.current!.getBoundingClientRect()
      const vz = v.zoom
      const snap10 = (n: number) => Math.round(n / 10) * 10
      // startCabT / neighbours are elevation x. The anchor moves whenever the
      // wall-space start end moves — the elevation-left handle on the face side,
      // the elevation-right handle on the back side — so always send it.
      if (side === 'right') {
        const cursorT = (e.clientX - svgR.left - v.panX) / vz
        const rightBound = neighbours.filter(o => o.t > startCabT + 1).reduce((min, o) => Math.min(min, o.t), resWall.length)
        const newDx = Math.max(MIN_STRETCH, Math.min(rightBound - startCabT, snap10(cursorT - startCabT)))
        const { x: livePosX, y: livePosY } = elevPos(resWall, startCabT, newDx)
        setElevResizeLive({ cabId, dim, value: newDx, posX: livePosX, posY: livePosY })
        onCabResizeUpdate({ liveValue: newDx, livePosX, livePosY })
      } else if (side === 'left') {
        const cursorT = (e.clientX - svgR.left - v.panX) / vz
        const leftBound = neighbours.filter(o => o.t + o.dx < startCabEndT - 1).reduce((max, o) => Math.max(max, o.t + o.dx), 0)
        const newDx = Math.max(MIN_STRETCH, Math.min(startCabEndT - leftBound, snap10(startCabEndT - cursorT)))
        const newT = startCabEndT - newDx
        const { x: livePosX, y: livePosY } = elevPos(resWall, newT, newDx)
        setElevResizeLive({ cabId, dim, value: newDx, posX: livePosX, posY: livePosY })
        onCabResizeUpdate({ liveValue: newDx, livePosX, livePosY })
      } else if (side === 'top') {
        const cursorY = (e.clientY - svgR.top - v.panY) / vz
        const cab = rfData.current.cabinets.find(c => c.id === cabId)
        if (cab) {
          const rm = rfData.current.room
          const rH = rm.room_dy ?? 2400
          const newDy = Math.max(MIN_STRETCH, Math.min(5000, snap10(rH - cabBottomZ(cab, rm, resWall) - cursorY)))
          setElevResizeLive({ cabId, dim: 'dy', value: newDy })
          onCabResizeUpdate({ liveValue: newDy })
        }
      }
      return
    }

    // Measure tool — track cursor with snap
    if (mode === 'measure' && wall) {
      const svgR = svgRef.current!.getBoundingClientRect()
      const wp: Pt = {
        x: (e.clientX - svgR.left - view.panX) / view.zoom,
        y: (e.clientY - svgR.top  - view.panY) / view.zoom,
      }
      const snap = computeElevSnap(wp, { wallCabs, wall, room, roomH, back: isBack, partPoints: partSnapPoints }, elevSnapSettings, SNAP_PX / view.zoom,
        elevMeasureStart, { ortho: ctrlRef.current, ortho45: shiftRef.current })
      setElevSnapResult(snap.kind ? snap : null)
      setElevMeasureCursor(snap.pt)
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

    // Marquee drag — selection rectangle in select mode
    if (marqueeStartRef.current && mode === 'select') {
      const svgR = svgRef.current!.getBoundingClientRect()
      const x = (e.clientX - svgR.left - view.panX) / view.zoom
      const y = (e.clientY - svgR.top  - view.panY) / view.zoom
      setMarquee({ x1: marqueeStartRef.current.x, y1: marqueeStartRef.current.y, x2: x, y2: y })
      return
    }

    // Placement ghost — track cursor when in a place mode
    const clsInfo = placeInfoFor(mode, armedDef)
    if ((clsInfo || mode === 'paste') && wall) {
      const svgR = svgRef.current!.getBoundingClientRect()
      const cursorT = (e.clientX - svgR.left - view.panX) / view.zoom
      const cursorSY = (e.clientY - svgR.top  - view.panY) / view.zoom
      const dims = clsInfo
        ? { dx: clsInfo.dx, dy: clsInfo.dy, dz: clsInfo.dz }
        : clipboard ? { dx: clipboard.dx, dy: clipboard.dy, dz: clipboard.dz } : null
      if (dims) {
        const cls = clsInfo?.cls ?? clipboard!.assembly_class
        const occ = wallCabs
          .filter(c => !c.is_kick_assembly && cabsBlock({ assembly_class: cls, dy: dims.dy }, c, wall, room))
          .map(c => ({ t: elevX(c), dx: c.dx })).concat(wfOcc({ assembly_class: cls, dy: dims.dy, dz: dims.dz }))
        if (clsInfo) {
          // Placing a new cabinet from the library: fit it into the available gap,
          // shrinking the width when the gap is narrower than the default.
          const fit = fitFreeSlot(cursorT, dims.dx, wall.length, occ)
          setPlaceGhost({ t: fit.t, cls, dx: fit.dx, dy: dims.dy, cursorT, cursorSY })
        } else {
          // Paste keeps the copied cabinet's size; just centre + slot it.
          const t = findFreeSlot(Math.max(0, Math.min(wall.length - dims.dx, cursorT - dims.dx / 2)), dims.dx, wall.length, occ)
          setPlaceGhost({ t, cls, dx: dims.dx, dy: dims.dy, cursorT, cursorSY })
        }
      }
      return
    }
    if (mode === 'select') setPlaceGhost(null)
  }

  // Plan point for a fixture carried in elevation: on this face at the cursor's x,
  // 1 mm out from it (into the room on the face side, outside on the back).
  function fixtureCarryPoint(e: React.PointerEvent): Pt {
    const svgR = svgRef.current!.getBoundingClientRect()
    const ex = (e.clientX - svgR.left - view.panX) / view.zoom
    const fr = elevationFrame(wall!, elevWallSide, centroid(walls))
    return { x: fr.o.x + fr.d.x * ex + fr.n.x, y: fr.o.y + fr.d.y * ex + fr.n.y }
  }

  async function onPointerUp(e: React.PointerEvent) {
    const wasPanning = panRef.current !== null
    panRef.current = null
    if (wasPanning || elevCabFollowing) {
      marqueeStartRef.current = null
      setMarquee(null)
      return
    }

    if (elevResizeFollowing) { await confirmResize(); return }
    if (fixtureStretching) { onFixtureStretchCommit?.(); return }
    if (mode === 'place_fixture' && wall && onFixtureCarryDrop) { onFixtureCarryDrop(fixtureCarryPoint(e)); return }

    // Measure tool — first click sets start, second sets end; further clicks restart.
    if (mode === 'measure' && wall) {
      const svgR = svgRef.current!.getBoundingClientRect()
      const wp: Pt = {
        x: (e.clientX - svgR.left - view.panX) / view.zoom,
        y: (e.clientY - svgR.top  - view.panY) / view.zoom,
      }
      const snap = computeElevSnap(wp, { wallCabs, wall, room, roomH, back: isBack, partPoints: partSnapPoints }, elevSnapSettings, SNAP_PX / view.zoom,
        elevMeasureStart, { ortho: ctrlRef.current, ortho45: shiftRef.current })
      if (!elevMeasureStart || elevMeasureEnd) {
        setElevMeasureStart(snap.pt); setElevMeasureEnd(null); setElevMeasureCursor(snap.pt)
      } else {
        setElevMeasureEnd(snap.pt)
      }
      return
    }

    if ((placeInfoFor(mode, armedDef) || mode === 'paste') && wall && placeGhost) {
      const { x: pos_x, y: pos_y } = elevPos(wall, placeGhost.t, placeGhost.dx)
      const fitDx = placeInfoFor(mode, armedDef) ? placeGhost.dx : undefined
      setPlaceGhost(null)
      await onPlaceAtWall(wall, pos_x, pos_y, fitDx)
      return
    }

    // Marquee finalize — select cabinets the box fully encloses
    if (marqueeStartRef.current && wall) {
      const start = marqueeStartRef.current
      marqueeStartRef.current = null
      setMarquee(null)
      const svgR = svgRef.current!.getBoundingClientRect()
      const endX = (e.clientX - svgR.left - view.panX) / view.zoom
      const endY = (e.clientY - svgR.top  - view.panY) / view.zoom
      const widthPx  = Math.abs(endX - start.x) * view.zoom
      const heightPx = Math.abs(endY - start.y) * view.zoom
      if (widthPx > 5 || heightPx > 5) {
        const minX = Math.min(start.x, endX), maxX = Math.max(start.x, endX)
        const minY = Math.min(start.y, endY), maxY = Math.max(start.y, endY)
        const ids = wallCabs.filter(cab => {
          const left = elevX(cab), right = left + cab.dx
          const top  = roomH - cabBottomZ(cab, room, wall) - cab.dy, bottom = top + cab.dy
          return left >= minX && right <= maxX && top >= minY && bottom <= maxY
        }).map(c => c.id)
        onMarqueeSelect(ids)
      } else if (endX >= 0 && endX <= wall.length && endY >= 0 && endY <= roomH) {
        // Plain click (not a drag) on the wall face → select the wall so its
        // properties panel opens, matching plan-view behaviour. The wall rect's
        // own onClick never fires here: select-mode pointerdown captures the
        // pointer on the SVG, which retargets the click away from the rect.
        onSelectWall(wall.id)
      }
    }
  }

  async function confirmResize() {
    if (!elevResizeFollowing || !elevResizeLive) return
    const { cabId, dim, side } = elevResizeFollowing
    const { value, posX, posY } = elevResizeLive
    const update: Partial<CabinetInstance> = { [dim]: Math.round(value) }
    if (side !== 'top' && posX !== undefined) {
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
  // Commit the cabinet currently being moved (following mode) at the float
  // position. Called from both onSVGClick (drop on empty wall) and the cabinet
  // click handler (drop directly onto/next to another cabinet) so the drop lands
  // wherever you release — not only on empty space.
  function dropFollowingCab() {
    if (!elevCabFollowing || !elevCabFloat || !wall) return
    const { id } = elevCabFollowing
    const cab = cabinets.find(c => c.id === id)
    if (!cab) { setElevCabFollowing(null); setElevCabFloat(null); return }

    const isWallCab = cab.assembly_class === 'wall' || cab.assembly_class === 'wall_corner'
    const wcTop = wallCabTop(wall, room)
    // Floor units keep their current vertical position (pos_z) on a move — normally 0,
    // but a kick-detached member is raised by the kick height and must stay raised,
    // otherwise it drops back onto its kick assembly and looks re-attached.
    const snapBottomZ = isWallCab ? Math.max(0, wcTop - cab.dy) : (cab.pos_z ?? 0)

    // A kick assembly spans its OWN run members freely (they no longer carry a
    // kick) but clamps against everything else that blocks it — other cabinets,
    // panels, and other kick runs — so two kicks can't overlap. It's never an
    // obstacle for normal units (a plinth sits in front of the carcass).
    const occupied = (cab.is_kick_assembly
      ? wallCabs.filter(c => c.id !== id && c.kick_run_id !== cab.kick_run_id && cabsBlock(cab, c, wall, room))
      : wallCabs.filter(c => c.id !== id && !c.is_kick_assembly && cabsBlock(cab, c, wall, room))
    ).map(c => ({ t: elevX(c), dx: c.dx })).concat(wfOcc(cab))
    const snapT = slideToFreeSlot(
      Math.max(0, Math.min(wall.length - cab.dx, elevCabFloat.t - cab.dx / 2)),
      cab.dx, wall.length, occupied, elevX(cab)
    )
    const { x: pos_x, y: pos_y } = elevPos(wall, snapT, cab.dx)

    setElevCabFollowing(null)
    setElevCabFloat(null)
    // Keep the cabinet on the side being viewed (back = facing away from the room).
    onUpdateCabinet(id, { wall_id: wall.id, pos_x, pos_y, pos_z: snapBottomZ, rotation: isBack ? wall.angle + 180 : wall.angle })
  }

  function onSVGClick() {
    if (elevResizeFollowing) { void confirmResize(); return }
    dropFollowingCab()
  }

  function onCabCrosshairClick(e: React.MouseEvent, cab: CabinetInstance) {
    if (mode !== 'select' || !wall) return
    e.stopPropagation()
    if (elevCabFollowing?.id === cab.id) {
      setElevCabFollowing(null)
      setElevCabFloat(null)
    } else {
      // Seed ghost at cabinet's current centre
      const t  = elevX(cab) + cab.dx / 2
      const ht = cabBottomZ(cab, room, wall) + cab.dy / 2
      setElevCabFollowing({ id: cab.id })
      setElevCabFloat({ t, ht })
      onSelectCabinet(cab.id)
    }
  }

  function onCabPointerDown(e: React.PointerEvent, cab: CabinetInstance) {
    if (e.button !== 0 || !wall || spaceRef.current) return
    if (mode === 'measure') return  // let measure clicks pass through to the svg
    e.stopPropagation()
    // Mid-stretch: a click over a neighbour commits the stretch (clamped against
    // that neighbour) via the svg's onPointerUp — don't select the neighbour.
    if (elevResizeFollowing) return
    if (elevCabFollowing) {
      // Mid-move: don't cancel on pointer-down over a cabinet — let the click
      // event drop it here (handled in the cabinet's onClick / onSVGClick).
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
    const t = elevX(cab)
    const wd = wallDir(wall)
    const perp = { x: -wd.y, y: wd.x }
    const dim: 'dx' | 'dy' = side === 'top' ? 'dy' : 'dx'
    // A kick assembly spans its OWN run members freely (no kick of their own) but
    // clamps against everything else that blocks it (other cabinets/panels/kick
    // runs), so it can't stretch into a cabinet that already has its own kick.
    // It's never an obstacle for normal units (a plinth sits in front of them).
    const neighbours = (cab.is_kick_assembly
      ? wallCabs.filter(c => c.id !== cab.id && c.kick_run_id !== cab.kick_run_id && cabsBlock(cab, c, wall, room))
      : wallCabs.filter(c => c.id !== cab.id && !c.is_kick_assembly && cabsBlock(cab, c, wall, room))
    ).map(c => ({ t: elevX(c), dx: c.dx })).concat(wfOcc(cab))
    setElevResizeFollowing({ cabId: cab.id, dim, side, startCabT: t, startCabEndT: t + cab.dx, resWall: wall, neighbours })
    setElevResizeLive({ cabId: cab.id, dim, value: dim === 'dx' ? cab.dx : cab.dy })
    // The parent's CabResize is in wall space (side 'left' = the end at pos, which
    // moves). On the back side the elevation-left handle is the wall-space right end.
    const wallT = cabT(cab, wall)
    const wallSide = isBack && side !== 'top' ? (side === 'left' ? 'right' : 'left') : side
    onCabResizeStart({
      cabId: cab.id, dim, side: wallSide, wall, perp,
      startCabT: wallT, startCabEndT: wallT + cab.dx,
      liveValue: dim === 'dx' ? cab.dx : cab.dy,
    })
  }

  const isLineDrawing = layers.lineDrawing

  // Editable part-line palette → per-key colour map (see src/lib/partPalette.ts).
  // Read once on mount; the Settings editor persists to localStorage and the
  // canvas re-reads on remount when you navigate back.
  const PART_COLORS = useMemo(() => paletteToPartColors(getPalette()), [])
  const LINE_DRAW_COLORS = PART_COLORS

  const z = view.zoom
  // Strokes divide by the line zoom (finer on phones); text and hit targets use z.
  const lz = z / lineScale
  const labelFs = 11 / z
  const dimFs   =  9 / z
  const tickH   = 30 / z
  const mr      =  6 / z

  return (
    <div className="flex-1 flex flex-col bg-gray-950 overflow-hidden relative" style={{ background: layers.background }}>

      {/* Wall picker + side toggle + equalize strip */}
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
        {walls.length > 1 && wall && (() => {
          const idx = walls.findIndex(w => w.id === wall.id)
          const prev = walls[(idx - 1 + walls.length) % walls.length]
          const next = walls[(idx + 1) % walls.length]
          return (
            <>
              <button onClick={() => onSetElevWall(prev.id)}
                title={`Previous wall (${prev.name})`}
                className="ml-1 px-2 py-0.5 text-[10px] rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800 whitespace-nowrap transition-colors">
                ◀
              </button>
              <button onClick={() => onSetElevWall(next.id)}
                title={`Next wall (${next.name})`}
                className="px-2 py-0.5 text-[10px] rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800 whitespace-nowrap transition-colors">
                ▶
              </button>
            </>
          )
        })()}
        {wall && (
          <>
            <div className="mx-2 h-4 border-l border-gray-700" />
            <span className="text-[10px] text-gray-500 mr-1 whitespace-nowrap select-none">Side:</span>
            {(['face', 'back'] as const).map(s => (
              <button key={s} onClick={() => onSetElevWallSide(s)}
                className={`px-2.5 py-0.5 text-[10px] rounded whitespace-nowrap transition-colors capitalize ${
                  elevWallSide === s
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}>
                {s}
              </button>
            ))}
          </>
        )}
        {canEqualize && (
          <>
            <div className="mx-2 h-4 border-l border-gray-700" />
            <button onClick={() => onEqualizeWidths()}
              title="Equalise to the average width (right-click a cabinet for smallest / largest / custom)"
              className="px-2.5 py-0.5 text-[10px] rounded bg-amber-700/40 text-amber-300 hover:bg-amber-700/60 whitespace-nowrap transition-colors">
              Equalise Widths
            </button>
          </>
        )}
        {wall && (
          <>
            <div className="mx-2 h-4 border-l border-gray-700" />
            <button
              onClick={() => {
                const next = !sectionMode
                setSectionMode(next)
                if (next) setSectionDepth(Math.round(maxDz / 3))
              }}
              className={`px-2.5 py-0.5 text-[10px] rounded whitespace-nowrap transition-colors ${
                sectionMode ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}>
              Section
            </button>
          </>
        )}
        {multiSelect.length >= 2 && (
          <span className="ml-2 text-[10px] text-gray-500 whitespace-nowrap select-none">
            {multiSelect.length} selected · Shift+click to add/remove
          </span>
        )}
      </div>

      {/* Section depth slider */}
      {wall && sectionMode && (
        <div className="flex-none flex items-center gap-3 px-4 py-1.5 bg-gray-950 border-b border-violet-900/40 shrink-0">
          <span className="text-[10px] text-gray-400 whitespace-nowrap select-none">Cut depth:</span>
          <input
            type="range" min={0} max={maxDz} step={10}
            value={Math.min(sectionDepth, maxDz)}
            onChange={e => setSectionDepth(Number(e.target.value))}
            className="w-48 accent-violet-500 cursor-pointer"
          />
          <input
            type="number" min={0} max={maxDz} step={10}
            value={sectionDepth}
            onChange={e => {
              const v = Number(e.target.value)
              if (!isNaN(v)) setSectionDepth(Math.max(0, Math.min(maxDz, v)))
            }}
            className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-violet-300 font-mono text-right focus:outline-none focus:border-violet-500"
          />
          <span className="text-[10px] text-gray-500 whitespace-nowrap select-none">mm</span>
        </div>
      )}

      {/* SVG */}
      <svg
        ref={svgRef}
        className="flex-1 bg-gray-950 select-none"
        style={{ background: layers.background, cursor: mode === 'measure' ? 'crosshair' : (placeInfoFor(mode, armedDef) || mode === 'paste') ? 'crosshair' : elevCabFollowing ? 'crosshair' : elevResizeFollowing ? (elevResizeFollowing.side === 'top' ? 'ns-resize' : 'ew-resize') : spaceRef.current ? 'grab' : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={e => {
          e.preventDefault()
          if (mode === 'measure') {
            setElevMeasureStart(null); setElevMeasureEnd(null); setElevMeasureCursor(null); setElevSnapResult(null)
          }
        }}
        onClick={onSVGClick}
      >
        {!wall ? (
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
            fontSize={14} fill="#4b5563" style={{ userSelect: 'none', pointerEvents: 'none' }}>
            Select a wall above to view its elevation
          </text>
        ) : (
          <g transform={`translate(${view.panX},${view.panY}) scale(${z})`}>

            {/* Section cut hatch pattern — in local (mm) coordinate space so it scales with zoom */}
            {sectionMode && (
              <defs>
                <pattern id="section-hatch" patternUnits="userSpaceOnUse" width="20" height="20">
                  <line x1="0" y1="20" x2="20" y2="0" stroke="#4b5563" strokeWidth="1.5" />
                </pattern>
              </defs>
            )}

            {/* Wall title */}
            <text x={wall.length / 2} y={-24 / z}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={labelFs} fill="#ffffff"
              style={{ userSelect: 'none', pointerEvents: 'none' }}>
              {wall.name} — {elevWallSide === 'face' ? 'Face' : 'Back'}
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
                  strokeWidth={isWallSel ? 2 / lz : 1 / lz}
                  style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); onSelectWall(wall.id) }}
                  onContextMenu={cmHandler} />
              )
            })()}

            {/* Door / window holes (z_fixtures P5) — under everything drawn on the wall */}
            {fixtures && fixtures.length > 0 && (
              <OpeningHoles fixtures={fixtures} wall={wall} side={elevWallSide} roomCx={centroid(walls)} roomH={roomH}
                layers={layers} fill={isLineDrawing ? 'none' : (layers.background ?? '#030712')} />
            )}

            {/* Floor line */}
            <line x1={0} y1={roomH} x2={wall.length} y2={roomH}
              stroke="#4b5563" strokeWidth={2 / lz} />

            {/* Ceiling / soffit / wall-cabinet-top — not applicable to islands */}
            {wall.wall_type !== 'island' && (() => {
              // soffitH = height from floor; soffit_height (wall/room) stored as depth-from-top
              const soffitDrop = wall.soffit_height ?? room.soffit_height
              const soffitH = soffitDrop != null
                ? (wall.height ?? roomH) - soffitDrop
                : null
              const wcTop   = soffitDrop == null ? room.wall_cabinet_top ?? null : null  // a soffit overrides it
              return (<>
                <line x1={0} y1={0} x2={wall.length} y2={0}
                  stroke="#374151" strokeWidth={1 / lz}
                  strokeDasharray={`${8 / z} ${4 / z}`} />
                {soffitH != null && (
                  <line x1={0} y1={roomH - soffitH} x2={wall.length} y2={roomH - soffitH}
                    stroke="#78350f" strokeWidth={0.5 / lz} strokeDasharray={`${6 / z} ${3 / z}`} />
                )}
                {wcTop != null && (
                  <line x1={0} y1={roomH - wcTop} x2={wall.length} y2={roomH - wcTop}
                    stroke="#1e3a5f" strokeWidth={0.5 / lz} strokeDasharray={`${4 / z} ${4 / z}`} />
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
                // Back side: the wall's start is on the viewer's right.
                const x0   = isLeft !== isBack ? -t : wall.length
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
                      fill="#111827" stroke="#4b5563" strokeWidth={1 / lz} />
                    <g clipPath={`url(#${clipId})`}>
                      {Array.from({ length: Math.floor(rwH / (t * 1.5)) + 2 }, (_, i) => {
                        const y1 = slabY + i * t * 1.5 - t
                        return <line key={i} x1={x0} y1={y1} x2={x0 + t} y2={y1 + t}
                          stroke="#1f2937" strokeWidth={1.5 / lz} />
                      })}
                    </g>
                    {slabY > 1 && (
                      <line x1={x0} y1={slabY} x2={x0 + t} y2={slabY}
                        stroke="#6b7280" strokeWidth={1.5 / lz}
                        strokeDasharray={`${4 / z} ${3 / z}`} />
                    )}
                    <text x={midX} y={midY}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={dimFs2} fill="#ffffff"
                      transform={`rotate(-90,${midX},${midY})`}
                      style={{ userSelect: 'none' }}>
                      {rw.name}
                    </text>
                    <line x1={x0} y1={slabY - tickH * 0.7} x2={x0 + t} y2={slabY - tickH * 0.7}
                      stroke="#6b7280" strokeWidth={1 / lz} />
                    <line x1={x0}     y1={slabY - tickH * 0.3} x2={x0}     y2={slabY - tickH * 1.1} stroke="#6b7280" strokeWidth={1 / lz} />
                    <line x1={x0 + t} y1={slabY - tickH * 0.3} x2={x0 + t} y2={slabY - tickH * 1.1} stroke="#6b7280" strokeWidth={1 / lz} />
                    <text x={midX} y={slabY - tickH * 1.5}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={dimFs2} fill="#ffffff"
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

            {/* Cabinets — click-through in F4 Benchtop mode (only tops pick) */}
            <g style={{ pointerEvents: isBenchtopMode(mode) ? 'none' : undefined }}>
            {wallCabs.map(cab => {
              const baseT   = elevX(cab)
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
                    displayT = mirrorX((elevResizeLive.posX - wall.pos_x) * wd2.x + (elevResizeLive.posY! - wall.pos_y) * wd2.y, displayDx)
                  }
                } else if (elevResizeLive.dim === 'dy') {
                  displayDy = elevResizeLive.value
                }
              }

              const rx = displayT
              const ry = roomH - bottomZ - displayDy
              const toSVGPt = (ex: number, ey: number) => ({ x: rx + ex, y: ry + displayDy - ey })

              const isBase = cab.assembly_class === 'base' || cab.assembly_class === 'base_corner'
              const isTall = cab.assembly_class === 'tall' || cab.assembly_class === 'tall_corner'
              const tkH = (isBase || isTall) && cab.has_toekick
                ? (resolvedParts?.get(cab.id)?.toekick_parts.find(p => p.part_key === 'kick_front_face')?.DX ?? 150)
                : 0

              const baseColor = isSel ? layers.cabFillSel(cab.assembly_class) : layers.cabFill(cab.assembly_class)
              const isHover = hoveredCabId === cab.id && !isSel && !isMultiSel
              const cabStroke = isSel ? '#e2e8f0' : isMultiSel ? '#f59e0b' : isHover ? '#f97316' : '#3b82f6'
              const cabStrokeW = isSel || isMultiSel || isHover ? 2 / lz : 1 / lz

              // Layer items (z_display_layers spec)
              const showOutline = layers.show('carcass_outline')
              const carcP = layers.props('carcass_outline', z)
              const faceP = layers.props('doors', z)
              const tkP   = layers.props('kick_faces', z)
              const anyCarcase = layers.any('carcass_outline', 'carcass_gables', 'carcass_top', 'carcass_bottom')

              const pastFace = sectionMode && sectionDepth > FACE_THICK
              const faceOpacity = sectionMode ? Math.max(0, 1 - sectionDepth / FACE_THICK) : 1
              // Section cut past the face reveals internals regardless of the layer set.
              const showInt = (id: string) => layers.show(id) || pastFace
              const effectiveShowDrawerBox     = layers.show('drawer_boxes')   || (pastFace && !!cab.has_internal)
              const effectiveShowDrawerRunners = layers.show('drawer_runners') || (pastFace && !!cab.has_internal)

              // Click area + labels follow the layer set: the extent of everything this
              // cabinet actually draws (cabinet coords, ey = top edge, Y up). Nothing
              // drawn → not selectable, no name / size.
              const hitRects: { ex: number; ey: number; ew: number; eh: number }[] = []
              {
                const rpHit = elevResizeLive?.cabId === cab.id ? undefined : resolvedParts?.get(cab.id)
                const full = { ex: 0, ey: displayDy, ew: displayDx, eh: displayDy }
                if (!rpHit) {
                  // Fallback box rendering (loading / resizing): outline, kick strip, face inset.
                  if (showOutline || (faceOpacity > 0 && cab.has_face && layers.any('doors', 'drawer_fronts', 'false_panels'))) hitRects.push(full)
                  if (layers.any('kick_faces', 'kick_spreaders') && cab.has_toekick && tkH > 0) hitRects.push({ ex: 0, ey: tkH, ew: displayDx, eh: tkH })
                } else {
                  for (const p of rpHit.case_parts) if (p.part_key !== 'back' && layers.show(casePartItem(p.part_key))) hitRects.push(caseElevRect(p))
                  for (const p of rpHit.toekick_parts) if (layers.show(kickPartItem(p.part_key))) hitRects.push(tkElevRect(p))
                  for (const p of rpHit.internal_parts) if (showInt(internalPartItem(p.part_type))) hitRects.push(shelfElevRect(p))
                  if (showInt('inner_drawer_runners')) for (const sl of rpHit.internal_slides ?? []) hitRects.push(slideElevRect(sl))
                  for (const ds of rpHit.drawer_stacks) {
                    if (effectiveShowDrawerBox) for (const p of ds.box_parts) hitRects.push(drawerBoxPartElevRect(p))
                    if (effectiveShowDrawerRunners && ds.drawer_type !== 'bin') for (const sl of ds.slides) hitRects.push(slideElevRect(sl))
                  }
                  if (faceOpacity > 0) for (const fz of rpHit.face_zones) {
                    const it = faceZoneItem(fz.face_type)
                    if (it && layers.show(it)) hitRects.push(zoneElevRect(fz))
                  }
                  for (const p of rpHit.custom_parts ?? []) {
                    if (!p.show_in_room || !layers.show(customPartItem(p))) continue
                    const { ex, ey } = customExtents(p.orientation, Number(p.dx), Number(p.dy), Number(p.dz))
                    hitRects.push({ ex: p.x, ey: p.y + ey, ew: ex, eh: ey })
                  }
                }
              }
              const hitOk = hitRects.filter(r => r.ew > 0 && r.eh > 0)
              const hit = hitOk.length === 0 ? null : (() => {
                const x0 = Math.min(...hitOk.map(r => r.ex)), x1 = Math.max(...hitOk.map(r => r.ex + r.ew))
                const top = Math.max(...hitOk.map(r => r.ey)), bot = Math.min(...hitOk.map(r => r.ey - r.eh))
                return { x: rx + x0, y: ry + displayDy - top, w: x1 - x0, h: top - bot }
              })()

              const shelfYs: number[] = []
              if (showInt('adj_shelves') && cab.has_internal) {
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
                  onClick={e => {
                    e.stopPropagation()
                    if (elevResizeFollowing) { void confirmResize(); return }
                    if (justConfirmedRef.current) return
                    if (elevCabFollowing) { dropFollowingCab(); return }
                    if (!shiftRef.current) onSelectCabinet(cab.id)
                  }}
                  onContextMenu={e => onCabinetContextMenu(e, cab.id)}
                  onDoubleClick={e => { if (mode === 'select' && !elevCabFollowing && !elevResizeFollowing) onCabinetDoubleClick?.(e, cab.id) }}
                >
                  {/* Invisible hit area — the extent of what's drawn (see hit) */}
                  {hit && <rect x={hit.x} y={hit.y} width={hit.w} height={hit.h} fill="transparent" stroke="none" />}

                  {/* Multi-select outline — drawn underneath so case parts render on top */}
                  {isMultiSel && (
                    <rect x={rx - 2 / z} y={ry - 2 / z}
                      width={displayDx + 4 / z} height={displayDy + 4 / z}
                      fill="none" stroke="#f59e0b" strokeWidth={2 / lz}
                      style={{ pointerEvents: 'none' }} />
                  )}

                  {/* ── Resolved geometry — actual panels ── */}
                  {(() => {
                    // During live resize, resolved panel coords are stale (fixed at original dims).
                    // Fall back to simple rect so the resize renders live.
                    const isBeingResized = elevResizeLive?.cabId === cab.id
                    const rp = isBeingResized ? undefined : resolvedParts?.get(cab.id)
                    if (!rp) {
                      return (<>
                        {showOutline && (
                          <rect x={rx} y={ry} width={displayDx} height={displayDy}
                            fill={isLineDrawing ? 'none' : (pastFace ? 'url(#section-hatch)' : baseColor)}
                            fillOpacity={isLineDrawing ? 0 : carcP.fillOpacity * layers.cabFillOpacity}
                            stroke={isLineDrawing ? (isSel ? '#e2e8f0' : layers.color('carcass_outline', '#94a3b8')) : (isSel || isMultiSel || isHover ? cabStroke : layers.color('carcass_outline', cabStroke))}
                            strokeWidth={layers.w('carcass_outline', 1) * (isLineDrawing ? 1 / lz : cabStrokeW)}
                            strokeDasharray={isLineDrawing ? undefined : carcP.strokeDasharray}
                            opacity={carcP.opacity} />
                        )}
                        {layers.any('kick_faces', 'kick_spreaders') && cab.has_toekick && tkH > 0 && !(cab.kick_run_id && !cab.is_kick_assembly) && (
                          <rect x={rx} y={ry + displayDy - tkH} width={displayDx} height={tkH}
                            fill={isLineDrawing ? 'none' : baseColor}
                            fillOpacity={isLineDrawing ? 0 : (tkP.fillOpacity * 0.5) || 0}
                            stroke={isLineDrawing ? layers.color('kick_faces', '#fbbf24') : (isSel ? '#e2e8f0' : layers.color('kick_faces', '#475569'))}
                            strokeWidth={layers.w('kick_faces', 1) / lz}
                            strokeDasharray={isLineDrawing ? undefined : (tkP.strokeDasharray ?? `${4 / z} ${2 / z}`)}
                            opacity={tkP.opacity} />
                        )}
                        {shelfYs.map((sy, i) => (
                          <line key={i} x1={rx + 4 / z} y1={sy} x2={rx + displayDx - 4 / z} y2={sy}
                            stroke={isLineDrawing ? layers.color('adj_shelves', '#a78bfa') : (pastFace ? '#818cf8' : (isSel ? '#cbd5e1' : layers.color('adj_shelves', '#4b5563')))}
                            strokeWidth={layers.w('adj_shelves', pastFace ? 1.5 : 1) / lz}
                            strokeDasharray={isLineDrawing || layers.style('adj_shelves') === 'solid' ? undefined : `${8 / z} ${4 / z}`}
                            opacity={layers.props('adj_shelves', z).opacity} />
                        ))}
                        {faceOpacity > 0 && layers.any('doors', 'drawer_fronts', 'false_panels') && cab.has_face && (() => {
                          const ins = 15; const fw = displayDx - ins * 2; const fh = displayDy - tkH - ins * 2
                          if (fw <= 0 || fh <= 0) return null
                          return <rect x={rx + ins} y={ry + ins} width={fw} height={fh}
                            fill={isLineDrawing ? 'none' : baseColor}
                            fillOpacity={isLineDrawing ? 0 : faceP.fillOpacity * 0.45 * faceOpacity}
                            stroke={isLineDrawing ? layers.color('doors', '#60a5fa') : (isSel ? '#e2e8f0' : layers.color('doors', baseColor))}
                            strokeWidth={layers.w('doors', isLineDrawing ? 1 : 0.75) / lz}
                            strokeDasharray={isLineDrawing ? undefined : faceP.strokeDasharray}
                            opacity={faceP.opacity * faceOpacity} />
                        })()}
                      </>)
                    }

                    const toSVG = (ex: number, ey: number, ew: number, eh: number) => ({
                      x: rx + ex, y: ry + displayDy - ey, w: ew, h: eh,
                    })

                    return (<>
                      {rp.case_parts.filter(p => p.part_key !== 'back' && layers.show(casePartItem(p.part_key))).map((p, i) => {
                        const { ex, ey, ew, eh } = caseElevRect(p)
                        const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                        const cit = casePartItem(p.part_key)
                        const fill = layers.colorOf(cit) ?? PART_COLORS[p.part_key] ?? '#b8c8dc'
                        const ldStroke = layers.colorOf(cit) ?? LINE_DRAW_COLORS[p.part_key] ?? '#94a3b8'
                        return (
                          <rect key={`cp-${i}`} x={x} y={y} width={w} height={h}
                            fill={isLineDrawing ? 'none' : (pastFace ? 'url(#section-hatch)' : fill)}
                            fillOpacity={isLineDrawing ? 0 : (pastFace ? 0.9 : 0.6)}
                            stroke={isLineDrawing ? ldStroke : (pastFace ? '#8b9eb0' : (isSel ? '#e2e8f0' : fill))}
                            strokeWidth={layers.w(cit, isLineDrawing ? 1 : (pastFace ? 1 : 0.5)) / lz}
                            strokeDasharray={layers.props(casePartItem(p.part_key), z).strokeDasharray}
                            opacity={layers.props(casePartItem(p.part_key), z).opacity} style={{ pointerEvents: 'none' }} />
                        )
                      })}
                      {rp.toekick_parts.filter(p => layers.show(kickPartItem(p.part_key))).map((p, i) => {
                        const tkP = layers.props(kickPartItem(p.part_key), z)
                        const { ex, ey, ew, eh } = tkElevRect(p)
                        const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                        const kit = kickPartItem(p.part_key)
                        const fill = layers.colorOf(kit) ?? PART_COLORS[p.part_key] ?? '#f59e0b'
                        const ldStroke = layers.colorOf(kit) ?? LINE_DRAW_COLORS[p.part_key] ?? '#fbbf24'
                        const isSpreader = p.part_key === 'spreader_vertical' || p.part_key === 'spreader_horizontal'
                        if (isLineDrawing) {
                          return (
                            <rect key={`tk-${i}`} x={x} y={y} width={w} height={h}
                              fill="none"
                              stroke={ldStroke} strokeWidth={layers.w(kit, 1) / lz}
                              strokeDasharray={isSpreader ? `${4 / z} ${3 / z}` : undefined}
                              opacity={tkP.opacity} style={{ pointerEvents: 'none' }} />
                          )
                        }
                        return isSpreader
                          ? <rect key={`tk-${i}`} x={x} y={y} width={w} height={h}
                              fill="none"
                              stroke={isSel ? '#e2e8f0' : fill} strokeWidth={layers.w(kit, 1) / lz}
                              strokeDasharray={`${4 / z} ${3 / z}`}
                              opacity={tkP.opacity} style={{ pointerEvents: 'none' }} />
                          : <rect key={`tk-${i}`} x={x} y={y} width={w} height={h}
                              fill={fill} fillOpacity={0.7}
                              stroke={isSel ? '#e2e8f0' : fill} strokeWidth={layers.w(kit, 0.5) / lz}
                              opacity={tkP.opacity} style={{ pointerEvents: 'none' }} />
                      })}
                      {rp.internal_parts.filter(p => showInt(internalPartItem(p.part_type))).map((p, i) => {
                        const intEffP = layers.props(internalPartItem(p.part_type), z)
                        const { ex, ey, ew, eh } = shelfElevRect(p)
                        const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                        const iit = internalPartItem(p.part_type)
                        const fill = layers.colorOf(iit) ?? PART_COLORS[p.part_type] ?? '#818cf8'
                        const ldStroke = layers.colorOf(iit) ?? LINE_DRAW_COLORS[p.part_type] ?? '#a78bfa'
                        return (
                          <rect key={`ip-${i}`} x={x} y={y} width={w} height={h}
                            fill={isLineDrawing ? 'none' : fill}
                            fillOpacity={isLineDrawing ? 0 : 0.6}
                            stroke={isLineDrawing ? ldStroke : fill}
                            strokeWidth={layers.w(iit, isLineDrawing ? 1 : 0.5) / lz}
                            opacity={intEffP.opacity} style={{ pointerEvents: 'none' }} />
                        )
                      })}
                      {showInt('inner_drawer_runners') && (rp.internal_slides ?? []).map((s: ResolvedDrawerSlide, j: number) => {
                        const intEffP = layers.props('inner_drawer_runners', z)
                        const { ex, ey, ew, eh } = slideElevRect(s)
                        const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                        const fill = layers.color('inner_drawer_runners', PART_COLORS.db_slide)
                        const ldStroke = layers.color('inner_drawer_runners', LINE_DRAW_COLORS.db_slide)
                        // Only use the detailed model silhouette while the rail is big enough
                        // on screen to resolve it. The silhouette is a dense run of tiny
                        // segments; on a thin rail seen edge-on they merge into a bulky blob
                        // until the rail is clearly wide on screen, so until then fall back to
                        // the plain box outline (which renders like every other cabinet line).
                        const tris = Math.min(w, h) * z >= 12 ? triMap.get(triKey(s) ?? '') : undefined
                        // Inner-drawer slide rail: true projected model outline when the
                        // slide has an uploaded 3D model; otherwise the original box.
                        if (tris && tris.length > 0) {
                          return (
                            <g key={`isl-${j}`} opacity={intEffP.opacity} style={{ pointerEvents: 'none' }}>
                              <SlideShape
                                rectX={x} rectY={y} rectW={w} rectH={h}
                                box={slideBox3(s)} project={(px, py) => toSVGPt(px, py)}
                                slide={s} tris={tris} wireMode={false} selected={false}
                                fill={isLineDrawing ? 'none' : fill}
                                stroke={isLineDrawing ? ldStroke : fill}
                                strokeWidth={layers.w('inner_drawer_runners', isLineDrawing ? 1 : 0.5) / lz}
                                dataPartId={`elev-islide-${cab.id}-${j}`} />
                            </g>
                          )
                        }
                        return (
                          <rect key={`isl-${j}`} x={x} y={y} width={w} height={h}
                            fill={isLineDrawing ? 'none' : fill}
                            fillOpacity={isLineDrawing ? 0 : 0.5}
                            stroke={isLineDrawing ? ldStroke : fill}
                            strokeWidth={layers.w('inner_drawer_runners', isLineDrawing ? 1 : 0.5) / lz}
                            opacity={intEffP.opacity} style={{ pointerEvents: 'none' }} />
                        )
                      })}
                      {/* Hinge cup + anchor bore markers (cheap circles — the full
                          GLB silhouette was too heavy to re-project on every zoom). */}
                      {showInt('hinges') && (rp.hinge_instances ?? []).flatMap((h, hi: number) =>
                        h.cup_drills.map((dr, j) => {
                          const c = toSVGPt(dr.x, dr.y)
                          return (
                            <circle key={`hg-${hi}-${j}`} cx={c.x} cy={c.y} r={Math.max(dr.radius, 0.5)}
                              fill="none" stroke={layers.color('hinges', isLineDrawing ? '#475569' : '#a855f7')}
                              strokeWidth={layers.w('hinges', isLineDrawing ? 1 : 0.6) / lz}
                              opacity={layers.props('hinges', z).opacity} style={{ pointerEvents: 'none' }} />
                          )
                        }),
                      )}
                      {/* Drawer-box fixing bores into the back of each drawer front
                          (the runner's drawer_front drill ops). Inner-drawer fronts sit
                          behind a door, so they follow the internals rule (showInt). */}
                      {[
                        ...(layers.show('drawer_front_drilling') ? rp.drawer_stacks.flatMap(ds => ds.slides) : []),
                        ...(showInt('drawer_front_drilling') && showInt('inner_drawers') ? rp.internal_slides ?? [] : []),
                      ].flatMap((s: ResolvedDrawerSlide, si: number) =>
                        s.drills.filter(dr => dr.surface === 'drawer_front').map((dr, j) => {
                          const c = toSVGPt(dr.x, dr.y)
                          return (
                            <circle key={`dfd-${si}-${j}`} cx={c.x} cy={c.y} r={Math.max(dr.radius, 0.5)}
                              fill="none" stroke={layers.color('drawer_front_drilling', isLineDrawing ? '#475569' : '#d97706')}
                              strokeWidth={layers.w('drawer_front_drilling', isLineDrawing ? 1 : 0.6) / lz}
                              opacity={layers.props('drawer_front_drilling', z).opacity} style={{ pointerEvents: 'none' }} />
                          )
                        }),
                      )}
                      {(effectiveShowDrawerBox || effectiveShowDrawerRunners || layers.show('bins')) && rp.drawer_stacks.flatMap((ds: ResolvedDrawerStack, i: number) => {
                        const boxP    = layers.props('drawer_boxes', z)
                        const intEffP = layers.props('drawer_runners', z)
                        // Pull-out bin (z_bin_cabinet): its outline replaces the rails.
                        if (ds.drawer_type === 'bin') {
                          if (!layers.show('bins')) return []
                          const binP = layers.props('bins', z)
                          const fill = layers.color('bins', '#6b7280')
                          const ldStroke = layers.color('bins', '#9ca3af')
                          return binOutlines(ds, 'front').map((o, j) => (
                            <polygon key={`ds-${i}-bin-${j}`}
                              points={o.pts.map(([px, py]) => { const p = toSVGPt(px, py); return `${p.x},${p.y}` }).join(' ')}
                              fill={isLineDrawing ? 'none' : fill}
                              fillOpacity={isLineDrawing ? 0 : o.kind === 'bin' ? 0.35 : 0.5}
                              stroke={isLineDrawing ? ldStroke : fill}
                              strokeWidth={layers.w('bins', isLineDrawing ? 1 : 0.5) / lz}
                              opacity={binP.opacity} style={{ pointerEvents: 'none' }} />
                          ))
                        }
                        return [
                        ...(effectiveShowDrawerBox ? ds.box_parts : []).map((p: ResolvedDrawerBoxPart, j: number) => {
                          const { ex, ey, ew, eh } = drawerBoxPartElevRect(p)
                          const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                          const fill = layers.colorOf('drawer_boxes') ?? PART_COLORS[p.part_type] ?? '#34d399'
                          const ldStroke = layers.colorOf('drawer_boxes') ?? LINE_DRAW_COLORS[p.part_type] ?? '#6ee7b7'
                          return (
                            <rect key={`ds-${i}-bp-${j}`} x={x} y={y} width={w} height={h}
                              fill={isLineDrawing ? 'none' : fill}
                              fillOpacity={isLineDrawing ? 0 : 0.6}
                              stroke={isLineDrawing ? ldStroke : fill}
                              strokeWidth={layers.w('drawer_boxes', isLineDrawing ? 1 : 0.5) / lz}
                              opacity={boxP.opacity} style={{ pointerEvents: 'none' }} />
                          )
                        }),
                        ...(effectiveShowDrawerRunners ? ds.slides : []).map((s: ResolvedDrawerSlide, j: number) => {
                          const { ex, ey, ew, eh } = slideElevRect(s)
                          const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                          const fill = layers.color('drawer_runners', PART_COLORS.db_slide)
                          const ldStroke = layers.color('drawer_runners', LINE_DRAW_COLORS.db_slide)
                          // Only use the detailed model silhouette while the rail is big enough
                          // on screen to resolve it; when zoomed out the dense outline merges
                          // into a bulky blob, so until the rail is clearly wide on screen fall
                          // back to the plain box outline (renders like every other cabinet line).
                          const tris = Math.min(w, h) * z >= 12 ? triMap.get(triKey(s) ?? '') : undefined
                          // True projected model outline when the slide has an uploaded
                          // 3D model; otherwise fall back to the original filled box.
                          if (tris && tris.length > 0) {
                            return (
                              <g key={`ds-${i}-sl-${j}`} opacity={intEffP.opacity} style={{ pointerEvents: 'none' }}>
                                <SlideShape
                                  rectX={x} rectY={y} rectW={w} rectH={h}
                                  box={slideBox3(s)} project={(px, py) => toSVGPt(px, py)}
                                  slide={s} tris={tris} wireMode={false} selected={false}
                                  fill={isLineDrawing ? 'none' : fill}
                                  stroke={isLineDrawing ? ldStroke : fill}
                                  strokeWidth={layers.w('drawer_runners', isLineDrawing ? 1 : 0.5) / lz}
                                  dataPartId={`elev-slide-${cab.id}-${i}-${j}`} />
                              </g>
                            )
                          }
                          return (
                            <rect key={`ds-${i}-sl-${j}`} x={x} y={y} width={w} height={h}
                              fill={isLineDrawing ? 'none' : fill}
                              fillOpacity={isLineDrawing ? 0 : 0.5}
                              stroke={isLineDrawing ? ldStroke : fill}
                              strokeWidth={layers.w('drawer_runners', isLineDrawing ? 1 : 0.5) / lz}
                              opacity={intEffP.opacity} style={{ pointerEvents: 'none' }} />
                          )
                        }),
                      ]})}
                      {faceOpacity > 0 && (
                      <g opacity={faceOpacity} style={{ pointerEvents: faceOpacity < 0.1 ? 'none' : undefined }}>
                      {rp.face_zones.map((fz, i) => {
                        const faceItem = faceZoneItem(fz.face_type)
                        if (faceItem && !layers.show(faceItem)) return null
                        const faceP = layers.props(faceItem ?? 'doors', z)
                        const { ex, ey, ew, eh } = zoneElevRect(fz)
                        const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                        const fit = faceItem ?? 'doors'
                        const fill = layers.colorOf(fit) ?? PART_COLORS[fz.face_type] ?? '#60a5fa'
                        const ldStroke = layers.colorOf(fit) ?? LINE_DRAW_COLORS[fz.face_type] ?? '#60a5fa'
                        const faceStroke = isLineDrawing ? ldStroke : (isSel ? '#e2e8f0' : fill)
                        const hingeLine = fz.hinge_side === 'left'
                          ? <line x1={x} y1={y} x2={x} y2={y + h} stroke={faceStroke} strokeWidth={layers.w(fit, isLineDrawing ? 1.5 : 2) / lz} style={{ pointerEvents: 'none' }} />
                          : fz.hinge_side === 'right'
                          ? <line x1={x + w} y1={y} x2={x + w} y2={y + h} stroke={faceStroke} strokeWidth={layers.w(fit, isLineDrawing ? 1.5 : 2) / lz} style={{ pointerEvents: 'none' }} />
                          : null
                        const chevron = layers.show('door_chevrons') && fz.face_type === 'door' && fz.hinge_side
                          ? (() => {
                              const pts = fz.hinge_side === 'left'
                                ? `${x},${y} ${x + w},${y + h / 2} ${x},${y + h}`
                                : `${x + w},${y} ${x},${y + h / 2} ${x + w},${y + h}`
                              return <polyline points={pts} fill="none" stroke={layers.color('door_chevrons', faceStroke)}
                                strokeWidth={layers.w('door_chevrons', 0.5) / lz} strokeOpacity={0.7} opacity={layers.op('door_chevrons')}
                                strokeDasharray={`${6 / z} ${3 / z}`}
                                strokeLinejoin="miter" strokeLinecap="butt"
                                style={{ pointerEvents: 'none' }} />
                            })()
                          : null
                        const drawerLabel = fz.face_type === 'drawer_face' && layers.show('drawer_labels')
                          ? (
                            <text
                              x={x + w / 2} y={y + h - 4 / z}
                              textAnchor="middle" dominantBaseline="auto"
                              fontSize={layers.w('drawer_labels', 11) / z} fill={layers.color('drawer_labels', faceStroke)} fillOpacity={0.7} opacity={layers.op('drawer_labels')}
                              style={{ userSelect: 'none', pointerEvents: 'none' }}>
                              drawer
                            </text>
                          ) : null
                        return (
                          <g key={`fz-${i}`} style={{ pointerEvents: 'none' }}>
                            <rect x={x} y={y} width={w} height={h}
                              fill={isLineDrawing ? 'none' : fill}
                              fillOpacity={isLineDrawing ? 0 : 0.25}
                              stroke={faceStroke} strokeWidth={layers.w(fit, 1) / lz}
                              opacity={faceP.opacity} />
                            {hingeLine}
                            {chevron}
                            {drawerLabel}
                            {doorProfileSvg(fz, { x, y, w, h }, faceStroke, (isLineDrawing ? 0.6 : 0.5) / z)}
                          </g>
                        )
                      })}
                      {/* Handles (z_handles H2) — on the fronts that are drawn. */}
                      {layers.show('handles') && handleShapes(rp.face_zones.filter(fz => { const it = faceZoneItem(fz.face_type); return !it || layers.show(it) })).map((s, i) => (
                        <HandleElevSVG key={`hd-${i}`} s={s} project={toSVGPt}
                          stroke={layers.color('handles', isLineDrawing ? '#334155' : '#1e293b')}
                          fill={isLineDrawing ? 'none' : layers.color('handles', '#475569')}
                          strokeWidth={layers.w('handles', 0.8) / lz} opacity={layers.op('handles')} />
                      ))}
                      {/* Sharknose bevels — hidden line where the bevel meets the back face */}
                      {layers.show('handles') && (
                        <SharknoseLinesSVG zones={rp.face_zones.filter(fz => { const it = faceZoneItem(fz.face_type); return !it || layers.show(it) })}
                          project={toSVGPt} stroke={layers.color('handles', isLineDrawing ? '#334155' : '#94a3b8')}
                          strokeWidth={layers.w('handles', 0.8) / lz} dash={`${4 / z} ${3 / z}`} opacity={layers.op('handles')} fontSize={9 / z} />
                      )}
                      {/* Handle through-holes — drawn over the handle so you can see
                          what gets drilled; empty when the handle isn't drilled. */}
                      {layers.show('handle_holes') && handleShapes(rp.face_zones.filter(fz => { const it = faceZoneItem(fz.face_type); return !it || layers.show(it) })).map((s, i) => (
                        <HandleHolesSVG key={`hh-${i}`} s={s} project={toSVGPt}
                          color={layers.color('handle_holes', isLineDrawing ? '#475569' : '#f97316')}
                          strokeWidth={layers.w('handle_holes', 0.6) / lz} opacity={layers.op('handle_holes')} />
                      ))}
                      </g>)}

                      {/* Custom parts (panels / fillers / end panels) — room-visible only */}
                      {layers.any(...CUSTOM_PART_ITEMS) && (rp.custom_parts ?? []).filter(p => p.show_in_room && layers.show(customPartItem(p))).map((p, i) => {
                        const cpi = customPartItem(p)
                        const { ex, ey } = customExtents(p.orientation, Number(p.dx), Number(p.dy), Number(p.dz))
                        if (ex <= 0 || ey <= 0) return null
                        const { x, y, w, h } = toSVG(p.x, p.y + ey, ex, ey)
                        return (
                          <rect key={`cust-${i}`} x={x} y={y} width={w} height={h}
                            fill={isLineDrawing ? 'none' : layers.color(cpi, '#a78bfa')}
                            fillOpacity={isLineDrawing ? 0 : 0.4}
                            stroke={isLineDrawing ? layers.color(cpi, '#a78bfa') : (isSel ? '#e2e8f0' : layers.color(cpi, '#7c3aed'))}
                            strokeWidth={layers.w(cpi, isLineDrawing ? 1 : 0.6) / lz}
                            strokeDasharray={layers.props(cpi, z).strokeDasharray}
                            opacity={layers.props(cpi, z).opacity} style={{ pointerEvents: 'none' }} />
                        )
                      })}

                      {/* Hand-added part operations (Part Editor) — projected to this
                          cabinet's elevation. Generated holes are excluded (not drawn here). */}
                      {layers.show('machining') && (handMarkersByCab.get(cab.id)?.length ?? 0) > 0 && (
                        <HandOpMarkersSVG markers={handMarkersByCab.get(cab.id)!} project={(px, py) => toSVGPt(px, py)} />
                      )}

                      {/* Inner-drawer labels — one per inner-drawer face, drawn last so
                          they sit on top of the open-zone overlay. */}
                      {showInt('inner_drawers') && layers.show('inner_drawer_labels') &&
                        rp.internal_parts.filter(p => p.part_type === 'inner_drawer_front').map((p, i) => {
                          const { ex, ey, ew, eh } = shelfElevRect(p)
                          const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                          if (w < 24 / z || h < 12 / z) return null
                          const col = layers.colorOf('inner_drawer_labels') ?? (isLineDrawing
                            ? (LINE_DRAW_COLORS.inner_drawer_front ?? '#fda4af')
                            : (PART_COLORS.inner_drawer_front ?? '#fb7185'))
                          return (
                            <text key={`idl-${i}`}
                              x={x + w / 2} y={y + h - 4 / z}
                              textAnchor="middle" dominantBaseline="auto"
                              fontSize={layers.w('inner_drawer_labels', 11) / z} fill={col} fillOpacity={0.85} opacity={layers.op('inner_drawer_labels')}
                              style={{ userSelect: 'none', pointerEvents: 'none' }}>
                              inner drawer
                            </text>
                          )
                        })}

                      {/* Shelf labels — "adj sh" / "fix sh" at each shelf's top-left corner. */}
                      {layers.show('shelf_labels') &&
                        rp.internal_parts.filter(p => (p.part_type === 'adj_shelf' || p.part_type === 'fixed_shelf') && showInt(internalPartItem(p.part_type))).map((p, i) => {
                          const { ex, ey, ew, eh } = shelfElevRect(p)
                          const { x, y, w } = toSVG(ex, ey, ew, eh)
                          if (w < 30 / z) return null
                          const col = layers.colorOf('shelf_labels') ?? (isLineDrawing
                            ? (LINE_DRAW_COLORS[p.part_type] ?? '#a78bfa')
                            : (PART_COLORS[p.part_type] ?? '#818cf8'))
                          return (
                            <text key={`shl-${i}`}
                              x={x + 3 / z} y={y - 2 / z}
                              textAnchor="start" dominantBaseline="auto"
                              fontSize={layers.w('shelf_labels', 9) / z} fill={col} fillOpacity={0.9} opacity={layers.op('shelf_labels')}
                              style={{ userSelect: 'none', pointerEvents: 'none' }}>
                              {p.part_type === 'adj_shelf' ? 'adj sh' : 'fix sh'}
                            </text>
                          )
                        })}
                    </>)
                  })()}

                  {/* Selection ring when the carcase is hidden */}
                  {isSel && !anyCarcase && hit && (
                    <rect
                      x={hit.x} y={hit.y} width={hit.w} height={hit.h}
                      fill="none" stroke="#3b82f6" strokeWidth={1.5 / lz}
                      strokeDasharray={`${6 / z} ${3 / z}`}
                    />
                  )}

                  {/* Label */}
                  {hit && layers.show('cabinet_labels') && (
                    <text
                      x={rx + displayDx / 2} y={ry + displayDy / 2 - layers.w('cabinet_labels', labelFs) * 0.6}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={layers.w('cabinet_labels', labelFs)} fontWeight="600"
                      fill={isSel ? '#fff' : layers.color('cabinet_labels', '#93c5fd')} opacity={layers.op('cabinet_labels')}
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>
                      {cab.label ?? '—'}
                    </text>
                  )}

                  {/* Dimensions */}
                  {hit && layers.show('cabinet_sizes') && (
                    <text
                      x={rx + displayDx / 2} y={ry + displayDy / 2 + layers.w('cabinet_sizes', dimFs) * 0.8}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={layers.w('cabinet_sizes', dimFs)} fill={layers.color('cabinet_sizes', '#ffffff')} opacity={layers.op('cabinet_sizes')}
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
                          stroke={isF ? '#60a5fa' : 'white'} strokeWidth={1.5 / lz}
                          opacity={isF ? 1 : 0.4} strokeLinecap="round"
                          style={{ pointerEvents: 'none' }} />
                        <line x1={cx} y1={cy - arm} x2={cx} y2={cy + arm}
                          stroke={isF ? '#60a5fa' : 'white'} strokeWidth={1.5 / lz}
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
                        fill="#1d4ed8" stroke="#93c5fd" strokeWidth={1.5 / lz}
                        style={{ cursor: 'ew-resize' }}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => onMarkerClick(e, cab, 'left')}
                      />
                      <circle cx={rx + displayDx} cy={ry + displayDy / 2} r={mr}
                        fill="#1d4ed8" stroke="#93c5fd" strokeWidth={1.5 / lz}
                        style={{ cursor: 'ew-resize' }}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => onMarkerClick(e, cab, 'right')}
                      />
                      <circle cx={rx + displayDx / 2} cy={ry} r={mr}
                        fill="#7c3aed" stroke="#c4b5fd" strokeWidth={1.5 / lz}
                        style={{ cursor: 'ns-resize' }}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => onMarkerClick(e, cab, 'top')}
                      />
                    </>
                  )}
                </g>
              )
            })}
            </g>

            {/* Fixtures & appliances (z_fixtures) — also while placing the first one */}
            {((fixtures && fixtures.length > 0) || (mode === 'place_fixture' && fixtureGhost)) && (
              <FixturesElevation
                fixtures={fixtures ?? []} wall={wall} side={elevWallSide}
                roomCx={centroid(walls)} roomH={roomH} zoom={z} layers={layers}
                selectedId={selected?.type === 'fixture' ? selected.id : null}
                onSelect={id => onSelectFixture?.(id)}
                stretching={fixtureStretching}
                ghost={mode === 'place_fixture' ? fixtureGhost : null}
                showClearance={mode === 'select' || !!fixtureStretching}
                clashIds={fixtureClashIds}
                onContextMenu={onFixtureContextMenu}
                interactive={mode === 'select' && !elevResizeFollowing && !elevCabFollowing && !cabResize && !fixtureStretching}
                obstacles={wallCabs.map(c => {
                  const z0 = cabBottomZ(c, room, wall)
                  return { x0: elevX(c), x1: elevX(c) + c.dx, z0, z1: z0 + c.dy }
                })}
                onStretchHandle={mode === 'select' ? onFixtureStretchHandle : undefined}
                onMoveHandle={mode === 'select' ? onFixtureMoveHandle : undefined}
              />
            )}

            {/* Benchtops — over the cabinet tops */}
            {benchtops && benchtopInfo && (
              <BenchtopElevation
                benchtops={benchtops} walls={walls} wall={wall} side={elevWallSide}
                roomCx={centroid(walls)} roomH={roomH} zoom={z} layers={layers}
                selectedId={selected?.type === 'benchtop' ? selected.id : null}
                info={benchtopInfo} profiles={edgeProfiles ?? {}}
                interactive={mode === 'benchtop_select'}
                onSelect={id => onSelectBenchtop?.(id)}
              />
            )}

            {/* Placement ghost — floating at cursor + snap landing */}
            {placeGhost && (() => {
              const isWallCls = placeGhost.cls === 'wall' || placeGhost.cls === 'wall_corner'
              const wcTop = wallCabTop(wall, room)
              const ghostBZ = isWallCls ? Math.max(0, wcTop - placeGhost.dy) : 0

              // Snap landing (snapped free slot, correct height)
              const snapX = placeGhost.t
              const snapY = roomH - ghostBZ - placeGhost.dy

              // Floating ghost centred on cursor
              const floatX = placeGhost.cursorT - placeGhost.dx / 2
              const floatY = placeGhost.cursorSY - placeGhost.dy / 2

              const fill = layers.cabFill(placeGhost.cls)
              const sel  = layers.cabFillSel(placeGhost.cls)

              // Arrow from float ghost face to snap surface
              const arrowFromX = placeGhost.cursorT
              const arrowFromY = isWallCls ? floatY : floatY + placeGhost.dy
              const arrowToX   = placeGhost.t + placeGhost.dx / 2
              const arrowToY   = isWallCls ? (roomH - wcTop) : roomH
              const adx = arrowToX - arrowFromX
              const ady = arrowToY - arrowFromY
              const alen = Math.sqrt(adx * adx + ady * ady)
              const arrowSize = 12 / z
              const showArrow = alen > arrowSize * 1.5

              // Multi-paste: the rest of the copied group, at their spacing + height
              // relative to the lead cabinet (which is the placeGhost above).
              const baseCab = clipboardGroup[0]
              const gwd = wallDir(wall)
              const groupExtras = (mode === 'paste' && clipboardGroup.length > 1 && baseCab)
                ? clipboardGroup.slice(1).map(gc => {
                    const wo   = (gc.pos_x - baseCab.pos_x) * gwd.x + (gc.pos_y - baseCab.pos_y) * gwd.y
                    // Wall-space offset from the lead; mirrored on the back side.
                    const o    = isBack ? baseCab.dx - wo - gc.dx : wo
                    const topY = roomH - cabBottomZ(gc, room, wall) - gc.dy
                    return { cls: gc.assembly_class, o, topY, dx: gc.dx, dy: gc.dy }
                  })
                : []

              return (<>
                {/* Snap landing outline */}
                <rect x={snapX} y={snapY} width={placeGhost.dx} height={placeGhost.dy}
                  fill="none" stroke="#60a5fa" strokeWidth={1 / lz}
                  strokeDasharray={`${4 / z} ${4 / z}`} opacity={0.5}
                  style={{ pointerEvents: 'none' }} />

                {/* Arrow from ghost face to snap surface */}
                {showArrow && (<>
                  <line x1={arrowFromX} y1={arrowFromY} x2={arrowToX} y2={arrowToY}
                    stroke="#60a5fa" strokeWidth={1.5 / lz}
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

                {/* Floating ghost centred on cursor */}
                <rect x={floatX} y={floatY} width={placeGhost.dx} height={placeGhost.dy}
                  fill={fill + 'cc'} stroke={sel}
                  strokeWidth={2 / lz} strokeDasharray={`${6 / z} ${3 / z}`}
                  style={{ pointerEvents: 'none' }} />

                {/* Rest of the multi-paste group */}
                {groupExtras.map((ex, i) => (
                  <g key={`gx${i}`}>
                    <rect x={placeGhost.t + ex.o} y={ex.topY} width={ex.dx} height={ex.dy}
                      fill="none" stroke="#60a5fa" strokeWidth={1 / lz}
                      strokeDasharray={`${4 / z} ${4 / z}`} opacity={0.5} style={{ pointerEvents: 'none' }} />
                    <rect x={floatX + ex.o} y={floatY + (ex.topY - snapY)} width={ex.dx} height={ex.dy}
                      fill={layers.cabFill(ex.cls) + 'cc'} stroke={layers.cabFillSel(ex.cls)}
                      strokeWidth={2 / lz} strokeDasharray={`${6 / z} ${3 / z}`} style={{ pointerEvents: 'none' }} />
                  </g>
                ))}
              </>)
            })()}

            {/* Following ghost — free-float at cursor, shows snap landing + arrow */}
            {elevCabFollowing && elevCabFloat && (() => {
              const followingCab = cabinets.find(c => c.id === elevCabFollowing.id)
              if (!followingCab || !wall) return null

              const isWallCab = followingCab.assembly_class === 'wall' || followingCab.assembly_class === 'wall_corner'
              const wcTop = wallCabTop(wall, room)
              const snapBottomZ = isWallCab ? Math.max(0, wcTop - followingCab.dy) : 0

              // Ghost centred on cursor
              const gx = elevCabFloat.t - followingCab.dx / 2
              const gy = roomH - elevCabFloat.ht - followingCab.dy / 2

              // Snap landing
              const occupied = wallCabs
                .filter(c => c.id !== elevCabFollowing.id && cabsBlock(followingCab, c, wall, room))
                .map(c => ({ t: elevX(c), dx: c.dx })).concat(wfOcc(followingCab))
              const snapT = slideToFreeSlot(
                Math.max(0, Math.min(wall.length - followingCab.dx, elevCabFloat.t - followingCab.dx / 2)),
                followingCab.dx, wall.length, occupied, elevX(followingCab)
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

              const baseColor = layers.cabFill(followingCab.assembly_class)
              const selColor  = layers.cabFillSel(followingCab.assembly_class)

              return (<>
                {/* Snap landing outline */}
                <rect x={snapX} y={snapY} width={followingCab.dx} height={followingCab.dy}
                  fill="none" stroke="#60a5fa" strokeWidth={1 / lz}
                  strokeDasharray={`${4 / z} ${4 / z}`} opacity={0.5}
                  style={{ pointerEvents: 'none' }} />

                {/* Arrow + arrowhead from ghost face to snap surface */}
                {showArrow && (<>
                  <line x1={arrowFromX} y1={arrowFromY} x2={arrowToX} y2={arrowToY}
                    stroke="#60a5fa" strokeWidth={1.5 / lz}
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
                  strokeWidth={2 / lz} strokeDasharray={`${6 / z} ${3 / z}`}
                  style={{ pointerEvents: 'none' }} />
              </>)
            })()}

            {/* Top horizontal chain — overhead cabs (wall + wall_corner) */}
            {layers.show('dim_elev_wall_chain') && (() => {
              const overheadCabs = chainCabs.filter(c =>
                c.assembly_class === 'wall' || c.assembly_class === 'wall_corner'
              )
              if (overheadCabs.length === 0 && chainFxWall.length === 0) return null
              const segs = computeElevChain(overheadCabs, wall, elevX, chainFxWall)
              const chainY = -tickH * 2 - layers.offset('dim_elev_wall_chain')
              const col = layers.color('dim_elev_wall_chain', '#ffffff')
              const chainOp = layers.op('dim_elev_wall_chain')
              const sw = layers.w('dim_elev_wall_chain', 1) / lz, fs = 12 / z, tk = 8 / z
              const boundaries = Array.from(new Set(segs.flatMap(s => [s.from, s.to])))
              return (
                <g pointerEvents="none" opacity={chainOp} style={{ userSelect: 'none' }}>
                  <line x1={0} y1={chainY} x2={wall.length} y2={chainY} stroke={col} strokeWidth={sw} />
                  {boundaries.map((x, i) => (
                    <line key={i} x1={x} y1={chainY - tk} x2={x} y2={chainY + tk} stroke={col} strokeWidth={sw} />
                  ))}
                  {segs.map((seg, i) => {
                    const mx = (seg.from + seg.to) / 2
                    const padX = fs * 1.8, padY = fs * 0.6
                    return (
                      <g key={i}>
                        <rect x={mx - padX} y={chainY - padY} width={padX * 2} height={padY * 2} fill={layers.background ?? '#030712'} />
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
            {layers.show('dim_elev_floor_chain') && (() => {
              const floorCabs = chainCabs.filter(c =>
                !c.is_kick_assembly && (
                  c.assembly_class === 'base' || c.assembly_class === 'base_corner' ||
                  c.assembly_class === 'tall' || c.assembly_class === 'tall_corner'
                )
              )
              if (floorCabs.length === 0 && chainFxFloor.length === 0) return null
              const segs = computeElevChain(floorCabs, wall, elevX, chainFxFloor)
              const chainY = roomH + tickH * 1.5 + layers.offset('dim_elev_floor_chain')
              const col = layers.color('dim_elev_floor_chain', '#ffffff')
              const chainOp = layers.op('dim_elev_floor_chain')
              const sw = layers.w('dim_elev_floor_chain', 1) / lz, fs = 12 / z, tk = 8 / z
              const boundaries = Array.from(new Set(segs.flatMap(s => [s.from, s.to])))
              return (
                <g pointerEvents="none" opacity={chainOp} style={{ userSelect: 'none' }}>
                  <line x1={0} y1={chainY} x2={wall.length} y2={chainY} stroke={col} strokeWidth={sw} />
                  {boundaries.map((x, i) => (
                    <line key={i} x1={x} y1={chainY - tk} x2={x} y2={chainY + tk} stroke={col} strokeWidth={sw} />
                  ))}
                  {segs.map((seg, i) => {
                    const mx = (seg.from + seg.to) / 2
                    const padX = fs * 1.8, padY = fs * 0.6
                    return (
                      <g key={i}>
                        <rect x={mx - padX} y={chainY - padY} width={padX * 2} height={padY * 2} fill={layers.background ?? '#030712'} />
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

            {/* Kick heights — a vertical dim just inside the start of each kick
                (a run of butting kicks at the same height shares one). */}
            {layers.show('dim_kicks') && (() => {
              const kicks = wallCabs.flatMap(c => {
                const k = kickLocal(resolvedParts?.get(c.id))
                if (!k) return []
                const x = elevX(c), bz = cabBottomZ(c, room, wall)
                return [{ x0: x + k.x0, x1: x + k.x1, top: bz + k.top }]
              })
              const marks = kickHeightMarks(kicks)
              if (!marks.length) return null
              const col = layers.color('dim_kicks', '#ffffff')
              const sw = layers.w('dim_kicks', 1) / lz, fs = 12 / z, tk = 6 / z
              return (
                <g pointerEvents="none" opacity={layers.op('dim_kicks')} style={{ userSelect: 'none' }}>
                  {marks.map((m, i) => {
                    const x = m.x + 24 / z + layers.offset('dim_kicks'), y0 = roomH, y1 = roomH - m.top, my = (y0 + y1) / 2
                    const padX = fs * 1.8, padY = fs * 0.6
                    return (
                      <g key={i}>
                        <line x1={x} y1={y0} x2={x} y2={y1} stroke={col} strokeWidth={sw} />
                        <line x1={x - tk} y1={y0} x2={x + tk} y2={y0} stroke={col} strokeWidth={sw} />
                        <line x1={x - tk} y1={y1} x2={x + tk} y2={y1} stroke={col} strokeWidth={sw} />
                        <g transform={`rotate(-90,${x},${my})`}>
                          <rect x={x - padX} y={my - padY} width={padX * 2} height={padY * 2} fill={layers.background ?? '#030712'} />
                          <text x={x} y={my} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fill={col}>
                            {roundMm(m.top)}
                          </text>
                        </g>
                      </g>
                    )
                  })}
                </g>
              )
            })()}

            {/* Doors / windows (z_fixtures P5): width row above the wall (wall start →
                jambs → wall end) + sill and opening height up each one's right jamb. */}
            {layers.show('dim_openings') && fixtures && (() => {
              const rc = centroid(walls)
              const ops = fixtures.flatMap(fx => {
                const o = openingOnWall(fx, wall, elevWallSide, rc)
                return o ? [{ t0: Math.max(0, o.t0), t1: Math.min(wall.length, o.t1), sill: Number(fx.z) || 0, h: Number(fx.height) }] : []
              }).sort((a, b) => a.t0 - b.t0)
              if (!ops.length) return null
              const col = layers.color('dim_openings', '#ffffff')
              const sw = layers.w('dim_openings', 1) / lz, fs = 12 / z, tk = 8 / z
              const padX = fs * 1.8, padY = fs * 0.6
              const bg = layers.background ?? '#030712'
              const segs: { from: number; to: number }[] = []
              let cur = 0
              for (const o of ops) {
                if (o.t0 > cur + 0.5) segs.push({ from: cur, to: o.t0 })
                segs.push({ from: Math.max(cur, o.t0), to: o.t1 })
                cur = Math.max(cur, o.t1)
              }
              if (cur < wall.length - 0.5) segs.push({ from: cur, to: wall.length })
              const chainY = -tickH * 4 - layers.offset('dim_openings')
              const label = (x: number, y: number, v: number, vertical = false) => (
                <g transform={vertical ? `rotate(-90,${x},${y})` : undefined}>
                  <rect x={x - padX} y={y - padY} width={padX * 2} height={padY * 2} fill={bg} />
                  <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fill={col}>{roundMm(v)}</text>
                </g>
              )
              const vDim = (key: string, x: number, zLo: number, zHi: number) => {
                const y0 = roomH - zLo, y1 = roomH - zHi
                return (
                  <g key={key}>
                    <line x1={x} y1={y0} x2={x} y2={y1} stroke={col} strokeWidth={sw} />
                    <line x1={x - tk} y1={y0} x2={x + tk} y2={y0} stroke={col} strokeWidth={sw} />
                    <line x1={x - tk} y1={y1} x2={x + tk} y2={y1} stroke={col} strokeWidth={sw} />
                    {label(x, (y0 + y1) / 2, zHi - zLo, true)}
                  </g>
                )
              }
              return (
                <g pointerEvents="none" opacity={layers.op('dim_openings')} style={{ userSelect: 'none' }}>
                  <line x1={0} y1={chainY} x2={wall.length} y2={chainY} stroke={col} strokeWidth={sw} />
                  {Array.from(new Set(segs.flatMap(s => [s.from, s.to]))).map((x, i) => (
                    <line key={i} x1={x} y1={chainY - tk} x2={x} y2={chainY + tk} stroke={col} strokeWidth={sw} />
                  ))}
                  {segs.map((s, i) => <g key={i}>{label((s.from + s.to) / 2, chainY, s.to - s.from)}</g>)}
                  {ops.map((o, i) => {
                    const x = o.t1 - 40 / z
                    return (
                      <g key={`v${i}`}>
                        {o.sill > 0.5 && vDim('s', x, 0, o.sill)}
                        {vDim('h', x, o.sill, o.sill + o.h)}
                      </g>
                    )
                  })}
                </g>
              )
            })()}

            {/* Bottom dimension — overall wall length */}
            {(() => {
              // Overall sits outside the floor chain, so it moves out with it.
              const dimY = roomH + tickH * 4 + (layers.show('dim_elev_floor_chain') ? layers.offset('dim_elev_floor_chain') : 0)
              const fs = 12 / z, tk = 8 / z, sw = 1 / lz, col = '#ffffff'
              const mx = wall.length / 2
              const padX = fs * 1.8, padY = fs * 0.6
              return (
                <g pointerEvents="none" style={{ userSelect: 'none' }}>
                  <line x1={0} y1={dimY} x2={wall.length} y2={dimY} stroke={col} strokeWidth={sw} />
                  <line x1={0}           y1={dimY - tk} x2={0}           y2={dimY + tk} stroke={col} strokeWidth={sw} />
                  <line x1={wall.length} y1={dimY - tk} x2={wall.length} y2={dimY + tk} stroke={col} strokeWidth={sw} />
                  <rect x={mx - padX} y={dimY - padY} width={padX * 2} height={padY * 2} fill={layers.background ?? '#030712'} />
                  <text x={mx} y={dimY} textAnchor="middle" dominantBaseline="middle"
                    fontSize={fs} fill={col} style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {roundMm(wall.length)}
                  </text>
                </g>
              )
            })()}

            {/* Left dimension — Y-axis height chain */}
            {layers.show('dim_elev_height') && (() => {
              const baseCabEl = chainCabs.find(c => !c.is_kick_assembly && (c.assembly_class === 'base' || c.assembly_class === 'base_corner')) ?? null
              const overheadCabEl = chainCabs.find(c => c.assembly_class === 'wall' || c.assembly_class === 'wall_corner') ?? null

              // A kick-detached member carries no kick of its own (has_toekick false): its
              // dy IS the carcase height and it's raised by pos_z. The kick height comes from
              // its run's standalone kick assembly, and any gap between the kick top and the
              // raised carcase bottom is dimensioned separately. Normal base cabinets keep the
              // old behaviour (own kick + carcase = dy − kick, no gap).
              const isDetachedMemberBase = !!baseCabEl?.kick_run_id && !baseCabEl?.is_kick_assembly && baseCabEl?.has_toekick === false
              const kickAsm = isDetachedMemberBase
                ? wallCabs.find(c => c.is_kick_assembly && c.kick_run_id === baseCabEl!.kick_run_id)
                : undefined
              const kickH = isDetachedMemberBase
                ? (kickAsm?.dy ?? 0)
                : (baseCabEl?.has_toekick
                    ? (resolvedParts?.get(baseCabEl.id)?.toekick_parts.find(p => p.part_key === 'kick_front_face')?.DX ?? 150)
                    : 0)
              const baseDy = baseCabEl?.dy ?? 0
              // Carcase bottom above the floor + carcase height.
              const carcBottom = isDetachedMemberBase ? (baseCabEl!.pos_z ?? 0) : kickH
              const carcDy     = isDetachedMemberBase ? baseDy : (baseDy - kickH)
              const wcTopZ = wallCabTop(wall, room)
              const overheadDy = overheadCabEl?.dy ?? 0

              const segs: { fromY: number; toY: number; label: string }[] = []
              let cursorY = roomH

              if (baseDy > 0) {
                // Kick band at the floor.
                if (kickH > 0) {
                  segs.push({ fromY: roomH - kickH, toY: cursorY, label: `${roundMm(kickH)}` })
                  cursorY = roomH - kickH
                }
                // Gap between the kick top and the (raised) carcase bottom.
                const gap = carcBottom - kickH
                if (gap > 0.5) {
                  segs.push({ fromY: roomH - carcBottom, toY: cursorY, label: `${roundMm(gap)}` })
                  cursorY = roomH - carcBottom
                }
                // Carcase.
                const carcTopY = roomH - (carcBottom + carcDy)
                segs.push({ fromY: carcTopY, toY: cursorY, label: `${roundMm(carcDy)}` })
                cursorY = carcTopY
              }

              if (overheadDy > 0) {
                const overheadBotY = roomH - (wcTopZ - overheadDy)
                const overheadTopY = roomH - wcTopZ
                if (overheadBotY < cursorY - 0.5) {
                  segs.push({ fromY: overheadBotY, toY: cursorY, label: `${roundMm(cursorY - overheadBotY)}` })
                }
                segs.push({ fromY: overheadTopY, toY: overheadBotY, label: `${overheadDy}` })
                cursorY = overheadTopY
              }

              if (cursorY > 0.5) {
                segs.push({ fromY: 0, toY: cursorY, label: `${roundMm(cursorY)}` })
              }

              if (segs.length === 0) {
                segs.push({ fromY: 0, toY: roomH, label: `${roomH}` })
              }

              const chainX = -70 / z - layers.offset('dim_elev_height')
              const tkLen = 8 / z
              const sw = layers.w('dim_elev_height', 1) / lz
              const fs = 12 / z
              const dimCol = layers.color('dim_elev_height', '#ffffff')
              const chainOp = layers.op('dim_elev_height')
              const boundaries = Array.from(new Set(segs.flatMap(s => [s.fromY, s.toY])))

              return (
                <g pointerEvents="none" opacity={chainOp} style={{ userSelect: 'none' }}>
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
                        <rect x={chainX - padX} y={midY - padY} width={padX * 2} height={padY * 2} fill={layers.background ?? '#030712'} />
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

            {/* ── Marquee selection rect ── */}
            {marquee && (
              <rect
                x={Math.min(marquee.x1, marquee.x2)} y={Math.min(marquee.y1, marquee.y2)}
                width={Math.abs(marquee.x2 - marquee.x1)} height={Math.abs(marquee.y2 - marquee.y1)}
                fill="rgba(59,130,246,0.08)" stroke="#3b82f6"
                strokeWidth={1 / lz} strokeDasharray={`${4 / z} ${2 / z}`}
                style={{ pointerEvents: 'none' }}
              />
            )}

            {/* ── Snap-point hints (faint white dots near the cursor) ── */}
            {mode === 'measure' && elevMeasureCursor && !elevMeasureEnd && (() => {
              const cur = elevMeasureCursor
              const r = 70 / z, r2 = r * r, dotR = 1.6 / z
              const near: Pt[] = []
              for (const p of snapHintPoints) {
                const dx = p.x - cur.x, dy = p.y - cur.y
                if (dx * dx + dy * dy <= r2) { near.push(p); if (near.length > 150) break }
              }
              if (near.length === 0) return null
              return (
                <g style={{ pointerEvents: 'none' }}>
                  {near.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={dotR} fill="#e5e7eb" fillOpacity={0.55} />)}
                </g>
              )
            })()}

            {/* ── Measure tool overlay ── */}
            {(() => {
              const a = elevMeasureStart
              const b = elevMeasureEnd ?? elevMeasureCursor
              if (!a) return null
              const ep = 4 / z
              if (!b) {
                return <circle cx={a.x} cy={a.y} r={ep} fill="#f59e0b" stroke="#111827" strokeWidth={1 / lz} style={{ pointerEvents: 'none' }} />
              }
              const d  = roundMm(dist(a, b))
              const ddx = roundMm(Math.abs(b.x - a.x))
              const ddy = roundMm(Math.abs(b.y - a.y))
              const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
              const fs = 11 / z, pad = 5 / z
              const boxW = fs * 6.5, boxH = fs * 2.6 + pad
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke="#f59e0b" strokeWidth={1.5 / lz}
                    strokeDasharray={elevMeasureEnd ? undefined : `${6 / z} ${3 / z}`} />
                  <circle cx={a.x} cy={a.y} r={ep} fill="#f59e0b" stroke="#111827" strokeWidth={1 / lz} />
                  <circle cx={b.x} cy={b.y} r={ep} fill="#f59e0b" stroke="#111827" strokeWidth={1 / lz} />
                  <rect x={mx - boxW / 2} y={my - boxH - pad} width={boxW} height={boxH} rx={2 / z}
                    fill="rgba(17,24,39,0.9)" stroke="#f59e0b" strokeWidth={0.75 / lz} />
                  <text x={mx} y={my - boxH + fs * 0.5} textAnchor="middle" dominantBaseline="middle"
                    fontSize={fs} fontWeight="600" fill="#fcd34d" style={{ userSelect: 'none' }}>
                    {d}mm
                  </text>
                  <text x={mx} y={my - boxH + fs * 1.7} textAnchor="middle" dominantBaseline="middle"
                    fontSize={fs * 0.8} fill="#9ca3af" style={{ userSelect: 'none' }}>
                    x {ddx}  y {ddy}
                  </text>
                </g>
              )
            })()}

            {/* ── Snap indicator glyph (active snap point) ── */}
            {elevSnapResult?.kind && (() => {
              const { pt, kind } = elevSnapResult
              const s = 5 / z
              const color = ELEV_SNAP_KIND_META[kind].color
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={pt.x - s} y={pt.y - s} width={s * 2} height={s * 2}
                    fill="none" stroke={color} strokeWidth={1.5 / lz} />
                  <line x1={pt.x - s * 1.7} y1={pt.y} x2={pt.x + s * 1.7} y2={pt.y}
                    stroke={color} strokeWidth={0.75 / lz} />
                  <line x1={pt.x} y1={pt.y - s * 1.7} x2={pt.x} y2={pt.y + s * 1.7}
                    stroke={color} strokeWidth={0.75 / lz} />
                </g>
              )
            })()}

          </g>
        )}
      </svg>

      {/* Floating snap-settings toolbar (top-right of the elevation pane). */}
      <SnapToolbar
        settings={elevSnapSettings}
        onChange={onElevSnapSettingsChange}
        kinds={ELEV_SNAP_KINDS}
        meta={ELEV_SNAP_KIND_META}
      />
    </div>
  )
}
