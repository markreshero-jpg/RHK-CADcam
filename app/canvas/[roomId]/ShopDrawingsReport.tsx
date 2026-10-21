// Shop drawings package (z_shop_drawings S3): one PDF per room — plan, then
// one elevation per wall — every sheet at the same scale on the same paper,
// each with its heading top-left and the company title block at the foot
// ("Sheet n of N"). A sheet that doesn't fit is named in a warning; it is
// never rescaled. Previews are true page layouts (WYSIWYG with the PDF).
'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'
import type { Project, Room, Wall, CabinetInstance, RoomFixture, RoomAnnotation, BenchtopInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { LayerSet } from '@/src/lib/displayLayers/registry'
import { resolveLayerView } from '@/src/lib/displayLayers/resolve'
import { fixtureLayer } from '@/src/lib/fixtureGeometry'
import { useCompanyTitle } from '@/src/lib/shopDrawings/companyTitle'
import { useTutorial } from '@/src/lib/tutorial/store'
import { benchDimHeights } from './benchDims'
import PlanViewReportSVG, { type PlanViewPageOptions } from './PlanViewReportSVG'
import ElevationPrintSVG, { type ElevationPageOptions } from './ElevationPrintSVG'
import { useReportLayerSet, ReportLayerSetSelect } from './ReportLayerSetPicker'
import ShopTitleBlock, { SheetHeading, HEADING_H, sheetTitle, pageLayout, titleBlockHeight } from './ShopTitleBlock'

const PAPER: Record<string, { w: number; h: number; label: string }> = {
  A4L: { w: 297, h: 210, label: 'A4' }, A3L: { w: 420, h: 297, label: 'A3' },
  A2L: { w: 594, h: 420, label: 'A2' }, A1L: { w: 841, h: 594, label: 'A1' },
}
const MARGIN = 10
const LS_SHEETS = 'shop-drawings-sheets'

// Page extras follow the Plan View / Elevation Views toggles (same storage keys);
// the title block is always on in the package.
function readPage<T extends object>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const s = JSON.parse(raw)
      return Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, typeof s[k] === 'boolean' ? s[k] : v])) as T
    }
  } catch { /* ignore malformed storage */ }
  return defaults
}

type Sheet = { key: string; title: string; wall?: Wall }

export default function ShopDrawingsReport({ project, room, walls, cabinets, planResolved, elevResolved, fixtures = [], annotations = [],
  benchtops = [], benchTopZ, layerSets, activeLayerSetId, scale, paperKey }: {
  project:  Project | null
  room:     Room
  walls:    Wall[]
  cabinets: CabinetInstance[]
  planResolved: Map<string, ResolvedCabinet>
  elevResolved: Map<string, ResolvedCabinet>
  fixtures?:    RoomFixture[]
  /** Plan-view CAD annotations — they print on the plan sheet. */
  annotations?: RoomAnnotation[]
  benchtops?:   BenchtopInstance[]
  benchTopZ?:   (bt: BenchtopInstance) => number
  layerSets: LayerSet[]
  activeLayerSetId: string | null
  scale:    number
  paperKey: string
}) {
  const company = useCompanyTitle()
  const paper = PAPER[paperKey] ?? PAPER.A3L
  const layout = pageLayout(paper, MARGIN, titleBlockHeight(company), HEADING_H)

  const [planSet, setPlanSetId] = useReportLayerSet('plan-view-layer-set', layerSets, activeLayerSetId)
  const [elevSet, setElevSetId] = useReportLayerSet('elevation-print-layer-set', layerSets, activeLayerSetId)
  const planLayers = useMemo(() => resolveLayerView(planSet, 'plan'), [planSet])
  const elevLayers = useMemo(() => resolveLayerView(elevSet, 'elevation'), [elevSet])
  const [planShow] = useState<PlanViewPageOptions>(() => ({
    ...readPage('plan-view-layers', { wallNames: true, hatch: true, titleBlock: true, annotColours: false }), titleBlock: true }))
  const [elevShow] = useState<ElevationPageOptions>(() => ({
    ...readPage('elevation-print-layers', { returnWalls: true, titleBlock: true }), titleBlock: true }))

  // Sheets: the plan, then each standard wall in wall order.
  const sheets: Sheet[] = useMemo(() => [
    { key: 'plan', title: `${room.name} Plan` },
    ...walls.filter(w => w.wall_type === 'standard')
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(w => ({ key: w.id, title: `${room.name} Elevation ${w.name}`, wall: w })),
  ], [walls, room.name])

  // Ticks: remembered per room; by default the plan + walls with cabinets on them.
  const [ticked, setTicked] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_SHEETS) ?? '{}')[room.id]
      if (Array.isArray(saved)) return new Set(saved as string[])
    } catch { /* ignore */ }
    return new Set(['plan', ...walls.filter(w => cabinets.some(c => c.wall_id === w.id)).map(w => w.id)])
  })
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(LS_SHEETS) ?? '{}')
      localStorage.setItem(LS_SHEETS, JSON.stringify({ ...all, [room.id]: [...ticked] }))
    } catch { /* storage unavailable */ }
  }, [ticked, room.id])
  const toggle = (key: string) => setTicked(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const printed = sheets.filter(s => ticked.has(s.key))

  // Drawing sizes (model mm) come from each SVG's data-vb-* once it has rendered.
  const drawRefs = useRef<Map<string, SVGSVGElement>>(new Map())
  const pageRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const planRef = useRef<SVGSVGElement>(null)
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({})
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const next: Record<string, { w: number; h: number }> = {}
      const read = (key: string, el: SVGSVGElement | null | undefined) => {
        const w = Number(el?.getAttribute('data-vb-w')), h = Number(el?.getAttribute('data-vb-h'))
        if (w > 0 && h > 0) next[key] = { w: w / scale, h: h / scale }
      }
      read('plan', planRef.current)
      for (const [k, el] of drawRefs.current) read(k, el)
      const same = Object.keys(next).length === Object.keys(sizes).length
        && Object.entries(next).every(([k, v]) => sizes[k]?.w === v.w && sizes[k]?.h === v.h)
      if (!same) setSizes(next)
    })
    return () => cancelAnimationFrame(id)
  })

  /** Paper-mm box of a sheet's drawing: centred across, centred in the band between heading and title block. */
  const place = (key: string) => {
    const s = sizes[key]
    if (!s) return null
    return {
      x: MARGIN + Math.max(0, (layout.usableW - s.w) / 2),
      y: layout.top + Math.max(0, (layout.usableH - s.h) / 2),
      w: s.w, h: s.h,
      fits: s.w <= layout.usableW + 0.01 && s.h <= layout.usableH + 0.01,
    }
  }
  const misfits = printed.filter(s => { const p = place(s.key); return p && !p.fits })

  const [busy, setBusy] = useState(false)
  async function handleDownload() {
    if (printed.length === 0) return
    useTutorial.getState().emit('shop_pdf')
    setBusy(true)
    try {
      const orientation = paper.w >= paper.h ? 'landscape' : 'portrait'
      const doc = new jsPDF({ unit: 'mm', format: [paper.w, paper.h], orientation })
      for (let i = 0; i < printed.length; i++) {
        const sheet = printed[i]
        const page = pageRefs.current.get(sheet.key)
        const drawing = sheet.key === 'plan' ? planRef.current : drawRefs.current.get(sheet.key)
        const box = place(sheet.key)
        if (!page || !drawing || !box) continue
        if (i > 0) doc.addPage([paper.w, paper.h], orientation)

        const heading = page.querySelector<SVGSVGElement>('[data-role="heading"] svg')
        if (heading) await svg2pdf(heading, doc, { x: MARGIN, y: MARGIN, width: layout.usableW, height: HEADING_H })

        // True scale: the model-mm viewBox renders into vbW/scale paper mm.
        const clone = drawing.cloneNode(true) as SVGSVGElement
        clone.setAttribute('width', `${box.w}mm`)
        clone.setAttribute('height', `${box.h}mm`)
        clone.setAttribute('preserveAspectRatio', 'xMinYMin meet')
        await svg2pdf(clone, doc, { x: box.x, y: box.y, width: box.w, height: box.h })

        const tb = page.querySelector<SVGSVGElement>('[data-role="title-block"] svg')
        if (tb && layout.tb) await svg2pdf(tb, doc, { x: layout.tb.x, y: layout.tb.y, width: layout.tb.w, height: layout.tb.h })
      }
      const safe = (s: string) => s.replace(/[^\w-]+/g, '_')
      doc.save(`shop-drawings-${safe(project?.job_number || project?.name || 'job')}-${safe(room.name)}.pdf`)
    } finally {
      setBusy(false)
    }
  }

  const pct = (mm: number, of: number) => `${(mm / of) * 100}%`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-800">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Plan</span>
        <ReportLayerSetSelect sets={layerSets} value={planSet} onChange={setPlanSetId} />
        <span className="text-[10px] text-gray-500 uppercase tracking-wider ml-2">Elevations</span>
        <ReportLayerSetSelect sets={layerSets} value={elevSet} onChange={setElevSetId} />
        <button data-tour="shop-download" onClick={handleDownload} disabled={busy || printed.length === 0}
          className="ml-auto px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors font-medium">
          {busy ? 'Generating…' : `Download PDF · ${printed.length} sheet${printed.length === 1 ? '' : 's'} · 1:${scale} ${paper.label}`}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 pb-2 border-b border-gray-800">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider self-center mr-1">Sheets:</span>
        {sheets.map(s => (
          <button key={s.key} onClick={() => toggle(s.key)}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              ticked.has(s.key) ? 'bg-blue-600/25 border-blue-600/50 text-blue-300'
                                : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'
            }`}>
            {ticked.has(s.key) ? '☑' : '☐'} {s.key === 'plan' ? 'Plan' : s.wall!.name}
          </button>
        ))}
      </div>

      {misfits.length > 0 && (
        <div className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 space-y-0.5">
          <div>At 1:{scale} on {paper.label} the drawing area is {Math.floor(layout.usableW)} × {Math.floor(layout.usableH)}mm. These sheets don&apos;t fit (all sheets stay at one scale):</div>
          {misfits.map(s => {
            const p = place(s.key)!
            return <div key={s.key}>• {s.title}: {Math.ceil(p.w)} × {Math.ceil(p.h)}mm</div>
          })}
          <div>Choose bigger paper or a larger scale number above.</div>
        </div>
      )}

      {/* Page previews: what the PDF will hold, sheet by sheet. Unticked sheets
          stay mounted (hidden) so their sizes are known when they're ticked. */}
      {sheets.map(sheet => {
        const n = printed.indexOf(sheet)
        const box = place(sheet.key)
        return (
          <div key={sheet.key} ref={el => { if (el) pageRefs.current.set(sheet.key, el); else pageRefs.current.delete(sheet.key) }}
            className={`relative bg-white shadow-inner rounded-sm overflow-hidden ${n < 0 ? 'hidden' : ''}`}
            style={{ aspectRatio: `${paper.w} / ${paper.h}` }}>
            <div data-role="heading" className="absolute" style={{ left: pct(MARGIN, paper.w), top: pct(MARGIN, paper.h), width: pct(layout.usableW, paper.w) }}>
              <SheetHeading title={sheet.title} scale={scale} width={layout.usableW} />
            </div>
            <div className={`absolute ${box && !box.fits ? 'outline outline-2 outline-amber-500' : ''}`}
              style={box
                ? { left: pct(box.x, paper.w), top: pct(box.y, paper.h), width: pct(box.w, paper.w) }
                : { left: pct(MARGIN, paper.w), top: pct(layout.top, paper.h), width: pct(layout.usableW, paper.w), visibility: 'hidden' }}>
              {sheet.wall ? (
                <ElevationPrintSVG
                  wall={sheet.wall} walls={walls} room={room}
                  cabinets={cabinets} fixtures={fixtures} resolvedParts={elevResolved}
                  benchHeights={benchTopZ ? benchDimHeights(sheet.wall.id, benchtops, benchTopZ, fixtures.filter(f => elevLayers.show(fixtureLayer(f.category)))) : []}
                  svgRef={el => { if (el) drawRefs.current.set(sheet.key, el); else drawRefs.current.delete(sheet.key) }}
                  scale={scale} layers={elevLayers} show={elevShow}
                />
              ) : (
                <PlanViewReportSVG
                  walls={walls} cabinets={cabinets} fixtures={fixtures} annotations={annotations} benchtops={benchtops}
                  resolvedParts={planResolved} svgRef={planRef}
                  scale={scale} layers={planLayers} show={planShow}
                />
              )}
            </div>
            {layout.tb && (
              <div data-role="title-block" className="absolute" style={{ left: pct(layout.tb.x, paper.w), top: pct(layout.tb.y, paper.h), width: pct(layout.tb.w, paper.w) }}>
                <ShopTitleBlock company={company} sheet={sheetTitle(project, room, scale, Math.max(1, n + 1), printed.length)} width={layout.tb.w} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
