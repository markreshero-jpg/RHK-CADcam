'use client'

// Cut-outs on one part (z_rangehood R4): holes and notches, edited in Cabinet
// Edit's docked part panel. The list is the part's `Cutout[]` (the cabinet's
// part_cutouts for a carcass part / shelf, the row's own for a custom part);
// sizes and offsets take formulas. The preview cuts the list exactly as the
// resolve does, so its warnings are the ones the cabinet will show.

import { useState } from 'react'
import { previewCutouts, type Cutout, type CutoutValue } from '@/src/lib/partCutouts'
import { sampleOutline, type OutlinePt } from '@/src/lib/shapePath'
import type { FormulaScope } from '@/src/lib/formula'

const inputCls = 'w-full min-w-0 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] font-mono text-right text-white focus:outline-none focus:border-blue-500'
const selCls = 'bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[11px] text-white focus:outline-none focus:border-blue-500'

/** Number, or formula text (anything that isn't a plain number). */
const parseVal = (s: string): CutoutValue => {
  const t = s.trim()
  return t !== '' && Number.isFinite(Number(t)) ? Number(t) : t === '' ? 0 : t
}

/** A size / offset field: commits on blur or Enter, takes a number or a formula. */
function ValField({ value, onCommit, title }: { value: CutoutValue; onCommit: (v: CutoutValue) => void; title?: string }) {
  const [text, setText] = useState(String(value))
  const [seen, setSeen] = useState(value)   // re-sync when the saved value changes
  if (seen !== value) { setSeen(value); setText(String(value)) }
  const commit = () => { const v = parseVal(text); if (v !== value) onCommit(v) }
  return (
    <input className={`${inputCls} ${typeof value === 'string' ? 'text-amber-300' : ''}`} value={text} title={title ?? 'mm, or a formula (cab.w - 100)'}
      onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); e.stopPropagation() }} />
  )
}

/** Pocket depth: blank = through. Commits on blur or Enter. */
function DepthField({ value, onCommit }: { value: number | null; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  const [seen, setSeen] = useState(value)
  if (seen !== value) { setSeen(value); setText(value == null ? '' : String(value)) }
  const commit = () => { const n = Number(text); const v = text.trim() === '' || !(n > 0) ? null : n; if (v !== value) onCommit(v) }
  return (
    <input className={inputCls} placeholder="through" value={text} title="Blank = through; else pocket depth, mm"
      onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); e.stopPropagation() }} />
  )
}

function newCutout(kind: Cutout['kind'], list: Cutout[]): Cutout {
  let n = list.length + 1
  while (list.some(c => c.id === `c${n}`)) n++
  return kind === 'notch'
    ? { id: `c${n}`, kind, shape: 'rect', w: 100, d: 50, edge: 'back', x: { from: 'centre', off: 0 }, y: { from: 'back', off: 0 }, source: 'user' }
    : { id: `c${n}`, kind, shape: 'rect', w: 100, d: 100, radius: 0, depth: null, x: { from: 'centre', off: 0 }, y: { from: 'centre', off: 0 }, source: 'user' }
}

/** Top view of the part, front at the bottom: its outline less notches, holes in it. */
function Preview({ W, D, outline, holes }: { W: number; D: number; outline: OutlinePt[] | null; holes: OutlinePt[][] }) {
  const pad = Math.max(W, D) * 0.04
  const poly = (pts: OutlinePt[]) => sampleOutline(pts, 5).map(p => `${p.x},${D - p.y}`).join(' ')
  const rect: OutlinePt[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }]
  return (
    <svg viewBox={`${-pad} ${-pad} ${W + 2 * pad} ${D + 2 * pad}`} className="w-full max-h-32 bg-gray-950 rounded" preserveAspectRatio="xMidYMid meet">
      <polygon points={poly(outline ?? rect)} fill="#a8a29e33" stroke="#d6d3d1" strokeWidth={Math.max(W, D) / 250} vectorEffect="non-scaling-stroke" />
      {holes.map((h, i) => <polygon key={i} points={poly(h)} fill="#030712" stroke="#f59e0b" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
      <text x={W / 2} y={D + pad * 0.85} textAnchor="middle" fontSize={pad * 0.8} fill="#6b7280">front</text>
    </svg>
  )
}

export default function PartCutoutsPanel({ W, D, DZ, holesAllowed, list, scope, onChange, className = '' }: {
  W: number; D: number; DZ: number
  holesAllowed: boolean
  list: Cutout[]
  scope?: FormulaScope | null
  onChange: (next: Cutout[]) => void
  className?: string
}) {
  const pv = previewCutouts(W, D, DZ, holesAllowed, list, scope ?? undefined)
  const set = (i: number, patch: Partial<Cutout>) => onChange(list.map((c, k) => k === i ? { ...c, ...patch } : c))
  return (
    <div className={`${className} bg-gray-900/95 border border-gray-700 rounded-lg shadow-xl pointer-events-auto select-none`} onClick={e => e.stopPropagation()}>
      <div className="px-3 pt-2.5 pb-1.5 border-b border-gray-700 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Cut-outs</span>
        <div className="flex gap-1">
          {holesAllowed && <button onClick={() => onChange([...list, newCutout('hole', list)])}
            className="text-[10px] px-1.5 py-0.5 rounded border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400">+ Hole</button>}
          <button onClick={() => onChange([...list, newCutout('notch', list)])}
            className="text-[10px] px-1.5 py-0.5 rounded border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400">+ Notch</button>
        </div>
      </div>
      <div className="px-3 py-2 space-y-2">
        {list.length > 0 && <Preview W={W} D={D} outline={pv.outline} holes={pv.cutouts.map(c => c.pts)} />}
        {list.length === 0 && <div className="text-[10px] text-gray-500">None. A hole goes through (or a pocket into) the part; a notch opens to an edge.</div>}
        {list.map((c, i) => {
          const locked = c.source && c.source !== 'user'
          const isNotch = c.kind === 'notch'
          return (
            <div key={c.id} className={`border border-gray-800 rounded p-1.5 space-y-1 ${locked ? 'opacity-60 pointer-events-none' : ''}`}>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="font-mono text-gray-400 w-6">{c.id}</span>
                <span className="text-gray-300">{isNotch ? 'Notch' : 'Hole'}</span>
                {!isNotch && (
                  <select className={selCls} value={c.shape} onChange={e => set(i, { shape: e.target.value as Cutout['shape'] })}>
                    <option value="rect">rect</option><option value="circle">circle</option>
                  </select>
                )}
                {isNotch && (
                  <select className={selCls} value={c.edge ?? 'back'} title="Edge it opens to"
                    onChange={e => set(i, { edge: e.target.value as NonNullable<Cutout['edge']> })}>
                    <option value="back">back</option><option value="front">front</option><option value="left">left</option><option value="right">right</option>
                  </select>
                )}
                {locked && <span className="text-[9px] text-gray-500">({c.source})</span>}
                <button onClick={() => onChange(list.filter((_, k) => k !== i))} title="Remove"
                  className="ml-auto text-red-500 hover:text-red-300">✕</button>
              </div>
              <div className="grid grid-cols-[2.6rem_1fr_1fr] gap-1 items-center text-[10px] text-gray-500">
                <span>{c.shape === 'circle' ? 'Ø' : 'W × D'}</span>
                <ValField value={c.w} onCommit={v => set(i, { w: v })} title="Width across the part — mm or formula" />
                {c.shape === 'circle' ? <span /> : <ValField value={c.d} onCommit={v => set(i, { d: v })} title="Depth front to back — mm or formula" />}
                <span>X from</span>
                <select className={selCls} value={c.x.from} onChange={e => set(i, { x: { ...c.x, from: e.target.value as Cutout['x']['from'] } })}>
                  <option value="left">left</option><option value="centre">centre</option><option value="right">right</option>
                </select>
                <ValField value={c.x.off} onCommit={v => set(i, { x: { ...c.x, off: v } })} />
                <span>Y from</span>
                <select className={selCls} value={c.y.from} onChange={e => set(i, { y: { ...c.y, from: e.target.value as Cutout['y']['from'] } })}>
                  <option value="front">front</option><option value="centre">centre</option><option value="back">back</option>
                </select>
                <ValField value={c.y.off} onCommit={v => set(i, { y: { ...c.y, off: v } })} />
                {c.shape === 'rect' && (<>
                  <span>Radius</span>
                  <ValField value={c.radius ?? 0} onCommit={v => set(i, { radius: Math.max(0, Number(v) || 0) })}
                    title={isNotch ? 'Radius on the two inside corners away from the open edge, mm (half the width = a round end)' : 'Corner radius, mm'} />
                  <span className="text-gray-600">{isNotch ? 'inner corners' : ''}</span>
                </>)}
                {!isNotch && (<>
                  <span>Depth</span>
                  <DepthField value={c.depth ?? null} onCommit={v => set(i, { depth: v })} />
                  <span className="text-gray-600">{c.depth != null && c.depth >= DZ ? 'through' : ''}</span>
                </>)}
              </div>
            </div>
          )
        })}
        {pv.warnings.map((w, i) => (
          <div key={i} className="text-[10px] text-amber-400">⚠ {w.message.replace(/^Cut-out (\S+) on p: /, '$1: ')}</div>
        ))}
        {list.length > 0 && <div className="text-[9px] text-gray-600">Notch: anchor the way it opens is ignored — it butts the edge. Formulas: cab.w, cab.d, t.carcass…</div>}
      </div>
    </div>
  )
}
