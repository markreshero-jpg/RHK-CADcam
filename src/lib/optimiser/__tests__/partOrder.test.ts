import { describe, it, expect } from 'vitest'
import { sheetPartOrder } from '../labels'

describe('sheetPartOrder', () => {
  it('numbers column by column, left to right, top to bottom in a column', () => {
    // Nest order is big-first; positions (BL origin, y up):
    const pl = [
      { uid: 'big', x: 600, y: 0, h: 1200 },     // column 2, full height
      { uid: 'a2', x: 0, y: 0, h: 500 },         // column 1, bottom
      { uid: 'a1', x: 10, y: 600, h: 600 },      // column 1, top (left edge 10 ≈ same column)
      { uid: 'c', x: 1200, y: 700, h: 400 },     // column 3, top
      { uid: 'd', x: 1200, y: 0, h: 400 },       // column 3, bottom
    ]
    expect(sheetPartOrder(pl).map(p => p.uid)).toEqual(['a1', 'a2', 'big', 'c', 'd'])
  })
})
