'use client'
import { Wall, CabinetInstance } from '@/src/lib/types'
import { toRad, wallDir, wallInwardNormal, cabT, cabWallSide } from '@/src/lib/geometry'
import { LayerConfig } from '@/src/lib/displayConfig'

interface Props {
  wall: Wall
  walls: Wall[]
  cabinets: CabinetInstance[]
  centX: number
  centY: number
  zoom: number
  selected: boolean
  layerOverall: LayerConfig
  layerBase: LayerConfig
  layerWallCab: LayerConfig
}

type Seg = { from: number; to: number; label: number }

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

function DimLine({
  wall, out, dist, segs, zoom, col,
}: {
  wall: Wall
  out: { x: number; y: number }
  dist: number
  segs: Seg[]
  zoom: number
  col: string
}) {
  const z = zoom
  const wd = wallDir(wall)
  const thick = wall.wall_type === 'island' ? 0 : wall.thickness
  const sw = 1 / z
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
    <g pointerEvents="none" style={{ userSelect: 'none' }}>
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
            <rect x={p.x - padX} y={p.y - padY} width={padX * 2} height={padY * 2} fill="#030712" />
            <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fill={col}>
              {seg.label}
            </text>
          </g>
        )
      })}
    </g>
  )
}

// Perpendicular depth dimension at a wall end — runs from wall face to cabinet front face
function DepthDim({
  wall, inward, tPos, dz, zoom, col, sign,
}: {
  wall: Wall
  inward: { x: number; y: number }
  tPos: number
  dz: number
  zoom: number
  col: string
  sign: 1 | -1
}) {
  const wd = wallDir(wall)
  const z = zoom
  const sw = 1 / z
  const fs = 12 / z
  const tickH = 6 / z

  const offX = wd.x * sign * 20 / z
  const offY = wd.y * sign * 20 / z

  const sx = wall.pos_x + tPos * wd.x + offX
  const sy = wall.pos_y + tPos * wd.y + offY
  const ex = sx + inward.x * dz
  const ey = sy + inward.y * dz
  const midX = (sx + ex) / 2
  const midY = (sy + ey) / 2

  // Angle of the inward direction — normalise so text reads left-to-right
  const rawAngle = Math.atan2(inward.y, inward.x) * 180 / Math.PI
  const textAngle = Math.abs(rawAngle) > 90 ? rawAngle + 180 : rawAngle

  return (
    <g pointerEvents="none" style={{ userSelect: 'none' }}>
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={col} strokeWidth={sw} />
      {/* Ticks run along the wall direction */}
      <line x1={sx - wd.x * tickH} y1={sy - wd.y * tickH} x2={sx + wd.x * tickH} y2={sy + wd.y * tickH} stroke={col} strokeWidth={sw} />
      <line x1={ex - wd.x * tickH} y1={ey - wd.y * tickH} x2={ex + wd.x * tickH} y2={ey + wd.y * tickH} stroke={col} strokeWidth={sw} />
      <g transform={`rotate(${textAngle}, ${midX}, ${midY})`}>
        <rect x={midX - fs * 1.8} y={midY - fs * 0.6} width={fs * 3.6} height={fs * 1.2} fill="#030712" />
        <text x={midX} y={midY} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fill={col}>
          {Math.round(dz)}
        </text>
      </g>
    </g>
  )
}

export default function WallDimensionChain({
  wall, walls, cabinets, centX, centY, zoom, selected,
  layerOverall, layerBase, layerWallCab,
}: Props) {
  const inward = wallInwardNormal(wall, centX, centY)
  const out = { x: -inward.x, y: -inward.y }
  const z = zoom
  const col = '#ffffff'
  const isIsland = wall.wall_type === 'island'

  const allBase = cabinets.filter(c =>
    c.wall_id === wall.id &&
    (c.assembly_class === 'base' || c.assembly_class === 'base_corner')
  )
  const allWall = cabinets.filter(c =>
    c.wall_id === wall.id &&
    (c.assembly_class === 'wall' || c.assembly_class === 'wall_corner')
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
  ) {
    const baseSegs = computeChain(baseCabs, wall)
    const wallCabSegs = computeChain(wallCabs, wall)
    const overallSeg: Seg[] = [{ from: 0, to: wall.length, label: Math.round(wall.length) }]
    const baseDz = baseCabs.length > 0 ? Math.max(...baseCabs.map(c => c.dz)) : 0
    const wallDz = wallCabs.length > 0 ? Math.max(...wallCabs.map(c => c.dz)) : 0
    // Only show wall depth separately if it differs meaningfully from base depth
    const showWallDepthSeparate = wallDz > 0 && Math.abs(wallDz - baseDz) > 5

    return (
      <g key={key}>
        {/* Wall-parallel chain lines */}
        {layerWallCab.visible && wallCabs.length > 0 && (
          <DimLine wall={wall} out={chainDir} dist={depthOffset + 25 / z} segs={wallCabSegs} zoom={z} col={col} />
        )}
        {layerBase.visible && baseCabs.length > 0 && (
          <DimLine wall={wall} out={chainDir} dist={depthOffset + 50 / z} segs={baseSegs} zoom={z} col={col} />
        )}
        {layerOverall.visible && (
          <DimLine wall={wall} out={chainDir} dist={depthOffset + 75 / z} segs={overallSeg} zoom={z} col={col} />
        )}

        {/* Perpendicular depth dimensions at wall ends */}
        {layerBase.visible && baseDz > 0 && (
          <>
            <DepthDim wall={wall} inward={depthDir} tPos={0}           dz={baseDz} zoom={z} col={col} sign={-1} />
            <DepthDim wall={wall} inward={depthDir} tPos={wall.length} dz={baseDz} zoom={z} col={col} sign={1} />
          </>
        )}
        {layerWallCab.visible && showWallDepthSeparate && (
          <>
            <DepthDim wall={wall} inward={depthDir} tPos={0}           dz={wallDz} zoom={z} col={col} sign={-1} />
            <DepthDim wall={wall} inward={depthDir} tPos={wall.length} dz={wallDz} zoom={z} col={col} sign={1} />
          </>
        )}
      </g>
    )
  }

  // Perimeter wall: cabinets sit on the inward (room) side only, so the chain
  // goes on the empty outward side and depth dims point inward — unchanged.
  if (!isIsland) {
    return renderSide('main', out, inward, allBase, allWall, 0)
  }

  // Island: cabinets can sit on both faces. Split by side and draw each side's
  // chain on its own side, pushed clear of that side's cabinet fronts.
  const inBase  = allBase.filter(c => cabWallSide(c, wall) === 'face')
  const outBase = allBase.filter(c => cabWallSide(c, wall) === 'back')
  const inWall  = allWall.filter(c => cabWallSide(c, wall) === 'face')
  const outWall = allWall.filter(c => cabWallSide(c, wall) === 'back')
  const hasIn  = inBase.length > 0 || inWall.length > 0
  const hasOut = outBase.length > 0 || outWall.length > 0

  return (
    <g>
      {hasIn && renderSide('in', inward, inward, inBase, inWall, sideDepth([...inBase, ...inWall]))}
      {(hasOut || !hasIn) && renderSide('out', out, out, outBase, outWall, sideDepth([...outBase, ...outWall]))}
    </g>
  )
}
