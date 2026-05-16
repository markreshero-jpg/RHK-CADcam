'use client'
import { Wall, CabinetInstance } from '@/src/lib/types'
import { toRad, wallDir, wallInwardNormal, cabT } from '@/src/lib/geometry'
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
  const thick = wall.thickness
  const sw = 1 / z
  const fs = 9 / z
  const tickH = 6 / z
  const labelOff = fs * 1.4
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
        const tx = p.x + out.x * labelOff
        const ty = p.y + out.y * labelOff
        return (
          <text key={i}
            x={tx} y={ty}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={fs} fill={col}
            transform={`rotate(${textAngle}, ${tx}, ${ty})`}>
            {seg.label}
          </text>
        )
      })}
    </g>
  )
}

export default function WallDimensionChain({
  wall, walls, cabinets, centX, centY, zoom, selected,
  layerOverall, layerBase, layerWallCab,
}: Props) {
  if (wall.wall_type === 'island') return null

  const inward = wallInwardNormal(wall, centX, centY)
  const out = { x: -inward.x, y: -inward.y }
  const z = zoom
  const col = selected ? '#93c5fd' : '#94a3b8'

  const baseCabs = cabinets.filter(c =>
    c.wall_id === wall.id &&
    (c.assembly_class === 'base' || c.assembly_class === 'base_corner')
  )
  const wallCabs = cabinets.filter(c =>
    c.wall_id === wall.id &&
    (c.assembly_class === 'wall' || c.assembly_class === 'wall_corner')
  )

  const baseSegs = computeChain(baseCabs, wall)
  const wallCabSegs = computeChain(wallCabs, wall)
  const overallSeg: Seg[] = [{ from: 0, to: wall.length, label: Math.round(wall.length) }]

  return (
    <g>
      {layerWallCab.visible && (
        <DimLine
          wall={wall} out={out}
          dist={80 / z}
          segs={wallCabSegs.length > 0 ? wallCabSegs : overallSeg}
          zoom={z} col={col}
        />
      )}
      {layerBase.visible && (
        <DimLine
          wall={wall} out={out}
          dist={160 / z}
          segs={baseSegs.length > 0 ? baseSegs : overallSeg}
          zoom={z} col={col}
        />
      )}
      {layerOverall.visible && (
        <DimLine
          wall={wall} out={out}
          dist={240 / z}
          segs={overallSeg}
          zoom={z} col={col}
        />
      )}
    </g>
  )
}
