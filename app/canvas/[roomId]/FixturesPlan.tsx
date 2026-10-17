'use client'

// ── Fixtures on the plan (z_fixtures P2) ──────────────────────────────────────
// Each fixture draws in its own frame (back-left origin, +x width, +y toward the
// front) with a symbol by category / kind: appliance = box + cross (cooktop =
// four burners), sink = bowl, tap = circle, decorative = ellipse. The front edge
// is drawn heavier. Gated per category by the fixture_* layer items; names by
// fixture_labels. Rendered inside CanvasSVG's world transform.

import type { RoomFixture } from '@/src/lib/types'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import { fixtureLayer } from '@/src/lib/fixtureGeometry'
import type { FixtureSnap } from '@/src/lib/fixtureGeometry'

const STROKE = '#0ea5e9'
const FILL   = '#0ea5e9'
const CLASH  = '#dc2626'

type Body = Pick<RoomFixture, 'category' | 'kind' | 'name' | 'width' | 'depth'> & Partial<Pick<RoomFixture, 'hinge_side' | 'swing'>>

// Doors / windows (P5), in the opening's frame: y = 0 outer face, y = depth the
// inside face (room side). Hinge side is as seen from inside the room (x = 0 = left).
export function OpeningSymbol({ f, z, color, lw }: { f: Body; z: number; color: string; lw: number }) {
  const w = f.width, d = f.depth
  const kind = (f.kind ?? '').toLowerCase()
  const thin = lw * 0.6
  const jambs = <>
    <line x1={0} y1={0} x2={0} y2={d} stroke={color} strokeWidth={lw} />
    <line x1={w} y1={0} x2={w} y2={d} stroke={color} strokeWidth={lw} />
  </>
  if (kind.includes('window')) {
    return <>{jambs}
      <line x1={0} y1={d * 0.4} x2={w} y2={d * 0.4} stroke={color} strokeWidth={thin} />
      <line x1={0} y1={d * 0.6} x2={w} y2={d * 0.6} stroke={color} strokeWidth={thin} />
    </>
  }
  if (kind.includes('sliding')) {
    const t = Math.max(20, d * 0.2)
    return <>{jambs}
      <rect x={0} y={d * 0.5 - t} width={w * 0.55} height={t} fill="none" stroke={color} strokeWidth={thin} />
      <rect x={w * 0.45} y={d * 0.5} width={w * 0.55} height={t} fill="none" stroke={color} strokeWidth={thin} />
    </>
  }
  if (kind.includes('door')) {
    const left = (f.hinge_side ?? 'left') === 'left'
    const inward = (f.swing ?? 'in') === 'in'
    const hx = left ? 0 : w, ox = left ? w : 0
    const y0 = inward ? d : 0, ey = inward ? d + w : -w
    const sweep = left === inward ? 1 : 0
    return <>{jambs}
      <line x1={hx} y1={y0} x2={hx} y2={ey} stroke={color} strokeWidth={lw} />
      <path d={`M ${ox} ${y0} A ${w} ${w} 0 0 ${sweep} ${hx} ${ey}`} fill="none" stroke={color} strokeWidth={thin} strokeDasharray={`${8 / z} ${5 / z}`} />
    </>
  }
  // archway / plain opening: jambs + dashed head
  return <>{jambs}
    <line x1={0} y1={d / 2} x2={w} y2={d / 2} stroke={color} strokeWidth={thin} strokeDasharray={`${12 / z} ${8 / z}`} />
  </>
}

function Symbol({ f, z, color, lw }: { f: Body; z: number; color: string; lw: number }) {
  const w = f.width, d = f.depth
  const kind = (f.kind ?? '').toLowerCase()
  const thin = lw * 0.6
  if (f.category === 'opening') return <OpeningSymbol f={f} z={z} color={color} lw={lw} />
  if (f.category === 'tap') {
    const r = Math.min(w, d) / 2
    return <circle cx={w / 2} cy={d / 2} r={r} fill="none" stroke={color} strokeWidth={thin} />
  }
  if (f.category === 'decorative') {
    return <ellipse cx={w / 2} cy={d / 2} rx={w / 2} ry={d / 2} fill="none" stroke={color} strokeWidth={thin} />
  }
  if (f.category === 'sink') {
    const m = Math.min(40, w / 8, d / 8)
    const r = Math.min(60, (d - 2 * m) / 4)
    return <>
      <rect x={m} y={m} width={w - 2 * m} height={d - 2 * m} rx={r} fill="none" stroke={color} strokeWidth={thin} />
      <circle cx={w / 2} cy={d / 2} r={Math.min(25, w / 10)} fill="none" stroke={color} strokeWidth={thin} />
    </>
  }
  if (kind.includes('cooktop') || kind.includes('hob')) {
    const r = Math.min(w, d) / 6
    const xs = [w * 0.28, w * 0.72], ys = [d * 0.3, d * 0.7]
    return <>{xs.flatMap(x => ys.map(y =>
      <circle key={`${x}_${y}`} cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth={thin} />))}</>
  }
  const dash = `${12 / z} ${8 / z}`
  return <>
    <line x1={0} y1={0} x2={w} y2={d} stroke={color} strokeWidth={thin} strokeDasharray={dash} />
    <line x1={w} y1={0} x2={0} y2={d} stroke={color} strokeWidth={thin} strokeDasharray={dash} />
  </>
}

function FixtureShape({ f, x, y, rotation, z, layers, selected, ghost, label, clash = false }: {
  f: Body; x: number; y: number; rotation: number; z: number
  layers: LayerView; selected: boolean; ghost: boolean; label: boolean
  /** P4: overlaps a cabinet — drawn red. */
  clash?: boolean
}) {
  const id = fixtureLayer(f.category)
  const lp = layers.props(id, z)
  const color = clash ? CLASH : selected ? '#f59e0b' : layers.color(id, STROKE)
  const lw = layers.w(id, (selected ? 2 : 1.4) / z)
  const fs = Math.max(11 / z, Math.min(f.width, f.depth) / 7)
  const opening = f.category === 'opening'
  // Text reads upright: flip it when the item is turned past 90°.
  const r = ((rotation % 360) + 360) % 360
  const flip = r > 90 && r < 270
  return (
    <g transform={`translate(${x},${y}) rotate(${rotation})`} opacity={ghost ? 0.6 : lp.opacity}>
      {/* Openings: no box (the wall is split around them) — a transparent hit area only. */}
      <rect x={0} y={0} width={f.width} height={f.depth}
        fill={FILL} fillOpacity={opening ? (ghost ? 0.12 : 0.001) : ghost ? 0.12 : 0.06 * (lp.fillOpacity ?? 1)}
        stroke={opening && !ghost ? 'none' : color} strokeWidth={lw} strokeDasharray={ghost ? `${10 / z} ${6 / z}` : lp.strokeDasharray} />
      <Symbol f={f} z={z} color={color} lw={lw} />
      {/* front edge */}
      {!opening && <line x1={0} y1={f.depth} x2={f.width} y2={f.depth} stroke={color} strokeWidth={lw * 2.2} />}
      {label && !opening && (
        <text x={f.width / 2} y={f.depth / 2} fontSize={fs} fill={color} textAnchor="middle" dominantBaseline="central"
          transform={flip ? `rotate(180 ${f.width / 2} ${f.depth / 2})` : undefined}
          style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {f.name}
        </text>
      )}
    </g>
  )
}

export default function FixturesPlan({
  fixtures, ghost, ghostBody, hiddenId, selectedId, zoom, layers, interactive, clashIds,
  onPointerDown, onContextMenu, onDoubleClick,
}: {
  fixtures:   RoomFixture[]
  ghost:      FixtureSnap | null
  ghostBody:  Body | null
  /** Fixture being moved — drawn as the ghost instead. */
  hiddenId:   string | null
  selectedId: string | null
  zoom:       number
  layers:     LayerView
  /** false while another tool owns the clicks (fixtures click-through). */
  interactive: boolean
  /** P4: fixtures that overlap a cabinet (fixtureClashes). */
  clashIds?:  Set<string>
  onPointerDown: (e: React.PointerEvent, id: string) => void
  onContextMenu: (e: React.MouseEvent, id: string) => void
  onDoubleClick: (e: React.MouseEvent, id: string) => void
}) {
  const z = zoom
  const showLabels = layers.show('fixture_labels')
  return (
    <g>
      {fixtures.map(f => {
        if (f.id === hiddenId || !layers.show(fixtureLayer(f.category))) return null
        return (
          <g key={f.id}
            style={{ pointerEvents: interactive ? undefined : 'none', cursor: interactive ? 'pointer' : undefined }}
            onPointerDown={e => { e.stopPropagation(); onPointerDown(e, f.id) }}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, f.id) }}
            onDoubleClick={e => { e.stopPropagation(); onDoubleClick(e, f.id) }}
          >
            <FixtureShape f={f} x={f.x} y={f.y} rotation={f.rotation} z={z} layers={layers}
              selected={f.id === selectedId} ghost={false} label={showLabels} clash={clashIds?.has(f.id)} />
          </g>
        )
      })}
      {ghost && ghostBody && (
        <g style={{ pointerEvents: 'none' }}>
          <FixtureShape f={ghostBody} x={ghost.x} y={ghost.y} rotation={ghost.rotation} z={z} layers={layers}
            selected={false} ghost label />
        </g>
      )}
    </g>
  )
}
