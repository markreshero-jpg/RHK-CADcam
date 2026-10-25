'use client'

// ── Ghost timber grain in elevations (z_material_colours MC11) ────────────────
// On-screen elevation + printed elevations / shop drawings: a panel cut from a
// grained colour (materials.has_grain) gets a very light shade and faint grain
// lines, clipped to the panel. Same lines as the 3D grain (src/lib/grainLines),
// tiled on a fixed wall grid so the grain carries on across neighbouring doors.
// Plain <path> + <clipPath> (no <pattern>) so svg2pdf prints it reliably.
// Gated by the 'grain' layer item; the layer's colour / opacity restyle it.

import { useEffect, useId, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import { GRAIN_TILE, grainTilePath } from '@/src/lib/grainLines'

const EMPTY: ReadonlySet<string> = new Set()
let grained: Promise<ReadonlySet<string>> | null = null

// Ids of every grained material (a short list), fetched once per page load.
export function useGrainedMaterialIds(): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(EMPTY)
  useEffect(() => {
    grained ??= Promise.resolve(supabase.from('materials').select('id').eq('has_grain', true))
      .then(({ data }) => new Set(((data ?? []) as { id: string }[]).map(r => r.id)) as ReadonlySet<string>)
      .catch(() => EMPTY)
    let live = true
    grained.then(s => { if (live) setIds(s) })
    return () => { live = false }
  }, [])
  return ids
}

export const GRAIN_INK = '#6f6458'

// dir 'v' = grain up the panel (doors, fronts, panels); 'h' = along it (kicks).
export default function GrainSVG({ x, y, w, h, dir, color = GRAIN_INK, strokeWidth, opacity = 1 }: {
  x: number; y: number; w: number; h: number
  dir: 'v' | 'h'
  color?: string
  strokeWidth: number
  opacity?: number
}) {
  const clipId = 'grain' + useId().replace(/[^a-zA-Z0-9]/g, '')
  if (w <= 0 || h <= 0) return null
  const A = GRAIN_TILE.across, L = GRAIN_TILE.along
  // Tile steps in world x / y: across × along upright, along × across turned.
  const sx = dir === 'v' ? A : L, sy = dir === 'v' ? L : A
  const tiles: [number, number][] = []
  for (let tx = Math.floor(x / sx) * sx; tx < x + w; tx += sx)
    for (let ty = Math.floor(y / sy) * sy; ty < y + h; ty += sy) tiles.push([tx, ty])
  const d = grainTilePath()
  return (
    <g style={{ pointerEvents: 'none' }}>
      <clipPath id={clipId}><rect x={x} y={y} width={w} height={h} /></clipPath>
      <g clipPath={`url(#${clipId})`} opacity={opacity}>
        <rect x={x} y={y} width={w} height={h} fill={color} fillOpacity={0.07} />
        {tiles.map(([tx, ty]) => (
          // 'h' swaps the tile's axes so the grain runs along x.
          <path key={`${tx},${ty}`} d={d}
            transform={dir === 'v' ? `translate(${tx} ${ty})` : `matrix(0 1 1 0 ${tx} ${ty})`}
            fill="none" stroke={color} strokeWidth={strokeWidth} strokeOpacity={0.4} />
        ))}
      </g>
    </g>
  )
}
