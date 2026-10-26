import { describe, it, expect } from 'vitest'
import { shapedFrontMarks, benchReach, drawerLineOffset } from '../planSwings'
import type { ResolvedFaceZone } from '../../resolver/types'

const zone = (o: Partial<ResolvedFaceZone>): ResolvedFaceZone => ({
  row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'left',
  X: 0, Y: 0, Z: 0, DX: 400, DY: 700, DZ: 18, AX: 0, AY: 0, AZ: 0,
  material_id: 'm', edge_band: { top: false, bottom: false, left: false, right: false },
  ...o,
} as ResolvedFaceZone)

describe('shaped plan swings', () => {
  it('a square front swings from its front face, opening outward', () => {
    const { swings } = shapedFrontMarks([zone({ X: 2, Z: 580 })])
    const s = swings[0]
    expect(s.hinge).toEqual({ x: 2, z: 598 })
    expect(s.free.x).toBeCloseTo(402, 6)
    expect(s.r).toBeCloseTo(400, 6)
    expect(s.end.z).toBeGreaterThan(598)   // opened toward the room
  })

  it('a turned facet door swings along its facet', () => {
    const { swings } = shapedFrontMarks([zone({ facet: 'facet', hinge_side: 'right', X: 600, Z: 580, AY: 45 })])
    const s = swings[0]
    // Free end is to the left of the hinge along the 45° facet; the leaf is DX long.
    expect(Math.hypot(s.free.x - s.hinge.x, s.free.z - s.hinge.z)).toBeCloseTo(400, 6)
    expect(Math.abs(s.free.x - s.hinge.x)).toBeCloseTo(Math.abs(s.free.z - s.hinge.z), 6)
  })

  it('stacked drawers on a facet step out one by one; one swing per column', () => {
    const z = [
      zone({ face_type: 'drawer_face', hinge_side: undefined, row_index: 1 }),
      zone({ face_type: 'drawer_face', hinge_side: undefined, row_index: 0 }),
      zone({ row_index: 0, col_index: 1 }), zone({ row_index: 1, col_index: 1 }),
    ]
    const m = shapedFrontMarks(z)
    expect(m.drawers.map(d => d.step)).toEqual([1, 2])
    expect(m.swings.length).toBe(1)
  })
})

describe('benchReach', () => {
  // Top 0..1200 along the wall, 0..640 deep (y down = toward the room); cabinet front at y 580.
  const top = [{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 640 }, { x: 0, y: 640 }]
  const out = { x: 0, y: 1 }
  it('measures the overhang past the front', () => {
    expect(benchReach([top], { x: 100, y: 580 }, { x: 700, y: 580 }, out)).toBeCloseTo(60)
  })
  it('is 0 with no top over the front', () => {
    expect(benchReach([top], { x: 1300, y: 580 }, { x: 1900, y: 580 }, out)).toBe(0)
    expect(benchReach([], { x: 100, y: 580 }, { x: 700, y: 580 }, out)).toBe(0)
  })
  it('pushes the drawer lines out past it', () => {
    expect(drawerLineOffset(1, 600, 60).off).toBe(100)
  })
})
