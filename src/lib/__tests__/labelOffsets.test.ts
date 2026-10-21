import { describe, it, expect } from 'vitest'
import { withLabelOff, toFrame } from '../labelOffsets'

// Movable cabinet / fixture labels: per-view offsets, cleared to null when empty.
describe('label offsets', () => {
  it('sets one view, keeps the other, rounds to whole mm', () => {
    const a = withLabelOff(null, 'plan', { x: 10.4, y: -20.6 })
    expect(a).toEqual({ plan: { x: 10, y: -21 } })
    expect(withLabelOff(a, 'elev', { x: 0, y: 450 })).toEqual({ plan: { x: 10, y: -21 }, elev: { x: 0, y: 450 } })
  })

  it('reset clears that view, and null once nothing is left', () => {
    const both = { plan: { x: 1, y: 2 }, elev: { x: 3, y: 4 } }
    expect(withLabelOff(both, 'plan', null)).toEqual({ elev: { x: 3, y: 4 } })
    expect(withLabelOff({ plan: { x: 1, y: 2 } }, 'plan', null)).toBeNull()
  })

  it('a world drag maps into a turned item\'s own frame', () => {
    // Item turned 90°: its width runs down the screen (+y), its depth toward −x.
    const u = { x: 0, y: 1 }, v = { x: -1, y: 0 }
    expect(toFrame(0, 100, u, v)).toEqual({ x: 100, y: 0 })   // along the width
    expect(toFrame(-50, 0, u, v)).toEqual({ x: 0, y: 50 })    // toward the front
  })
})
