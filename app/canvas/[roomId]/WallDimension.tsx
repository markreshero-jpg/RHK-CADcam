'use client'

import { Wall } from '@/src/lib/types'
import { toRad, wallDir, wallEnd, wallInwardNormal } from '@/src/lib/geometry'

export default function WallDimension({ wall, walls, centX, centY, zoom, selected }: {
  wall: Wall; walls: Wall[]; centX: number; centY: number; zoom: number; selected: boolean
}) {
  if (wall.wall_type === 'island') return null

  const inward = wallInwardNormal(wall, centX, centY)
  const out = { x: -inward.x, y: -inward.y }
  const thick = wall.thickness

  const s = { x: wall.pos_x, y: wall.pos_y }
  const e = wallEnd(wall)

  // wall.length IS the inside face length — no adjacent-wall lookup needed
  const internalLen = Math.round(wall.length)

  const extGap  = 12 / zoom
  const dimDist = 90 / zoom
  const extOver = 7 / zoom
  const fs      = 11 / zoom
  const sw      = 1.2 / zoom

  // Extension lines start at the outside face edge (thick away from inside face)
  const el1s = { x: s.x + out.x * (thick + extGap),            y: s.y + out.y * (thick + extGap) }
  const el1e = { x: s.x + out.x * (thick + dimDist + extOver), y: s.y + out.y * (thick + dimDist + extOver) }
  const el2s = { x: e.x + out.x * (thick + extGap),            y: e.y + out.y * (thick + extGap) }
  const el2e = { x: e.x + out.x * (thick + dimDist + extOver), y: e.y + out.y * (thick + dimDist + extOver) }
  const dl1  = { x: s.x + out.x * (thick + dimDist),           y: s.y + out.y * (thick + dimDist) }
  const dl2  = { x: e.x + out.x * (thick + dimDist),           y: e.y + out.y * (thick + dimDist) }

  const mx = (dl1.x + dl2.x) / 2, my = (dl1.y + dl2.y) / 2
  const tx = mx + out.x * fs * 0.9, ty = my + out.y * fs * 0.9
  const textAngle = Math.cos(toRad(wall.angle)) < -0.001 ? wall.angle + 180 : wall.angle
  const col = '#ffffff'

  return (
    <g pointerEvents="none" style={{ userSelect: 'none' }}>
      <line x1={el1s.x} y1={el1s.y} x2={el1e.x} y2={el1e.y} stroke={col} strokeWidth={sw} />
      <line x1={el2s.x} y1={el2s.y} x2={el2e.x} y2={el2e.y} stroke={col} strokeWidth={sw} />
      <line x1={dl1.x}  y1={dl1.y}  x2={dl2.x}  y2={dl2.y}  stroke={col} strokeWidth={sw} />
      <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
        fontSize={fs} fill={col} transform={`rotate(${textAngle}, ${tx}, ${ty})`}>
        {internalLen}
      </text>
    </g>
  )
}
