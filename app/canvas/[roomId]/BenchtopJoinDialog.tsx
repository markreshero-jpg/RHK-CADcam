'use client'

// ============================================================
// Joints between benchtops (Phase 7c) — shift-click two or more
// tops, right-click → Join benchtops. The tops stay separate;
// for each place two of them meet, pick the joint (Mitre by
// default). The drawing shows the tops cut to the joints live.
// Enter = Apply, Esc = Cancel.
// ============================================================

import { useState, useEffect, useMemo } from 'react'
import type { BenchtopSegment } from '@/src/lib/types'
import { outlinePath, outlinePoints, segMid } from '@/src/lib/benchtopGeometry'
import { jointTops, jointKey, choicesFor, JOIN_PLAN_ERRORS, type JoinChoice } from '@/src/lib/benchtopJoinTops'

export interface JoinTop { id: string; label: string; segs: BenchtopSegment[] }

const FILLS = ['rgba(20,184,166,0.22)', 'rgba(56,189,248,0.22)', 'rgba(167,139,250,0.22)', 'rgba(52,211,153,0.22)']
const STROKES = ['#14b8a6', '#38bdf8', '#a78bfa', '#34d399']

export default function BenchtopJoinDialog({ tops, onJoin, onCancel }: {
  tops: JoinTop[]
  onJoin: (choices: Record<string, JoinChoice | null>) => void
  onCancel: () => void
}) {
  const [choices, setChoices] = useState<Record<string, JoinChoice | null>>({})
  const r = useMemo(() => jointTops(tops.map(t => t.segs), choices), [tops, choices])
  // What will be applied: every meeting's pick (defaults filled in).
  const picked = useMemo(() => Object.fromEntries(r.steps.map(s => [jointKey(s.i, s.j), s.choice])), [r])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && r.ok) { e.preventDefault(); e.stopImmediatePropagation(); onJoin(picked) }
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onCancel() }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [r.ok, picked, onJoin, onCancel])

  // Drawing frame: every top as picked, padded.
  const pts = tops.flatMap(t => outlinePoints(t.segs, 8))
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  const minX = Math.min(...xs), minY = Math.min(...ys), w = Math.max(...xs) - minX, h = Math.max(...ys) - minY
  const pad = Math.max(w, h) * 0.08 + 50
  const vb = `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`
  const fs = Math.max(w, h) / 28

  const label = (c: JoinChoice, i: number, j: number) =>
    c === 'butt_a' ? `Butt — ${tops[i].label} runs through`
      : c === 'butt_b' ? `Butt — ${tops[j].label} runs through`
        : c === 'mitre' ? 'Mitre' : 'Butt'

  const chip = (on: boolean) =>
    `px-2.5 py-1 text-xs rounded-lg border transition-colors ${on ? 'bg-accent border-accent text-white' : 'bg-surface-3 border-edge text-ink-muted hover:text-ink'}`

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onPointerDown={onCancel}>
      <div className="bg-surface border border-edge-strong rounded-xl shadow-2xl w-[30rem] max-w-full p-5 flex flex-col gap-4"
        onPointerDown={e => e.stopPropagation()}>
        <div>
          <p className="text-sm font-semibold text-ink">Joints between {tops.length} benchtops</p>
          <p className="text-xs text-ink-muted mt-1">
            They stay separate benchtops — each is cut to the joint where they meet.
          </p>
        </div>

        <svg viewBox={vb} className="w-full h-56 bg-surface-2 rounded-lg border border-edge">
          {tops.map(t => (
            <path key={`o${t.id}`} d={outlinePath(t.segs)} fill="none" stroke="#6b7280" strokeDasharray="6 4"
              strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {r.tops.map((segs, k) => (
            <path key={`n${k}`} d={outlinePath(segs)} fill={FILLS[k % FILLS.length]} stroke={STROKES[k % STROKES.length]}
              strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ))}
          {r.tops.flatMap((segs, k) => segs.filter(s => s.edge?.joint).map((s, n) => (
            <path key={`j${k}-${n}`} d={`M ${s.p0.x} ${s.p0.y} L ${s.p1.x} ${s.p1.y}`} stroke="#ef4444" strokeWidth={3}
              vectorEffect="non-scaling-stroke" />
          )))}
          {r.tops.map((segs, k) => {
            const c = outlinePoints(segs, 8).reduce((a, p, _, all) => ({ x: a.x + p.x / all.length, y: a.y + p.y / all.length }), { x: 0, y: 0 })
            return (
              <text key={`l${k}`} x={c.x} y={c.y} fontSize={fs} fill={STROKES[k % STROKES.length]}
                textAnchor="middle" dominantBaseline="middle">{tops[k].label}</text>
            )
          })}
          {r.steps.map(s => {
            const j = r.tops[s.j].find(q => q.edge?.joint)
            if (!j || !s.choice) return null
            const m = segMid(j)
            return (
              <text key={`t${s.i}-${s.j}`} x={m.x} y={m.y} fontSize={fs * 0.8} fill="#fca5a5" fontWeight={600}
                textAnchor="middle" dominantBaseline="middle" stroke="#111827" strokeWidth={fs * 0.15} paintOrder="stroke">
                {s.choice === 'mitre' ? 'M' : 'B'}
              </text>
            )
          })}
        </svg>

        <div className="flex flex-col gap-3">
          {!r.steps.length && <p className="text-xs text-red-400">{JOIN_PLAN_ERRORS.apart}</p>}
          {r.steps.map(s => (
            <div key={jointKey(s.i, s.j)}>
              <p className="text-xs text-ink-muted mb-1.5">
                {tops[s.i].label} ↔ {tops[s.j].label}{s.plan ? (s.plan.kind === 'touch' ? ' · end to end' : ' · overlapping') : ''}
              </p>
              {s.plan ? (
                <div className="flex flex-wrap gap-1.5">
                  {choicesFor(s.plan).map(c => (
                    <button key={c} className={chip(s.choice === c)}
                      onClick={() => setChoices(cs => ({ ...cs, [jointKey(s.i, s.j)]: c }))}>
                      {label(c, s.i, s.j)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-red-400">{JOIN_PLAN_ERRORS[s.error!]}</p>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg bg-surface-3 text-ink-muted hover:text-ink">Cancel</button>
          <button onClick={() => onJoin(picked)} disabled={!r.ok}
            className="px-3 py-1.5 text-xs rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-40 disabled:cursor-not-allowed">
            Apply joints ↵
          </button>
        </div>
      </div>
    </div>
  )
}
