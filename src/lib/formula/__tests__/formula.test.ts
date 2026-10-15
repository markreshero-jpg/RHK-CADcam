import { describe, it, expect } from 'vitest'
import { parse, FormulaError } from '../parser'
import { evaluate, type FormulaScope, type ScopeValue } from '../evaluate'
import { extractDeps } from '../deps'
import { classifyFieldInput, evaluateFormula, parseFormula } from '../index'

// Minimal hand-built scope for evaluator tests (context.ts is exercised
// separately — here we only need the shape).
const scope: FormulaScope = {
  roots: {
    cab: { w: 600, h: 720, d: 560, kick: 150 },
    r: { TOEH: 150, SCRT: 0, REVL: 1.5 },
    t: { gable: 16, door: 18, back: 16 },
    room: { cab_depth: 570, height: 2400 },
  },
  lookup: (fn, name): ScopeValue | undefined => {
    if (fn === 'part') {
      if (name === 'left_gable' || name === 'case_left_side') {
        return { w: 560, h: 570, d: 560, x: 0, y: 150, z: 0, t: 16 }
      }
      return undefined
    }
    if (fn === 'wall') {
      if (name === '1') return { length: 3600, height: 2400, thickness: 90 }
      return undefined
    }
    if (fn === 'cabinet') {
      if (name === 'B01') return { w: 450, h: 720, d: 560 }
      return undefined
    }
    return undefined
  },
}

const evalSrc = (src: string) => evaluate(parse(src), scope)

describe('parser + evaluator: arithmetic', () => {
  it('numbers and basic ops', () => {
    expect(evalSrc('600')).toBe(600)
    expect(evalSrc('19.5')).toBe(19.5)
    expect(evalSrc('2 + 3 * 4')).toBe(14)
    expect(evalSrc('(2 + 3) * 4')).toBe(20)
    expect(evalSrc('10 - 2 - 3')).toBe(5)          // left assoc
    expect(evalSrc('100 / 5 / 2')).toBe(10)         // left assoc
    expect(evalSrc('-5 + 10')).toBe(5)
    expect(evalSrc('--5')).toBe(5)
    expect(evalSrc('.5 * 4')).toBe(2)
  })

  it('division by zero errors with the divisor span', () => {
    expect(() => evalSrc('10 / 0')).toThrowError(FormulaError)
    try {
      evalSrc('10 / (3 - 3)')
    } catch (e) {
      const err = e as FormulaError
      expect(err.message).toMatch(/zero/i)
      expect(err.start).toBeGreaterThan(0)
    }
  })
})

describe('paths', () => {
  it('resolves scope paths', () => {
    expect(evalSrc('cab.h')).toBe(720)
    expect(evalSrc('cab.h - 100')).toBe(620)
    expect(evalSrc('cab.h - r.TOEH - t.gable')).toBe(554)
    expect(evalSrc('room.cab_depth + 20')).toBe(590)
  })

  it('unknown root / field give helpful errors', () => {
    expect(() => evalSrc('bogus.x')).toThrowError(/Unknown name "bogus"/)
    expect(() => evalSrc('cab.zz')).toThrowError(/cab has no field "zz"/)
    expect(() => evalSrc('cab.h.x')).toThrowError(/is a number/)
    expect(() => evalSrc('cab + 1')).toThrowError(/object, not a number/)
  })
})

describe('lookups', () => {
  it('part / wall / cabinet lookups', () => {
    expect(evalSrc('part("left_gable").h')).toBe(570)
    expect(evalSrc("part('left_gable').t")).toBe(16)
    expect(evalSrc('wall("1").length')).toBe(3600)
    expect(evalSrc('cabinet("B01").w')).toBe(450)
    expect(evalSrc('cab.w - 2 * part("left_gable").t')).toBe(568)
  })

  it('unknown names error clearly', () => {
    expect(() => evalSrc('part("nope").w')).toThrowError(/No part named "nope"/)
    expect(() => evalSrc('wall("9").length')).toThrowError(/No wall named "9"/)
  })

  it('lookup without a field is a parse error', () => {
    expect(() => parse('part("left_gable") + 1')).toThrowError(/needs a field/)
  })

  it('lookups unavailable in scope error clearly', () => {
    expect(() => evaluate(parse('part("x").w'), { roots: {} }))
      .toThrowError(/not available here/)
  })
})

describe('comparisons, and/or, if()', () => {
  it('comparisons return 1/0', () => {
    expect(evalSrc('720 > 900')).toBe(0)
    expect(evalSrc('cab.h >= 720')).toBe(1)
    expect(evalSrc('1 = 1')).toBe(1)
    expect(evalSrc('1 == 1')).toBe(1)
    expect(evalSrc('1 != 2')).toBe(1)
    expect(evalSrc('0.1 + 0.2 = 0.3')).toBe(1)     // epsilon equality
  })

  it('and/or with short-circuit', () => {
    expect(evalSrc('1 and 1')).toBe(1)
    expect(evalSrc('1 and 0')).toBe(0)
    expect(evalSrc('0 or 1')).toBe(1)
    expect(evalSrc('cab.h > 700 and cab.w < 900')).toBe(1)
    // short-circuit: RHS would divide by zero but is never evaluated
    expect(evalSrc('0 and 1 / 0')).toBe(0)
    expect(evalSrc('1 or 1 / 0')).toBe(1)
  })

  it('case() — pairs top-down with required default', () => {
    const ladder = 'case(cab.h <= 900, 2, cab.h <= 1600, 3, cab.h <= 2000, 4, 5)'
    expect(evalSrc(ladder)).toBe(2)                       // cab.h = 720 → first rung
    expect(evalSrc('case(cab.h <= 700, 2, cab.h <= 1600, 3, 5)')).toBe(3)
    expect(evalSrc('case(0, 1, 0, 2, 99)')).toBe(99)      // falls through to default
    expect(evalSrc('case(1, 7, 1 / 0, 8, 9)')).toBe(7)    // lazy: later args never evaluated
    expect(() => evalSrc('case(1, 2, 3, 4)')).toThrowError(/odd number/)
    expect(() => evalSrc('case(1, 2)')).toThrowError(/takes at least 3/)
  })

  it('if()', () => {
    expect(evalSrc('if(cab.h > 900, 3, 2)')).toBe(2)
    expect(evalSrc('if(cab.h > 700, cab.h - 100, cab.h)')).toBe(620)
    expect(() => evalSrc('if(1, 2)')).toThrowError(/takes 3/)
  })
})

describe('functions', () => {
  it('min/max/abs/round/floor/ceil', () => {
    expect(evalSrc('min(3, 1, 2)')).toBe(1)
    expect(evalSrc('max(cab.d - 50, 300)')).toBe(510)
    expect(evalSrc('abs(-7)')).toBe(7)
    expect(evalSrc('round(10.6)')).toBe(11)
    expect(evalSrc('floor(10.6)')).toBe(10)
    expect(evalSrc('ceil(10.2)')).toBe(11)
  })

  it('round/floor/ceil with a step (32mm system)', () => {
    expect(evalSrc('round(700, 32)')).toBe(704)
    expect(evalSrc('floor(700, 32)')).toBe(672)
    expect(evalSrc('ceil(673, 32)')).toBe(704)
    expect(() => evalSrc('round(700, 0)')).toThrowError(/step must be positive/)
  })

  it('unknown function lists available ones', () => {
    expect(() => evalSrc('log(4)')).toThrowError(/Unknown function "log".*min/)
  })
})

describe('parse errors carry positions', () => {
  it.each([
    ['cab.h -', /ended unexpectedly/],
    ['cab..h', /field name/],
    ['(1 + 2', /Expected "\)"/],
    ['1 2', /Unexpected "2" after the end/],
    ['part(left_gable).w', /quoted name/],
    ['"loose string"', /only allowed inside/],
    ['1 + #', /Unexpected character/],
    ['part("x"', /Expected "\)"/],
  ])('%s', (src, msg) => {
    expect(() => parse(src)).toThrowError(msg)
  })

  it('spans point into the source', () => {
    const r = parseFormula('cab.h + bogus')
    expect(r.ok).toBe(true) // parses fine; error is at eval
    const ev = evaluateFormula('cab.h + bogus.x', scope)
    expect(ev.ok).toBe(false)
    if (!ev.ok) {
      expect('cab.h + bogus.x'.slice(ev.error.start, ev.error.end)).toBe('bogus.x')
    }
  })
})

describe('dependency extraction', () => {
  it('collects paths and lookups, deduped + sorted', () => {
    const deps = extractDeps(parse('cab.h - r.TOEH - t.gable + cab.h'))
    expect(deps.map(d => d.key)).toEqual(['cab.h', 'r.TOEH', 't.gable'])
  })

  it('lookup deps carry fn + name', () => {
    const deps = extractDeps(parse('cab.w - 2 * part("left_gable").t + wall("1").length'))
    expect(deps.map(d => d.key)).toEqual(['cab.w', 'part("left_gable").t', 'wall("1").length'])
    const part = deps.find(d => d.root === 'part')!
    expect(part.name).toBe('left_gable')
    expect(part.fields).toEqual(['t'])
  })

  it('pure arithmetic has no deps', () => {
    expect(extractDeps(parse('round(600 / 2) - 9'))).toEqual([])
  })
})

describe('classifyFieldInput', () => {
  it('empty', () => {
    expect(classifyFieldInput('')).toEqual({ kind: 'empty' })
    expect(classifyFieldInput('   ')).toEqual({ kind: 'empty' })
    expect(classifyFieldInput(null)).toEqual({ kind: 'empty' })
  })

  it('literals collapse (incl. pure-arithmetic functions)', () => {
    expect(classifyFieldInput('450')).toEqual({ kind: 'literal', value: 450 })
    expect(classifyFieldInput('600/2 - 9')).toEqual({ kind: 'literal', value: 291 })
    expect(classifyFieldInput('round(100.4)')).toEqual({ kind: 'literal', value: 100 })
  })

  it('variable expressions stay formulas with deps', () => {
    const r = classifyFieldInput('cab.h - 100')
    expect(r.kind).toBe('formula')
    if (r.kind === 'formula') {
      expect(r.source).toBe('cab.h - 100')
      expect(r.deps.map(d => d.key)).toEqual(['cab.h'])
    }
  })

  it('invalid input reports the issue', () => {
    const r = classifyFieldInput('cab.h -')
    expect(r.kind).toBe('invalid')
    if (r.kind === 'invalid') expect(r.error.message).toMatch(/ended unexpectedly/)
  })
})
