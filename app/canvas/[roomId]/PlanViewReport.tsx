// New plan-view report — parallel to the existing `shop_drawing_plan`.
// Drawing content follows a display layer set (picker in the toolbar); page
// extras are toggles persisted to localStorage. True-scale PDF export
// via jsPDF + svg2pdf.js. The SVG viewBox stays in model mm; svg2pdf renders it
// into a paper-mm box of size vbW/scale × vbH/scale, giving a true 1:scale plot.
'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'
import type { Project, Room, Wall, CabinetInstance, RoomFixture, RoomAnnotation } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { LayerSet } from '@/src/lib/displayLayers/registry'
import { resolveLayerView } from '@/src/lib/displayLayers/resolve'
import PlanViewReportSVG, { type PlanViewPageOptions } from './PlanViewReportSVG'
import { useReportLayerSet, ReportLayerSetSelect } from './ReportLayerSetPicker'
import { useTutorial } from '@/src/lib/tutorial/store'
import { useCompanyTitle } from '@/src/lib/shopDrawings/companyTitle'
import ShopTitleBlock, { sheetTitle, pageLayout, titleBlockHeight } from './ShopTitleBlock'

const PAPER: Record<string, { w: number; h: number }> = {
  A4L: { w: 297, h: 210 },
  A3L: { w: 420, h: 297 },
  A2L: { w: 594, h: 420 },
  A1L: { w: 841, h: 594 },
}
const STANDARD_SCALES = [5, 10, 15, 20, 25, 30, 40, 50, 100]

const MARGIN = 10   // mm, usable-area margin on all sides
const LS_KEY = 'plan-view-layers'
const LS_SET_KEY = 'plan-view-layer-set'
const DEFAULT_PAGE: PlanViewPageOptions = { wallNames: true, hatch: true, titleBlock: true, annotColours: false }

const TOGGLES: { key: keyof PlanViewPageOptions; label: string }[] = [
  { key: 'wallNames',  label: 'Wall Names' },
  { key: 'hatch',      label: 'Wall Hatch' },
  { key: 'titleBlock', label: 'Title Block' },
  { key: 'annotColours', label: 'Annotation colours' },
]

export default function PlanViewReport({ project, room, walls, cabinets, resolvedParts, layerSets, activeLayerSetId, scale, paperKey, fixtures, annotations }: {
  /** Doors / windows (z_fixtures P5) are drawn from these. */
  fixtures?: RoomFixture[]
  /** CAD annotations (z_CAD_tool), plan view rows. */
  annotations?: RoomAnnotation[]
  project:  Project | null
  room:     Room
  walls:    Wall[]
  cabinets: CabinetInstance[]
  resolvedParts: Map<string, ResolvedCabinet>
  layerSets: LayerSet[]
  activeLayerSetId: string | null
  scale:    number
  paperKey: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const tbRef = useRef<HTMLDivElement>(null)
  const company = useCompanyTitle()
  const [layerSet, setLayerSetId] = useReportLayerSet(LS_SET_KEY, layerSets, activeLayerSetId)
  const layers = useMemo(() => resolveLayerView(layerSet, 'plan'), [layerSet])
  // Modal only mounts on user action (never SSR'd), so reading localStorage in the
  // initializer is safe — no hydration mismatch. Older storage also held drawing
  // toggles (now layer items) — only the page extras are read.
  const [show, setShow] = useState<PlanViewPageOptions>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        return Object.fromEntries(TOGGLES.map(t => [t.key, typeof s[t.key] === 'boolean' ? s[t.key] : DEFAULT_PAGE[t.key]])) as unknown as PlanViewPageOptions
      }
    } catch { /* ignore malformed storage */ }
    return DEFAULT_PAGE
  })
  const [busy, setBusy] = useState(false)
  const [fitWarning, setFitWarning] = useState<string | null>(null)

  // Persist on every change.
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(show)) } catch { /* storage unavailable */ }
  }, [show])


  function paperLabel(key: string) {
    return `${key.replace(/L$/, '')} Landscape`
  }

  // Title block sits at the foot of the page in paper mm; the drawing fits above it.
  const tbH = show.titleBlock ? titleBlockHeight(company) : null

  const getFitInfo = useCallback(() => {
    const svgEl = svgRef.current
    if (!svgEl) return null
    const paper = PAPER[paperKey] ?? PAPER.A3L
    const vbW = Number(svgEl.getAttribute('data-vb-w'))
    const vbH = Number(svgEl.getAttribute('data-vb-h'))
    if (!Number.isFinite(vbW) || !Number.isFinite(vbH)) return null

    const targetW = vbW / scale
    const targetH = vbH / scale
    const { usableW, usableH, tb } = pageLayout(paper, MARGIN, tbH)
    return { paper, targetW, targetH, usableW, usableH, tb }
  }, [paperKey, scale, tbH])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const fit = getFitInfo()
      if (!fit) {
        setFitWarning(null)
        return
      }
      const overW = fit.targetW > fit.usableW
      const overH = fit.targetH > fit.usableH
      if (!overW && !overH) {
        setFitWarning(null)
        return
      }

      const paperSuggestion = Object.entries(PAPER).find(([, p]) => {
        const l = pageLayout(p, MARGIN, tbH)
        return fit.targetW <= l.usableW && fit.targetH <= l.usableH
      })
      const requiredScale = scale * Math.max(fit.targetW / fit.usableW, fit.targetH / fit.usableH)
      const scaleSuggestion = STANDARD_SCALES.find(s => s >= requiredScale)
      const suggestions = [
        paperSuggestion ? `${paperLabel(paperSuggestion[0])} at 1:${scale}` : null,
        scaleSuggestion ? `${paperLabel(paperKey)} at 1:${scaleSuggestion}` : null,
      ].filter(Boolean).join(' or ')

      setFitWarning(
        `At 1:${scale}, this drawing is ${Math.ceil(fit.targetW)} x ${Math.ceil(fit.targetH)}mm but ${paperLabel(paperKey)} has ${fit.usableW} x ${fit.usableH}mm usable area. Use ${suggestions || 'larger paper or a bigger scale number'} for a true-scale PDF that fits.`,
      )
    })
    return () => cancelAnimationFrame(id)
  }, [show, layers, walls, cabinets, getFitInfo, paperKey, scale, tbH])

  async function handleDownload() {
    const svgEl = svgRef.current
    if (!svgEl) return
    useTutorial.getState().emit('plan_pdf')
    setBusy(true)
    try {
      const fit = getFitInfo()
      if (!fit) return
      const { paper, targetW, targetH, usableW, usableH, tb } = fit

      // True scale: vbW model mm renders into vbW/scale paper mm → exactly 1:scale.
      // Centre within the usable area; clamp to the margin if it overflows.
      const x = MARGIN + Math.max(0, (usableW - targetW) / 2)
      const y = MARGIN + Math.max(0, (usableH - targetH) / 2)

      const pdfSvg = svgEl.cloneNode(true) as SVGSVGElement
      pdfSvg.setAttribute('width', `${targetW}mm`)
      pdfSvg.setAttribute('height', `${targetH}mm`)
      pdfSvg.setAttribute('preserveAspectRatio', 'xMinYMin meet')

      const doc = new jsPDF({
        unit: 'mm',
        format: [paper.w, paper.h],
        orientation: paper.w >= paper.h ? 'landscape' : 'portrait',
      })
      await svg2pdf(pdfSvg, doc, { x, y, width: targetW, height: targetH })
      const tbSvg = tbRef.current?.querySelector('svg')
      if (tb && tbSvg) await svg2pdf(tbSvg, doc, { x: tb.x, y: tb.y, width: tb.w, height: tb.h })

      const safeRoom = room.name.replace(/[^\w-]/g, '_')
      doc.save(`plan-${safeRoom}-1-${scale}.pdf`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Layer toggle toolbar */}
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-800">
        <ReportLayerSetSelect sets={layerSets} value={layerSet} onChange={setLayerSetId} />
        <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">Page:</span>
        {TOGGLES.map(t => (
          <button key={t.key} onClick={() => setShow(s => ({ ...s, [t.key]: !s[t.key] }))}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              show[t.key]
                ? 'bg-blue-600/25 border-blue-600/50 text-blue-300'
                : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'
            }`}>
            {show[t.key] ? '☑' : '☐'} {t.label}
          </button>
        ))}
        <button data-tour="plan-download" onClick={handleDownload} disabled={busy || walls.length === 0}
          className="ml-auto px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors font-medium">
          {busy ? 'Generating…' : `Download PDF · 1:${scale}`}
        </button>
      </div>

      {fitWarning && (
        <div className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {fitWarning}
        </div>
      )}

      {/* Preview */}
      <div className="bg-white rounded overflow-hidden shadow-inner" style={{ minHeight: 300 }}>
        <PlanViewReportSVG
          walls={walls}
          cabinets={cabinets}
          fixtures={fixtures}
          annotations={annotations}
          resolvedParts={resolvedParts}
          svgRef={svgRef}
          scale={scale}
          layers={layers}
          show={show}
        />
        {show.titleBlock && (
          <div ref={tbRef} className="px-2 pb-2">
            <ShopTitleBlock company={company} sheet={sheetTitle(project, room, scale, 1, 1)}
              width={pageLayout(PAPER[paperKey] ?? PAPER.A3L, MARGIN, null).usableW} />
          </div>
        )}
      </div>
    </div>
  )
}
