import { describe, it, expect } from 'vitest'
import {
  cadSnap, addOutline, segIntersection, perpFoot, closestOnSeg, normaliseCadSnap,
  DEFAULT_CAD_SNAP, type SnapGeometry,
} from '../annotations/cadSnap'

function geo(): SnapGeometry {
  const g: SnapGeometry = { segs: [], points: [] }
  addOutline(g, [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 580 }, { x: 0, y: 580 }], 'cabinets', true, undefined, true)
  return g
}
const S = DEFAULT_CAD_SNAP

describe('cadSnap', () => {
  it('snaps to a corner over the edge it sits on', () => {
    expect(cadSnap({ x: 8, y: 3 }, geo(), S, 20)).toEqual({ pt: { x: 0, y: 0 }, kind: 'end' })
  })
  it('midpoint, centre, then nearest-on-edge', () => {
    expect(cadSnap({ x: 305, y: 4 }, geo(), S, 20).kind).toBe('mid')
    expect(cadSnap({ x: 298, y: 292 }, geo(), S, 20)).toEqual({ pt: { x: 300, y: 290 }, kind: 'centre' })
    expect(cadSnap({ x: 150, y: 6 }, geo(), S, 20)).toEqual({ pt: { x: 150, y: 0 }, kind: 'nearest' })
  })
  it('perpendicular from the previous point', () => {
    const r = cadSnap({ x: 200, y: 10 }, geo(), { ...S, kinds: { ...S.kinds, nearest: false } }, 20, { x: 210, y: -400 })
    expect(r).toEqual({ pt: { x: 210, y: 0 }, kind: 'perpendicular' })
  })
  it('intersections of nearby edges', () => {
    const g: SnapGeometry = { segs: [], points: [] }
    addOutline(g, [{ x: -100, y: 0 }, { x: 100, y: 0 }], 'annotations', false)
    addOutline(g, [{ x: 0, y: -100 }, { x: 0, y: 100 }], 'walls', false)
    expect(cadSnap({ x: 5, y: 5 }, g, S, 20)).toEqual({ pt: { x: 0, y: 0 }, kind: 'intersection' })
  })
  it('honours off switches, sources and exclusions', () => {
    expect(cadSnap({ x: 8, y: 3 }, geo(), { ...S, enabled: false }, 20).kind).toBeNull()
    expect(cadSnap({ x: 8, y: 3 }, geo(), { ...S, sources: { ...S.sources, cabinets: false } }, 20).kind).toBeNull()
    const g: SnapGeometry = { segs: [], points: [] }
    addOutline(g, [{ x: 0, y: 0 }, { x: 100, y: 0 }], 'annotations', false, 'me')
    expect(cadSnap({ x: 2, y: 2 }, g, S, 20, null, new Set(['me'])).kind).toBeNull()
  })
  it('nothing in reach returns the cursor', () => {
    expect(cadSnap({ x: 1000, y: 1000 }, geo(), S, 20)).toEqual({ pt: { x: 1000, y: 1000 }, kind: null })
  })
})

describe('helpers', () => {
  it('segment maths', () => {
    expect(segIntersection({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toEqual({ x: 5, y: 5 })
    expect(segIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBeNull()
    expect(perpFoot({ x: 5, y: 9 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 5, y: 0 })
    expect(perpFoot({ x: 15, y: 9 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeNull()
    expect(closestOnSeg({ x: 15, y: 9 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 10, y: 0 })
  })
  it('normalises stored settings over defaults', () => {
    const n = normaliseCadSnap({ kinds: { mid: false } })
    expect(n.kinds.mid).toBe(false)
    expect(n.kinds.end).toBe(true)
    expect(n.sources.fronts).toBe(true)
  })
})

import { planSnapGeometry } from '../annotations/planSnapGeometry'
import type { RoomFixture, RoomAnnotation } from '../types'

describe('planSnapGeometry', () => {
  it('collects fixtures and notes, tagged by source and owner', () => {
    const fx = { x: 0, y: 0, rotation: 0, width: 600, depth: 600 } as RoomFixture
    const note = { id: 'n1', kind: 'line', geom: { pts: [{ x: 0, y: 1000 }, { x: 500, y: 1000 }] }, style: {}, text: null } as unknown as RoomAnnotation
    const g = planSnapGeometry({ walls: [], cabinets: [], fixtures: [fx], benchtops: [], annotations: [note], paperToFrame: 20 })
    expect(g.points.filter(p => p.src === 'fixtures' && p.kind === 'centre')).toEqual([{ p: { x: 300, y: 300 }, kind: 'centre', src: 'fixtures', owner: undefined }])
    expect(g.segs.filter(s => s.owner === 'n1')).toHaveLength(1)
    expect(cadSnap({ x: 251, y: 1004 }, g, DEFAULT_CAD_SNAP, 20).kind).toBe('mid')
  })
})
