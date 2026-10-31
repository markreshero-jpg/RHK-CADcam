'use client'

// ============================================================
// Tool set section view (z_cnc_tools T3b). A sample door cut through one
// edge — door edge on the left, frame line 60 in, panel running off to the
// right — with every step's cut shaded in its colour and its tool drawn in
// place (real silhouette from cnc_tools.shape_profile). The open step is drawn
// solid, the others faint. A corner plan view beside it shows what the
// square-out steps do (they don't touch a straight edge, so the section can't).
// Pure SVG, redraws live from the steps; geometry mirrors the CNC (gcode.ts
// emitRoutes): edge-inside tools sit a radius in from the line, centre tools on
// it, ring pockets clear a band, depth ≥ board = right through.
// ============================================================

import { buildProfile, shapeTypeFor, type ToolShape } from '@/src/lib/cnc/toolProfile'

export interface SectionStep {
  id: string; sort_order: number; operation_type: string
  tool_id: string | null; depth_mm: number | null
  offset_left_mm: number | null; tool_position?: string | null
  ring_width_mm?: number | null; width_mm?: number | null
}
export interface SectionTool {
  id: string; name: string; tool_number: string | null
  diameter: number | null; tool_type?: string | null; cutting_length?: number | null
  shape_profile?: ToolShape | null
}

const COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#fb923c', '#2dd4bf']
const BG = '#0f172a', WOOD = '#a16207', LINE = '#94a3b8'
const FRAME = 60          // sample frame line (mm in from the door edge)
const XMAX = 175          // section extent (mm)
const ABOVE = 16          // tool body shown above the face (mm)
const SAMPLE_OP_DEPTH = 5 // a step with no depth uses the operation's — drawn at this

export function stepColor(i: number) { return COLORS[i % COLORS.length] }

function toolShape(t: SectionTool): ToolShape {
  const dia = Number(t.diameter) || 6
  const cl = Number(t.cutting_length) || 20
  const base = t.shape_profile ?? { type: shapeTypeFor(t.tool_type), params: {} }
  return { type: base.type, params: { ...base.params, diameter: dia, cutting_length: cl } }
}

export default function ToolSetSectionDiagram({ steps, tools, thickness, activeId }: {
  steps: SectionStep[]; tools: SectionTool[]; thickness: number; activeId: string | null
}) {
  const T = Math.max(3, thickness)
  const s = 3.1                                  // px per mm
  const padL = 10, padT = 8
  const W = padL * 2 + XMAX * s
  const H = padT + (ABOVE + T + 6) * s + 26
  const X = (x: number) => padL + x * s
  const Y = (y: number) => padT + (ABOVE + T - y) * s   // y = mm up from the board bottom
  const toolById = new Map(tools.map(t => [t.id, t]))
  const ordered = [...steps].sort((a, b) => a.sort_order - b.sort_order).filter(st => st.operation_type !== 'drill')

  // `cut` = separate paths (a rect and a tool silhouette as ONE path cancel out
  // where their windings oppose, leaving a hole in the shading).
  type Drawn = { st: SectionStep; i: number; tool: SectionTool | null; depth: number; through: boolean; line: number; cut: string[]; toolPath: string | null; labelX: number; note?: string }
  const drawn: Drawn[] = ordered.map((st, i) => {
    const tool = st.tool_id ? toolById.get(st.tool_id) ?? null : null
    const raw = st.depth_mm != null && st.depth_mm > 0 ? st.depth_mm : SAMPLE_OP_DEPTH
    const through = raw >= T - 0.01
    const depth = through ? T + 1.2 : raw
    const line = FRAME + (st.offset_left_mm ?? 0)            // positive inset → into the panel
    const r = (Number(tool?.diameter) || 0) / 2
    const centre = st.tool_position === 'centre'
    const cx = centre ? line : line + r
    const floor = T - depth
    const rect = (x0: number, x1: number) => `M${X(x0)},${Y(T + 0.01)} L${X(x1)},${Y(T + 0.01)} L${X(x1)},${Y(floor)} L${X(x0)},${Y(floor)} Z`
    let toolPath: string | null = null
    let silhouette: string | null = null
    if (tool) {
      const g = buildProfile(toolShape(tool))
      silhouette = g.outline.map((p, k) => `${k ? 'L' : 'M'}${X(cx + p.x).toFixed(1)},${Y(floor + p.y).toFixed(1)}`).join(' ') + ' Z'
      toolPath = silhouette
    }
    const op = st.operation_type
    let cut: string[] = []
    let note: string | undefined
    if (op === 'square_off') {
      note = 'corners only'
    } else if (op === 'pocket' || op === 'raster') {
      const ring = st.ring_width_mm != null && st.ring_width_mm > 0 ? st.ring_width_mm : null
      const x0 = centre ? line - r : line
      // The band from the tool's centre on; the wall itself takes the tool's shape.
      cut = [rect(Math.min(cx, x0 + r), ring ? Math.min(XMAX, line + ring) : XMAX), ...(silhouette ? [silhouette] : [rect(x0, x0 + 2 * r)])]
    } else if (op === 'groove') {
      const w = Math.max(st.width_mm ?? 0, 2 * r)
      cut = [silhouette && (st.width_mm ?? 0) <= 2 * r ? silhouette : rect(line - w / 2, line + w / 2)]
    } else if (silhouette || r > 0) {
      cut = [silhouette ?? rect(cx - r, cx + r)]   // outline / profile: one lap = the tool's footprint
    }
    return { st, i, tool, depth: raw, through, line, cut, toolPath, labelX: Math.min(XMAX - 4, Math.max(4, cx)), note }
  })

  // Step-number markers: spread any that would overlap (≥ 6mm apart).
  const labelAt = new Map<string, number>()
  let lastX = -Infinity
  for (const d of [...drawn].sort((a, b) => a.labelX - b.labelX || a.i - b.i)) {
    const x = Math.max(d.labelX, lastX + 6)
    labelAt.set(d.st.id, x); lastX = x
  }

  // Corner plan: the radius each step leaves in an inside corner (per line —
  // a glass rebate corner and its opening corner are different corners).
  const radii: { r: number; i: number; line: number }[] = []
  const prevByLine = new Map<number, number>()
  for (const d of drawn) {
    const r = (Number(d.tool?.diameter) || 0) / 2
    if (!d.tool || d.st.tool_position === 'centre' || d.st.operation_type === 'groove') continue
    const prev = prevByLine.get(d.line)
    if (d.st.operation_type === 'square_off' && !(prev != null && r < prev)) continue
    radii.push({ r, i: d.i, line: d.line }); prevByLine.set(d.line, r)
  }
  const manyLines = new Set(radii.map(x => x.line)).size > 1
  const CW = 150, CV = 26                           // corner view: px, mm shown
  const cs = (CW - 20) / CV
  const cX = (x: number) => 14 + x * cs, cY = (y: number) => CW - 14 - y * cs

  const clipId = 'tss-board'
  return (
    <div className="flex gap-3 flex-wrap items-start">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tool set section through a sample door" className="rounded-md shrink-0" style={{ background: BG, maxWidth: '100%' }}>
        <defs>
          <clipPath id={clipId}><rect x={X(0)} y={Y(T)} width={XMAX * s} height={T * s + 6 * s} /></clipPath>
        </defs>
        {/* board + spoilboard */}
        <rect x={X(0)} y={Y(0)} width={XMAX * s} height={4 * s} fill="#334155" opacity={0.6} />
        <rect x={X(0)} y={Y(T)} width={XMAX * s} height={T * s} fill={WOOD} fillOpacity={0.45} stroke={WOOD} />
        {/* cuts, in order (later steps over earlier) */}
        <g clipPath={`url(#${clipId})`}>
          {drawn.map(d => d.cut.map((c, k) => (
            <g key={`c${d.st.id}-${k}`}>
              <path d={c} fill={BG} />
              <path d={c} fill={stepColor(d.i)} fillOpacity={activeId && activeId !== d.st.id ? 0.18 : 0.38} />
            </g>
          )))}
        </g>
        {/* frame line + labels */}
        <line x1={X(FRAME)} y1={Y(T + ABOVE - 2)} x2={X(FRAME)} y2={Y(-3)} stroke={LINE} strokeDasharray="3 3" />
        <text x={X(FRAME) + 3} y={Y(T + ABOVE - 4)} fill={LINE} fontSize={9} fontFamily="monospace">line {FRAME}</text>
        <text x={X(2)} y={Y(T + ABOVE - 4)} fill={LINE} fontSize={9} fontFamily="monospace">door edge</text>
        <text x={X(XMAX) - 4} y={Y(T + ABOVE - 4)} textAnchor="end" fill={LINE} fontSize={9} fontFamily="monospace">panel →</text>
        {/* tools: open step solid, the rest faint */}
        {drawn.map(d => d.toolPath && (
          <path key={`t${d.st.id}`} d={d.toolPath} fill={stepColor(d.i)} fillOpacity={activeId === d.st.id ? 0.22 : 0.04}
            stroke={stepColor(d.i)} strokeWidth={activeId === d.st.id ? 1.8 : 0.8} strokeOpacity={!activeId || activeId === d.st.id ? 1 : 0.35}
            strokeDasharray={d.st.operation_type === 'square_off' ? '3 2' : undefined} />
        ))}
        {/* step numbers + depths along the bottom */}
        {drawn.map(d => (
          <g key={`l${d.st.id}`}>
            <circle cx={X(labelAt.get(d.st.id) ?? d.labelX)} cy={H - 12} r={7} fill={stepColor(d.i)} opacity={!activeId || activeId === d.st.id ? 1 : 0.4} />
            <text x={X(labelAt.get(d.st.id) ?? d.labelX)} y={H - 9} textAnchor="middle" fontSize={9} fontWeight={700} fill={BG}>{d.i + 1}</text>
          </g>
        ))}
        <text x={W - 6} y={Y(-3.5)} textAnchor="end" fill={LINE} fontSize={8} fontFamily="monospace">{T}mm board · machined face up</text>
      </svg>

      {/* Corner plan view */}
      <svg width={CW} height={CW + 18} viewBox={`0 0 ${CW} ${CW + 18}`} role="img" aria-label="Inside corner, plan view" className="rounded-md shrink-0" style={{ background: BG }}>
        <rect x={0} y={0} width={14} height={CW} fill={WOOD} fillOpacity={0.45} />
        <rect x={0} y={CW - 14} width={CW} height={14} fill={WOOD} fillOpacity={0.45} />
        {radii.map(({ r, i }) => {
          const rr = Math.min(r, CV - 1)
          return <path key={`r${i}`} d={`M${cX(0)},${cY(CV)} L${cX(0)},${cY(rr)} A${rr * cs},${rr * cs} 0 0 1 ${cX(rr)},${cY(0)} L${cX(CV)},${cY(0)}`}
            fill="none" stroke={stepColor(i)} strokeWidth={activeId && drawn[i]?.st.id === activeId ? 2.2 : 1.4} />
        })}
        {radii.map(({ r, i, line }, k) => (
          <text key={`rt${i}`} x={CW - 6} y={14 + k * 12} textAnchor="end" fill={stepColor(i)} fontSize={9} fontFamily="monospace">{`${i + 1}: R${Math.round(r * 10) / 10}${manyLines ? ` @${Math.round(line * 10) / 10}` : ''}`}</text>
        ))}
        <text x={CW / 2} y={CW + 12} textAnchor="middle" fill={LINE} fontSize={9} fontFamily="monospace">inside corner, plan</text>
      </svg>

      {/* Legend */}
      <div className="text-[10px] space-y-1 min-w-[180px]">
        {drawn.map(d => (
          <div key={`g${d.st.id}`} className={`flex items-start gap-1.5 ${activeId && activeId !== d.st.id ? 'opacity-50' : ''}`}>
            <span className="inline-block w-2.5 h-2.5 rounded-sm mt-0.5 shrink-0" style={{ background: stepColor(d.i) }} />
            <span className="text-ink-muted">
              <b className="text-ink">{d.i + 1}. {d.st.operation_type}</b>{' '}
              {d.tool ? `${d.tool.tool_number ?? ''} ${d.tool.name}`.trim() : <span className="text-amber-400">no tool</span>}
              {' · '}{d.through ? 'right through' : d.st.depth_mm != null && d.st.depth_mm > 0 ? `${d.depth} deep` : 'operation depth'}
              {d.st.tool_position === 'centre' ? ' · centre on line' : ''}
              {d.st.ring_width_mm ? ` · band ${d.st.ring_width_mm}` : ''}
              {d.note ? ` · ${d.note}` : ''}
              {d.st.offset_left_mm ? ` · ${d.st.offset_left_mm > 0 ? 'in' : 'out'} ${Math.abs(d.st.offset_left_mm)}` : ''}
            </span>
          </div>
        ))}
        <p className="text-ink-subtle pt-1 leading-snug">Sample door: line {FRAME} in from the edge. A step with no depth is drawn at {SAMPLE_OP_DEPTH} (it takes the door profile’s depth).</p>
      </div>
    </div>
  )
}
