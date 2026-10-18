// Benchtop cutouts to the CNC (z_fixtures gap 1): the worktop carries the
// sink / cooktop cutouts as holes; a cross member that lands in one moves across.
import { describe, it, expect } from 'vitest'
import { resolveBenchtopParts } from '../resolver'
import { crossMemberPositions, CUTOUT_CLEARANCE } from '../construction'
import type { BenchtopBuildMethod, BenchtopInstance, BenchtopScheduleRow, BenchtopPartRole } from '@/src/lib/types'

const BOARD = 'board-16'
const sink = [{ x: 1100, y: 100 }, { x: 1900, y: 100 }, { x: 1900, y: 500 }, { x: 1100, y: 500 }]

function input(cutouts: { x: number; y: number }[][]) {
  const benchtop = {
    id: 'bt', room_id: 'room', label: null,
    polygon: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 600 }, { x: 0, y: 600 }],
    segments: [], joins: [], arc_segments: [], edge_tags: [], join_types: [], cutout_polygons: cutouts,
    wall_id: null, wall_side: 'face', height_mm: null,
    benchtop_build_method_id: null, benchtop_schedule_id: null, notes: null, created_at: '', updated_at: '',
  } as unknown as BenchtopInstance
  const method = {
    id: 'm', name: 'm', description: null, construction: 'buildup_flat',
    active_part_roles: ['worktop_panel', 'buildup_rail', 'buildup_cross_member'], strip_width_mm: 90, buildup_rail_depth: null,
    cross_member_spacing_mm: 600, default_schedule_id: null, drop_front_height: null,
    default_join_type: 'butt', grain_direction: 'length', corner_join_type: 'butt',
    default_edge_profile_id: null, wizard_answers: {}, is_default: false, active: true, created_at: '', updated_at: '',
  } as BenchtopBuildMethod
  const row = (part_role: BenchtopPartRole): BenchtopScheduleRow =>
    ({ id: part_role, schedule_id: 's', part_role, material_id: BOARD, benchtop_material_id: null, edgeband_id: null })
  return {
    benchtop, method,
    scheduleRows: [row('worktop_panel'), row('buildup_rail'), row('buildup_cross_member')],
    boardMaterials: new Map([[BOARD, { name: 'Whiteboard 16.5mm', dz: 16.5 }]]),
    surfaceMaterials: new Map(),
  }
}

describe('cross members clear of cutouts', () => {
  it('no cutouts: the even spacing as before', () => {
    expect(crossMemberPositions(2820, 90, 600, 90)).toEqual([654, 1218, 1782, 2346])
  })
  it('a member in a cutout moves to the nearer clear side', () => {
    const at = crossMemberPositions(2820, 90, 600, 90, [{ x0: 1100, x1: 1900 }])
    expect(at).toEqual([654, 1100 - CUTOUT_CLEARANCE - 45, 1900 + CUTOUT_CLEARANCE + 45, 2346])
  })
  it('no room either side between the end members: left out', () => {
    expect(crossMemberPositions(600, 90, 300, 90, [{ x0: 100, x1: 680 }])).toEqual([])
  })
  it('two that would land on each other: one kept', () => {
    const at = crossMemberPositions(1000, 90, 250, 90, [{ x0: 300, x1: 900 }])
    for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) expect(Math.abs(at[i] - at[j])).toBeGreaterThanOrEqual(90)
  })
})

describe('resolver: worktop holes', () => {
  it('the worktop carries the sink cutout in its own frame; build-up strips are not cut', () => {
    const parts = resolveBenchtopParts(input([sink]))
    const top = parts.find(p => p.part_role === 'worktop_panel')!
    expect(top.holes).toEqual([sink])
    expect(top.meta?.cutouts).toEqual([{ w: 800, h: 400, round: false }])
    for (const p of parts.filter(p => p.part_role !== 'worktop_panel')) expect(p.holes ?? null).toBeNull()
    const cross = parts.filter(p => p.part_role === 'buildup_cross_member')
    expect(cross.reduce((a, p) => a + p.quantity, 0)).toBe(4)
    expect(cross.every(p => p.length_mm === 420)).toBe(true)
  })
  it('no cutouts: no holes', () => {
    const top = resolveBenchtopParts(input([])).find(p => p.part_role === 'worktop_panel')!
    expect(top.holes).toBeNull()
  })
})
