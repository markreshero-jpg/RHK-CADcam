'use client'

// ── Fixtures on a wall elevation (z_fixtures P2) ──────────────────────────────
// A fixture shows on the wall face it backs onto and faces (fixtureOnFace — free
// standing items within reach count too). Elevation x = distance along the face
// (back side mirrored, matching BenchtopElevation); y = roomH − top.
// Drawn as its outline with the name; gated per category by the fixture_* items.

import type { RoomFixture, Wall } from '@/src/lib/types'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import type { Pt } from '@/src/lib/geometry'
import { wallFrame, type WallSide } from '@/src/lib/benchtopAnchor'
import { fixtureOnFace, fixtureLayer } from '@/src/lib/fixtureGeometry'

const STROKE = '#0ea5e9'

export default function FixturesElevation({
  fixtures, wall, side, roomCx, roomH, zoom, layers, selectedId, onSelect,
}: {
  fixtures:   RoomFixture[]
  wall:       Wall
  side:       WallSide
  roomCx:     Pt
  roomH:      number
  zoom:       number
  layers:     LayerView
  selectedId: string | null
  onSelect:   (id: string) => void
}) {
  const f0 = wallFrame(wall, side, roomCx)
  const f = side === 'back'
    ? { ...f0, o: { x: f0.o.x + f0.d.x * f0.len, y: f0.o.y + f0.d.y * f0.len }, d: { x: -f0.d.x, y: -f0.d.y } }
    : f0
  const z = zoom
  const showLabels = layers.show('fixture_labels')

  return (
    <g>
      {fixtures.map(fx => {
        const id = fixtureLayer(fx.category)
        if (!layers.show(id)) return null
        const on = fixtureOnFace(fx, f)
        if (!on) return null
        const sel = fx.id === selectedId
        const lp = layers.props(id, z)
        const color = sel ? '#f59e0b' : layers.color(id, STROKE)
        const lw = layers.w(id, (sel ? 2 : 1.4) / z)
        const x = on.t0, w = on.t1 - on.t0
        const y = roomH - fx.z - fx.height, h = fx.height
        const fs = Math.max(11 / z, Math.min(w, h) / 8)
        return (
          <g key={fx.id} opacity={lp.opacity} style={{ cursor: 'pointer' }}
            onPointerDown={e => { e.stopPropagation(); onSelect(fx.id) }}>
            <rect x={x} y={y} width={w} height={h} fill={STROKE} fillOpacity={0.06 * (lp.fillOpacity ?? 1)}
              stroke={color} strokeWidth={lw} strokeDasharray={lp.strokeDasharray} />
            {fx.category === 'appliance' && (
              <rect x={x + w * 0.08} y={y + h * 0.08} width={w * 0.84} height={h * 0.84}
                fill="none" stroke={color} strokeWidth={lw * 0.6} />
            )}
            {showLabels && (
              <text x={x + w / 2} y={y + h / 2} fontSize={fs} fill={color} textAnchor="middle" dominantBaseline="central"
                style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {fx.name}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}
