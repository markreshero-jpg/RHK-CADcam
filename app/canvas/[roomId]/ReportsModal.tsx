'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { Project, Room, Wall, CabinetInstance, BenchtopInstance, RoomFixture, RoomAnnotation } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { ResolvedBenchtopPart } from '@/src/lib/benchtop-resolver/types'
import { dbLoadResolvedParts } from './canvasDB'
import { filterHiddenMap, filterRemovedParts } from '@/src/lib/resolver/filterHidden'
import PlanViewReport from './PlanViewReport'
import type { LayerSet } from '@/src/lib/displayLayers/registry'
import ElevationPrintReport from './ElevationPrintReport'
import ShopDrawingsReport from './ShopDrawingsReport'
import type { Bt3DPrint } from './Room3DCapture'
import CabinetSheetReport from './CabinetSheetReport'
import { useTutorial } from '@/src/lib/tutorial/store'
import { BenchtopSupplySheet, supplyPrintHtml } from './BenchtopSupplyReport'
import { buildSupplyLines, supplyTotals } from '@/src/lib/benchtop-resolver/supply'
import { ApplianceScheduleSheet, buildSchedule, schedulePrintHtml, type CatalogRef } from './ApplianceScheduleReport'
import { OpeningScheduleSheet, buildOpeningSchedule, openingSchedulePrintHtml } from './OpeningScheduleReport'
import { cutListDims, shapeMark, type CutListPart, type CutListTable } from '@/src/lib/optimiser/cutListDims'
import { buildSizeOvByCab, type SizeOv, type SizeOvByCab } from '@/src/lib/optimiser/sizeOverrides'
import { buildShapesByCab, SHAPE_SELECT, type ShapeRow, type ShapesByCab } from '@/src/lib/optimiser/shapes'
import { shapedPartLabel } from '@/src/lib/cabinetShape/partKeys'
import { zoneBlank } from '@/src/lib/jointDrilling'

export type ReportScope = 'job' | 'room'
export type ReportId = 'parts_list_summary' | 'benchtop_supply' | 'appliance_schedule' | 'opening_schedule' | 'plan_view_v2' | 'elevation_view_v2' | 'cabinet_sheets' | 'shop_drawings'

const REPORTS: { id: ReportId; label: string; desc: string }[] = [
  { id: 'shop_drawings',      label: 'Shop Drawings',       desc: 'One PDF per room: plan + elevations, one scale' },
  { id: 'parts_list_summary', label: 'Parts List Summary',  desc: 'Parts by room · material · cabinet' },
  { id: 'benchtop_supply',    label: 'Benchtop Supply',     desc: 'Stone / laminate order · m² · edges' },
  { id: 'appliance_schedule', label: 'Appliance Schedule',  desc: 'Appliances, sinks, taps · model · location' },
  { id: 'opening_schedule',   label: 'Door & Window Schedule', desc: 'Doors, windows, openings · size · sill · head' },
  { id: 'plan_view_v2',       label: 'Plan View',           desc: 'Scaled PDF, follows a layer set' },
  { id: 'elevation_view_v2',  label: 'Elevation Views',     desc: 'Scaled PDF, one wall per page, layer set' },
  { id: 'cabinet_sheets',     label: 'Cabinet Sheets',      desc: '1 page/cabinet — front, side, 3D + cut list' },
]

const CASE_LABELS: Record<string, string> = {
  left_side: 'Left Side', right_side: 'Right Side', bottom: 'Bottom', back: 'Back',
  full_top: 'Top', front_rail: 'Front Rail', back_rail: 'Back Rail',
}
const TK_LABELS: Record<string, string> = {
  kick_front_face: 'Toe Kick Front', kick_sub_front: 'Sub Front', kick_back: 'Toe Kick Back',
  spreader_vertical: 'Spreader (V)', spreader_horizontal: 'Spreader (H)',
}
const INT_LABELS: Record<string, string> = {
  adj_shelf: 'Adjustable Shelf', fixed_shelf: 'Fixed Shelf',
  inner_drawer_bottom: 'Inner Drawer Bottom', inner_drawer_back: 'Inner Drawer Back',
  inner_drawer_side:   'Inner Drawer Side',  inner_drawer_front: 'Inner Drawer Front',
  pull_out_bottom:     'Pull-out Bottom',    pull_out_side:      'Pull-out Side',
  pull_out_back:       'Pull-out Back',
  accessory:           'Accessory',
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

const PAPER = {
  A4L: { w: 297, h: 210, label: 'A4 Landscape' },
  A3L: { w: 420, h: 297, label: 'A3 Landscape' },
  A2L: { w: 594, h: 420, label: 'A2 Landscape' },
  A1L: { w: 841, h: 594, label: 'A1 Landscape' },
}

export default function ReportsModal({ initialScope, initialReport, bt3d, project, room, walls, cabinets, resolvedParts, benchtops, benchTopZ, fixtures = [], annotations = [], layerSets, activeLayerSetId, onClose }: {
  initialScope: ReportScope
  /** Report to open on (Production → Shop Drawings opens straight on the package). */
  initialReport?: ReportId
  /** Benchtop slab inputs for the shop drawings 3D views. */
  bt3d?: Omit<Bt3DPrint, 'benchtops'>
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
  const planResolved   = useMemo(() => filterHiddenMap(allResolved, 'plan'), [allResolved])
  const elevResolved   = useMemo(() => filterHiddenMap(allResolved, 'elevation'), [allResolved])
  const threeDResolved = useMemo(() => filterHiddenMap(allResolved, '3d'), [allResolved])
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
        dbLoadResolvedParts(cabs.map(c => c.id)),
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
  // The plan / elevation PDFs draw the current room only.
  const roomFixtures = scope === 'room' ? fixtures : jobFixtures.filter(f => f.room_id === room.id)
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

  const supplyTotalsAll = useMemo(() => supplyTotals(supplyData.flatMap(d => d.lines)), [supplyData])

  function handlePrint() {
    const reportTitle = REPORTS.find(r => r.id === selectedReport)?.label ?? 'Report'
    const scopeLabel  = scope === 'room' ? room.name : (project?.name ?? 'Job')

    const rows = selectedReport === 'benchtop_supply' ? [supplyPrintHtml(supplyData, supplyTotalsAll)]
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
      ${rows.join('') || `<p style="color:#888">${selectedReport === 'benchtop_supply' ? 'No benchtop supply items.' : selectedReport === 'appliance_schedule' ? 'No appliances placed.' : selectedReport === 'opening_schedule' ? 'No doors or windows placed.' : 'No resolved parts found. Open and resolve cabinets first.'}</p>`}
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 250)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col" style={{ width: 860, height: '78vh', maxWidth: '95vw', maxHeight: '90vh' }}>

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
                </span>
              </div>
              <div className="flex items-center gap-2">
                {(selectedReport === 'plan_view_v2' || selectedReport === 'elevation_view_v2' || selectedReport === 'shop_drawings') && (
                  <select value={printScale} onChange={e => setPrintScale(Number(e.target.value))}
                    className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-1.5 py-1"
                    title="Drawing scale — 1:N">
                    {SCALES.map(s => <option key={s} value={s}>1:{s}</option>)}
                  </select>
                )}
                {(selectedReport === 'plan_view_v2' || selectedReport === 'elevation_view_v2' || selectedReport === 'cabinet_sheets' || selectedReport === 'shop_drawings') && (
                  <select value={printPaper} onChange={e => setPrintPaper(e.target.value as keyof typeof PAPER)}
                    className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-1.5 py-1">
                    {(Object.keys(PAPER) as (keyof typeof PAPER)[]).map(k => (
                      <option key={k} value={k}>{PAPER[k].label}</option>
                    ))}
                  </select>
                )}
                {/* The plan / elevation / cabinet reports have their own download button in their toolbar. */}
                {selectedReport !== 'plan_view_v2' && selectedReport !== 'elevation_view_v2' && selectedReport !== 'cabinet_sheets' && selectedReport !== 'shop_drawings' && (
                  <button onClick={handlePrint}
                    className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-medium">
                    Print / PDF
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingJob ? (
                <div className="text-gray-500 text-center py-12 text-sm">Loading job data…</div>
              ) : selectedReport === 'shop_drawings' ? (
                <ShopDrawingsReport
                  project={project}
                  room={room}
                  walls={walls}
                  fixtures={roomFixtures}
                  annotations={annotations.filter(a => a.view === 'plan')}
                  benchtops={scope === 'room' ? benchtops : []}
                  benchTopZ={benchTopZ}
                  cabinets={scope === 'room' ? cabinets : jobCabinets.filter(c => c.room_id === room.id)}
                  planResolved={planResolved}
                  elevResolved={elevResolved}
                  threeDResolved={threeDResolved}
                  bt3d={scope === 'room' ? bt3d : undefined}
                  layerSets={layerSets}
                  activeLayerSetId={activeLayerSetId}
                  scale={printScale}
                  paperKey={printPaper}
                />
              ) : selectedReport === 'plan_view_v2' ? (
                <PlanViewReport
                  project={project}
                  room={room}
                  walls={walls}
                  fixtures={roomFixtures}
                  benchtops={scope === 'room' ? benchtops : []}
                  annotations={annotations.filter(a => a.view === 'plan')}
                  cabinets={scope === 'room' ? cabinets : jobCabinets.filter(c => c.room_id === room.id)}
                  resolvedParts={planResolved}
                  layerSets={layerSets}
                  activeLayerSetId={activeLayerSetId}
                  scale={printScale}
                  paperKey={printPaper}
                />
              ) : selectedReport === 'elevation_view_v2' ? (
                <ElevationPrintReport
                  project={project}
                  room={room}
                  walls={walls}
                  fixtures={roomFixtures}
                  benchtops={scope === 'room' ? benchtops : []}
                  benchTopZ={benchTopZ}
                  cabinets={scope === 'room' ? cabinets : jobCabinets.filter(c => c.room_id === room.id)}
                  resolvedParts={elevResolved}
                  layerSets={layerSets}
                  activeLayerSetId={activeLayerSetId}
                  scale={printScale}
                  paperKey={printPaper}
                />
              ) : selectedReport === 'cabinet_sheets' ? (
                <CabinetSheetReport
                  project={project}
                  room={room}
                  walls={walls}
                  cabinets={scope === 'room' ? cabinets : jobCabinets.filter(c => c.room_id === room.id)}
                  resolvedParts={allResolved}
                  materialNames={materialNames}
                  paperKey={printPaper}
                />
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
