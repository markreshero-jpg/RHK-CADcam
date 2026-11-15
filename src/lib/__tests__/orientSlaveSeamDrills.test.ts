import { describe, it, expect } from 'vitest'
import { orientSlaveSeamDrills, type SeamDrill } from '../jointDrilling'

// RHK6468 WIR shoe shelves (Mark 2026-11-15): a fixed shelf tilted 15 deg front-down
// with the rotate override takes its joint with it — the holes in the gable follow
// the tilted shelf; the holes in the shelf's own end stay in its flat frame.
const box = { x: 16.5, y: 400, z: 0, w: 600, h: 16.5, d: 533.5 }
const drill = (targetPartKey: string, axis: SeamDrill['axis'], z: number): SeamDrill => ({
  x: targetPartKey === 'left_side' ? 16.5 : 16.5, y: 408.25, z, axis, radius: 2.5, depthLen: 12,
  targetPartKey, source: 'method', seamKey: 'int_fixed_shelf_3:left_side',
})

describe('orientSlaveSeamDrills', () => {
  it('moves the gable hole with a 15 deg tilted shelf and keeps the shelf hole flat', () => {
    const gable = drill('left_side', 'x-', 500)
    const shelf = drill('int_fixed_shelf_3', 'x+', 500)
    const [g, s] = orientSlaveSeamDrills([gable, shelf], { int_fixed_shelf_3: box }, { int_fixed_shelf_3: { ox: 0, oy: 0, oz: 0, oax: 15 } })
    const r = 15 * Math.PI / 180
    expect(g.y).toBeCloseTo(400 + 8.25 * Math.cos(r) - 500 * Math.sin(r), 6)
    expect(g.z).toBeCloseTo(8.25 * Math.sin(r) + 500 * Math.cos(r), 6)
    expect(g.axis).toBe('x-')
    expect(s).toBe(shelf)
  })
  it('passes drills through when there are no overrides', () => {
    const d = [drill('left_side', 'x-', 100)]
    expect(orientSlaveSeamDrills(d, { int_fixed_shelf_3: box }, null)).toBe(d)
  })
})
