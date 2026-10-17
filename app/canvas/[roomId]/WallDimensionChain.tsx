'use client'
import { Wall, CabinetInstance } from '@/src/lib/types'
import { toRad, wallDir, wallInwardNormal, cabT, cabWallSide, type RoomRef, type WallSpan } from '@/src/lib/geometry'
import { returnWallThickness } from '@/src/lib/wallJoints'
import type { ItemSetting as LayerConfig } from '@/src/lib/displayLayers/registry'
import { kickChain, type KickSpan } from '@/src/lib/kickDims'

interface Props {
  wall: Wall
  walls: Wall[]
  cabinets: CabinetInstance[]
  rc: RoomRef
  zoom: number
  selected: boolean
  layerOverall: LayerConfig
  layerBase: LayerConfig
  layerWallCab: LayerConfig
  /** Kick chain + kick depth dims (`dim_kicks`); spans from kickPlanSpans. */
  layerKick?: LayerConfig
  kickSpans?: KickSpan[]
  /** Doors / windows row (`dim_openings`, z_fixtures P5): spans along the wall, drawn on the outer side. */
  layerOpenings?: LayerConfig
  openingSpans?: WallSpan[]
  /** Label backing-chip colour — the view background (layer set). */
  labelBg?: string
}

type Seg = { from: number; to: number; label: number }

// Dimension spacing is fixed in model mm so the dims stay put relative to the walls
// as you zoom, clamped to a screen-px range: never closer than MIN_PX (labels would
// pile up when zoomed out) nor further than MAX_PX (would drift off-screen when
// zoomed in). Returns model mm.
const DIM_STEP_MM = 150
const DIM_STEP_MIN_PX = 18
const DIM_STEP_MAX_PX = 50
function dimStep(zoom: number): number {
  return Math.min(Math.max(DIM_STEP_MM * zoom, DIM_STEP_MIN_PX), DIM_STEP_MAX_PX) / zoom
}

function computeChain(cabs: CabinetInstance[], wall: Wall): Seg[] {
  const sorted = [...cabs].sort((a, b) => cabT(a, wall) - cabT(b, wall))
  const segs: Seg[] = []
  let cursor = 0
  for (const cab of sorted) {
    const t = cabT(cab, wall)
    if (t > cursor + 0.5) {
      segs.push({ from: cursor, to: t, label: Math.round(t - cursor) })
    }
    segs.push({ from: t, to: t + cab.dx, label: Math.round(cab.dx) })
    cursor = t + cab.dx
  }
  if (cursor < wall.length - 0.5) {
    segs.push({ from: cursor, to: wall.length, label: Math.round(wall.length - cursor) })
  }
  return segs
}

// Row to opening jambs: wall start → jamb → jamb → … → wall end.
function spanChain(spans: WallSpan[], len: number): Seg[] {
  const segs: Seg[] = []
  let cursor = 0
  for (const s of spans) {
    if (s.t0 > cursor + 0.5) segs.push({ from: cursor, to: s.t0, label: Math.round(s.t0 - cursor) })
    segs.push({ from: s.t0, to: s.t1, label: Math.round(s.t1 - s.t0) })
    cursor = s.t1
  }
  if (cursor < len - 0.5) segs.push({ from: cursor, to: len, label: Math.round(len - cursor) })
  return segs
}

function DimLine({
  wall, out, dist, segs, zoom, col, weight = 1, bg = '#030712', opacity = 1,
}: {
  wall: Wall
  out: { x: number; y: number }
  dist: number
  segs: Seg[]
  zoom: number
  col: string
  weight?: number   // layer line-weight multiplier
  bg?: string       // label backing-chip colour
  opacity?: number  // layer opacity multiplier
}) {
  const z = zoom
  const wd = wallDir(wall)
  const thick = wall.wall_type === 'island' ? 0 : wall.thickness
  const sw = weight / z
  const fs = 12 / z
  const tickH = 6 / z
  const textAngle = Math.cos(toRad(wall.angle)) < -0.001 ? wall.angle + 180 : wall.angle

  const pt = (t: number) => ({
    x: wall.pos_x + t * wd.x + out.x * (thick + dist),
    y: wall.pos_y + t * wd.y + out.y * (thick + dist),
  })

  const boundaries = Array.from(new Set([0, ...segs.flatMap(s => [s.from, s.to])]))
  const p0 = pt(0), pL = pt(wall.length)

  return (
    <g pointerEvents="none" opacity={opacity} style={{ userSelect: 'none' }}>
      <line x1={p0.x} y1={p0.y} x2={pL.x} y2={pL.y} stroke={col} strokeWidth={sw} />
      {boundaries.map((t, i) => {
        const p = pt(t)
        return (
          <line key={i}
            x1={p.x - out.x * tickH} y1={p.y - out.y * tickH}
            x2={p.x + out.x * tickH} y2={p.y + out.y * tickH}
            stroke={col} strokeWidth={sw}
          />
        )
      })}
      {segs.map((seg, i) => {
        const mid = (seg.from + seg.to) / 2
        const p = pt(mid)
        const padX = fs * 1.8
        const padY = fs * 0.6
        return (
          <g key={i} transform={`rotate(${textAngle}, ${p.x}, ${p.y})`}>
            <rect x={p.x - padX} y={p.y - padY} width={padX * 2} height={padY * 2} fill={bg} />
            <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fill={col}>
              {seg.label}
            </text>
          </g>
        )
      })}
    </g>
  )
}

// Perpendicular depth dimension at a wall end — runs from the cabinet's back face to
// its front face. backOffset shifts the start off the wall line to the cabinet back
// (0 for front/inside-face cabinets; the wall thickness for back-side cabinets, whose
// back sits on the outer face). endClear (model mm) is the thickness of the return
// wall joined at this end, so the dim sits past it rather than inside it.
function DepthDim({
  wall, inward, tPos, dz, zoom, col, sign, backOffset = 0, endClear = 0, lane = 0, extra = 0, weight = 1, bg = '#030712', opacity = 1,
}: {
  wall: Wall
  inward: { x: number; y: number }
  tPos: number
  dz: number
  zoom: number
  col: string
  weight?: number   // layer line-weight multiplier
  bg?: string       // label backing-chip colour
  opacity?: number  // layer opacity multiplier
  sign: 1 | -1
  backOffset?: number
  endClear?: number
  lane?: number      // 0 = nearest the wall end; each lane steps one dimStep further out
  extra?: number     // layer offset (mm) on top of the lane position
}) {
  const wd = wallDir(wall)
  const z = zoom
  const sw = weight / z
  const fs = 12 / z
  const tickH = 6 / z

  // Half-step lanes: a return wall's chain rows sit whole steps out from this
  // wall's end, so the depth dims fall between them instead of on top.
  const off = endClear + dimStep(z) * (0.5 + lane) + extra
  const offX = wd.x * sign * off
  const offY = wd.y * sign * off

  const sx = wall.pos_x + tPos * wd.x + offX + inward.x * backOffset
  const sy = wall.pos_y + tPos * wd.y + offY + inward.y * backOffset
  const ex = sx + inward.x * dz
  const ey = sy + inward.y * dz
  const midX = (sx + ex) / 2
  const midY = (sy + ey) / 2

  // Angle of the inward direction — normalise so text reads left-to-right
  const rawAngle = Math.atan2(inward.y, inward.x) * 180 / Math.PI
  const textAngle = Math.abs(rawAngle) > 90 ? rawAngle + 180 : rawAngle

  return (
    <g pointerEvents="none" opacity={opacity} style={{ userSelect: 'none' }}>
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={col} strokeWidth={sw} />
      {/* Ticks run along the wall direction */}
      <line x1={sx - wd.x * tickH} y1={sy - wd.y * tickH} x2={sx + wd.x * tickH} y2={sy + wd.y * tickH} stroke={col} strokeWidth={sw} />
      <line x1={ex - wd.x * tickH} y1={ey - wd.y * tickH} x2={ex + wd.x * tickH} y2={ey + wd.y * tickH} stroke={col} strokeWidth={sw} />
      <g transform={`rotate(${textAngle}, ${midX}, ${midY})`}>
        <rect x={midX - fs * 1.8} y={midY - fs * 0.6} width={fs * 3.6} height={fs * 1.2} fill={bg} />
        <text x={midX} y={midY} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fill={col}>
          {Math.round(dz)}
        </text>
      </g>
    </g>
  )
}

export default function WallDimensionChain({
  wall, walls, cabinets, rc, zoom, selected,
  layerOverall, layerBase, layerWallCab, layerKick, kickSpans = [], labelBg = '#030712',
  layerOpenings, openingSpans = [],
}: Props) {
  const inward = wallInwardNormal(wall, rc)
  const out = { x: -inward.x, y: -inward.y }
  const z = zoom
  const col = '#ffffff'
  const isIsland = wall.wall_type === 'island'
  const clear0 = returnWallThickness(wall, walls, 'start')
  const clearL = returnWallThickness(wall, walls, 'end')

  const allBase = cabinets.filter(c =>
    c.wall_id === wall.id &&
    (c.assembly_class === 'base' || c.assembly_class === 'base_corner')
  )
  const allWall = cabinets.filter(c =>
    c.wall_id === wall.id &&
    (c.assembly_class === 'wall' || c.assembly_class === 'wall_corner' ||
     // Talls ride the overhead row until configurable dimension rows land
     // (z_dimension_rows/DIMENSION-ROWS-SPEC.md).
     c.assembly_class === 'tall' || c.assembly_class === 'tall_corner')
  )

  const sideDepth = (cabs: CabinetInstance[]) =>
    cabs.length ? Math.max(...cabs.map(c => c.dz)) : 0

  // Render the 3-row width chain + perpendicular depth dims for one side of a wall.
  // `chainDir` is the outward perpendicular the width rows stack along; `depthDir`
  // is the direction the depth dims point (toward the cabinet fronts on this side).
  // `depthOffset` (model mm) pushes the width rows clear of cabinets sitting on
  // this side — 0 for perimeter walls, the side's cabinet depth for islands.
  function renderSide(
    key: string,
    chainDir: { x: number; y: number },
    depthDir: { x: number; y: number },
    baseCabs: CabinetInstance[],
    wallCabs: CabinetInstance[],
    depthOffset: number,
    backOffset = 0,
    kicks: KickSpan[] = [],
    openings: WallSpan[] = [],
  ) {
    const baseSegs = computeChain(baseCabs, wall)
    // Kick row sits between the base row and the overall, which steps out past it.
    const showKicks = !!layerKick?.visible && kicks.length > 0
    const kickSegs = showKicks ? kickChain(kicks, wall.length) : []
    const kickCol = layerKick?.color ?? col
    const kick0 = kicks[0], kickL = kicks[kicks.length - 1]
    const wallCabSegs = computeChain(wallCabs, wall)
    const overallSeg: Seg[] = [{ from: 0, to: wall.length, label: Math.round(wall.length) }]
    const baseDz = baseCabs.length > 0 ? Math.max(...baseCabs.map(c => c.dz)) : 0
    const wallDz = wallCabs.length > 0 ? Math.max(...wallCabs.map(c => c.dz)) : 0
    // Only show wall depth separately if it differs meaningfully from base depth
    const showWallDepthSeparate = wallDz > 0 && Math.abs(wallDz - baseDz) > 5

    const step = dimStep(z)
    // Layer offsets (mm). Each row moves out by its own offset plus every row inside
    // it, so pushing one row out never lands it on the next.
    const oW = layerWallCab.offset ?? 0, oB = layerBase.offset ?? 0
    const showOpen = !!layerOpenings?.visible && openings.length > 0
    const openSegs = showOpen ? spanChain(openings, wall.length) : []
    const oK = showKicks ? (layerKick?.offset ?? 0) : 0, oO = layerOverall.offset ?? 0
    const oD = showOpen ? (layerOpenings?.offset ?? 0) : 0
    const rW = oW, rB = rW + oB, rK = rB + oK, rD = rK + oD, rO = rD + oO
    // Row numbers: 1 wall cabs, 2 base, then kicks / openings when shown, overall last.
    const nK = 3, nD = showKicks ? 4 : 3, nO = nD + (showOpen ? 1 : 0)

    return (
      <g key={key}>
        {/* Wall-parallel chain lines */}
        {layerWallCab.visible && wallCabs.length > 0 && (
          <DimLine wall={wall} out={chainDir} dist={depthOffset + step + rW} segs={wallCabSegs} zoom={z} col={layerWallCab.color ?? col} weight={layerWallCab.weight} opacity={layerWallCab.opacity} bg={labelBg} />
        )}
        {layerBase.visible && baseCabs.length > 0 && (
          <DimLine wall={wall} out={chainDir} dist={depthOffset + step * 2 + rB} segs={baseSegs} zoom={z} col={layerBase.color ?? col} weight={layerBase.weight} opacity={layerBase.opacity} bg={labelBg} />
        )}
        {showKicks && (
          <DimLine wall={wall} out={chainDir} dist={depthOffset + step * nK + rK} segs={kickSegs} zoom={z} col={kickCol} weight={layerKick!.weight} opacity={layerKick!.opacity} bg={labelBg} />
        )}
        {showOpen && (
          <DimLine wall={wall} out={chainDir} dist={depthOffset + step * nD + rD} segs={openSegs} zoom={z} col={layerOpenings!.color ?? col} weight={layerOpenings!.weight} opacity={layerOpenings!.opacity} bg={labelBg} />
        )}
        {layerOverall.visible && (
          <DimLine wall={wall} out={chainDir} dist={depthOffset + step * nO + rO} segs={overallSeg} zoom={z} col={layerOverall.color ?? col} weight={layerOverall.weight} opacity={layerOverall.opacity} bg={labelBg} />
        )}
        {/* Kick depth (wall face → kick face) at the wall ends, outside the cabinet depth lanes */}
        {showKicks && (
          <>
            <DepthDim wall={wall} inward={depthDir} tPos={0}           dz={kick0.depth} zoom={z} col={kickCol} weight={layerKick!.weight} opacity={layerKick!.opacity} sign={-1} backOffset={backOffset} lane={2} extra={oK} endClear={clear0} bg={labelBg} />
            <DepthDim wall={wall} inward={depthDir} tPos={wall.length} dz={kickL.depth} zoom={z} col={kickCol} weight={layerKick!.weight} opacity={layerKick!.opacity} sign={1} backOffset={backOffset} lane={2} extra={oK} endClear={clearL} bg={labelBg} />
          </>
        )}

        {/* Perpendicular depth dimensions at wall ends */}
        {layerBase.visible && baseDz > 0 && (
          <>
            <DepthDim wall={wall} inward={depthDir} tPos={0}           dz={baseDz} zoom={z} col={layerBase.color ?? col} weight={layerBase.weight} opacity={layerBase.opacity} sign={-1} backOffset={backOffset} extra={oB} endClear={clear0} bg={labelBg} />
            <DepthDim wall={wall} inward={depthDir} tPos={wall.length} dz={baseDz} zoom={z} col={layerBase.color ?? col} weight={layerBase.weight} opacity={layerBase.opacity} sign={1} backOffset={backOffset} extra={oB} endClear={clearL} bg={labelBg} />
          </>
        )}
        {layerWallCab.visible && showWallDepthSeparate && (
          <>
            <DepthDim wall={wall} inward={depthDir} tPos={0}           dz={wallDz} zoom={z} col={layerWallCab.color ?? col} weight={layerWallCab.weight} opacity={layerWallCab.opacity} sign={-1} backOffset={backOffset} lane={1} extra={oW} endClear={clear0} bg={labelBg} />
            <DepthDim wall={wall} inward={depthDir} tPos={wall.length} dz={wallDz} zoom={z} col={layerWallCab.color ?? col} weight={layerWallCab.weight} opacity={layerWallCab.opacity} sign={1} backOffset={backOffset} lane={1} extra={oW} endClear={clearL} bg={labelBg} />
          </>
        )}
      </g>
    )
  }

  // Split cabinets by which wall face they sit on (back-side cabinets are placed on
  // the outer face — see wallAnchorPoint).
  const inBase  = allBase.filter(c => cabWallSide(c, wall) === 'face')
  const outBase = allBase.filter(c => cabWallSide(c, wall) === 'back')
  const inWall  = allWall.filter(c => cabWallSide(c, wall) === 'face')
  const outWall = allWall.filter(c => cabWallSide(c, wall) === 'back')
  const inKicks  = kickSpans.filter(k => k.side === 'face')
  const outKicks = kickSpans.filter(k => k.side === 'back')
  const hasIn  = inBase.length > 0 || inWall.length > 0
  const hasOut = outBase.length > 0 || outWall.length > 0

  // Perimeter wall with cabinets only on the room side (the common case): keep the
  // historic single chain on the empty outward side, depth dims pointing inward.
  if (!isIsland && !hasOut) {
    return renderSide('main', out, inward, allBase, allWall, 0, 0, kickSpans, openingSpans)
  }

  // Island, or a perimeter wall that now has back-side cabinets: draw each occupied
  // face on its own side, each chain pushed clear of that side's deepest cabinet so
  // the cabinets no longer overlap the dimension chain. Back-side cabinets sit on the
  // outer face, so their depth dims start a wall thickness out (islands are flush).
  const outBackOffset = isIsland ? 0 : wall.thickness
  return (
    <g>
      {hasIn && renderSide('in', inward, inward, inBase, inWall, sideDepth([...inBase, ...inWall]), 0, inKicks)}
      {(hasOut || !hasIn) && renderSide('out', out, out, outBase, outWall, sideDepth([...outBase, ...outWall]), outBackOffset, outKicks, openingSpans)}
    </g>
  )
}
