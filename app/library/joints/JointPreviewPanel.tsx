'use client'

import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { JointOp3D } from './Joint3DView'

export type { JointOp3D }

export interface JointOpForPreview extends JointOp3D {
  expressions?: Record<string, string>
}

const Joint3DView = dynamic(() => import('./Joint3DView'), { ssr: false })

// Scene constants (mm) — must match Joint3DView
const PAD = 18   // padding around the scene

// ── Expression evaluator ──────────────────────────────────────────────────────
// Variables: W/L/D = target part dims, T = thickness, MW/ML/MD/SW/SL/SD = both parts.
// Math globals (floor, ceil, round, abs, min, max, PI) are available via the JS global scope.

function evalExpr(expr: string, vars: Record<string, number>): number | null {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...Object.keys(vars), `'use strict'; return +(${expr})`)
    const result = fn(...Object.values(vars))
    return Number.isFinite(result) ? result : null
  } catch {
    return null
  }
}

function buildVars(
  targetPart: 'part_a' | 'part_b',
  thick: number,
  masterW: number, masterL: number, masterD: number,
  slaveW:  number, slaveL:  number, slaveD:  number,
): Record<string, number> {
  const isA = targetPart === 'part_a'
  return {
    W: isA ? masterW : slaveW,
    L: isA ? masterL : slaveL,
    D: isA ? masterD : slaveD,
    T: thick,
    MW: masterW, ML: masterL, MD: masterD,
    SW: slaveW,  SL: slaveL,  SD: slaveD,
  }
}

// ── NumField — select-all-on-entry, commit-on-blur/Enter ──────────────────────

function NumField({ value, onChange, min, max, className }: {
  value:     number
  onChange:  (n: number) => void
  min:       number
  max:       number
  className?: string
}) {
  const [draft,   setDraft]   = useState(String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(String(value))
  }, [value, focused])

  function commit(raw: string) {
    const n = parseFloat(raw)
    if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)))
    else setDraft(String(value))
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      className={className}
      onChange={e => setDraft(e.target.value)}
      onFocus={e => { setFocused(true); e.target.select() }}
      onBlur={e  => { setFocused(false); commit(e.target.value) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
}

// ── SVG cross-section view ────────────────────────────────────────────────────

function JointSectionSVG({ ops, thickness: t, masterW, masterDx, slaveL, slaveDy, selOpId = null }: {
  ops: JointOp3D[]; thickness: number
  masterW: number; masterDx: number
  slaveL:  number; slaveDy:  number
  selOpId?: string | null
}) {
  // Part A: X from -(masterW - masterDx) to +masterDx, Y from 0 to -t
  // Part B: X from 0 to +t, Y from -slaveDy to (slaveL - slaveDy)
  const masterLeft = masterW - masterDx
  const slaveUp    = slaveL - slaveDy

  const wxMin = -(masterLeft + PAD)
  const wxMax = Math.max(masterDx, t) + PAD
  const wyMin = -(t + slaveDy + PAD)
  const wyMax = slaveUp + PAD

  const W = wxMax - wxMin
  const H = wyMax - wyMin

  const sx = (x: number) => x - wxMin
  const sy = (y: number) => wyMax - y

  // label centres
  const aLabelX = masterDx - masterW / 2
  const aLabelY = -t / 2
  const bLabelX = t / 2
  const bLabelY = (slaveUp - slaveDy) / 2   // = slaveL/2 - slaveDy

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      style={{ background: '#0f172a', display: 'block' }}>

      {/* Part A — horizontal shelf */}
      <rect x={sx(-masterLeft)} y={sy(0)} width={masterW} height={t}
        fill="#374151" stroke="#6b7280" strokeWidth={0.8} />
      <text x={sx(aLabelX)} y={sy(aLabelY)}
        textAnchor="middle" dominantBaseline="middle"
        fill="#9ca3af" fontSize={7}>Master</text>

      {/* Part B — vertical side */}
      <rect x={sx(0)} y={sy(slaveUp)} width={t} height={slaveL}
        fill="#1e3a5f" stroke="#3b82f6" strokeWidth={0.8} />
      <text
        x={sx(bLabelX)} y={sy(bLabelY)}
        textAnchor="middle" dominantBaseline="middle"
        fill="#93c5fd" fontSize={7}
        transform={`rotate(-90, ${sx(bLabelX)}, ${sy(bLabelY)})`}
      >Slave</text>

      {/* Joint reference crosshair */}
      <line x1={sx(0) - 5} y1={sy(0)} x2={sx(0) + 5} y2={sy(0)}
        stroke="#4b5563" strokeWidth={0.6} />
      <line x1={sx(0)} y1={sy(0) - 5} x2={sx(0)} y2={sy(0) + 5}
        stroke="#4b5563" strokeWidth={0.6} />

      {/* Operations */}
      {ops.map((op, i) => {
        const sel   = op.id === selOpId
        const r     = Math.max(2, op.tool_diameter_mm / 2)
        const depth = Math.max(3, op.depth_mm)

        if (op.target_part === 'part_a') {
          const cx = sx(-op.offset_x_mm)
          const cy = sy(-t / 2 + op.offset_y_mm)
          const zNote = op.offset_z_mm !== 0 ? ` z${op.offset_z_mm > 0 ? '+' : ''}${op.offset_z_mm}` : ''
          return (
            <g key={i}>
              <rect x={cx - depth} y={cy - r} width={depth} height={r * 2}
                fill="#f59e0b" fillOpacity={sel ? 0.35 : 0.18}
                stroke="#f59e0b" strokeWidth={sel ? 1 : 0.5} strokeDasharray="2 1.5" />
              {sel && <circle cx={cx} cy={cy} r={r * 1.9} fill="none" stroke="#fcd34d" strokeWidth={1} opacity={0.6} />}
              <circle cx={cx} cy={cy} r={r}
                fill="#f59e0b" fillOpacity={sel ? 0.85 : 0.45}
                stroke={sel ? '#fcd34d' : '#f59e0b'} strokeWidth={sel ? 1.5 : 1} />
              <text x={cx - depth - 4} y={cy}
                textAnchor="end" dominantBaseline="middle"
                fill={sel ? '#fcd34d' : '#fbbf24'} fontSize={sel ? 7.5 : 6.5} fontWeight={sel ? 'bold' : 'normal'}>
                {op.machine_operation} Ø{op.tool_diameter_mm}{zNote}
              </text>
            </g>
          )
        } else {
          const cx = sx(op.offset_x_mm)
          const cy = sy(op.offset_y_mm)
          const zNote = op.offset_z_mm !== 0 ? ` z${op.offset_z_mm > 0 ? '+' : ''}${op.offset_z_mm}` : ''
          return (
            <g key={i}>
              <rect x={cx} y={cy - r} width={depth} height={r * 2}
                fill="#60a5fa" fillOpacity={sel ? 0.35 : 0.18}
                stroke="#60a5fa" strokeWidth={sel ? 1 : 0.5} strokeDasharray="2 1.5" />
              {sel && <circle cx={cx} cy={cy} r={r * 1.9} fill="none" stroke="#93c5fd" strokeWidth={1} opacity={0.6} />}
              <circle cx={cx} cy={cy} r={r}
                fill="#60a5fa" fillOpacity={sel ? 0.85 : 0.45}
                stroke={sel ? '#93c5fd' : '#60a5fa'} strokeWidth={sel ? 1.5 : 1} />
              <text x={cx + depth + 4} y={cy}
                dominantBaseline="middle"
                fill={sel ? '#93c5fd' : '#93c5fd'} fontSize={sel ? 7.5 : 6.5} fontWeight={sel ? 'bold' : 'normal'}>
                {op.machine_operation} Ø{op.tool_diameter_mm}{zNote}
              </text>
            </g>
          )
        }
      })}
    </svg>
  )
}

// ── Face view SVG — shows each part face-on (looking along Z/depth axis) ─────

function JointFaceViewSVG({ ops, thickness: t, masterW, masterDx, masterL, slaveL, slaveDy, selOpId = null }: {
  ops:      JointOp3D[]; thickness: number
  masterW:  number; masterDx: number; masterL: number
  slaveL:   number; slaveDy:  number
  selOpId?: string | null
}) {
  const pad = 14

  // Part A face: width=masterW, height=masterL (looking along Z into the shelf face)
  // Part B face: width=t, height=slaveL (looking along Z into the side panel face)
  // Lay them out side by side with a gap
  const gap   = 24
  const aW    = masterW
  const aH    = masterL
  const bW    = t
  const bH    = slaveL

  const totalW = pad + aW + gap + bW + pad
  const totalH = pad + Math.max(aH, bH) + pad

  // Part A origin (top-left corner in SVG space)
  const aX = pad
  const aY = pad + (Math.max(aH, bH) - aH) / 2   // vertically centred

  // Part B origin
  const bX = pad + aW + gap
  const bY = pad + (Math.max(aH, bH) - bH) / 2

  return (
    <svg viewBox={`0 0 ${totalW} ${totalH}`} width="100%" height="100%"
      style={{ background: '#0f172a', display: 'block' }}>

      {/* Part A — Master face */}
      <rect x={aX} y={aY} width={aW} height={aH} fill="#374151" stroke="#6b7280" strokeWidth={0.8} />
      <text x={aX + aW / 2} y={aY - 5} textAnchor="middle" fill="#9ca3af" fontSize={6}>Master (face)</text>
      {/* joint reference edge line */}
      <line x1={aX + aW - masterDx} y1={aY} x2={aX + aW - masterDx} y2={aY + aH}
        stroke="#4b5563" strokeWidth={0.5} strokeDasharray="2 2" />

      {/* Part B — Slave face */}
      <rect x={bX} y={bY} width={bW} height={bH} fill="#1e3a5f" stroke="#3b82f6" strokeWidth={0.8} />
      <text x={bX + bW / 2} y={bY - 5} textAnchor="middle" fill="#93c5fd" fontSize={6}>Slave (face)</text>
      {/* joint reference edge line */}
      <line x1={bX} y1={bY + slaveDy} x2={bX + bW} y2={bY + slaveDy}
        stroke="#4b5563" strokeWidth={0.5} strokeDasharray="2 2" />

      {/* Operations */}
      {ops.map((op, i) => {
        const sel = op.id === selOpId
        const r   = Math.max(2, op.tool_diameter_mm / 2)

        if (op.target_part === 'part_a') {
          // X from right edge (masterDx=0 means rightmost), Y from top
          const cx = aX + aW - masterDx - op.offset_x_mm
          const cy = aY + op.offset_y_mm
          const colFill   = sel ? '#fcd34d' : '#f59e0b'
          const colStroke = sel ? '#fcd34d' : '#f59e0b'
          return (
            <g key={i}>
              {sel && <circle cx={cx} cy={cy} r={r * 1.9} fill="none" stroke={colStroke} strokeWidth={1} opacity={0.6} />}
              <circle cx={cx} cy={cy} r={r}
                fill={colFill} fillOpacity={sel ? 0.85 : 0.45}
                stroke={colStroke} strokeWidth={sel ? 1.5 : 1} />
              <text x={cx} y={cy - r - 2} textAnchor="middle"
                fill={colFill} fontSize={5} fontWeight={sel ? 'bold' : 'normal'}>
                Ø{op.tool_diameter_mm}
              </text>
            </g>
          )
        } else {
          // X from left edge of slave, Y from bottom of slave joint reference
          const cx = bX + op.offset_x_mm
          const cy = bY + slaveDy - op.offset_y_mm
          const colFill   = sel ? '#93c5fd' : '#60a5fa'
          const colStroke = sel ? '#93c5fd' : '#60a5fa'
          return (
            <g key={i}>
              {sel && <circle cx={cx} cy={cy} r={r * 1.9} fill="none" stroke={colStroke} strokeWidth={1} opacity={0.6} />}
              <circle cx={cx} cy={cy} r={r}
                fill={colFill} fillOpacity={sel ? 0.85 : 0.45}
                stroke={colStroke} strokeWidth={sel ? 1.5 : 1} />
              <text x={cx} y={cy - r - 2} textAnchor="middle"
                fill={colFill} fontSize={5} fontWeight={sel ? 'bold' : 'normal'}>
                Ø{op.tool_diameter_mm}
              </text>
            </g>
          )
        }
      })}
    </svg>
  )
}

// ── Preview panel ─────────────────────────────────────────────────────────────

export default function JointPreviewPanel({ ops, defaultThickness = 18, selOpId = null }: {
  ops:               JointOpForPreview[]
  defaultThickness?: number
  selOpId?:          string | null
}) {
  const [panelW,   setPanelW]   = useState(620)
  const [thick,    setThick]    = useState(defaultThickness)
  const [wire,     setWire]     = useState(true)

  // Master (Part A) dimensions + joint offset
  const [masterW,  setMasterW]  = useState(120)
  const [masterL,  setMasterL]  = useState(250)
  const [masterD,  setMasterD]  = useState(250)
  const [masterDx, setMasterDx] = useState(0)
  const [masterDy, setMasterDy] = useState(0)
  const [masterDz, setMasterDz] = useState(0)

  // Slave (Part B) dimensions + joint offset
  const [slaveW,   setSlaveW]   = useState(120)
  const [slaveL,   setSlaveL]   = useState(250)
  const [slaveD,   setSlaveD]   = useState(250)
  const [slaveDx,  setSlaveDx]  = useState(0)
  const [slaveDy,  setSlaveDy]  = useState(defaultThickness)   // Part B passes through Part A by t
  const [slaveDz,  setSlaveDz]  = useState(0)

  // Joint reference offset (position of joint within the sample pieces)
  const [jointDx,  setJointDx]  = useState(0)
  const [jointDy,  setJointDy]  = useState(0)
  const [jointDz,  setJointDz]  = useState(0)

  // Joint rotation (degrees, applied to the whole assembly in 3D)
  const [jointRx,  setJointRx]  = useState(0)
  const [jointRy,  setJointRy]  = useState(0)
  const [jointRz,  setJointRz]  = useState(0)

  const resizeRef = useRef<{ startX: number; startW: number } | null>(null)

  function onResizeDown(e: React.PointerEvent<HTMLDivElement>) {
    resizeRef.current = { startX: e.clientX, startW: panelW }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return
    const diff = resizeRef.current.startX - e.clientX
    setPanelW(Math.max(280, Math.min(900, resizeRef.current.startW + diff)))
  }
  function onResizeUp() { resizeRef.current = null }

  // Evaluate expressions against current sample dimensions
  const evaledOps: JointOp3D[] = ops.map(op => {
    const exprs = op.expressions
    if (!exprs || !Object.keys(exprs).length) return op
    const vars = buildVars(op.target_part, thick, masterW, masterL, masterD, slaveW, slaveL, slaveD)
    const ev = (field: string, fallback: number) =>
      exprs[field] != null ? (evalExpr(exprs[field], vars) ?? fallback) : fallback
    return {
      ...op,
      tool_diameter_mm: ev('tool_diameter_mm', op.tool_diameter_mm),
      depth_mm:         ev('depth_mm', op.depth_mm),
      offset_x_mm:      ev('offset_x_mm', op.offset_x_mm),
      offset_y_mm:      ev('offset_y_mm', op.offset_y_mm),
      offset_z_mm:      ev('offset_z_mm', op.offset_z_mm),
    }
  })

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

      {/* Part dimensions table */}
      <div className="flex-none border-b border-gray-800 px-3 py-2">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-gray-900/70">
              <th className="border border-gray-700 px-2 py-1 text-left font-semibold text-gray-500 tracking-wider w-14" />
              {['W', 'L', 'D', 'dx', 'dy', 'dz', 'rx°', 'ry°', 'rz°'].map(h => (
                <th key={h} className="border border-gray-700 px-1 py-1 text-center font-semibold text-gray-400 tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {([
              ['Master', masterW, setMasterW, masterL, setMasterL, masterD, setMasterD, masterDx, setMasterDx, masterDy, setMasterDy, masterDz, setMasterDz],
              ['Slave',  slaveW,  setSlaveW,  slaveL,  setSlaveL,  slaveD,  setSlaveD,  slaveDx,  setSlaveDx,  slaveDy,  setSlaveDy,  slaveDz,  setSlaveDz],
            ] as const).map(([label, w, setW, l, setL, d, setD, dx, setDx, dy, setDy, dz, setDz]) => (
              <tr key={label} className="bg-gray-950/30 hover:bg-gray-800/20">
                <td className="border border-gray-700 px-2 py-0.5 text-gray-400 font-medium whitespace-nowrap">{label}</td>
                {([
                  [w, setW, 10, 2000], [l, setL, 10, 2000], [d, setD, 10, 2000],
                  [dx, setDx, 0, 1000], [dy, setDy, 0, 1000], [dz, setDz, 0, 1000],
                ] as [number, (n: number) => void, number, number][]).map(([val, set, mn, mx], ci) => (
                  <td key={ci} className="border border-gray-700 p-0">
                    <NumField value={val} min={mn} max={mx} onChange={set}
                      className="w-full bg-transparent text-white text-right font-mono text-[11px] focus:outline-none focus:bg-blue-950/40 px-1.5 py-0.5" />
                  </td>
                ))}
                {['rx','ry','rz'].map(k => (
                  <td key={k} className="border border-gray-700 px-1.5 py-0.5 text-center text-gray-700 select-none">—</td>
                ))}
              </tr>
            ))}
            {/* Joint row — W/L/D not applicable, only dx/dy/dz */}
            <tr className="bg-gray-950/30 hover:bg-gray-800/20">
              <td className="border border-gray-700 px-2 py-0.5 text-gray-400 font-medium whitespace-nowrap">Joint</td>
              {['W','L','D'].map(k => (
                <td key={k} className="border border-gray-700 px-1.5 py-0.5 text-center text-gray-700 select-none">—</td>
              ))}
              {([
                [jointDx, setJointDx], [jointDy, setJointDy], [jointDz, setJointDz],
              ] as [number, (n: number) => void][]).map(([val, set], ci) => (
                <td key={ci} className="border border-gray-700 p-0">
                  <NumField value={val} min={0} max={1000} onChange={set}
                    className="w-full bg-transparent text-white text-right font-mono text-[11px] focus:outline-none focus:bg-blue-950/40 px-1.5 py-0.5" />
                </td>
              ))}
              {([
                [jointRx, setJointRx], [jointRy, setJointRy], [jointRz, setJointRz],
              ] as [number, (n: number) => void][]).map(([val, set], ci) => (
                <td key={`r${ci}`} className="border border-gray-700 p-0">
                  <NumField value={val} min={-360} max={360} onChange={set}
                    className="w-full bg-transparent text-white text-right font-mono text-[11px] focus:outline-none focus:bg-blue-950/40 px-1.5 py-0.5" />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500">Thickness (t)</span>
          <NumField value={thick} min={6} max={36} onChange={setThick}
            className="w-12 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-white text-right focus:outline-none focus:border-blue-500 font-mono" />
          <span className="text-[10px] text-gray-600">mm</span>
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex-none border-b border-gray-800 px-4 py-1.5 flex items-center gap-3">
        <span className="text-[10px] text-gray-500 font-medium">3D</span>
        <div className="flex gap-0">
          <button
            onClick={() => setWire(true)}
            className={`text-[10px] px-2.5 py-0.5 rounded-l border transition-colors ${
              wire
                ? 'bg-blue-600/20 border-blue-600 text-blue-300'
                : 'bg-transparent border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500'
            }`}
          >Wire</button>
          <button
            onClick={() => setWire(false)}
            className={`text-[10px] px-2.5 py-0.5 rounded-r border-t border-b border-r transition-colors ${
              !wire
                ? 'bg-blue-600/20 border-blue-600 text-blue-300'
                : 'bg-transparent border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500'
            }`}
          >Solid</button>
        </div>
      </div>

      {/* Three stacked views: Section | Face | 3D */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {/* Section SVG */}
        <div className="flex-1 min-h-0 border-b border-gray-800 overflow-hidden relative">
          <span className="absolute top-1 left-2 text-[9px] text-gray-600 pointer-events-none select-none z-10">Section</span>
          <JointSectionSVG ops={evaledOps} thickness={thick}
            masterW={masterW} masterDx={masterDx}
            slaveL={slaveL}   slaveDy={slaveDy}
            selOpId={selOpId} />
        </div>
        {/* Face view SVG */}
        <div className="flex-1 min-h-0 border-b border-gray-800 overflow-hidden relative">
          <span className="absolute top-1 left-2 text-[9px] text-gray-600 pointer-events-none select-none z-10">Face</span>
          <JointFaceViewSVG ops={evaledOps} thickness={thick}
            masterW={masterW} masterDx={masterDx} masterL={masterL}
            slaveL={slaveL}   slaveDy={slaveDy}
            selOpId={selOpId} />
        </div>
        {/* 3D Canvas */}
        <div className="flex-[1.5] min-h-0 overflow-hidden">
          <Joint3DView ops={evaledOps} thickness={thick} wire={wire}
            masterW={masterW} masterDx={masterDx}
            slaveL={slaveL}   slaveDy={slaveDy}
            depth={masterD}   selOpId={selOpId}
            jointRx={jointRx} jointRy={jointRy} jointRz={jointRz} />
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
