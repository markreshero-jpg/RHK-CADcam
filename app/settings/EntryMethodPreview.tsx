'use client'

// ============================================================
// Pocket / hole entry preview (Settings → CNC Machines → Pocket & Hole Entry).
// PLAN VIEW — top-down, as the entry looks on the nested sheet: helical reads
// as a circle, ramp as a short back-and-forth line, plunge as a point, pre-drill
// as a hole then a plunge. A small depth gauge conveys the Z descent that plan
// view can't show. Pure inline SVG + rAF loop; reads live helical radius / ramp.
// ============================================================

import { useEffect, useState } from 'react'

type Method = 'helical' | 'ramp' | 'pre_drill' | 'straight_plunge'

const METHODS: { key: Method; label: string }[] = [
  { key: 'helical', label: 'Helical' },
  { key: 'ramp', label: 'Ramp' },
  { key: 'straight_plunge', label: 'Plunge' },
  { key: 'pre_drill', label: 'Pre-drill' },
]

const BLURB: Record<Method, string> = {
  helical: 'The bit corkscrews down in a small circle, easing into the cut — gentle on the tool, good chip clearing. Best for pockets.',
  ramp: 'The bit descends along a shallow back-and-forth ramp instead of straight down — kinder to bits that can’t plunge.',
  straight_plunge: 'The bit drills straight down to depth at one point. Simplest, but hard on bits that aren’t centre-cutting in thick/hard stock.',
  pre_drill: 'A drill makes an entry hole first, then the router plunges into that clear hole — no plunging into solid material.',
}

// Plan-view pocket rectangle + a side depth gauge.
const PX0 = 40, PX1 = 232, PY0 = 30, PY1 = 138, CX = (PX0 + PX1) / 2, CY = (PY0 + PY1) / 2
const GX = 262, GTOP = 34, GBOT = 138   // depth gauge (surface → full depth)

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const tri = (u: number) => { const fr = u - Math.floor(u); return (fr < 0.5 ? fr * 2 : 2 - fr * 2) * 2 - 1 }

export default function EntryMethodPreview({
  method, helicalRadius, rampDistance,
}: {
  method: string
  helicalRadius?: number | null
  rampAngle?: number | null
  rampDistance?: number | null
}) {
  const saved = (METHODS.some(m => m.key === method) ? method : 'helical') as Method
  const [view, setView] = useState<Method>(saved)
  const [t, setT] = useState(0)
  useEffect(() => { setView(saved) }, [saved])
  useEffect(() => {
    let raf = 0, start = 0
    const dur = 2600, hold = 650
    const loop = (ts: number) => {
      if (!start) start = ts
      setT(clamp(((ts - start) % (dur + hold)) / dur, 0, 1))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [view])

  const R = clamp((helicalRadius ?? 8) * 2.2, 12, Math.min((PX1 - PX0) / 2 - 10, (PY1 - PY0) / 2 - 10))
  const HW = clamp((rampDistance ?? 20) * 1.4, 16, (PX1 - PX0) / 2 - 12)
  const turns = 3

  // Descent progress (drives the depth gauge). Plunge reaches depth fastest.
  const dProg = view === 'straight_plunge' ? clamp(t / 0.4, 0, 1)
    : view === 'pre_drill' ? clamp(t / 0.5, 0, 1)
    : clamp(t / 0.8, 0, 1)

  // Plan-view tool-centre position + traced entry path for the active method.
  const u = clamp(t / 0.8, 0, 1)
  const toolXY =
    view === 'helical' ? { x: CX + R * Math.cos(2 * Math.PI * turns * u - Math.PI / 2), y: CY + R * Math.sin(2 * Math.PI * turns * u - Math.PI / 2) }
    : view === 'ramp' ? { x: CX + HW * tri(u * 3), y: CY }
    : { x: CX, y: CY }

  // Faint full entry signature (what the method draws in XY).
  const N = 120
  const sig: { x: number; y: number }[] =
    view === 'helical' ? Array.from({ length: N + 1 }, (_, i) => { const a = 2 * Math.PI * turns * (i / N) - Math.PI / 2; return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) } })
    : view === 'ramp' ? Array.from({ length: N + 1 }, (_, i) => ({ x: CX + HW * tri((i / N) * 3), y: CY }))
    : []
  const traced = sig.slice(0, Math.max(1, Math.floor(u * N)) + 1)
  const toStr = (pts: { x: number; y: number }[]) => pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const gy = lerp(GTOP, GBOT, dProg)

  return (
    <div className="rounded-lg border border-edge-strong bg-surface-2/40 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        {METHODS.map(m => (
          <button key={m.key} onClick={() => setView(m.key)}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
              view === m.key ? 'border-accent text-accent bg-accent/10' : 'border-edge-strong text-ink-subtle hover:text-ink'}`}>
            {m.label}
          </button>
        ))}
        {view !== saved
          ? <span className="text-[9px] text-ink-subtle ml-auto">preview only · saved = {saved}</span>
          : <span className="text-[9px] text-accent ml-auto">current setting</span>}
      </div>

      <svg viewBox="0 0 300 168" className="w-full" style={{ maxHeight: 180 }} role="img" aria-label={`${view} entry, plan view`}>
        <text x={PX0} y={22} fontSize={7.5} fill="#94a3b8">plan view (looking down on the sheet)</text>

        {/* Pocket footprint on the sheet */}
        <rect x={PX0} y={PY0} width={PX1 - PX0} height={PY1 - PY0} rx={3} fill="#3f3a33" stroke="#5c5348" strokeWidth={1} />
        <text x={PX0 + 4} y={PY1 - 5} fontSize={7} fill="#8a8073">pocket area</text>

        {/* Pre-drilled hole (drawn once the drill has run) */}
        {view === 'pre_drill' && <circle cx={CX} cy={CY} r={5} fill="#221f1b" stroke="#5c5348" strokeWidth={0.6} />}

        {/* Entry signature: faint full loop + bright traced portion */}
        {sig.length > 0 && <>
          <polyline points={toStr(sig)} fill="none" stroke="#f59e0b" strokeWidth={1} opacity={0.2} strokeDasharray="2 2" />
          <polyline points={toStr(traced)} fill="none" stroke="#f59e0b" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
        </>}

        {/* Plunge / pre-drill pulse ring at the point */}
        {(view === 'straight_plunge' || view === 'pre_drill') && dProg < 1 && (
          <circle cx={CX} cy={CY} r={4 + (1 - dProg) * 8} fill="none" stroke="#f59e0b" strokeWidth={1} opacity={0.4 * (1 - dProg) + 0.2} />
        )}

        {/* The tool (a circle from the top) */}
        <circle cx={toolXY.x} cy={toolXY.y} r={6} fill="#c7ccd4" stroke="#7c8494" strokeWidth={1} />
        <circle cx={toolXY.x} cy={toolXY.y} r={1.4} fill="#7c8494" />

        {/* Depth gauge — the Z that plan view can't show */}
        <text x={GX + 6} y={GTOP - 4} textAnchor="middle" fontSize={6.5} fill="#94a3b8">depth</text>
        <line x1={GX} y1={GTOP} x2={GX} y2={GBOT} stroke="#4a443b" strokeWidth={4} strokeLinecap="round" />
        <line x1={GX} y1={GTOP} x2={GX} y2={gy} stroke="#f59e0b" strokeWidth={4} strokeLinecap="round" />
        <text x={GX + 6} y={GTOP + 4} fontSize={6} fill="#8a8073">top</text>
        <text x={GX + 6} y={GBOT} fontSize={6} fill="#8a8073">full</text>
      </svg>

      <p className="text-[10px] text-ink-subtle leading-relaxed mt-1.5">{BLURB[view]}</p>
    </div>
  )
}
