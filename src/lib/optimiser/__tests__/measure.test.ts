import { describe, it, expect } from 'vitest'
import { snapPoint, rectLoop } from '../measure'

const src = {
  loops: [rectLoop(0, 0, 2400, 1200), rectLoop(100, 100, 560, 720)],
  holes: [{ x: 137, y: 132, diameter: 5 }, { x: 400, y: 300, diameter: 35 }],
}

describe('measure snapPoint', () => {
  it('hole centre beats a nearby corner', () => {
    expect(snapPoint(104, 104, { ...src, holes: [{ x: 106, y: 106, diameter: 5 }] }, 8)).toEqual({ x: 106, y: 106, kind: 'hole' })
  })
  it('anywhere inside a large hole snaps to its centre', () => {
    expect(snapPoint(412, 290, src, 5)).toEqual({ x: 400, y: 300, kind: 'hole' })
  })
  it('snaps to a part corner', () => {
    expect(snapPoint(663, 818, src, 6)).toEqual({ x: 660, y: 820, kind: 'corner' })
  })
  it('snaps onto an edge, perpendicular', () => {
    expect(snapPoint(103, 500, src, 6)).toEqual({ x: 100, y: 500, kind: 'line' })
  })
  it('free point when nothing in range', () => {
    expect(snapPoint(1500, 600, src, 6)).toEqual({ x: 1500, y: 600, kind: 'free' })
  })
})
