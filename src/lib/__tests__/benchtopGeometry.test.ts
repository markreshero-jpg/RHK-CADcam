import { describe, it, expect } from 'vitest'
import {
  segmentsFromLegacy, deriveLegacy, btSegments, moveVertex, splitSegment, deleteVertex,
  toggleCurve, filletVertex, chamferVertex, offsetSegments, mapSegments, transformBenchtop,
  outwardNormal, outlineBounds, signedArea, outlinePoints, segMid, segLength,
  nearestOnOutline, lineHitOnOutline, effectiveProfileId, translateFn,
} from '../benchtopGeometry'
import type { BenchtopSegment } from '../types'

// 1000 × 600 rectangle, plan y-down, clockwise on screen.
const RECT = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }]
const rect = () => segmentsFromLegacy(RECT, [], [{ edge_index: 0, type: 'wall' }])
const closed = (segs: BenchtopSegment[]) =>
  segs.every((s, i) => { const n = segs[(i + 1) % segs.length]; return Math.hypot(s.p1.x - n.p0.x, s.p1.y - n.p0.y) < 1e-6 })
const area = (segs: BenchtopSegment[]) => Math.abs(signedArea(outlinePoints(segs, 64)))

describe('legacy ↔ segments', () => {
  it('builds a closed loop with wall tags by edge index', () => {
    const s = rect()
    expect(s).toHaveLength(4)
    expect(closed(s)).toBe(true)
    expect(s[0].edge?.wall).toBe(true)
    expect(s[1].edge?.wall).toBe(false)
  })

  it('round-trips a quadratic arc through the curve midpoint', () => {
    const s = segmentsFromLegacy(RECT, [{ edge_index: 1, cpx: 1200, cpy: 300 }])
    expect(s[1].type).toBe('curve')
    // quadratic Q(0.5) = (p0 + 2cp + p1) / 4 = (1000+2400+1000)/4 = 1100
    expect(segMid(s[1]).x).toBeCloseTo(1100, 6)
    const back = deriveLegacy(s)
    expect(back.arc_segments).toEqual([{ edge_index: 1, cpx: 1200, cpy: 300 }])
    expect(back.polygon).toEqual(RECT)
  })

  it('btSegments prefers stored segments, falls back to legacy columns', () => {
    const stored = rect()
    expect(btSegments({ segments: stored, polygon: [], arc_segments: [], edge_tags: [] })).toBe(stored)
    expect(btSegments({ segments: [], polygon: RECT, arc_segments: [], edge_tags: [] })).toHaveLength(4)
  })
})

describe('vertex / edge edits', () => {
  it('moveVertex moves both edges that meet there', () => {
    const s = moveVertex(rect(), 2, { x: 1100, y: 700 })
    expect(s[1].p1).toEqual({ x: 1100, y: 700 })
    expect(s[2].p0).toEqual({ x: 1100, y: 700 })
    expect(closed(s)).toBe(true)
  })

  it('splitSegment halves an edge and both halves keep the finish', () => {
    const s = splitSegment(rect(), 0)
    expect(s).toHaveLength(5)
    expect(s[0].p1).toEqual({ x: 500, y: 0 })
    expect(s[1].edge?.wall).toBe(true)
    expect(closed(s)).toBe(true)
  })

  it('splitSegment on a curve keeps the curve shape', () => {
    const c = toggleCurve(rect(), 1)
    const before = segLength(c[1])
    const s = splitSegment(c, 1)
    expect(segLength(s[1]) + segLength(s[2])).toBeCloseTo(before, 0)
    expect(closed(s)).toBe(true)
  })

  it('deleteVertex merges two edges into one straight edge', () => {
    const s = deleteVertex(splitSegment(rect(), 0), 1)
    expect(s).toHaveLength(4)
    expect(s[0]).toMatchObject({ type: 'line', p0: { x: 0, y: 0 }, p1: { x: 1000, y: 0 } })
    expect(closed(s)).toBe(true)
  })

  it('toggleCurve bulges outward, then straightens back', () => {
    const c = toggleCurve(rect(), 1)   // right edge, x = 1000
    expect(c[1].type).toBe('curve')
    expect(segMid(c[1]).x).toBeCloseTo(1000 + 600 * 0.25, 6)
    expect(toggleCurve(c, 1)[1].type).toBe('line')
  })

  it('outwardNormal points out of the shape for either winding', () => {
    expect(outwardNormal(rect(), 0)).toMatchObject({ x: 0, y: -1 })
    const ccw = mapSegments(rect(), p => p, true)   // reversed loop, same shape
    const top = ccw.findIndex(s => s.p0.y === 0 && s.p1.y === 0)
    expect(outwardNormal(ccw, top).y).toBeCloseTo(-1, 6)
  })
})

describe('corners', () => {
  it('fillet: true radius arc tangent to both edges', () => {
    const s = filletVertex(rect(), 2, 100)   // corner (1000, 600)
    expect(s).toHaveLength(5)
    expect(s[2]).toMatchObject({ type: 'arc', p0: { x: 1000, y: 500 }, p1: { x: 900, y: 600 }, rx: 100 })
    // Arc bulges toward the corner, not into the top: its midpoint is the 45° point.
    const m = segMid(s[2])
    expect(m.x).toBeCloseTo(900 + 100 * Math.SQRT1_2, 3)
    expect(m.y).toBeCloseTo(500 + 100 * Math.SQRT1_2, 3)
    expect(closed(s)).toBe(true)
  })

  it('fillet on the opposite winding still bulges the right way', () => {
    const ccw = mapSegments(rect(), p => p, true)
    const vi = ccw.findIndex(s => s.p0.x === 1000 && s.p0.y === 600)
    const s = filletVertex(ccw, vi, 100)
    const m = segMid(s[vi])
    expect(m.x).toBeCloseTo(900 + 100 * Math.SQRT1_2, 3)
    expect(m.y).toBeCloseTo(500 + 100 * Math.SQRT1_2, 3)
  })

  it('chamfer cuts d back along each edge', () => {
    const s = chamferVertex(rect(), 0, 50)
    expect(s[0]).toMatchObject({ type: 'line', p0: { x: 0, y: 50 }, p1: { x: 50, y: 0 } })
    expect(closed(s)).toBe(true)
  })

  it('a corner too tight for the radius is left alone', () => {
    const s = rect()
    expect(filletVertex(s, 0, 5000)).toBe(s)
  })
})

describe('offset + transforms', () => {
  it('offset grows a rectangle by the amount on every side', () => {
    const b = outlineBounds(offsetSegments(rect(), 20))!
    expect(b).toEqual({ minX: -20, minY: -20, maxX: 1020, maxY: 620 })
    const b2 = outlineBounds(offsetSegments(rect(), -20))!
    expect(b2).toEqual({ minX: 20, minY: 20, maxX: 980, maxY: 580 })
  })

  it('mirror keeps the area and the arc bulge direction', () => {
    const f = filletVertex(rect(), 2, 100)
    const m = mapSegments(f, p => ({ x: -p.x, y: p.y }), true)
    expect(closed(m)).toBe(true)
    expect(area(m)).toBeCloseTo(area(f), 0)
  })

  it('transformBenchtop carries joins and cutouts with the outline', () => {
    const moved = transformBenchtop({
      segments: rect(), polygon: [], arc_segments: [], edge_tags: [],
      joins: [{ p0: { x: 500, y: 0 }, p1: { x: 500, y: 600 }, type: 'butt' }],
      cutout_polygons: [[{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }]],
    }, translateFn(10, 20))
    expect(moved.joins[0].p0).toEqual({ x: 510, y: 20 })
    expect(moved.cutout_polygons[0][0]).toEqual({ x: 110, y: 120 })
    expect(moved.polygon[0]).toEqual({ x: 10, y: 20 })
    expect(moved.edge_tags).toEqual([{ edge_index: 0, type: 'wall' }])
  })
})

describe('joins + profiles', () => {
  it('nearestOnOutline snaps to the closest edge point', () => {
    const h = nearestOnOutline(rect(), { x: 400, y: 30 })!
    expect(h.pt).toEqual({ x: 400, y: 0 })
    expect(h.edge).toBe(0)
  })

  it('lineHitOnOutline finds the ortho crossing on the far edge', () => {
    const hit = lineHitOnOutline(rect(), { x: 400, y: 0 }, { x: 0, y: 1 }, { x: 410, y: 550 })
    expect(hit).toEqual({ x: 400, y: 600 })
  })

  it('effectiveProfileId: own → method default; wall edges none', () => {
    const [wall, plain] = rect()
    expect(effectiveProfileId(wall, 'def')).toBeNull()
    expect(effectiveProfileId(plain, 'def')).toBe('def')
    expect(effectiveProfileId({ ...plain, edge: { profile_id: 'own' } }, 'def')).toBe('own')
  })
})
