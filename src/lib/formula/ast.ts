// ============================================================
// Formula engine — AST (M1).
//
// One typed node per grammar production. Every node carries [start, end)
// source offsets so parse/eval errors can point at the exact span in the
// input field. The AST is JSON-serializable (no methods, no classes) so it
// can be cached alongside the formula source later if we want to skip
// re-parsing at resolve time.
// ============================================================

export type BinaryOp =
  | '+' | '-' | '*' | '/'
  | '=' | '!=' | '<' | '<=' | '>' | '>='
  | 'and' | 'or'

/** Number literal: `600`, `19.5` (always mm). */
export interface NumNode {
  kind: 'num'
  value: number
  start: number
  end: number
}

/**
 * Dotted path from a root scope: `cab.h`, `r.TOEH`, `room.cab_depth`.
 * `root` is the scope name; `fields` the remaining segments (≥ 1 in a valid
 * formula — a bare root like `cab` parses but fails evaluation with a
 * "did you mean cab.w / cab.h / cab.d" style error).
 */
export interface PathNode {
  kind: 'path'
  root: string
  fields: string[]
  start: number
  end: number
}

/**
 * Named-object lookup: `part("left_gable").h`, `cabinet("B01").w`,
 * `wall("1").length`. `fn` is the lookup kind, `name` the quoted argument,
 * `fields` the trailing path (parser enforces ≥ 1 field).
 */
export interface LookupNode {
  kind: 'lookup'
  fn: 'part' | 'cabinet' | 'wall'
  name: string
  fields: string[]
  start: number
  end: number
}

/** Function call: `if(...)`, `min(...)`, `round(x, 32)`, … */
export interface CallNode {
  kind: 'call'
  name: string
  args: FormulaNode[]
  start: number
  end: number
}

export interface UnaryNode {
  kind: 'unary'
  op: '-'
  operand: FormulaNode
  start: number
  end: number
}

export interface BinaryNode {
  kind: 'binary'
  op: BinaryOp
  left: FormulaNode
  right: FormulaNode
  start: number
  end: number
}

export type FormulaNode =
  | NumNode
  | PathNode
  | LookupNode
  | CallNode
  | UnaryNode
  | BinaryNode

/** Depth-first walk over every node in the tree. */
export function walkAst(node: FormulaNode, visit: (n: FormulaNode) => void): void {
  visit(node)
  switch (node.kind) {
    case 'unary':
      walkAst(node.operand, visit)
      break
    case 'binary':
      walkAst(node.left, visit)
      walkAst(node.right, visit)
      break
    case 'call':
      for (const a of node.args) walkAst(a, visit)
      break
    default:
      break
  }
}
