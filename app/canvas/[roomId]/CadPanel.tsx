'use client'

// CAD side panel (z_CAD_tool B2c) — docked right while F7 CAD mode is on (plan).
// Cursor position, the shape being drawn point by point, every number of the selected
// item (typed values commit on Enter / leaving the field), and a list of the room's
// notes and markup to pick from. All values are room mm unless marked paper mm.

import React, { useEffect, useRef, useState } from 'react'
import type { RoomAnnotation } from '@/src/lib/types'
import {
  type Pt, type LineGeom, type BoxGeom, type TextGeom, type DimGeom, type ArcGeom, type CircleGeom,
  arcStart, arcEnd, arcLength, sweepOf, bulgeSegLength, sampleBulged,
  isSpecialDim, specialDimText, specialDimValue,
  segLength, segAngle, dimLayout, dimText, boundsOf, annotationFramePoints,
} from '@/src/lib/annotations/geometry'
import { resolveStyle } from '@/src/lib/annotations/style'
import type { AnnotationTool, TypedField } from './useAnnotationTool'

const TYPED_LABEL: Record<TypedField, [string, string]> = {
  length: ['Length', 'mm'], angle: ['Angle', '°'], w: ['W', 'mm'], h: ['H', 'mm'], offset: ['Offset', 'mm'],
  radius: ['Radius', 'mm'], sweep: ['Sweep', '°'], distance: ['Distance', 'mm'],
}

/** Typed sizes while drawing: Tab from the canvas lands here; Tab cycles the fields,
 *  Enter places the point / shape, Esc clears. Blank = follow the cursor. */
function TypedEntryFields({ cad }: { cad: AnnotationTool }) {
  const refs = useRef<Partial<Record<TypedField, HTMLInputElement | null>>>({})
  const [drafts, setDrafts] = useState<Partial<Record<TypedField, string>>>({})
  const fields = cad.typedFields

  // Focus requests from the canvas (Tab, or a digit that seeds the field).
  const req = cad.focusReq
  useEffect(() => {
    if (!req) return
    const el = refs.current[req.field]
    if (!el) return
    el.focus()
    if (req.seed != null) {
      const n = parseFloat(req.seed)
      cad.setTyped(req.field, Number.isFinite(n) ? n : undefined)
      requestAnimationFrame(() => { el.value = req.seed!; el.setSelectionRange(1, 1) })
    } else el.select()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.n])

  // Live values (placeholders) for what the cursor is doing now.
  const lm = cad.liveMeasure
  const live: Partial<Record<TypedField, number>> = {}
  if (lm?.mode === 'seg') { live.length = segLength(lm.a, lm.b); live.angle = segAngle(lm.a, lm.b) }
  if (lm?.mode === 'box') { live.w = Math.abs(lm.b.x - lm.a.x); live.h = Math.abs(lm.b.y - lm.a.y) }
  const prev = cad.drawPreview
  if (prev?.kind === 'dim') live.offset = Math.abs((prev.geom as DimGeom).offset)
  if (cad.offsetSrc && lm?.mode === 'label') live.distance = parseFloat(lm.text.replace(/[^0-9.]/g, ''))
  if (prev?.kind === 'circle') live.radius = (prev.geom as CircleGeom).r
  if (prev?.kind === 'arc') { live.radius = (prev.geom as ArcGeom).r; live.sweep = sweepOf((prev.geom as ArcGeom).a0, (prev.geom as ArcGeom).a1) }

  if (!fields.length) return null
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {fields.map((f, i) => {
        const t = cad.typed[f]
        const draft = drafts[f]
        const shown = t != null ? (draft ?? String(t)) : draft && !Number.isFinite(parseFloat(draft)) ? draft : ''
        return (
          <label key={f} className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400 w-12">{TYPED_LABEL[f][0]}</span>
            <input ref={el => { refs.current[f] = el }} value={shown} inputMode="decimal"
              placeholder={live[f] != null ? r1(live[f]!) : 'cursor'}
              onChange={e => {
                const v = e.target.value
                setDrafts(d => ({ ...d, [f]: v }))
                const n = parseFloat(v)
                cad.setTyped(f, v.trim() && Number.isFinite(n) ? n : undefined)
              }}
              onKeyDown={e => {
                if (e.key === 'Tab') {
                  e.preventDefault()
                  const next = fields[(i + (e.shiftKey ? fields.length - 1 : 1)) % fields.length]
                  refs.current[next]?.focus(); refs.current[next]?.select()
                } else if (e.key === 'Enter') {
                  e.preventDefault(); setDrafts({}); cad.commitTyped(); (e.target as HTMLInputElement).blur()
                } else if (e.key === 'Escape') {
                  e.preventDefault(); e.stopPropagation(); setDrafts({}); cad.clearTyped(); (e.target as HTMLInputElement).blur()
                }
              }}
              className={`w-24 h-7 bg-gray-800 border rounded px-1.5 text-sm font-mono outline-none ${t != null ? 'border-yellow-500 text-yellow-200' : 'border-gray-700 text-gray-100'} focus:border-rose-500`} />
            <span className="text-[10px] text-gray-500">{TYPED_LABEL[f][1]}</span>
            {t != null && <span className="text-[10px] text-yellow-400">locked</span>}
          </label>
        )
      })}
      <div className="text-[11px] text-gray-500">Tab = next field · Enter = place · Esc = clear · blank follows the cursor</div>
    </div>
  )
}

const rScale = (n: number) => String(Math.round(n))
const r1 = (n: number) => String(Math.round(n * 10) / 10)

const KIND_LABEL: Record<string, string> = {
  text: 'Text', line: 'Line', rect: 'Box', ellipse: 'Ellipse', cloud: 'Cloud', dim: 'Dimension', arc: 'Arc', circle: 'Circle',
}

function polyArea(pts: Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y }
  return Math.abs(a) / 2
}
/** Length round a polyline; bulged sides (fillets) count their arc length. */
const polyLen = (pts: Pt[], closed: boolean, bulges?: number[]) =>
  pts.reduce((s, p, i) => (i === pts.length - 1 && !closed) ? s : s + bulgeSegLength(p, pts[(i + 1) % pts.length], bulges?.[i] ?? 0), 0)

/** A number field that commits on Enter or blur (Esc reverts) — one undo step per edit. */
function Field({ label, value, onCommit, suffix, w = 'w-20', disabled }: {
  label?: string; value: number; onCommit?: (n: number) => void; suffix?: string; w?: string; disabled?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? r1(value)
  const commit = () => {
    if (draft == null) return
    const n = parseFloat(draft)
    setDraft(null)
    if (Number.isFinite(n) && onCommit && Math.abs(n - value) > 1e-9) onCommit(n)
  }
  return (
    <label className="flex items-center gap-1 min-w-0">
      {label && <span className="text-[10px] text-gray-500 w-4 shrink-0">{label}</span>}
      <input value={shown} disabled={disabled || !onCommit} inputMode="decimal"
        onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur() }
          if (e.key === 'Escape') { e.stopPropagation(); setDraft(null) }
        }}
        className={`${w} h-6 bg-gray-800 border border-gray-700 rounded px-1.5 text-xs text-gray-100 font-mono outline-none focus:border-rose-500 disabled:text-gray-400 disabled:bg-gray-850`} />
      {suffix && <span className="text-[10px] text-gray-500">{suffix}</span>}
    </label>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-xs">
      <span className="text-gray-500">{k}</span>
      <span className="text-gray-200 font-mono">{v}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5 border-b border-gray-800">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">{title}</div>
      {children}
    </div>
  )
}

/** Point table: # · X · Y (editable) · length of the side leaving it. */
function PointTable({ pts, closed, onPoint, bulges }: { pts: Pt[]; closed: boolean; onPoint?: (i: number, p: Pt) => void; bulges?: number[] }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[1.25rem_1fr_1fr_3.5rem] gap-1 text-[10px] text-gray-500">
        <span>#</span><span>X</span><span>Y</span><span className="text-right">side</span>
      </div>
      {pts.map((p, i) => {
        const next = i < pts.length - 1 ? pts[i + 1] : closed ? pts[0] : null
        return (
          <div key={i} className="grid grid-cols-[1.25rem_1fr_1fr_3.5rem] gap-1 items-center">
            <span className="text-[10px] text-gray-500">{i + 1}</span>
            <Field value={p.x} w="w-full" onCommit={onPoint && (n => onPoint(i, { x: n, y: p.y }))} />
            <Field value={p.y} w="w-full" onCommit={onPoint && (n => onPoint(i, { x: p.x, y: n }))} />
            <span className="text-[11px] text-gray-300 font-mono text-right" title={bulges?.[i] ? 'Arc (fillet) — length along the arc' : undefined}>
              {next ? `${bulges?.[i] ? '⌒' : ''}${r1(bulgeSegLength(p, next, bulges?.[i] ?? 0))}` : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function summary(a: RoomAnnotation, k: number): string {
  switch (a.kind) {
    case 'line':  { const g = a.geom as LineGeom; return `${r1(polyLen(g.pts ?? [], !!g.closed, g.bulges))} mm${g.closed ? ' round' : ''}` }
    case 'cloud': { const p = (a.geom as LineGeom).pts ?? []; return `${r1(polyLen(p, true))} mm round` }
    case 'rect':
    case 'ellipse': { const g = a.geom as BoxGeom; return `${r1(Math.abs(g.b.x - g.a.x))} × ${r1(Math.abs(g.b.y - g.a.y))}` }
    case 'dim':   {
      if (isSpecialDim(a.geom)) return specialDimText(a.geom, a.text)
      const g = a.geom as DimGeom; return g?.p1 && g?.p2 ? dimText(dimLayout(g).value, a.text) : ''
    }
    case 'text':  { const t = (a.text ?? '').split('\n')[0]; void k; return t.length > 22 ? t.slice(0, 22) + '…' : t || '(empty)' }
    case 'arc':   { const g = a.geom as ArcGeom; return g?.c ? `R${r1(g.r)} · ${r1(sweepOf(g.a0, g.a1))}°` : '' }
    case 'circle': { const g = a.geom as CircleGeom; return g?.c ? `Ø${r1(g.r * 2)}` : '' }
  }
}

export default function CadPanel({ cad, annotations, paper, onClose }: {
  cad:         AnnotationTool
  /** Plan annotations (the list to pick from). */
  annotations: RoomAnnotation[]
  /** frame mm per paper mm (text block sizes). */
  paper:       number
  onClose:     () => void
}) {
  const sel = cad.selected
  const one = !cad.editing && sel.length === 1 ? sel[0] : null
  const c = cad.cursor, from = cad.fromPt
  const d = cad.drawing

  return (
    <div data-cad-panel className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto shrink-0" onPointerDown={e => e.stopPropagation()}>
      <div className="px-3 py-2.5 border-b border-gray-800 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-rose-300">CAD</div>
          <div className="text-[11px] text-gray-500">Room mm · Y runs down the plan</div>
        </div>
        <button onClick={onClose} title="Close CAD (F7)" className="text-gray-500 hover:text-white text-lg leading-none px-1">×</button>
      </div>

      <Section title="Cursor">
        <div className="grid grid-cols-2 gap-x-3">
          <Row k="X" v={c ? r1(c.x) : '—'} />
          <Row k="Y" v={c ? r1(c.y) : '—'} />
          {from && c && (<>
            <Row k="ΔX" v={r1(c.x - from.x)} />
            <Row k="ΔY" v={r1(c.y - from.y)} />
            <Row k="Dist" v={r1(segLength(from, c))} />
            <Row k="Angle" v={`${r1(segAngle(from, c))}°`} />
          </>)}
        </div>
        {cad.snapHit && <div className="mt-1 text-[11px] text-yellow-300">Snapped: {cad.snapHit.kind}</div>}
      </Section>

      {cad.tool === 'offset' && (
        <Section title="Offset">
          <div className="text-xs text-gray-400">{cad.offsetSrc
            ? 'Move to the side you want, then click to place the copy. Tab = type the distance. It carries on from the new copy; Esc to pick another.'
            : 'Click a line, cloud, box, ellipse, circle or arc to offset it.'}</div>
          <TypedEntryFields cad={cad} />
        </Section>
      )}

      {(d || cad.pending) && (
        <Section title={d ? `Drawing — ${d.tool === 'dim' ? 'dimension' : d.tool}` : 'Placing'}>
          {d && d.pts.length > 0 && (<>
            <PointTable pts={d.cur && d.tool !== 'leader' ? [...d.pts, d.cur] : d.pts} closed={false} />
            <div className="mt-1.5 text-[11px] text-gray-500">The last row follows the cursor. Press Tab to type a size.</div>
          </>)}
          <TypedEntryFields cad={cad} />
          {cad.pending && c && (<>
            <Row k="Corner" v={`${r1(cad.pending.start.x)}, ${r1(cad.pending.start.y)}`} />
            <Row k="W × H" v={`${r1(Math.abs(c.x - cad.pending.start.x))} × ${r1(Math.abs(c.y - cad.pending.start.y))}`} />
          </>)}
        </Section>
      )}

      <Section title={one ? `Selected — ${KIND_LABEL[one.kind]}` : sel.length > 1 ? `${sel.length} selected` : 'Selection'}>
        {!sel.length && !cad.editing && <div className="text-xs text-gray-500">Nothing selected. Click a note or line, drag a box round several, or pick a tool on the ribbon.</div>}
        {cad.editing && <div className="text-xs text-gray-400">Typing text… click away or Ctrl+Enter to finish.</div>}
        {sel.length > 1 && !cad.editing && <MultiInfo sel={sel} k={paper} />}
        {one && <SelectedInfo a={one} cad={cad} k={paper} />}
      </Section>

      <Section title={`Objects (${annotations.length})`}>
        {!annotations.length && <div className="text-xs text-gray-500">No notes or markup in this room yet.</div>}
        <div className="flex flex-col">
          {[...annotations].sort((x, y) => y.sort_order - x.sort_order).map(a => (
            <button key={a.id} onClick={() => cad.setSelectedIds(new Set([a.id]))}
              className={`flex items-center justify-between gap-2 px-1.5 py-1 rounded text-left text-xs ${cad.selectedIds.has(a.id) ? 'bg-rose-600/30 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: resolveStyle(a.kind, a.style).color }} />
                <span className="shrink-0">{KIND_LABEL[a.kind]}</span>
              </span>
              <span className="text-gray-500 font-mono truncate">{summary(a, paper)}</span>
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}

function MultiInfo({ sel, k }: { sel: RoomAnnotation[]; k: number }) {
  const b = boundsOf(sel.flatMap(a => annotationFramePoints(a.kind, a.geom, a.text, resolveStyle(a.kind, a.style).size, k)))
  if (!b) return null
  return <>
    <Row k="Extents X" v={`${r1(b.minX)} → ${r1(b.maxX)}`} />
    <Row k="Extents Y" v={`${r1(b.minY)} → ${r1(b.maxY)}`} />
    <Row k="W × H" v={`${r1(b.maxX - b.minX)} × ${r1(b.maxY - b.minY)}`} />
  </>
}

function SelectedInfo({ a, cad, k }: { a: RoomAnnotation; cad: AnnotationTool; k: number }) {
  const set = (geom: RoomAnnotation['geom']) => cad.patchGeom(a.id, geom)
  switch (a.kind) {
    case 'line':
    case 'cloud': {
      const g = a.geom as LineGeom, pts = g.pts ?? [], closed = a.kind === 'cloud' || !!g.closed
      return <>
        <PointTable pts={pts} closed={closed} bulges={g.bulges} onPoint={(i, p) => set({ ...g, pts: pts.map((q, j) => j === i ? p : q) })} />
        <div className="mt-2">
          <Row k={closed ? 'Perimeter' : 'Total length'} v={`${r1(polyLen(pts, closed, g.bulges))} mm`} />
          {closed && <Row k="Area" v={`${r1(polyArea(sampleBulged(pts, g.bulges, true)) / 1e6)} m²`} />}
          {!closed && pts.length >= 2 && <Row k="Angle (first side)" v={`${r1(segAngle(pts[0], pts[1]))}°`} />}
        </div>
        {cad.ribbonSize?.kind === 'line' && (
          <div className="mt-2 flex items-center gap-3">
            <Field label="L" value={cad.ribbonSize.length} onCommit={cad.applyLength} suffix="mm" w="w-16" />
            <Field label="∠" value={cad.ribbonSize.angle} onCommit={cad.applyAngle} suffix="°" w="w-14" />
          </div>
        )}
      </>
    }
    case 'rect':
    case 'ellipse': {
      const g = a.geom as BoxGeom
      const w = Math.abs(g.b.x - g.a.x), h = Math.abs(g.b.y - g.a.y)
      const sx = g.b.x >= g.a.x ? 1 : -1, sy = g.b.y >= g.a.y ? 1 : -1
      const moveA = (p: Pt) => set({ ...g, a: p, b: { x: p.x + (g.b.x - g.a.x), y: p.y + (g.b.y - g.a.y) } })
      return <>
        <div className="text-[10px] text-gray-500 mb-1">First corner</div>
        <div className="flex gap-2"><Field label="X" value={g.a.x} onCommit={n => moveA({ x: n, y: g.a.y })} /><Field label="Y" value={g.a.y} onCommit={n => moveA({ x: g.a.x, y: n })} /></div>
        <div className="flex gap-2 mt-1.5">
          <Field label="W" value={w} onCommit={n => n > 0 && set({ ...g, b: { x: g.a.x + sx * n, y: g.b.y } })} />
          <Field label="H" value={h} onCommit={n => n > 0 && set({ ...g, b: { x: g.b.x, y: g.a.y + sy * n } })} />
        </div>
        <div className="flex gap-2 mt-1.5"><Field label="∠" value={g.rot ?? 0} onCommit={n => set({ ...g, rot: ((n % 360) + 360) % 360 })} suffix="°" w="w-16" /></div>
        <div className="mt-2">
          <Row k="Centre" v={`${r1((g.a.x + g.b.x) / 2)}, ${r1((g.a.y + g.b.y) / 2)}`} />
          <Row k="Area" v={`${r1((a.kind === 'rect' ? w * h : Math.PI * w * h / 4) / 1e6)} m²`} />
        </div>
      </>
    }
    case 'text': {
      const g = a.geom as TextGeom
      return <>
        <div className="text-[10px] text-gray-500 mb-1">Top-left</div>
        <div className="flex gap-2"><Field label="X" value={g.at.x} onCommit={n => set({ ...g, at: { x: n, y: g.at.y } })} /><Field label="Y" value={g.at.y} onCommit={n => set({ ...g, at: { x: g.at.x, y: n } })} /></div>
        <div className="flex gap-2 mt-1.5"><Field label="∠" value={g.rot ?? 0} onCommit={n => set({ ...g, rot: ((n % 360) + 360) % 360 })} suffix="°" w="w-16" /></div>
        {g.width != null && (<>
          <div className="text-[10px] text-gray-500 mt-2 mb-1">Text box (paper mm)</div>
          <div className="flex gap-2">
            <Field label="W" value={g.width} onCommit={n => n >= 8 && set({ ...g, width: n })} w="w-16" />
            <Field label="H" value={g.height ?? 0} onCommit={n => set({ ...g, height: n > 0 ? n : undefined })} w="w-16" />
          </div>
          <div className="mt-1 text-[11px] text-gray-500">= {r1(g.width * k)} × {r1((g.height ?? 0) * k)} mm on the plan at 1:{rScale(k)}</div>
        </>)}
        {g.leader?.length ? (<>
          <div className="text-[10px] text-gray-500 mt-2 mb-1">Leader (point 1 = arrow tip)</div>
          <PointTable pts={g.leader} closed={false} onPoint={(i, p) => set({ ...g, leader: g.leader!.map((q, j) => j === i ? p : q) })} />
        </>) : null}
      </>
    }
    case 'arc': {
      // Shown the drawing way: 0° = right, the arc runs anticlockwise From → To.
      const g = a.geom as ArcGeom
      if (!g?.c) return null
      const conv = (svg: number) => ((-svg % 360) + 360) % 360
      return <>
        <div className="text-[10px] text-gray-500 mb-1">Centre</div>
        <div className="flex gap-2"><Field label="X" value={g.c.x} onCommit={n => set({ ...g, c: { x: n, y: g.c.y } })} /><Field label="Y" value={g.c.y} onCommit={n => set({ ...g, c: { x: g.c.x, y: n } })} /></div>
        <div className="flex gap-2 mt-1.5"><Field label="R" value={g.r} onCommit={n => n > 0 && set({ ...g, r: n })} suffix="mm" w="w-16" /></div>
        <div className="flex gap-2 mt-1.5">
          <Field label="↶" value={conv(g.a1)} onCommit={n => set({ ...g, a1: -n })} suffix="° from" w="w-14" />
          <Field label="→" value={conv(g.a0)} onCommit={n => set({ ...g, a0: -n })} suffix="° to" w="w-14" />
        </div>
        <div className="mt-2">
          <Row k="Sweep" v={`${r1(sweepOf(g.a0, g.a1))}°`} />
          <Row k="Arc length" v={`${r1(arcLength(g))} mm`} />
          <Row k="Chord" v={`${r1(segLength(arcStart(g), arcEnd(g)))} mm`} />
        </div>
        <button onClick={() => set({ ...g, a0: g.a1, a1: g.a0 })}
          className="mt-2 text-xs px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700">
          Flip to the other side of the circle
        </button>
      </>
    }
    case 'circle': {
      const g = a.geom as CircleGeom
      if (!g?.c) return null
      return <>
        <div className="text-[10px] text-gray-500 mb-1">Centre</div>
        <div className="flex gap-2"><Field label="X" value={g.c.x} onCommit={n => set({ ...g, c: { x: n, y: g.c.y } })} /><Field label="Y" value={g.c.y} onCommit={n => set({ ...g, c: { x: g.c.x, y: n } })} /></div>
        <div className="flex gap-2 mt-1.5">
          <Field label="R" value={g.r} onCommit={n => n > 0 && set({ ...g, r: n })} w="w-16" />
          <Field label="Ø" value={g.r * 2} onCommit={n => n > 0 && set({ ...g, r: n / 2 })} w="w-16" />
        </div>
        <div className="mt-2">
          <Row k="Circumference" v={`${r1(2 * Math.PI * g.r)} mm`} />
          <Row k="Area" v={`${r1(Math.PI * g.r * g.r / 1e6)} m²`} />
        </div>
      </>
    }
    case 'dim': {
      if (isSpecialDim(a.geom)) {
        const sg = a.geom
        const TYPE = { angular: 'Angular', radius: 'Radius', diameter: 'Diameter', arclen: 'Arc length' } as const
        const v = specialDimValue(sg)
        return <>
          <Row k="Type" v={TYPE[sg.dt]} />
          <Row k="Measures" v={sg.dt === 'angular' ? `${r1(v)}°` : `${r1(v)} mm`} />
          <Row k="Shows" v={specialDimText(sg, a.text)} />
          {sg.dt !== 'angular' && <Row k="Centre" v={`${r1(sg.c.x)}, ${r1(sg.c.y)}`} />}
          {sg.dt === 'angular' && <Row k="Corner" v={`${r1(sg.c.x)}, ${r1(sg.c.y)}`} />}
          <div className="mt-1 text-[11px] text-gray-500">Measured when placed — it doesn&apos;t follow the shape if that changes.</div>
        </>
      }
      const g = a.geom as DimGeom
      if (!g?.p1 || !g?.p2) return null
      const l = dimLayout(g)
      return <>
        <div className="text-[10px] text-gray-500 mb-1">Point 1</div>
        <div className="flex gap-2"><Field label="X" value={g.p1.x} onCommit={n => set({ ...g, p1: { x: n, y: g.p1.y } })} /><Field label="Y" value={g.p1.y} onCommit={n => set({ ...g, p1: { x: g.p1.x, y: n } })} /></div>
        <div className="text-[10px] text-gray-500 mt-1.5 mb-1">Point 2</div>
        <div className="flex gap-2"><Field label="X" value={g.p2.x} onCommit={n => set({ ...g, p2: { x: n, y: g.p2.y } })} /><Field label="Y" value={g.p2.y} onCommit={n => set({ ...g, p2: { x: g.p2.x, y: n } })} /></div>
        <div className="flex gap-2 mt-1.5"><Field label="Off" value={g.offset} onCommit={n => set({ ...g, offset: n })} suffix="mm" w="w-16" /></div>
        <div className="mt-2">
          <Row k="Type" v={g.axis === 'x' ? 'Linear — horizontal' : g.axis === 'y' ? 'Linear — vertical' : 'Aligned'} />
          <Row k="Measures" v={`${r1(l.value)} mm`} />
          <Row k="Shows" v={dimText(l.value, a.text)} />
        </div>
      </>
    }
  }
}
