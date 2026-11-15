'use client'

// Properties of the selected splashback (z_splashback S2): position + size in
// the wall elevation (left / width / bottom / top), set off the wall, thickness,
// schedule, opening reveal, Edit shape, notes, delete.
// S3: hand cut-outs (GPO / switch / rect / round), slab joints, returns at either end.

import { useState } from 'react'
import PanelDeleteButton, { PanelCloseButton } from './PanelDeleteButton'
import CalcInput from '@/src/components/CalcInput'
import type { BenchtopSegment, SbCutout, SbReturn, SplashbackInstance } from '@/src/lib/types'
import { sbBounds, stretchEdge, moveSegments, isRect, jointXs, CUTOUT_PRESETS } from '@/src/lib/splashbackGeometry'
import type { SbInfo } from './useSplashbacks'

const SOURCE_TEXT: Record<string, string> = {
  schedule: 'from the schedule', job: 'job override', room: 'room override', benchtop: 'same as the benchtop',
}

export default function SplashbackPanel({
  sb, info, wallName, wallThick, schedules, onUpdate, onDelete, onClose, onEditShape,
}: {
  sb: SplashbackInstance
  info: SbInfo
  wallName: string
  /** Host wall thickness — the default length of a return round its end. */
  wallThick?: number
  schedules: { id: string; name: string; is_default: boolean }[]
  onUpdate: (id: string, u: Partial<SplashbackInstance>) => void
  onDelete: (id: string) => void
  onClose: () => void
  onEditShape: (id: string) => void
}) {
  const inp = 'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500'
  const lbl = 'text-[10px] text-gray-500 uppercase tracking-wider mb-0.5 block'
  const b = sbBounds(sb.segments)
  const [label, setLabel] = useState(sb.label ?? '')
  const [notes, setNotes] = useState(sb.notes ?? '')
  // The canvas mounts this with key = splashback id, so the drafts start fresh per piece.

  const setSegs = (segs: BenchtopSegment[]) => onUpdate(sb.id, { segments: segs })
  const field = (k: string, value: number, onCommit: ((v: number) => void) | null, title: string) => (
    <div title={title}>
      <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">{k}</div>
      {onCommit
        ? <CalcInput value={Math.round(value * 10) / 10} decimals={1} onCommit={onCommit} className={inp + ' text-right'} />
        : <div className="bg-gray-800/60 rounded px-2 py-1 text-xs text-gray-300 text-right tabular-nums">{value}</div>}
    </div>
  )

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-300">Splashback</p>
          <p className="text-[10px] text-gray-500">{wallName} · {sb.wall_side === 'back' ? 'back' : 'face'}{isRect(sb.segments) ? '' : ' · shaped'}</p>
        </div>
        <PanelCloseButton onClose={onClose} />
      </div>

      <div className="p-4 space-y-3">
        <div>
          <label className={lbl}>Name</label>
          <input value={label} onChange={e => setLabel(e.target.value)} onBlur={() => label !== (sb.label ?? '') && onUpdate(sb.id, { label: label || null })} className={inp} />
        </div>

        {b && (
          <div className="space-y-1.5">
            <label className={lbl}>Position + size (mm)</label>
            <div className="grid grid-cols-2 gap-1">
              {field('Left', b.x0, v => setSegs(moveSegments(sb.segments, v - b.x0, 0)), 'Left edge along the wall, as seen in this elevation. Moves the whole piece.')}
              {field('Width', b.x1 - b.x0, v => setSegs(stretchEdge(sb.segments, 'right', b.x0 + v)), 'Overall width — the right edge moves.')}
              {field('Bottom', b.z0, v => setSegs(moveSegments(sb.segments, 0, v - b.z0)), 'Bottom edge above the floor (usually the bench top). Moves the whole piece.')}
              {field('Height', b.z1 - b.z0, v => setSegs(stretchEdge(sb.segments, 'top', b.z0 + v)), 'Overall height — the top edge moves.')}
            </div>
            <p className="text-[10px] text-gray-500">Drag the piece in elevation to move it, or the orange handles to stretch an edge.</p>
          </div>
        )}

        <div className="space-y-1.5">
          <label className={lbl}>Material</label>
          <select value={sb.splashback_schedule_id ?? ''} onChange={e => onUpdate(sb.id, { splashback_schedule_id: e.target.value || null })} className={inp}>
            <option value="">— room / job default —</option>
            {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <p className="text-[10px] text-gray-400">
            {info.name ?? 'No material — set a schedule'}
            {info.source ? <span className="text-gray-500"> · {SOURCE_TEXT[info.source] ?? info.source}</span> : null}
            <span className="text-gray-500"> · {info.isBoard ? 'board, cut part' : 'supply only'}</span>
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1">
          {field('Thick', info.thick, v => onUpdate(sb.id, { thickness_mm: v > 0 ? v : null }), 'Panel thickness. Blank / 0 = the material thickness.')}
          {field('Off wall', Number(sb.offset_mm) || 0, v => onUpdate(sb.id, { offset_mm: Math.max(0, v) }), 'Set off the wall face (packers / battens).')}
          {field('Reveal', Number(sb.opening_reveal_mm) || 0, v => onUpdate(sb.id, { opening_reveal_mm: Math.max(0, v) }), 'Gap kept around windows / doors that cut the splashback.')}
        </div>
        {sb.thickness_mm != null && (
          <button onClick={() => onUpdate(sb.id, { thickness_mm: null })} className="text-[10px] text-blue-400 hover:text-blue-300">Use the material thickness</button>
        )}

        {b && <CutoutsSection sb={sb} w={b.x1 - b.x0} h={b.z1 - b.z0} onUpdate={onUpdate} inp={inp} lbl={lbl} />}
        {b && <JointsSection sb={sb} b={b} onUpdate={onUpdate} inp={inp} lbl={lbl} />}
        <ReturnsSection sb={sb} thick={info.thick} wallThick={wallThick ?? 0} onUpdate={onUpdate} inp={inp} lbl={lbl} />

        <button onClick={() => onEditShape(sb.id)}
          className="w-full py-1.5 text-xs rounded border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">
          Edit shape…
        </button>

        <div>
          <label className={lbl}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => notes !== (sb.notes ?? '') && onUpdate(sb.id, { notes: notes || null })}
            rows={3} className={inp + ' resize-y'} />
        </div>
      </div>

      <PanelDeleteButton label="Delete splashback" onDelete={() => onDelete(sb.id)} />
    </div>
  )
}

// ── S3 sections ─────────────────────────────────────────────────────────────

type Up = (id: string, u: Partial<SplashbackInstance>) => void
const num = (v: number) => Math.round(v * 10) / 10
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2))

/** Hand cut-outs: x / y = bottom-left from the piece's bottom-left; drag them in elevation too. */
function CutoutsSection({ sb, w, h, onUpdate, inp, lbl }: { sb: SplashbackInstance; w: number; h: number; onUpdate: Up; inp: string; lbl: string }) {
  const cuts: SbCutout[] = Array.isArray(sb.cutouts) ? sb.cutouts : []
  const save = (next: SbCutout[]) => onUpdate(sb.id, { cutouts: next })
  const set = (id: string, u: Partial<SbCutout>) => save(cuts.map(c => c.id === id ? { ...c, ...u } : c))
  const add = (kind: SbCutout['kind']) => {
    const p = CUTOUT_PRESETS[kind]
    // New cut-outs land mid-piece, centred 150 above the bottom (GPO height over a bench).
    save([...cuts, { id: newId(), kind, w: p.w, h: p.h, x: Math.round(w / 2 - p.w / 2), y: Math.round(Math.min(150, h / 2) - p.h / 2), label: null }])
  }
  const cell = (v: number, onCommit: (v: number) => void, title: string) => (
    <div title={title}><CalcInput value={num(v)} decimals={1} onCommit={onCommit} className={inp + ' text-right !px-1'} /></div>
  )
  return (
    <div className="space-y-1.5">
      <label className={lbl}>Cut-outs</label>
      {cuts.map((c, i) => (
        <div key={c.id} className="space-y-1 pb-1.5 border-b border-gray-800/70">
          <div className="flex items-center gap-1">
          <select value={c.kind} onChange={e => {
            const kind = e.target.value as SbCutout['kind']
            set(c.id, { kind, w: CUTOUT_PRESETS[kind].w, h: CUTOUT_PRESETS[kind].h })
          }} className={inp + ' !px-1'}>
            {(Object.keys(CUTOUT_PRESETS) as SbCutout['kind'][]).map(k => <option key={k} value={k}>{CUTOUT_PRESETS[k].label}</option>)}
          </select>
          <button onClick={() => save(cuts.filter(x => x.id !== c.id))} title="Remove this cut-out" className="text-gray-500 hover:text-red-400 text-xs px-1">×</button>
          </div>
          {i === 0 && (
            <div className="grid grid-cols-4 gap-1 text-[9px] text-gray-500 uppercase text-right">
              <span>X</span><span>Y</span><span>{c.kind === 'round' ? 'Ø' : 'W'}</span><span>{c.kind === 'round' ? '' : 'H'}</span>
            </div>
          )}
          <div className="grid grid-cols-4 gap-1 items-center">
          {cell(c.x, v => set(c.id, { x: v }), 'From the piece\'s left edge to the cut-out\'s left side.')}
          {cell(c.y, v => set(c.id, { y: v }), 'From the piece\'s bottom (the bench) to the cut-out\'s bottom.')}
          {cell(c.w, v => set(c.id, c.kind === 'round' ? { w: Math.max(1, v), h: Math.max(1, v) } : { w: Math.max(1, v) }), c.kind === 'round' ? 'Diameter.' : 'Width.')}
          {c.kind === 'round'
            ? <span className="text-[10px] text-gray-500 text-right">dia.</span>
            : cell(c.h, v => set(c.id, { h: Math.max(1, v) }), 'Height.')}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        {(Object.keys(CUTOUT_PRESETS) as SbCutout['kind'][]).map(k => (
          <button key={k} onClick={() => add(k)} className="px-1.5 py-0.5 text-[10px] rounded border border-gray-700 text-gray-300 hover:bg-gray-800">
            + {CUTOUT_PRESETS[k].label}
          </button>
        ))}
      </div>
      {cuts.length > 0 && <p className="text-[10px] text-gray-500">Sizes are the hole in the panel — check them against the fittings. Drag a cut-out in elevation to move it.</p>}
    </div>
  )
}

/** Slab joints (vertical, butt): mm from the piece's left edge. */
function JointsSection({ sb, b, onUpdate, inp, lbl }: { sb: SplashbackInstance; b: { x0: number; x1: number; z0: number; z1: number }; onUpdate: Up; inp: string; lbl: string }) {
  const js = jointXs(sb, b).map(x => Math.round(x - b.x0))
  const len = Math.round(b.x1 - b.x0)
  const save = (next: number[]) => onUpdate(sb.id, { joints: [...next].sort((a, c) => a - c) })
  const edges = [0, ...js, len]
  const pieces = edges.slice(1).map((e, i) => e - edges[i])
  const add = () => {
    // Split the longest piece in half.
    let k = 0
    pieces.forEach((p, i) => { if (p > pieces[k]) k = i })
    save([...js, Math.round(edges[k] + pieces[k] / 2)])
  }
  return (
    <div className="space-y-1.5">
      <label className={lbl}>Joints</label>
      {js.map((j, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500 w-16">From left</span>
          <CalcInput value={j} decimals={1} onCommit={v => save(js.map((x, k) => k === i ? Math.min(Math.max(v, 20), len - 20) : x))} className={inp + ' text-right'} />
          <button onClick={() => save(js.filter((_, k) => k !== i))} title="Remove this joint" className="text-gray-500 hover:text-red-400 text-xs px-1">×</button>
        </div>
      ))}
      {js.length > 0 && <p className="text-[10px] text-gray-400">Pieces: {pieces.join(' + ')}</p>}
      <button onClick={add} className="px-1.5 py-0.5 text-[10px] rounded border border-gray-700 text-gray-300 hover:bg-gray-800">+ Joint</button>
    </div>
  )
}

/** A return at either end (ends as seen in this elevation). */
function ReturnsSection({ sb, thick, wallThick, onUpdate, inp, lbl }: { sb: SplashbackInstance; thick: number; wallThick: number; onUpdate: Up; inp: string; lbl: string }) {
  const rs: SbReturn[] = Array.isArray(sb.returns) ? sb.returns : []
  const save = (next: SbReturn[]) => onUpdate(sb.id, { returns: next })
  const row = (end: SbReturn['end']) => {
    const r = rs.find(x => x.end === end)
    const others = rs.filter(x => x.end !== end)
    return (
      <div key={end} className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400 w-16 capitalize">{end} end</span>
          <select value={r?.dir ?? ''} className={inp} onChange={e => {
            const dir = e.target.value as SbReturn['dir'] | ''
            if (!dir) { save(others); return }
            // Wrap a wall end: the wall's thickness + the panel; inside corner: 100.
            const length_mm = r?.length_mm ?? (dir === 'back' ? Math.round((wallThick || 90) + thick) : 100)
            save([...others, { end, dir, length_mm, join: r?.join ?? (dir === 'back' ? 'mitre' : 'butt') }])
          }}>
            <option value="">No return</option>
            <option value="back">Wrap round the wall end</option>
            <option value="out">Inside corner (toward the room)</option>
          </select>
        </div>
        {r && (
          <div className="flex items-center gap-1 pl-16">
            <div className="w-20" title="Overall length of the return (long point), panel thickness included.">
              <CalcInput value={r.length_mm} decimals={1} onCommit={v => save([...others, { ...r, length_mm: Math.max(thick + 1, v) }])} className={inp + ' text-right'} />
            </div>
            <select value={r.join} onChange={e => save([...others, { ...r, join: e.target.value as SbReturn['join'] }])} className={inp}>
              <option value="mitre">Mitre</option>
              <option value="butt">Butt</option>
            </select>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <label className={lbl}>Returns</label>
      {row('left')}
      {row('right')}
      <p className="text-[10px] text-gray-500">Ends as seen in this elevation. Length = overall, long point.</p>
    </div>
  )
}
