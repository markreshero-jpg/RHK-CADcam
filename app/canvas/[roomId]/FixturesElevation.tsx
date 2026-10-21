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
import { wrapLabel } from '@/src/lib/textWrap'
import { planShapePath } from '@/src/lib/fixturePlanShape'
import { stretchedElevShape } from '@/src/lib/fixtureStretch'
import { fixtureOnFace, fixtureLayer, openingOnWall, elevationFrame, elevLeftSide, type StretchSide, type FixtureSnap } from '@/src/lib/fixtureGeometry'
import { roundMm } from '@/src/lib/format'
import { PEN, MIN_PEN, PRINT_INK } from '@/src/lib/shopDrawings/pens'


// Centre move handle (white crosshair) — same as the cabinet one: click it and
// the item follows the cursor; the next click drops it.
function MoveHandle({ cx, cy, z, onGrab }: { cx: number; cy: number; z: number; onGrab: () => void }) {
  const arm = 10 / z, sw = 1.5 / z
  return (
    <g style={{ cursor: 'move' }}>
      <line x1={cx - arm} y1={cy} x2={cx + arm} y2={cy} stroke="white" strokeWidth={sw} opacity={0.5} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
      <line x1={cx} y1={cy - arm} x2={cx} y2={cy + arm} stroke="white" strokeWidth={sw} opacity={0.5} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
      <circle cx={cx} cy={cy} r={3 / z} fill="white" opacity={0.5} style={{ pointerEvents: 'none' }} />
      <circle cx={cx} cy={cy} r={8 / z} fill="transparent"
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onGrab() }} />
    </g>
  )
}

// Edge handles on the selected fixture (P7), like the cabinet elevation markers:
// blue = width (left / right), purple = height (top) and sill (bottom, openings).
function ElevHandles({ x, y, w, h, z, opening, leftSide, active, onGrab, onMove }: {
  x: number; y: number; w: number; h: number; z: number; opening: boolean
  leftSide: 'left' | 'right'; active: StretchSide | null; onGrab: (side: StretchSide) => void
  onMove?: () => void
}) {
  const mr = 6 / z, sw = 1.5 / z
  const rightSide = leftSide === 'left' ? 'right' : 'left'
  const pts: { side: StretchSide; cx: number; cy: number; v: boolean }[] = [
    { side: leftSide, cx: x, cy: y + h / 2, v: false },
    { side: rightSide, cx: x + w, cy: y + h / 2, v: false },
    { side: 'top', cx: x + w / 2, cy: y, v: true },
    ...(opening ? [{ side: 'bottom' as const, cx: x + w / 2, cy: y + h, v: true }] : []),
  ]
  return <>{onMove && <MoveHandle cx={x + w / 2} cy={y + h / 2} z={z} onGrab={onMove} />}{pts.map(p => (
    <circle key={p.side} cx={p.cx} cy={p.cy} r={mr}
      fill={active === p.side ? (p.v ? '#a855f7' : '#3b82f6') : (p.v ? '#7c3aed' : '#1d4ed8')}
      stroke={p.v ? '#c4b5fd' : '#93c5fd'} strokeWidth={sw}
      style={{ cursor: p.v ? 'ns-resize' : 'ew-resize' }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onGrab(p.side) }} />
  ))}</>
}

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

export interface ElevBox { x0: number; x1: number; z0: number; z1: number }

// Clearance dims for the selected fixture in elevation: left / right to the
// nearest box at an overlapping height (else the wall end), below to the nearest
// box under it (else the floor), above to the nearest box over it (else the
// ceiling). Gaps under 1 mm are left out.
const CLEAR = '#22d3ee'
function ElevClearance({ box, others, len, roomH, z, bg }: {
  box: ElevBox; others: ElevBox[]; len: number; roomH: number; z: number; bg: string
}) {
  const zOver = (o: ElevBox) => Math.min(o.z1, box.z1) - Math.max(o.z0, box.z0) > 1
  const xOver = (o: ElevBox) => Math.min(o.x1, box.x1) - Math.max(o.x0, box.x0) > 1
  const leftEdge  = Math.max(0,   ...others.filter(o => zOver(o) && o.x1 <= box.x0 + 1).map(o => o.x1))
  const rightEdge = Math.min(len, ...others.filter(o => zOver(o) && o.x0 >= box.x1 - 1).map(o => o.x0))
  const below     = Math.max(0,     ...others.filter(o => xOver(o) && o.z1 <= box.z0 + 1).map(o => o.z1))
  const above     = Math.min(roomH, ...others.filter(o => xOver(o) && o.z0 >= box.z1 - 1).map(o => o.z0))
  const sw = 1 / z, tk = 5 / z, fs = 10 / z
  const Y = (h: number) => roomH - h
  const midX = (box.x0 + box.x1) / 2, midY = Y((box.z0 + box.z1) / 2)
  const dim = (key: string, x1: number, y1: number, x2: number, y2: number, v: number) => {
    if (v < 1) return null
    const vert = Math.abs(x1 - x2) < 1e-6
    let mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    const tick = (x: number, y: number) => vert
      ? <line x1={x - tk} y1={y} x2={x + tk} y2={y} stroke={CLEAR} strokeWidth={sw} />
      : <line x1={x} y1={y - tk} x2={x} y2={y + tk} stroke={CLEAR} strokeWidth={sw} />
    const label = String(roundMm(v))
    const w = label.length * fs * 0.62 + fs * 0.6, h = fs * 1.3
    // Too short for the chip → sit it beside the line (below a horizontal dim,
    // right of a vertical one) so the line and ticks stay visible.
    if (vert ? Math.abs(y2 - y1) < h + fs * 0.3 : Math.abs(x2 - x1) < w + fs * 0.3) {
      if (vert) mx += tk + fs * 0.3 + w / 2
      else my += tk + fs * 0.3 + h / 2
    }
    return (
      <g key={key}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={CLEAR} strokeWidth={sw} strokeDasharray={`${4 / z} ${3 / z}`} />
        {tick(x1, y1)}{tick(x2, y2)}
        <rect x={mx - w / 2} y={my - h / 2} width={w} height={h} rx={2 / z} fill={bg} stroke={CLEAR} strokeWidth={sw * 0.6} />
        <text x={mx} y={my} fontSize={fs} fill={CLEAR} textAnchor="middle" dominantBaseline="central">{label}</text>
      </g>
    )
  }
  return (
    <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
      {dim('l', leftEdge, midY, box.x0, midY, box.x0 - leftEdge)}
      {dim('r', box.x1, midY, rightEdge, midY, rightEdge - box.x1)}
      {dim('b', midX, Y(below), midX, Y(box.z0), box.z0 - below)}
      {dim('t', midX, Y(box.z1), midX, Y(above), above - box.z1)}
    </g>
  )
}

export default function FixturesElevation({
  fixtures, wall, side, roomCx, roomH, zoom, layers, selectedId, highlightIds, onSelect, stretching, onStretchHandle, ghost, onMoveHandle,
  obstacles = [], showClearance = false, interactive = true, clashIds, onContextMenu,
}: {
  fixtures:   RoomFixture[]
  wall:       Wall
  side:       WallSide
  roomCx:     Pt
  roomH:      number
  zoom:       number
  layers:     LayerView
  selectedId: string | null
  /** Shift-picked / locked-with fixtures — drawn lit like the selected one (no handles). */
  highlightIds?: Set<string>
  onSelect:   (id: string, shift: boolean) => void
  /** P7: the edge being stretched, and grabbing a handle (omitted → no handles). */
  stretching?: { id: string; side: StretchSide } | null
  onStretchHandle?: (id: string, side: StretchSide) => void
  /** Centre crosshair: pick the selected fixture up (follows the cursor, click drops). */
  onMoveHandle?: (id: string) => void
  /** Placing / moving in elevation: where the carried item would land (snap pose + body + height). */
  ghost?: { snap: FixtureSnap; body: Pick<RoomFixture, 'category' | 'name' | 'width' | 'depth' | 'height'>; z: number } | null
  /** Cabinets on this face as elevation boxes (x along, z up) — for the selected fixture's clearances. */
  obstacles?: ElevBox[]
  /** Show clearance dims on the selected fixture. */
  showClearance?: boolean
  /** false while a cabinet / fixture is being stretched or moved — fixtures are click-through. */
  interactive?: boolean
  /** Fixtures overlapping a cabinet / another fixture — drawn red, like plan. */
  clashIds?: Set<string>
  /** Right-click: the same fixture menu as plan. */
  onContextMenu?: (e: React.MouseEvent, id: string) => void
}) {
  const f = elevationFrame(wall, side, roomCx)
  const handles = (fx: RoomFixture, x: number, y: number, w: number, h: number) =>
    fx.id === selectedId && onStretchHandle ? (
      <ElevHandles x={x} y={y} w={w} h={h} z={z} opening={fx.category === 'opening'}
        leftSide={elevLeftSide(fx.rotation, f)} active={stretching?.id === fx.id ? stretching.side : null}
        onGrab={s => onStretchHandle(fx.id, s)}
        onMove={onMoveHandle ? () => onMoveHandle(fx.id) : undefined} />
    ) : null
  const z = zoom
  const showLabels = layers.show('fixture_labels')

  // Ghost: dashed outline at the landing spot on this face (openings: in this wall).
  const ghostEl = (() => {
    if (!ghost) return null
    const g = { ...ghost.body, x: ghost.snap.x, y: ghost.snap.y, rotation: ghost.snap.rotation, wall_id: ghost.snap.wall_id,
      depth: ghost.snap.depth ?? ghost.body.depth, hinge_side: 'left' as const }
    const on = g.category === 'opening' ? openingOnWall(g, wall, side, roomCx) : fixtureOnFace(g, f)
    if (!on) return null
    return (
      <rect x={on.t0} y={roomH - ghost.z - g.height} width={on.t1 - on.t0} height={g.height}
        fill={STROKE} fillOpacity={0.12} stroke={STROKE} strokeWidth={1.4 / z}
        strokeDasharray={`${10 / z} ${6 / z}`} style={{ pointerEvents: 'none' }} />
    )
  })()

  // Each fixture's box on this face (openings: in their wall; others: facing it).
  const boxOf = (fx: RoomFixture): ElevBox | null => {
    const on = fx.category === 'opening' ? openingOnWall(fx, wall, side, roomCx) : fixtureOnFace(fx, f)
    if (!on) return null
    const z0 = Number(fx.z) || 0
    return { x0: on.t0, x1: on.t1, z0, z1: z0 + Number(fx.height) }
  }
  const selFx = showClearance && selectedId ? fixtures.find(x => x.id === selectedId) : undefined
  const selBox = selFx ? boxOf(selFx) : null
  const clearanceEl = selFx && selBox ? (
    <ElevClearance box={selBox} len={wall.length} roomH={roomH} z={z} bg={layers.background ?? '#030712'}
      others={[...obstacles, ...fixtures.filter(x => x.id !== selFx.id).map(boxOf).filter((b): b is ElevBox => !!b)]} />
  ) : null

  return (
    <g style={interactive ? undefined : { pointerEvents: 'none' }}>
      {ghostEl}
      {clearanceEl}
      {fixtures.map(fx => {
        const id = fixtureLayer(fx.category)
        if (!layers.show(id)) return null
        if (fx.category === 'opening') {
          // Holes are cut under the cabinets by OpeningHoles; this is the frame + symbol.
          const o = openingOnWall(fx, wall, side, roomCx)
          if (!o) return null
          const sel = fx.id === selectedId || !!highlightIds?.has(fx.id)
          const lp = layers.props(id, z)
          const color = sel ? '#f59e0b' : layers.color(id, '#94a3b8')
          const lw = layers.w(id, (sel ? 2 : 1.4) / z)
          const x = o.t0, w = o.t1 - o.t0, y = roomH - fx.z - fx.height, h = fx.height
          return (
            <g key={fx.id} opacity={lp.opacity} style={{ cursor: 'pointer' }}
              onPointerDown={e => { e.stopPropagation(); onSelect(fx.id, e.shiftKey) }}
              onContextMenu={onContextMenu ? e => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, fx.id) } : undefined}>
              <rect x={x} y={y} width={w} height={h} fill="transparent" stroke={color} strokeWidth={lw} />
              <OpeningElev kind={fx.kind ?? ''} x={x} y={y} w={w} h={h} hingeT={o.hingeT} color={color} lw={lw} z={z} />
              {handles(fx, x, y, w, h)}
            </g>
          )
        }
        const on = fixtureOnFace(fx, f)
        if (!on) return null
        const sel = fx.id === selectedId || !!highlightIds?.has(fx.id)
        const lp = layers.props(id, z)
        const color = clashIds?.has(fx.id) ? '#dc2626' : sel ? '#f59e0b' : layers.color(id, STROKE)
        const lw = layers.w(id, (sel ? 2 : 1.4) / z)
        const x = on.t0, w = on.t1 - on.t0
        const y = roomH - fx.z - fx.height, h = fx.height
        // Same on-screen size as cabinet names (11 px); wraps to the item's width.
        const fs = 11 / z
        const lines = showLabels ? wrapLabel(fx.label || fx.name, w * 0.9, fs) : []
        return (
          <g key={fx.id} opacity={lp.opacity} style={{ cursor: 'pointer' }}
            onPointerDown={e => { e.stopPropagation(); onSelect(fx.id, e.shiftKey) }}
            onContextMenu={onContextMenu ? e => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, fx.id) } : undefined}>
            {/* P8: the model's true front shape when traced; else the box (+ inner panel for appliances). */}
            <rect x={x} y={y} width={w} height={h} fill={STROKE} fillOpacity={(fx.elev_shape?.lines.length ? 0.001 : 0.06) * (lp.fillOpacity ?? 1)}
              stroke={fx.elev_shape?.lines.length ? 'none' : color} strokeWidth={lw} strokeDasharray={lp.strokeDasharray} />
            {fx.elev_shape?.lines.length ? (
              // Its own left is on the elevation's left when it faces this way; mirror if not.
              <path d={planShapePath(stretchedElevShape(fx.elev_shape, fx), w, h)} fill="none" stroke={color} strokeWidth={lw} strokeLinejoin="round"
                strokeDasharray={lp.strokeDasharray}
                transform={elevLeftSide(fx.rotation, f) === 'left' ? `translate(${x},${y})` : `translate(${x + w},${y}) scale(-1,1)`} />
            ) : fx.category === 'appliance' && (
              <rect x={x + w * 0.08} y={y + h * 0.08} width={w * 0.84} height={h * 0.84}
                fill="none" stroke={color} strokeWidth={lw * 0.6} />
            )}
            {showLabels && (
              <text x={x + w / 2} y={y + h / 2} fontSize={fs} fill={color} textAnchor="middle" dominantBaseline="central"
                style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {lines.map((ln, i) => (
            <tspan key={i} x={x + w / 2} y={y + h / 2 + (i - (lines.length - 1) / 2) * fs * 1.15}>{ln}</tspan>
          ))}
              </text>
            )}
            {handles(fx, x, y, w, h)}
          </g>
        )
      })}
    </g>
  )
}

// Shop drawings (z_shop_drawings): fixtures facing this wall on the printed
// elevation — outline (or traced front shape), appliance inner panel, label;
// black ink, pen-table widths. Doors / windows are drawn by the report itself.
export function FixturesElevationPrint({ fixtures, wall, roomCx, roomH, layers, P }: {
  fixtures: RoomFixture[]; wall: Wall; roomCx: Pt; roomH: number; layers: LayerView; P: number
}) {
  const f = elevationFrame(wall, 'face', roomCx)
  const fs = 2.5 * P
  const showLabels = layers.show('fixture_labels')
  return (
    <g fontFamily="Arial, Helvetica, sans-serif">
      {fixtures.map(fx => {
        const id = fixtureLayer(fx.category)
        if (fx.category === 'opening' || !layers.show(id)) return null
        const on = fixtureOnFace(fx, f)
        if (!on) return null
        const lp = layers.props(id, 4 / P)
        const lw = Math.max(layers.w(id, PEN.front * P), MIN_PEN * P / 0.6)
        const x = on.t0, w = on.t1 - on.t0
        const y = roomH - fx.z - fx.height, h = fx.height
        const lines = showLabels ? wrapLabel(fx.label || fx.name, w * 0.9, fs) : []
        return (
          <g key={fx.id} opacity={lp.opacity}>
            {fx.elev_shape?.lines.length ? (
              <path d={planShapePath(stretchedElevShape(fx.elev_shape, fx), w, h)} fill="none" stroke={PRINT_INK} strokeWidth={lw}
                strokeLinejoin="round" strokeDasharray={lp.strokeDasharray}
                transform={elevLeftSide(fx.rotation, f) === 'left' ? `translate(${x},${y})` : `translate(${x + w},${y}) scale(-1,1)`} />
            ) : <>
              <rect x={x} y={y} width={w} height={h} fill="white" stroke={PRINT_INK} strokeWidth={lw} strokeDasharray={lp.strokeDasharray} />
              {fx.category === 'appliance' && (
                <rect x={x + w * 0.08} y={y + h * 0.08} width={w * 0.84} height={h * 0.84} fill="none" stroke={PRINT_INK} strokeWidth={lw * 0.6} />
              )}
            </>}
            {lines.length > 0 && (
              <text x={x + w / 2} y={y + h / 2} fontSize={fs} fill={PRINT_INK} textAnchor="middle" dominantBaseline="central">
                {lines.map((ln, i) => (
                  <tspan key={i} x={x + w / 2} y={y + h / 2 + (i - (lines.length - 1) / 2) * fs * 1.15}>{ln}</tspan>
                ))}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}
