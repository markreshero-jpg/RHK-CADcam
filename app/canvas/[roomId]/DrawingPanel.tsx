'use client'

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { dist, toDeg } from '@/src/lib/geometry'
import type { Pt } from '@/src/lib/geometry'
import { evalCalc } from '@/src/lib/calc'

interface Props {
  drawStart: Pt
  drawCursor: Pt | null
  onPlace: (length: number, angle: number) => void
  onCancel: () => void
  onUpdatePreview?: (length: number, angle: number) => void
}

export interface DrawingPanelHandle {
  focusLength: () => void
}

const DrawingPanel = forwardRef<DrawingPanelHandle, Props>(function DrawingPanel(
  { drawStart, drawCursor, onPlace, onCancel, onUpdatePreview }, ref
) {
  const liveLen = drawCursor ? Math.round(dist(drawStart, drawCursor)) : 0
  const liveAng = drawCursor
    ? Math.round(toDeg(Math.atan2(drawCursor.y - drawStart.y, drawCursor.x - drawStart.x)) * 10) / 10
    : 0

  const [lenVal, setLenVal] = useState(String(liveLen))
  const [angVal, setAngVal] = useState(String(liveAng))
  const [lenFocused, setLenFocused] = useState(false)
  const [angFocused, setAngFocused] = useState(false)
  // Once the user manually types a value, stop overwriting it with mouse movement
  const lenDirty = useRef(false)
  const angDirty = useRef(false)

  const lenRef = useRef<HTMLInputElement>(null)
  const angRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focusLength: () => { lenRef.current?.focus(); lenRef.current?.select() },
  }))

  // Keep fields in sync with mouse, but only if the user hasn't manually edited them
  useEffect(() => { if (!lenFocused && !lenDirty.current) setLenVal(String(liveLen)) }, [liveLen, lenFocused])
  useEffect(() => { if (!angFocused && !angDirty.current) setAngVal(String(liveAng)) }, [liveAng, angFocused])

  function place() {
    const l = evalCalc(lenVal)
    const a = evalCalc(angVal)
    if (l == null || l < 10 || a == null) return
    lenDirty.current = false
    angDirty.current = false
    // Hand focus back to the canvas so the next wall's fields track the mouse
    // again and Tab starts from Length (canvas Tab → focusLength).
    lenRef.current?.blur(); angRef.current?.blur()
    onPlace(l, a)
  }

  function onLenKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); place() }
    if (e.key === 'Tab') {
      e.preventDefault()
      const l = evalCalc(lenVal), a = evalCalc(angVal)
      if (l != null && a != null) onUpdatePreview?.(l, a)
      angRef.current?.focus(); angRef.current?.select()
    }
    if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
  }

  function onAngKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); place() }
    if (e.key === 'Tab') {
      e.preventDefault()
      const l = evalCalc(lenVal), a = evalCalc(angVal)
      if (l != null && a != null) onUpdatePreview?.(l, a)
      lenRef.current?.focus(); lenRef.current?.select()
    }
    if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
  }

  const inputCls = 'w-full bg-gray-800 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm text-white outline-none'

  return (
    // Rendered inside WallDrawPanel, which owns the column + header.
    <div className="flex flex-col">
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Length (mm)</label>
          <input
            ref={lenRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={lenVal}
            onChange={e => { setLenVal(e.target.value); lenDirty.current = true }}
            onFocus={() => { setLenFocused(true); lenRef.current?.select() }}
            onBlur={() => setLenFocused(false)}
            onKeyDown={onLenKey}
            className={inputCls}
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Angle (°)</label>
          <input
            ref={angRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={angVal}
            onChange={e => { setAngVal(e.target.value); angDirty.current = true }}
            onFocus={() => { setAngFocused(true); angRef.current?.select() }}
            onBlur={() => setAngFocused(false)}
            onKeyDown={onAngKey}
            className={inputCls}
          />
        </div>

        <button
          onClick={place}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-1.5 rounded transition-colors"
        >
          Place Wall ↵
        </button>

        <p className="text-xs text-gray-600 leading-relaxed">
          Tab to switch fields · Shift = 5° snap
        </p>
      </div>
    </div>
  )
})

export default DrawingPanel
