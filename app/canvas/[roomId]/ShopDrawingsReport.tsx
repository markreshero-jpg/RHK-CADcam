// Shop drawings package (z_shop_drawings S3): one PDF per room — plan, then
// one elevation per wall — every sheet at the same scale on the same paper,
// each with its heading top-left and the company title block at the foot
// ("Sheet n of N"). A sheet that doesn't fit is named in a warning; it is
// never rescaled. Previews are true page layouts (WYSIWYG with the PDF).
'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { svg2pdf } from 'svg2pdf.js'
import { reportDoc, saveReport } from './pdfCombine'
import type { Project, Room, Wall, CabinetInstance, RoomFixture, RoomAnnotation, BenchtopInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { LayerSet } from '@/src/lib/displayLayers/registry'
import { resolveLayerView, type LayerView } from '@/src/lib/displayLayers/resolve'
import { fixtureLayer } from '@/src/lib/fixtureGeometry'
import { useCompanyTitle } from '@/src/lib/shopDrawings/companyTitle'
import { useTutorial } from '@/src/lib/tutorial/store'
import { benchDimHeights } from './benchDims'
import PlanViewReportSVG, { type PlanViewPageOptions } from './PlanViewReportSVG'
import ElevationPrintSVG, { type ElevationPageOptions } from './ElevationPrintSVG'
import { useReturnSectionData, returnCabinetsOfWalls } from './ReturnSectionSVG'
import { useReportLayerSet, ReportLayerSetSelect } from './ReportLayerSetPicker'
import ShopTitleBlock, { SheetHeading, HEADING_H, sheetTitle, pageLayout, titleBlockHeight } from './ShopTitleBlock'
import { useBatchDownload } from './useBatchDownload'
import Room3DCapture, { Shot3DSVG, type Bt3DPrint } from './Room3DCapture'
import { autoShots, shotsPerSheet, type Shot3D } from '@/src/lib/shopDrawings/shots3d'
import type { HiddenLineResult } from '@/src/lib/shopDrawings/hiddenLine'
import AnnotationLayer from './AnnotationLayer'
import { IDENTITY_FRAME } from '@/src/lib/annotations/geometry'
import { isSpecBlock, layoutSpecSheet, drawnBounds } from '@/src/lib/annotations/blocks'
import { elevationViews, type ElevSide } from '@/src/lib/shopDrawings/elevationViews'

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

type Sheet = { key: string; title: string; wall?: Wall; side?: ElevSide; shots?: Shot3D[] }
/** The 3D views (S8) — not to scale; one tick for all of them, laid out over as many sheets as they need. */
const KEY_3D = '3d'
const LS_3D_OFF = 'shop-drawings-3d-off'
const SHOT_GAP = 4   // mm between views on a 3D sheet

/** Views laid out in the band: 1 → whole band; 2 → side by side; 3–4 → 2 × 2. */
function shotCells(n: number, x: number, y: number, w: number, h: number) {
  const cols = n === 1 ? 1 : 2, rows = Math.ceil(n / cols)
  const cw = (w - SHOT_GAP * (cols - 1)) / cols, ch = (h - SHOT_GAP * (rows - 1)) / rows
  return Array.from({ length: n }, (_, i) => ({ x: x + (i % cols) * (cw + SHOT_GAP), y: y + Math.floor(i / cols) * (ch + SHOT_GAP), w: cw, h: ch }))
}

/** The spec blocks' own sheet (Mark, 2026-10-25): first, when the plan only fits without them. */
const KEY_SPECS = 'specs'
/** The spec sheet is NTS, so it's enlarged to fill the drawing area — up to this much (Mark, 2026-10-26). */
const SPEC_MAX_ZOOM = 2.5
/** Paper mm of white around the spec boxes on their sheet. */
const SPEC_MARGIN = 2

/** Zoom that fits a w × h paper-mm drawing into the area, capped at SPEC_MAX_ZOOM. */
function specZoom(w: number, h: number, areaW: number, areaH: number): number {
  return Math.max(1, Math.min(SPEC_MAX_ZOOM, areaW / w, areaH / h))
}

/** Spec blocks side by side at their paper size; viewBox in frame mm like the plan. */
function SpecSheetSVG({ annotations, scale, maxW, maxH, layers, printColours, svgRef }: {
  annotations: RoomAnnotation[]
  scale: number
  maxW: number
  maxH: number
  layers: LayerView
  printColours: boolean
  svgRef: (el: SVGSVGElement | null) => void
}) {
  // Wrap the blocks at whichever row width lets the sheet be enlarged the most:
  // narrower rows stack the blocks so they can grow to fill a page's height.
  let best: { laid: RoomAnnotation[]; b: NonNullable<ReturnType<typeof drawnBounds>>; zoom: number } | null = null
  for (let z = 1; z <= SPEC_MAX_ZOOM + 0.001; z += 0.125) {
    const laid = layoutSpecSheet(annotations, scale, maxW / z)
    const b = drawnBounds(laid, scale)
    if (!b) continue
    const zoom = specZoom((b.maxX - b.minX) / scale + 2 * SPEC_MARGIN, (b.maxY - b.minY) / scale + 2 * SPEC_MARGIN, maxW, maxH)
    if (!best || zoom > best.zoom + 0.001) best = { laid, b, zoom }
  }
  if (!best) return null
  const { laid, b } = best
  const pad = SPEC_MARGIN * scale   // clear of the boxes' borders
  const x = b.minX - pad, y = b.minY - pad, w = b.maxX - b.minX + pad * 2, h = b.maxY - b.minY + pad * 2
  return (
    <svg ref={svgRef} viewBox={`${x} ${y} ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" data-vb-w={w} data-vb-h={h}
      fontFamily="Arial, Helvetica, sans-serif" style={{ width: '100%', height: 'auto', background: 'white', display: 'block' }}>
      <AnnotationLayer annotations={laid} frame={IDENTITY_FRAME} paper={scale} layers={layers} printColours={printColours} />
    </svg>
  )
}

/** A layer view with some items always hidden. */
function without(v: LayerView, ...ids: string[]): LayerView {
  return { ...v, show: id => !ids.includes(id) && v.show(id), any: (...xs) => xs.some(id => !ids.includes(id) && v.show(id)) }
}

export default function ShopDrawingsReport({ project, room, walls, cabinets, planResolved, elevResolved, threeDResolved, bt3d, fixtures = [], annotations = [],
  benchtops = [], benchTopZ, layerSets, activeLayerSetId, scale, paperKey, onDeleteSavedShot, batch }: {
  /** Job Reports, several rooms: download as soon as ready, then call this (useBatchDownload). */
  batch?: () => void
  /** Remove a view saved from the 3D view (room.shop_3d_shots). */
  onDeleteSavedShot?: (id: string) => void
  /** Resolved parts with the 3D view's hidden parts removed. */
  threeDResolved: Map<string, ResolvedCabinet>
  /** Benchtop slab inputs for the 3D views (the canvas's thickness cascade + edge profiles). */
  bt3d?: Omit<Bt3DPrint, 'benchtops'>
  project:  Project | null
  room:     Room
  walls:    Wall[]
  cabinets: CabinetInstance[]
  planResolved: Map<string, ResolvedCabinet>
  elevResolved: Map<string, ResolvedCabinet>
  fixtures?:    RoomFixture[]
  /** CAD annotations — plan notes print on the plan sheet, elevation notes on their wall's sheet. */
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
  // Shop drawings never print cabinet names on the plan nor sizes on the elevations
  // (Mark, 2026-10-21), whatever the layer set — the spec block / schedules carry them.
  const planLayers = useMemo(() => without(resolveLayerView(planSet, 'plan'), 'cabinet_labels'), [planSet])
  const elevLayers = useMemo(() => without(resolveLayerView(elevSet, 'elevation'), 'cabinet_sizes'), [elevSet])
  const planAnnots = useMemo(() => annotations.filter(a => a.view === 'plan'), [annotations])
  const [planShow] = useState<PlanViewPageOptions>(() => ({
    ...readPage('plan-view-layers', { titleBlock: true, annotColours: false }), titleBlock: true }))
  const [elevShow] = useState<ElevationPageOptions>(() => ({
    ...readPage('elevation-print-layers', { returnWalls: true, titleBlock: true, annotColours: false }), titleBlock: true }))

  // Sheets: the plan, then each wall in wall order, back sides + islands too (the 3D views follow, below).
  const elevViews = useMemo(() => elevationViews(walls, cabinets), [walls, cabinets])
  const baseSheets: Sheet[] = useMemo(() => [
    { key: 'plan', title: `${room.name} Plan` },
    ...elevViews.map(v => ({ key: v.key, title: `${room.name} Elevation ${v.name}`, wall: v.wall, side: v.side })),
  ], [elevViews, room.name])
  // Return cabinet sections (z_section_view R1): part overrides for every wall sheet, loaded once.
  const retCabs = useMemo(() => returnCabinetsOfWalls(walls.filter(w => w.wall_type === 'standard'), walls, cabinets), [walls, cabinets])
  const returnSec = useReturnSectionData(retCabs, elevResolved, elevLayers.show('return_sections'))

  // 3D views: auto shots, captured off-screen once per open (or on Re-render).
  // Own layer set for the 3D views — the elevation set's 3D settings often hide
  // fronts / tops or ghost the carcase (Mark, 2026-10-21). Defaults to the canvas's set.
  const [threeDSet, setThreeDSetId] = useReportLayerSet('shop-3d-layer-set', layerSets, activeLayerSetId)
  const threeDLayers = useMemo(() => resolveLayerView(threeDSet, '3d'), [threeDSet])
  // Auto views (each run, islands both sides) + views saved from the 3D view; each can be switched off.
  const allShots = useMemo(() => [
    ...autoShots(walls, cabinets, room.room_dy ?? 2400),
    ...(room.shop_3d_shots ?? []).map(s => ({ ...s, saved: true })),
  ], [walls, cabinets, room.room_dy, room.shop_3d_shots])
  const [shotsOff, setShotsOff] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_3D_OFF) ?? '{}')[room.id]
      if (Array.isArray(saved)) return new Set(saved as string[])
    } catch { /* ignore */ }
    return new Set()
  })
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(LS_3D_OFF) ?? '{}')
      localStorage.setItem(LS_3D_OFF, JSON.stringify({ ...all, [room.id]: [...shotsOff] }))
    } catch { /* storage unavailable */ }
  }, [shotsOff, room.id])
  const shots = allShots.filter(s => !shotsOff.has(s.id))
  const [shotResults, setShotResults] = useState<Record<string, HiddenLineResult>>({})
  const [captureRun, setCaptureRun] = useState(0)
  const pending = shots.filter(s => !shotResults[s.id])
  const captured = shots.length > 0 && pending.length === 0
  const perSheet = shotsPerSheet(walls)

  // Ticks: remembered per room; by default the plan + walls with cabinets on them.
  const [ticked, setTicked] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_SHEETS) ?? '{}')[room.id]
      if (Array.isArray(saved)) return new Set(saved as string[])
    } catch { /* ignore */ }
    return new Set(['plan', ...walls.filter(w => cabinets.some(c => c.wall_id === w.id)).map(w => w.id), KEY_3D])
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
  // Drawing sizes (paper mm) come from each SVG's data-vb-* once it has rendered
  // ('plan:full' = the plan with its spec blocks, whether or not they're on it).
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({})
  // Spec blocks move to their own first sheet when the plan doesn't fit with them.
  const specAnnots = planAnnots.filter(isSpecBlock)
  const fullPlan = sizes['plan:full']
  const moveSpecs = specAnnots.length > 0 && !!fullPlan
    && (fullPlan.w > layout.usableW + 0.01 || fullPlan.h > layout.usableH + 0.01)

  // 3D pages: the switched-on views, perSheet at a time.
  const threeDPages: Sheet[] = []
  for (let i = 0; i < shots.length; i += perSheet) {
    threeDPages.push({ key: `${KEY_3D}:${i / perSheet}`, title: `${room.name} 3D`, shots: shots.slice(i, i + perSheet) })
  }
  const specSheet: Sheet[] = moveSpecs ? [{ key: KEY_SPECS, title: `${room.name} Specifications` }] : []
  const sheets = [...specSheet, ...baseSheets, ...threeDPages]
  // The specs sheet goes with the plan's tick.
  const printed = sheets.filter(s => (s.shots ? ticked.has(KEY_3D) : ticked.has(s.key === KEY_SPECS ? 'plan' : s.key)))

  const drawRefs = useRef<Map<string, SVGSVGElement>>(new Map())
  const pageRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const planRef = useRef<SVGSVGElement>(null)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const next: Record<string, { w: number; h: number }> = {}
      const read = (key: string, el: SVGSVGElement | null | undefined, attr = 'vb') => {
        const w = Number(el?.getAttribute(`data-${attr}-w`)), h = Number(el?.getAttribute(`data-${attr}-h`))
        if (w > 0 && h > 0) next[key] = { w: w / scale, h: h / scale }
      }
      read('plan', planRef.current)
      read('plan:full', planRef.current, 'full')
      for (const [k, el] of drawRefs.current) read(k, el)
      const same = Object.keys(next).length === Object.keys(sizes).length
        && Object.entries(next).every(([k, v]) => sizes[k]?.w === v.w && sizes[k]?.h === v.h)
      if (!same) setSizes(next)
    })
    return () => cancelAnimationFrame(id)
  })

  /** Paper-mm box of a sheet's drawing: centred across, centred in the band between heading and title block. */
  const place = (key: string) => {
    // 3D views aren't to scale: they fill the band.
    if (key.startsWith(KEY_3D)) return { x: MARGIN, y: layout.top, w: layout.usableW, h: layout.usableH, fits: true }
    const s0 = sizes[key]
    if (!s0) return null
    // NTS spec sheet: enlarged to fill the band (the PDF scales the vector with the box).
    const z = key === KEY_SPECS ? specZoom(s0.w, s0.h, layout.usableW, layout.usableH) : 1
    const s = { w: s0.w * z, h: s0.h * z }
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
      const doc = reportDoc(paper.w, paper.h)
      for (let i = 0; i < printed.length; i++) {
        const sheet = printed[i]
        const page = pageRefs.current.get(sheet.key)
        const drawing = page?.querySelector<SVGSVGElement>('[data-role="drawing"] svg')
        const box = place(sheet.key)
        if (!page || !box || (!drawing && !sheet.shots)) continue
        if (i > 0) doc.addPage([paper.w, paper.h], orientation)

        const heading = page.querySelector<SVGSVGElement>('[data-role="heading"] svg')
        if (heading) await svg2pdf(heading, doc, { x: MARGIN, y: MARGIN, width: layout.usableW, height: HEADING_H })

        if (sheet.shots) {
          // 3D views: each cell's paper-mm box is on its element.
          for (const cell of page.querySelectorAll<HTMLElement>('[data-role="shot"]')) {
            const svg = cell.querySelector('svg')
            const d = cell.dataset
            if (svg) await svg2pdf(svg, doc, { x: Number(d.x), y: Number(d.y), width: Number(d.w), height: Number(d.h) })
          }
        } else if (drawing) {
          // True scale: the model-mm viewBox renders into vbW/scale paper mm.
          const clone = drawing.cloneNode(true) as SVGSVGElement
          clone.setAttribute('width', `${box.w}mm`)
          clone.setAttribute('height', `${box.h}mm`)
          clone.setAttribute('preserveAspectRatio', 'xMinYMin meet')
          await svg2pdf(clone, doc, { x: box.x, y: box.y, width: box.w, height: box.h })
        }

        const tb = page.querySelector<SVGSVGElement>('[data-role="title-block"] svg')
        if (tb && layout.tb) await svg2pdf(tb, doc, { x: layout.tb.x, y: layout.tb.y, width: layout.tb.w, height: layout.tb.h })
      }
      const safe = (s: string) => s.replace(/[^\w-]+/g, '_')
      saveReport(doc, `shop-drawings-${safe(project?.job_number || project?.name || 'job')}-${safe(room.name)}.pdf`)
    } finally {
      setBusy(false)
    }
  }

  // Ready once every printed drawing has measured and the 3D views are rendered.
  const batchReady = printed.length === 0 || (printed.every(s => s.shots || sizes[s.key])
    && (!ticked.has(KEY_3D) || captured || shots.length === 0))
  useBatchDownload(batch, batchReady, handleDownload)

  const pct = (mm: number, of: number) => `${(mm / of) * 100}%`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-800">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Plan</span>
        <ReportLayerSetSelect sets={layerSets} value={planSet} onChange={setPlanSetId} />
        <span className="text-[10px] text-gray-500 uppercase tracking-wider ml-2">Elevations</span>
        <ReportLayerSetSelect sets={layerSets} value={elevSet} onChange={setElevSetId} />
        <span className="text-[10px] text-gray-500 uppercase tracking-wider ml-2">3D</span>
        <ReportLayerSetSelect sets={layerSets} value={threeDSet}
          onChange={id => { setThreeDSetId(id); setShotResults({}); setCaptureRun(n => n + 1) }} />
        {ticked.has(KEY_3D) && (
          <button onClick={() => { setShotResults({}); setCaptureRun(n => n + 1) }} disabled={!captured}
            title="Capture the 3D views again (after changing the room)"
            className="ml-auto px-2 py-1 text-xs border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-50 rounded">
            {captured ? 'Re-render 3D' : 'Rendering 3D…'}
          </button>
        )}
        <button data-tour="shop-download" onClick={handleDownload} disabled={busy || printed.length === 0 || (ticked.has(KEY_3D) && !captured && shots.length > 0)}
          className={`${ticked.has(KEY_3D) ? '' : 'ml-auto '}px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors font-medium`}>
          {busy ? 'Generating…' : `Download PDF · ${printed.length} sheet${printed.length === 1 ? '' : 's'} · 1:${scale} ${paper.label}`}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 pb-2 border-b border-gray-800">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider self-center mr-1">Sheets:</span>
        {[...baseSheets, { key: KEY_3D, title: '3D' } as Sheet].map(s => (
          <button key={s.key} onClick={() => toggle(s.key)}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              ticked.has(s.key) ? 'bg-blue-600/25 border-blue-600/50 text-blue-300'
                                : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'
            }`}>
            {ticked.has(s.key) ? '☑' : '☐'} {s.key === 'plan' ? 'Plan' : s.key === KEY_3D ? '3D views' : s.wall!.name}
          </button>
        ))}
      </div>

      {ticked.has(KEY_3D) && (
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-800">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1"
            title="Saved views: right-click empty space in the 3D view → Save view for shop drawings">3D views:</span>
          {allShots.map(s => {
            const on = !shotsOff.has(s.id)
            return (
              <span key={s.id} className={`inline-flex items-center rounded text-xs border ${on ? 'bg-blue-600/25 border-blue-600/50 text-blue-300' : 'border-gray-700 text-gray-500'}`}>
                <button className="px-2 py-0.5" onClick={() => setShotsOff(prev => {
                  const next = new Set(prev)
                  if (next.has(s.id)) next.delete(s.id); else next.add(s.id)
                  return next
                })}>{on ? '☑' : '☐'} {s.label}{s.saved ? ' (saved)' : ''}</button>
                {s.saved && onDeleteSavedShot && (
                  <button className="px-1.5 py-0.5 text-gray-500 hover:text-red-400" title="Remove this saved view"
                    onClick={() => onDeleteSavedShot(s.id)}>✕</button>
                )}
              </span>
            )
          })}
          <span className="text-[10px] text-gray-600">{perSheet} per sheet</span>
        </div>
      )}

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
        const sheetScale = sheet.shots || sheet.key === KEY_SPECS ? 'NTS' : scale
        const cells = sheet.shots ? shotCells(sheet.shots.length, MARGIN, layout.top, layout.usableW, layout.usableH) : []
        return (
          <div key={sheet.key} ref={el => { if (el) pageRefs.current.set(sheet.key, el); else pageRefs.current.delete(sheet.key) }}
            className={`relative bg-white shadow-inner rounded-sm overflow-hidden ${n < 0 ? 'hidden' : ''}`}
            style={{ aspectRatio: `${paper.w} / ${paper.h}` }}>
            <div data-role="heading" className="absolute" style={{ left: pct(MARGIN, paper.w), top: pct(MARGIN, paper.h), width: pct(layout.usableW, paper.w) }}>
              <SheetHeading title={sheet.title} scale={sheetScale} width={layout.usableW} />
            </div>
            {sheet.shots?.map((s, ci) => {
              const c = cells[ci], r = shotResults[s.id]
              return (
                <div key={s.id} data-role="shot" data-x={c.x} data-y={c.y} data-w={c.w} data-h={c.h} className="absolute"
                  style={{ left: pct(c.x, paper.w), top: pct(c.y, paper.h), width: pct(c.w, paper.w) }}>
                  {r ? <Shot3DSVG shot={r} width={c.w} height={c.h} />
                    : <div className="flex items-center justify-center text-gray-400 text-xs" style={{ aspectRatio: `${c.w} / ${c.h}` }}>Rendering {s.label}…</div>}
                </div>
              )
            })}
            {!sheet.shots && <div data-role="drawing" className={`absolute ${box && !box.fits ? 'outline outline-2 outline-amber-500' : ''}`}
              style={box
                ? { left: pct(box.x, paper.w), top: pct(box.y, paper.h), width: pct(box.w, paper.w) }
                : { left: pct(MARGIN, paper.w), top: pct(layout.top, paper.h), width: pct(layout.usableW, paper.w), visibility: 'hidden' }}>
              {sheet.key === KEY_SPECS ? (
                <SpecSheetSVG annotations={specAnnots} scale={scale} maxW={layout.usableW} maxH={layout.usableH} layers={planLayers}
                  printColours={planShow.annotColours}
                  svgRef={el => { if (el) drawRefs.current.set(sheet.key, el); else drawRefs.current.delete(sheet.key) }} />
              ) : sheet.wall ? (
                <ElevationPrintSVG
                  wall={sheet.wall} side={sheet.side} walls={walls} room={room}
                  cabinets={cabinets} fixtures={fixtures} annotations={annotations} resolvedParts={elevResolved}
                  benchtops={benchtops} btInfo={bt3d?.info} btProfiles={bt3d?.profiles}
                  benchHeights={benchTopZ ? benchDimHeights(sheet.wall.id, benchtops, benchTopZ, fixtures.filter(f => elevLayers.show(fixtureLayer(f.category)))) : []}
                  svgRef={el => { if (el) drawRefs.current.set(sheet.key, el); else drawRefs.current.delete(sheet.key) }}
                  scale={scale} layers={elevLayers} show={elevShow} returnSec={returnSec}
                />
              ) : (
                <PlanViewReportSVG
                  walls={walls} cabinets={cabinets} fixtures={fixtures} annotations={planAnnots} benchtops={benchtops}
                  resolvedParts={planResolved} svgRef={planRef} hideSpecBlocks={moveSpecs}
                  scale={scale} layers={planLayers} show={planShow}
                />
              )}
            </div>}
            {layout.tb && (
              <div data-role="title-block" className="absolute" style={{ left: pct(layout.tb.x, paper.w), top: pct(layout.tb.y, paper.h), width: pct(layout.tb.w, paper.w) }}>
                <ShopTitleBlock company={company} sheet={sheetTitle(project, room, sheetScale, Math.max(1, n + 1), printed.length)} width={layout.tb.w} />
              </div>
            )}
          </div>
        )
      })}

      {ticked.has(KEY_3D) && !captured && (
        <Room3DCapture key={captureRun} shots={pending}
          walls={walls} cabinets={cabinets} room={room} resolvedParts={threeDResolved} layers={threeDLayers}
          fixtures={fixtures} bt={bt3d && { ...bt3d, benchtops }}
          onCaptured={(id, r) => setShotResults(prev => ({ ...prev, [id]: r }))} />
      )}
    </div>
  )
}
