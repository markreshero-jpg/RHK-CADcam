// Per-cabinet shop sheets — one page per cabinet (front + side + 3D + cut list + hardware + overrides).
// Front/side/3D reuse the modal geometry (B&W); the 3D is a vector line view (external
// parts opaque, internals dashed through). PDF = one svg2pdf call per page.
'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'
import { supabase } from '@/src/lib/supabase'
import type { Project, Room, Wall, CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet, SlideProduct, SlideScheduleEntry } from '@/src/lib/resolver/types'
import { dbLoadPartPosOverrides, dbLoadCustomParts, type PartPosOverrides, type CabinetCustomPart } from './canvasDB'
import CabinetSheetSVG, { type CabinetSheetLayers, type HardwareCfg } from './CabinetSheetSVG'

const PAPER: Record<string, { w: number; h: number }> = {
  A4L: { w: 297, h: 210 }, A3L: { w: 420, h: 297 }, A2L: { w: 594, h: 420 }, A1L: { w: 841, h: 594 },
}
const LS_KEY = 'cabinet-sheet-layers'
const DEFAULT_LAYERS: CabinetSheetLayers = { internals: true, dims: true, threeD: true }
const TOGGLES: { key: keyof CabinetSheetLayers; label: string }[] = [
  { key: 'internals', label: 'Internals' },
  { key: 'dims',      label: 'Dimensions' },
  { key: 'threeD',    label: '3D View' },
]

export default function CabinetSheetReport({ project, room, walls, cabinets, resolvedParts, materialNames, paperKey }: {
  project:       Project | null
  room:          Room
  walls:         Wall[]
  cabinets:      CabinetInstance[]
  resolvedParts: Map<string, ResolvedCabinet>
  materialNames: Record<string, string>
  paperKey:      string
}) {
  const refs = useRef<Map<string, SVGSVGElement>>(new Map())
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState<CabinetSheetLayers>(() => {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) return { ...DEFAULT_LAYERS, ...JSON.parse(raw) } } catch { /* ignore */ }
    return DEFAULT_LAYERS
  })
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(show)) } catch { /* ignore */ } }, [show])

  const sorted = useMemo(() => [...cabinets].sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '', undefined, { numeric: true })), [cabinets])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(sorted.map(c => c.id)))
  const toggleCab = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const visible = useMemo(() => sorted.filter(c => selectedIds.has(c.id)), [sorted, selectedIds])
  const visibleKey = visible.map(c => c.id).join(',')
  const projectName = project?.name ?? 'Untitled Project'

  // ── Per-cabinet overrides + custom parts (so views match the modal) ─────────
  const [overridesByCab, setOverridesByCab] = useState<Record<string, PartPosOverrides>>({})
  const [customByCab, setCustomByCab] = useState<Record<string, CabinetCustomPart[]>>({})
  useEffect(() => {
    let cancelled = false
    Promise.all(visible.map(async c => {
      const [ov, cp] = await Promise.all([dbLoadPartPosOverrides(c.id), dbLoadCustomParts(c.id)])
      return [c.id, ov, cp] as const
    })).then(results => {
      if (cancelled) return
      const o: Record<string, PartPosOverrides> = {}, cm: Record<string, CabinetCustomPart[]> = {}
      for (const [id, ov, cp] of results) { o[id] = ov; cm[id] = cp }
      setOverridesByCab(o); setCustomByCab(cm)
    })
    return () => { cancelled = true }
  }, [visibleKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effective hardware schedules (room → project → shop default) + joint names ─
  const [hardware, setHardware] = useState<HardwareCfg | null>(null)
  const [jointNames, setJointNames] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    async function load() {
      const [jt, slideDef, hingeDef, handleDef] = await Promise.all([
        supabase.from('joint_types').select('id, name'),
        supabase.from('slide_schedules').select('id').eq('is_default', true).limit(1).maybeSingle(),
        supabase.from('hinge_schedules').select('id').eq('is_default', true).limit(1).maybeSingle(),
        supabase.from('handle_schedules').select('id').eq('is_default', true).limit(1).maybeSingle(),
      ])
      const slideSchedId  = room.slide_schedule_id  ?? project?.slide_schedule_id  ?? slideDef.data?.id  ?? null
      const hingeSchedId  = room.hinge_schedule_id  ?? project?.hinge_schedule_id  ?? hingeDef.data?.id  ?? null
      const handleSchedId = room.handle_schedule_id ?? project?.handle_schedule_id ?? handleDef.data?.id ?? null
      const [slides, entries, hingeSched, handleSched] = await Promise.all([
        supabase.from('hardware_slides').select('id,name,brand,nominal_length,box_height,runner_thickness,side_deduction,min_runner_depth,max_runner_depth,soft_close,full_extension,cost_per_pair,colour').eq('active', true),
        slideSchedId  ? supabase.from('slide_schedule_entries').select('id,schedule_id,depth_threshold,height_threshold,slide_id').eq('schedule_id', slideSchedId) : Promise.resolve({ data: [] as SlideScheduleEntry[] }),
        hingeSchedId  ? supabase.from('hinge_schedules').select('hinge_id').eq('id', hingeSchedId).maybeSingle()   : Promise.resolve({ data: null as { hinge_id: string | null } | null }),
        handleSchedId ? supabase.from('handle_schedules').select('handle_id').eq('id', handleSchedId).maybeSingle() : Promise.resolve({ data: null as { handle_id: string | null } | null }),
      ])
      const hingeId  = (hingeSched.data as { hinge_id: string | null } | null)?.hinge_id ?? null
      const handleId = (handleSched.data as { handle_id: string | null } | null)?.handle_id ?? null
      const [hingeProd, handleProd] = await Promise.all([
        hingeId  ? supabase.from('hardware_hinges').select('name').eq('id', hingeId).maybeSingle()   : Promise.resolve({ data: null as { name: string } | null }),
        handleId ? supabase.from('hardware_handles').select('name').eq('id', handleId).maybeSingle() : Promise.resolve({ data: null as { name: string } | null }),
      ])
      if (cancelled) return
      setHardware({
        slideProducts: (slides.data ?? []) as SlideProduct[],
        slideEntries:  (entries.data ?? []) as SlideScheduleEntry[],
        hingeName:  (hingeProd.data as { name: string } | null)?.name ?? null,
        handleName: (handleProd.data as { name: string } | null)?.name ?? null,
      })
      setJointNames(Object.fromEntries(((jt.data ?? []) as { id: string; name: string }[]).map(j => [j.id, j.name])))
    }
    void load()
    return () => { cancelled = true }
  }, [room.id, project?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDownload() {
    if (visible.length === 0) return
    setBusy(true)
    try {
      const paper = PAPER[paperKey] ?? PAPER.A3L
      const doc = new jsPDF({ unit: 'mm', format: [paper.w, paper.h], orientation: paper.w >= paper.h ? 'landscape' : 'portrait' })
      let first = true
      for (const c of visible) {
        const svgEl = refs.current.get(c.id)
        if (!svgEl) continue
        if (!first) doc.addPage([paper.w, paper.h], paper.w >= paper.h ? 'landscape' : 'portrait')
        first = false
        await svg2pdf(svgEl, doc, { x: 0, y: 0, width: paper.w, height: paper.h })
      }
      const safeRoom = room.name.replace(/[^\w-]/g, '_')
      doc.save(`cabinet-sheets-${safeRoom}.pdf`)
    } finally {
      setBusy(false)
    }
  }

  if (sorted.length === 0) {
    return <div className="text-gray-500 text-center py-12 text-sm">No cabinets in this room.</div>
  }

  return (
    <div className="space-y-3">
      {/* Toggles */}
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-800">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">Show:</span>
        {TOGGLES.map(t => (
          <button key={t.key} onClick={() => setShow(s => ({ ...s, [t.key]: !s[t.key] }))}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              show[t.key] ? 'bg-blue-600/25 border-blue-600/50 text-blue-300'
                          : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'
            }`}>
            {show[t.key] ? '☑' : '☐'} {t.label}
          </button>
        ))}
        <button onClick={handleDownload} disabled={busy || visible.length === 0}
          className="ml-auto px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors font-medium">
          {busy ? 'Generating…' : `Download PDF · ${visible.length} ${visible.length === 1 ? 'page' : 'pages'}`}
        </button>
      </div>

      {/* Cabinet picker */}
      <div className="flex flex-wrap gap-2 pb-2 border-b border-gray-800">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider self-center mr-1">Cabinets:</span>
        {sorted.map(c => (
          <button key={c.id} onClick={() => toggleCab(c.id)}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              selectedIds.has(c.id) ? 'bg-blue-600/25 border-blue-600/50 text-blue-300'
                                    : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'
            }`}>
            {c.label ?? '—'}
          </button>
        ))}
        <button onClick={() => setSelectedIds(prev => prev.size === sorted.length ? new Set() : new Set(sorted.map(c => c.id)))}
          className="px-2 py-0.5 rounded text-xs border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors ml-1">
          Toggle all
        </button>
      </div>

      {/* Previews — one sheet per cabinet */}
      {visible.length === 0 ? (
        <div className="text-gray-500 text-center py-8 text-sm">No cabinets selected.</div>
      ) : visible.map(c => (
        <div key={c.id} className="bg-white rounded overflow-hidden shadow-inner">
          <CabinetSheetSVG
            cab={c}
            rp={resolvedParts.get(c.id)}
            wall={walls.find(w => w.id === c.wall_id) ?? null}
            projectName={projectName}
            roomName={room.name}
            materialNames={materialNames}
            paperKey={paperKey}
            svgRef={el => { if (el) refs.current.set(c.id, el); else refs.current.delete(c.id) }}
            show={show}
            partOverrides={overridesByCab[c.id]}
            customParts={customByCab[c.id]}
            hardware={hardware ?? undefined}
            jointNames={jointNames}
          />
        </div>
      ))}
    </div>
  )
}
