// Grain match layer marks (z_grain_match G2): a matched front's tint + outline in
// its group colour, and the group tag pill (GM1 ↕). Shared by plan / elevation /
// their prints so they all read the same.
import type { CabinetInstance, Wall } from '@/src/lib/types'
import { cabT, cabWallPerp, cabinetPlanFrame, centroid, wallInwardNormal } from '@/src/lib/geometry'
import { grainMatchTag, grainMatchTagCabs, type GrainMatchGroup } from '@/src/lib/grainMatch'

type Rect = { x: number; y: number; w: number; h: number }

export function GrainMatchFrontSVG({ r, colour, sw, opacity = 1 }: { r: Rect; colour: string; sw: number; opacity?: number }) {
  return (
    <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={colour} fillOpacity={0.3}
      stroke={colour} strokeWidth={sw} opacity={opacity} style={{ pointerEvents: 'none' }} />
  )
}

/** Tag pill with its top-left at (x, y). */
export function GrainMatchTagSVG({ x, y, text, colour, fs, opacity = 1 }: { x: number; y: number; text: string; colour: string; fs: number; opacity?: number }) {
  const padX = fs * 0.4, h = fs * 1.4
  const w = text.length * fs * 0.62 + padX * 2
  return (
    <g opacity={opacity} style={{ pointerEvents: 'none', userSelect: 'none' }}>
      <rect x={x} y={y} width={w} height={h} rx={h * 0.25} fill={colour} />
      <text x={x + padX} y={y + h * 0.72} fontSize={fs} fontWeight={700} fill="#ffffff"
        fontFamily="Arial, Helvetica, sans-serif">{text}</text>
    </g>
  )
}

/** Bounding box of rects (null when empty). */
export function unionRect(rs: Rect[]): Rect | null {
  if (!rs.length) return null
  const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y))
  const x1 = Math.max(...rs.map(r => r.x + r.w)), y1 = Math.max(...rs.map(r => r.y + r.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * Plan marks: a bar just in front of each matched cabinet's fronts, in the group
 * colour, and the group tag beyond the bar at its leftmost member. World mm.
 */
export function GrainMatchPlanSVG({ cabinets, walls, groups, colour, sw, fs, opacity = 1 }: {
  cabinets: CabinetInstance[]; walls: Wall[]; groups: GrainMatchGroup[]
  colour: (g: GrainMatchGroup) => string; sw: number; fs: number; opacity?: number
}) {
  if (!groups.length) return null
  const cx = centroid(walls)
  const wallOf = (c: CabinetInstance) => walls.find(w => w.id === c.wall_id)
  const matched = cabinets.filter(c => c.grain_match_group_id && wallOf(c))
  const tagCabs = grainMatchTagCabs(matched, c => cabT(c, wallOf(c)!))
  const OFF = 25   // mm in front of the fronts
  return (
    <g style={{ pointerEvents: 'none' }}>
      {matched.map(cab => {
        const g = groups.find(x => x.id === cab.grain_match_group_id)
        const wall = wallOf(cab)!
        if (!g) return null
        const perp = cabWallPerp(cab, wall, wallInwardNormal(wall, cx))
        const { o, x: wd } = cabinetPlanFrame(cab, wall, perp)
        const a = { x: o.x + (cab.dz + OFF) * perp.x, y: o.y + (cab.dz + OFF) * perp.y }
        const b = { x: a.x + cab.dx * wd.x, y: a.y + cab.dx * wd.y }
        const col = colour(g)
        const tagAt = tagCabs.get(g.id) === cab.id
          ? { x: a.x + perp.x * fs * 1.2, y: a.y + perp.y * fs * 1.2 } : null
        return (
          <g key={cab.id} opacity={opacity}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={sw} strokeLinecap="butt" />
            {tagAt && <GrainMatchTagSVG x={tagAt.x} y={tagAt.y - fs * 0.7} text={grainMatchTag(g)} colour={col} fs={fs} />}
          </g>
        )
      })}
    </g>
  )
}
