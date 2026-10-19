import { describe, it, expect } from 'vitest'
import { filterHiddenParts, filterHiddenMap, filterRemovedParts } from '../filterHidden'
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

describe('filterRemovedParts (hidden in all views = not made)', () => {
  const ALL = ['plan', 'elevation', '3d'] as const
  const seam = (a: string, b: string) => ({ seam_key: `${a}:${b}`, part_a_key: a, part_b_key: b })
  const cab = rp({
    part_hide_views: { case_back: [...ALL], int_shelf_0: ['plan'], zone_0_0: [...ALL] },
    seam_joints: [seam('back', 'left_side'), seam('bottom', 'left_side'), seam('int_shelf_0', 'left_side')] as unknown as ResolvedCabinet['seam_joints'],
    hinge_instances: [
      { row_index: 0, col_index: 0, mount_target: { table: 'case_parts', part_key: 'left_side' } },
      { row_index: 1, col_index: 0, mount_target: { table: 'case_parts', part_key: 'back' } },
      { row_index: 2, col_index: 0, mount_target: { table: 'case_parts', part_key: 'left_side' } },
    ] as unknown as ResolvedCabinet['hinge_instances'],
    drawer_stacks: [{ face_zone_row: 0, face_zone_col: 0, box_parts: [], slides: [{ side: 'left' }] }] as unknown as ResolvedCabinet['drawer_stacks'],
    custom_parts: [{ id: 'p1', hide_views: [...ALL] }, { id: 'p2', hide_views: ['3d'] }] as unknown as ResolvedCabinet['custom_parts'],
  })
  const made = filterRemovedParts(cab)

  it('drops removed parts but keeps partially hidden ones', () => {
    expect(made.case_parts.map(p => p.part_key)).toEqual(['left_side'])
    expect(made.internal_parts).toHaveLength(1)
    expect(made.custom_parts!.map(p => p.id)).toEqual(['p2'])
  })

  it('drops the drilling the removed parts cause', () => {
    expect(made.seam_joints.map(s => s.seam_key)).toEqual(['bottom:left_side', 'int_shelf_0:left_side'])
    // hinge on the removed door (0,0) and the one plated to the removed back go
    expect(made.hinge_instances.map(h => h.row_index)).toEqual([2])
    expect(made.drawer_stacks[0].slides).toHaveLength(0)
  })

  it('returns the same object when nothing is removed', () => {
    const c = rp({ part_hide_views: { case_back: ['plan'] } })
    expect(filterRemovedParts(c)).toBe(c)
  })
})
