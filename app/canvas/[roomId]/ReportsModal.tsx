'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/src/lib/supabase'
import { generateElevationPDF } from './generateElevationPDF'
import type { Project, Room, Wall, CabinetInstance, BenchtopInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { ResolvedBenchtopPart } from '@/src/lib/benchtop-resolver/types'
import { dbLoadResolvedParts } from './canvasDB'
import PlanDrawingSVG from './PlanDrawingSVG'
import PlanViewReport from './PlanViewReport'
import ElevationReportSVG from './ElevationReportSVG'
import ElevationPrintReport from './ElevationPrintReport'
import CabinetSheetReport from './CabinetSheetReport'

export type ReportScope = 'job' | 'room'
type ReportId = 'parts_list_summary' | 'shop_drawing_plan' | 'plan_view_v2' | 'elevation_view' | 'elevation_view_v2' | 'cabinet_sheets'

const REPORTS: { id: ReportId; label: string; desc: string }[] = [
  { id: 'parts_list_summary', label: 'Parts List Summary',  desc: 'Parts by room · material · cabinet' },
  { id: 'shop_drawing_plan',  label: 'Plan View',           desc: 'B&W plan drawing for shop' },
  { id: 'plan_view_v2',       label: 'Plan View (New)',     desc: 'Scaled PDF with toggleable layers' },
  { id: 'elevation_view',     label: 'Elevation Views',     desc: 'B&W wall elevations with dimensions' },
  { id: 'elevation_view_v2',  label: 'Elevation Views (New)', desc: 'Scaled PDF, one wall per page, layers' },
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

interface PartRow {
  sourceLabel:  string
  partDesc:     string
  width:        number
  depth:        number
  thickness:    number
  quantity:     number
  materialId:   string | null
  materialName?: string   // pre-resolved; overrides materialNames[materialId] lookup
}

function collectParts(cabinets: CabinetInstance[], resolved: Map<string, ResolvedCabinet>): PartRow[] {
  const rows: PartRow[] = []
  for (const cab of cabinets) {
    const r = resolved.get(cab.id)
    if (!r) continue
    const lbl = cab.label ?? cab.assembly_class
    for (const p of r.case_parts)
      rows.push({ sourceLabel: lbl, partDesc: CASE_LABELS[p.part_key] ?? p.part_key, width: p.DY, depth: p.DX, thickness: p.DZ, quantity: 1, materialId: p.material_id })
    for (const p of r.toekick_parts)
      rows.push({ sourceLabel: lbl, partDesc: TK_LABELS[p.part_key] ?? p.part_key, width: p.DY, depth: p.DX, thickness: p.DZ, quantity: 1, materialId: p.material_id })
    for (const p of r.internal_parts)
      rows.push({ sourceLabel: lbl, partDesc: INT_LABELS[p.part_type] ?? p.part_type, width: p.DY, depth: p.DX, thickness: p.DZ, quantity: 1, materialId: p.material_id })
    for (const z of r.face_zones) {
      if (z.face_type === 'open') continue
      rows.push({ sourceLabel: lbl, partDesc: FACE_LABELS[z.face_type] ?? z.face_type, width: z.DY, depth: z.DX, thickness: z.DZ, quantity: 1, materialId: z.material_id })
    }
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
      rows.push({
        sourceLabel:  lbl,
        partDesc:     p.label,
        width:        p.width_mm,
        depth:        p.length_mm,
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

// Downloads an SVG at a fixed paper size — all drawings output identically sized.
// preserveAspectRatio="xMinYMin meet" scales content to fill the page without distortion.
function downloadSvgFile(svgEl: SVGSVGElement, filename: string, paperW: number, paperH: number) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('width',  `${paperW}mm`)
  clone.setAttribute('height', `${paperH}mm`)
  clone.setAttribute('preserveAspectRatio', 'xMinYMin meet')
  clone.removeAttribute('style')
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const svgStr = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function ReportsModal({ initialScope, project, room, walls, cabinets, resolvedParts, benchtops, onClose }: {
  initialScope: ReportScope
  project: Project | null
  room: Room
  walls: Wall[]
  cabinets: CabinetInstance[]
  resolvedParts: Map<string, ResolvedCabinet>
  benchtops: BenchtopInstance[]
  onClose: () => void
}) {
  const [scope, setScope] = useState<ReportScope>(initialScope)
  const [selectedReport, setSelectedReport] = useState<ReportId>('parts_list_summary')
  const planSVGRef = useRef<SVGSVGElement>(null)

  // Paper size + scale for SVG output
  const [printPaper, setPrintPaper] = useState<keyof typeof PAPER>('A3L')
  const [printScale, setPrintScale] = useState(20)
  const SCALES = [5, 10, 15, 20, 25, 30, 40, 50, 100]
  const paper = PAPER[printPaper]

  // Wall picker for elevation view
  const [selectedWallIds, setSelectedWallIds] = useState<Set<string>>(() => new Set(walls.map(w => w.id)))
  const elevSvgRefs = useRef<Map<string, SVGSVGElement>>(new Map())

  function toggleWall(id: string) {
    setSelectedWallIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const visibleWalls = walls.filter(w => selectedWallIds.has(w.id))

  const [jobRooms, setJobRooms] = useState<Room[]>([])
  const [jobCabinets, setJobCabinets] = useState<CabinetInstance[]>([])
  const [jobResolved, setJobResolved] = useState<Map<string, ResolvedCabinet>>(new Map())
  const [loadingJob, setLoadingJob] = useState(false)

  const [roomBtParts, setRoomBtParts] = useState<StoredBtPart[]>([])
  const [jobBtInstances, setJobBtInstances] = useState<BenchtopInstance[]>([])
  const [jobBtParts, setJobBtParts] = useState<StoredBtPart[]>([])

  const [materialNames, setMaterialNames] = useState<Record<string, string>>({})

  const rooms          = scope === 'room' ? [room]        : jobRooms
  const allCabinets    = scope === 'room' ? cabinets      : jobCabinets
  const allResolved    = scope === 'room' ? resolvedParts : jobResolved
  const allBtInstances = scope === 'room' ? benchtops     : jobBtInstances
  const allBtParts     = scope === 'room' ? roomBtParts   : jobBtParts

  useEffect(() => {
    if (scope !== 'job' || !project || jobRooms.length > 0) return
    setLoadingJob(true)
    async function load() {
      const { data: rms } = await supabase.from('rooms').select('*').eq('project_id', project!.id).order('sort_order')
      if (!rms) { setLoadingJob(false); return }
      setJobRooms(rms as Room[])
      const roomIds = rms.map(r => r.id)
      const [{ data: cabs }, { data: bts }] = await Promise.all([
        supabase.from('cabinet_instances').select('*').in('room_id', roomIds),
        supabase.from('benchtop_instances').select('*').in('room_id', roomIds),
      ])
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
      const cabParts = collectParts(roomCabs, allResolved)
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
  }, [rooms, allCabinets, allResolved, allBtInstances, allBtParts, materialNames])

  function handlePrint() {
    const reportTitle = REPORTS.find(r => r.id === selectedReport)?.label ?? 'Report'
    const scopeLabel  = scope === 'room' ? room.name : (project?.name ?? 'Job')

    const rows = reportData.flatMap(({ room: rm, materialGroups }) =>
      materialGroups.length === 0 ? [] : [`
        <h2>${rm.name}</h2>
        ${materialGroups.map(({ matName, parts }) => `
          <h3>${matName}</h3>
          <table>
            <thead><tr><th>Source</th><th>Part</th><th class="r">Width (mm)</th><th class="r">Depth (mm)</th><th class="r">Thk (mm)</th><th class="r">Qty</th></tr></thead>
            <tbody>
              ${parts.map((p, i) => `
                <tr class="${i % 2 ? 'alt' : ''}">
                  <td class="mono">${p.sourceLabel}</td>
                  <td>${p.partDesc}</td>
                  <td class="r mono">${Math.round(p.width)}</td>
                  <td class="r mono">${Math.round(p.depth)}</td>
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
      ${rows.join('') || '<p style="color:#888">No resolved parts found. Open and resolve cabinets first.</p>'}
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 250)
  }

  function handleDownloadPlan() {
    const svgEl = planSVGRef.current
    if (!svgEl) return
    const scopeLabel = (scope === 'room' ? room.name : (project?.name ?? 'Job')).replace(/[^\w-]/g, '_')
    downloadSvgFile(svgEl, `plan-${scopeLabel}.svg`, paper.w, paper.h)
  }

  function handleDownloadElev() {
    if (visibleWalls.length === 0) return
    const activeCabs = scope === 'room' ? cabinets : jobCabinets.filter(c => c.room_id === room.id)
    const doc = generateElevationPDF(visibleWalls, activeCabs, room, paper)
    const scopeLabel = (scope === 'room' ? room.name : (project?.name ?? 'Job')).replace(/[^\w-]/g, '_')
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `elevations-${scopeLabel}.pdf`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function handlePrintActive() {
    if (selectedReport === 'shop_drawing_plan') handleDownloadPlan()
    else if (selectedReport === 'elevation_view') handleDownloadElev()
    else handlePrint()
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
              <button key={rep.id} onClick={() => setSelectedReport(rep.id)}
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
                {(selectedReport === 'shop_drawing_plan' || selectedReport === 'plan_view_v2' || selectedReport === 'elevation_view' || selectedReport === 'elevation_view_v2') && (
                  <select value={printScale} onChange={e => setPrintScale(Number(e.target.value))}
                    className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-1.5 py-1"
                    title="Drawing scale — 1:N">
                    {SCALES.map(s => <option key={s} value={s}>1:{s}</option>)}
                  </select>
                )}
                {(selectedReport === 'shop_drawing_plan' || selectedReport === 'plan_view_v2' || selectedReport === 'elevation_view' || selectedReport === 'elevation_view_v2' || selectedReport === 'cabinet_sheets') && (
                  <select value={printPaper} onChange={e => setPrintPaper(e.target.value as keyof typeof PAPER)}
                    className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-1.5 py-1">
                    {(Object.keys(PAPER) as (keyof typeof PAPER)[]).map(k => (
                      <option key={k} value={k}>{PAPER[k].label}</option>
                    ))}
                  </select>
                )}
                {/* The new plan/elevation/cabinet reports have their own download button in their toolbar. */}
                {selectedReport !== 'plan_view_v2' && selectedReport !== 'elevation_view_v2' && selectedReport !== 'cabinet_sheets' && (
                  <button onClick={handlePrintActive}
                    className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-medium">
                    {selectedReport === 'shop_drawing_plan' ? 'Download SVG'
                      : selectedReport === 'elevation_view' ? 'Download PDF'
                      : 'Print / PDF'}
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingJob ? (
                <div className="text-gray-500 text-center py-12 text-sm">Loading job data…</div>
              ) : selectedReport === 'shop_drawing_plan' ? (
                <div className="bg-white rounded overflow-hidden shadow-inner" style={{ minHeight: 300 }}>
                  <PlanDrawingSVG
                    walls={walls}
                    cabinets={scope === 'room' ? cabinets : jobCabinets.filter(c => c.room_id === room.id)}
                    svgRef={planSVGRef}
                    scale={printScale}
                  />
                </div>
              ) : selectedReport === 'plan_view_v2' ? (
                <PlanViewReport
                  project={project}
                  room={room}
                  walls={walls}
                  cabinets={scope === 'room' ? cabinets : jobCabinets.filter(c => c.room_id === room.id)}
                  scale={printScale}
                  paperKey={printPaper}
                />
              ) : selectedReport === 'elevation_view' ? (
                <ElevationViewReport
                  walls={walls}
                  cabinets={scope === 'room' ? cabinets : jobCabinets.filter(c => c.room_id === room.id)}
                  room={room}
                  scale={printScale}
                  selectedWallIds={selectedWallIds}
                  onToggleWall={toggleWall}
                  svgRefCallback={(wallId, el) => {
                    if (el) elevSvgRefs.current.set(wallId, el)
                    else elevSvgRefs.current.delete(wallId)
                  }}
                />
              ) : selectedReport === 'elevation_view_v2' ? (
                <ElevationPrintReport
                  project={project}
                  room={room}
                  walls={walls}
                  cabinets={scope === 'room' ? cabinets : jobCabinets.filter(c => c.room_id === room.id)}
                  resolvedParts={allResolved}
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

function ElevationViewReport({ walls, cabinets, room, scale, selectedWallIds, onToggleWall, svgRefCallback }: {
  walls: Wall[]
  cabinets: CabinetInstance[]
  room: Room
  scale: number
  selectedWallIds: Set<string>
  onToggleWall: (id: string) => void
  svgRefCallback: (wallId: string, el: SVGSVGElement | null) => void
}) {
  const standardWalls = walls.filter(w => w.wall_type === 'standard')
  if (standardWalls.length === 0) {
    return <div className="text-gray-500 text-center py-12 text-sm">No standard walls in this room.</div>
  }
  return (
    <div className="space-y-4">
      {/* Wall picker */}
      <div className="flex flex-wrap gap-2 pb-3 border-b border-gray-800">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider self-center mr-1">Show:</span>
        {standardWalls.map(w => (
          <button key={w.id} onClick={() => onToggleWall(w.id)}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              selectedWallIds.has(w.id)
                ? 'bg-blue-600/25 border-blue-600/50 text-blue-300'
                : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'
            }`}>
            {w.name}
          </button>
        ))}
        <button onClick={() => standardWalls.forEach(w => onToggleWall(w.id))}
          className="px-2 py-0.5 rounded text-xs border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors ml-1">
          Toggle all
        </button>
      </div>

      {/* Elevation drawings */}
      {standardWalls.filter(w => selectedWallIds.has(w.id)).map(w => {
        const wallCabs = cabinets.filter(c => c.wall_id === w.id)
        return (
          <div key={w.id} className="bg-white rounded shadow-inner overflow-hidden">
            <ElevationReportSVG
              wall={w}
              cabinets={wallCabs}
              room={room}
              scale={scale}
              svgRef={(el: SVGSVGElement | null) => svgRefCallback(w.id, el)}
            />
          </div>
        )
      })}
      {standardWalls.every(w => !selectedWallIds.has(w.id)) && (
        <div className="text-gray-500 text-center py-8 text-sm">No walls selected. Toggle walls above.</div>
      )}
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
                      <th className="text-right pb-1 pr-3 font-medium w-24 border-b border-gray-800">Width&nbsp;mm</th>
                      <th className="text-right pb-1 pr-3 font-medium w-24 border-b border-gray-800">Depth&nbsp;mm</th>
                      <th className="text-right pb-1 pr-3 font-medium w-16 border-b border-gray-800">Thk&nbsp;mm</th>
                      <th className="text-right pb-1 font-medium w-10 border-b border-gray-800">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((p, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'text-gray-300' : 'text-gray-400 bg-gray-800/30'}>
                        <td className="py-0.5 pr-3 font-mono text-gray-500 text-[10px]">{p.sourceLabel}</td>
                        <td className="py-0.5 pr-3">{p.partDesc}</td>
                        <td className="py-0.5 pr-3 text-right font-mono">{Math.round(p.width)}</td>
                        <td className="py-0.5 pr-3 text-right font-mono">{Math.round(p.depth)}</td>
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
