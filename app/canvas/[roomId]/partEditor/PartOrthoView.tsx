'use client'

// ============================================================
// Part Editor — orthographic Top / Front / Side view.
// A true-mm SVG (1 user-unit = 1 mm), so it reuses the cabinet
// modal's measure tool verbatim (useMeasure + MeasureOverlay,
// corner snapping, x/y delta readout). Parts render UPRIGHT via
// a display frame: screen width sw / height sh come from the
// part-local u × v with an optional swap (panelKind !== 'side'),
// so X runs across the screen and Y up. Op data stays part-local;
// toS/fromS convert between part-local and screen. Each view:
//   front = sw × sh   ·   top = sw × n   ·   side = n × sh
// ============================================================

import { useState } from 'react'
import { fmtMm } from '@/src/lib/format'
import type { PartEdge, EbSpec } from '@/src/components/three/PartViewer'
import type { PartOp } from '../CabinetRoutesPanel'
import { useMeasure, MeasureOverlay, rectCorners, rectSegs, type MPt, type MSeg } from '../cabinetMeasure'
import { useSvgZoom } from '../ResolvedViews'
import { PLANE_EDGE_ENDS, type OrthoView } from './partEditorCore'
import { OpMarkersSVG, OpMarkersDepthSVG } from './partOpGlyphs'

export default function PartOrthoView({ u, v, n, swap, mirror, face, view, measuring, wire, edge, ebSpec, ops, selectedId, onSelect, levels, planePick, onPickPlane, snapOn, onDragMove, onDragEnd }: {
  u: number; v: number; n: number; swap: boolean; mirror?: boolean; face?: 'front' | 'back'; view: OrthoView; measuring: boolean
  wire?: boolean
  edge?: PartEdge; ebSpec?: EbSpec
  ops: PartOp[]; selectedId: string | null; onSelect: (id: string) => void
  levels: Record<string, 'error' | 'warn' | undefined>
  planePick?: boolean
  onPickPlane?: (patch: { plane_kind: string; plane_edge_index: number | null }) => void
  snapOn?: boolean
  onDragMove?: (id: string, px: number, py: number) => void
  onDragEnd?: (id: string, px: number, py: number) => void
}) {
  // Display frame: part-local (pos_x along u, pos_y along v) ⇄ screen (x across,
  // y up). Swap parts draw pos_y across and pos_x up so they stand upright.
  // `mirror` (right-hand parts, e.g. the right gable) flips the u axis so the part
  // reads interior-face-up like its left-hand twin — see mirrorGlyphX. It only
  // applies to un-swapped 'side' parts, so it lives on the non-swap branch.
  // Effective horizontal mirror: the part's own mirror (right-hand twins) XOR the
  // back-face view. Toggling to the Back face flips the elevation left↔right, as if
  // you physically turned the panel over — so a feature on the right edge stays on
  // the right as you'd see it from behind.
  const hmir = !!mirror !== (face === 'back')
  const toS   = (px: number, py: number) => (swap ? { sx: py, sy: px } : { sx: hmir ? u - px : px, sy: py })
  const fromS = (sx: number, sy: number) => (swap ? { px: sy, py: sx } : { px: hmir ? u - sx : sx, py: sy })
  const sw = swap ? v : u
  const sh = swap ? u : v
  const [vw, vh] = view === 'front' ? [sw, sh] : view === 'top' ? [sw, n] : [n, sh]
  // Absolute margin (mm) around the part, reserved for the overall-dimension
  // annotations drawn below (matching the cabinet Top/Elevation/Side views).
  const pad = Math.max(vw, vh) * 0.2
  const { svgRef, viewBox, vb, unit } = useSvgZoom(vw, vh, 1, pad)
  const [hoverEdge, setHoverEdge] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ id: string; edge: number | null; px: number; py: number } | null>(null)

  // The selected op's current plane, so its edge is highlighted (front view only).
  const selOp = ops.find(o => o.id === selectedId)
  const selEdge = selOp?.plane_kind === 'edge' ? selOp.plane_edge_index ?? null : null
  const pick = !!planePick && view === 'front' && !measuring

  // Part-local edge i (PLANE_EDGE_ENDS, unit coords scaled by u/v) → screen line,
  // through the display frame + SVG y-flip. plane_edge_index stays part-local.
  function edgeScreen(i: number): [number, number, number, number] {
    const [[ax, ay], [bx, by]] = PLANE_EDGE_ENDS[i]
    const a = toS(ax * u, ay * v), b = toS(bx * u, by * v)
    return [a.sx, vh - a.sy, b.sx, vh - b.sy]
  }

  // ── Drag-to-place (§8) ──────────────────────────────────────────────────────
  // Pointer (client) → screen face coords → part-local (via fromS).
  function clientToLocal(e: React.PointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current; if (!svg) return null
    const ctm = svg.getScreenCTM(); if (!ctm) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    const { px, py } = fromS(p.x, vh - p.y)
    return { x: px, y: py }
  }
  // Clamp to the part (part-local u × v); hold an edge op on its edge (slide along
  // it); and (snap on) pull the free axis to the nearest grid line / edge / op.
  function constrain(px: number, py: number, edge: number | null): { px: number; py: number } {
    px = Math.max(0, Math.min(u, px)); py = Math.max(0, Math.min(v, py))
    const xFixed = edge === 1 || edge === 3, yFixed = edge === 0 || edge === 2
    if (edge === 0) py = 0; else if (edge === 2) py = v; else if (edge === 3) px = 0; else if (edge === 1) px = u
    if (snapOn) {
      const STEP = 10, TOL = 4
      const others = ops.filter(o => o.id !== drag?.id)
      const snapAxis = (val: number, ext: number, centres: number[], fixed: boolean) => {
        if (fixed) return val
        let best = val, bestD = TOL
        for (const t of [0, ext, ...centres]) { const d = Math.abs(t - val); if (d < bestD) { bestD = d; best = t } }
        return bestD < TOL ? best : Math.round(val / STEP) * STEP
      }
      px = snapAxis(px, u, others.map(o => o.pos_x ?? 0), xFixed)
      py = snapAxis(py, v, others.map(o => o.pos_y ?? 0), yFixed)
    }
    return { px, py }
  }
  function startDrag(op: PartOp, e: React.PointerEvent) {
    if (measuring || pick || !onDragMove) return
    e.stopPropagation()
    onSelect(op.id)
    const edge = op.plane_kind === 'edge' ? (op.plane_edge_index ?? null) : null
    setDrag({ id: op.id, edge, px: op.pos_x ?? 0, py: op.pos_y ?? 0 })
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }
  function svgPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (drag) {
      const uv = clientToLocal(e); if (!uv) return
      const { px, py } = constrain(uv.x, uv.y, drag.edge)
      setDrag(d => (d ? { ...d, px, py } : d))
      onDragMove?.(drag.id, px, py)
      return
    }
    if (measuring) measure.onMove(e)
  }
  function svgPointerUp() {
    if (drag) { onDragEnd?.(drag.id, drag.px, drag.py); setDrag(null) }
  }

  // ── Edge-band tape (front view) ─────────────────────────────────────────────
  // The display frame maps part.edge top/bottom/left/right straight onto the screen
  // rect: top→y0, bottom→y-max, left→x0, right→x-max. `mirror` (right-hand parts)
  // swaps which screen side the left/right bands land on, matching the flipped
  // drilling. The finished part outline includes the tape; the raw panel corner is
  // inset by the tape thickness on each banded side. Strips are true thickness —
  // measurements snap to these lines, so the geometry can't be fudged for
  // visibility; the 1px non-scaling stroke below keeps a thin strip visible.
  const ebT = ebSpec?.thick ?? 0
  const ebSide = view === 'front' && ebSpec && edge && ebT > 0
    ? { top: edge.top, bottom: edge.bottom, left: hmir ? edge.right : edge.left, right: hmir ? edge.left : edge.right }
    : null
  const ebStrips: { key: string; x: number; y: number; w: number; h: number }[] = []
  if (ebSide) {
    if (ebSide.top)    ebStrips.push({ key: 'et', x: 0,        y: 0,        w: vw,  h: ebT })
    if (ebSide.bottom) ebStrips.push({ key: 'eb', x: 0,        y: vh - ebT, w: vw,  h: ebT })
    if (ebSide.left)   ebStrips.push({ key: 'el', x: 0,        y: 0,        w: ebT, h: vh })
    if (ebSide.right)  ebStrips.push({ key: 'er', x: vw - ebT, y: 0,        w: ebT, h: vh })
  }
  const ebCore = ebSide ? (() => {
    const x0 = ebSide.left ? ebT : 0, x1 = ebSide.right ? vw - ebT : vw
    const y0 = ebSide.top ? ebT : 0, y1 = ebSide.bottom ? vh - ebT : vh
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  })() : null
  // Raw panel corners are explicit high-priority construction points. Without
  // priority, a 0.4–1 mm tape offset is often smaller than one screen pixel and
  // the finished-part corner wins every nearest-candidate comparison.
  const panelCornerPts = ebCore ? rectCorners(ebCore) : []

  // Snap candidates = part rectangle corners + edge midpoints + (front view) op
  // centres — matching the cabinet modal's "corners, edge midpoints, op centres" —
  // plus, for the tape: every strip corner and the bare-board corners (as points),
  // and every strip side plus the bare-board sides (as segments, snappable at any
  // point along them). So a measurement can start from the finished face, from the
  // board behind the tape, or anywhere down either line.
  const measurePts: MPt[] = []
  const measureSegs: MSeg[] = []
  if (measuring) {
    measurePts.push(...rectCorners({ x: 0, y: 0, w: vw, h: vh }))
    measurePts.push({ x: vw / 2, y: 0 }, { x: vw / 2, y: vh }, { x: 0, y: vh / 2 }, { x: vw, y: vh / 2 })
    if (view === 'front') for (const op of ops) { const s = toS(op.pos_x ?? 0, op.pos_y ?? 0); measurePts.push({ x: s.sx, y: vh - s.sy }) }
    if (ebCore) {
      for (const s of ebStrips) { measurePts.push(...rectCorners(s)); measureSegs.push(...rectSegs(s)) }
      measurePts.push(...panelCornerPts)
      measureSegs.push(...rectSegs(ebCore))
      // Strip mid-sides, so the tape has the same midpoint affordance as the part.
      for (const s of ebStrips) measurePts.push(
        { x: s.x + s.w / 2, y: s.y }, { x: s.x + s.w / 2, y: s.y + s.h },
        { x: s.x, y: s.y + s.h / 2 }, { x: s.x + s.w, y: s.y + s.h / 2 },
      )
    }
  }
  // Tape corners/sides coincide with the part outline on unbanded axes, and adjacent
  // strips share their overlap. Collapse the duplicates so the overlay doesn't stack
  // hint dots on one pixel and snapNearest doesn't rescan the same line.
  const uniq = <T,>(xs: T[], key: (t: T) => string) => {
    const seen = new Set<string>()
    return xs.filter(x => { const k = key(x); return seen.has(k) ? false : (seen.add(k), true) })
  }
  const k1 = (p: MPt) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`
  const measurePtsUniq = uniq(measurePts, k1)
  // Order-independent key: a side is the same line whichever end it starts from.
  const measureSegsUniq = uniq(measureSegs, s => [k1(s.a), k1(s.b)].sort().join('|'))
  const measure = useMeasure(measuring, svgRef, measurePtsUniq, measureSegsUniq, panelCornerPts)

  function handleContextMenu(e: React.MouseEvent<SVGSVGElement>) {
    e.preventDefault()
    if (measuring) measure.cancel()
  }

  // Faint mm grid (every 50 mm) inside the part bounds.
  const cell = 50
  const grid: React.ReactNode[] = []
  for (let x = cell; x < vw; x += cell) grid.push(<line key={`gx${x}`} x1={x} y1={0} x2={x} y2={vh} stroke="#1e2636" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />)
  for (let y = cell; y < vh; y += cell) grid.push(<line key={`gy${y}`} x1={0} y1={y} x2={vw} y2={y} stroke="#1e2636" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />)

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      width="100%" height="100%"
      style={{ maxHeight: '100%', maxWidth: '100%', touchAction: 'none', cursor: measuring ? 'crosshair' : drag ? 'grabbing' : 'default' }}
      onClick={measuring ? measure.onClick : undefined}
      onPointerMove={svgPointerMove}
      onPointerUp={svgPointerUp}
      onPointerCancel={svgPointerUp}
      onContextMenu={handleContextMenu}
    >
      <rect x={0} y={0} width={vw} height={vh} fill={wire ? 'transparent' : '#243045'} stroke="#5b6373" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <g style={{ pointerEvents: 'none' }}>{grid}</g>

      {/* Edge-band tape on the banded edges (front view only) — geometry from
          ebStrips above, filled at true thickness with a 1px min stroke. */}
      {ebSpec && ebStrips.length > 0 && (
        <g style={{ pointerEvents: 'none' }}>
          {ebStrips.map(s => (
            <rect key={s.key} x={s.x} y={s.y} width={s.w} height={s.h}
              fill={ebSpec.color} stroke={ebSpec.color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      )}

      {/* Overall dimensions — same white dashed-line + end-tick + "Nmm" label
          format as the cabinet Top/Elevation/Side views (cabinetEditSvgHelpers
          dimH/dimV), scaled to this view and drawn in the reserved `pad` margin:
          width below the part, height/thickness to its left. */}
      {(() => {
        const fs = Math.max(vw, vh) / 34   // scale-relative font (mm units)
        const tick = fs * 0.55
        const dimY = vh + pad * 0.42        // horizontal dim, below the part
        const dimX = -pad * 0.42            // vertical dim, left of the part
        const L = { stroke: '#ffffff', strokeWidth: 1.25, vectorEffect: 'non-scaling-stroke' as const }
        return (
          <g style={{ pointerEvents: 'none' }} fontFamily="system-ui,sans-serif">
            <line x1={0} y1={dimY} x2={vw} y2={dimY} strokeDasharray="5 3" {...L} />
            <line x1={0}  y1={dimY - tick} x2={0}  y2={dimY + tick} {...L} />
            <line x1={vw} y1={dimY - tick} x2={vw} y2={dimY + tick} {...L} />
            <text x={vw / 2} y={dimY + fs * 1.1} textAnchor="middle" dominantBaseline="central" fontSize={fs} fill="#ffffff">{fmtMm(vw)}mm</text>
            <line x1={dimX} y1={0} x2={dimX} y2={vh} strokeDasharray="5 3" {...L} />
            <line x1={dimX - tick} y1={0}  x2={dimX + tick} y2={0}  {...L} />
            <line x1={dimX - tick} y1={vh} x2={dimX + tick} y2={vh} {...L} />
            <text x={dimX - fs * 0.5} y={vh / 2} textAnchor="end" dominantBaseline="central" fontSize={fs} fill="#ffffff">{fmtMm(vh)}mm</text>
          </g>
        )
      })()}
      {/* Operation markers. Front view: face glyphs, draggable when not
          measuring/plane-picking (§8). Top/Side: the same ops projected to
          their footprint × cutting depth from the front face (click-select
          only — position editing stays in the Front view). */}
      {view === 'front'
        ? <OpMarkersSVG ops={ops} pu={u} pv={v} swap={swap} mirror={hmir} activeFace={face} selectedId={selectedId} onSelect={onSelect} interactive={!measuring && !pick} levels={levels} onStartDrag={!measuring && !pick ? startDrag : undefined} />
        : <OpMarkersDepthSVG ops={ops} pu={u} pv={v} n={n} swap={swap} mirror={hmir} activeFace={face} view={view} selectedId={selectedId} onSelect={onSelect} interactive={!measuring && !pick} levels={levels} />}

      {/* Selected op's current edge, highlighted (§7.2 "the marker moves live"). */}
      {view === 'front' && selEdge != null && (() => {
        const [x1, y1, x2, y2] = edgeScreen(selEdge)
        return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#a78bfa" strokeWidth={3} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
      })()}

      {/* Plane-pick mode (§7.2): click a highlighted edge, or the interior for the front face. */}
      {pick && onPickPlane && (
        <g>
          <rect x={vw * 0.12} y={vh * 0.12} width={vw * 0.76} height={vh * 0.76}
            fill="#a78bfa" fillOpacity={0.06} stroke="#a78bfa" strokeDasharray="4 4"
            strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ cursor: 'pointer' }}
            onClick={() => onPickPlane({ plane_kind: face === 'back' ? 'face_back' : 'face_front', plane_edge_index: null })} />
          {[0, 1, 2, 3].map(i => {
            const [x1, y1, x2, y2] = edgeScreen(i)
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={hoverEdge === i ? '#c4b5fd' : '#7c3aed'}
                strokeWidth={hoverEdge === i ? 14 : 9} strokeLinecap="round"
                vectorEffect="non-scaling-stroke" strokeOpacity={hoverEdge === i ? 0.9 : 0.55}
                style={{ cursor: 'pointer' }}
                onPointerEnter={() => setHoverEdge(i)} onPointerLeave={() => setHoverEdge(null)}
                onClick={() => onPickPlane({ plane_kind: 'edge', plane_edge_index: i })} />
            )
          })}
        </g>
      )}
      {measuring && (
        <MeasureOverlay start={measure.start} end={measure.end} cursor={measure.cursor}
          snapped={measure.snapped} unit={unit} vb={vb} pts={measurePtsUniq} />
      )}

      {/* Live coordinate readout following the dragged marker — screen X/Y (§8). */}
      {drag && (() => {
        const fs = Math.max(vw, vh) / 45
        const s = toS(drag.px, drag.py)
        const label = `${Math.round(s.sx)}, ${Math.round(s.sy)}`
        const bx = s.sx + fs, by = (vh - s.sy) - fs * 2.2
        return (
          <g style={{ pointerEvents: 'none' }}>
            <rect x={bx} y={by} width={fs * (label.length * 0.62 + 0.8)} height={fs * 1.6}
              fill="#0b1220" stroke="#38bdf8" strokeWidth={0.5} vectorEffect="non-scaling-stroke" rx={fs * 0.25} />
            <text x={bx + fs * 0.4} y={by + fs * 1.1} fontSize={fs} fill="#7dd3fc" fontFamily="monospace">{label}</text>
          </g>
        )
      })()}
    </svg>
  )
}
