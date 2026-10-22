'use client'

// Wall / island tool before the first click: type where the wall starts. Tab from the
// canvas lands on X, Tab → Y; the start locks there (the canvas cursor ring sits on it),
// Enter or a click starts the wall at it. Blank follows the cursor. Room mm, Y down.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Pt } from '@/src/lib/geometry'
import { evalCalc } from '@/src/lib/calc'

export interface WallStart { x?: number; y?: number }
export interface WallStartPanelHandle { focusX: () => void }

/** The start point with a typed X / Y locked in (unset parts follow the cursor). */
export const wallStartPoint = (raw: Pt, t: WallStart): Pt => ({ x: t.x ?? raw.x, y: t.y ?? raw.y })

const WallStartPanel = forwardRef<WallStartPanelHandle, {
  cursor: Pt | null
  onTyped: (t: WallStart) => void
  onStart: () => void
  /** Unmounting (wall started, tool left): forget the typed values. */
  onGone: () => void
}>(function WallStartPanel({ cursor, onTyped, onStart, onGone }, ref) {
  useEffect(() => onGone, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<{ x?: string; y?: string }>({})
  const xRef = useRef<HTMLInputElement>(null), yRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => ({ focusX: () => { xRef.current?.focus(); xRef.current?.select() } }))

  const num = (s?: string) => { const n = s != null && s.trim() ? evalCalc(s) : null; return n != null && Number.isFinite(n) ? n : undefined }
  const change = (f: 'x' | 'y', v: string) => {
    const next = { ...draft, [f]: v }
    setDraft(next)
    onTyped({ x: num(next.x), y: num(next.y) })
  }
  const clear = () => { setDraft({}); onTyped({}) }
  const inputCls = (on: boolean) => `w-full bg-gray-800 border rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500 ${on ? 'border-yellow-500 text-yellow-200' : 'border-gray-700 text-white'}`

  const field = (f: 'x' | 'y', r: React.RefObject<HTMLInputElement | null>) => (
    <div className="flex-1 min-w-0">
      <label className="text-xs text-gray-500 block mb-1">Start {f.toUpperCase()} (mm)</label>
      <input ref={r} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
        value={draft[f] ?? ''} placeholder={cursor ? String(Math.round(f === 'x' ? cursor.x : cursor.y)) : 'cursor'}
        onChange={e => change(f, e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Tab') { e.preventDefault(); const o = f === 'x' ? yRef.current : xRef.current; o?.focus(); o?.select() }
          else if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); setDraft({}); onStart() }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); (e.target as HTMLInputElement).blur(); clear() }
        }}
        className={inputCls(num(draft[f]) != null)} />
    </div>
  )

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        {field('x', xRef)}
        {field('y', yRef)}
      </div>
      <div className="text-[11px] text-gray-500">Tab = type where it starts · Enter = start there · Esc = clear · blank follows the cursor</div>
    </div>
  )
})

export default WallStartPanel
