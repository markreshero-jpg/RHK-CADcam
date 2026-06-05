'use client'

import { useState } from 'react'
import { evalCalc } from '@/src/lib/calc'

// A numeric text field that accepts arithmetic expressions. Type "600-300" and
// it resolves to 300 on commit (blur / Enter / Tab). A plain number behaves
// exactly like a normal field. Invalid input is rejected on commit and the
// field snaps back to the last good value.
//
// Renders as type="text" (not "number") so operators like - and / can be typed
// mid-string. While focused the field holds a free-text draft; when not focused
// it mirrors `value`, so external changes flow back in.

interface CalcInputProps {
  value: number | null | undefined
  onCommit: (value: number) => void
  className?: string
  placeholder?: string
  title?: string
  disabled?: boolean
  /** Round the committed value to this many decimal places. Omit for none. */
  decimals?: number
  /** Clamp the committed value. */
  min?: number
  max?: number
  /** Select all on focus (default true). */
  selectOnFocus?: boolean
  /** If given, clearing the field to empty calls this instead of reverting. */
  onClear?: () => void
}

function fmt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  const r = Math.round(value * 1000) / 1000 // trim float noise, keep ≤3 dp
  return String(r)
}

export default function CalcInput({
  value, onCommit, className, placeholder, title, disabled,
  decimals, min, max, selectOnFocus = true, onClear,
}: CalcInputProps) {
  // null = not editing → mirror `value`; string = in-progress draft
  const [draft, setDraft] = useState<string | null>(null)

  const shown = draft ?? fmt(value)

  function commit() {
    if (draft == null) return
    const raw = draft.trim()
    if (raw === '') {
      setDraft(null)
      if (onClear) onClear() // empty → clear (e.g. back to inherited default)
      return
    }
    let v = evalCalc(raw)
    if (v != null) {
      if (decimals != null) { const f = 10 ** decimals; v = Math.round(v * f) / f }
      if (min != null) v = Math.max(min, v)
      if (max != null) v = Math.min(max, v)
      setDraft(null)
      onCommit(v)
      return
    }
    // invalid → revert to last good value
    setDraft(null)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={shown}
      title={title}
      placeholder={placeholder}
      disabled={disabled}
      onChange={e => setDraft(e.target.value)}
      onFocus={e => { if (selectOnFocus) e.currentTarget.select() }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur() }
      }}
      onBlur={commit}
      className={className}
    />
  )
}
