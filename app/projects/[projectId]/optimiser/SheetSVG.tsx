'use client'

// ============================================================
// Renders one nested sheet as scaled SVG — boundary, trim margin
// and placed parts with labels + grain indicator. Raw SVG, no
// react-konva (spec §8.2). Shared by Stage 4 thumbnails and the
// Stage 5 manual-editing canvas; interaction hooks are optional.
// ============================================================

import type { NestedSheet } from '@/src/lib/optimiser/nest'
import type { ShapePt } from '@/src/lib/shapePath'

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

export default function SheetSVG({
  sheet, pxWidth, selectedUid, onPartClick, showLabels = true, outlineFor,
}: {
  sheet: NestedSheet
  pxWidth: number
  selectedUid?: string | null
  onPartClick?: (uid: string) => void
  showLabels?: boolean
  outlineFor?: (pl: Placement) => ShapePt[] | null
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
    </svg>
  )
}
