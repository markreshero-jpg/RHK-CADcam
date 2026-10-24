import { describe, it, expect } from 'vitest'
import { mergeRules, rulesForClass } from '../mergeRules'
import { DEFAULT_RULES } from '../types'

describe('rulesForClass (job / room per-class rule overrides)', () => {
  const ro = { REVT: 3, TOEH: 120, BY_CLASS: { wall: { REVT: 0, REVB: 2 } } }

  it('class values win over the flat ones at the same level', () => {
    expect(rulesForClass(ro, 'wall')).toEqual({ REVT: 0, REVB: 2, TOEH: 120 })
    expect(rulesForClass(ro, 'base')).toEqual({ REVT: 3, TOEH: 120 })
  })

  it('never leaks BY_CLASS into the merged rules', () => {
    expect('BY_CLASS' in mergeRules(DEFAULT_RULES, rulesForClass(ro, 'tall'))).toBe(false)
  })

  it('a room flat value beats the job class value', () => {
    const job  = rulesForClass(ro, 'wall')
    const room = rulesForClass({ REVT: 5 }, 'wall')
    expect(mergeRules(DEFAULT_RULES, { REVT: 4 }, job, room).REVT).toBe(5)
    expect(mergeRules(DEFAULT_RULES, { REVT: 4 }, job).REVT).toBe(0)
  })

  it('handles missing overrides', () => {
    expect(rulesForClass(null, 'base')).toEqual({})
  })
})
