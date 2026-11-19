import { describe, it, expect } from 'vitest'
import { checkInnerDrawerRailClash } from '../resolver/innerDrawerRailClash'
import type { FingerRail } from '../resolver/resolveFingerRails'
import type { ResolvedInternalPart } from '../resolver/types'

// RHK6571 BC-09: D24 set back rail at 690–740 (base 442–475 deep), inner front 581–694.
const rail = { key: 'fprail:1', bottom: 690, top: 740, x0: 0, x1: 800, frontZ: 475, thickness: 16.5, setback: 16.5, material_id: 'm' } as FingerRail
const front = (y: number) => ({ part_type: 'inner_drawer_front', DX: 113, DY: 763, DZ: 16.5, X: 18.5, Y: y, Z: 471.5, inner_drawer_index: 0 }) as unknown as ResolvedInternalPart

describe('inner drawer ↔ finger rail clash', () => {
  it('flags a front running into the rail', () => {
    const e = checkInnerDrawerRailClash([rail], [front(581)])
    expect(e.map(x => x.code)).toEqual(['INNER_DRAWER_RAIL_CLASH'])
  })
  it('flags a front inside the clearance', () => expect(checkInnerDrawerRailClash([rail], [front(575)])).toHaveLength(1))
  it('passes with the clearance', () => expect(checkInnerDrawerRailClash([rail], [front(572)])).toHaveLength(0))
  it('ignores a rail beside the drawer', () => expect(checkInnerDrawerRailClash([{ ...rail, x0: 900, x1: 1000 }], [front(581)])).toHaveLength(0))
})
