'use client'

// ── Cabinet edit-modal measure tool ─────────────────────────────────────────────
// A lightweight ruler shared by the modal's Top / Elevation / Side ortho views.
// These views draw the cabinet at true mm scale (1 SVG user-unit = 1 mm, the view
// transforms only translate), so the raw point distance IS the measurement in mm.
//
// Snap candidates are the corners of every drawn part / hardware rect — the host
// view passes them in `pts` (already in SVG-user space). Interaction mirrors the
// plan / elevation canvas ruler: first click sets the start, second sets the end,
// a further click restarts; right-click (or toggling the tool off) clears it.

import { useEffect, useRef, useState } from 'react'
import { roundMm } from '@/src/lib/format'

export type MPt = { x: number; y: number }

export function rectCorners(r: { x: number; y: number; w: number; h: number }): MPt[] {
  return [
    { x: r.x,       y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x,       y: r.y + r.h },
    { x: r.x + r.w, y: r.y + r.h },
  ]
}

export function snapNearest(raw: MPt, pts: MPt[], threshold: number): { pt: MPt; snapped: boolean } {
  let best: MPt | null = null
  let bestD = threshold * threshold
  for (const p of pts) {
    const dx = p.x - raw.x, dy = p.y - raw.y
    const d = dx * dx + dy * dy
    if (d <= bestD) { bestD = d; best = p }
  }
  return best ? { pt: best, snapped: true } : { pt: raw, snapped: false }
}

// Measure interaction hook. Client coords are mapped to SVG-user space with the
// element's screen CTM, so it stays correct under viewBox zoom + preserveAspectRatio
// letterboxing. `pts` are the snap corners for the current view (SVG-user space).
export function useMeasure(
  active: boolean,
  svgRef: React.RefObject<SVGSVGElement | null>,
  pts: MPt[],
) {
  const [start, setStart]   = useState<MPt | null>(null)
  const [end, setEnd]       = useState<MPt | null>(null)
  const [cursor, setCursor] = useState<MPt | null>(null)
  const [snapped, setSnapped] = useState(false)

  const ptsRef = useRef(pts); ptsRef.current = pts

  // Clear any in-progress measurement when the tool is switched off.
  useEffect(() => {
    if (!active) { setStart(null); setEnd(null); setCursor(null); setSnapped(false) }
  }, [active])

  function locate(e: { clientX: number; clientY: number }) {
    const svg = svgRef.current
    if (!svg) return null
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const sp = svg.createSVGPoint()
    sp.x = e.clientX; sp.y = e.clientY
    const loc = sp.matrixTransform(ctm.inverse())
    const raw: MPt = { x: loc.x, y: loc.y }
    const scale = Math.abs(ctm.a) || 1   // screen-px per SVG-user-unit
    const thr = 11 / scale               // ~11px snap radius, in SVG-user units
    return snapNearest(raw, ptsRef.current, thr)
  }

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!active) return
    const s = locate(e)
    if (!s) return
    setCursor(s.pt); setSnapped(s.snapped)
  }

  function onClick(e: React.MouseEvent<SVGSVGElement>) {
    const s = locate(e)
    if (!s) return
    if (!start || end) { setStart(s.pt); setEnd(null); setCursor(s.pt) }
    else setEnd(s.pt)
    setSnapped(s.snapped)
  }

  function cancel() { setStart(null); setEnd(null); setCursor(null); setSnapped(false) }

  return { start, end, cursor, snapped, onMove, onClick, cancel }
}

function dist(a: MPt, b: MPt) { return Math.hypot(b.x - a.x, b.y - a.y) }

// Overlay drawn on top of the view. The line + endpoints live in world space; the
// numeric readout is pinned to the top-right of the current viewBox (`vb`) so it
// never sits over what you're measuring. `unit` (= current viewBox width / initial
// width) keeps glyph + label sizes roughly screen-constant across zoom levels.
export function MeasureOverlay({ start, end, cursor, snapped, unit, vb, pts = [] }: {
  start: MPt | null; end: MPt | null; cursor: MPt | null; snapped: boolean; unit: number
  vb: { x: number; y: number; w: number; h: number }
  pts?: MPt[]
}) {
  const a = start
  const b = end ?? cursor

  // Snap-point hints: only the candidates near the cursor are drawn (as faint
  // white dots), so a cabinet full of corners + drill holes never floods the view.
  // The radius is a fraction of the visible region, so it tightens as you zoom in.
  const hints = (() => {
    if (end || !cursor || !Array.isArray(pts)) return null   // hide once committed
    const r = vb.w * 0.06
    const r2 = r * r
    const dotR = 1.6 * unit
    const near: MPt[] = []
    for (const p of pts) {
      const dx = p.x - cursor.x, dy = p.y - cursor.y
      if (dx * dx + dy * dy <= r2) { near.push(p); if (near.length > 150) break }
    }
    if (near.length === 0) return null
    return (
      <g style={{ pointerEvents: 'none' }}>
        {near.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={dotR} fill="#e5e7eb" fillOpacity={0.55} />
        ))}
      </g>
    )
  })()

  if (!a) {
    // No start yet — show nearby snap dots + the active snap glyph while hovering.
    if (!cursor) return null
    return <g style={{ pointerEvents: 'none' }}>{hints}<SnapGlyph pt={cursor} unit={unit} on={snapped} /></g>
  }
  const ep = 4 * unit
  if (!b) {
    return (
      <g style={{ pointerEvents: 'none' }}>
        {hints}
        <circle cx={a.x} cy={a.y} r={ep} fill="#f59e0b" stroke="#111827" strokeWidth={1 * unit} />
      </g>
    )
  }
  const d   = roundMm(dist(a, b))
  const ddx = roundMm(Math.abs(b.x - a.x))
  const ddy = roundMm(Math.abs(b.y - a.y))

  const distLabel  = `${d}mm`
  const deltaLabel = `Δ${ddx} × ${ddy}`
  const fs  = 22 * unit          // distance readout
  const dfs = fs * 0.7           // delta line
  const pad = 10 * unit
  const gap = fs * 0.45          // space between the two lines
  // Width from the wider of the two lines (~0.62em per char for this font).
  const contentW = Math.max(distLabel.length * fs, deltaLabel.length * dfs) * 0.62
  const boxW = contentW + pad * 2
  const boxH = fs + gap + dfs + pad * 2
  // Pin to the top-right corner of the visible region, with a small margin.
  const margin = 14 * unit
  const boxX = vb.x + vb.w - boxW - margin
  const boxY = vb.y + margin
  const tx = boxX + boxW / 2
  const distY  = boxY + pad + fs * 0.5
  const deltaY = boxY + pad + fs + gap + dfs * 0.5
  return (
    <g style={{ pointerEvents: 'none' }}>
      {hints}
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke="#f59e0b" strokeWidth={1.5 * unit}
        strokeDasharray={end ? undefined : `${6 * unit} ${3 * unit}`} />
      <circle cx={a.x} cy={a.y} r={ep} fill="#f59e0b" stroke="#111827" strokeWidth={1 * unit} />
      <circle cx={b.x} cy={b.y} r={ep} fill="#f59e0b" stroke="#111827" strokeWidth={1 * unit} />
      <rect x={boxX} y={boxY} width={boxW} height={boxH} rx={4 * unit}
        fill="rgba(17,24,39,0.95)" stroke="#f59e0b" strokeWidth={1.25 * unit} />
      <text x={tx} y={distY} textAnchor="middle" dominantBaseline="middle"
        fontSize={fs} fontWeight="700" fill="#fcd34d" style={{ userSelect: 'none' }}>
        {distLabel}
      </text>
      <text x={tx} y={deltaY} textAnchor="middle" dominantBaseline="middle"
        fontSize={dfs} fontWeight="500" fill="#cbd5e1" style={{ userSelect: 'none' }}>
        {deltaLabel}
      </text>
      {!end && <SnapGlyph pt={b} unit={unit} on={snapped} />}
    </g>
  )
}

function SnapGlyph({ pt, unit, on }: { pt: MPt; unit: number; on: boolean }) {
  if (!on) return null
  const s = 5 * unit
  return (
    <rect x={pt.x - s} y={pt.y - s} width={s * 2} height={s * 2}
      fill="none" stroke="#22d3ee" strokeWidth={1.5 * unit} style={{ pointerEvents: 'none' }} />
  )
}
