import { describe, it, expect } from 'vitest'
import { backTopMarker } from '../../slideDrilling'
import type { ResolvedSlideDrill } from '../../resolver/types'

// Drawer back top marker (Mark 2026-10-31): a 2-deep prick 6 below the top
// fixing hole, so the shop can tell which edge of the back is up.
const hole = (y: number, surface: ResolvedSlideDrill['surface'] = 'drawer_back'): ResolvedSlideDrill => ({
  x: 9, y, z: 20, axis: 'z+', radius: 2.5, depthLen: 12, surface, side: 'left', machine_operation: 'drill',
})

describe('drawer back top marker', () => {
  it('sits 6 below the top fixing hole, 2 deep, same bit', () => {
    const m = backTopMarker([hole(32), hole(96), hole(40, 'drawer_side')])
    expect(m).toMatchObject({ x: 9, y: 90, z: 20, axis: 'z+', radius: 2.5, depthLen: 2 })
  })
  it('none when the runner has no back holes', () => {
    expect(backTopMarker([hole(32, 'cabinet_member')])).toBeNull()
  })
})
