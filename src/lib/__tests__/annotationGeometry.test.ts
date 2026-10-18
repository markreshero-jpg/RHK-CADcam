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
    expect(readableAngle({ x: 0, y: 10 }, { x: 0, y: 0 })).toBe(90)
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
