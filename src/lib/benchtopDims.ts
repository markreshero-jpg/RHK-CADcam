// Benchtop row on the plan dimension chains (display layer item `dim_benchtop`):
// each top anchored to the wall, projected onto it as an along-wall span.
import type { BenchtopInstance, Wall } from '@/src/lib/types'
import { wallDir } from '@/src/lib/geometry'
import { btSegments, outlinePoints } from '@/src/lib/benchtopGeometry'

export interface BenchtopSpan { t0: number; t1: number; side: 'face' | 'back' }

export function benchtopWallSpans(benchtops: BenchtopInstance[], wall: Wall): BenchtopSpan[] {
  const d = wallDir(wall)
  return benchtops
    .filter(bt => bt.wall_id === wall.id)
    .map(bt => {
      const ts = outlinePoints(btSegments(bt), 4).map(p => (p.x - wall.pos_x) * d.x + (p.y - wall.pos_y) * d.y)
      return { t0: Math.min(...ts), t1: Math.max(...ts), side: bt.wall_side ?? 'face' }
    })
    .filter(s => Number.isFinite(s.t0) && s.t1 - s.t0 > 0.5)
    .sort((a, b) => a.t0 - b.t0)
}
