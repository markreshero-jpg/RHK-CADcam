import { describe, it, expect } from 'vitest'
import type { BenchtopInstance, BenchtopEdgeProfile } from '../types'
import { quoteTops, quoteTotals, profilesText } from '../benchtopQuote'

const line = (x0: number, y0: number, x1: number, y1: number, edge?: object) =>
  ({ type: 'line' as const, p0: { x: x0, y: y0 }, p1: { x: x1, y: y1 }, edge })

// 3000 x 600 top: back edge on the wall, right end joins another top, front + left profiled.
const bt = {
  id: 'a', label: 'BT1', room_id: 'r',
  segments: [
    line(0, 0, 3000, 0, { wall: true }),
    line(3000, 0, 3000, 600, { joint: 'butt' }),
    line(3000, 600, 0, 600),
    line(0, 600, 0, 0, { profile_id: 'sq' }),
  ],
  cutout_polygons: [[{ x: 100, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 500 }, { x: 100, y: 500 }]],
  joins: [],
} as unknown as BenchtopInstance

const profiles = {
  pe: { id: 'pe', name: 'Pencil edge', code: 'PE', generates: null },
  sq: { id: 'sq', name: 'Square', code: 'SQ', generates: null },
} as unknown as Record<string, BenchtopEdgeProfile>

describe('benchtop quote', () => {
  it('area less cutouts, edges by profile, wall + joint lengths', () => {
    const [t] = quoteTops([bt], { profiles, defaultProfileId: () => 'pe', thickness: () => 20 })
    expect(t.area_m2).toBe(1.6)   // 1.8 − 0.2
    expect(t.profiles).toEqual({ PE: 3000, SQ: 600 })
    expect(t.wallMm).toBe(3000)
    expect(t.jointMm).toBe(600)
    expect(t.cutouts).toBe(1)
    expect(profilesText(t.profiles)).toBe('PE 3.00 · SQ 0.60')
    expect(quoteTotals([t, t]).profiles).toEqual([{ code: 'PE', mm: 6000 }, { code: 'SQ', mm: 1200 }])
  })
})
