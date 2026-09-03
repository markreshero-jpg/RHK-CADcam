// ============================================================
// Post-export validator (spec §5 of the post-processor handoff).
//
// Runs on every posted program BEFORE it is written or offered for download.
// Pure and framework-free: no DB, no React, callable from a script or a test.
//
// CALIBRATION RULE — the gold reference (R980101N.anc, PlanIt output, verified
// running on the Anderson EVO49) must always validate with ZERO errors. If a
// check flags a file the controller demonstrably accepts, the check is wrong,
// not the file. Two checks are narrower than the original spec for exactly
// that reason; see V4 and V8.
// ============================================================

export type Severity = 'error' | 'warning'

export interface Finding {
  check: string        // 'V1' … 'V10'
  severity: Severity
  line: number         // 1-indexed; 0 = whole file
  text: string         // the offending line, trimmed
  message: string
}

export interface ValidateOptions {
  /** Comment content limit (V10). Matches the profile's max_comment_length. */
  maxCommentLength?: number
  /** Plausible drill-cycle feed band (V9), mm/min. */
  drillFeedMin?: number
  drillFeedMax?: number
}

const DEFAULTS = { maxCommentLength: 80, drillFeedMin: 500, drillFeedMax: 6000 }

// Canned cycle openers / cancel / group-01 motion. Kept in step with modalize().
const CYCLE_OPEN = /\bG(?:7[346]|8[1-9])\b/
const CYCLE_CANCEL = /\bG80\b/
const GROUP_01 = /\bG0*[0-3]\b/

/** Strip comments so code-level checks never trip over comment text. */
function codeOf(line: string): string {
  let out = '', depth = 0
  for (const ch of line) {
    if (ch === '(') { depth++; continue }
    if (ch === ')') { if (depth > 0) depth--; continue }
    if (depth === 0) out += ch
  }
  return out
}

export function validateGcode(program: string, opts: ValidateOptions = {}): Finding[] {
  const o = { ...DEFAULTS, ...opts }
  const findings: Finding[] = []
  const add = (check: string, severity: Severity, line: number, text: string, message: string) =>
    findings.push({ check, severity, line, text: text.trim(), message })

  // ── V3. BOM ────────────────────────────────────────────────────────────────
  if (program.charCodeAt(0) === 0xfeff) {
    add('V3', 'error', 1, '', 'File begins with a UTF-8 byte-order mark. The controller reads it as part of the first block.')
  }

  // ── V2. Line terminators ──────────────────────────────────────────────────
  // Split on ANY terminator, keeping each one, rather than on CRLF alone. A
  // file with the wrong endings would otherwise collapse to a single "line"
  // and blind every other check — the failing program is LF-only, and the
  // whole point is to report its G0-in-cycle and bracket defects as well.
  const parts = program.split(/(\r\n|\r|\n)/)
  const lines: string[] = []
  const terminators: string[] = []
  for (let i = 0; i < parts.length; i += 2) {
    lines.push(parts[i])
    terminators.push(parts[i + 1] ?? '')
  }
  terminators.forEach((t, i) => {
    if (t === '' || t === '\r\n') return
    const kind = t === '\n' ? 'Bare LF' : 'Bare CR'
    add('V2', 'error', i + 1, lines[i], `${kind} line ending. The controller needs CRLF and will otherwise read the program as a single block.`)
  })

  // ── V1. 7-bit ASCII ───────────────────────────────────────────────────────
  lines.forEach((l, i) => {
    for (const ch of l) {
      const code = ch.codePointAt(0)!
      if (code > 127) {
        add('V1', 'error', i + 1, l, `Non-ASCII character ${JSON.stringify(ch)} (U+${code.toString(16).toUpperCase().padStart(4, '0')}). The controller reads raw bytes and a multi-byte character is illegal input.`)
        break   // one finding per line is enough to act on
      }
    }
  })

  // ── V4. Comment delimiters ────────────────────────────────────────────────
  // NARROWER THAN SPEC, deliberately. Counting brackets gets this exactly
  // backwards: the gold reference ships "(JOB NUMBER (1491.5)" — unbalanced,
  // an extra OPENING bracket — and runs fine, while the program that crashed
  // the machine was bracket-BALANCED:
  //   (Drilling - 3 gang group(s) over 1 band(s) of 400.mm, ...)
  // 3 opens, 3 closes, but wrongly nested: the comment closes after "group(s",
  // " over 1 band" is parsed as code, and the final ')' is a stray close.
  // Comments do not nest, so the fatal condition is a ')' seen while NOT
  // already inside a comment — that is what leaks code onto the line.
  lines.forEach((l, i) => {
    let inComment = false
    for (let k = 0; k < l.length; k++) {
      const ch = l[k]
      if (ch === '(') { inComment = true; continue }   // '(' inside a comment: tolerated, see above
      if (ch === ')') {
        if (!inComment) {
          add('V4', 'error', i + 1, l, `Stray ')' at column ${k + 1}. A comment closed early and the rest of the line is being parsed as code.`)
          break
        }
        inComment = false
      }
    }
    if (inComment) add('V4', 'error', i + 1, l, 'Unterminated comment — no closing bracket before end of line.')
  })

  // ── V5 / V6. Canned cycles ────────────────────────────────────────────────
  let cycleOpenAt = 0
  lines.forEach((l, i) => {
    const code = codeOf(l)
    if (cycleOpenAt) {
      if (GROUP_01.test(code)) {
        add('V5', 'error', i + 1, l, `Group-01 motion inside the canned cycle opened on line ${cycleOpenAt}. This cancels the cycle: every following repeat hole becomes a rapid to hole depth with a stationary drill.`)
        cycleOpenAt = 0   // resync so one defect does not cascade
        return
      }
      if (CYCLE_CANCEL.test(code)) cycleOpenAt = 0
      return
    }
    if (CYCLE_OPEN.test(code)) cycleOpenAt = i + 1
  })
  if (cycleOpenAt) {
    add('V6', 'error', cycleOpenAt, lines[cycleOpenAt - 1] ?? '', 'Canned cycle opened here is never cancelled with G80.')
  }

  // ── V7. Malformed numbers in code words ───────────────────────────────────
  // Comments are excluded: "(DIAMETER: 5..)" is a cosmetic defect, not a
  // motion hazard, and is handled separately.
  lines.forEach((l, i) => {
    const code = codeOf(l)
    for (const m of code.matchAll(/[A-Za-z][-+]?[\d.]*/g)) {
      const tok = m[0], val = tok.slice(1)
      if (!val) continue
      if ((val.match(/\./g) ?? []).length > 1) {
        add('V7', 'error', i + 1, l, `Malformed number "${tok}" — more than one decimal point.`)
      } else if (/^[-+]?\.$/.test(val)) {
        add('V7', 'error', i + 1, l, `Malformed number "${tok}" — a bare decimal point with no digits.`)
      }
    }
  })

  // ── V8. Program wrapper ───────────────────────────────────────────────────
  // NARROWER THAN SPEC. The '%' tape wrapper is an Anderson/Fanuc convention
  // carried by the machine profile's header/footer templates; a profile with no
  // template emits a valid program with no '%' at all. Requiring it outright
  // would block export for every other machine. So this is a SELF-CONSISTENCY
  // check — a program that opens with '%' must close properly — plus an
  // unconditional end-of-program code.
  const body = lines.filter(l => l.trim().length > 0)
  if (body.length === 0) {
    add('V8', 'error', 0, '', 'Program is empty.')
  } else {
    if (body[0].trim() === '%') {
      if (body[body.length - 1].trim() !== '%') {
        add('V8', 'error', lines.length, body[body.length - 1], "Program opens with '%' but does not close with one.")
      } else if (!/^M0*(30|2)\b/.test(body[body.length - 2]?.trim() ?? '')) {
        add('V8', 'error', lines.length - 1, body[body.length - 2] ?? '', "Program closes with '%' but the preceding block is not an end-of-program code (M30/M02).")
      }
    }
    if (!body.some(l => /\bM0*(30|2)\b/.test(codeOf(l)))) {
      add('V8', 'error', 0, '', 'No end-of-program code (M30/M02) anywhere in the program.')
    }
  }

  // ── V9. Drill-cycle feed sanity (warning) ─────────────────────────────────
  lines.forEach((l, i) => {
    const code = codeOf(l)
    if (!CYCLE_OPEN.test(code)) return
    const f = code.match(/\bF([\d.]+)/)
    if (!f) return
    const feed = Number(f[1])
    if (!Number.isFinite(feed)) return
    if (feed > o.drillFeedMax) {
      add('V9', 'warning', i + 1, l, `Drill cycle feed F${f[1]} is above the expected maximum (${o.drillFeedMax}). A routing feed applied to a drill block is the usual cause.`)
    } else if (feed < o.drillFeedMin) {
      add('V9', 'warning', i + 1, l, `Drill cycle feed F${f[1]} is below the expected minimum (${o.drillFeedMin}).`)
    }
  })

  // ── V10. Comment length (warning) ─────────────────────────────────────────
  lines.forEach((l, i) => {
    for (const m of l.matchAll(/\(([^)]*)\)/g)) {
      if (m[1].length > o.maxCommentLength) {
        add('V10', 'warning', i + 1, l, `Comment is ${m[1].length} characters; the configured limit is ${o.maxCommentLength}.`)
      }
    }
  })

  return findings
}

export const errorsOf = (f: Finding[]) => f.filter(x => x.severity === 'error')
export const warningsOf = (f: Finding[]) => f.filter(x => x.severity === 'warning')

/** One-line rendering for logs and UI. */
export function formatFinding(f: Finding): string {
  const where = f.line > 0 ? ` line ${f.line}` : ''
  const text = f.text ? `  |  ${f.text}` : ''
  return `[${f.check}]${where}: ${f.message}${text}`
}
