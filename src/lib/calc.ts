// Tiny safe arithmetic evaluator for measurement input fields.
//
// Lets the user type a sum into any numeric field — e.g. "600-300", "1200/2",
// "(900-18*2)" — and have it resolve to a single value on commit (blur / Enter
// / Tab). Supports + - * / and parentheses with unary minus, decimals, and
// whitespace. No identifiers, no functions, no `eval` — anything outside that
// grammar returns null so the caller can reject it.
//
// Grammar (recursive descent, standard precedence):
//   expr   = term  (('+' | '-') term)*
//   term   = factor (('*' | '/') factor)*
//   factor = ('+' | '-') factor | '(' expr ')' | number
//   number = digits ('.' digits?)? | '.' digits

export function evalCalc(input: string | null | undefined): number | null {
  if (input == null) return null
  const s = input.trim()
  if (s === '') return null

  let i = 0
  const len = s.length
  const skip = () => { while (i < len && s[i] === ' ') i++ }

  function parseExpr(): number | null {
    let left = parseTerm()
    if (left == null) return null
    for (;;) {
      skip()
      const op = s[i]
      if (op === '+' || op === '-') {
        i++
        const right = parseTerm()
        if (right == null) return null
        left = op === '+' ? left + right : left - right
      } else break
    }
    return left
  }

  function parseTerm(): number | null {
    let left = parseFactor()
    if (left == null) return null
    for (;;) {
      skip()
      const op = s[i]
      if (op === '*' || op === '/') {
        i++
        const right = parseFactor()
        if (right == null) return null
        if (op === '/') {
          if (right === 0) return null
          left = left / right
        } else {
          left = left * right
        }
      } else break
    }
    return left
  }

  function parseFactor(): number | null {
    skip()
    const c = s[i]
    if (c === '+') { i++; return parseFactor() }
    if (c === '-') { i++; const v = parseFactor(); return v == null ? null : -v }
    if (c === '(') {
      i++
      const v = parseExpr()
      if (v == null) return null
      skip()
      if (s[i] !== ')') return null
      i++
      return v
    }
    return parseNumber()
  }

  function parseNumber(): number | null {
    skip()
    const start = i
    while (i < len && s[i] >= '0' && s[i] <= '9') i++
    if (s[i] === '.') { i++; while (i < len && s[i] >= '0' && s[i] <= '9') i++ }
    if (i === start || (i === start + 1 && s[start] === '.')) return null // no digits
    const num = parseFloat(s.slice(start, i))
    return Number.isFinite(num) ? num : null
  }

  const result = parseExpr()
  skip()
  if (result == null || i !== len) return null // trailing garbage → reject
  return Number.isFinite(result) ? result : null
}
