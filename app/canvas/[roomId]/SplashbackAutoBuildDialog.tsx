'use client'

// Auto-build splashbacks (z_splashback S4): F4 → Auto-build splashbacks…
// Lists the pieces autoBuildSplashbacks proposes (one per wall face a top sits
// against, bench → overheads / rangehood / bulkhead / wall top, split at talls
// and windows at the bench, corners stopped short). Tick the ones to build.
// Faces already drawn are listed greyed out and never replaced.

import { useMemo, useState } from 'react'
import type { AutoSbPiece } from '@/src/lib/splashbackAutoBuild'
import { outlinePoints } from '@/src/lib/benchtopGeometry'

const r = (v: number) => Math.round(v)

function Thumb({ p }: { p: AutoSbPiece }) {
  const { b } = p
  const pad = 40
  const pts = outlinePoints(p.segments).map(q => `${q.x},${-q.y}`).join(' ')
  return (
    <svg viewBox={`${b.x0 - pad} ${-b.z1 - pad} ${b.x1 - b.x0 + pad * 2} ${b.z1 - b.z0 + pad * 2}`} className="w-28 h-10 shrink-0" preserveAspectRatio="xMidYMid meet">
      <polygon points={pts} fill={p.skip ? 'none' : 'rgba(56,189,248,0.25)'} stroke={p.skip ? '#6b7280' : '#38bdf8'}
        strokeDasharray={p.skip ? '6 4' : undefined} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default function SplashbackAutoBuildDialog({ pieces, onBuild, onCancel }: {
  pieces: AutoSbPiece[]
  onBuild: (ps: AutoSbPiece[]) => void
  onCancel: () => void
}) {
  const [on, setOn] = useState<Set<string>>(() => new Set(pieces.filter(p => !p.skip).map(p => p.key)))
  const chosen = useMemo(() => pieces.filter(p => !p.skip && on.has(p.key)), [pieces, on])
  const toggle = (k: string) => setOn(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onPointerDown={onCancel}>
      <div className="bg-surface border border-edge-strong rounded-xl shadow-2xl w-[36rem] max-w-full p-5 flex flex-col gap-3 max-h-[85vh]"
        onPointerDown={e => e.stopPropagation()}>
        <p className="text-sm font-semibold text-ink">Auto-build splashbacks</p>
        <p className="text-xs text-ink-muted">
          One piece per wall a top sits against, from the bench up to the overheads, rangehood or bulkhead (else the
          wall top). Talls and windows at the bench split it; at an inside corner the shorter piece stops short.
          Walls that already have a splashback are left alone.
        </p>
        {pieces.length === 0
          ? <p className="text-xs text-ink-subtle">No benchtop edges against a wall in this room.</p>
          : (
            <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
              {pieces.map(p => (
                <label key={p.key} className={`flex items-center gap-3 rounded-lg border border-edge px-2 py-1.5 ${p.skip ? 'opacity-50' : 'cursor-pointer hover:bg-surface-2'}`}>
                  <input type="checkbox" disabled={!!p.skip} checked={!p.skip && on.has(p.key)} onChange={() => toggle(p.key)} />
                  <Thumb p={p} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink">
                      {p.wallName}{p.wall_side === 'back' ? ' (back)' : ''} · {r(p.b.x1 - p.b.x0)} × {r(p.b.z1 - p.b.z0)}
                      <span className="text-ink-subtle"> · x {r(p.b.x0)}–{r(p.b.x1)} · {r(p.b.z0)} → {r(p.b.z1)}{p.stepped ? ' (stepped)' : ''}</span>
                    </p>
                    {(p.skip || p.notes.length > 0) && (
                      <p className="text-[10px] text-ink-subtle">{p.skip ? `Skipped — ${p.skip}` : p.notes.join('; ')}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg border border-edge text-ink-muted hover:bg-surface-2">Cancel</button>
          <button disabled={!chosen.length} onClick={() => onBuild(chosen)}
            className="px-3 py-1.5 text-xs rounded-lg bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-40">
            Build {chosen.length || ''} splashback{chosen.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}
