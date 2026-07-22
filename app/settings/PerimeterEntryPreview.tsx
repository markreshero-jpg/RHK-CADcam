'use client'

// ============================================================
// Perimeter-entry preview (Settings → CNC Machines → Perimeter Entry).
// PLAN VIEW — as nested on the sheet. Shows the NESTING MARGIN (the waste
// gap around the part) and where the APPROACH OFFSET sits within it, so the
// two settings read together. Straight approach ramps on the edge; offset
// approach starts into the margin. Starts zoomed on the entry, then pulls
// back. Depth gauge is an HTML overlay. Pure inline SVG + rAF loop.
// ============================================================

import { useEffect, useState } from 'react'

const X0 = 80, X1 = 230, Y0 = 46, Y1 = 126        // part footprint (plan)
const VW = 300, VH = 168

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeInOut = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
type P = { x: number; y: number }

export default function PerimeterEntryPreview({
  approachType, rampDistance, approachOffset, nestPad,
}: {
  approachType?: string
  rampAngle?: number | null
  rampDistance?: number | null
  approachOffset?: number | null
  nestPad?: number | null
}) {
  const [t, setT] = useState(0)
  useEffect(() => {
    let raf = 0, start = 0
    const dur = 6400, hold = 900
    const loop = (ts: number) => {
      if (!start) start = ts
      setT(clamp(((ts - start) % (dur + hold)) / dur, 0, 1))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const straight = approachType === 'straight'
  // Nesting margin (waste gap) band + the approach offset drawn to the SAME scale, so
  // the offset visibly sits inside the margin (offset / nest_pad = its true fraction).
  const marginPx = clamp((nestPad ?? 10) * 1.6, 8, 16)
  const pxPerMm = marginPx / Math.max(nestPad ?? 10, 1)
  const offsetPx = straight ? 0 : clamp((approachOffset ?? 2) * pxPerMm, 1.5, marginPx - 1.5)

  // Start = bottom-edge midpoint; approach backed along the edge (ramp run) and out
  // into the margin by the offset.
  const S: P = { x: (X0 + X1) / 2, y: Y1 }
  const rampRun = clamp((rampDistance ?? 20) * 1.6, 26, 66)
  const A: P = { x: S.x - rampRun, y: Y1 + offsetPx }
  const loopPts: P[] = [S, { x: X1, y: Y1 }, { x: X1, y: Y0 }, { x: X0, y: Y0 }, { x: X0, y: Y1 }, S]
  const leadOut: P = { x: S.x + 16, y: Y1 }

  // Timeline: ramp-in gets half the time; loop quicker; short lead-out.
  const RAMP_END = 0.5, LOOP_END = 0.94
  let tool: P, onRamp = false
  if (t < RAMP_END) { onRamp = true; const u = t / RAMP_END; tool = { x: lerp(A.x, S.x, u), y: lerp(A.y, S.y, u) } }
  else if (t < LOOP_END) {
    const seg = loopPts.slice(1).map((p, i) => Math.hypot(p.x - loopPts[i].x, p.y - loopPts[i].y))
    const totLoop = seg.reduce((a, b) => a + b, 0) || 1
    let d = ((t - RAMP_END) / (LOOP_END - RAMP_END)) * totLoop
    tool = loopPts[loopPts.length - 1]
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i] || i === seg.length - 1) { const u = seg[i] ? clamp(d / seg[i], 0, 1) : 0; tool = { x: lerp(loopPts[i].x, loopPts[i + 1].x, u), y: lerp(loopPts[i].y, loopPts[i + 1].y, u) }; break }
      d -= seg[i]
    }
  } else { const u = (t - LOOP_END) / (1 - LOOP_END); tool = { x: lerp(S.x, leadOut.x, u), y: lerp(S.y, leadOut.y, u) } }

  const dProg = onRamp ? clamp(t / RAMP_END, 0, 1) : 1

  // Zoom: hold on the entry through the ramp, ease out to the full part as the cut begins.
  const zRaw = t < 0.46 ? 0 : t < 0.64 ? (t - 0.46) / 0.18 : 1
  const z = easeInOut(zRaw)
  const ew = 138, eh = (ew * VH) / VW
  const ecx = (A.x + S.x) / 2 + 12, ecy = Y1 - 2
  const ex = clamp(ecx - ew / 2, 0, VW - ew), ey = clamp(ecy - eh / 2, 0, VH - eh)
  const vb = [lerp(ex, 0, z), lerp(ey, 0, z), lerp(ew, VW, z), lerp(eh, VH, z)].map(n => n.toFixed(1)).join(' ')
  const labelOp = 1 - z * 0.6

  const toStr = (pts: P[]) => pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return (
    <div className="rounded-lg border border-edge-strong bg-surface-2/40 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] px-2 py-0.5 rounded border border-accent text-accent bg-accent/10">
          {straight ? 'Straight approach' : 'Offset approach'}
        </span>
        <span className="text-[9px] text-ink-subtle ml-auto">{z < 0.5 ? 'zoomed on entry' : 'plan view · as nested'}</span>
      </div>

      <div className="relative w-full mx-auto" style={{ maxWidth: 320 }}>
        <svg viewBox={vb} className="w-full block" style={{ maxHeight: 180 }} role="img" aria-label="perimeter ramp-in, plan view">
          {/* Sheet / waste background */}
          <rect x={6} y={26} width={252} height={136} rx={3} fill="#2c2925" stroke="#3f3a33" strokeWidth={0.8} />

          {/* Nesting margin — the waste gap kept around the part */}
          <rect x={X0 - marginPx} y={Y0 - marginPx} width={(X1 - X0) + 2 * marginPx} height={(Y1 - Y0) + 2 * marginPx}
            rx={2} fill="none" stroke="#7c9cb5" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.55} />
          <text x={X0 - marginPx + 1} y={Y0 - marginPx - 2} fontSize={6.5} fill="#7c9cb5" opacity={labelOp}>
            nesting margin{nestPad != null ? ` · ${nestPad}mm` : ''}
          </text>

          {/* The finished part */}
          <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} rx={2} fill="#3f3a33" stroke="#8a7d6b" strokeWidth={1.2} />
          <text x={(X0 + X1) / 2} y={(Y0 + Y1) / 2 + 2} textAnchor="middle" fontSize={8} fill="#8a8073" opacity={z}>part</text>

          {/* Perimeter cut path (faint) + ramp-in lead (dashed = descending) */}
          <polyline points={toStr(loopPts)} fill="none" stroke="#f59e0b" strokeWidth={1} opacity={0.22} strokeDasharray="3 2" />
          <line x1={A.x} y1={A.y} x2={S.x} y2={S.y} stroke="#f59e0b" strokeWidth={1.4} strokeDasharray="3 2" opacity={0.55} />

          {/* Approach point, offset dimension (within the margin), labels — fade on zoom-out */}
          <g opacity={labelOp}>
            <circle cx={A.x} cy={A.y} r={2} fill="#7dd3fc" />
            {!straight && offsetPx > 2 && <>
              <line x1={A.x - 9} y1={Y1} x2={A.x + 3} y2={Y1} stroke="#38bdf8" strokeWidth={0.6} opacity={0.7} />
              <line x1={A.x - 9} y1={A.y} x2={A.x + 3} y2={A.y} stroke="#38bdf8" strokeWidth={0.6} opacity={0.7} />
              <line x1={A.x - 6} y1={Y1} x2={A.x - 6} y2={A.y} stroke="#38bdf8" strokeWidth={1} />
              <text x={A.x - 8} y={(Y1 + A.y) / 2 + 2} textAnchor="end" fontSize={6.5} fill="#7dd3fc">
                offset{approachOffset != null ? ` ${approachOffset}mm` : ''}
              </text>
            </>}
            <text x={(A.x + S.x) / 2 + 3} y={A.y + 9} fontSize={6.5} fill="#f59e0b">ramp-in</text>
            {straight && <text x={A.x + 3} y={Y1 - 3} fontSize={6.5} fill="#7dd3fc">on edge</text>}
          </g>

          {/* Tool (circle from the top) */}
          <circle cx={tool.x} cy={tool.y} r={6} fill="#c7ccd4" stroke="#7c8494" strokeWidth={1} />
          <circle cx={tool.x} cy={tool.y} r={1.4} fill="#7c8494" />
        </svg>

        {/* Depth gauge — HTML overlay, immune to the SVG zoom */}
        <div className="absolute top-1 right-1 bottom-4 w-1.5 rounded bg-[#4a443b] overflow-hidden">
          <div className="absolute top-0 left-0 right-0 bg-amber-500 rounded" style={{ height: `${dProg * 100}%` }} />
        </div>
        <span className="absolute bottom-0 right-0 text-[8px] text-ink-subtle">{onRamp ? 'ramping ↓' : 'full depth'}</span>
      </div>

      <p className="text-[10px] text-ink-subtle leading-relaxed mt-1.5">
        {straight
          ? 'The bit ramps straight down onto the part edge (no lateral offset), then cuts around the perimeter.'
          : 'The bit rapids to a point offset into the waste — within the nesting margin — ramps onto the edge, then cuts the perimeter, so the entry/exit scar lands in the offcut, not the finished edge.'}
        {' '}No helix on perimeters.
      </p>
    </div>
  )
}
