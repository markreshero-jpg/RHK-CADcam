import { describe, it, expect } from 'vitest'
import { evalCustomPartFields, type CustomPartDims } from '../customParts'
import type { FormulaScope } from '../evaluate'

const LITERAL: CustomPartDims = { dx: 100, dy: 200, dz: 18, x: 0, y: 0, z: 0 }

const scope: FormulaScope = {
  roots: {
    cab: { w: 600, h: 720, d: 560, kick: 140 },
    r:   { TOEH: 140 },
    t:   { door: 18, exposed: 16, gable: 16 },
  },
  lookup: (fn, name) =>
    fn === 'part' && name === 'left_gable'
      ? { dy: 720, dx: 560, dz: 16, w: 16, h: 720, d: 560, x: 0, y: 0, z: 0, t: 16 }
      : undefined,
}

describe('evalCustomPartFields', () => {
  it('evaluates pre-M3 stored expressions unchanged (cab.*/t.*)', () => {
    const patch = evalCustomPartFields(LITERAL, { dx: 'cab.h', dy: 'cab.d + t.door + 2', dz: 't.door' }, scope)
    expect(patch).toEqual({ dx: 720, dy: 580 })  // dz already 18 → no write
  })

  it('reaches the M3 scope additions: rules, exposed thickness, part()', () => {
    const patch = evalCustomPartFields(LITERAL, {
      dx: 'cab.h + r.TOEH',           // kick height now visible
      dy: 'part("left_gable").dx',    // sibling part lookup, raw CV axis
      dz: 't.exposed',                // exposed-role thickness
    }, scope)
    expect(patch).toEqual({ dx: 860, dy: 560, dz: 16 })
  })

  it('returns only changed fields (write-back diff)', () => {
    expect(evalCustomPartFields(LITERAL, { dx: '100' }, scope)).toEqual({})
    expect(evalCustomPartFields(LITERAL, null, scope)).toEqual({})
    expect(evalCustomPartFields(LITERAL, { dx: '', dy: '   ' }, scope)).toEqual({})
  })

  it('keeps last good value on parse/eval errors', () => {
    expect(evalCustomPartFields(LITERAL, { dx: 'cab.h -', dy: 'cab.nope' }, scope)).toEqual({})
  })

  it('rejects non-positive sizes but allows zero/negative positions', () => {
    const patch = evalCustomPartFields(LITERAL, { dx: 'cab.h - 720', y: '0 - 50', z: 'cab.w - 600' }, scope)
    expect(patch).toEqual({ y: -50 })  // dx→0 rejected; z→0 equals literal, no write
  })

  it('supports engine functions (if / round-to-step)', () => {
    const patch = evalCustomPartFields(LITERAL, {
      dy: 'if(cab.h > 700, 300, 200)',
      dx: 'round(cab.h / 2, 32)',
    }, scope)
    expect(patch).toEqual({ dy: 300, dx: 352 })
  })
})
