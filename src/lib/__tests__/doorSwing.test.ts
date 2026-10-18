import { describe, it, expect } from 'vitest'
import type { RoomFixture } from '../types'
import { doorSwingPolygon, pointInPolygon } from '../fixtureGeometry'

// 820 door in a 100 thick wall along +x; inside face at y = 100 (front = +y).
const door = (o: Partial<RoomFixture> = {}) => ({
  x: 1000, y: 0, rotation: 0, width: 820, depth: 100, category: 'opening', kind: 'Door',
  hinge_side: 'left', swing: 'in', ...o,
}) as RoomFixture

describe('door swing area', () => {
  it('swing in, hinge left: quarter disc inside the room off the left jamb', () => {
    const p = doorSwingPolygon(door())!
    expect(pointInPolygon(p, { x: 1200, y: 400 })).toBe(true)    // in front, near the hinge
    expect(pointInPolygon(p, { x: 1700, y: 800 })).toBe(false)   // past the arc
    expect(pointInPolygon(p, { x: 1200, y: 50 })).toBe(false)    // in the wall
  })
  it('swing out flips it outside the wall', () => {
    const p = doorSwingPolygon(door({ swing: 'out' }))!
    expect(pointInPolygon(p, { x: 1200, y: -300 })).toBe(true)
    expect(pointInPolygon(p, { x: 1200, y: 400 })).toBe(false)
  })
  it('windows and sliding doors have none', () => {
    expect(doorSwingPolygon(door({ kind: 'Window' }))).toBeNull()
    expect(doorSwingPolygon(door({ kind: 'Sliding door' }))).toBeNull()
  })
})
