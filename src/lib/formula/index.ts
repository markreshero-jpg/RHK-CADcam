// ============================================================
// Formula engine — public API (M1).
//
// Safe (non-throwing) wrappers around the parser/evaluator, plus the
// input classifier UI fields use:
//   "450"            → literal 450 (store the number, no formula)
//   "600/2 - 9"      → literal 291 (pure arithmetic collapses)
//   "cab.h - 100"    → formula (store source; cache value; deps ["cab.h"])
//   "cab.h -"        → invalid (message + span for underlining)
//
// Grammar/AST: ./ast ./parser — evaluation: ./evaluate —
// deps: ./deps — scope assembly: ./context
// ============================================================

import type { FormulaNode } from './ast'
import { parse, FormulaError } from './parser'
import { evaluate, type FormulaScope } from './evaluate'
import { extractDeps, isPureLiteral, type FormulaDep } from './deps'

export type { FormulaNode } from './ast'
export { parse, FormulaError } from './parser'
export { evaluate, FUNCTION_NAMES, type FormulaScope, type ScopeValue } from './evaluate'
export { extractDeps, isPureLiteral, depKey, type FormulaDep } from './deps'
export {
  buildFormulaScope, buildPartMap,
  type FormulaScopeExtras, type PartScopeValue,
} from './context'
export {
  evalCustomPartFields, CUSTOM_PART_FIELDS,
  type CustomPartField, type CustomPartDims,
} from './customParts'

export interface FormulaIssue {
  message: string
  /** [start, end) span in the source string for underlining. */
  start: number
  end: number
}

export type ParseResult =
  | { ok: true; ast: FormulaNode }
  | { ok: false; error: FormulaIssue }

export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; error: FormulaIssue }

function toIssue(e: unknown, sourceLength: number): FormulaIssue {
  if (e instanceof FormulaError) return { message: e.message, start: e.start, end: e.end }
  return { message: e instanceof Error ? e.message : String(e), start: 0, end: sourceLength }
}

/** Parse without throwing. */
export function parseFormula(source: string): ParseResult {
  try {
    return { ok: true, ast: parse(source) }
  } catch (e) {
    return { ok: false, error: toIssue(e, source.length) }
  }
}

/** Parse + evaluate without throwing. */
export function evaluateFormula(source: string | FormulaNode, scope: FormulaScope): EvalResult {
  try {
    const ast = typeof source === 'string' ? parse(source) : source
    return { ok: true, value: evaluate(ast, scope) }
  } catch (e) {
    return { ok: false, error: toIssue(e, typeof source === 'string' ? source.length : 0) }
  }
}

// ── Field-input classification ────────────────────────────────

export type FieldInput =
  | { kind: 'empty' }
  /** Plain number or pure arithmetic — store as a number, no formula. */
  | { kind: 'literal'; value: number }
  /** References external values — store source, cache value, track deps. */
  | { kind: 'formula'; source: string; ast: FormulaNode; deps: FormulaDep[] }
  | { kind: 'invalid'; source: string; error: FormulaIssue }

/**
 * Classify raw field input. Mirrors (and supersedes) the custom-parts
 * parseField convention: only expressions that read variables are kept as
 * live formulas; anything self-contained collapses to its numeric value.
 */
export function classifyFieldInput(raw: string | null | undefined): FieldInput {
  const source = (raw ?? '').trim()
  if (source === '') return { kind: 'empty' }

  const parsed = parseFormula(source)
  if (!parsed.ok) return { kind: 'invalid', source, error: parsed.error }

  if (isPureLiteral(parsed.ast)) {
    const result = evaluateFormula(parsed.ast, { roots: {} })
    if (!result.ok) return { kind: 'invalid', source, error: result.error }
    return { kind: 'literal', value: result.value }
  }
  return { kind: 'formula', source, ast: parsed.ast, deps: extractDeps(parsed.ast) }
}
