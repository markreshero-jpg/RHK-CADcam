import { describe, it, expect } from 'vitest'
import { filterHiddenParts, filterHiddenMap } from '../filterHidden'
import type { ResolvedCabinet } from '../types'

const rp = (over: Partial<ResolvedCabinet> = {}): ResolvedCabinet => ({
  cabinet_id: 'c1',
  case_parts: [{ part_key: 'left_side' }, { part_key: 'back' }] as unknown as ResolvedCabinet['case_parts'],
  toekick_parts: [], internal_parts: [{ part_type: 'shelf', sort_order: 0 }] as unknown as ResolvedCabinet['internal_parts'],
  internal_slides: [], face_rows: [], face_cols: [], face_zones: [], drawer_stacks: [],
  seam_joints: [], hinge_instances: [], errors: [], warnings: [],
  custom_parts: [{ id: 'p1', hide_views: ['plan'] }, { id: 'p2' }] as unknown as ResolvedCabinet['custom_parts'],
  ...over,
})

describe('filterHiddenParts (per view)', () => {
  const cab = rp({ part_hide_views: { case_back: ['plan', '3d'], int_shelf_0: ['elevation'] } })

  it('strips only the parts hidden in that view', () => {
    const plan = filterHiddenParts(cab, 'plan')
    expect(plan.case_parts.map(p => p.part_key)).toEqual(['left_side'])
    expect(plan.internal_parts).toHaveLength(1)
    expect(plan.custom_parts!.map(p => p.id)).toEqual(['p2'])

    const elev = filterHiddenParts(cab, 'elevation')
    expect(elev.case_parts).toHaveLength(2)
    expect(elev.internal_parts).toHaveLength(0)
    expect(elev.custom_parts).toHaveLength(2)
  })

  it('returns the same object when nothing is hidden in the view', () => {
    const c = rp({ part_hide_views: { case_back: ['plan'] }, custom_parts: [] })
    expect(filterHiddenParts(c, '3d')).toBe(c)
  })

  it('showHidden returns the map untouched', () => {
    const m = new Map([['c1', cab]])
    expect(filterHiddenMap(m, 'plan', true)).toBe(m)
    expect(filterHiddenMap(m, 'plan').get('c1')!.case_parts).toHaveLength(1)
  })
})
