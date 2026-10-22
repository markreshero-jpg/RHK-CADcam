import { describe, it, expect } from 'vitest'
import { plateFixedShelfHits, plateHoleHits, type ShelfHole } from '../hingeClash'
import type { ResolvedHingeInstance, ResolvedInternalPart } from '../types'

// Plate screws ±16 about the cup, 37 back from a 582 front (RHK6581 TC-02).
const hinge = (cupY: number) => ({
  row_index: 0, col_index: 0, sort_order: 1, y_position_mm: cupY - 100,
  mount_target: { table: 'case_parts', part_key: 'left_side' },
  cup_drills: [{ x: 24, y: cupY, z: 582, axis: 'z+', radius: 17.5, depthLen: 13, kind: 'cup' }],
  plate_drills: [-16, 16].map(o => ({ x: 16.5, y: cupY + o, z: 545, axis: 'x-', radius: 2.5, depthLen: 12, kind: 'plate' })),
}) as unknown as ResolvedHingeInstance

// Front column of a 5-hole bank, 60 back from the front.
const bank = (part: string, mid: number): ShelfHole[] => [-64, -32, 0, 32, 64].map(o => ({ part, y: mid + o, z: 520, r: 2.5 }))

describe('hinge plate ↔ adj shelf holes', () => {
  it('flags a plate over the hole bank', () => {
    expect(plateHoleHits(hinge(899), bank('left_side', 869)).map(h => h.y)).toEqual([901])
  })
  it('clears once the plate sits above the bank', () => {
    expect(plateHoleHits(hinge(962), bank('left_side', 869))).toEqual([])
  })
  it('ignores holes on the other gable', () => {
    expect(plateHoleHits(hinge(899), bank('right_side', 869))).toEqual([])
  })
  it('ignores holes well behind the plate', () => {
    expect(plateHoleHits(hinge(899), bank('left_side', 869).map(h => ({ ...h, z: 66.5 })))).toEqual([])
  })
})

// RHK6581 Bed 2 TC-03: fixed shelf underside 803.5, 16.5 thick, gable to gable.
const fixedShelf = { part_type: 'fixed_shelf', X: 16.5, Y: 803.5, DX: 808, DY: 373.5, DZ: 16.5 } as unknown as ResolvedInternalPart

describe('hinge plate ↔ fixed shelf', () => {
  it('flags a plate over the shelf (799 hinge)', () => {
    expect(plateFixedShelfHits(hinge(799), [fixedShelf])).toHaveLength(1)
  })
  it('clears a hinge in the drawer gap below', () => {
    expect(plateFixedShelfHits(hinge(565), [fixedShelf])).toEqual([])
  })
  it('ignores a shelf on another bay', () => {
    expect(plateFixedShelfHits(hinge(799), [{ ...fixedShelf, X: 900 } as ResolvedInternalPart])).toEqual([])
  })
})
