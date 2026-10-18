import { describe, it, expect } from 'vitest'
import { wrapLabel } from '../textWrap'

describe('wrapLabel', () => {
  it('keeps a short name on one line', () => {
    expect(wrapLabel('Sink', 600, 110)).toEqual(['Sink'])
  })

  it('wraps on spaces to the width (600 wide, 11 px label at zoom 0.1)', () => {
    const lines = wrapLabel('Generic dishwasher 600 freestanding', 540, 110)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join(' ')).toBe('Generic dishwasher 600 freestanding')
    expect(lines).toEqual(['Generic', 'dishwasher', '600', 'freestanding'])
    // wider at a closer zoom → fewer lines
    expect(wrapLabel('Generic dishwasher 600 freestanding', 540, 40)).toEqual(['Generic dishwasher 600', 'freestanding'])
  })

  it('never splits a word, even one wider than the item', () => {
    expect(wrapLabel('Refrigerator', 200, 100)).toEqual(['Refrigerator'])
  })
})
