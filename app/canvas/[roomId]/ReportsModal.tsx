'use client'
import { useState, useEffect, useMemo, useCallback, useRef, type ComponentProps } from 'react'
import { startCombined, finishCombined, cancelCombined } from './pdfCombine'
import { supabase } from '@/src/lib/supabase'
import type { Project, Room, Wall, CabinetInstance, BenchtopInstance, RoomFixture, RoomAnnotation } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { ResolvedBenchtopPart } from '@/src/lib/benchtop-resolver/types'
import { dbLoadResolvedParts } from './canvasDB'
import { loadJobCustomParts } from './useMaterialColours'
import { withFixtureCutouts } from '@/src/lib/fixtureGeometry'
import { filterHiddenMap, filterRemovedParts } from '@/src/lib/resolver/filterHidden'
import PlanViewReport from './PlanViewReport'
import type { LayerSet } from '@/src/lib/displayLayers/registry'
import ElevationPrintReport from './ElevationPrintReport'
import ShopDrawingsReport from './ShopDrawingsReport'
import Render3DReport from './Render3DReport'
import type { Bt3DPrint } from './Room3DCapture'
import type { BtElevInfo } from './BenchtopElevation'
import { useCadFields } from './useCadFields'
import { withFieldsFilled } from '@/src/lib/annotations/blocks'
import { annotationsForPrint, ALL_CAD_LAYERS, type CadLayerView } from '@/src/lib/annotations/cadLayers'
import CabinetSheetReport from './CabinetSheetReport'
import { useTutorial } from '@/src/lib/tutorial/store'
import { BenchtopSupplySheet, supplyPrintHtml } from './BenchtopSupplyReport'
import { buildSupplyLines, supplyTotals } from '@/src/lib/benchtop-resolver/supply'
import { quoteTops, quoteTotals } from '@/src/lib/benchtopQuote'
import { ApplianceScheduleSheet, buildSchedule, schedulePrintHtml, type CatalogRef } from './ApplianceScheduleReport'
import { OpeningScheduleSheet, buildOpeningSchedule, openingSchedulePrintHtml } from './OpeningScheduleReport'
import { cutListDims, shapeMark, type CutListPart, type CutListTable } from '@/src/lib/optimiser/cutListDims'
import { buildSizeOvByCab, type SizeOv, type SizeOvByCab } from '@/src/lib/optimiser/sizeOverrides'
import { buildShapesByCab, SHAPE_SELECT, type ShapeRow, type ShapesByCab } from '@/src/lib/optimiser/shapes'
import { shapedPartLabel } from '@/src/lib/cabinetShape/partKeys'
import { zoneBlank } from '@/src/lib/jointDrilling'
import { EdgebandSheet, edgebandPrintHtml } from './EdgebandReport'
import { useTakeoff, HardwarePickSheet, TakeoffSheet } from './TakeoffReport'
import { hardwarePickPrintHtml, takeoffPrintHtml } from './TakeoffPrint'
import { buildCutStickers, cutStickersPdf } from '@/src/lib/takeoff/cutStickers'
import { loadLabelSettings } from '@/src/lib/optimiser/labels'
import { buildEdgebandReport, type EdgebandProduct, type EdgebandBoard } from '@/src/lib/optimiser/edgebandLength'
import { loadProjectParts } from '@/src/lib/optimiser/loadClient'
import type { OptiPart } from '@/src/lib/optimiser/types'

export type ReportScope = 'job' | 'room'
export type ReportId = 'parts_list_summary' | 'benchtop_supply' | 'appliance_schedule' | 'opening_schedule' | 'plan_view_v2' | 'elevation_view_v2' | 'cabinet_sheets' | 'shop_drawings' | 'render_3d' | 'edgeband_length' | 'benchtop_quote' | 'hardware_pick' | 'takeoff'

const REPORTS: { id: ReportId; label: string; desc: string }[] = [
  { id: 'shop_drawings',      label: 'Shop Drawings',       desc: 'One PDF per room: plan + elevations, one scale' },
  { id: 'parts_list_summary', label: 'Parts List Summary',  desc: 'Parts by room · material · cabinet' },
  { id: 'benchtop_supply',    label: 'Benchtop Supply',     desc: 'Stone / laminate order · m² · edges' },
  { id: 'benchtop_quote',     label: 'Benchtop Quote',      desc: 'For stonemasons: plan with walls, tops, edges + schedule' },
  { id: 'edgeband_length',    label: 'Edgeband Length',     desc: 'Tape metres by product · waste · cost' },
  { id: 'hardware_pick',      label: 'Hardware Pick List',  desc: 'Per room: hinges, runners, handles … qty + tick box' },
  { id: 'takeoff',            label: 'Takeoff',             desc: 'Per room: cabinets, sheets (nested), tape, hardware' },
  { id: 'appliance_schedule', label: 'Appliance Schedule',  desc: 'Appliances, sinks, taps · model · location' },
  { id: 'opening_schedule',   label: 'Door & Window Schedule', desc: 'Doors, windows, openings · size · sill · head' },
  { id: 'plan_view_v2',       label: 'Plan View',           desc: 'Scaled PDF, follows a layer set' },
  { id: 'elevation_view_v2',  label: 'Elevation Views',     desc: 'Scaled PDF, one wall per page, layer set' },
  { id: 'cabinet_sheets',     label: 'Cabinet Sheets',      desc: '1 page/cabinet — front, side, 3D + cut list' },
  { id: 'render_3d',          label: '3D Colour Render',    desc: 'Trial: shaded 3D views in the job colours, one per page' },
]

const CASE_LABELS: Record<string, string> = {
  left_side: 'Left Side', right_side: 'Right Side', bottom: 'Bottom', back: 'Back',
  full_top: 'Top', front_rail: 'Front Rail', back_rail: 'Back Rail',
}
const TK_LABELS: Record<string, string> = {
  kick_front_face: 'Toe Kick Front', kick_sub_front: 'Sub Front', kick_back: 'Toe Kick Back',
  spreader_vertical: 'Spreader (V)', spreader_horizontal: 'Spreader (H)', kick_return: 'Kick Return',
}
const INT_LABELS: Record<string, string> = {
  adj_shelf: 'Adjustable Shelf', fixed_shelf: 'Fixed Shelf',
  inner_drawer_bottom: 'Inner Drawer Bottom', inner_drawer_back: 'Inner Drawer Back',
  inner_drawer_side:   'Inner Drawer Side',  inner_drawer_front: 'Inner Drawer Front',
  pull_out_bottom:     'Pull-out Bottom',    pull_out_side:      'Pull-out Side',
  pull_out_back:       'Pull-out Back',
  accessory:           'Accessory',
  rail_support:        'Rail support',
}
const FACE_LABELS: Record<string, string> = {
  door: 'Door', drawer_face: 'Drawer Face', false_panel: 'False Panel',
}
const DB_LABELS: Record<string, string> = {
  db_left_side: 'Drawer Box Side', db_right_side: 'Drawer Box Side', db_front: 'Drawer Box Front',
  db_back: 'Drawer Box Back', db_bottom: 'Drawer Box Bottom',
}

// Listed L = DY (with the grain) × W = DX × T = DZ — the CV part convention,
// as PartsView and optimiser Stage 2.
interface PartRow {
  sourceLabel:  string
  partDesc:     string
  length:       number
  width:        number
  thickness:    number
  quantity:     number
  materialId:   string | null
  materialName?: string   // pre-resolved; overrides materialNames[materialId] lookup
}

// Sizes as the optimiser reads them (cutListDims, phase plan O6): hand / shape
// resizes folded in, shaped parts marked ⬠.
function collectParts(cabinets: CabinetInstance[], resolved: Map<string, ResolvedCabinet>, sizeOv: SizeOvByCab, shapes: ShapesByCab): PartRow[] {
  const rows: PartRow[] = []
  for (const cab of cabinets) {
    const r = resolved.get(cab.id)
    if (!r) continue
    const lbl = cab.label ?? cab.assembly_class
    const add = (desc: string, table: CutListTable, p: CutListPart & { material_id: string }, ref?: Parameters<typeof cutListDims>[5], blankW?: (DX: number, DZ: number) => number) => {
      const d = cutListDims(table, p, cab.id, sizeOv, shapes, ref)
      const mark = shapeMark(d)
      rows.push({ sourceLabel: lbl, partDesc: mark ? `${desc} ${mark}` : desc, length: d.DY, width: blankW ? blankW(d.DX, d.DZ) : d.DX, thickness: d.DZ, quantity: 1, materialId: p.material_id })
    }
    for (const p of r.case_parts) add(CASE_LABELS[p.part_key] ?? shapedPartLabel(p.part_key) ?? p.part_key, 'case_parts', p)
    for (const p of r.toekick_parts) add(TK_LABELS[p.part_key] ?? p.part_key, 'toekick_parts', p)
    for (const p of r.internal_parts) add(INT_LABELS[p.part_type] ?? p.part_type, 'internal_parts', p)
    for (const z of r.face_zones) {
      if (z.face_type === 'open') continue
      // Mitred facet fronts (z_cabinet_shape 3c) are cut at the blank width.
      add(FACE_LABELS[z.face_type] ?? z.face_type, 'face_zones', z, z, (DX, DZ) => zoneBlank({ ...z, DX, DZ }).width)
    }
    for (const stk of r.drawer_stacks ?? [])
      for (const p of stk.box_parts) add(DB_LABELS[p.part_type] ?? p.part_type, 'drawer_box_parts', p, stk)
  }
  return rows
}

type StoredBtPart = ResolvedBenchtopPart & { benchtop_id: string }

function collectBtParts(
  benchtops: BenchtopInstance[],
  resolvedRows: StoredBtPart[],
): PartRow[] {
  const byBtId = new Map<string, StoredBtPart[]>()
  for (const r of resolvedRows) {
    const arr = byBtId.get(r.benchtop_id) ?? []
    arr.push(r)
    byBtId.set(r.benchtop_id, arr)
  }
  const rows: PartRow[] = []
  for (const bt of benchtops) {
    const btParts = byBtId.get(bt.id) ?? []
    const lbl = bt.label ?? 'Benchtop'
    for (const p of btParts) {
      // Outsourced stone / laminate are order items — on the Benchtop Supply sheet, not the cut list.
      if (p.supply_item) continue
      rows.push({
        sourceLabel:  lbl,
        partDesc:     p.label,
        length:       p.length_mm,
        width:        p.width_mm,
        thickness:    p.thickness_mm,
        quantity:     p.quantity,
        materialId:   p.material_id ?? p.benchtop_material_id ?? null,
        materialName: p.material_name ?? p.benchtop_material_name ?? undefined,
      })
    }
  }
  return rows
}

/** Reports that draw one room at a time (one PDF per room); Job Reports picks the room. */
const DRAWING_REPORTS: ReportId[] = ['shop_drawings', 'plan_view_v2', 'benchtop_quote', 'elevation_view_v2', 'cabinet_sheets', 'render_3d']

const PAPER = {
  A4L: { w: 297, h: 210, label: 'A4 Landscape' },
  A3L: { w: 420, h: 297, label: 'A3 Landscape' },
  A2L: { w: 594, h: 420, label: 'A2 Landscape' },
  A1L: { w: 841, h: 594, label: 'A1 Landscape' },
}

export default function ReportsModal({ initialScope, initialReport, bt3d, btInfoFor, onDeleteShopShot, project, room, walls, cabinets, resolvedParts, benchtops, benchTopZ, fixtures = [], annotations = [], cadLayers = ALL_CAD_LAYERS, materialColours, ebByMatId, layerSets, activeLayerSetId, onClose }: {
  /** Material colours for the 3D colour render (keyed by material id). */
  materialColours?: ComponentProps<typeof Render3DReport>['materialColours']
  ebByMatId?: ComponentProps<typeof Render3DReport>['ebByMatId']
  initialScope: ReportScope
  /** Report to open on (Production → Shop Drawings opens straight on the package). */
  initialReport?: ReportId
  /** Benchtop slab inputs for the shop drawings 3D views. */
  bt3d?: Omit<Bt3DPrint, 'benchtops'>
  /** Benchtop info for another room of the job (its own base height + top cascade). */
  btInfoFor?: (rm: Room) => (bt: BenchtopInstance) => BtElevInfo
  /** Remove a 3D view saved from the 3D view (room.shop_3d_shots). */
  onDeleteShopShot?: (id: string) => void
  project: Project | null
  room: Room
  walls: Wall[]
  cabinets: CabinetInstance[]
  resolvedParts: Map<string, ResolvedCabinet>
  benchtops: BenchtopInstance[]
  /** Top-surface height of a benchtop (the canvas thickness cascade) — elevation bench dims. */
  benchTopZ?: (bt: BenchtopInstance) => number
  /** Placed fixtures in this room (appliance schedule). */
  fixtures?: RoomFixture[]
  /** CAD annotations (z_CAD_tool) for this room — the plan / elevation reports draw the canvas room. */
  annotations?: RoomAnnotation[]
  /** The job's named CAD layers (z_cad_layers): off and no-print layers stay off every report. */
  cadLayers?: CadLayerView
  layerSets: LayerSet[]
  activeLayerSetId: string | null
  onClose: () => void
}) {
  const [scope, setScope] = useState<ReportScope>(initialScope)
  const [selectedReport, setSelectedReport] = useState<ReportId>(initialReport ?? 'parts_list_summary')
  // Tutorial mode (z_tutorial): which report is open, null once the window closes.
  useEffect(() => {
    useTutorial.getState().setCtx({ report: selectedReport })
    return () => useTutorial.getState().setCtx({ report: null })
  }, [selectedReport])

  // Paper size + scale for SVG output
  const [printPaper, setPrintPaper] = useState<keyof typeof PAPER>('A3L')
  const [printScale, setPrintScale] = useState(20)
  const SCALES = [5, 10, 15, 20, 25, 30, 40, 50, 100]

  const [jobRooms, setJobRooms] = useState<Room[]>([])
  const [jobCabinets, setJobCabinets] = useState<CabinetInstance[]>([])
  const [jobResolved, setJobResolved] = useState<Map<string, ResolvedCabinet>>(new Map())
  const [loadingJob, setLoadingJob] = useState(false)

  const [roomBtParts, setRoomBtParts] = useState<StoredBtPart[]>([])
  const [jobBtInstances, setJobBtInstances] = useState<BenchtopInstance[]>([])
  const [jobBtParts, setJobBtParts] = useState<StoredBtPart[]>([])

  const [materialNames, setMaterialNames] = useState<Record<string, string>>({})
  const [jobFixtures, setJobFixtures] = useState<RoomFixture[]>([])
  const [jobWalls, setJobWalls] = useState<Wall[]>([])
  const [fixtureCatalog, setFixtureCatalog] = useState<Map<string, CatalogRef>>(new Map())

  const rooms          = scope === 'room' ? [room]        : jobRooms
  const allCabinets    = scope === 'room' ? cabinets      : jobCabinets
  // Cut lists and cabinet sheets list every part that is MADE: removed parts
  // (hidden in all three views) drop out with their hinges / runners. Partial
  // per-view hides (z_display_layers/PART-HIDE-SPEC.md) apply only to the plan /
  // elevation drawings.
  const rawResolved    = scope === 'room' ? resolvedParts : jobResolved
  const allResolved    = useMemo(() => {
    const m = new Map<string, ResolvedCabinet>()
    for (const [id, r] of rawResolved) m.set(id, filterRemovedParts(r))
    return m
  }, [rawResolved])
  const allBtInstances = scope === 'room' ? benchtops     : jobBtInstances
  const allBtParts     = scope === 'room' ? roomBtParts   : jobBtParts

  // Size overrides + drawn shapes for every cabinet in scope (cut-list sizes, O6).
  const [sizeOv, setSizeOv] = useState<SizeOvByCab>(new Map())
  const [shapes, setShapes] = useState<ShapesByCab>(new Map())
  const cabIdsKey = allCabinets.map(c => c.id).sort().join(',')
  useEffect(() => {
    const ids = cabIdsKey ? cabIdsKey.split(',') : []
    if (!ids.length) return
    let cancelled = false
    void Promise.all([
      supabase.from('cabinet_instances').select('id, part_pos_overrides').in('id', ids),
      supabase.from('part_shape_overrides').select(SHAPE_SELECT).in('cabinet_id', ids).order('revision', { ascending: false }),
    ]).then(([{ data: ov }, { data: sh }]) => {
      if (cancelled) return
      setSizeOv(buildSizeOvByCab((ov ?? []) as { id: string; part_pos_overrides?: Record<string, SizeOv> | null }[]))
      setShapes(buildShapesByCab((sh ?? []) as ShapeRow[]))
    })
    return () => { cancelled = true }
  }, [cabIdsKey])

  useEffect(() => {
    if (scope !== 'job' || !project || jobRooms.length > 0) return
    setLoadingJob(true)
    async function load() {
      const { data: rms } = await supabase.from('rooms').select('*').eq('project_id', project!.id).order('sort_order')
      if (!rms) { setLoadingJob(false); return }
      setJobRooms(rms as Room[])
      const roomIds = rms.map(r => r.id)
      const [{ data: cabs }, { data: bts }, { data: fxs }, { data: wls }] = await Promise.all([
        supabase.from('cabinet_instances').select('*').in('room_id', roomIds),
        supabase.from('benchtop_instances').select('*').in('room_id', roomIds),
        supabase.from('room_fixtures').select('*').in('room_id', roomIds),
        supabase.from('walls').select('*').in('room_id', roomIds),
      ])
      setJobFixtures((fxs ?? []) as RoomFixture[])
      setJobWalls((wls ?? []) as Wall[])
      if (!cabs) { setLoadingJob(false); return }
      setJobCabinets(cabs as CabinetInstance[])
      setJobBtInstances((bts ?? []) as BenchtopInstance[])
      const [resolved, btPartsResult] = await Promise.all([
        // Custom-only cabinets (end panels, fillers) have no case rows — without their
        // custom parts they'd draw as carcass-depth placeholder boxes.
        dbLoadResolvedParts(cabs.map(c => c.id)).then(async m => { await loadJobCustomParts(m, cabs.map(c => c.id)); return m }),
        (bts ?? []).length > 0
          ? supabase.from('benchtop_resolved_parts').select('*').in('benchtop_id', (bts ?? []).map(b => (b as { id: string }).id))
          : Promise.resolve({ data: [] }),
      ])
      setJobResolved(resolved)
      setJobBtParts((btPartsResult.data ?? []) as StoredBtPart[])
      setLoadingJob(false)
    }
    void load()
  }, [scope, project, jobRooms.length])

  useEffect(() => {
    const matIds = new Set<string>()
    for (const r of allResolved.values()) {
      r.case_parts.forEach(p     => matIds.add(p.material_id))
      r.toekick_parts.forEach(p  => matIds.add(p.material_id))
      r.internal_parts.forEach(p => matIds.add(p.material_id))
      r.face_zones.forEach(z     => matIds.add(z.material_id))
      ;(r.drawer_stacks ?? []).forEach(s => s.box_parts.forEach(p => matIds.add(p.material_id)))
    }
    const missing = [...matIds].filter(id => !materialNames[id])
    if (missing.length === 0) return
    supabase.from('materials').select('id, name').in('id', missing).then(({ data }) => {
      if (!data) return
      setMaterialNames(prev => {
        const next = { ...prev }
        for (const m of data) next[m.id] = m.name
        return next
      })
    })
  }, [allResolved]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load resolved parts for the current room's benchtops once on modal open.
  // The modal remounts on each open so this is effectively a per-open fetch.
  useEffect(() => {
    const ids = benchtops.map(b => b.id)
    if (ids.length === 0) return
    void supabase.from('benchtop_resolved_parts').select('*').in('benchtop_id', ids)
      .then(({ data }) => setRoomBtParts((data ?? []) as StoredBtPart[]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const reportData = useMemo(() => {
    return rooms.map(r => {
      const roomCabs = allCabinets
        .filter(c => c.room_id === r.id)
        .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '', undefined, { numeric: true }))
      const cabParts = collectParts(roomCabs, allResolved, sizeOv, shapes)
      const roomBenchtops = allBtInstances.filter(bt => bt.room_id === r.id)
      const btParts = collectBtParts(roomBenchtops, allBtParts)
      const allParts = [...cabParts, ...btParts]
      const byMat = new Map<string, PartRow[]>()
      for (const p of allParts) {
        const name = p.materialName ?? (p.materialId != null ? (materialNames[p.materialId] ?? p.materialId) : null) ?? 'Unknown'
        byMat.set(name, [...(byMat.get(name) ?? []), p])
      }
      const materialGroups = [...byMat.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([matName, ps]) => ({ matName, parts: ps }))
      return { room: r, materialGroups, totalParts: allParts.length }
    })
  }, [rooms, allCabinets, allResolved, allBtInstances, allBtParts, materialNames, sizeOv, shapes])

  const supplyData = useMemo(() => rooms.map(r => ({
    room: r,
    lines: buildSupplyLines(allBtInstances.filter(bt => bt.room_id === r.id), allBtParts),
  })), [rooms, allBtInstances, allBtParts])
  // Appliance schedule: brand / model no. come from the library row each fixture was placed from.
  const allFixtures = scope === 'room' ? fixtures : jobFixtures
  const allWalls    = scope === 'room' ? walls    : jobWalls
  useEffect(() => {
    const ids = [...new Set(allFixtures.map(f => f.catalog_id).filter((x): x is string => !!x))].filter(id => !fixtureCatalog.has(id))
    if (!ids.length) return
    void supabase.from('fixture_catalog').select('id, brand, model_no').in('id', ids).then(({ data }) => {
      if (!data) return
      setFixtureCatalog(prev => { const next = new Map(prev); for (const r of data) next.set(r.id, { brand: r.brand, model_no: r.model_no }); return next })
    })
  }, [allFixtures]) // eslint-disable-line react-hooks/exhaustive-deps
  const openingData = useMemo(() => buildOpeningSchedule(rooms, allFixtures, allWalls), [rooms, allFixtures, allWalls])
  const scheduleData = useMemo(() => buildSchedule(rooms, allFixtures, allCabinets, allWalls, fixtureCatalog),
    [rooms, allFixtures, allCabinets, allWalls, fixtureCatalog])

  // ── Drawing reports: one room at a time. The open room draws from the live
  // canvas; in Job Reports any other room draws from what was loaded for the job.
  const [drawRoomId, setDrawRoomId] = useState(room.id)
  // Rooms ticked for "Download N rooms" (all by default); the queue runs them one at a
  // time — each report downloads its own PDF once ready, then hands on (useBatchDownload).
  const [roomsOff, setRoomsOff] = useState<Set<string>>(new Set())
  const tickedRooms = jobRooms.filter(r => !roomsOff.has(r.id))
  const [queue, setQueue] = useState<{ ids: string[]; total: number; one: boolean } | null>(null)
  // "One PDF": every ticked room's pages in a single file (pdfCombine), remembered.
  const [onePdf, setOnePdf] = useState(() => { try { return localStorage.getItem('reports-one-pdf') !== '0' } catch { return true } })
  useEffect(() => { try { localStorage.setItem('reports-one-pdf', onePdf ? '1' : '0') } catch { /* ignore */ } }, [onePdf])
  const batchDone = useRef(false)
  const startBatch = () => {
    if (!tickedRooms.length) return
    batchDone.current = false
    if (onePdf) startCombined()
    setQueue({ ids: tickedRooms.map(r => r.id), total: tickedRooms.length, one: onePdf })
    setDrawRoomId(tickedRooms[0].id)
  }
  const batchNext = useCallback(() => setQueue(q => {
    const rest = q ? q.ids.slice(1) : []
    if (!q || !rest.length) { batchDone.current = true; return null }
    setDrawRoomId(rest[0])
    return { ...q, ids: rest }
  }), [])
  // Queue over: save the combined file if every room ran, drop it if stopped part-way.
  const prevQueue = useRef(queue)
  useEffect(() => {
    const was = prevQueue.current
    prevQueue.current = queue
    if (!was?.one || queue) return
    if (!batchDone.current) { cancelCombined(); return }
    const safe = (x: string) => x.replace(/[^\w-]+/g, '_')
    const label = REPORTS.find(r => r.id === selectedReport)?.label ?? 'report'
    finishCombined(`${safe(label)}-${safe(project?.job_number || project?.name || 'job')}-${was.total}-rooms.pdf`)
  }, [queue, selectedReport, project])
  const batch = queue ? batchNext : undefined
  const drawRoom = scope === 'room' ? room : (jobRooms.find(r => r.id === drawRoomId) ?? room)
  const isHere = drawRoom.id === room.id
  // Remount per room, and once more when a queue starts on the room already shown.
  const reportKey = queue ? `${drawRoom.id}:b${queue.ids.length}` : drawRoom.id
  const drawWalls = useMemo(() => isHere ? walls : jobWalls.filter(w => w.room_id === drawRoom.id), [isHere, walls, jobWalls, drawRoom.id])
  const drawCabinets = useMemo(() => isHere ? cabinets : jobCabinets.filter(c => c.room_id === drawRoom.id), [isHere, cabinets, jobCabinets, drawRoom.id])
  const drawFixtures = useMemo(() => isHere ? fixtures : jobFixtures.filter(f => f.room_id === drawRoom.id), [isHere, fixtures, jobFixtures, drawRoom.id])
  // Sink / cooktop cutouts come from the fixtures at draw time (as on the canvas), never saved.
  const drawBenchtops = useMemo(() => (isHere ? benchtops : jobBtInstances.filter(b => b.room_id === drawRoom.id))
    .map(b => withFixtureCutouts(b, drawFixtures)), [isHere, benchtops, jobBtInstances, drawRoom.id, drawFixtures])
  const drawResolved = useMemo(() => {
    const src = isHere ? resolvedParts : jobResolved
    const m = new Map<string, ResolvedCabinet>()
    for (const c of drawCabinets) { const r = src.get(c.id); if (r) m.set(c.id, filterRemovedParts(r)) }
    return m
  }, [isHere, resolvedParts, jobResolved, drawCabinets])
  const drawPlanResolved = useMemo(() => filterHiddenMap(drawResolved, 'plan'), [drawResolved])
  const drawElevResolved = useMemo(() => filterHiddenMap(drawResolved, 'elevation'), [drawResolved])
  const draw3DResolved = useMemo(() => filterHiddenMap(drawResolved, '3d'), [drawResolved])
  // Keyed on the room id — the room object is rebuilt on every job load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const drawBtInfo = useMemo(() => isHere ? bt3d?.info : btInfoFor?.(drawRoom), [isHere, drawRoom.id, bt3d, btInfoFor])
  const drawBenchTopZ = isHere ? benchTopZ : drawBtInfo && ((b: BenchtopInstance) => drawBtInfo(b).topZ)
  const drawBt3d = drawBtInfo && bt3d ? { info: drawBtInfo, profiles: bt3d.profiles } : undefined
  const drawBtDefaultProfile = useMemo(() => drawBtInfo && ((b: BenchtopInstance) => drawBtInfo(b).defaultProfileId), [drawBtInfo])
  // Benchtop Quote: per-top schedule from the drawing; material from the supply rows when resolved.
  const drawQuote = useMemo(() => {
    if (selectedReport !== 'benchtop_quote') return undefined
    const lines = buildSupplyLines(drawBenchtops.map(b => ({ id: b.id, label: b.label, room_id: b.room_id })), allBtParts)
    const tops = quoteTops(drawBenchtops, {
      profiles: bt3d?.profiles,
      defaultProfileId: drawBtDefaultProfile,
      thickness: b => drawBtInfo?.(b).thick.total ?? lines.find(l => l.benchtopId === b.id)?.thickness ?? null,
      material: b => [...new Set(lines.filter(l => l.benchtopId === b.id).map(l => l.material))].join(', ') || null,
    })
    return { tops, totals: quoteTotals(tops) }
  }, [selectedReport, drawBenchtops, allBtParts, bt3d, drawBtDefaultProfile, drawBtInfo])
  // CAD (spec block etc.) of another room, with that room's {fields} filled.
  const [otherAnnots, setOtherAnnots] = useState<{ roomId: string; rows: RoomAnnotation[] } | null>(null)
  useEffect(() => {
    if (isHere) return
    let dead = false
    void supabase.from('room_annotations').select('*').eq('room_id', drawRoom.id).order('sort_order')
      .then(({ data }) => { if (!dead) setOtherAnnots({ roomId: drawRoom.id, rows: (data ?? []) as RoomAnnotation[] }) })
    return () => { dead = true }
  }, [isHere, drawRoom.id])
  const otherFields = useCadFields({ project, room: drawRoom, resolvedParts: drawResolved, fixtures: drawFixtures, cabinets: drawCabinets })
  const drawAnnots = useMemo(() => annotationsForPrint(isHere
    ? annotations
    : withFieldsFilled(otherAnnots?.roomId === drawRoom.id ? otherAnnots.rows : [], otherFields), cadLayers),
  [isHere, annotations, otherAnnots, drawRoom.id, otherFields, cadLayers])
  const drawPlanAnnots = useMemo(() => drawAnnots.filter(a => a.view === 'plan'), [drawAnnots])
  function deleteShot(id: string) {
    if (isHere) { onDeleteShopShot?.(id); return }
    const shots = (drawRoom.shop_3d_shots ?? []).filter(s => s.id !== id)
    setJobRooms(prev => prev.map(r => r.id === drawRoom.id ? { ...r, shop_3d_shots: shots } : r))
    void supabase.from('rooms').update({ shop_3d_shots: shots }).eq('id', drawRoom.id)
      .then(({ error }) => { if (error) console.error('[shop 3D views]', error) })
  }

  // Edgeband length (O7): the saved part snapshot the optimiser nests, loaded
  // when the report is first opened; scoped to the rooms in view.
  const [ebParts, setEbParts] = useState<OptiPart[] | null>(null)
  const [ebProducts, setEbProducts] = useState<Map<string, EdgebandProduct>>(new Map())
  const [ebBoards, setEbBoards] = useState<Map<string, EdgebandBoard>>(new Map())
  const [ebWaste, setEbWaste] = useState(() => {
    try {
      const raw = localStorage.getItem('rhk.edgebandWastePct')
      return raw != null && Number(raw) >= 0 ? Number(raw) : 10
    } catch { return 10 }
  })
  useEffect(() => { try { localStorage.setItem('rhk.edgebandWastePct', String(ebWaste)) } catch { /* private mode */ } }, [ebWaste])
  useEffect(() => {
    if (selectedReport !== 'edgeband_length' || !project || ebParts) return
    let cancelled = false
    void loadProjectParts(project.id).then(async ({ parts }) => {
      const banded = parts.filter(p => p.eb_tape?.length)
      const ids = [...new Set(banded.flatMap(p => p.eb_tape!.map(t => t.id).filter((id): id is string => !!id)))]
      // The boards the tape goes on (a matching tape's finish), and which of
      // them are bare boards that have colours (= colour not chosen).
      const matIds = [...new Set(banded.map(p => p.material_id).filter((id): id is string => !!id))]
      const [{ data }, { data: mats }, { data: kids }] = await Promise.all([
        ids.length
          ? supabase.from('edge_banding').select('id,name,brand,color,finish,material_match_id,thickness,width,cost_per_metre').in('id', ids)
          : Promise.resolve({ data: [] }),
        matIds.length ? supabase.from('materials').select('id,name').in('id', matIds) : Promise.resolve({ data: [] }),
        matIds.length ? supabase.from('materials').select('parent_id').in('parent_id', matIds).eq('active', true) : Promise.resolve({ data: [] }),
      ])
      if (cancelled) return
      const parents = new Set(((kids ?? []) as { parent_id: string }[]).map(k => k.parent_id))
      setEbProducts(new Map(((data ?? []) as EdgebandProduct[]).map(p => [p.id, p])))
      setEbBoards(new Map(((mats ?? []) as { id: string; name: string }[]).map(m => [m.id, { id: m.id, name: m.name, hasColours: parents.has(m.id) }])))
      setEbParts(parts)
    })
    return () => { cancelled = true }
  }, [selectedReport, project, ebParts])
  const ebReport = useMemo(() => {
    if (!ebParts) return null
    const ids = rooms.map(r => r.id)
    return buildEdgebandReport(ebParts.filter(p => ids.includes(p.room_id)), ebProducts, ebWaste / 100, ids, ebBoards)
  }, [ebParts, ebProducts, ebBoards, ebWaste, rooms])

  // Hardware Pick List + Takeoff (z_takeoff): loads + nests only while one is open.
  const takeoff = useTakeoff({ active: selectedReport === 'hardware_pick' || selectedReport === 'takeoff', project, rooms, cabinets: allCabinets, resolved: allResolved })

  const supplyTotalsAll = useMemo(() => supplyTotals(supplyData.flatMap(d => d.lines)), [supplyData])

  // Cut-length stickers (z_takeoff T5): one per hanging rail / linear strip on
  // the pick list, at the optimiser's label size.
  const cutStickers = useMemo(() => takeoff.data
    ? buildCutStickers(project?.name ?? '', takeoff.data.rooms.map(r => ({ name: r.room.name, lines: r.hardware })))
    : [], [takeoff.data, project?.name])
  async function downloadCutStickers() {
    const st = loadLabelSettings()
    const doc = await cutStickersPdf(cutStickers, st)
    const url = URL.createObjectURL(doc.output('blob'))
    const a = document.createElement('a')
    a.href = url
    a.download = `${project?.job_number || project?.name || 'job'} ${scope === 'room' ? `${room.name} ` : ''}cut stickers ${st.w}x${st.h}.pdf`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  function handlePrint() {
    if (selectedReport === 'edgeband_length') useTutorial.getState().emit('edgeband_print')   // tutorial edgeband_length
    if (selectedReport === 'hardware_pick' || selectedReport === 'takeoff') useTutorial.getState().emit('takeoff_print')   // tutorial takeoff_reports
    const reportTitle = REPORTS.find(r => r.id === selectedReport)?.label ?? 'Report'
    const scopeLabel  = scope === 'room' ? room.name : (project?.name ?? 'Job')

    const rows = selectedReport === 'benchtop_supply' ? [supplyPrintHtml(supplyData, supplyTotalsAll)]
      : selectedReport === 'edgeband_length' ? [edgebandPrintHtml(ebReport, ebWaste / 100)]
      : selectedReport === 'hardware_pick' ? [hardwarePickPrintHtml(takeoff.data)]
      : selectedReport === 'takeoff' ? [takeoffPrintHtml(takeoff.data)]
      : selectedReport === 'appliance_schedule' ? [schedulePrintHtml(scheduleData)]
      : selectedReport === 'opening_schedule' ? [openingSchedulePrintHtml(openingData)] : reportData.flatMap(({ room: rm, materialGroups }) =>
      materialGroups.length === 0 ? [] : [`
        <h2>${rm.name}</h2>
        ${materialGroups.map(({ matName, parts }) => `
          <h3>${matName}</h3>
          <table>
            <thead><tr><th>Source</th><th>Part</th><th class="r">Length (mm)</th><th class="r">Width (mm)</th><th class="r">Thk (mm)</th><th class="r">Qty</th></tr></thead>
            <tbody>
              ${parts.map((p, i) => `
                <tr class="${i % 2 ? 'alt' : ''}">
                  <td class="mono">${p.sourceLabel}</td>
                  <td>${p.partDesc}</td>
                  <td class="r mono">${Math.round(p.length)}</td>
                  <td class="r mono">${Math.round(p.width)}</td>
                  <td class="r mono">${Math.round(p.thickness)}</td>
                  <td class="r mono">${p.quantity}</td>
                </tr>`).join('')}
            </tbody>
          </table>`).join('')}
      `]
    )

    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head>
      <title>${reportTitle} — ${scopeLabel}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 0; padding: 20mm 20mm 25mm; }
        .header { border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 16px; }
        .header h1 { font-size: 16px; margin: 0 0 2px; }
        .header p { margin: 0; font-size: 10px; color: #555; }
        h2 { font-size: 13px; margin: 20px 0 6px; border-bottom: 1px solid #999; padding-bottom: 3px; }
        h3 { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #555; margin: 12px 0 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
        th { text-align: left; border-bottom: 1px solid #333; padding: 3px 6px 3px 0; font-size: 10px; color: #333; }
        td { padding: 2px 6px 2px 0; vertical-align: top; }
        tr.alt td { background: #f4f4f4; }
        .r { text-align: right; }
        .mono { font-family: 'Courier New', monospace; }
        @media print { body { margin: 0; } @page { margin: 15mm 15mm 20mm; size: A4; } }
      </style>
    </head><body>
      <div class="header">
        <h1>${reportTitle}</h1>
        <p>${scopeLabel} &nbsp;·&nbsp; Generated ${new Date().toLocaleDateString()}</p>
      </div>
      ${rows.join('') || `<p style="color:#888">${selectedReport === 'benchtop_supply' ? 'No benchtop supply items.' : selectedReport === 'edgeband_length' ? 'No edgebanded parts.' : selectedReport === 'hardware_pick' ? 'No hardware.' : selectedReport === 'takeoff' ? 'Nothing to take off yet.' : selectedReport === 'appliance_schedule' ? 'No appliances placed.' : selectedReport === 'opening_schedule' ? 'No doors or windows placed.' : 'No resolved parts found. Open and resolve cabinets first.'}</p>`}
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 250)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col" style={{ width: 'min(1600px, 96vw)', height: '94vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
          <span className="text-sm font-semibold text-gray-100">Reports</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl leading-none w-6 h-6 flex items-center justify-center">×</button>
        </div>

        {/* Scope tabs */}
        <div className="flex border-b border-gray-800 px-1 pt-1">
          {(['room', 'job'] as ReportScope[]).map(s => (
            <button key={s} onClick={() => setScope(s)}
              className={`px-4 py-1.5 text-xs font-medium transition-colors rounded-t border-b-2 -mb-px ${
                scope === s ? 'text-blue-400 border-blue-500 bg-blue-500/10' : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800'
              }`}>
              {s === 'room' ? 'Room Reports' : 'Job Reports'}
            </button>
          ))}
        </div>

        <div className="flex flex-1 overflow-hidden">

          {/* Picker sidebar */}
          <div className="w-44 flex-none border-r border-gray-800 p-2 space-y-1">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider px-2 py-1">Available</div>
            {REPORTS.map(rep => (
              <button key={rep.id} data-tour={`report-${rep.id}`} onClick={() => setSelectedReport(rep.id)}
                className={`w-full text-left px-2 py-2 rounded text-xs transition-colors ${
                  selectedReport === rep.id
                    ? 'bg-blue-600/25 text-blue-300 border border-blue-600/40'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}>
                <div className="font-medium leading-tight">{rep.label}</div>
                <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">{rep.desc}</div>
              </button>
            ))}
          </div>

          {/* Report area */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 shrink-0">
              <div className="text-xs text-gray-300">
                <span className="font-medium">{REPORTS.find(r => r.id === selectedReport)?.label}</span>
                <span className="text-gray-500 ml-2">
                  {scope === 'room' ? room.name : (project?.name ?? 'Job')}
                  {scope === 'job' && DRAWING_REPORTS.includes(selectedReport) && ` · ${drawRoom.name}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {(selectedReport === 'plan_view_v2' || selectedReport === 'benchtop_quote' || selectedReport === 'elevation_view_v2' || selectedReport === 'shop_drawings') && (
                  <select value={printScale} onChange={e => setPrintScale(Number(e.target.value))}
                    className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-1.5 py-1"
                    title="Drawing scale — 1:N">
                    {SCALES.map(s => <option key={s} value={s}>1:{s}</option>)}
                  </select>
                )}
                {(selectedReport === 'plan_view_v2' || selectedReport === 'benchtop_quote' || selectedReport === 'elevation_view_v2' || selectedReport === 'cabinet_sheets' || selectedReport === 'shop_drawings' || selectedReport === 'render_3d') && (
                  <select value={printPaper} onChange={e => setPrintPaper(e.target.value as keyof typeof PAPER)}
                    className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-1.5 py-1">
                    {(Object.keys(PAPER) as (keyof typeof PAPER)[]).map(k => (
                      <option key={k} value={k}>{PAPER[k].label}</option>
                    ))}
                  </select>
                )}
                {selectedReport === 'edgeband_length' && (
                  <label data-tour="edgeband-waste" className="text-xs text-gray-400 flex items-center gap-1" title="Added on top of the finished metres">
                    Waste
                    <input type="number" min={0} max={100} step={1} value={ebWaste}
                      onChange={e => setEbWaste(Math.max(0, Number(e.target.value) || 0))}
                      className="w-12 text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-1.5 py-1 text-right" />
                    %
                  </label>
                )}
                {selectedReport === 'hardware_pick' && cutStickers.length > 0 && (
                  <button onClick={() => void downloadCutStickers()}
                    title="One sticker per cut piece (hanging rails, linear handles) — label size from Optimiser → Labels"
                    className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors">
                    Cut stickers ({cutStickers.length})
                  </button>
                )}
                {/* The plan / elevation / cabinet reports have their own download button in their toolbar. */}
                {selectedReport !== 'plan_view_v2' && selectedReport !== 'benchtop_quote' && selectedReport !== 'elevation_view_v2' && selectedReport !== 'cabinet_sheets' && selectedReport !== 'shop_drawings' && selectedReport !== 'render_3d' && (
                  <button onClick={handlePrint}
                    className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-medium">
                    Print / PDF
                  </button>
                )}
              </div>
            </div>

            {/* Job Reports: which room the drawing report draws (one PDF per room). */}
            {scope === 'job' && DRAWING_REPORTS.includes(selectedReport) && jobRooms.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-gray-800 shrink-0">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1"
                  title="Tick the rooms to download; click a name to preview that room">Rooms:</span>
                {jobRooms.map(r => {
                  const on = !roomsOff.has(r.id), shown = r.id === drawRoom.id
                  return (
                    <span key={r.id} className={`inline-flex items-center rounded text-xs border ${shown ? 'border-blue-500 bg-blue-600/25 text-blue-200' : on ? 'border-gray-600 text-gray-300' : 'border-gray-800 text-gray-500'}`}>
                      <button className="pl-1.5 pr-1 py-0.5" disabled={!!queue} title={on ? 'Leave this room out' : 'Include this room'}
                        onClick={() => setRoomsOff(prev => {
                          const next = new Set(prev)
                          if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                          return next
                        })}>{on ? '☑' : '☐'}</button>
                      <button className="pr-2 py-0.5" disabled={!!queue} onClick={() => setDrawRoomId(r.id)}>{r.name}</button>
                    </span>
                  )
                })}
                <button className="px-1.5 py-0.5 text-[11px] text-gray-400 hover:text-gray-200" disabled={!!queue}
                  onClick={() => setRoomsOff(new Set())}>All</button>
                <button className="px-1.5 py-0.5 text-[11px] text-gray-400 hover:text-gray-200" disabled={!!queue}
                  onClick={() => setRoomsOff(new Set(jobRooms.map(r => r.id)))}>None</button>
                {queue ? (
                  <span className="ml-auto flex items-center gap-2 text-xs text-amber-300">
                    Downloading {queue.total - queue.ids.length + 1} / {queue.total} · {drawRoom.name}…
                    <button className="px-2 py-0.5 border border-gray-700 rounded text-gray-300 hover:border-gray-500"
                      onClick={() => setQueue(null)}>Stop</button>
                  </span>
                ) : (<>
                  <label className="ml-auto flex items-center gap-1 text-xs text-gray-400 cursor-pointer select-none"
                    title="Put every ticked room in a single PDF (off = one file per room)">
                    <input type="checkbox" checked={onePdf} onChange={e => setOnePdf(e.target.checked)} />
                    One PDF
                  </label>
                  <button onClick={startBatch} disabled={!tickedRooms.length}
                    title={onePdf ? 'All ticked rooms in one PDF' : 'One PDF per room, downloaded one after another'}
                    className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded font-medium">
                    Download {tickedRooms.length} room{tickedRooms.length === 1 ? '' : 's'}
                  </button>
                </>)}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingJob ? (
                <div className="text-gray-500 text-center py-12 text-sm">Loading job data…</div>
              ) : selectedReport === 'shop_drawings' ? (
                <ShopDrawingsReport
                  key={reportKey}
                  batch={batch}
                  project={project}
                  room={drawRoom}
                  walls={drawWalls}
                  fixtures={drawFixtures}
                  annotations={drawAnnots}
                  benchtops={drawBenchtops}
                  benchTopZ={drawBenchTopZ}
                  cabinets={drawCabinets}
                  planResolved={drawPlanResolved}
                  elevResolved={drawElevResolved}
                  threeDResolved={draw3DResolved}
                  bt3d={drawBt3d}
                  onDeleteSavedShot={deleteShot}
                  layerSets={layerSets}
                  activeLayerSetId={activeLayerSetId}
                  scale={printScale}
                  paperKey={printPaper}
                />
              ) : selectedReport === 'benchtop_quote' ? (
                <PlanViewReport
                  key={`bq-${reportKey}`}
                  batch={batch}
                  project={project}
                  room={drawRoom}
                  walls={drawWalls}
                  fixtures={drawFixtures}
                  benchtops={drawBenchtops}
                  btProfiles={bt3d?.profiles}
                  btDefaultProfile={drawBtDefaultProfile}
                  quote={drawQuote}
                  annotations={drawPlanAnnots}
                  cabinets={drawCabinets}
                  resolvedParts={drawPlanResolved}
                  layerSets={layerSets}
                  activeLayerSetId={layerSets.find(s => s.name === 'Benchtops')?.id ?? activeLayerSetId}
                  scale={printScale}
                  paperKey={printPaper}
                />
              ) : selectedReport === 'plan_view_v2' ? (
                <PlanViewReport
                  key={reportKey}
                  batch={batch}
                  project={project}
                  room={drawRoom}
                  walls={drawWalls}
                  fixtures={drawFixtures}
                  benchtops={drawBenchtops}
                  btProfiles={bt3d?.profiles}
                  btDefaultProfile={drawBtDefaultProfile}
                  annotations={drawPlanAnnots}
                  cabinets={drawCabinets}
                  resolvedParts={drawPlanResolved}
                  layerSets={layerSets}
                  activeLayerSetId={activeLayerSetId}
                  scale={printScale}
                  paperKey={printPaper}
                />
              ) : selectedReport === 'elevation_view_v2' ? (
                <ElevationPrintReport
                  key={reportKey}
                  batch={batch}
                  project={project}
                  room={drawRoom}
                  walls={drawWalls}
                  fixtures={drawFixtures}
                  benchtops={drawBenchtops}
                  benchTopZ={drawBenchTopZ}
                  btInfo={drawBtInfo}
                  btProfiles={bt3d?.profiles}
                  annotations={drawAnnots}
                  cabinets={drawCabinets}
                  resolvedParts={drawElevResolved}
                  layerSets={layerSets}
                  activeLayerSetId={activeLayerSetId}
                  scale={printScale}
                  paperKey={printPaper}
                />
              ) : selectedReport === 'render_3d' ? (
                <Render3DReport
                  key={reportKey}
                  batch={batch}
                  project={project}
                  room={drawRoom}
                  walls={drawWalls}
                  cabinets={drawCabinets}
                  resolvedParts={draw3DResolved}
                  fixtures={drawFixtures}
                  benchtops={drawBenchtops}
                  bt3d={drawBt3d}
                  materialColours={materialColours}
                  ebByMatId={ebByMatId}
                  layerSets={layerSets}
                  activeLayerSetId={activeLayerSetId}
                  paperKey={printPaper}
                />
              ) : selectedReport === 'cabinet_sheets' ? (
                <CabinetSheetReport
                  key={reportKey}
                  batch={batch}
                  project={project}
                  room={drawRoom}
                  walls={drawWalls}
                  cabinets={drawCabinets}
                  resolvedParts={drawResolved}
                  materialNames={materialNames}
                  paperKey={printPaper}
                  annotations={drawAnnots}
                  cadFields={otherFields}
                />
              ) : selectedReport === 'hardware_pick' ? (
                <HardwarePickSheet data={takeoff.data} />
              ) : selectedReport === 'takeoff' ? (
                <TakeoffSheet data={takeoff.data} nesting={takeoff.nesting} />
              ) : selectedReport === 'edgeband_length' ? (
                <EdgebandSheet report={ebReport} waste={ebWaste / 100} loading={!ebParts} />
              ) : selectedReport === 'benchtop_supply' ? (
                <BenchtopSupplySheet data={supplyData} totals={supplyTotalsAll} />
              ) : selectedReport === 'appliance_schedule' ? (
                <ApplianceScheduleSheet data={scheduleData} />
              ) : selectedReport === 'opening_schedule' ? (
                <OpeningScheduleSheet data={openingData} />
              ) : (
                <PartsListSummary data={reportData} />
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

function PartsListSummary({ data }: {
  data: { room: Room; materialGroups: { matName: string; parts: PartRow[] }[]; totalParts: number }[]
}) {
  const hasAny = data.some(d => d.totalParts > 0)
  if (!hasAny) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        No resolved parts found.
        <div className="text-xs mt-1 text-gray-600">Open cabinets or use the Benchtop &quot;Resolve Parts&quot; button to generate reports.</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {data.map(({ room, materialGroups, totalParts }) => totalParts === 0 ? null : (
        <div key={room.id}>
          <div className="flex items-baseline gap-3 mb-3 pb-1.5 border-b border-gray-700">
            <span className="text-sm font-semibold text-white">{room.name}</span>
            <span className="text-xs text-gray-500">{totalParts} parts</span>
          </div>
          <div className="space-y-5">
            {materialGroups.map(({ matName, parts }) => (
              <div key={matName}>
                <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest mb-2">{matName}</div>
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="text-gray-500 text-[10px]">
                      <th className="text-left pb-1 pr-3 font-medium w-16 border-b border-gray-800">Source</th>
                      <th className="text-left pb-1 pr-3 font-medium border-b border-gray-800">Part</th>
                      <th className="text-right pb-1 pr-3 font-medium w-24 border-b border-gray-800">Length&nbsp;mm</th>
                      <th className="text-right pb-1 pr-3 font-medium w-24 border-b border-gray-800">Width&nbsp;mm</th>
                      <th className="text-right pb-1 pr-3 font-medium w-16 border-b border-gray-800">Thk&nbsp;mm</th>
                      <th className="text-right pb-1 font-medium w-10 border-b border-gray-800">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((p, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'text-gray-300' : 'text-gray-400 bg-gray-800/30'}>
                        <td className="py-0.5 pr-3 font-mono text-gray-500 text-[10px]">{p.sourceLabel}</td>
                        <td className="py-0.5 pr-3">{p.partDesc}</td>
                        <td className="py-0.5 pr-3 text-right font-mono">{Math.round(p.length)}</td>
                        <td className="py-0.5 pr-3 text-right font-mono">{Math.round(p.width)}</td>
                        <td className="py-0.5 pr-3 text-right font-mono">{Math.round(p.thickness)}</td>
                        <td className="py-0.5 text-right font-mono">{p.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
