'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { Project, Room, Wall, CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { dbLoadResolvedParts } from './canvasDB'
import PlanDrawingSVG from './PlanDrawingSVG'
import ElevationReportSVG from './ElevationReportSVG'

export type ReportScope = 'job' | 'room'
type ReportId = 'parts_list_summary' | 'shop_drawing_plan' | 'elevation_view'

const REPORTS: { id: ReportId; label: string; desc: string }[] = [
  { id: 'parts_list_summary', label: 'Parts List Summary',  desc: 'Parts by room · material · cabinet' },
  { id: 'shop_drawing_plan',  label: 'Plan View',           desc: 'B&W plan drawing for shop' },
  { id: 'elevation_view',     label: 'Elevation Views',     desc: 'B&W wall elevations with dimensions' },
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
  inner_drawer_bottom: 'Drawer Box Bottom', inner_drawer_back: 'Drawer Box Back',
}
const FACE_LABELS: Record<string, string> = {
  door: 'Door', drawer_face: 'Drawer Face', false_panel: 'False Panel',
}

interface PartRow {
  cabinetLabel: string
  partDesc: string
  width: number
  depth: number
  thickness: number
  materialId: string
}

function collectParts(cabinets: CabinetInstance[], resolved: Map<string, ResolvedCabinet>): PartRow[] {
  const rows: PartRow[] = []
  for (const cab of cabinets) {
    const r = resolved.get(cab.id)
    if (!r) continue
    const lbl = cab.label ?? cab.assembly_class
    for (const p of r.case_parts)
      rows.push({ cabinetLabel: lbl, partDesc: CASE_LABELS[p.part_key] ?? p.part_key, width: p.DY, depth: p.DX, thickness: p.DZ, materialId: p.material_id })
    for (const p of r.toekick_parts)
      rows.push({ cabinetLabel: lbl, partDesc: TK_LABELS[p.part_key] ?? p.part_key, width: p.DY, depth: p.DX, thickness: p.DZ, materialId: p.material_id })
    for (const p of r.internal_parts)
      rows.push({ cabinetLabel: lbl, partDesc: INT_LABELS[p.part_type] ?? p.part_type, width: p.DY, depth: p.DX, thickness: p.DZ, materialId: p.material_id })
    for (const z of r.face_zones) {
      if (z.face_type === 'open') continue
      rows.push({ cabinetLabel: lbl, partDesc: FACE_LABELS[z.face_type] ?? z.face_type, width: z.DY, depth: z.DX, thickness: z.DZ, materialId: z.material_id })
    }
  }
  return rows
}

export default function ReportsModal({ initialScope, project, room, walls, cabinets, resolvedParts, onClose }: {
  initialScope: ReportScope
  project: Project | null
  room: Room
  walls: Wall[]
  cabinets: CabinetInstance[]
  resolvedParts: Map<string, ResolvedCabinet>
  onClose: () => void
}) {
  const [scope, setScope] = useState<ReportScope>(initialScope)
  const [selectedReport, setSelectedReport] = useState<ReportId>('parts_list_summary')
  const planSVGRef = useRef<SVGSVGElement>(null)

  // Print settings
  const [printPaper, setPrintPaper] = useState<'A4L' | 'A3L' | 'A2L' | 'A1L'>('A3L')
  const [printScale, setPrintScale] = useState(20)

  const PAPER = {
    A4L: { w: 297, h: 210, label: 'A4 Landscape',  cssSize: 'A4 landscape'  },
    A3L: { w: 420, h: 297, label: 'A3 Landscape',  cssSize: 'A3 landscape'  },
    A2L: { w: 594, h: 420, label: 'A2 Landscape',  cssSize: 'A2 landscape'  },
    A1L: { w: 841, h: 594, label: 'A1 Landscape',  cssSize: 'A1 landscape'  },
  }
  const SCALES = [5, 10, 15, 20, 25, 50, 100]
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

  const [materialNames, setMaterialNames] = useState<Record<string, string>>({})

  const rooms       = scope === 'room' ? [room]        : jobRooms
  const allCabinets = scope === 'room' ? cabinets      : jobCabinets
  const allResolved = scope === 'room' ? resolvedParts : jobResolved

  useEffect(() => {
    if (scope !== 'job' || !project || jobRooms.length > 0) return
    setLoadingJob(true)
    async function load() {
      const { data: rms } = await supabase.from('rooms').select('*').eq('project_id', project!.id).order('sort_order')
      if (!rms) { setLoadingJob(false); return }
      setJobRooms(rms as Room[])
      const { data: cabs } = await supabase.from('cabinet_instances').select('*').in('room_id', rms.map(r => r.id))
      if (!cabs) { setLoadingJob(false); return }
      setJobCabinets(cabs as CabinetInstance[])
      const resolved = await dbLoadResolvedParts(cabs.map(c => c.id))
      setJobResolved(resolved)
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

  const reportData = useMemo(() => {
    return rooms.map(r => {
      const roomCabs = allCabinets
        .filter(c => c.room_id === r.id)
        .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '', undefined, { numeric: true }))
      const parts = collectParts(roomCabs, allResolved)
      const byMat = new Map<string, PartRow[]>()
      for (const p of parts) {
        const name = materialNames[p.materialId] ?? p.materialId
        byMat.set(name, [...(byMat.get(name) ?? []), p])
      }
      const materialGroups = [...byMat.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([matName, ps]) => ({ matName, parts: ps }))
      return { room: r, materialGroups, totalParts: parts.length }
    })
  }, [rooms, allCabinets, allResolved, materialNames])

  function handlePrint() {
    const reportTitle = REPORTS.find(r => r.id === selectedReport)?.label ?? 'Report'
    const scopeLabel  = scope === 'room' ? room.name : (project?.name ?? 'Job')

    const rows = reportData.flatMap(({ room: rm, materialGroups }) =>
      materialGroups.length === 0 ? [] : [`
        <h2>${rm.name}</h2>
        ${materialGroups.map(({ matName, parts }) => `
          <h3>${matName}</h3>
          <table>
            <thead><tr><th>Cabinet</th><th>Part</th><th class="r">Width (mm)</th><th class="r">Depth (mm)</th><th class="r">Thk (mm)</th></tr></thead>
            <tbody>
              ${parts.map((p, i) => `
                <tr class="${i % 2 ? 'alt' : ''}">
                  <td class="mono">${p.cabinetLabel}</td>
                  <td>${p.partDesc}</td>
                  <td class="r mono">${Math.round(p.width)}</td>
                  <td class="r mono">${Math.round(p.depth)}</td>
                  <td class="r mono">${Math.round(p.thickness)}</td>
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

  function handlePrintPlan() {
    const svgEl = planSVGRef.current
    if (!svgEl) return
    const svgStr = new XMLSerializer().serializeToString(svgEl)
    const scopeLabel = scope === 'room' ? room.name : (project?.name ?? 'Job')
    const win = window.open('', '_blank', 'width=1200,height=850')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Plan View — ${scopeLabel}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: white; font-family: Arial, Helvetica, sans-serif; }
        .page { padding: 10mm; }
        .title-block { border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
        .title-block h1 { font-size: 13px; font-weight: bold; }
        .title-block p { font-size: 9px; color: #555; margin-top: 2px; }
        svg { width: 100%; height: auto; display: block; }
        @media print {
          body { margin: 0; }
          @page { margin: 8mm; size: A3 landscape; }
        }
      </style>
    </head><body>
      <div class="page">
        <div class="title-block">
          <h1>Plan View &mdash; ${scopeLabel}</h1>
          <p>${project?.name ?? ''} &nbsp;&middot;&nbsp; Scale: NTS &nbsp;&middot;&nbsp; ${new Date().toLocaleDateString()}</p>
        </div>
        ${svgStr}
      </div>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  function handlePrintElev() {
    const scopeLabel = scope === 'room' ? room.name : (project?.name ?? 'Job')
    const entries = visibleWalls
      .map(w => elevSvgRefs.current.get(w.id))
      .filter((el): el is SVGSVGElement => !!el)
    if (entries.length === 0) return
    const svgStrings = entries.map(el => new XMLSerializer().serializeToString(el))
    const win = window.open('', '_blank', 'width=1100,height=800')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Elevation Views — ${scopeLabel}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: white; font-family: Arial, Helvetica, sans-serif; }
        .page { padding: 10mm; }
        .header { border-bottom: 2px solid #111; padding-bottom: 5px; margin-bottom: 12px; }
        .header h1 { font-size: 13px; font-weight: bold; }
        .header p { font-size: 9px; color: #555; margin-top: 2px; }
        .elev-block { margin-bottom: 18px; page-break-inside: avoid; }
        svg { width: 100%; height: auto; display: block; }
        @media print { body { margin: 0; } @page { margin: 8mm; size: A3 landscape; } }
      </style>
    </head><body><div class="page">
      <div class="header">
        <h1>Elevation Views &mdash; ${scopeLabel}</h1>
        <p>${project?.name ?? ''} &nbsp;&middot;&nbsp; Scale: NTS &nbsp;&middot;&nbsp; ${new Date().toLocaleDateString()}</p>
      </div>
      ${svgStrings.map(s => `<div class="elev-block">${s}</div>`).join('')}
    </div></body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  function handlePrintActive() {
    if (selectedReport === 'shop_drawing_plan') handlePrintPlan()
    else if (selectedReport === 'elevation_view') handlePrintElev()
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
              <button onClick={handlePrintActive}
                className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-medium">
                Print / PDF
              </button>
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
                  />
                </div>
              ) : selectedReport === 'elevation_view' ? (
                <ElevationViewReport
                  walls={walls}
                  cabinets={scope === 'room' ? cabinets : jobCabinets.filter(c => c.room_id === room.id)}
                  room={room}
                  selectedWallIds={selectedWallIds}
                  onToggleWall={toggleWall}
                  svgRefCallback={(wallId, el) => {
                    if (el) elevSvgRefs.current.set(wallId, el)
                    else elevSvgRefs.current.delete(wallId)
                  }}
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

function ElevationViewReport({ walls, cabinets, room, selectedWallIds, onToggleWall, svgRefCallback }: {
  walls: Wall[]
  cabinets: CabinetInstance[]
  room: Room
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
        <div className="text-xs mt-1 text-gray-600">Open cabinets and allow them to resolve to generate reports.</div>
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
                      <th className="text-left pb-1 pr-3 font-medium w-16 border-b border-gray-800">Cabinet</th>
                      <th className="text-left pb-1 pr-3 font-medium border-b border-gray-800">Part</th>
                      <th className="text-right pb-1 pr-3 font-medium w-24 border-b border-gray-800">Width&nbsp;mm</th>
                      <th className="text-right pb-1 pr-3 font-medium w-24 border-b border-gray-800">Depth&nbsp;mm</th>
                      <th className="text-right pb-1 font-medium w-16 border-b border-gray-800">Thk&nbsp;mm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((p, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'text-gray-300' : 'text-gray-400 bg-gray-800/30'}>
                        <td className="py-0.5 pr-3 font-mono text-gray-500 text-[10px]">{p.cabinetLabel}</td>
                        <td className="py-0.5 pr-3">{p.partDesc}</td>
                        <td className="py-0.5 pr-3 text-right font-mono">{Math.round(p.width)}</td>
                        <td className="py-0.5 pr-3 text-right font-mono">{Math.round(p.depth)}</td>
                        <td className="py-0.5 text-right font-mono">{Math.round(p.thickness)}</td>
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
