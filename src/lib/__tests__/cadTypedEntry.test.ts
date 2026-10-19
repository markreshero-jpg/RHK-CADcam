import { describe, it, expect } from 'vitest'
import { typedSeg, typedBox } from '@/app/canvas/[roomId]/useAnnotationTool'

describe('typed entry (Tab while drawing)', () => {
  const o = { x: 100, y: 100 }
  it('length locks along the cursor direction; angle follows the cursor until typed', () => {
    const p = typedSeg(o, { x: 400, y: 100 }, { length: 600 })
    expect(p.x).toBeCloseTo(700); expect(p.y).toBeCloseTo(100)
    const q = typedSeg(o, { x: 100, y: -500 }, { length: 300 })   // cursor straight up
    expect(q.x).toBeCloseTo(100); expect(q.y).toBeCloseTo(-200)
  })
  it('angle locks direction and keeps the cursor distance when no length is typed', () => {
    const p = typedSeg(o, { x: 500, y: 100 }, { angle: 90 })
    expect(p.x).toBeCloseTo(100); expect(p.y).toBeCloseTo(-300)
    const q = typedSeg(o, { x: 0, y: 0 }, { length: 200, angle: 0 })
    expect(q).toEqual({ x: 300, y: 100 })
  })
  it('nothing typed = the cursor', () => {
    expect(typedSeg(o, { x: 1, y: 2 }, {})).toEqual({ x: 1, y: 2 })
  })
  it('box W / H lock size; the cursor picks the direction', () => {
    expect(typedBox(o, { x: 0, y: 500 }, { w: 600 })).toEqual({ x: -500, y: 500 })
    expect(typedBox(o, { x: 900, y: 900 }, { w: 600, h: 400 })).toEqual({ x: 700, y: 500 })
  })
})

import { lockPoint, typedFieldsFor, arcFromDrawing, type AnnotDrawing } from '@/app/canvas/[roomId]/useAnnotationTool'
import { sweepOf, arcMid } from '../annotations/geometry'

describe('B3 arc / circle drawing', () => {
  const c = { x: 0, y: 0 }
  it('circle radius locks the second point', () => {
    const d: AnnotDrawing = { tool: 'circle', pts: [c], cur: null }
    const p = lockPoint(d, { x: 0, y: 50 }, { radius: 300 })
    expect(p.x).toBeCloseTo(0); expect(p.y).toBeCloseTo(300)
    expect(typedFieldsFor(false, d)).toEqual(['radius'])
  })
  it('centre mode: sweep turns the end anticlockwise on screen from the start', () => {
    const d: AnnotDrawing = { tool: 'arc', arcMode: 'centre', pts: [c, { x: 100, y: 0 }], cur: null }
    expect(typedFieldsFor(false, d)).toEqual(['sweep'])
    const end = lockPoint(d, { x: 5, y: 5 }, { sweep: 90 })
    expect(end.x).toBeCloseTo(0); expect(end.y).toBeCloseTo(-100)   // up the screen
    const g = arcFromDrawing(d, end, {})!
    expect(sweepOf(g.a0, g.a1)).toBeCloseTo(90)
  })
  it('ends mode: typed radius, bulging to the cursor side', () => {
    const d: AnnotDrawing = { tool: 'arc', arcMode: 'ends', pts: [{ x: 0, y: 0 }, { x: 200, y: 0 }], cur: null }
    expect(typedFieldsFor(false, d)).toEqual(['radius'])
    const g = arcFromDrawing(d, { x: 100, y: 40 }, { radius: 500 })!
    expect(g.r).toBeCloseTo(500); expect(arcMid(g).y).toBeGreaterThan(0)
  })
  it('3-point mode: second click = through point', () => {
    const d: AnnotDrawing = { tool: 'arc', arcMode: '3pt', pts: [{ x: -100, y: 0 }, { x: 0, y: -100 }], cur: null }
    expect(typedFieldsFor(false, d)).toEqual([])
    const g = arcFromDrawing(d, { x: 100, y: 0 }, {})!
    expect(g.r).toBeCloseTo(100)
  })
  it('pending boxes and plain lines keep their fields', () => {
    expect(typedFieldsFor(true, null)).toEqual(['w', 'h'])
    expect(typedFieldsFor(false, { tool: 'line', pts: [c], cur: null })).toEqual(['length', 'angle'])
    expect(typedFieldsFor(false, { tool: 'dim', pts: [c, { x: 1, y: 0 }], cur: null })).toEqual(['offset'])
  })
})

import { clickRoute, CAD_TOOL_KEYS, type CadTool } from '@/app/canvas/[roomId]/useAnnotationTool'

describe('click routing (every tool goes somewhere sensible)', () => {
  it('arc and circle click out points — never the text / box path', () => {
    expect(clickRoute('arc', false)).toBe('point')
    expect(clickRoute('circle', false)).toBe('point')
  })
  it('every keyboard tool has a route other than none', () => {
    for (const t of Object.values(CAD_TOOL_KEYS) as CadTool[]) expect(clickRoute(t, false)).not.toBe('none')
  })
  it('box-type tools place; a started freehand cloud clicks points', () => {
    expect(clickRoute('rect', false)).toBe('place')
    expect(clickRoute('textbox', false)).toBe('place')
    expect(clickRoute('cloud', false)).toBe('place')
    expect(clickRoute('cloud', true)).toBe('point')
    expect(clickRoute('select', false)).toBe('marquee')
  })
})
