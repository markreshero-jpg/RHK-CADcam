import { describe, it, expect } from 'vitest'
import { slideToFreeSlot, findFreeSlot } from '../geometry'

describe('slideToFreeSlot', () => {
  it('butts against the neighbour when dragged into it across a small gap', () => {
    // Positions with float noise, as produced by projecting onto an angled wall.
    const dx = 601.3
    const origT = 1000.1 + 1e-9
    const neighbour = { t: origT + dx + 22, dx: 450 }
    // Drag 30mm right → overlaps the neighbour by 8mm.
    const t = slideToFreeSlot(origT + 30, dx, 5000, [neighbour], origT)
    expect(t).toBeCloseTo(neighbour.t - dx, 6)
  })

  it('finds the flush slot for any float position', () => {
    for (let i = 0; i < 2000; i++) {
      const dx = 300 + Math.random() * 600
      const origT = 500 + Math.random() * 2000
      const neighbour = { t: origT + dx + 22, dx: 600 }
      const t = slideToFreeSlot(origT + 30, dx, 6000, [neighbour], origT)
      expect(t).toBeCloseTo(neighbour.t - dx, 6)
    }
  })
})

describe('findFreeSlot', () => {
  it('treats a flush neighbour as non-overlapping', () => {
    const dx = 601.3
    const o = { t: 1234.5678, dx: 450 }
    expect(findFreeSlot(o.t - dx, dx, 5000, [o])).toBeCloseTo(o.t - dx, 6)
  })
})
