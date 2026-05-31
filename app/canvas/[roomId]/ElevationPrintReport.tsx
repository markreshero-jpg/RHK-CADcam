// New elevation report — parallel to the existing `elevation_view`.
// One wall per page, true-scale PDF (jsPDF + svg2pdf.js), toggleable B&W layers
// persisted to localStorage. Scale + paper come from the modal (same as plan view).
'use client'
import { useState, useEffect, useRef } from 'react'
import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'
import type { Project, Room, Wall, CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import ElevationPrintSVG, { type ElevationLayers } from './ElevationPrintSVG'

const PAPER: Record<string, { w: number; h: number }> = {
  A4L: { w: 297, h: 210 }, A3L: { w: 420, h: 297 }, A2L: { w: 594, h: 420 }, A1L: { w: 841, h: 594 },
}
const MARGIN = 20
const LS_KEY = 'elevation-print-layers'
const DEFAULT_LAYERS: ElevationLayers = {
  labels: true, dimensions: true, faces: true, doorSwings: true, drawers: true,
  shelves: false, drawerBoxes: false, toekick: true, returnWalls: true, titleBlock: true,
}
const TOGGLES: { key: keyof ElevationLayers; label: string }[] = [
  { key: 'labels',      label: 'Labels' },
  { key: 'dimensions',  label: 'Dimensions' },
  { key: 'faces',       label: 'Faces' },
  { key: 'doorSwings',  label: 'Door Swings' },
  { key: 'drawers',     label: 'Drawers' },
  { key: 'shelves',     label: 'Shelves' },
  { key: 'drawerBoxes', label: 'Drawer Boxes' },
  { key: 'toekick',     label: 'Toe Kick' },
  { key: 'returnWalls', label: 'Return Walls' },
  { key: 'titleBlock',  label: 'Title Block' },
]

export default function ElevationPrintReport({ project, room, walls, cabinets, resolvedParts, scale, paperKey }: {
  project:       Project | null
  room:          Room
  walls:         Wall[]
  cabinets:      CabinetInstance[]
  resolvedParts: Map<string, ResolvedCabinet>
  scale:         number
  paperKey:      string
}) {
  const refs = useRef<Map<string, SVGSVGElement>>(new Map())
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState<ElevationLayers>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) return { ...DEFAULT_LAYERS, ...JSON.parse(raw) }
    } catch { /* ignore */ }
    return DEFAULT_LAYERS
  })
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(show)) } catch { /* ignore */ } }, [show])

  const standardWalls = walls.filter(w => w.wall_type === 'standard')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(standardWalls.map(w => w.id)))
  const toggleWall = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const visibleWalls = standardWalls.filter(w => selectedIds.has(w.id))
  const projectName = project?.name ?? 'Untitled Project'

  async function handleDownload() {
    if (visibleWalls.length === 0) return
    setBusy(true)
    try {
      const paper = PAPER[paperKey] ?? PAPER.A3L
      const usableW = paper.w - MARGIN * 2, usableH = paper.h - MARGIN * 2
      const doc = new jsPDF({ unit: 'mm', format: [paper.w, paper.h], orientation: paper.w >= paper.h ? 'landscape' : 'portrait' })
      let first = true
      for (const w of visibleWalls) {
        const svgEl = refs.current.get(w.id)
        if (!svgEl) continue
        if (!first) doc.addPage([paper.w, paper.h], paper.w >= paper.h ? 'landscape' : 'portrait')
        first = false
        const vbW = Number(svgEl.getAttribute('data-vb-w'))
        const vbH = Number(svgEl.getAttribute('data-vb-h'))
        const targetW = vbW / scale, targetH = vbH / scale
        const x = MARGIN + Math.max(0, (usableW - targetW) / 2)
        const y = MARGIN + Math.max(0, (usableH - targetH) / 2)
        await svg2pdf(svgEl, doc, { x, y, width: targetW, height: targetH })
      }
      const safeRoom = room.name.replace(/[^\w-]/g, '_')
      doc.save(`elevations-${safeRoom}-1-${scale}.pdf`)
    } finally {
      setBusy(false)
    }
  }

  if (standardWalls.length === 0) {
    return <div className="text-gray-500 text-center py-12 text-sm">No standard walls in this room.</div>
  }

  return (
    <div className="space-y-3">
      {/* Layer toggles */}
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-800">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">Layers:</span>
        {TOGGLES.map(t => (
          <button key={t.key} onClick={() => setShow(s => ({ ...s, [t.key]: !s[t.key] }))}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              show[t.key] ? 'bg-blue-600/25 border-blue-600/50 text-blue-300'
                          : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'
            }`}>
            {show[t.key] ? '☑' : '☐'} {t.label}
          </button>
        ))}
        <button onClick={handleDownload} disabled={busy || visibleWalls.length === 0}
          className="ml-auto px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors font-medium">
          {busy ? 'Generating…' : `Download PDF · 1:${scale}`}
        </button>
      </div>

      {/* Wall picker */}
      <div className="flex flex-wrap gap-2 pb-2 border-b border-gray-800">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider self-center mr-1">Walls:</span>
        {standardWalls.map(w => (
          <button key={w.id} onClick={() => toggleWall(w.id)}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              selectedIds.has(w.id) ? 'bg-blue-600/25 border-blue-600/50 text-blue-300'
                                    : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'
            }`}>
            {w.name}
          </button>
        ))}
        <button onClick={() => standardWalls.forEach(w => toggleWall(w.id))}
          className="px-2 py-0.5 rounded text-xs border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors ml-1">
          Toggle all
        </button>
      </div>

      {/* Previews — one per selected wall */}
      {visibleWalls.length === 0 ? (
        <div className="text-gray-500 text-center py-8 text-sm">No walls selected.</div>
      ) : visibleWalls.map(w => (
        <div key={w.id} className="bg-white rounded overflow-hidden shadow-inner">
          <ElevationPrintSVG
            wall={w}
            walls={walls}
            cabinets={cabinets}
            room={room}
            resolvedParts={resolvedParts}
            svgRef={el => { if (el) refs.current.set(w.id, el); else refs.current.delete(w.id) }}
            scale={scale}
            show={show}
            projectName={projectName}
            roomName={room.name}
            paperKey={paperKey}
          />
        </div>
      ))}
    </div>
  )
}
