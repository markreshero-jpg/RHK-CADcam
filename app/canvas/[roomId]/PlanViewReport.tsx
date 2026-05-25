// New plan-view report — parallel to the existing `shop_drawing_plan`.
// Toggleable SVG layers (persisted to localStorage) + true-scale PDF export
// via jsPDF + svg2pdf.js. The SVG viewBox stays in model mm; svg2pdf renders it
// into a paper-mm box of size vbW/scale × vbH/scale, giving a true 1:scale plot.
'use client'
import { useState, useEffect, useRef } from 'react'
import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'
import type { Project, Room, Wall, CabinetInstance } from '@/src/lib/types'
import PlanViewReportSVG, { type PlanViewLayers } from './PlanViewReportSVG'

const PAPER: Record<string, { w: number; h: number }> = {
  A4L: { w: 297, h: 210 },
  A3L: { w: 420, h: 297 },
  A2L: { w: 594, h: 420 },
  A1L: { w: 841, h: 594 },
}

const MARGIN = 20   // mm — usable-area margin on all sides
const LS_KEY = 'plan-view-layers'
const DEFAULT_LAYERS: PlanViewLayers = {
  labels: true, dimensions: true, doorSwings: true, drawers: true, hatch: true, titleBlock: true,
}

const TOGGLES: { key: keyof PlanViewLayers; label: string }[] = [
  { key: 'labels',     label: 'Labels' },
  { key: 'dimensions', label: 'Dimensions' },
  { key: 'doorSwings', label: 'Door Swings' },
  { key: 'drawers',    label: 'Drawers' },
  { key: 'hatch',      label: 'Wall Hatch' },
  { key: 'titleBlock', label: 'Title Block' },
]

export default function PlanViewReport({ project, room, walls, cabinets, scale, paperKey }: {
  project:  Project | null
  room:     Room
  walls:    Wall[]
  cabinets: CabinetInstance[]
  scale:    number
  paperKey: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  // Modal only mounts on user action (never SSR'd), so reading localStorage in the
  // initializer is safe — no hydration mismatch.
  const [show, setShow] = useState<PlanViewLayers>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) return { ...DEFAULT_LAYERS, ...JSON.parse(raw) }
    } catch { /* ignore malformed storage */ }
    return DEFAULT_LAYERS
  })
  const [busy, setBusy] = useState(false)

  // Persist on every change.
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(show)) } catch { /* storage unavailable */ }
  }, [show])

  const projectName = project?.name ?? 'Untitled Project'

  async function handleDownload() {
    const svgEl = svgRef.current
    if (!svgEl) return
    setBusy(true)
    try {
      const paper = PAPER[paperKey] ?? PAPER.A3L
      const vbW = Number(svgEl.getAttribute('data-vb-w'))
      const vbH = Number(svgEl.getAttribute('data-vb-h'))

      // True scale: vbW model mm renders into vbW/scale paper mm → exactly 1:scale.
      const targetW = vbW / scale
      const targetH = vbH / scale

      // Centre within the usable area; clamp to the margin if it overflows.
      const usableW = paper.w - MARGIN * 2
      const usableH = paper.h - MARGIN * 2
      const x = MARGIN + Math.max(0, (usableW - targetW) / 2)
      const y = MARGIN + Math.max(0, (usableH - targetH) / 2)

      const doc = new jsPDF({
        unit: 'mm',
        format: [paper.w, paper.h],
        orientation: paper.w >= paper.h ? 'landscape' : 'portrait',
      })
      await svg2pdf(svgEl, doc, { x, y, width: targetW, height: targetH })

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
        <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">Layers:</span>
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
        <button onClick={handleDownload} disabled={busy || walls.length === 0}
          className="ml-auto px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors font-medium">
          {busy ? 'Generating…' : `Download PDF · 1:${scale}`}
        </button>
      </div>

      {/* Preview */}
      <div className="bg-white rounded overflow-hidden shadow-inner" style={{ minHeight: 300 }}>
        <PlanViewReportSVG
          walls={walls}
          cabinets={cabinets}
          svgRef={svgRef}
          scale={scale}
          show={show}
          projectName={projectName}
          roomName={room.name}
          paperKey={paperKey}
        />
      </div>
    </div>
  )
}
