// Benchtop row on the plan dimension chains (display layer item `dim_benchtop`):
// each top anchored to the wall, projected onto it as an along-wall span, plus its
// depth off the face it sits on (inside face, or the outer face for a back-side top
// on a perimeter wall; an island's line is both faces, and an island top usually
// straddles it, so its depth runs from its far edge behind the line to its front).
import type { BenchtopInstance, Wall } from '@/src/lib/types'
import { wallDir } from '@/src/lib/geometry'
import { btSegments, outlinePoints } from '@/src/lib/benchtopGeometry'

/** `from`: where the depth dim starts, mm off the wall line along the side's direction
 *  (negative = behind the line, for an island top that straddles it). */
export interface BenchtopSpan { t0: number; t1: number; depth: number; from: number; side: 'face' | 'back' }

export function benchtopWallSpans(benchtops: BenchtopInstance[], wall: Wall, inward: { x: number; y: number }): BenchtopSpan[] {
  const d = wallDir(wall)
  const island = wall.wall_type === 'island'
  const back = island ? 0 : wall.thickness
  return benchtops
    .filter(bt => bt.wall_id === wall.id)
    .map(bt => {
      const pts = outlinePoints(btSegments(bt), 4)
      const ts = pts.map(p => (p.x - wall.pos_x) * d.x + (p.y - wall.pos_y) * d.y)
      const side = bt.wall_side ?? 'face'
      const n = side === 'back' ? -1 : 1
      const ds = pts.map(p => n * ((p.x - wall.pos_x) * inward.x + (p.y - wall.pos_y) * inward.y))
      const from = island ? Math.min(...ds) : side === 'back' ? back : 0
      return { t0: Math.min(...ts), t1: Math.max(...ts), depth: Math.max(...ds) - from, from, side }
    })
    .filter(s => Number.isFinite(s.t0) && s.t1 - s.t0 > 0.5)
    .sort((a, b) => a.t0 - b.t0)
}
