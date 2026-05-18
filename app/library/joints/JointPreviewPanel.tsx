'use client'

import { useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { JointOp3D } from './Joint3DView'

export type { JointOp3D }

const Joint3DView = dynamic(() => import('./Joint3DView'), { ssr: false })

// Scene constants (mm) — must match Joint3DView
const A_LEN = 120  // Part A extends left from joint
const B_HGT = 90   // Part B extends upward from joint
const PAD   = 18   // padding around the scene

type PView = 'section' | '3d'

// ── SVG cross-section view ────────────────────────────────────────────────────

function JointSectionSVG({ ops, thickness: t }: { ops: JointOp3D[]; thickness: number }) {
  const wxMin = -(A_LEN + PAD)
  const wxMax = t + PAD
  const wyMin = -(t + PAD)
  const wyMax = B_HGT + PAD

  const W = wxMax - wxMin
  const H = wyMax - wyMin

  const sx = (x: number) => x - wxMin
  const sy = (y: number) => wyMax - y

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      style={{ background: '#0f172a', display: 'block' }}>

      {/* Part A — horizontal shelf */}
      <rect x={sx(-A_LEN)} y={sy(0)} width={A_LEN} height={t}
        fill="#374151" stroke="#6b7280" strokeWidth={0.8} />
      <text x={sx(-A_LEN / 2)} y={sy(-t / 2)}
        textAnchor="middle" dominantBaseline="middle"
        fill="#9ca3af" fontSize={7}>Part A</text>

      {/* Part B — vertical side (extends from -t to B_HGT) */}
      <rect x={sx(0)} y={sy(B_HGT)} width={t} height={B_HGT + t}
        fill="#1e3a5f" stroke="#3b82f6" strokeWidth={0.8} />
      <text
        x={sx(t / 2)} y={sy(B_HGT / 2 - t / 2)}
        textAnchor="middle" dominantBaseline="middle"
        fill="#93c5fd" fontSize={7}
        transform={`rotate(-90, ${sx(t / 2)}, ${sy(B_HGT / 2 - t / 2)})`}
      >Part B</text>

      {/* Joint reference crosshair */}
      <line x1={sx(0) - 5} y1={sy(0)} x2={sx(0) + 5} y2={sy(0)}
        stroke="#4b5563" strokeWidth={0.6} />
      <line x1={sx(0)} y1={sy(0) - 5} x2={sx(0)} y2={sy(0) + 5}
        stroke="#4b5563" strokeWidth={0.6} />

      {/* Operations */}
      {ops.map((op, i) => {
        const r     = Math.max(2, op.tool_diameter_mm / 2)
        const depth = Math.max(3, op.depth_mm)

        if (op.target_part === 'part_a') {
          // Entry face at X=0. offset_x sets the marker back into Part A (moves left in section).
          // offset_y positions within panel thickness from centre.
          const cx = sx(-op.offset_x_mm)
          const cy = sy(-t / 2 + op.offset_y_mm)
          const zNote = op.offset_z_mm !== 0 ? ` z${op.offset_z_mm > 0 ? '+' : ''}${op.offset_z_mm}` : ''
          return (
            <g key={i}>
              {/* Depth shown as cylinder going further left */}
              <rect x={cx - depth} y={cy - r} width={depth} height={r * 2}
                fill="#f59e0b" fillOpacity={0.18}
                stroke="#f59e0b" strokeWidth={0.5} strokeDasharray="2 1.5" />
              <circle cx={cx} cy={cy} r={r}
                fill="#f59e0b" fillOpacity={0.45} stroke="#f59e0b" strokeWidth={1} />
              <text x={cx - depth - 4} y={cy}
                textAnchor="end" dominantBaseline="middle" fill="#fbbf24" fontSize={6.5}>
                {op.machine_operation} Ø{op.tool_diameter_mm}{zNote}
              </text>
            </g>
          )
        } else {
          // Entry face at X=0. offset_x sets the marker into Part B (moves right in section).
          // offset_y positions height from joint line.
          const cx = sx(op.offset_x_mm)
          const cy = sy(op.offset_y_mm)
          const zNote = op.offset_z_mm !== 0 ? ` z${op.offset_z_mm > 0 ? '+' : ''}${op.offset_z_mm}` : ''
          return (
            <g key={i}>
              {/* Depth shown as cylinder going further right */}
              <rect x={cx} y={cy - r} width={depth} height={r * 2}
                fill="#60a5fa" fillOpacity={0.18}
                stroke="#60a5fa" strokeWidth={0.5} strokeDasharray="2 1.5" />
              <circle cx={cx} cy={cy} r={r}
                fill="#60a5fa" fillOpacity={0.45} stroke="#60a5fa" strokeWidth={1} />
              <text x={cx + depth + 4} y={cy}
                dominantBaseline="middle" fill="#93c5fd" fontSize={6.5}>
                {op.machine_operation} Ø{op.tool_diameter_mm}{zNote}
              </text>
            </g>
          )
        }
      })}
    </svg>
  )
}

// ── Preview panel ─────────────────────────────────────────────────────────────

export default function JointPreviewPanel({ ops, defaultThickness = 18 }: {
  ops:               JointOp3D[]
  defaultThickness?: number
}) {
  const [panelW, setPanelW] = useState(360)
  const [view,   setView]   = useState<PView>('section')
  const [thick,  setThick]  = useState(defaultThickness)
  const [wire,   setWire]   = useState(false)
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null)

  function onResizeDown(e: React.PointerEvent<HTMLDivElement>) {
    resizeRef.current = { startX: e.clientX, startW: panelW }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return
    const diff = resizeRef.current.startX - e.clientX
    setPanelW(Math.max(280, Math.min(640, resizeRef.current.startW + diff)))
  }
  function onResizeUp() { resizeRef.current = null }

  const tabCls = (active: boolean) =>
    `px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
      active
        ? 'border-blue-500 text-blue-300'
        : 'border-transparent text-gray-500 hover:text-gray-300'
    }`

  return (
    <div style={{ width: panelW }}
      className="flex-none border-l border-gray-800 flex flex-col bg-gray-900/30 relative">

      {/* Drag-to-resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/60 active:bg-blue-500 transition-colors z-10"
        style={{ touchAction: 'none' }}
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
      />

      {/* Tab bar + controls */}
      <div className="flex-none border-b border-gray-800 px-4 pt-1 flex items-center gap-3">
        <div className="flex gap-0.5 flex-1">
          <button className={tabCls(view === 'section')} onClick={() => setView('section')}>Section</button>
          <button className={tabCls(view === '3d')}     onClick={() => setView('3d')}>3D</button>
        </div>

        {/* Wire toggle — only relevant in 3D view */}
        {view === '3d' && (
          <button
            onClick={() => setWire(w => !w)}
            className={`pb-1.5 text-[10px] px-2 py-0.5 rounded transition-colors border ${
              wire
                ? 'bg-blue-600/20 border-blue-600 text-blue-300'
                : 'bg-transparent border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500'
            }`}
          >
            Wire
          </button>
        )}

        <div className="flex items-center gap-1.5 pb-1.5">
          <span className="text-[10px] text-gray-600">t =</span>
          <input
            type="number" value={thick} min={6} max={36} step={1}
            onChange={e => setThick(Math.max(6, Math.min(36, Number(e.target.value))))}
            className="w-11 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-white text-right focus:outline-none focus:border-blue-500 font-mono"
          />
          <span className="text-[10px] text-gray-600">mm</span>
        </div>
      </div>

      {/* View area */}
      <div className="flex-1 overflow-hidden p-3">
        <div className="w-full h-full rounded-lg overflow-hidden">
          {view === 'section'
            ? <JointSectionSVG ops={ops} thickness={thick} />
            : <Joint3DView     ops={ops} thickness={thick} wire={wire} />
          }
        </div>
      </div>

      {/* Legend */}
      <div className="flex-none px-4 py-2 border-t border-gray-800 flex gap-3 flex-wrap">
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#374151] border border-gray-600 shrink-0" />
          Part A (Master)
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#1e3a5f] border border-blue-800 shrink-0" />
          Part B (Slave)
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shrink-0" />
          Master ops
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-2.5 h-2.5 rounded-full bg-[#60a5fa] shrink-0" />
          Slave ops
        </span>
      </div>
    </div>
  )
}
