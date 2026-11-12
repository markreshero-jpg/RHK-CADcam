import { describe, it, expect } from 'vitest'
import { eraseGeom, ellipsePoly } from '../annotations/erase'
import { bulgeMid, sampleBulged, arcPoint, type LineGeom, type ArcGeom, type CloudGeom } from '../annotations/geometry'

const close = (a: { x: number; y: number }, b: { x: number; y: number }, d = 6) => {
  expect(a.x).toBeCloseTo(b.x, d); expect(a.y).toBeCloseTo(b.y, d)
}

describe('eraseGeom (ER1)', () => {
  it('misses: null', () => {
    expect(eraseGeom('line', { pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, [{ x: 50, y: 50 }], 10)).toBeNull()
  })
  it('text and dims are not cut', () => {
    expect(eraseGeom('text', { at: { x: 0, y: 0 } }, [{ x: 0, y: 0 }], 10)).toBeNull()
    expect(eraseGeom('dim', { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, offset: 0 }, [{ x: 50, y: 0 }], 10)).toBeNull()
  })
  it('a dot in the middle of a line leaves two pieces with cut ends', () => {
    const out = eraseGeom('line', { pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, [{ x: 50, y: 0 }], 10)!
    expect(out).toHaveLength(2)
    const [a, b] = out.map(p => (p.geom as LineGeom).pts)
    close(a[0], { x: 0, y: 0 }); close(a[1], { x: 40, y: 0 })
    close(b[0], { x: 60, y: 0 }); close(b[1], { x: 100, y: 0 })
    expect(out[0]).toMatchObject({ cutStart: false, cutEnd: true })
    expect(out[1]).toMatchObject({ cutStart: true, cutEnd: false })
  })
  it('a stroke across a polyline corner trims both sides of it', () => {
    const out = eraseGeom('line', { pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] }, [{ x: 100, y: 0 }], 10)!
    expect(out).toHaveLength(2)
    close((out[0].geom as LineGeom).pts.at(-1)!, { x: 90, y: 0 })
    close((out[1].geom as LineGeom).pts[0], { x: 100, y: 10 })
  })
  it('rubbing the whole line removes it', () => {
    expect(eraseGeom('line', { pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }, [{ x: 0, y: 0 }, { x: 10, y: 0 }], 5)).toEqual([])
  })
  it('a closed line cut once opens into one piece starting after the gap', () => {
    const sq = { pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], closed: true }
    const out = eraseGeom('line', sq, [{ x: 50, y: 0 }], 10)!
    expect(out).toHaveLength(1)
    const g = out[0].geom as LineGeom
    expect(g.closed).toBeUndefined()
    close(g.pts[0], { x: 60, y: 0 }); close(g.pts.at(-1)!, { x: 40, y: 0 })
    expect(g.pts).toHaveLength(6)
  })
  it('a box becomes lines', () => {
    const out = eraseGeom('rect', { a: { x: 0, y: 0 }, b: { x: 100, y: 50 } }, [{ x: 50, y: 0 }], 5)!
    expect(out.map(p => p.kind)).toEqual(['line'])
  })
  it('a bulged segment keeps its curve: pieces stay on the original arc', () => {
    const a = { x: 0, y: 0 }, b = { x: 100, y: 0 }, bulge = 0.5
    const out = eraseGeom('line', { pts: [a, b], bulges: [bulge] }, [bulgeMid(a, b, bulge)], 5)!
    expect(out).toHaveLength(2)
    const orig = sampleBulged([a, b], [bulge], false, 400)
    for (const pc of out) {
      const g = pc.geom as LineGeom
      expect(g.bulges?.[0]).toBeTruthy()
      // the middle of each piece lies on the original arc
      const m = bulgeMid(g.pts[0], g.pts[1], g.bulges![0])
      const near = Math.min(...orig.map(p => Math.hypot(p.x - m.x, p.y - m.y)))
      expect(near).toBeLessThan(0.5)
    }
  })
  it('a circle rubbed once becomes one arc covering the rest', () => {
    const out = eraseGeom('circle', { c: { x: 0, y: 0 }, r: 100 }, [{ x: 100, y: 0 }], 10)!
    expect(out).toHaveLength(1)
    const g = out[0].geom as ArcGeom
    expect(out[0].kind).toBe('arc')
    const s = arcPoint(g, g.a0)
    expect(s.x).toBeCloseTo(99.5, 3); expect(Math.abs(s.y)).toBeCloseTo(Math.sqrt(100 * 100 - 99.5 * 99.5), 3)
    expect((((g.a1 - g.a0) % 360) + 360) % 360).toBeCloseTo(360 - 2 * Math.asin(Math.sqrt(100 * 100 - 99.5 * 99.5) / 100) * 180 / Math.PI, 3)
    // the arc's middle is opposite the rub
    close(arcPoint(g, (g.a0 + g.a1) / 2), { x: -100, y: 0 }, 3)
  })
  it('an arc cut in the middle gives two arcs', () => {
    const out = eraseGeom('arc', { c: { x: 0, y: 0 }, r: 100, a0: 0, a1: 90 }, [{ x: 70.71, y: 70.71 }], 5)!
    expect(out).toHaveLength(2)
    expect((out[0].geom as ArcGeom).a0).toBeCloseTo(0)
    expect((out[1].geom as ArcGeom).a1).toBeCloseTo(90)
  })
  it('an ellipse becomes an open line', () => {
    const g = ellipsePoly({ a: { x: -100, y: -50 }, b: { x: 100, y: 50 } })
    expect(g.closed).toBe(true)
    const out = eraseGeom('ellipse', { a: { x: -100, y: -50 }, b: { x: 100, y: 50 } }, [{ x: 100, y: 0 }], 5)!
    expect(out).toHaveLength(1)
    expect((out[0].geom as LineGeom).closed).toBeUndefined()
  })
  it('a cloud piece stays a cloud, open, bumps on the original side', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
    const out = eraseGeom('cloud', { pts }, [{ x: 50, y: 0 }], 10)!
    expect(out).toHaveLength(1)
    const g = out[0].geom as CloudGeom
    expect(out[0].kind).toBe('cloud')
    expect(g.open).toBe(true)
    expect(g.side).toBe(1)
    // cutting the open piece again keeps the side
    const again = eraseGeom('cloud', g, [{ x: 100, y: 50 }], 10)!
    expect(again).toHaveLength(2)
    expect((again[0].geom as CloudGeom).side).toBe(1)
  })
})
