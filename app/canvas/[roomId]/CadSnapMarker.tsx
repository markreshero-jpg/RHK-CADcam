'use client'

// Object-snap marker for the CAD tools (z_CAD_tool B2) — the usual CAD glyphs:
// square = endpoint, triangle = midpoint, circle = centre, X = intersection,
// ⟂ = perpendicular, hourglass = nearest on an edge. `size` is in svg units.

import type { Pt } from '@/src/lib/annotations/geometry'

const COL = '#facc15'

export default function CadSnapMarker({ pt, kind, size }: { pt: Pt; kind: string; size: number }) {
  const { x, y } = pt, h = size / 2
  const common = { fill: 'none', stroke: COL, strokeWidth: size / 6, style: { pointerEvents: 'none' as const } }
  switch (kind) {
    case 'end':           return <rect x={x - h} y={y - h} width={size} height={size} {...common} />
    case 'mid':           return <path d={`M${x} ${y - h}L${x + h} ${y + h}L${x - h} ${y + h}Z`} {...common} />
    case 'centre':        return <circle cx={x} cy={y} r={h} {...common} />
    case 'intersection':  return <path d={`M${x - h} ${y - h}L${x + h} ${y + h}M${x + h} ${y - h}L${x - h} ${y + h}`} {...common} />
    case 'perpendicular': return <path d={`M${x - h} ${y - h}V${y + h}H${x + h}M${x - h} ${y}H${x}V${y + h}`} {...common} />
    default:              return <path d={`M${x - h} ${y - h}H${x + h}L${x - h} ${y + h}H${x + h}Z`} {...common} />   // nearest
  }
}
