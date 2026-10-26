// 3D colour render report (trial, Mark 2026-10-24). The shop drawings' 3D views
// (auto + saved shots, blockers hidden) rendered in the room's material colours
// and placed one per page as a picture. Not to scale. If it works out, its pages
// move into the other reports.
'use client'
import { useState, useEffect, useRef, useMemo, type ComponentProps } from 'react'
import { svg2pdf } from 'svg2pdf.js'
import { reportDoc, saveReport } from './pdfCombine'
import type { Project, Room, Wall, CabinetInstance, RoomFixture, BenchtopInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { LayerSet } from '@/src/lib/displayLayers/registry'
import { resolveLayerView } from '@/src/lib/displayLayers/resolve'
import { useCompanyTitle } from '@/src/lib/shopDrawings/companyTitle'
import { autoShots } from '@/src/lib/shopDrawings/shots3d'
import { useReportLayerSet, ReportLayerSetSelect } from './ReportLayerSetPicker'
import ShopTitleBlock, { SheetHeading, HEADING_H, sheetTitle, pageLayout, titleBlockHeight } from './ShopTitleBlock'
import { useBatchDownload } from './useBatchDownload'
import { Room3DRender, type Bt3DPrint } from './Room3DCapture'
import type { RoomScene } from './Room3DScene'

const PAPER: Record<string, { w: number; h: number; label: string }> = {
  A4L: { w: 297, h: 210, label: 'A4' }, A3L: { w: 420, h: 297, label: 'A3' },
  A2L: { w: 594, h: 420, label: 'A2' }, A1L: { w: 841, h: 594, label: 'A1' },
}
const MARGIN = 10
/** Render width in pixels; the height follows the page's picture band. */
const RENDER_W = 2400
const LS_OFF = 'render-3d-off'

export default function Render3DReport({ project, room, walls, cabinets, resolvedParts, fixtures, benchtops, bt3d, materialColours, ebByMatId, layerSets, activeLayerSetId, paperKey, batch }: {
  project: Project | null
  room: Room
  walls: Wall[]
  cabinets: CabinetInstance[]
  /** Already filtered for the 3D view (hidden / removed parts out). */
  resolvedParts: Map<string, ResolvedCabinet>
  fixtures: RoomFixture[]
  benchtops: BenchtopInstance[]
  bt3d?: Omit<Bt3DPrint, 'benchtops'>
  materialColours?: ComponentProps<typeof RoomScene>['materialColours']
  ebByMatId?: ComponentProps<typeof RoomScene>['ebByMatId']
  layerSets: LayerSet[]
  activeLayerSetId: string | null
  paperKey: string
  batch?: () => void
}) {
  const company = useCompanyTitle()
  const paper = PAPER[paperKey] ?? PAPER.A3L
  const layout = pageLayout(paper, MARGIN, titleBlockHeight(company), HEADING_H)
  const renderH = Math.round(RENDER_W * layout.usableH / layout.usableW)

  const [set, setSetId] = useReportLayerSet('render-3d-layer-set', layerSets, activeLayerSetId)
  const layers = useMemo(() => resolveLayerView(set, '3d'), [set])

  // Same views as the shop drawings: auto (each run, islands both sides) + saved.
  const allShots = useMemo(() => [
    ...autoShots(walls, cabinets, room.room_dy ?? 2400),
    ...(room.shop_3d_shots ?? []).map(s => ({ ...s, saved: true })),
  ], [walls, cabinets, room.room_dy, room.shop_3d_shots])
  const [off, setOff] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_OFF) ?? '{}')[room.id]
      if (Array.isArray(saved)) return new Set(saved as string[])
    } catch { /* ignore */ }
    return new Set()
  })
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(LS_OFF) ?? '{}')
      localStorage.setItem(LS_OFF, JSON.stringify({ ...all, [room.id]: [...off] }))
    } catch { /* storage unavailable */ }
  }, [off, room.id])
  const shots = allShots.filter(s => !off.has(s.id))

  // Rendered pictures by shot id; cleared (re-rendered) on layer set / paper change.
  const [images, setImages] = useState<Record<string, string>>({})
  const [run, setRun] = useState(0)
  const rerender = () => { setImages({}); setRun(n => n + 1) }
  const firstPaper = useRef(paperKey)
  useEffect(() => { if (firstPaper.current !== paperKey) { firstPaper.current = paperKey; rerender() } }, [paperKey])
  const pending = shots.filter(s => !images[s.id])
  const done = pending.length === 0

  const pageRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [busy, setBusy] = useState(false)
  async function handleDownload() {
    if (!shots.length || !done) return
    setBusy(true)
    try {
      const orientation = paper.w >= paper.h ? 'landscape' : 'portrait'
      const doc = reportDoc(paper.w, paper.h)
      for (let i = 0; i < shots.length; i++) {
        const s = shots[i]
        const page = pageRefs.current.get(s.id)
        if (!page) continue
        if (i > 0) doc.addPage([paper.w, paper.h], orientation)
        const heading = page.querySelector<SVGSVGElement>('[data-role="heading"] svg')
        if (heading) await svg2pdf(heading, doc, { x: MARGIN, y: MARGIN, width: layout.usableW, height: HEADING_H })
        doc.addImage(images[s.id], 'JPEG', MARGIN, layout.top, layout.usableW, layout.usableH, undefined, 'FAST')
        const tb = page.querySelector<SVGSVGElement>('[data-role="title-block"] svg')
        if (tb && layout.tb) await svg2pdf(tb, doc, { x: layout.tb.x, y: layout.tb.y, width: layout.tb.w, height: layout.tb.h })
      }
      const safe = (t: string) => t.replace(/[^\w-]+/g, '_')
      saveReport(doc, `3d-render-${safe(project?.job_number || project?.name || 'job')}-${safe(room.name)}.pdf`)
    } finally {
      setBusy(false)
    }
  }
  useBatchDownload(batch, shots.length === 0 || done, handleDownload)

  const pct = (mm: number, of: number) => `${(mm / of) * 100}%`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-800">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">3D</span>
        <ReportLayerSetSelect sets={layerSets} value={set} onChange={id => { setSetId(id); rerender() }} />
        <button onClick={rerender} disabled={!done}
          title="Render the views again (after changing the room)"
          className="ml-auto px-2 py-1 text-xs border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-50 rounded">
          {done ? 'Re-render' : `Rendering ${shots.length - pending.length + 1} of ${shots.length}…`}
        </button>
        <button onClick={handleDownload} disabled={busy || !shots.length || !done}
          className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors font-medium">
          {busy ? 'Generating…' : `Download PDF · ${shots.length} page${shots.length === 1 ? '' : 's'} · ${paper.label}`}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-800">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1"
          title="Saved views: right-click empty space in the 3D view → Save view for shop drawings">Views:</span>
        {allShots.map(s => (
          <button key={s.id} onClick={() => setOff(prev => {
            const next = new Set(prev)
            if (next.has(s.id)) next.delete(s.id); else next.add(s.id)
            return next
          })}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              !off.has(s.id) ? 'bg-blue-600/25 border-blue-600/50 text-blue-300'
                             : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'
            }`}>
            {!off.has(s.id) ? '☑' : '☐'} {s.label}{s.saved ? ' (saved)' : ''}
          </button>
        ))}
      </div>

      {shots.length === 0 && <div className="text-gray-500 text-center py-8 text-sm">No views ticked.</div>}

      {shots.map((s, i) => (
        <div key={s.id} ref={el => { if (el) pageRefs.current.set(s.id, el); else pageRefs.current.delete(s.id) }}
          className="relative bg-white rounded overflow-hidden shadow-inner" style={{ aspectRatio: `${paper.w} / ${paper.h}` }}>
          <div data-role="heading" className="absolute" style={{ left: pct(MARGIN, paper.w), top: pct(MARGIN, paper.h), width: pct(layout.usableW, paper.w) }}>
            <SheetHeading title={`${room.name} 3D · ${s.label}`} scale="NTS" width={layout.usableW} />
          </div>
          <div className="absolute flex items-center justify-center"
            style={{ left: pct(MARGIN, paper.w), top: pct(layout.top, paper.h), width: pct(layout.usableW, paper.w), height: pct(layout.usableH, paper.h) }}>
            {images[s.id]
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={images[s.id]} alt={s.label} className="w-full h-full object-contain" />
              : <span className="text-gray-400 text-xs">Rendering {s.label}…</span>}
          </div>
          {layout.tb && (
            <div data-role="title-block" className="absolute" style={{ left: pct(layout.tb.x, paper.w), top: pct(layout.tb.y, paper.h), width: pct(layout.tb.w, paper.w) }}>
              <ShopTitleBlock company={company} sheet={sheetTitle(project, room, 'NTS', i + 1, shots.length)} width={layout.tb.w} />
            </div>
          )}
        </div>
      ))}

      {!done && (
        <Room3DRender key={run} shots={pending} width={RENDER_W} height={renderH}
          walls={walls} cabinets={cabinets} room={room} resolvedParts={resolvedParts} layers={layers}
          fixtures={fixtures} bt={bt3d && { ...bt3d, benchtops }}
          materialColours={materialColours} ebByMatId={ebByMatId}
          onCaptured={(id, url) => setImages(prev => ({ ...prev, [id]: url }))} />
      )}
    </div>
  )
}
