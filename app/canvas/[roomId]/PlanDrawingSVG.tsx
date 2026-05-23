'use client'
import type { RefObject } from 'react'
import type { Wall, CabinetInstance } from '@/src/lib/types'
import {
  wallEnd, wallInwardNormal, wallMitrePolygon,
  cabinetPolygon, cabinetCenterPt, centroid, cabWallPerp,
} from '@/src/lib/geometry'

export default function PlanDrawingSVG({ walls, cabinets, svgRef, scale = 20 }: {
  walls: Wall[]
  cabinets: CabinetInstance[]
  svgRef: RefObject<SVGSVGElement | null>
  scale?: number
}) {
  if (walls.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm py-12">
        No walls in this room.
      </div>
    )
  }

  const cx = centroid(walls)

  const pts = walls.flatMap(w => {
    const e = wallEnd(w)
    if (w.wall_type === 'island') return [{ x: w.pos_x, y: w.pos_y }, e]
    const inward = wallInwardNormal(w, cx.x, cx.y)
    const t = w.thickness
    return [
      { x: w.pos_x, y: w.pos_y },
      { x: w.pos_x - inward.x * t, y: w.pos_y - inward.y * t },
      e,
      { x: e.x - inward.x * t, y: e.y - inward.y * t },
    ]
  })
  const minX = Math.min(...pts.map(p => p.x))
  const maxX = Math.max(...pts.map(p => p.x))
  const minY = Math.min(...pts.map(p => p.y))
  const maxY = Math.max(...pts.map(p => p.y))

  // Margin in physical mm × scale = model mm
  const P   = scale
  const pad = 15 * P    // 15mm physical margin

  const vbX = minX - pad,  vbY = minY - pad
  const vbW = maxX - minX + pad * 2
  const vbH = maxY - minY + pad * 2

  // Scale-aware sizes: physical_mm × scale = model_mm
  const sw       = 0.4 * P
  const fontSize = 3.5 * P

  return (
    <svg
      ref={svgRef}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      xmlns="http://www.w3.org/2000/svg"
      data-vb-w={vbW} data-vb-h={vbH}
      style={{ width: '100%', height: 'auto', background: 'white', display: 'block' }}
    >
      {/* Walls */}
      {walls.map(w => {
        if (w.wall_type === 'island') {
          const e = wallEnd(w)
          return (
            <line key={w.id}
              x1={w.pos_x} y1={w.pos_y} x2={e.x} y2={e.y}
              stroke="#111" strokeWidth={sw * 4} strokeLinecap="round"
            />
          )
        }
        const poly = wallMitrePolygon(w, walls, cx.x, cx.y)
        if (!poly) return null
        return (
          <polygon key={w.id}
            points={poly}
            fill="#d8d8d8" stroke="#111" strokeWidth={sw}
            strokeLinejoin="miter"
          />
        )
      })}

      {/* Cabinets */}
      {cabinets.map(cab => {
        const wall = walls.find(w => w.id === cab.wall_id)
        if (!wall) return null
        const basePerp = wallInwardNormal(wall, cx.x, cx.y)
        const perp     = cabWallPerp(cab, wall, basePerp)
        const poly     = cabinetPolygon(cab, wall, perp)
        const center   = cabinetCenterPt(cab, wall, perp)
        return (
          <g key={cab.id}>
            <polygon points={poly} fill="#f6f6f6" stroke="#333" strokeWidth={sw * 0.6} />
            {cab.label && (
              <text
                x={center.x} y={center.y}
                textAnchor="middle" dominantBaseline="central"
                fontSize={fontSize} fill="#111"
                fontFamily="Arial, Helvetica, sans-serif"
              >
                {cab.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
