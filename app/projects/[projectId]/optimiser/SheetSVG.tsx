'use client'

// ============================================================
// Renders one nested sheet as scaled SVG — boundary, trim margin
// and placed parts with labels + grain indicator. Raw SVG, no
// react-konva (spec §8.2). Shared by Stage 4 thumbnails and the
// Stage 5 manual-editing canvas; interaction hooks are optional.
// ============================================================

import type { NestedSheet } from '@/src/lib/optimiser/nest'
import type { ShapePt } from '@/src/lib/shapePath'
import { blockRectOn, type GrainBlockInfo } from '@/src/lib/optimiser/grainBlocks'
import { grainArrow, grainMatchColour } from '@/src/lib/grainMatch'

type Placement = NestedSheet['placements'][number]

/** Shaped part (phase plan O3): the bbox stays as a faint footprint and the
 *  real outline is drawn filled inside it. `local` = shapes.placedOutline
 *  (sheet axes, relative to the placement corner); x / y = where it sits. */
export function PlacedOutline({ local, x, y, H, scale, on }: {
  local: ShapePt[]; x: number; y: number; H: number; scale: number; on: boolean
}) {
  const pts = local.map(p => `${((x + p.x) * scale).toFixed(1)},${((H - y - p.y) * scale).toFixed(1)}`).join(' ')
  return (
    <polygon points={pts} style={{ pointerEvents: 'none' }}
      fill={on ? '#2563eb' : '#1e3a5f'} fillOpacity={on ? 0.75 : 0.6}
      stroke={on ? '#93c5fd' : '#60a5fa'} strokeWidth={on ? 1.4 : 0.8} strokeLinejoin="round" />
  )
}

/** Through-cut holes (benchtop cutouts) of a placed part, relative to the
 *  placement corner (shapes.placedHoles) — drawn as sheet showing through. */
export function PlacedHoles({ holes, x, y, H, scale }: {
  holes: ShapePt[][]; x: number; y: number; H: number; scale: number
}) {
  return <>{holes.map((h, i) => (
    <polygon key={i} style={{ pointerEvents: 'none' }}
      points={h.map(p => `${((x + p.x) * scale).toFixed(1)},${((H - y - p.y) * scale).toFixed(1)}`).join(' ')}
      fill="#0f172a" stroke="#60a5fa" strokeWidth={0.6} strokeDasharray="2 1.5" />
  ))}</>
}

/** Grain match blocks on a sheet (z_grain_match G5): an outline round each block in
 *  its group colour + a GM1 ↔ tag. `shift` moves one block live (Stage 5 drag). */
export function GrainBlockOutlines({ sheet, blocks, H, scale, shift, fontPx = 10 }: {
  sheet: NestedSheet; blocks: GrainBlockInfo[]; H: number; scale: number
  shift?: { uids: ReadonlySet<string>; dx: number; dy: number } | null; fontPx?: number
}) {
  return <>{blocks.map(b => {
    const r = blockRectOn(sheet, b)
    if (!r) return null
    const moving = shift && b.memberUids.some(u => shift.uids.has(u))
    const x = r.x + (moving ? shift!.dx : 0), y = r.y + (moving ? shift!.dy : 0)
    const col = grainMatchColour(b)
    const pad = 3
    const tag = `${b.name} ${grainArrow(b.direction)}${b.pieces > 1 ? ` ${b.piece}/${b.pieces}` : ''}`
    const left = x * scale - pad, top = (H - y - r.h) * scale - pad
    return (
      <g key={b.uid} style={{ pointerEvents: 'none' }}>
        <rect x={left} y={top} width={r.w * scale + pad * 2} height={r.h * scale + pad * 2}
          fill="none" stroke={col} strokeWidth={1.5} strokeDasharray="6 3" rx={2} />
        <rect x={left + pad} y={top + pad} width={tag.length * fontPx * 0.62 + 6} height={fontPx * 1.3} rx={2} fill={col} />
        <text x={left + pad + 3} y={top + pad + fontPx * 0.95} fontSize={fontPx} fontWeight={700} fill="#fff" fontFamily="Arial, Helvetica, sans-serif">{tag}</text>
      </g>
    )
  })}</>
}

export default function SheetSVG({
  sheet, pxWidth, selectedUid, onPartClick, showLabels = true, outlineFor, holesFor, blocks,
}: {
  /** Grain match blocks of the run (only this sheet's are drawn). */
  blocks?: GrainBlockInfo[]
  sheet: NestedSheet
  pxWidth: number
  selectedUid?: string | null
  onPartClick?: (uid: string) => void
  showLabels?: boolean
  outlineFor?: (pl: Placement) => ShapePt[] | null
  holesFor?: (pl: Placement) => ShapePt[][]
}) {
  const { w: W, h: H, trimTop, trimBottom, trimLeft, trimRight } = sheet.stock
  const scale = pxWidth / W
  const pxHeight = H * scale
  // SVG y is top-down; sheet y is bottom-up → flip.
  const fy = (y: number, h = 0) => (H - y - h) * scale

  return (
    <svg width={pxWidth} height={pxHeight} viewBox={`0 0 ${pxWidth} ${pxHeight}`} className="block">
      {/* Sheet */}
      <rect x={0} y={0} width={pxWidth} height={pxHeight} fill="#0f172a" stroke="#475569" strokeWidth={1} />
      {/* Trim / usable margin */}
      {(trimTop || trimBottom || trimLeft || trimRight) > 0 && (
        <rect
          x={trimLeft * scale} y={trimTop * scale}
          width={(W - trimLeft - trimRight) * scale} height={(H - trimTop - trimBottom) * scale}
          fill="none" stroke="#334155" strokeWidth={1} strokeDasharray="3 3" />
      )}
      {/* Parts */}
      {sheet.placements.map(p => {
        const on = selectedUid === p.uid
        const outline = outlineFor?.(p) ?? null
        return (
          <g key={p.uid} onClick={onPartClick ? () => onPartClick(p.uid) : undefined}
            style={{ cursor: onPartClick ? 'pointer' : 'default' }}>
            <rect
              x={p.x * scale} y={fy(p.y, p.h)} width={p.w * scale} height={p.h * scale}
              fill={on ? '#2563eb' : '#1e3a5f'} fillOpacity={outline ? 0.12 : on ? 0.55 : 0.4}
              stroke={on ? '#60a5fa' : '#3b82f6'} strokeWidth={outline ? 0.5 : on ? 1.6 : 0.8}
              strokeDasharray={outline ? '3 2' : undefined} />
            {outline && <PlacedOutline local={outline} x={p.x} y={p.y} H={H} scale={scale} on={on} />}
            {holesFor && <PlacedHoles holes={holesFor(p)} x={p.x} y={p.y} H={H} scale={scale} />}
            {/* Grain indicator: arrow along the part's height (vertical = with grain) */}
            {p.rotated && (
              <line x1={(p.x + p.w / 2) * scale} y1={fy(p.y, p.h) + 4} x2={(p.x + p.w / 2) * scale} y2={fy(p.y, p.h) + p.h * scale - 4}
                stroke="#64748b" strokeWidth={0.6} strokeDasharray="2 2" />
            )}
            {showLabels && p.w * scale > 28 && p.h * scale > 12 && (
              <text x={(p.x + p.w / 2) * scale} y={fy(p.y, p.h) + (p.h * scale) / 2}
                textAnchor="middle" dominantBaseline="middle" fill="#cbd5e1"
                fontSize={Math.min(10, Math.max(6, p.h * scale / 4))} fontFamily="monospace">
                {p.label.length > 14 ? p.label.slice(0, 13) + '…' : p.label}
              </text>
            )}
          </g>
        )
      })}
      {blocks && blocks.length > 0 && <GrainBlockOutlines sheet={sheet} blocks={blocks} H={H} scale={scale} fontPx={8} />}
    </svg>
  )
}
