'use client'

// ============================================================
// FormulaInput — a numeric field that also accepts live formulas.
//
// Superset of CalcInput on the new formula engine (src/lib/formula):
//   "450"          → literal commit (onLiteral), exactly like CalcInput
//   "600/2 - 9"    → pure arithmetic collapses to a literal (291)
//   "cab.h - 100"  → live formula: evaluated against `scope`, committed via
//                    onFormula(source, value); the field then displays the
//                    formula with a `ƒ = 620 mm` readout underneath
//   invalid input  → red message under the field, draft kept for fixing
//                    (Escape reverts)
//
// The parent owns storage: literals go wherever they went before, formula
// sources go to their expressions store. Clearing the field calls onClear.
// ============================================================

import { useState } from 'react'
import { classifyFieldInput, evaluateFormula, type FormulaScope } from '@/src/lib/formula'

interface FormulaInputProps {
  /** Stored formula source for this field (null/undefined = literal mode). */
  formula?: string | null
  /** Committed numeric value (the override / cached formula result). */
  value: number | null | undefined
  /** Evaluation scope. null → formula input is rejected with a clear message. */
  scope: FormulaScope | null
  onLiteral: (value: number) => void
  onFormula: (source: string, value: number) => void
  onClear: () => void
  className?: string
  placeholder?: string
  title?: string
  disabled?: boolean
  /** Round committed literal values (formula results are cached full-precision). */
  decimals?: number
  /** Unit label for the readout line (default "mm"). */
  unit?: string
  selectOnFocus?: boolean
}

function fmt(value: number | null | undefined, decimals = 3): string {
  if (value == null || !Number.isFinite(value)) return ''
  const f = 10 ** decimals
  return String(Math.round(value * f) / f)
}

export default function FormulaInput({
  formula, value, scope, onLiteral, onFormula, onClear,
  className, placeholder, title, disabled, decimals, unit = 'mm', selectOnFocus = true,
}: FormulaInputProps) {
  // null = not editing → mirror formula/value; string = in-progress draft
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isFormula = !!(formula && formula.trim())
  const shown = draft ?? (isFormula ? formula! : fmt(value, decimals))

  function commit() {
    if (draft == null) return
    const input = classifyFieldInput(draft)

    if (input.kind === 'empty') {
      setDraft(null); setError(null)
      onClear()
      return
    }
    if (input.kind === 'invalid') {
      setError(input.error.message) // keep the draft so the user can fix it
      return
    }
    if (input.kind === 'literal') {
      let v = input.value
      if (decimals != null) { const f = 10 ** decimals; v = Math.round(v * f) / f }
      setDraft(null); setError(null)
      onLiteral(v)
      return
    }
    // Formula — needs a scope to evaluate against
    if (!scope) {
      setError('Formulas are not available here yet')
      return
    }
    const result = evaluateFormula(input.ast, scope)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setDraft(null); setError(null)
    onFormula(input.source, result.value)
  }

  return (
    <div className="flex-1 min-w-0">
      <input
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        value={shown}
        title={title ?? (isFormula ? formula! : undefined)}
        placeholder={placeholder}
        disabled={disabled}
        onChange={e => { setDraft(e.target.value); if (error) setError(null) }}
        onFocus={e => { if (selectOnFocus) e.currentTarget.select() }}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') { setDraft(null); setError(null); e.currentTarget.blur() }
        }}
        onBlur={commit}
        className={`${className ?? ''} ${isFormula && draft == null ? 'text-sky-300' : ''} ${error ? 'border-red-500' : ''}`}
      />
      {error ? (
        <div className="text-[10px] text-red-400 mt-0.5 leading-tight">{error}</div>
      ) : isFormula && draft == null ? (
        <div className="text-[10px] text-sky-500 mt-0.5 font-mono leading-tight">
          ƒ = {fmt(value, decimals)} {unit}
        </div>
      ) : null}
    </div>
  )
}
