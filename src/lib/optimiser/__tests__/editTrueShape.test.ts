// Stage 5 snap with true outlines (Mark, 2026-11-11, RHK6595 WC-07): the L
// filler is one 350 x 765 board with 70 legs, so its 280 x 695 corner is empty.
// A part dropped there stays there; an L dropped over a part wraps round it.
import { describe, it, expect } from 'vitest'
import { findNearestValid, isFreeAt, type ShapeOpts } from '../edit'
import type { NestedSheet, Placement } from '../nest'

const GAP = 16
const stock = { w: 2400, h: 1200, trimTop: 10, trimBottom: 10, trimLeft: 10, trimRight: 10, isOffcut: false, label: null }
// WC-07's outline (placement-local, x along 350, y along 765).
const L = [{ x: 0, y: 765 }, { x: 0, y: 695 }, { x: 280, y: 695 }, { x: 280, y: 0 }, { x: 350, y: 0 }, { x: 350, y: 765 }]
const lPl: Placement = { uid: 'L', baseUid: 'L', label: 'L Filler', x: 100, y: 100, w: 350, h: 765, rotated: false }
const sheetWith = (...pls: Placement[]): NestedSheet => ({ index: 0, materialId: 'm', thickness: 18, efficiency: 0, stock, placements: pls })
const shapes = (moving: typeof L | null = null): ShapeOpts => ({ outlineOf: p => (p.uid === 'L' ? L : null), moving })

describe('true-shape snap', () => {
  it('a part fits in the L’s empty corner', () => {
    const s = sheetWith(lPl)
    // 200 x 600 part: corner is 280 x 695, room for it plus a gap on the legs.
    expect(isFreeAt(s, null, 200, 600, 100, 100, GAP, shapes())).toBe(true)
    expect(isFreeAt(s, null, 200, 600, 100, 100, GAP)).toBe(false)          // rectangles: blocked
    expect(findNearestValid(s, null, 200, 600, 100, 100, GAP, shapes())).toEqual({ x: 100, y: 100 })
  })

  it('too close to a leg snaps it clear by the gap', () => {
    const s = sheetWith(lPl)
    const pos = findNearestValid(s, null, 200, 600, 180, 100, GAP, shapes())!
    expect(pos.x + 200).toBeLessThanOrEqual(100 + 280 - GAP + 1e-6)   // clear of the upright leg
    expect(pos.y + 600).toBeLessThanOrEqual(100 + 695 - GAP + 1e-6)   // and under the top leg
    expect(Math.abs(pos.x - 180) + Math.abs(pos.y - 100)).toBeLessThan(100)  // stays in the corner
  })

  it('a dragged L wraps round a part already on the sheet', () => {
    const box: Placement = { uid: 'B', baseUid: 'B', label: 'Box', x: 600, y: 100, w: 200, h: 600, rotated: false }
    const s = sheetWith(box)
    const pos = findNearestValid(s, 'L', 350, 765, 600, 100, GAP, shapes(L))!
    expect(isFreeAt(s, null, 350, 765, pos.x, pos.y, GAP, shapes(L))).toBe(true)
    // It overlaps the box's rectangle, i.e. the box sits in its corner.
    const overlap = pos.x < box.x + box.w && box.x < pos.x + 350 && pos.y < box.y + box.h && box.y < pos.y + 765
    expect(overlap).toBe(true)
  })

  it('a part overlapping a leg is never clear', () => {
    const s = sheetWith(lPl)
    expect(isFreeAt(s, null, 100, 100, 100 + 290, 300, GAP, shapes())).toBe(false)   // on the upright leg
  })
})
