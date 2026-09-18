// ============================================================
// Formula engine — tokenizer + recursive-descent parser (M1).
//
// Grammar (precedence low → high):
//   expr       = orExpr
//   orExpr     = andExpr ('or' andExpr)*
//   andExpr    = cmpExpr ('and' cmpExpr)*
//   cmpExpr    = addExpr (('=' | '==' | '!=' | '<' | '<=' | '>' | '>=') addExpr)?
//   addExpr    = mulExpr (('+' | '-') mulExpr)*
//   mulExpr    = unary  (('*' | '/') unary)*
//   unary      = '-' unary | primary
//   primary    = number | '(' expr ')' | lookup | call | path
//   lookup     = ('part' | 'cabinet' | 'wall') '(' string ')' ('.' ident)+
//   call       = ident '(' expr (',' expr)* ')'
//   path       = ident ('.' ident)*
//
// No eval / new Function anywhere — this replaces the three ad-hoc
// `new Function` evaluators long-term. Identifiers are [A-Za-z_][A-Za-z0-9_]*
// so rule keys like TOEH and fields like cab_depth work. Strings accept
// single or double quotes: part('left_gable') === part("left_gable").
// ============================================================

import type { BinaryOp, FormulaNode } from './ast'

export class FormulaError extends Error {
  readonly start: number
  readonly end: number
  constructor(message: string, start: number, end: number) {
    super(message)
    this.name = 'FormulaError'
    this.start = start
    this.end = end
  }
}

export const LOOKUP_FNS = ['part', 'cabinet', 'wall'] as const
export type LookupFn = (typeof LOOKUP_FNS)[number]

// ── Tokenizer ─────────────────────────────────────────────────

type TokenType = 'num' | 'ident' | 'str' | 'op' | 'lparen' | 'rparen' | 'comma' | 'dot' | 'eof'

interface Token {
  type: TokenType
  text: string
  value?: number // for 'num'
  start: number
  end: number
}

const isDigit = (c: string) => c >= '0' && c <= '9'
const isIdentStart = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'
const isIdentPart = (c: string) => isIdentStart(c) || isDigit(c)

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue }

    const start = i
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      while (i < n && isDigit(src[i])) i++
      if (src[i] === '.' && isDigit(src[i + 1] ?? '')) {
        i++
        while (i < n && isDigit(src[i])) i++
      }
      const text = src.slice(start, i)
      const value = parseFloat(text)
      if (!Number.isFinite(value)) throw new FormulaError(`Invalid number "${text}"`, start, i)
      tokens.push({ type: 'num', text, value, start, end: i })
      continue
    }
    if (isIdentStart(c)) {
      while (i < n && isIdentPart(src[i])) i++
      tokens.push({ type: 'ident', text: src.slice(start, i), start, end: i })
      continue
    }
    if (c === '"' || c === "'") {
      i++
      const from = i
      while (i < n && src[i] !== c) i++
      if (i >= n) throw new FormulaError('Unterminated string', start, n)
      tokens.push({ type: 'str', text: src.slice(from, i), start, end: i + 1 })
      i++
      continue
    }
    if (c === '(') { tokens.push({ type: 'lparen', text: c, start, end: i + 1 }); i++; continue }
    if (c === ')') { tokens.push({ type: 'rparen', text: c, start, end: i + 1 }); i++; continue }
    if (c === ',') { tokens.push({ type: 'comma', text: c, start, end: i + 1 }); i++; continue }
    if (c === '.') { tokens.push({ type: 'dot', text: c, start, end: i + 1 }); i++; continue }

    // Multi-char operators first
    const two = src.slice(i, i + 2)
    if (two === '==' || two === '!=' || two === '<=' || two === '>=') {
      tokens.push({ type: 'op', text: two, start, end: i + 2 })
      i += 2
      continue
    }
    if ('+-*/=<>'.includes(c)) {
      tokens.push({ type: 'op', text: c, start, end: i + 1 })
      i++
      continue
    }
    throw new FormulaError(`Unexpected character "${c}"`, i, i + 1)
  }
  tokens.push({ type: 'eof', text: '', start: n, end: n })
  return tokens
}

// ── Parser ────────────────────────────────────────────────────

/** Parse a formula source string into an AST. Throws FormulaError. */
export function parse(src: string): FormulaNode {
  const tokens = tokenize(src)
  let pos = 0

  const peek = () => tokens[pos]
  const next = () => tokens[pos++]
  const expect = (type: TokenType, what: string): Token => {
    const t = tokens[pos]
    if (t.type !== type) {
      throw new FormulaError(`Expected ${what}${t.type === 'eof' ? ' but reached the end' : ` but found "${t.text}"`}`, t.start, t.end)
    }
    return tokens[pos++]
  }

  function parseExpr(): FormulaNode {
    return parseOr()
  }

  function parseOr(): FormulaNode {
    let left = parseAnd()
    while (peek().type === 'ident' && peek().text === 'or') {
      next()
      const right = parseAnd()
      left = { kind: 'binary', op: 'or', left, right, start: left.start, end: right.end }
    }
    return left
  }

  function parseAnd(): FormulaNode {
    let left = parseCmp()
    while (peek().type === 'ident' && peek().text === 'and') {
      next()
      const right = parseCmp()
      left = { kind: 'binary', op: 'and', left, right, start: left.start, end: right.end }
    }
    return left
  }

  function parseCmp(): FormulaNode {
    const left = parseAdd()
    const t = peek()
    if (t.type === 'op' && ['=', '==', '!=', '<', '<=', '>', '>='].includes(t.text)) {
      next()
      const right = parseAdd()
      const op = (t.text === '==' ? '=' : t.text) as BinaryOp
      return { kind: 'binary', op, left, right, start: left.start, end: right.end }
    }
    return left
  }

  function parseAdd(): FormulaNode {
    let left = parseMul()
    for (;;) {
      const t = peek()
      if (t.type === 'op' && (t.text === '+' || t.text === '-')) {
        next()
        const right = parseMul()
        left = { kind: 'binary', op: t.text as BinaryOp, left, right, start: left.start, end: right.end }
      } else break
    }
    return left
  }

  function parseMul(): FormulaNode {
    let left = parseUnary()
    for (;;) {
      const t = peek()
      if (t.type === 'op' && (t.text === '*' || t.text === '/')) {
        next()
        const right = parseUnary()
        left = { kind: 'binary', op: t.text as BinaryOp, left, right, start: left.start, end: right.end }
      } else break
    }
    return left
  }

  function parseUnary(): FormulaNode {
    const t = peek()
    if (t.type === 'op' && t.text === '-') {
      next()
      const operand = parseUnary()
      return { kind: 'unary', op: '-', operand, start: t.start, end: operand.end }
    }
    if (t.type === 'op' && t.text === '+') { // unary plus: allow, no-op
      next()
      return parseUnary()
    }
    return parsePrimary()
  }

  function parsePrimary(): FormulaNode {
    const t = peek()
    if (t.type === 'num') {
      next()
      return { kind: 'num', value: t.value!, start: t.start, end: t.end }
    }
    if (t.type === 'lparen') {
      next()
      const inner = parseExpr()
      expect('rparen', '")"')
      return inner
    }
    if (t.type === 'str') {
      throw new FormulaError('Strings are only allowed inside part(...) / cabinet(...) / wall(...)', t.start, t.end)
    }
    if (t.type === 'ident') {
      // `and` / `or` are keywords, not value identifiers
      if (t.text === 'and' || t.text === 'or') {
        throw new FormulaError(`"${t.text}" is an operator and needs a value on both sides`, t.start, t.end)
      }
      next()
      // Lookup: part("name").field...
      if ((LOOKUP_FNS as readonly string[]).includes(t.text) && peek().type === 'lparen') {
        next() // (
        const nameTok = expect('str', `a quoted name, e.g. ${t.text}("...")`)
        const rp = expect('rparen', '")"')
        const fields = parseFieldChain()
        if (fields.length === 0) {
          throw new FormulaError(
            `${t.text}("${nameTok.text}") needs a field, e.g. ${t.text}("${nameTok.text}").${t.text === 'wall' ? 'length' : 'w'}`,
            t.start, rp.end,
          )
        }
        return {
          kind: 'lookup', fn: t.text as LookupFn, name: nameTok.text, fields,
          start: t.start, end: tokens[pos - 1].end,
        }
      }
      // Function call: ident(...)
      if (peek().type === 'lparen') {
        next() // (
        const args: FormulaNode[] = []
        if (peek().type !== 'rparen') {
          args.push(parseExpr())
          while (peek().type === 'comma') {
            next()
            args.push(parseExpr())
          }
        }
        const rp = expect('rparen', '")"')
        return { kind: 'call', name: t.text, args, start: t.start, end: rp.end }
      }
      // Dotted path: root.field.field...
      const fields = parseFieldChain()
      return { kind: 'path', root: t.text, fields, start: t.start, end: tokens[pos - 1].end }
    }
    throw new FormulaError(
      t.type === 'eof' ? 'Formula ended unexpectedly' : `Unexpected "${t.text}"`,
      t.start, t.end,
    )
  }

  function parseFieldChain(): string[] {
    const fields: string[] = []
    while (peek().type === 'dot') {
      next()
      const f = expect('ident', 'a field name after "."')
      fields.push(f.text)
    }
    return fields
  }

  const ast = parseExpr()
  const trailing = peek()
  if (trailing.type !== 'eof') {
    throw new FormulaError(`Unexpected "${trailing.text}" after the end of the formula`, trailing.start, trailing.end)
  }
  return ast
}
