// ============================================================
// Custom-part formulas (M3) — new-engine evaluation of the
// cabinet_custom_parts.expressions store (dx/dy/dz/x/y/z → formula source).
//
// Supersedes the legacy new-Function evaluator (partFormula.ts, retired).
// Same write-back-cache contract as before: resolveCustomParts evaluates each
// field against the assembly's fresh buildFormulaScope() and persists changed
// values into the literal columns every view/cut-list reads. The full M1
// grammar is available — cab.* / r.* / t.* / part("left_gable").h / if() etc.
// All pre-M3 stored expressions (cab.h, cab.d + t.door + 2, …) parse
// unchanged under the new grammar.
// ============================================================

import { parse } from './parser'
import { evaluate, type FormulaScope } from './evaluate'

export type CustomPartField = 'dx' | 'dy' | 'dz' | 'x' | 'y' | 'z'
export const CUSTOM_PART_FIELDS: CustomPartField[] = ['dx', 'dy', 'dz', 'x', 'y', 'z']

export type CustomPartDims = Record<CustomPartField, number>

const SIZE_FIELDS: ReadonlySet<string> = new Set(['dx', 'dy', 'dz'])

/**
 * Evaluate a custom part's stored expressions and return the fields whose
 * value differs from the stored literal (the write-back patch). A formula
 * that fails to parse/evaluate leaves its field untouched (last good value
 * wins) and logs a warning. Sizes must resolve > 0; positions just finite.
 */
export function evalCustomPartFields(
  literal: CustomPartDims,
  expressions: Record<string, string> | null | undefined,
  scope: FormulaScope,
): Partial<CustomPartDims> {
  const out: Partial<CustomPartDims> = {}
  if (!expressions) return out
  for (const field of CUSTOM_PART_FIELDS) {
    const src = expressions[field]
    if (typeof src !== 'string' || !src.trim()) continue
    let value: number
    try {
      value = evaluate(parse(src), scope)
    } catch (e) {
      console.warn(`[custom part formula] ${field} "${src}":`, e instanceof Error ? e.message : e)
      continue
    }
    if (!Number.isFinite(value) || (SIZE_FIELDS.has(field) && value <= 0)) {
      console.warn(`[custom part formula] ${field} "${src}" → ${value} (ignored)`)
      continue
    }
    if (Math.abs(value - literal[field]) > 1e-6) out[field] = value
  }
  return out
}
