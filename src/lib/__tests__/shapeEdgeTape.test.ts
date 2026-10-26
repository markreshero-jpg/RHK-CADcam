import { describe, it, expect } from 'vitest'
import { outlineEdges, sampleOutline, type OutlinePt } from '../shapePath'
import { partShapes } from '../partSolids'
import type { ResolvedCabinet } from '../resolver/types'

// TC-08 (RHK6581 J05) shelf outline: angled back clipped off the right-hand end.
const shelf: OutlinePt[] = [
  { e: 'bottom', x: 0, y: 383.5 },
  { e: 'bottom', x: 338, y: 383.5 },
  { e: 'right', x: 763, y: 133.6 },
  { e: 'top', x: 763, y: 0 },
  { e: 'left', x: 0, y: 0 },
]

describe('outlineEdges', () => {
  it('keeps each line edge with its tag, both backs on bottom', () => {
    const ed = outlineEdges(shelf)
    expect(ed.map(e => e.e)).toEqual(['bottom', 'bottom', 'right', 'top', 'left'])
    expect(ed[1].pts).toEqual([{ x: 338, y: 383.5 }, { x: 763, y: 133.6 }])
  })

  it('samples an arc edge on the same side as sampleOutline', () => {
    const pts: OutlinePt[] = [{ x: 0, y: 0, b: 0.4, e: 'top' }, { x: 100, y: 0, e: 'right' }, { x: 100, y: 100, e: 'bottom' }, { x: 0, y: 100, e: 'left' }]
    const arc = outlineEdges(pts, 2)[0].pts
    expect(arc[0]).toEqual({ x: 0, y: 0 })
    expect(arc[arc.length - 1]).toEqual({ x: 100, y: 0 })
    const mid = arc[Math.floor(arc.length / 2)]
    const sampled = sampleOutline(pts, 2)
    const sMid = sampled.reduce((m, q) => (Math.abs(q.y) > Math.abs(m.y) && q.y * mid.y > 0 ? q : m), { x: 0, y: 0 })
    expect(Math.sign(mid.y)).toBe(Math.sign(sMid.y))
    expect(Math.abs(mid.y)).toBeCloseTo(Math.abs(sMid.y), 0)
  })
})

describe('partShapes edge tags', () => {
  it('tags resolver outlines and bevelled panel ends', () => {
    const rp = {
      case_parts: [
        { part_key: 'right_side', X: 779.5, Y: 0, Z: 247.3, DX: 152.7, DY: 2370, DZ: 16.5, AX: 0, AY: 0, AZ: 0, bevel_lo: -30.46, edge_band: {} },
      ],
      toekick_parts: [],
      internal_parts: [{ part_type: 'fixed_shelf', sort_order: 3, outline: shelf }],
      face_zones: [],
    } as unknown as ResolvedCabinet
    const m = partShapes(rp)
    expect(m.get('int_fixed_shelf_3')?.edges?.length).toBe(5)
    const side = m.get('case_right_side')!
    expect(side.extrude).toBe('up')
    expect(side.edges?.map(e => e.e)).toEqual(['right', 'left'])
    expect(side.caps).toEqual({ lo: 'bottom', hi: 'top' })
  })
})
