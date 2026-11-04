'use client'

// ── SliderShapesSVG ───────────────────────────────────────────────────────────
// Häfele Slider SC (z_slider_sc): the tracks and door profiles of a slider item
// as 2D outlines in any view (plan, room elevation, Cabinet Edit modal views,
// prints). `project` maps cabinet (x, y, z) into the view's SVG space. The top
// guide is dashed in plan (it's overhead); the horizontal stiles are left out
// there (they sit on the panel outline).

import { useMemo } from 'react'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { sliderProfiles, sliderPieceOutline } from '@/src/lib/resolver/sliderSC'

export default function SliderShapesSVG({ rp, project, stroke, strokeWidth, fill = 'none', fillOpacity = 0, opacity = 1, plan = false, dash, nonScaling = false }: {
  rp: Pick<ResolvedCabinet, 'slider' | 'face_zones'> | null | undefined
  project: (x: number, y: number, z: number) => { x: number; y: number }
  stroke: string
  strokeWidth: number
  fill?: string
  fillOpacity?: number
  opacity?: number
  /** Plan view: the guide (overhead) dashed. */
  plan?: boolean
  dash?: string
  nonScaling?: boolean
}) {
  const pieces = useMemo(() => (rp?.slider ? sliderProfiles(rp.slider, rp.face_zones) : []), [rp])
  if (!pieces.length) return null
  return (
    <g style={{ pointerEvents: 'none' }} opacity={opacity}>
      {pieces.map((p, i) => {
        if (plan && p.role === 'horiz') return null   // lies on the panel's outline in plan
        const pts = sliderPieceOutline(p, project)
        if (pts.length < 3) return null
        return (
          <polygon key={`sl-${i}`} points={pts.map(q => `${q.x},${q.y}`).join(' ')}
            fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth}
            strokeDasharray={plan && p.role === 'guide' ? dash : undefined} strokeLinejoin="round"
            vectorEffect={nonScaling ? 'non-scaling-stroke' : undefined} />
        )
      })}
    </g>
  )
}
