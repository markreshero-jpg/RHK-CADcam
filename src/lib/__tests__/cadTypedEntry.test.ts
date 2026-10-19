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
