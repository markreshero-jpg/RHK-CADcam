import { describe, it, expect } from 'vitest'
import { doorChevronPoints, hingeEdgeLine } from '../doorChevron'

const r = { x: 0, y: 0, w: 400, h: 600 }   // SVG space, y down
const apex = (s: string) => s.split(' ')[1].split(',').map(Number)

describe('door chevron', () => {
  it('points away from the hinge', () => {
    expect(apex(doorChevronPoints('left', r))).toEqual([400, 300])
    expect(apex(doorChevronPoints('right', r))).toEqual([0, 300])
    expect(apex(doorChevronPoints('bottom', r))).toEqual([200, 0])    // points up
    expect(apex(doorChevronPoints('top', r))).toEqual([200, 600])     // points down
  })
  it('hinge line sits on the hinge edge', () => {
    expect(hingeEdgeLine('top', r)).toEqual({ x1: 0, y1: 0, x2: 400, y2: 0 })
    expect(hingeEdgeLine('bottom', r)).toEqual({ x1: 0, y1: 600, x2: 400, y2: 600 })
  })
})
