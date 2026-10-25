'use client'

// Linked fixtures drawn inside the cabinet edit modal's ortho views (z_ubo U5):
// the oven in a UBO, a sink on its base… Each view draws the outline traced
// live from the fitted model (useFixtureViewShapes); while that loads, or with
// no model, elevation falls back to the stored front shape, else the box.
// Clicking one selects it (the modal shows its card); parts behind show through.

import type { LocalFixtureBox } from '@/src/lib/cabinetContents'
import { planShapePath } from '@/src/lib/fixturePlanShape'
import { stretchedElevShape } from '@/src/lib/fixtureStretch'
import { useFixtureViewShapes, fixtureTraceKey } from '@/src/lib/useFixtureViewShapes'

const FX_STROKE = '#38bdf8'
const FX_SEL    = '#facc15'

export default function CabinetFixturesOverlay({ view, fixtures, map, selectedId, onSelect }: {
  view: 'elevation' | 'top' | 'side'
  fixtures: LocalFixtureBox[]
  /** Cabinet-space (x, y, z) → SVG user point, the view's own projection. */
  map: (x: number, y: number, z: number) => { x: number; y: number }
  selectedId?: string | null
  onSelect?: (id: string) => void
}) {
  const traced = useFixtureViewShapes(fixtures)
  if (!fixtures.length) return null
  return (
    <g>
      {fixtures.map(b => {
        // Two opposite corners of the box projected into this view.
        const a = view === 'elevation' ? map(b.x0, b.y0 + b.h, 0)
          : view === 'top' ? map(b.x0, 0, b.z0)
          : map(0, b.y0 + b.h, b.z0)
        const c = view === 'elevation' ? map(b.x0 + b.w, b.y0, 0)
          : view === 'top' ? map(b.x0 + b.w, 0, b.z0 + b.d)
          : map(0, b.y0, b.z0 + b.d)
        const x = Math.min(a.x, c.x), y = Math.min(a.y, c.y)
        const w = Math.abs(c.x - a.x), h = Math.abs(c.y - a.y)
        const sel = selectedId === b.f.id
        const stroke = sel ? FX_SEL : FX_STROKE
        const views = traced.get(fixtureTraceKey(b) ?? '')
        const live = views ? (view === 'elevation' ? views.front : view === 'top' ? views.top : views.side) : null
        const shape = live?.lines.length ? live
          : view === 'elevation' && b.yaw === 0 && b.f.elev_shape?.lines.length ? stretchedElevShape(b.f.elev_shape, b.f) : null
        return (
          <g key={b.f.id} style={{ cursor: onSelect ? 'pointer' : undefined }}
            onClick={onSelect ? e => { e.stopPropagation(); onSelect(b.f.id) } : undefined}>
            <rect x={x} y={y} width={w} height={h} fill={stroke} fillOpacity={0.06}
              stroke={shape ? 'none' : stroke} strokeWidth={sel ? 2 : 1.2} strokeDasharray={shape ? undefined : '6 3'}
              vectorEffect="non-scaling-stroke" />
            {shape && (
              <path d={planShapePath(shape, w, h)} transform={`translate(${x},${y})`}
                fill="none" stroke={stroke} strokeWidth={sel ? 2 : 1.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            )}
            <text x={x + w / 2} y={y + 14} textAnchor="middle" fontSize={11} fill={stroke} style={{ pointerEvents: 'none' }}>
              {b.f.label || b.f.name}
            </text>
          </g>
        )
      })}
    </g>
  )
}
