// Handle glyphs for the 2D views (z_handles H2). Geometry comes from
// src/lib/handleGeometry so elevation, print and plan all agree.
import { sharknoseLine, sharknoseWedge, type HandleShape } from '@/src/lib/handleGeometry'
import type { ResolvedFaceZone } from '@/src/lib/resolver/types'

type Project = (x: number, y: number) => { x: number; y: number }

/** Face-on handle: rounded bar or knob, plus its hole centres when asked. */
export function HandleElevSVG({ s, project, stroke, fill, strokeWidth, opacity, showHoles = false }: {
  s: HandleShape
  /** cabinet X / Y (Y up) → SVG point */
  project: Project
  stroke: string
  fill: string
  strokeWidth: number
  opacity?: number
  showHoles?: boolean
}) {
  const tl = project(s.cx - s.w / 2, s.cy + s.h / 2)
  const br = project(s.cx + s.w / 2, s.cy - s.h / 2)
  const x = Math.min(tl.x, br.x), y = Math.min(tl.y, br.y)
  const w = Math.abs(br.x - tl.x), h = Math.abs(br.y - tl.y)
  return (
    <g opacity={opacity} style={{ pointerEvents: 'none' }}>
      {s.kind === 'knob'
        ? <circle cx={x + w / 2} cy={y + h / 2} r={w / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        : <rect x={x} y={y} width={w} height={h} rx={Math.min(w, h) / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />}
      {showHoles && <HandleHolesSVG s={s} project={project} color={stroke} strokeWidth={strokeWidth} />}
    </g>
  )
}

/** The handle's drilled through-holes: a ring at true size plus a centre cross,
 *  so they read even when small. Empty when the handle isn't drilled. */
export function HandleHolesSVG({ s, project, color, strokeWidth, opacity }: {
  s: HandleShape
  project: Project
  color: string
  strokeWidth: number
  opacity?: number
}) {
  if (!s.holes.length) return null
  return (
    <g opacity={opacity} style={{ pointerEvents: 'none' }}>
      {s.holes.map((p, i) => {
        const c = project(p.x, p.y)
        const r = Math.abs(project(p.x + p.r, p.y).x - c.x)
        const k = r * 1.8
        return (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} />
            <line x1={c.x - k} y1={c.y} x2={c.x + k} y2={c.y} stroke={color} strokeWidth={strokeWidth * 0.6} />
            <line x1={c.x} y1={c.y - k} x2={c.x} y2={c.y + k} stroke={color} strokeWidth={strokeWidth * 0.6} />
          </g>
        )
      })}
    </g>
  )
}

/** Sharknose (z_handles H3): a shaded band over the bevel, from the grip edge
 *  to a dashed hidden line where the bevel meets the back face, labelled
 *  "SN 38°" when there's room. Fronts without a bevel draw nothing. */
export function SharknoseLinesSVG({ zones, project, stroke, strokeWidth, dash, opacity, fill = '#f59e0b', fontSize }: {
  zones: ResolvedFaceZone[]
  project: Project
  stroke: string
  strokeWidth: number
  dash: string
  opacity?: number
  fill?: string
  /** SVG units; omit for no label */
  fontSize?: number
}) {
  const lines = zones.map(sharknoseLine).filter(l => l != null)
  if (!lines.length) return null
  return (
    <g opacity={opacity} style={{ pointerEvents: 'none' }}>
      {lines.map((l, i) => {
        const a = project(l.x1, l.y), b = project(l.x2, l.y), e = project(l.x1, l.edgeY)
        const y = Math.min(a.y, e.y), h = Math.abs(a.y - e.y), w = Math.abs(b.x - a.x)
        const label = `SN ${Math.round(l.angle)}°`
        const showLabel = fontSize != null && h >= fontSize * 0.9 && w >= fontSize * label.length * 0.7
        return (
          <g key={i}>
            <rect x={Math.min(a.x, b.x)} y={y} width={w} height={h} fill={fill} fillOpacity={0.3} />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />
            {showLabel && (
              <text x={(a.x + b.x) / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central"
                fontSize={fontSize} fill={stroke} fontFamily="Arial, Helvetica, sans-serif">{label}</text>
            )}
          </g>
        )
      })}
    </g>
  )
}

/** Side view: the wedge the sharknose saw cut removes, shaded over the front. */
export function SharknoseWedgesSVG({ zones, project, stroke, strokeWidth }: {
  zones: ResolvedFaceZone[]
  /** cabinet Y / Z → SVG point */
  project: (y: number, z: number) => { x: number; y: number }
  stroke: string
  strokeWidth: number
}) {
  const wedges = zones.map(sharknoseWedge).filter(w => w != null)
  if (!wedges.length) return null
  return (
    <g style={{ pointerEvents: 'none' }}>
      {wedges.map((w, i) => (
        <polygon key={i} points={w.map(p => { const q = project(p.y, p.z); return `${q.x},${q.y}` }).join(' ')}
          fill="#f59e0b" fillOpacity={0.55} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  )
}
