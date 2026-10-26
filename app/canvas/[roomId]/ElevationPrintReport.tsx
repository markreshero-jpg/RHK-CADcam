// New elevation report — parallel to the existing `elevation_view`.
// One wall per page, true-scale PDF (jsPDF + svg2pdf.js), B&W. Drawing content
// follows a display layer set (toolbar picker); page extras are toggles persisted
// to localStorage. Scale + paper come from the modal (same as plan view).
'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useBatchDownload } from './useBatchDownload'
import { svg2pdf } from 'svg2pdf.js'
import { reportDoc, saveReport } from './pdfCombine'
import type { Project, Room, Wall, CabinetInstance, RoomFixture, BenchtopInstance, BenchtopEdgeProfile, RoomAnnotation } from '@/src/lib/types'
import type { BtElevInfo } from './BenchtopElevation'
import { fixtureLayer } from '@/src/lib/fixtureGeometry'
import { benchDimHeights } from './benchDims'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { LayerSet } from '@/src/lib/displayLayers/registry'
import { resolveLayerView } from '@/src/lib/displayLayers/resolve'
import ElevationPrintSVG, { type ElevationPageOptions } from './ElevationPrintSVG'
import { useReturnSectionData, returnCabinetsOfWalls } from './ReturnSectionSVG'
import { useReportLayerSet, ReportLayerSetSelect } from './ReportLayerSetPicker'
import { useTutorial } from '@/src/lib/tutorial/store'
import { useCompanyTitle } from '@/src/lib/shopDrawings/companyTitle'
import ShopTitleBlock, { sheetTitle, pageLayout, titleBlockHeight } from './ShopTitleBlock'
import { elevationViews } from '@/src/lib/shopDrawings/elevationViews'

const PAPER: Record<string, { w: number; h: number }> = {
  A4L: { w: 297, h: 210 }, A3L: { w: 420, h: 297 }, A2L: { w: 594, h: 420 }, A1L: { w: 841, h: 594 },
}
const MARGIN = 20
const LS_KEY = 'elevation-print-layers'
const LS_SET_KEY = 'elevation-print-layer-set'
const DEFAULT_PAGE: ElevationPageOptions = { returnWalls: true, titleBlock: true, annotColours: false }
const TOGGLES: { key: keyof ElevationPageOptions; label: string }[] = [
  { key: 'returnWalls', label: 'Return Walls' },
  { key: 'titleBlock',  label: 'Title Block' },
  { key: 'annotColours', label: 'Annotation colours' },
]

export default function ElevationPrintReport({ project, room, walls, cabinets, resolvedParts, layerSets, activeLayerSetId, scale, paperKey, fixtures, benchtops, benchTopZ, btInfo, btProfiles, annotations, batch }: {
  /** CAD notes (z_CAD_tool A6c) — each wall's face-side elevation notes print on its page. */
  annotations?: RoomAnnotation[]
  /** Job Reports, several rooms: download as soon as ready, then call this (useBatchDownload). */
  batch?: () => void
  /** Benchtop band drawing inputs (the canvas's thickness cascade + edge profiles). */
  btInfo?: (bt: BenchtopInstance) => BtElevInfo
  btProfiles?: Record<string, BenchtopEdgeProfile>
  /** Doors / windows (z_fixtures P5). */
  fixtures?: RoomFixture[]
  /** Bench + basin height dims (dim_elev_bench). */
  benchtops?: BenchtopInstance[]
  benchTopZ?: (bt: BenchtopInstance) => number
  project:       Project | null
  room:          Room
  walls:         Wall[]
  cabinets:      CabinetInstance[]
  resolvedParts: Map<string, ResolvedCabinet>
  layerSets:     LayerSet[]
  activeLayerSetId: string | null
  scale:         number
  paperKey:      string
}) {
  const refs = useRef<Map<string, SVGSVGElement>>(new Map())
  const tbRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const company = useCompanyTitle()
  const [busy, setBusy] = useState(false)
  const [layerSet, setLayerSetId] = useReportLayerSet(LS_SET_KEY, layerSets, activeLayerSetId)
  const layers = useMemo(() => resolveLayerView(layerSet, 'elevation'), [layerSet])
  // Older storage also held drawing toggles (now layer items) — only page extras are read.
  const [show, setShow] = useState<ElevationPageOptions>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        return Object.fromEntries(TOGGLES.map(t => [t.key, typeof s[t.key] === 'boolean' ? s[t.key] : DEFAULT_PAGE[t.key]])) as unknown as ElevationPageOptions
      }
    } catch { /* ignore */ }
    return DEFAULT_PAGE
  })
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(show)) } catch { /* ignore */ } }, [show])

  // Each wall's face, back sides with cabinets on them, and islands (elevationViews).
  const views = useMemo(() => elevationViews(walls, cabinets), [walls, cabinets])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(elevationViews(walls, cabinets).map(v => v.key)))
  const toggleWall = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const visibleViews = views.filter(v => selectedIds.has(v.key))
  const visibleWalls = [...new Set(visibleViews.map(v => v.wall))]
  // Return cabinet sections (z_section_view R1): part overrides for every page, loaded once.
  const wallKey = visibleWalls.map(w => w.id).join(',')
  const retCabs = useMemo(() => returnCabinetsOfWalls(visibleWalls, walls, cabinets),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wallKey, walls, cabinets])
  const returnSec = useReturnSectionData(retCabs, resolvedParts, layers.show('return_sections'))

  async function handleDownload() {
    if (visibleViews.length === 0) return
    useTutorial.getState().emit('elevation_pdf')
    setBusy(true)
    try {
      const paper = PAPER[paperKey] ?? PAPER.A3L
      const { usableW, usableH, tb } = pageLayout(paper, MARGIN, show.titleBlock ? titleBlockHeight(company) : null)
      const doc = reportDoc(paper.w, paper.h)
      let first = true
      for (const v of visibleViews) {
        const svgEl = refs.current.get(v.key)
        if (!svgEl) continue
        if (!first) doc.addPage([paper.w, paper.h], paper.w >= paper.h ? 'landscape' : 'portrait')
        first = false
        const vbW = Number(svgEl.getAttribute('data-vb-w'))
        const vbH = Number(svgEl.getAttribute('data-vb-h'))
        const targetW = vbW / scale, targetH = vbH / scale
        const x = MARGIN + Math.max(0, (usableW - targetW) / 2)
        const y = MARGIN + Math.max(0, (usableH - targetH) / 2)
        await svg2pdf(svgEl, doc, { x, y, width: targetW, height: targetH })
        const tbSvg = tbRefs.current.get(v.key)?.querySelector('svg')
        if (tb && tbSvg) await svg2pdf(tbSvg, doc, { x: tb.x, y: tb.y, width: tb.w, height: tb.h })
      }
      const safeRoom = room.name.replace(/[^\w-]/g, '_')
      saveReport(doc, `elevations-${safeRoom}-1-${scale}.pdf`)
    } finally {
      setBusy(false)
    }
  }

  useBatchDownload(batch, true, handleDownload)

  if (views.length === 0) {
    return <div className="text-gray-500 text-center py-12 text-sm">No walls in this room.</div>
  }

  return (
    <div className="space-y-3">
      {/* Layer toggles */}
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-800">
        <ReportLayerSetSelect sets={layerSets} value={layerSet} onChange={setLayerSetId} />
        <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">Page:</span>
        {TOGGLES.map(t => (
          <button key={t.key} onClick={() => setShow(s => ({ ...s, [t.key]: !s[t.key] }))}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              show[t.key] ? 'bg-blue-600/25 border-blue-600/50 text-blue-300'
                          : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'
            }`}>
            {show[t.key] ? '☑' : '☐'} {t.label}
          </button>
        ))}
        <button data-tour="elev-download" onClick={handleDownload} disabled={busy || visibleViews.length === 0}
          className="ml-auto px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors font-medium">
          {busy ? 'Generating…' : `Download PDF · 1:${scale}`}
        </button>
      </div>

      {/* Wall picker */}
      <div className="flex flex-wrap gap-2 pb-2 border-b border-gray-800">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider self-center mr-1">Walls:</span>
        {views.map(v => (
          <button key={v.key} onClick={() => toggleWall(v.key)}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              selectedIds.has(v.key) ? 'bg-blue-600/25 border-blue-600/50 text-blue-300'
                                    : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'
            }`}>
            {v.name}
          </button>
        ))}
        <button onClick={() => views.forEach(v => toggleWall(v.key))}
          className="px-2 py-0.5 rounded text-xs border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors ml-1">
          Toggle all
        </button>
      </div>

      {/* Previews — one per selected wall */}
      {visibleViews.length === 0 ? (
        <div className="text-gray-500 text-center py-8 text-sm">No walls selected.</div>
      ) : visibleViews.map(({ key, wall: w, side }, i) => (
        <div key={key} className="bg-white rounded overflow-hidden shadow-inner">
          <ElevationPrintSVG
            wall={w}
            side={side}
            walls={walls}
            cabinets={cabinets}
            fixtures={fixtures}
            annotations={annotations}
            benchtops={benchtops} btInfo={btInfo} btProfiles={btProfiles}
            benchHeights={benchTopZ ? benchDimHeights(w.id, benchtops ?? [], benchTopZ, (fixtures ?? []).filter(f => layers.show(fixtureLayer(f.category)))) : []}
            room={room}
            resolvedParts={resolvedParts}
            svgRef={el => { if (el) refs.current.set(key, el); else refs.current.delete(key) }}
            scale={scale}
            layers={layers}
            show={show}
            returnSec={returnSec}
          />
          {show.titleBlock && (
            <div ref={el => { if (el) tbRefs.current.set(key, el); else tbRefs.current.delete(key) }} className="px-2 pb-2">
              <ShopTitleBlock company={company} sheet={sheetTitle(project, room, scale, i + 1, visibleViews.length)}
                width={pageLayout(PAPER[paperKey] ?? PAPER.A3L, MARGIN, null).usableW} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
