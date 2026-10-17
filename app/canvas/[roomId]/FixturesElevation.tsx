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
import { fixtureOnFace, fixtureLayer, openingOnWall } from '@/src/lib/fixtureGeometry'

// Door / window (P5) drawn over its hole: frame + sash (window), leaf with
// dashed swing lines to the hinge jamb + handle (door), two panels (sliding).
export function OpeningElev({ kind, x, y, w, h, hingeT, color, lw, z }: {
  kind: string; x: number; y: number; w: number; h: number; hingeT: number; color: string; lw: number; z: number
}) {
  const k = kind.toLowerCase(), thin = lw * 0.6, fr = Math.min(50, w / 10, h / 10)
  const dash = `${10 / z} ${6 / z}`
  if (k.includes('window')) {
    return <>
      <rect x={x + fr} y={y + fr} width={w - 2 * fr} height={h - 2 * fr} fill="none" stroke={color} strokeWidth={thin} />
      {w > 1200 && <line x1={x + w / 2} y1={y + fr} x2={x + w / 2} y2={y + h - fr} stroke={color} strokeWidth={thin} />}
    </>
  }
  if (k.includes('sliding')) {
    return <>
      <rect x={x + fr} y={y + fr} width={w / 2 - fr} height={h - 2 * fr} fill="none" stroke={color} strokeWidth={thin} />
      <rect x={x + w / 2} y={y + fr} width={w / 2 - fr} height={h - 2 * fr} fill="none" stroke={color} strokeWidth={thin} />
    </>
  }
  if (k.includes('door')) {
    const hingeLeft = Math.abs(hingeT - x) < Math.abs(hingeT - (x + w))
    const hx = hingeLeft ? x : x + w, fx = hingeLeft ? x + w : x
    const handleX = hingeLeft ? x + w - Math.min(80, w / 8) : x + Math.min(80, w / 8)
    return <>
      <line x1={fx} y1={y} x2={hx} y2={y + h / 2} stroke={color} strokeWidth={thin} strokeDasharray={dash} />
      <line x1={fx} y1={y + h} x2={hx} y2={y + h / 2} stroke={color} strokeWidth={thin} strokeDasharray={dash} />
      <circle cx={handleX} cy={Math.max(y + h * 0.3, y + h - 1000)} r={Math.max(15, 4 / z)} fill="none" stroke={color} strokeWidth={thin} />
    </>
  }
  return null
}

const STROKE = '#0ea5e9'

/** The wall-face holes for openings in this wall — drawn right after the wall face, under the cabinets. */
export function OpeningHoles({ fixtures, wall, side, roomCx, roomH, layers, fill }: {
  fixtures: RoomFixture[]; wall: Wall; side: WallSide; roomCx: Pt; roomH: number; layers: LayerView; fill: string
}) {
  if (!layers.show('fixture_openings')) return null
  return <g style={{ pointerEvents: 'none' }}>
    {fixtures.map(fx => {
      const o = openingOnWall(fx, wall, side, roomCx)
      return o && <rect key={fx.id} x={o.t0} y={roomH - fx.z - fx.height} width={o.t1 - o.t0} height={fx.height} fill={fill} />
    })}
  </g>
}

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
        if (fx.category === 'opening') {
          // Holes are cut under the cabinets by OpeningHoles; this is the frame + symbol.
          const o = openingOnWall(fx, wall, side, roomCx)
          if (!o) return null
          const sel = fx.id === selectedId
          const lp = layers.props(id, z)
          const color = sel ? '#f59e0b' : layers.color(id, '#94a3b8')
          const lw = layers.w(id, (sel ? 2 : 1.4) / z)
          const x = o.t0, w = o.t1 - o.t0, y = roomH - fx.z - fx.height, h = fx.height
          return (
            <g key={fx.id} opacity={lp.opacity} style={{ cursor: 'pointer' }}
              onPointerDown={e => { e.stopPropagation(); onSelect(fx.id) }}>
              <rect x={x} y={y} width={w} height={h} fill="transparent" stroke={color} strokeWidth={lw} />
              <OpeningElev kind={fx.kind ?? ''} x={x} y={y} w={w} h={h} hingeT={o.hingeT} color={color} lw={lw} z={z} />
            </g>
          )
        }
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
