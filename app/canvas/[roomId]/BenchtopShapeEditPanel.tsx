'use client'
// In-plan shape edit panel (benchtop Phase 6). Replaces the BenchtopPanel while
// a top is in Edit shape mode. Mark (2026-10-12): lines are dragged parallel on
// the plan; corners are edited by typed X / Y from the top's back-left corner
// (0,0, shown green on the plan). Plus Save / Cancel / Undo, the live overhang
// past the cabinets, and round / chamfer / remove for the picked corner.

import { useState, useEffect, useRef } from 'react'
import CalcInput from '@/src/components/CalcInput'
import { evalCalc } from '@/src/lib/calc'
import type { BenchtopInstance } from '@/src/lib/types'
import type { BtOverhang } from '@/src/lib/benchtopAnchor'
import { outlinePoints, signedArea, sizeAcross } from '@/src/lib/benchtopGeometry'
import { btLocal, type BtShapeEdit, type BtShapeSel } from './canvasTypes'

export interface ShapeOps {
  setCorner: (i: number, l: { x: number; y: number }) => void
  deleteCorner: (i: number) => void
  round: (i: number, r: number) => void
  chamfer: (i: number, d: number) => void
}

const inp = 'w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-white text-right font-mono focus:outline-none focus:border-blue-500'
const lbl = 'text-[10px] text-gray-500 uppercase tracking-wider mb-0.5 block'
const btn = 'px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-40'

export default function BenchtopShapeEditPanel({
  benchtop, edit, overhang, ops, onSelect, onSave, onCancel, onUndo,
  stretch, onStretchSize, onStretchCancel,
}: {
  benchtop: BenchtopInstance
  edit: BtShapeEdit
  overhang: BtOverhang | null
  ops: ShapeOps
  onSelect: (sel: BtShapeSel) => void
  onSave: () => void
  onCancel: () => void
  onUndo: () => void
  /** A line following the mouse (cabinet-style stretch), or null. */
  stretch: { i: number } | null
  onStretchSize: (size: number, place: boolean) => void
  onStretchCancel: () => void
}) {
  const { segs, sel, frame } = edit
  const n = segs.length
  const area = Math.abs(signedArea(outlinePoints(segs, 16))) / 1e6
  const [radius, setRadius] = useState(100)
  const [chamfer, setChamfer] = useState(50)
  const picked = sel?.kind === 'v' ? sel.i : null

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800">
        <p className="text-xs font-medium text-amber-300">Edit shape — {benchtop.label ?? 'Benchtop'}</p>
        <p className="text-[10px] text-gray-500">{n} corners · {area.toFixed(2)} m²</p>
        <div className="flex gap-1.5 mt-2">
          <button onClick={onSave} className="flex-1 px-2 py-1 rounded text-xs bg-teal-600 hover:bg-teal-500 text-white" title="Enter">✓ Save</button>
          <button onClick={onCancel} className={btn} title="Esc — discard the changes">Cancel</button>
          <button onClick={onUndo} disabled={!edit.history.length} className={btn} title="Ctrl+Z — undo the last change in this edit">↶</button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {stretch && segs[stretch.i] && (() => {
          // Size across the line: depth for a line along the wall, length for an end.
          const s = segs[stretch.i]
          const L = Math.hypot(s.p1.x - s.p0.x, s.p1.y - s.p0.y) || 1
          const along = Math.abs(((s.p1.x - s.p0.x) * frame.d.x + (s.p1.y - s.p0.y) * frame.d.y) / L) > 0.7
          return (
            <StretchBox key={stretch.i} label={along ? 'Depth (mm)' : 'Length (mm)'}
              live={sizeAcross(segs, stretch.i)} onSize={onStretchSize} onCancel={onStretchCancel} />
          )
        })()}

        <p className="text-[10px] text-gray-500 leading-snug">
          Click a line to stretch it (like a cabinet): it follows the mouse — click to place, or type the size.
          Drag a line to move it straight away. Type a corner&apos;s X / Y below — measured from the green 0,0 on the plan.
          Shift-click a line to add a corner.
        </p>

        {overhang && (
          <div>
            <span className={lbl}>Overhang past cabinets</span>
            <div className="grid grid-cols-3 gap-1 text-xs font-mono">
              {([['Left', overhang.left], ['Right', overhang.right], ['Front', overhang.front]] as const).map(([k, v]) => (
                <div key={k} className="bg-gray-800 rounded px-2 py-0.5">
                  <span className="text-[9px] text-gray-500 font-sans mr-1">{k}</span>
                  <span className={v < 0 ? 'text-red-400' : 'text-gray-200'}>{Math.round(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Corners — X / Y from the back-left corner */}
        <div>
          <div className="grid grid-cols-[1.5rem_1fr_1fr] gap-1 items-center">
            <span />
            <span className={lbl + ' text-right'}>X</span>
            <span className={lbl + ' text-right'}>Y</span>
            {segs.map((s, i) => {
              const l = btLocal(frame, s.p0)
              const on = picked === i
              return (
                <div key={i} className="contents">
                  <button onClick={() => onSelect({ kind: 'v', i })}
                    className={`text-[11px] rounded ${on ? 'bg-amber-600 text-white' : 'text-gray-500 hover:text-gray-200'}`}
                    title="Pick this corner on the plan">{i + 1}</button>
                  <CalcInput key={`x${i}-${Math.round(l.x)}`} value={Math.round(l.x)} decimals={0}
                    onCommit={v => ops.setCorner(i, { x: v, y: l.y })} className={inp + (on ? ' border-amber-600' : '')} />
                  <CalcInput key={`y${i}-${Math.round(l.y)}`} value={Math.round(l.y)} decimals={0}
                    onCommit={v => ops.setCorner(i, { x: l.x, y: v })} className={inp + (on ? ' border-amber-600' : '')} />
                </div>
              )
            })}
          </div>
        </div>

        {picked != null && (
          <div className="border border-amber-700/50 rounded p-2 space-y-1.5">
            <p className="text-[11px] text-amber-300">Corner {picked + 1}</p>
            <div className="flex gap-1 items-center">
              <div className="w-16"><CalcInput value={radius} decimals={0} onCommit={v => setRadius(Math.max(1, v))} className={inp} /></div>
              <button onClick={() => ops.round(picked, radius)} className={btn + ' flex-1'}>Round</button>
            </div>
            <div className="flex gap-1 items-center">
              <div className="w-16"><CalcInput value={chamfer} decimals={0} onCommit={v => setChamfer(Math.max(1, v))} className={inp} /></div>
              <button onClick={() => ops.chamfer(picked, chamfer)} className={btn + ' flex-1'}>Chamfer</button>
            </div>
            <button onClick={() => ops.deleteCorner(picked)} disabled={n <= 3}
              className="w-full px-2 py-1 rounded text-xs bg-red-900/60 hover:bg-red-800 text-red-100 disabled:opacity-40" title="Delete">
              Remove corner
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// The stretch size box — same feel as the cabinet resize panel: focused and
// selected, follows the mouse until typed in; Tab = apply and keep stretching,
// Enter = place, Esc = cancel the stretch (not the whole edit).
function StretchBox({ label, live, onSize, onCancel }: {
  label: string
  live: number
  onSize: (size: number, place: boolean) => void
  onCancel: () => void
}) {
  const [val, setVal] = useState(String(Math.round(live)))
  const dirty = useRef(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  useEffect(() => { if (!dirty.current) setVal(String(Math.round(live))) }, [live])

  function onKey(e: React.KeyboardEvent) {
    const n = evalCalc(val)
    if (e.key === 'Tab') {
      e.preventDefault()
      if (n != null && n >= 1) { dirty.current = false; onSize(n, false); ref.current?.select() }
    }
    if (e.key === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); if (n != null && n >= 1) onSize(n, true) }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() }
  }

  return (
    <div className="border border-blue-700/60 rounded p-2 space-y-1.5 bg-blue-950/30">
      <p className="text-[11px] text-blue-300">Stretch line</p>
      <label className="text-[10px] text-gray-500 block">{label}</label>
      <input ref={ref} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
        value={val} onChange={e => { setVal(e.target.value); dirty.current = true }}
        onFocus={() => ref.current?.select()} onKeyDown={onKey}
        className="w-full bg-gray-800 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm text-white outline-none" />
      <p className="text-[10px] text-gray-600">Click to place · Tab = apply live · Enter = place · Esc = cancel</p>
    </div>
  )
}

/** Esc in Edit shape with changes: save, discard or keep editing. */
export function SaveShapePrompt({ onSave, onDiscard, onKeep }: { onSave: () => void; onDiscard: () => void; onKeep: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); onSave() }
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onKeep() }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onSave, onKeep])
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onPointerDown={onKeep}>
      <div className="bg-surface border border-edge-strong rounded-xl shadow-2xl w-80 max-w-full p-6 flex flex-col gap-4"
        onPointerDown={e => e.stopPropagation()}>
        <div>
          <p className="text-sm font-semibold text-ink">Save the new shape?</p>
          <p className="text-xs text-ink-muted mt-1">You changed this benchtop&apos;s shape. Save it, or discard the changes.</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onKeep} className="px-3 py-1.5 text-xs rounded-lg bg-surface-3 text-ink-muted hover:text-ink">Keep editing</button>
          <button onClick={onDiscard} className="px-3 py-1.5 text-xs rounded-lg bg-red-600/80 hover:bg-red-500 text-white">Discard</button>
          <button onClick={onSave} className="px-3 py-1.5 text-xs rounded-lg bg-accent hover:bg-accent-hover text-white">Save</button>
        </div>
      </div>
    </div>
  )
}
