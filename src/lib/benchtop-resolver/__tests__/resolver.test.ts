import { describe, it, expect } from 'vitest'
import { resolveBenchtopParts } from '../resolver'
import type { BenchtopBuildMethod, BenchtopInstance, BenchtopScheduleRow, BenchtopPartRole } from '@/src/lib/types'
import type { BenchtopResolverInput } from '../types'

const BOARD = 'board-16'
const STONE = 'stone-20'

// 1073 × 560 rectangle — the Kitchen benchtop used for the first live resolve.
function benchtop(): BenchtopInstance {
  return {
    id: 'bt', room_id: 'room', label: null,
    polygon: [{ x: 0, y: 0 }, { x: 1073, y: 0 }, { x: 1073, y: 560 }, { x: 0, y: 560 }],
    segments: [], joins: [],
    arc_segments: [], edge_tags: [], join_types: [], cutout_polygons: [],
    wall_id: null, wall_side: 'face', height_mm: null,
    benchtop_build_method_id: null, benchtop_schedule_id: null, notes: null,
    created_at: '', updated_at: '',
  }
}

function method(over: Partial<BenchtopBuildMethod>): BenchtopBuildMethod {
  return {
    id: 'm', name: 'm', description: null, construction: 'solid',
    active_part_roles: ['worktop_panel'], strip_width_mm: null, buildup_rail_depth: null,
    cross_member_spacing_mm: null, default_schedule_id: null, drop_front_height: null,
    default_join_type: 'butt', grain_direction: 'length', corner_join_type: 'butt',
    default_edge_profile_id: null, wizard_answers: {}, is_default: false, active: true,
    created_at: '', updated_at: '',
    ...over,
  }
}

function input(m: BenchtopBuildMethod): BenchtopResolverInput {
  const row = (part_role: BenchtopPartRole, material_id: string | null, benchtop_material_id: string | null = null): BenchtopScheduleRow =>
    ({ id: part_role, schedule_id: 's', part_role, material_id, benchtop_material_id, edgeband_id: null })
  return {
    benchtop: benchtop(),
    method: m,
    scheduleRows: [
      row('worktop_panel', BOARD), row('buildup_rail', BOARD), row('buildup_cross_member', BOARD),
      row('stone_slab', null, STONE),
    ],
    boardMaterials:   new Map([[BOARD, { name: 'Whiteboard 16.5mm', dz: 16.5 }]]),
    surfaceMaterials: new Map([[STONE, { name: '20mm Stone', dz: 20 }]]),
  }
}

const BUILDUP_ROLES: BenchtopPartRole[] = ['worktop_panel', 'buildup_rail', 'buildup_cross_member']
const byLabel = (parts: ReturnType<typeof resolveBenchtopParts>) => Object.fromEntries(parts.map(p => [p.label, p]))

describe('benchtop resolver — construction types', () => {
  it('buildup_flat: strips are strip-width wide; ends and cross members set back by strip width', () => {
    const parts = byLabel(resolveBenchtopParts(input(method({
      construction: 'buildup_flat', active_part_roles: BUILDUP_ROLES,
      strip_width_mm: 90, cross_member_spacing_mm: 600,
    }))))
    expect(parts['Worktop Panel']).toMatchObject({ length_mm: 1073, width_mm: 560, thickness_mm: 16.5, supply_item: false })
    expect(parts['Build-Up Strip — Front']).toMatchObject({ length_mm: 1073, width_mm: 90, thickness_mm: 16.5 })
    expect(parts['Build-Up Strip — Ends']).toMatchObject({ length_mm: 380, width_mm: 90, quantity: 2 })
    // inner run 1073 − 180 = 893 → 2 bays at ≤600 → 1 cross strip
    expect(parts['Build-Up Strip — Cross']).toMatchObject({ length_mm: 380, width_mm: 90, quantity: 1 })
  })

  it('buildup_flat with mitre corners: ends run full depth', () => {
    const parts = byLabel(resolveBenchtopParts(input(method({
      construction: 'buildup_flat', active_part_roles: BUILDUP_ROLES,
      strip_width_mm: 90, corner_join_type: 'mitre',
    }))))
    expect(parts['Build-Up Strip — Ends'].length_mm).toBe(560)
  })

  it('buildup_vertical: rails are rail-height wide; ends set back by board thickness', () => {
    const parts = byLabel(resolveBenchtopParts(input(method({
      construction: 'buildup_vertical', active_part_roles: BUILDUP_ROLES,
      buildup_rail_depth: 50, cross_member_spacing_mm: 400,
    }))))
    expect(parts['Build-Up Rail — Front']).toMatchObject({ length_mm: 1073, width_mm: 50 })
    expect(parts['Build-Up Rail — Ends']).toMatchObject({ length_mm: 527, quantity: 2 })
    // inner run 1073 − 33 = 1040 → 3 bays at ≤400 → 2 cross members
    expect(parts['Build-Up Cross Member']).toMatchObject({ length_mm: 527, width_mm: 50, quantity: 2 })
  })

  it('cross member spacing falls back to 600 when blank', () => {
    const parts = byLabel(resolveBenchtopParts(input(method({
      construction: 'buildup_flat', active_part_roles: BUILDUP_ROLES, strip_width_mm: 90,
    }))))
    expect(parts['Build-Up Strip — Cross'].quantity).toBe(1)
  })

  it('a short run needs no cross members', () => {
    const inp = input(method({ construction: 'buildup_flat', active_part_roles: BUILDUP_ROLES, strip_width_mm: 90 }))
    inp.benchtop.polygon = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 560 }, { x: 0, y: 560 }]
    const labels = resolveBenchtopParts(inp).map(p => p.label)
    expect(labels).not.toContain('Build-Up Strip — Cross')
  })

  it('solid: no build-up parts even if the roles are ticked', () => {
    const parts = resolveBenchtopParts(input(method({
      construction: 'solid', active_part_roles: BUILDUP_ROLES, strip_width_mm: 90, buildup_rail_depth: 50,
    })))
    expect(parts.map(p => p.part_role)).toEqual(['worktop_panel'])
  })

  it('outsourced: surface parts are supply items, not cut parts', () => {
    const parts = resolveBenchtopParts(input(method({
      construction: 'outsourced', active_part_roles: ['stone_slab'],
    })))
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ part_role: 'stone_slab', thickness_mm: 20, supply_item: true, benchtop_material_name: '20mm Stone' })
  })
})
