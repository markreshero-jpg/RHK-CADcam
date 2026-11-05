import { describe, it, expect } from 'vitest'
import { findNearestValid } from '../edit'
import type { NestedSheet } from '../nest'

// Stage 5 drag (Mark, 2026-11-05): a part dropped overlapping a neighbour lands
// beside it at the gap, on whichever side is nearest — not across the sheet.
const sheet: NestedSheet = {
  index: 0, materialId: null, thickness: 18, efficiency: 0,
  stock: { w: 2400, h: 1200, trimTop: 10, trimBottom: 10, trimLeft: 10, trimRight: 10, isOffcut: false, label: null },
  placements: [
    { uid: 'n', baseUid: 'n', label: 'N', x: 1000, y: 300, w: 400, h: 400, rotated: false },
    { uid: 'm', baseUid: 'm', label: 'M', x: 100, y: 100, w: 200, h: 200, rotated: false },
  ],
}
describe('drag drop snaps to the nearest legal spot', () => {
  it('dropped just overlapping the left side of a part: butts its left side at the gap', () => {
    expect(findNearestValid(sheet, 'm', 200, 200, 820, 400, 12)).toEqual({ x: 1000 - 200 - 12, y: 400 })
  })
  it('dropped overlapping the bottom: sits under it at the gap', () => {
    expect(findNearestValid(sheet, 'm', 200, 200, 1100, 120, 12)).toEqual({ x: 1100, y: 300 - 200 - 12 })
  })
  it('a free spot stays exactly where dropped', () => {
    expect(findNearestValid(sheet, 'm', 200, 200, 500, 500, 12)).toEqual({ x: 500, y: 500 })
  })
})
