// ============================================================
// Formula engine — dependency extraction (M1).
//
// Walks an AST and returns every external value the formula reads, as
// canonical strings the dependency graph can key on:
//   cab.h                     (path)
//   r.TOEH                    (path)
//   part("left_gable").h      (lookup — name is normalized into the key)
//   wall("1").length
//
// Sorted + deduped so two formulas reading the same things produce
// identical dep arrays (stable for persistence / diffing).
// ============================================================

import { walkAst, type FormulaNode } from './ast'
import type { LookupFn } from './parser'

export interface FormulaDep {
  /** Canonical string form, e.g. `part("left_gable").h` */
  key: string
  /** Root scope name for paths (cab, r, t, room…); lookup fn for lookups. */
  root: string
  /** Lookup target name (part/cabinet/wall lookups only). */
  name?: string
  /** Field chain below the root/lookup. */
  fields: string[]
}

export function depKey(root: string, fields: string[], lookupName?: string): string {
  const head = lookupName !== undefined ? `${root}("${lookupName}")` : root
  return fields.length ? `${head}.${fields.join('.')}` : head
}

/** Extract all external references from a formula AST. */
export function extractDeps(ast: FormulaNode): FormulaDep[] {
  const byKey = new Map<string, FormulaDep>()
  walkAst(ast, node => {
    if (node.kind === 'path') {
      const key = depKey(node.root, node.fields)
      if (!byKey.has(key)) byKey.set(key, { key, root: node.root, fields: node.fields })
    } else if (node.kind === 'lookup') {
      const key = depKey(node.fn, node.fields, node.name)
      if (!byKey.has(key)) {
        byKey.set(key, { key, root: node.fn as LookupFn, name: node.name, fields: node.fields })
      }
    }
  })
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/** True when the formula reads nothing external (pure arithmetic → literal). */
export function isPureLiteral(ast: FormulaNode): boolean {
  return extractDeps(ast).length === 0
}
