// ============================================================
// Formula engine — evaluator (M1).
//
// Evaluates a parsed AST against a FormulaScope. Numbers are mm floats.
// Comparisons and and/or produce 1 or 0 (Excel-style); if() treats any
// non-zero as true. Every failure throws FormulaError with the offending
// source span so the UI can underline it.
// ============================================================

import type { FormulaNode } from './ast'
import { FormulaError, type LookupFn } from './parser'

/** A scope value is a number or a one-or-more-level record of scope values. */
export type ScopeValue = number | { readonly [key: string]: ScopeValue }

export interface FormulaScope {
  /** Root scopes: cab, r, t, room, wall, job, … Missing root → eval error. */
  roots: Record<string, ScopeValue>
  /**
   * Named-object lookups: part("left_gable"), cabinet("B01"), wall("1").
   * Return undefined for an unknown name; omit entirely if a lookup kind is
   * not available in this context (→ clear "not available here" error).
   */
  lookup?: (fn: LookupFn, name: string) => ScopeValue | undefined
}

const EQ_EPS = 1e-9

const FUNCTIONS: Record<string, { minArgs: number; maxArgs: number }> = {
  if:    { minArgs: 3, maxArgs: 3 },
  case:  { minArgs: 3, maxArgs: Infinity }, // cond, val, [cond, val ...], default

  min:   { minArgs: 1, maxArgs: Infinity },
  max:   { minArgs: 1, maxArgs: Infinity },
  round: { minArgs: 1, maxArgs: 2 },
  floor: { minArgs: 1, maxArgs: 2 },
  ceil:  { minArgs: 1, maxArgs: 2 },
  abs:   { minArgs: 1, maxArgs: 1 },
}

export const FUNCTION_NAMES = Object.keys(FUNCTIONS)

function describeKeys(value: ScopeValue, limit = 8): string {
  if (typeof value === 'number') return ''
  const keys = Object.keys(value)
  const shown = keys.slice(0, limit).join(', ')
  return keys.length > limit ? `${shown}, …` : shown
}

/** Walk `fields` down from `base`, throwing a positioned error on a miss. */
function walkFields(
  base: ScopeValue, baseLabel: string, fields: string[], node: FormulaNode,
): ScopeValue {
  let cur: ScopeValue = base
  let label = baseLabel
  for (const f of fields) {
    if (typeof cur === 'number') {
      throw new FormulaError(`${label} is a number — it has no field ".${f}"`, node.start, node.end)
    }
    const nextVal: ScopeValue | undefined = cur[f]
    if (nextVal === undefined) {
      const known = describeKeys(cur)
      throw new FormulaError(
        `${label} has no field "${f}"${known ? ` (available: ${known})` : ''}`,
        node.start, node.end,
      )
    }
    cur = nextVal
    label = `${label}.${f}`
  }
  return cur
}

function asNumber(value: ScopeValue, label: string, node: FormulaNode): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new FormulaError(`${label} is not a finite number`, node.start, node.end)
    }
    return value
  }
  const known = describeKeys(value)
  throw new FormulaError(
    `${label} is an object, not a number — pick a field${known ? ` (${known})` : ''}`,
    node.start, node.end,
  )
}

/** Evaluate an AST to a number. Throws FormulaError on any failure. */
export function evaluate(node: FormulaNode, scope: FormulaScope): number {
  switch (node.kind) {
    case 'num':
      return node.value

    case 'path': {
      const root = scope.roots[node.root]
      if (root === undefined) {
        const known = Object.keys(scope.roots).join(', ')
        throw new FormulaError(
          `Unknown name "${node.root}"${known ? ` (available scopes: ${known})` : ''}`,
          node.start, node.end,
        )
      }
      const value = walkFields(root, node.root, node.fields, node)
      return asNumber(value, [node.root, ...node.fields].join('.'), node)
    }

    case 'lookup': {
      if (!scope.lookup) {
        throw new FormulaError(`${node.fn}(...) lookups are not available here`, node.start, node.end)
      }
      const obj = scope.lookup(node.fn, node.name)
      if (obj === undefined) {
        throw new FormulaError(`No ${node.fn} named "${node.name}" in this context`, node.start, node.end)
      }
      const label = `${node.fn}("${node.name}")`
      const value = walkFields(obj, label, node.fields, node)
      return asNumber(value, `${label}.${node.fields.join('.')}`, node)
    }

    case 'unary':
      return -evaluate(node.operand, scope)

    case 'binary': {
      // Short-circuit and/or
      if (node.op === 'and') {
        return evaluate(node.left, scope) !== 0 && evaluate(node.right, scope) !== 0 ? 1 : 0
      }
      if (node.op === 'or') {
        return evaluate(node.left, scope) !== 0 || evaluate(node.right, scope) !== 0 ? 1 : 0
      }
      const l = evaluate(node.left, scope)
      const r = evaluate(node.right, scope)
      switch (node.op) {
        case '+': return l + r
        case '-': return l - r
        case '*': return l * r
        case '/':
          if (r === 0) throw new FormulaError('Division by zero', node.right.start, node.right.end)
          return l / r
        case '=':  return Math.abs(l - r) <= EQ_EPS ? 1 : 0
        case '!=': return Math.abs(l - r) > EQ_EPS ? 1 : 0
        case '<':  return l < r ? 1 : 0
        case '<=': return l <= r ? 1 : 0
        case '>':  return l > r ? 1 : 0
        case '>=': return l >= r ? 1 : 0
      }
      // Exhaustive — unreachable
      throw new FormulaError(`Unknown operator "${node.op}"`, node.start, node.end)
    }

    case 'call': {
      const sig = FUNCTIONS[node.name]
      if (!sig) {
        throw new FormulaError(
          `Unknown function "${node.name}" (available: ${FUNCTION_NAMES.join(', ')})`,
          node.start, node.end,
        )
      }
      if (node.args.length < sig.minArgs || node.args.length > sig.maxArgs) {
        const want = sig.minArgs === sig.maxArgs
          ? `${sig.minArgs}`
          : sig.maxArgs === Infinity ? `at least ${sig.minArgs}` : `${sig.minArgs}–${sig.maxArgs}`
        throw new FormulaError(
          `${node.name}() takes ${want} argument${sig.minArgs === 1 && sig.maxArgs === 1 ? '' : 's'}, got ${node.args.length}`,
          node.start, node.end,
        )
      }
      switch (node.name) {
        case 'if':
          return evaluate(node.args[0], scope) !== 0
            ? evaluate(node.args[1], scope)
            : evaluate(node.args[2], scope)
        case 'case': {
          // case(c1, v1, c2, v2, …, default): pairs top-down, default required.
          if (node.args.length % 2 === 0) {
            throw new FormulaError(
              'case() needs condition/value pairs plus a final default — an odd number of arguments, e.g. case(cab.h <= 900, 2, cab.h <= 1600, 3, 4)',
              node.start, node.end,
            )
          }
          for (let i = 0; i + 1 < node.args.length; i += 2) {
            if (evaluate(node.args[i], scope) !== 0) return evaluate(node.args[i + 1], scope)
          }
          return evaluate(node.args[node.args.length - 1], scope)
        }
        case 'min':
          return Math.min(...node.args.map(a => evaluate(a, scope)))
        case 'max':
          return Math.max(...node.args.map(a => evaluate(a, scope)))
        case 'abs':
          return Math.abs(evaluate(node.args[0], scope))
        case 'round': case 'floor': case 'ceil': {
          const x = evaluate(node.args[0], scope)
          const fn = node.name === 'round' ? Math.round : node.name === 'floor' ? Math.floor : Math.ceil
          if (node.args.length === 2) {
            // round(x, step): round to the nearest multiple of step (e.g. 32mm system)
            const step = evaluate(node.args[1], scope)
            if (step <= 0) {
              throw new FormulaError(`${node.name}() step must be positive`, node.args[1].start, node.args[1].end)
            }
            return fn(x / step) * step
          }
          return fn(x)
        }
      }
      // Exhaustive — unreachable
      throw new FormulaError(`Unhandled function "${node.name}"`, node.start, node.end)
    }
  }
}
