'use client'

// ============================================================
// Small explanatory diagrams for the Cabinet Vision tool fields
// (z_cnc_tools T1): spin direction, through-cut break-through,
// drill tip / depth to shoulder, H length-offset register and
// auto-select tolerance. Each one is live — it redraws from the
// field values — and sits in a FieldCard beside its control.
// Palette matches ToolProfilePreview (dark panel, blue tool).
// ============================================================

import type { ReactNode } from 'react'

const W = 168, H = 112
const BG = '#0f172a', TOOL = '#60a5fa', LINE = '#94a3b8', HI = '#fbbf24', BOARD = '#a16207', SPOIL = '#334155'
const txt = { fill: LINE, fontSize: 9, fontFamily: 'monospace' } as const

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="shrink-0">
      <rect width={W} height={H} rx={6} fill={BG} />
      {children}
    </svg>
  )
}

// Card: title + control + diagram + one-line help.
export function FieldCard({ title, control, diagram, help }: { title: string; control: ReactNode; diagram: ReactNode; help: ReactNode }) {
  return (
    <div className="border border-edge rounded-lg p-3 flex gap-3 bg-surface-2/40">
      <div className="flex-1 min-w-0 space-y-2">
        <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider">{title}</p>
        {control}
        <p className="text-[10px] text-ink-subtle leading-snug">{help}</p>
      </div>
      {diagram}
    </div>
  )
}

// 1. Spin direction, looking down on the tool from the spindle.
export function RotationDiagram({ dir }: { dir: 'clockwise' | 'anticlockwise' | string }) {
  const cw = dir !== 'anticlockwise'
  const cx = 84, cy = 52, r = 22, ar = 34
  // Arrow arc over ~250°, arrowhead at the leading end.
  const a0 = cw ? -200 : 20, a1 = cw ? 20 : -200
  const pt = (a: number, rr = ar) => ({ x: cx + rr * Math.cos(a * Math.PI / 180), y: cy + rr * Math.sin(a * Math.PI / 180) })
  const s = pt(a0), e = pt(a1)
  const tip = pt(a1), back = pt(a1 + (cw ? -14 : 14))
  const n = { x: (tip.x - cx) / ar, y: (tip.y - cy) / ar }
  return (
    <Frame label={`Spins ${cw ? 'clockwise' : 'anticlockwise'}`}>
      <circle cx={cx} cy={cy} r={r} fill={TOOL} fillOpacity={0.14} stroke={TOOL} strokeWidth={1.5} />
      {/* two flutes */}
      <path d={`M${cx} ${cy} q ${cw ? 10 : -10} -8 0 -${r}`} stroke={TOOL} fill="none" strokeWidth={1.2} />
      <path d={`M${cx} ${cy} q ${cw ? -10 : 10} 8 0 ${r}`} stroke={TOOL} fill="none" strokeWidth={1.2} />
      <path d={`M${s.x} ${s.y} A ${ar} ${ar} 0 1 ${cw ? 1 : 0} ${e.x} ${e.y}`} stroke={HI} strokeWidth={2} fill="none" />
      <path d={`M${tip.x} ${tip.y} L${back.x + n.x * 6} ${back.y + n.y * 6} L${back.x - n.x * 6} ${back.y - n.y * 6} Z`} fill={HI} />
      <text x={cx} y={H - 8} textAnchor="middle" {...txt}>{cw ? 'CLOCKWISE' : 'ANTICLOCKWISE'} · from above</text>
    </Frame>
  )
}

// 2. Through cut: how far the tool goes past the bottom of the board.
export function ThroughDiagram({ adj, fromMachine, kind = 'router' }: { adj: number; fromMachine: boolean; kind?: 'router' | 'drill' }) {
  const x0 = 20, x1 = 148, top = 30, bot = 66, spoilBot = 92
  const over = Math.min(14, 4 + adj * 12)          // exaggerated so 0.2mm is visible
  const tw = kind === 'drill' ? 10 : 16, tx = 84 - tw / 2
  return (
    <Frame label={`Through depth ${adj}mm past the board`}>
      <rect x={x0} y={top} width={x1 - x0} height={bot - top} fill={BOARD} fillOpacity={0.35} stroke={BOARD} />
      <rect x={x0} y={bot} width={x1 - x0} height={spoilBot - bot} fill={SPOIL} fillOpacity={0.6} />
      <text x={x0 + 3} y={top + 11} {...txt}>board</text>
      <text x={x0 + 3} y={spoilBot - 5} {...txt}>spoilboard</text>
      <rect x={tx} y={8} width={tw} height={bot + over - 8} fill={TOOL} fillOpacity={0.25} stroke={TOOL} strokeWidth={1.4} />
      {kind === 'drill' && <path d={`M${tx} ${bot + over} L${84} ${bot + over + 5} L${tx + tw} ${bot + over}`} fill={TOOL} fillOpacity={0.25} stroke={TOOL} />}
      <line x1={tx + tw + 4} y1={bot} x2={x1 - 6} y2={bot} stroke={HI} strokeDasharray="2 2" />
      <line x1={tx + tw + 4} y1={bot + over} x2={x1 - 6} y2={bot + over} stroke={HI} strokeDasharray="2 2" />
      <line x1={x1 - 14} y1={bot} x2={x1 - 14} y2={bot + over} stroke={HI} strokeWidth={1.5} />
      <text x={x1 - 18} y={bot + over / 2 + 3} textAnchor="end" fill={HI} fontSize={9} fontFamily="monospace">{adj}</text>
      <text x={84} y={H - 6} textAnchor="middle" {...txt}>{fromMachine ? 'machine default' : 'this tool'}</text>
    </Frame>
  )
}

// 3. Drill tip: blind depth measured to the tip, or to the shoulder (full Ø).
export function TipDiagram({ diameter, pointAngle, toShoulder }: { diameter: number; pointAngle: number | null; toShoulder: boolean }) {
  const pa = pointAngle && pointAngle > 0 && pointAngle < 180 ? pointAngle : 180
  const realTip = pa >= 180 ? 0 : (diameter / 2) / Math.tan((pa / 2) * Math.PI / 180)
  const s = 40 / Math.max(diameter, 1)                // px per mm (Ø scaled to 40px)
  const tipPx = Math.min(30, realTip * s)
  const cx = 70, top = 22, w = Math.max(diameter * s, 8)
  const depthPx = 44                                   // the typed depth
  const shoulderY = toShoulder ? top + depthPx : top + depthPx - tipPx
  const tipY = shoulderY + tipPx
  return (
    <Frame label="Drill depth to tip or to shoulder">
      <rect x={12} y={top} width={W - 24} height={H - top - 12} fill={BOARD} fillOpacity={0.3} stroke={BOARD} />
      {/* drill */}
      <path d={`M${cx - w / 2} 6 L${cx - w / 2} ${shoulderY} L${cx} ${tipY} L${cx + w / 2} ${shoulderY} L${cx + w / 2} 6 Z`}
        fill={TOOL} fillOpacity={0.25} stroke={TOOL} strokeWidth={1.4} />
      {/* typed depth dimension */}
      <line x1={cx + w / 2 + 6} y1={top} x2={cx + w / 2 + 6} y2={top + depthPx} stroke={HI} strokeWidth={1.5} />
      <line x1={cx + w / 2 + 2} y1={top + depthPx} x2={cx + w / 2 + 10} y2={top + depthPx} stroke={HI} />
      <text x={cx + w / 2 + 12} y={top + depthPx / 2 + 3} fill={HI} fontSize={9} fontFamily="monospace">depth</text>
      <text x={cx + w / 2 + 12} y={top + depthPx + 3} fill={HI} fontSize={8} fontFamily="monospace">{toShoulder ? 'to shoulder' : 'to tip'}</text>
      {toShoulder && realTip > 0 && (
        <text x={cx + w / 2 + 12} y={tipY + 10} fill={LINE} fontSize={8} fontFamily="monospace">+{(Math.round(realTip * 100) / 100)} tip</text>
      )}
      <text x={16} y={H - 16} {...txt}>{pa >= 180 ? 'flat bit' : `${pa}° point`}</text>
    </Frame>
  )
}

// 4. H register: the length offset the controller looks up for this tool.
export function HRegisterDiagram({ toolNumber, delta, emitted }: { toolNumber: number | null; delta: number; emitted: boolean }) {
  const h = toolNumber != null ? toolNumber + delta : null
  return (
    <Frame label={`Length offset H${h ?? '?'}`}>
      {/* spindle nose + holder + tool */}
      <rect x={52} y={6} width={44} height={14} fill={SPOIL} stroke={LINE} />
      <path d="M58 20 L90 20 L84 40 L64 40 Z" fill={LINE} fillOpacity={0.15} stroke={LINE} />
      <rect x={68} y={40} width={12} height={46} fill={TOOL} fillOpacity={0.25} stroke={TOOL} strokeWidth={1.4} />
      <line x1={110} y1={20} x2={110} y2={86} stroke={HI} strokeWidth={1.5} />
      <line x1={104} y1={20} x2={116} y2={20} stroke={HI} />
      <line x1={104} y1={86} x2={116} y2={86} stroke={HI} />
      <text x={120} y={56} fill={HI} fontSize={10} fontFamily="monospace">H{h ?? '?'}</text>
      <text x={84} y={H - 8} textAnchor="middle" {...txt}>
        {emitted ? `T${toolNumber ?? '?'} → G43 H${h ?? '?'}` : 'G43 not output'}
      </text>
    </Frame>
  )
}

// 5. Auto-select: which hole sizes this bit may be picked for.
export function AutoSelectDiagram({ diameter, tolerance, on, kind = 'drill' }: { diameter: number; tolerance: number; on: boolean; kind?: 'drill' | 'router' }) {
  const x0 = 16, x1 = 152, mid = 84, y = 52
  const span = Math.max(1.5, tolerance * 2.5)        // mm shown each side
  const px = (mm: number) => mid + (mm - diameter) * ((x1 - x0) / 2) / span
  const lo = Math.max(0, diameter - tolerance), hi = diameter + tolerance
  return (
    <Frame label="Auto-select range">
      <line x1={x0} y1={y} x2={x1} y2={y} stroke={LINE} />
      {on && kind === 'drill' && <rect x={px(lo)} y={y - 8} width={Math.max(2, px(hi) - px(lo))} height={16} fill={HI} fillOpacity={0.3} stroke={HI} />}
      <circle cx={mid} cy={y} r={4} fill={on ? TOOL : SPOIL} stroke={TOOL} />
      <text x={mid} y={y - 14} textAnchor="middle" fill={TOOL} fontSize={9} fontFamily="monospace">⌀{diameter}</text>
      {on && kind === 'drill' && <>
        <text x={px(lo)} y={y + 22} textAnchor="middle" {...txt}>{Math.round(lo * 100) / 100}</text>
        <text x={px(hi)} y={y + 22} textAnchor="middle" {...txt}>{Math.round(hi * 100) / 100}</text>
      </>}
      <text x={mid} y={H - 8} textAnchor="middle" {...txt}>
        {!on ? 'only when named' : kind === 'drill' ? 'holes in band → this bit' : 'may pocket holes'}
      </text>
    </Frame>
  )
}
