import { describe, expect, it } from 'vitest'
import { applyAdjHoleSetback } from '../resolveJoints'
import type { JointTypeOp } from '../types'

const twoRows = {
  machine_operation: 'drill', target_part: 'part_b', qty: 2, offset_z_mm: 50, spacing_mm: 100,
  expressions: { spacing_mm: 'D - 100', offset_y_mm: 'T + 4' },
} as unknown as JointTypeOp

describe('ADJ_HOLE_SB shelf pin rows', () => {
  it('leaves the joint alone at 0 or unset', () => {
    expect(applyAdjHoleSetback([twoRows], 0, 111)).toEqual([twoRows])
    expect(applyAdjHoleSetback([twoRows], undefined, 111)).toEqual([twoRows])
  })
  it('sets the first row from the front and spaces the last row from the back', () => {
    const [op] = applyAdjHoleSetback([twoRows], 25, 111)
    expect(op.offset_z_mm).toBe(25)
    expect(op.expressions).toEqual({ spacing_mm: '(D - 50) / 1', offset_y_mm: 'T + 4' })
  })
  it('divides the span between three rows', () => {
    const [op] = applyAdjHoleSetback([{ ...twoRows, qty: 3 }], 30, 300)
    expect(op.expressions?.spacing_mm).toBe('(D - 60) / 2')
  })
  it('keeps a centre single-row joint', () => {
    const one = { ...twoRows, qty: 1 }
    expect(applyAdjHoleSetback([one], 25, 111)).toEqual([one])
  })
  it('keeps the joint when the shelf is too shallow for the setback', () => {
    expect(applyAdjHoleSetback([twoRows], 60, 111)).toEqual([twoRows])
  })
})
