// A circular part cut-out is a 2-point loop (two half-circle bulges): it must
// reach the optimiser as a real hole, with its onion skin (RHK6586 WC-13).
import { describe, it, expect } from 'vitest'
import { cutoutsToOp, shapeFrameFor } from '../shapes'
import { holeLoop } from '../../partCutouts'

describe('circular cut-out to the optimiser', () => {
  it('keeps a 2-point circle, samples it round, carries the skin', () => {
    const pts = holeLoop(235, 10, 150, 150, 'circle')
    expect(pts).toHaveLength(2)
    const r = cutoutsToOp([{ pts, skin: 0.3 }], { frame: shapeFrameFor('custom_parts', 'flat', 'x'), DX: 170, DY: 620 })
    expect(r).not.toBeNull()
    expect(r!.cut_hole_skins).toEqual([0.3])
    const loop = r!.cut_holes[0]
    expect(loop.length).toBeGreaterThan(8)
    const xs = loop.map(p => p.x), ys = loop.map(p => p.y)
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
    for (const p of loop) expect(Math.hypot(p.x - cx, p.y - cy)).toBeCloseTo(75, 0)
  })
})
