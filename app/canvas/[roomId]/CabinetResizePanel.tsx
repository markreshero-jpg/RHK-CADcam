'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  dim: 'dx' | 'dz' | 'dy'
  liveValue: number
  onApply: (v: number) => void
  onCancel: () => void
  onTabApply: (v: number) => void
}

export default function CabinetResizePanel({ dim, liveValue, onApply, onCancel, onTabApply }: Props) {
  const [val, setVal] = useState(String(Math.round(liveValue)))
  const inputRef = useRef<HTMLInputElement>(null)
  const dirty = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    if (!dirty.current) setVal(String(Math.round(liveValue)))
  }, [liveValue])

  function apply() {
    const n = parseFloat(val)
    if (!isNaN(n) && n >= 10) onApply(n)
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Tab') {
      e.preventDefault()
      const n = parseFloat(val)
      if (!isNaN(n) && n >= 10) {
        dirty.current = false
        onTabApply(n)
        inputRef.current?.select()
      }
    }
    if (e.key === 'Enter') { e.preventDefault(); apply() }
    if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
  }

  const label = dim === 'dx' ? 'Width (mm)' : dim === 'dy' ? 'Height (mm)' : 'Depth (mm)'
  const inputCls = 'w-full bg-gray-800 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm text-white outline-none'

  return (
    <div className="w-52 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-gray-800">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Resize Cabinet</p>
      </div>
      <div className="px-4 py-4 flex flex-col gap-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">{label}</label>
          <input
            ref={inputRef}
            type="number"
            min={10}
            step={1}
            value={val}
            onChange={e => { setVal(e.target.value); dirty.current = true }}
            onFocus={() => inputRef.current?.select()}
            onKeyDown={onKey}
            className={inputCls}
          />
        </div>
        <button
          onClick={apply}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-1.5 rounded transition-colors"
        >
          Apply ↵
        </button>
        <p className="text-xs text-gray-600 leading-relaxed">
          Tab to apply live · Esc to cancel
        </p>
      </div>
    </div>
  )
}
