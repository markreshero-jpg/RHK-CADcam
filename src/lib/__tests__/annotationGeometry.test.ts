import { describe, it, expect } from 'vitest'
import {
  mapPt, mapRot, arrowHead, trimEnd, textWidth, wrapText, layoutText, leaderAttachLocal,
  cloudPath, dimLayout, readableAngle, dimText, annotLayerItem, annotationFramePoints,
} from '../annotations/geometry'
import { resolveStyle, printStyle, ANNOT_INK, dashPattern } from '../annotations/style'

describe('frames', () => {
  it('maps plan (identity-ish) and elevation (y up) frames', () => {
    expect(mapPt({ ox: 10, oy: 20, s: 2, flipY: false }, { x: 5, y: 5 })).toEqual({ x: 20, y: 30 })
    expect(mapPt({ ox: 0, oy: 100, s: 1, flipY: true }, { x: 5, y: 30 })).toEqual({ x: 5, y: 70 })
    expect(mapRot({ ox: 0, oy: 0, s: 1, flipY: true }, 30)).toBe(-30)
  })
})

describe('arrowheads', () => {
  it('closed head sits behind the tip and trims the line by its length', () => {
    const a = arrowHead({ x: 10, y: 0 }, { x: 0, y: 0 }, 'closed', 2)!
    expect(a.filled).toBe(true)
    expect(a.trim).toBe(2)
    expect(a.d.startsWith('M10 0L8 ')).toBe(true)
  })
  it('every type draws except none', () => {
    for (const t of ['closed', 'closed_open', 'open', 'dot', 'dot_open', 'tick', 'square'] as const)
      expect(arrowHead({ x: 1, y: 1 }, { x: 0, y: 0 }, t, 2)?.d).toBeTruthy()
    expect(arrowHead({ x: 1, y: 1 }, { x: 0, y: 0 }, 'none', 2)).toBeNull()
  })
  it('trimEnd pulls back along the line, never past the other end', () => {
    expect(trimEnd({ x: 10, y: 0 }, { x: 0, y: 0 }, 2)).toEqual({ x: 8, y: 0 })
    expect(trimEnd({ x: 1, y: 0 }, { x: 0, y: 0 }, 5)).toEqual({ x: 0, y: 0 })
  })
})

describe('text', () => {
  it('measures wider for capitals and bold', () => {
    expect(textWidth('MMM', 3.5)).toBeGreaterThan(textWidth('iii', 3.5))
    expect(textWidth('abc', 3.5, true)).toBeGreaterThan(textWidth('abc', 3.5))
  })
  it('point text keeps its own lines; a text box wraps to its width', () => {
    expect(wrapText('one\ntwo', 3.5, false)).toEqual(['one', 'two'])
    const lines = wrapText('the quick brown fox jumps over the lazy dog', 3.5, false, 25)
    expect(lines.length).toBeGreaterThan(2)
    for (const l of lines) expect(textWidth(l, 3.5) <= 25 || !l.includes(' ')).toBe(true)
  })
  it('text box width is the box, point text width is the longest line', () => {
    expect(layoutText('hi', 3.5, { width: 40 }).w).toBe(40)
    expect(layoutText('hi\nhello there', 3.5).w).toBeCloseTo(textWidth('hello there', 3.5))
  })
  it('leader attaches on the nearer side', () => {
    const b = layoutText('note', 3.5)
    expect(leaderAttachLocal(b, 1, { x: -50, y: 0 }).x).toBe(-1)
    expect(leaderAttachLocal(b, 1, { x: 500, y: 0 }).x).toBeCloseTo(b.w + 1)
  })
})

describe('cloud', () => {
  it('bulges outward whichever way the polygon winds', () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const cw = cloudPath(sq, 5), ccw = cloudPath([...sq].reverse(), 5)
    expect(cw).toMatch(/A3\.1 3\.1 0 0 1 /)
    expect(ccw).toMatch(/A3\.1 3\.1 0 0 0 /)
    expect((cw.match(/A/g) ?? []).length).toBe(8)
  })
  it('needs at least 3 points', () => {
    expect(cloudPath([{ x: 0, y: 0 }, { x: 1, y: 1 }], 5)).toBe('')
  })
})

describe('dimension', () => {
  it('offsets the dim line along the left normal and measures', () => {
    const l = dimLayout({ p1: { x: 0, y: 0 }, p2: { x: 600, y: 0 }, offset: 50 })
    expect(l.value).toBe(600)
    expect(l.d1).toEqual({ x: 0, y: 50 })
    expect(l.d2).toEqual({ x: 600, y: 50 })
  })
  it('reads left-to-right and honours a text override', () => {
    expect(readableAngle({ x: 10, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(0)
    expect(readableAngle({ x: 0, y: 10 }, { x: 0, y: 0 })).toBe(-90)   // vertical reads bottom-to-top
    expect(readableAngle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(-90)
    expect(dimText(599.6, null)).toBe('600')
    expect(dimText(600, 'TBC')).toBe('TBC')
  })
})

describe('style + layers', () => {
  it('fills defaults per kind and keeps user values', () => {
    expect(resolveStyle('dim', {}).arrowEnd).toBe('tick')
    expect(resolveStyle('text', { size: 7 }).size).toBe(7)
    expect(resolveStyle('line', { color: '#00f' }).color).toBe('#00f')
  })
  it('print without colours goes ink, white backgrounds, no fills', () => {
    const s = printStyle(resolveStyle('rect', { color: '#f00', fill: 'solid', bg: 'solid', bgColor: '#ff0' }), false)
    expect(s.color).toBe(ANNOT_INK)
    expect(s.fill).toBe('none')
    expect(s.bgColor).toBe('#ffffff')
    expect(printStyle(resolveStyle('rect', { color: '#f00' }), true).color).toBe('#f00')
  })
  it('dash patterns', () => {
    expect(dashPattern('solid', 0.35)).toEqual([])
    expect(dashPattern('dashed', 0.35)).toEqual([2, 1])
  })
  it('maps kinds to layer items', () => {
    expect(annotLayerItem('text')).toBe('annot_text')
    expect(annotLayerItem('dim')).toBe('annot_dims')
    expect(annotLayerItem('cloud')).toBe('annot_markup')
  })
  it('bounds cover a rotated text block and its leader', () => {
    const pts = annotationFramePoints('text', { at: { x: 100, y: 100 }, leader: [{ x: 0, y: 0 }] }, 'note', 3.5, 20)
    expect(pts).toHaveLength(5)
    expect(pts[4]).toEqual({ x: 0, y: 0 })
  })
})

import { unmapPt, translateGeom, boundsOf, boxesOverlap, textCorners, snapQuarter } from '../annotations/geometry'

describe('editing helpers', () => {
  it('unmapPt inverts mapPt', () => {
    const f = { ox: 10, oy: 500, s: 0.5, flipY: true }
    const p = { x: 123, y: 456 }
    const back = unmapPt(f, mapPt(f, p))
    expect(back.x).toBeCloseTo(123); expect(back.y).toBeCloseTo(456)
  })
  it('translates every point of every kind', () => {
    expect(translateGeom('text', { at: { x: 0, y: 0 }, leader: [{ x: 1, y: 1 }] }, 5, 5))
      .toEqual({ at: { x: 5, y: 5 }, leader: [{ x: 6, y: 6 }] })
    expect(translateGeom('dim', { p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 }, offset: 3 }, 1, 2))
      .toEqual({ p1: { x: 1, y: 2 }, p2: { x: 2, y: 2 }, offset: 3 })
  })
  it('bounds + overlap', () => {
    const b = boundsOf([{ x: 0, y: 5 }, { x: 10, y: -5 }])!
    expect(b).toEqual({ minX: 0, minY: -5, maxX: 10, maxY: 5 })
    expect(boxesOverlap(b, { minX: 9, minY: 4, maxX: 20, maxY: 20 })).toBe(true)
    expect(boxesOverlap(b, { minX: 11, minY: 0, maxX: 20, maxY: 20 })).toBe(false)
  })
  it('text corners scale paper → frame and include padding', () => {
    const block = layoutText('x', 3.5, { width: 10 })
    const c = textCorners({ at: { x: 100, y: 100 } }, block, 1, 20)
    expect(c[0]).toEqual({ x: 80, y: 80 })
    expect(c[1].x).toBeCloseTo(100 + 11 * 20)
  })
  it('snaps near quarter turns only', () => {
    expect(snapQuarter(88)).toBe(90)
    expect(snapQuarter(-2)).toBe(0)
    expect(snapQuarter(45)).toBe(45)
  })
})

import { angleSnap, dedupePts, leaderTextAt } from '../annotations/geometry'
import { styleKeyOf } from '../annotations/style'

describe('A3 drawing helpers', () => {
  it('locks near-15° segments, keeps length, leaves others alone', () => {
    const p = angleSnap({ x: 0, y: 0 }, { x: 100, y: 3 })
    expect(p.y).toBeCloseTo(0); expect(p.x).toBeCloseTo(Math.hypot(100, 3))
    expect(angleSnap({ x: 0, y: 0 }, { x: 100, y: 15 })).toEqual({ x: 100, y: 15 })   // 8.5° — free
  })
  it('dedupes double-click repeats', () => {
    expect(dedupePts([{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 10, y: 0 }], 1)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }])
  })
  it('leader text sits beyond the landing, on the side away from the tip', () => {
    expect(leaderTextAt({ x: 100, y: 0 }, { x: 0, y: 0 }, 3.5, 20).x).toBeGreaterThan(100)
    expect(leaderTextAt({ x: 100, y: 0 }, { x: 200, y: 0 }, 3.5, 20).x).toBeLessThan(100)
  })
  it('arrows remember apart from plain lines', () => {
    expect(styleKeyOf('line', {})).toBe('line')
    expect(styleKeyOf('line', { arrowEnd: 'closed' })).toBe('arrow')
    expect(styleKeyOf('text', {})).toBe('text')
  })
})

import { boxCorners, setBoxCorner, rectPts } from '../annotations/geometry'

describe('A4 boxes', () => {
  const g = { a: { x: 0, y: 0 }, b: { x: 10, y: 20 } }
  it('lists corners round the box', () => {
    expect(boxCorners(g)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }])
  })
  it('moving a corner keeps the opposite corner', () => {
    const m = setBoxCorner(g, 1, { x: 15, y: -5 })
    expect(boxCorners(m)[1]).toEqual({ x: 15, y: -5 })
    expect(boxCorners(m)[3]).toEqual({ x: 0, y: 20 })
    expect(boxCorners(setBoxCorner(g, 3, { x: -2, y: 25 }))[1]).toEqual({ x: 10, y: 0 })
  })
  it('rectangle cloud points', () => {
    expect(rectPts({ x: 0, y: 0 }, { x: 1, y: 1 })).toHaveLength(4)
  })
})

import { dimOffsetFor, dimAxisFor } from '../annotations/geometry'

describe('A5 manual dims', () => {
  it('linear dims measure one axis only', () => {
    const h = dimLayout({ p1: { x: 0, y: 0 }, p2: { x: 600, y: 300 }, offset: -100, axis: 'x' })
    expect(h.value).toBe(600)
    expect(h.d1).toEqual({ x: 0, y: -100 }); expect(h.d2).toEqual({ x: 600, y: -100 })
    const v = dimLayout({ p1: { x: 0, y: 0 }, p2: { x: 600, y: 300 }, offset: 700, axis: 'y' })
    expect(v.value).toBe(300)
    expect(v.d2).toEqual({ x: 700, y: 300 })
  })
  it('offset follows the cursor for every mode', () => {
    expect(dimOffsetFor({ p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, axis: 'x' }, { x: 5, y: -40 })).toBe(-40)
    expect(dimOffsetFor({ p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, axis: 'y' }, { x: 30, y: 5 })).toBe(30)
    expect(dimOffsetFor({ p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } }, { x: 5, y: 20 })).toBeCloseTo(20)
  })
  it('axis comes from where the line is pulled', () => {
    const a = { x: 0, y: 0 }, b = { x: 600, y: 300 }
    expect(dimAxisFor(a, b, { x: 300, y: -200 })).toBe('x')
    expect(dimAxisFor(a, b, { x: 900, y: 150 })).toBe('y')
    expect(dimAxisFor(a, b, { x: 300, y: 150 }, 'y')).toBe('y')
  })
  it('<> in an override stands for the value', () => {
    expect(dimText(600.2, '<> TBC')).toBe('600 TBC')
    expect(dimText(600, 'approx <> (<>)')).toBe('approx 600 (600)')
  })
})

describe('B1 text box height', () => {
  it('a set height is the minimum; text still grows past it', () => {
    expect(layoutText('a', 3.5, { width: 40, height: 30 }).h).toBe(30)
    expect(layoutText('a\nb\nc\nd\ne\nf\ng', 3.5, { width: 40, height: 5 }).h).toBeGreaterThan(5)
  })
})

import { segAngle, withLength, withAngle, withBoxSize, segLength } from '../annotations/geometry'

describe('B2b measuring', () => {
  it('angles read counter-clockwise on screen, 0–360', () => {
    expect(segAngle({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0)
    expect(segAngle({ x: 0, y: 0 }, { x: 0, y: -10 })).toBe(90)   // up the screen
    expect(segAngle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(270)
  })
  it('sets length and angle about the first point', () => {
    const q = withLength({ x: 0, y: 0 }, { x: 3, y: 4 }, 10)
    expect(q.x).toBeCloseTo(6); expect(q.y).toBeCloseTo(8)
    const p = withAngle({ x: 0, y: 0 }, { x: 10, y: 0 }, 90)
    expect(p.x).toBeCloseTo(0); expect(p.y).toBeCloseTo(-10)
    expect(segLength({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
  it('resizes a box from its first corner, keeping direction', () => {
    expect(withBoxSize({ a: { x: 100, y: 100 }, b: { x: 0, y: 300 } }, 600, 400)).toEqual({ a: { x: 100, y: 100 }, b: { x: -500, y: 500 } })
  })
})

import { arcFrom3, arcFromCentre, arcFromEndsRadius, arcStart, arcEnd, arcMid, sweepOf, arcLength, arcSvgPath, circumcentre } from '../annotations/geometry'

describe('B3 arcs', () => {
  const close = (p: { x: number; y: number }, q: { x: number; y: number }) => { expect(p.x).toBeCloseTo(q.x); expect(p.y).toBeCloseTo(q.y) }
  it('3-point arc passes through all three and keeps its ends', () => {
    const a = arcFrom3({ x: -100, y: 0 }, { x: 0, y: -100 }, { x: 100, y: 0 })!   // top half (y up the screen)
    close(a.c, { x: 0, y: 0 }); expect(a.r).toBeCloseTo(100)
    close(arcMid(a), { x: 0, y: -100 })
    expect(sweepOf(a.a0, a.a1)).toBeCloseTo(180)
    const ends = [arcStart(a), arcEnd(a)]
    expect(ends.some(p => Math.abs(p.x + 100) < 1e-6)).toBe(true)
    expect(ends.some(p => Math.abs(p.x - 100) < 1e-6)).toBe(true)
    expect(arcLength(a)).toBeCloseTo(Math.PI * 100)
  })
  it('the other bulge gives the other half', () => {
    const a = arcFrom3({ x: -100, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 0 })!
    close(arcMid(a), { x: 0, y: 100 })
  })
  it('collinear points make no arc', () => {
    expect(arcFrom3({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBeNull()
    expect(circumcentre({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull()
  })
  it('centre-start-end runs anticlockwise on screen', () => {
    const a = arcFromCentre({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: -100 })!   // right → up = a quarter
    expect(sweepOf(a.a0, a.a1)).toBeCloseTo(90)
    close(arcMid(a), { x: Math.SQRT1_2 * 100, y: -Math.SQRT1_2 * 100 })
  })
  it('ends + radius bulges toward the side, min half circle', () => {
    const a = arcFromEndsRadius({ x: 0, y: 0 }, { x: 200, y: 0 }, 500, { x: 100, y: -50 })!
    expect(a.r).toBeCloseTo(500); expect(arcMid(a).y).toBeLessThan(0)
    const h = arcFromEndsRadius({ x: 0, y: 0 }, { x: 200, y: 0 }, 10, { x: 100, y: 50 })!
    expect(h.r).toBeCloseTo(100); close(arcMid(h), { x: 100, y: 100 })
  })
  it('svg path flags', () => {
    const a = arcFrom3({ x: -100, y: 0 }, { x: 0, y: -100 }, { x: 100, y: 0 })!
    expect(arcSvgPath({ ox: 0, oy: 0, s: 1, flipY: false }, a)).toMatch(/A100 100 0 0 1 /)
    expect(arcSvgPath({ ox: 0, oy: 0, s: 1, flipY: true }, a)).toMatch(/A100 100 0 0 0 /)
  })
})

import { offsetPolyline, signedDistToPolyline, offsetDistanceFor, offsetGeom, moveEdge, edgeDistanceFor, lineIntersect } from '../annotations/geometry'

describe('B4 offset + side drag', () => {
  const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
  it('mitred polyline offset keeps right angles', () => {
    // svg: the left normal of a rightward segment points +y (down the screen)
    expect(offsetPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 10, false))
      .toEqual([{ x: 0, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 100 }])
  })
  it('closed offset grows or shrinks the outline', () => {
    // sq winds clockwise on screen, so its left normal points inward
    expect(offsetPolyline(sq, 10, true)).toEqual([{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }])
  })
  it('cursor side picks the sign', () => {
    expect(signedDistToPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false, { x: 50, y: 20 })).toBeCloseTo(20)
    expect(signedDistToPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false, { x: 50, y: -20 })).toBeCloseTo(-20)
  })
  it('boxes, circles and ellipses: + is outward', () => {
    const box = { a: { x: 0, y: 0 }, b: { x: 600, y: 400 } }
    expect(offsetDistanceFor('rect', box, { x: 650, y: 200 })).toBeCloseTo(50)
    expect(offsetGeom('rect', box, 50)).toEqual({ a: { x: -50, y: -50 }, b: { x: 650, y: 450 } })
    expect(offsetDistanceFor('rect', box, { x: 300, y: 380 })).toBeCloseTo(-20)
    expect(offsetDistanceFor('circle', { c: { x: 0, y: 0 }, r: 100 }, { x: 0, y: 130 })).toBeCloseTo(30)
    expect(offsetGeom('circle', { c: { x: 0, y: 0 }, r: 100 }, -150)).toBeNull()
    expect(offsetDistanceFor('ellipse', box, { x: 650, y: 200 })).toBeCloseTo(50)
  })
  it('side drag keeps the neighbours on their lines', () => {
    // right side runs downward; its left normal points -x, so -20 pushes it out to x = 120
    const moved = moveEdge(sq, 1, -20, true)
    expect(moved[1]).toEqual({ x: 120, y: 0 })
    expect(moved[2]).toEqual({ x: 120, y: 100 })
    expect(moved[0]).toEqual(sq[0])
    expect(edgeDistanceFor(sq, 1, { x: 130, y: 50 })).toBeCloseTo(-30)
  })
  it('an open polyline end side just shifts', () => {
    const m = moveEdge([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 0, 10, false)
    expect(m[0]).toEqual({ x: 0, y: 10 })
    expect(m[1]).toEqual({ x: 100, y: 10 })
  })
  it('parallel lines do not cross', () => {
    expect(lineIntersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBeNull()
  })
})
