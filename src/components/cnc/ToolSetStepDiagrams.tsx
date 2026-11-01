'use client'

// ============================================================
// Live diagrams for the tool-set step fields (Settings → CNC Tool
// Sets, z_cnc_tools T3c). One per field / field group, redrawn from
// the values, shown in a FieldCard beside the control. Plan views
// look down on the door; section views cut through it.
// Conventions: dashed grey = the line (from the door profile's edge
// offset), blue = this step's tool / cut, amber = the dimension the
// field sets. Same palette as ToolFieldDiagrams.
// ============================================================

import { useId } from 'react'
import { Frame, W, H, TOOL, LINE, HI, BOARD, SPOIL, BG, txt } from './ToolFieldDiagrams'

const hiTxt = { fill: HI, fontSize: 9, fontFamily: 'monospace' } as const
const fmt = (v: number) => String(Math.round(v * 100) / 100)

// ---- Step type: plan of a whole door, what this kind of step cuts ----
export function StepTypeDiagram({ type }: { type: string }) {
  const dx0 = 30, dy0 = 8, dx1 = 138, dy1 = 90          // door
  const x0 = 46, y0 = 24, x1 = 122, y1 = 74              // the line
  const label: Record<string, string> = {
    pocket: 'CLEARS THE AREA', raster: 'CLEARS IN LANES', outline: 'ONE LAP INSIDE', profile: 'ONE LAP INSIDE',
    square_off: '4 CORNERS ONLY', groove: 'A SLOT', drill: 'NOT ROUTED',
  }
  const lanes = []
  for (let y = y0 + 5; y < y1; y += 8) lanes.push(y)
  return (
    <Frame label={`Step type ${type}`}>
      <rect x={dx0} y={dy0} width={dx1 - dx0} height={dy1 - dy0} fill={BOARD} fillOpacity={0.25} stroke={BOARD} />
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke={LINE} strokeDasharray="3 2" />
      {(type === 'pocket' || type === 'raster') && <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={TOOL} fillOpacity={0.35} />}
      {type === 'raster' && <polyline fill="none" stroke={TOOL} strokeWidth={1}
        points={lanes.flatMap((y, i) => i % 2 ? [`${x1 - 4},${y}`, `${x0 + 4},${y}`] : [`${x0 + 4},${y}`, `${x1 - 4},${y}`]).join(' ')} />}
      {(type === 'outline' || type === 'profile') && <rect x={x0 + 3} y={y0 + 3} width={x1 - x0 - 6} height={y1 - y0 - 6} fill="none" stroke={TOOL} strokeOpacity={0.6} strokeWidth={6} />}
      {type === 'square_off' && [[x0, y0], [x1 - 7, y0], [x0, y1 - 7], [x1 - 7, y1 - 7]].map(([x, y], i) =>
        <rect key={i} x={x} y={y} width={7} height={7} fill={HI} />)}
      {type === 'groove' && <line x1={x0} y1={(y0 + y1) / 2} x2={x1} y2={(y0 + y1) / 2} stroke={TOOL} strokeWidth={6} strokeOpacity={0.7} />}
      {type === 'drill' && [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y], i) =>
        <circle key={i} cx={x} cy={y} r={3.5} fill="none" stroke={LINE} />)}
      <text x={W / 2} y={H - 8} textAnchor="middle" {...txt}>{label[type] ?? type.toUpperCase()}</text>
    </Frame>
  )
}

// ---- Depth: section through the board ----
export function DepthDiagram({ depth, thickness }: { depth: number | null; thickness: number }) {
  const bx0 = 14, bx1 = 154, top = 34, Tpx = 36, bot = top + Tpx, spoilBot = bot + 14
  const k = Tpx / Math.max(thickness, 1)
  const blank = depth == null || !(depth > 0)
  const d = blank ? thickness * 0.3 : depth!
  const through = !blank && d >= thickness
  const cutBot = through ? bot + 4 : top + d * k
  const cx0 = 62, cx1 = 106
  return (
    <Frame label={blank ? 'Depth from the operation' : `Depth ${d}mm`}>
      <rect x={bx0} y={top} width={bx1 - bx0} height={Tpx} fill={BOARD} fillOpacity={0.35} stroke={BOARD} />
      <rect x={bx0} y={bot} width={bx1 - bx0} height={spoilBot - bot} fill={SPOIL} fillOpacity={0.6} />
      <rect x={cx0} y={top - 1} width={cx1 - cx0} height={cutBot - top + 1} fill={BG} stroke={TOOL} strokeDasharray={blank ? '3 2' : undefined} />
      <rect x={cx0 + 10} y={6} width={cx1 - cx0 - 20} height={cutBot - 6} fill={TOOL} fillOpacity={0.22} stroke={TOOL} strokeDasharray={blank ? '3 2' : undefined} />
      <text x={bx0 + 3} y={top + 11} {...txt}>{fmt(thickness)}</text>
      <line x1={cx1 + 8} y1={top} x2={cx1 + 8} y2={cutBot} stroke={HI} strokeWidth={1.5} />
      <line x1={cx1 + 4} y1={top} x2={cx1 + 12} y2={top} stroke={HI} />
      <line x1={cx1 + 4} y1={cutBot} x2={cx1 + 12} y2={cutBot} stroke={HI} />
      <text x={cx1 + 15} y={(top + cutBot) / 2 + 3} {...hiTxt}>{blank ? '?' : fmt(d)}</text>
      <text x={W / 2} y={H - 8} textAnchor="middle" {...txt}>{blank ? "BLANK = OPERATION'S DEPTH" : through ? 'RIGHT THROUGH' : `${fmt(d)} DEEP`}</text>
    </Frame>
  )
}

// ---- Tool on the line: section at the line ----
export function ToolPositionDiagram({ position, diameter }: { position: string; diameter: number }) {
  const centre = position === 'centre'
  const top = 50, bot = 84, lx = 84, tw = 30
  const tx = centre ? lx - tw / 2 : lx
  return (
    <Frame label={centre ? 'Tool centre on the line' : 'Tool edge on the line, cutting inside'}>
      <rect x={10} y={top} width={W - 20} height={bot - top} fill={BOARD} fillOpacity={0.35} stroke={BOARD} />
      <rect x={tx} y={top - 1} width={tw} height={15} fill={BG} />
      {centre
        ? <path d={`M${tx} 10 L${tx + tw} 10 L${tx + tw} ${top - 6} L${lx} ${top + 14} L${tx} ${top - 6} Z`} fill={TOOL} fillOpacity={0.25} stroke={TOOL} strokeWidth={1.4} />
        : <rect x={tx} y={10} width={tw} height={top + 14 - 10} fill={TOOL} fillOpacity={0.25} stroke={TOOL} strokeWidth={1.4} />}
      <line x1={lx} y1={4} x2={lx} y2={bot + 6} stroke={HI} strokeDasharray="3 2" strokeWidth={1.4} />
      <text x={(centre ? tx : lx) - 3} y={16} textAnchor="end" {...hiTxt}>line</text>
      <text x={14} y={top - 4} {...txt}>← door edge</text>
      <text x={W - 14} y={top - 4} textAnchor="end" {...txt}>centre →</text>
      <text x={W / 2} y={H - 4} textAnchor="middle" {...txt}>{centre ? `CENTRE ON LINE · Ø${fmt(diameter)}` : 'EDGE ON LINE, CUTS INSIDE'}</text>
    </Frame>
  )
}

// ---- Fill strategy: plan of the cleared area ----
export function FillDiagram({ strategy, angle }: { strategy: string | null; angle: number | null }) {
  const id = useId().replace(/:/g, '')
  const x0 = 24, y0 = 12, x1 = 144, y1 = 86, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const s = strategy ?? 'raster'
  const rings = [0, 9, 18, 27]
  const lanes = []
  for (let y = y0 - 60; y < y1 + 60; y += 9) lanes.push(y)
  return (
    <Frame label={`Fill ${s}`}>
      <defs><clipPath id={`c${id}`}><rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} /></clipPath></defs>
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={TOOL} fillOpacity={0.12} stroke={LINE} strokeDasharray="3 2" />
      {s === 'raster' && (
        <g clipPath={`url(#c${id})`}>
          <g transform={`rotate(${-(angle ?? 0)} ${cx} ${cy})`}>
            <polyline fill="none" stroke={TOOL} strokeWidth={1.2}
              points={lanes.flatMap((y, i) => i % 2 ? [`${cx + 90},${y}`, `${cx - 90},${y}`] : [`${cx - 90},${y}`, `${cx + 90},${y}`]).join(' ')} />
          </g>
        </g>
      )}
      {s !== 'raster' && rings.map(r => <rect key={r} x={x0 + 4 + r} y={y0 + 4 + r * 0.6} width={x1 - x0 - 8 - 2 * r} height={y1 - y0 - 8 - 1.2 * r} fill="none" stroke={TOOL} strokeWidth={1.2} />)}
      {s !== 'raster' && (s === 'spiral_in'
        ? <path d={`M${x0 + 4} ${cy} L${cx - 22} ${cy} m-6 -4 l6 4 l-6 4`} stroke={HI} strokeWidth={1.6} fill="none" />
        : <path d={`M${cx - 30} ${cy} L${x0 + 6} ${cy} m6 -4 l-6 4 l6 4`} stroke={HI} strokeWidth={1.6} fill="none" />)}
      <text x={W / 2} y={H - 8} textAnchor="middle" {...txt}>
        {strategy == null ? 'BLANK = RASTER' : s === 'raster' ? 'BACK AND FORTH' : s === 'spiral_in' ? 'EDGE FIRST, IN TO MIDDLE' : 'MIDDLE FIRST, OUT TO EDGE'}
      </text>
    </Frame>
  )
}

// ---- Ring width: plan of a corner, the band that's cleared ----
export function RingDiagram({ ring }: { ring: number | null }) {
  const lx = 40, ly = 28
  const whole = ring == null || !(ring > 0)
  const b = whole ? 0 : Math.max(8, Math.min(46, ring! * 1.6))
  const band = whole
    ? `M${lx} ${ly} H${W - 8} V${H - 16} H${lx} Z`
    : `M${lx} ${ly} H${W - 8} V${H - 16} H${lx} Z M${lx + b} ${ly + b} V${H - 16} H${W - 8} V${ly + b} Z`
  return (
    <Frame label={whole ? 'Pocket clears the whole area' : `Ring ${ring}mm wide`}>
      <rect x={8} y={8} width={W - 16} height={H - 24} fill={BOARD} fillOpacity={0.25} stroke={BOARD} />
      <path d={band} fill={TOOL} fillOpacity={0.35} fillRule="evenodd" />
      <path d={`M${W - 8} ${ly} H${lx} V${H - 16}`} fill="none" stroke={LINE} strokeDasharray="3 2" />
      {!whole && <>
        <line x1={lx} y1={ly + b + 10} x2={lx + b} y2={ly + b + 10} stroke={HI} strokeWidth={1.5} />
        <text x={lx + b + 4} y={ly + b + 13} {...hiTxt}>{fmt(ring!)}</text>
        <text x={lx + b + 8} y={ly + b + 30} {...txt}>left alone</text>
      </>}
      <text x={12} y={20} {...txt}>door edge</text>
      <text x={W / 2} y={H - 3} textAnchor="middle" {...txt}>{whole ? 'BLANK = WHOLE AREA' : 'ONLY THIS BAND IS CLEARED'}</text>
    </Frame>
  )
}

// ---- Clean-up radius (square_off): corner of the pocket ----
export function CleanupDiagram({ radius, toolDiameter }: { radius: number | null; toolDiameter: number }) {
  const x = 50, y = 26, R = 44
  const r0 = radius ?? 0, t = toolDiameter / 2
  const ok = r0 > t + 0.01
  const tp = ok ? Math.max(3, R * t / r0) : R
  return (
    <Frame label={`Clean corner radius ${r0} to ${t}`}>
      <rect x={8} y={8} width={W - 16} height={H - 24} fill={BOARD} fillOpacity={0.25} stroke={BOARD} />
      <path d={`M${x + R} ${y} H${W - 8} V${H - 16} H${x} V${y + R} A${R} ${R} 0 0 1 ${x + R} ${y} Z`} fill={TOOL} fillOpacity={0.3} />
      {ok && <path d={`M${x} ${y + R} V${y + tp} A${tp} ${tp} 0 0 1 ${x + tp} ${y} H${x + R} A${R} ${R} 0 0 0 ${x} ${y + R} Z`} fill={HI} fillOpacity={0.8} />}
      <path d={`M${W - 8} ${y} H${x} V${H - 16}`} fill="none" stroke={LINE} strokeDasharray="3 2" />
      <text x={W - 12} y={y + R + 4} textAnchor="end" {...txt}>R{fmt(r0)} left</text>
      <text x={W - 12} y={y + R + 15} textAnchor="end" {...txt}>by step before</text>
      {ok && <text x={x + 4} y={y - 6} {...hiTxt}>squared to R{fmt(t)}</text>}
      <text x={W / 2} y={H - 4} textAnchor="middle" {...txt}>{ok ? 'AMBER = WHAT THIS STEP CUTS' : radius == null ? 'NO STEP BEFORE TO CLEAN' : 'TOOL TOO BIG TO CLEAN IT'}</text>
    </Frame>
  )
}

// ---- Offsets: plan of the door, step path vs the line ----
export function OffsetsDiagram({ top, bottom, left, right }: { top: number | null; bottom: number | null; left: number | null; right: number | null }) {
  const x0 = 46, y0 = 28, x1 = 122, y1 = 70
  const px = (v: number | null) => Math.max(-16, Math.min(14, (v ?? 0) * 1.2))
  const sx0 = x0 + px(left), sx1 = x1 - px(right), sy0 = y0 + px(top), sy1 = y1 - px(bottom)
  const all0 = !top && !bottom && !left && !right
  const v = (n: number | null) => fmt(n ?? 0)
  return (
    <Frame label="Step offsets from the line">
      <rect x={22} y={6} width={124} height={86} fill={BOARD} fillOpacity={0.25} stroke={BOARD} />
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke={LINE} strokeDasharray="3 2" />
      <rect x={sx0} y={sy0} width={Math.max(1, sx1 - sx0)} height={Math.max(1, sy1 - sy0)} fill={TOOL} fillOpacity={0.15} stroke={TOOL} strokeWidth={1.6} />
      <text x={(x0 + x1) / 2} y={y0 - 3 - Math.max(0, -px(top))} textAnchor="middle" {...hiTxt}>{v(top)}</text>
      <text x={(x0 + x1) / 2} y={y1 + 10 + Math.max(0, -px(bottom))} textAnchor="middle" {...hiTxt}>{v(bottom)}</text>
      <text x={x0 - 3 - Math.max(0, -px(left))} y={(y0 + y1) / 2 + 3} textAnchor="end" {...hiTxt}>{v(left)}</text>
      <text x={x1 + 3 + Math.max(0, -px(right))} y={(y0 + y1) / 2 + 3} {...hiTxt}>{v(right)}</text>
      <text x={W / 2} y={H - 6} textAnchor="middle" {...txt}>{all0 ? 'ALL 0 = ON THE LINE' : '+ MOVES IN · − MOVES OUT'}</text>
    </Frame>
  )
}

// ---- Width (groove): section across the slot ----
export function WidthDiagram({ width, diameter }: { width: number | null; diameter: number }) {
  const w = width != null && width > 0 ? width : diameter
  const k = Math.min(5, 90 / Math.max(w, diameter, 1))
  const top = 46, bot = 82, cx = W / 2
  const sw = w * k, tw = diameter * k
  return (
    <Frame label={`Slot ${w}mm wide`}>
      <rect x={10} y={top} width={W - 20} height={bot - top} fill={BOARD} fillOpacity={0.35} stroke={BOARD} />
      <rect x={cx - sw / 2} y={top - 1} width={sw} height={18} fill={BG} stroke={TOOL} />
      <rect x={cx - sw / 2} y={8} width={tw} height={top + 17 - 8} fill={TOOL} fillOpacity={0.25} stroke={TOOL} strokeWidth={1.4} />
      <line x1={cx - sw / 2} y1={top + 26} x2={cx + sw / 2} y2={top + 26} stroke={HI} strokeWidth={1.5} />
      <text x={cx} y={top + 36} textAnchor="middle" {...hiTxt}>{fmt(w)}</text>
      <text x={W / 2} y={H - 4} textAnchor="middle" {...txt}>{width == null ? 'BLANK = TOOL WIDTH' : `SLOT ${fmt(w)} · TOOL Ø${fmt(diameter)}`}</text>
    </Frame>
  )
}

// ---- Raster angle + stepover: plan of the lanes ----
export function RasterDiagram({ angle, stepover }: { angle: number | null; stepover: number | null }) {
  const id = useId().replace(/:/g, '')
  const x0 = 14, y0 = 10, x1 = 154, y1 = 88, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const pct = stepover != null && stepover > 0 ? stepover : 70
  const tw = 20, step = Math.max(4, tw * pct / 100)
  const lanes: number[] = []
  for (let y = cy - 90; y < cy + 90; y += step) lanes.push(y)
  return (
    <Frame label={`Raster ${angle ?? 0} degrees, stepover ${pct}%`}>
      <defs><clipPath id={`r${id}`}><rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} /></clipPath></defs>
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke={LINE} strokeDasharray="3 2" />
      <g clipPath={`url(#r${id})`}>
        <g transform={`rotate(${-(angle ?? 0)} ${cx} ${cy})`}>
          {lanes.map(y => <rect key={y} x={cx - 110} y={y - tw / 2} width={220} height={tw} fill={TOOL} fillOpacity={0.13} />)}
          {lanes.map(y => <line key={`l${y}`} x1={cx - 110} y1={y} x2={cx + 110} y2={y} stroke={TOOL} strokeWidth={0.8} />)}
          <line x1={cx + 30} y1={lanes[10] ?? cy} x2={cx + 30} y2={(lanes[10] ?? cy) + step} stroke={HI} strokeWidth={1.6} />
        </g>
      </g>
      <text x={W / 2} y={H - 8} textAnchor="middle" {...txt}>
        {`${fmt(angle ?? 0)}° · STEP ${fmt(pct)}% OF Ø${stepover == null ? ' (DEFAULT)' : ''}`}
      </text>
    </Frame>
  )
}

// ---- Feed / spindle override: tool's own vs this step ----
export function FeedOverrideDiagram({ feed, toolFeed, rpm, toolRpm }: { feed: number | null; toolFeed: number | null; rpm: number | null; toolRpm: number | null }) {
  const rows = [
    { name: 'FEED', tool: toolFeed, step: feed, y: 20 },
    { name: 'RPM', tool: toolRpm, step: rpm, y: 60 },
  ]
  const bx = 44, bw = 110
  return (
    <Frame label="Feed and spindle override">
      {rows.map(r => {
        const used = r.step ?? r.tool
        const max = Math.max(r.tool ?? 0, r.step ?? 0, 1)
        return (
          <g key={r.name}>
            <text x={8} y={r.y + 8} {...txt}>{r.name}</text>
            <rect x={bx} y={r.y} width={bw * (r.tool ?? 0) / max} height={9} fill={LINE} fillOpacity={0.35} />
            <text x={bx + 2} y={r.y + 8} fill="#e2e8f0" fontSize={8} fontFamily="monospace">tool {r.tool ?? '—'}</text>
            <rect x={bx} y={r.y + 13} width={bw * (used ?? 0) / max} height={9} fill={r.step != null ? HI : TOOL} fillOpacity={0.55} />
            <text x={bx + 2} y={r.y + 21} fill={r.step != null ? "#0f172a" : "#e2e8f0"} fontSize={8} fontFamily="monospace">step {used ?? '—'}</text>
          </g>
        )
      })}
      <text x={W / 2} y={H - 8} textAnchor="middle" {...txt}>{feed == null && rpm == null ? "BLANK = TOOL'S OWN" : 'AMBER = OVERRIDDEN'}</text>
    </Frame>
  )
}
