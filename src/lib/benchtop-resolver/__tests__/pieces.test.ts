import { describe, it, expect } from 'vitest'
import { resolveBenchtopParts } from '../resolver'
import { splitIntoPieces, pieceFrame } from '../pieces'
import { segmentsFromLegacy, mapSegments, rotateFn } from '@/src/lib/benchtopGeometry'
import type {
  BenchtopInstance, BenchtopBuildMethod, BenchtopScheduleRow, BenchtopPartRole, BenchtopEdgeProfile, BenchtopSegment,
} from '@/src/lib/types'
import type { BenchtopResolverInput } from '../types'

const BOARD = 'board-16', STONE = 'stone-20', ARR = 'p-arr', WF = 'p-wf', APR = 'p-apron'

const poly = (pts: [number, number][], wall: number[] = []) =>
  segmentsFromLegacy(pts.map(([x, y]) => ({ x, y })), [], wall.map(i => ({ edge_index: i, type: 'wall' as const })))

function bt(segments: BenchtopSegment[], over: Partial<BenchtopInstance> = {}): BenchtopInstance {
  return {
    id: 'bt', room_id: 'r', label: null, segments, joins: [], polygon: [], arc_segments: [], edge_tags: [],
    join_types: [], cutout_polygons: [], wall_id: null, wall_side: 'face', height_mm: null,
    benchtop_build_method_id: null, benchtop_schedule_id: null, notes: null, created_at: '', updated_at: '', ...over,
  }
}
function method(over: Partial<BenchtopBuildMethod>): BenchtopBuildMethod {
  return {
    id: 'm', name: 'm', description: null, construction: 'solid', active_part_roles: ['worktop_panel'],
    strip_width_mm: null, buildup_rail_depth: null, cross_member_spacing_mm: null, default_schedule_id: null,
    drop_front_height: null, default_join_type: 'butt', grain_direction: 'length', corner_join_type: 'butt',
    default_edge_profile_id: null, wizard_answers: {}, is_default: false, active: true, created_at: '', updated_at: '', ...over,
  }
}
const prof = (id: string, code: string, generates: BenchtopEdgeProfile['generates'], apron_drop_mm: number | null = null): BenchtopEdgeProfile => ({
  id, code, name: code, category: 'stone', description: null, generates, apron_drop_mm, radius_mm: null,
  preview_svg: null, sort_order: 0, active: true, created_at: '', updated_at: '',
})
function input(b: BenchtopInstance, m: BenchtopBuildMethod): BenchtopResolverInput {
  const row = (part_role: BenchtopPartRole, material_id: string | null, benchtop_material_id: string | null = null): BenchtopScheduleRow =>
    ({ id: part_role, schedule_id: 's', part_role, material_id, benchtop_material_id, edgeband_id: null })
  return {
    benchtop: b, method: m, baseHeight: 900,
    scheduleRows: [row('worktop_panel', BOARD), row('buildup_rail', BOARD), row('buildup_cross_member', BOARD), row('stone_slab', null, STONE)],
    boardMaterials: new Map([[BOARD, { name: 'Whiteboard 16.5mm', dz: 16.5 }]]),
    surfaceMaterials: new Map([[STONE, { name: '20mm Stone', dz: 20 }]]),
    profiles: new Map([[ARR, prof(ARR, 'ARR', 'none')], [WF, prof(WF, 'WF', 'waterfall')], [APR, prof(APR, 'APR', 'apron', 60)]]),
  }
}
const BUILDUP: BenchtopPartRole[] = ['worktop_panel', 'buildup_rail', 'buildup_cross_member']
const byLabel = (ps: ReturnType<typeof resolveBenchtopParts>) => Object.fromEntries(ps.map(p => [p.label, p]))

// L against two walls: 3000 along the back wall, 1500 down the right wall, 600 deep.
const L = () => poly([[0, 0], [3000, 0], [3000, 1500], [2400, 1500], [2400, 600], [0, 600]], [0, 1])

describe('pieces', () => {
  it('a join from the inner to the outer corner splits an L into two pieces', () => {
    const pieces = splitIntoPieces(L(), [{ p0: { x: 2400, y: 600 }, p1: { x: 3000, y: 0 }, type: 'mitre' }])
    expect(pieces).toHaveLength(2)
    const sizes = pieces.map(p => { const f = pieceFrame(p.segs); return [Math.round(f.length), Math.round(f.width)] })
    expect(sizes).toEqual([[3000, 600], [1500, 600]])
    expect(pieces.every(p => p.segs.filter(s => s.join === 'mitre').length === 1)).toBe(true)
  })

  it('a join that misses the outline is ignored', () => {
    expect(splitIntoPieces(L(), [{ p0: { x: 50, y: 50 }, p1: { x: 60, y: 60 }, type: 'butt' }])).toHaveLength(1)
  })
})

describe('resolver — shape-true parts', () => {
  it('single-piece L: shaped worktop + a member along every edge with butt set-backs', () => {
    const parts = resolveBenchtopParts(input(bt(L()), method({ construction: 'buildup_flat', active_part_roles: BUILDUP, strip_width_mm: 90 })))
    const wt = parts.find(p => p.part_role === 'worktop_panel')!
    expect(wt).toMatchObject({ length_mm: 3000, width_mm: 1500, piece: null })
    expect(wt.outline?.length).toBeGreaterThan(4)
    const rails = parts.filter(p => p.part_role === 'buildup_rail').map(p => [p.label, p.length_mm, p.quantity])
    expect(rails).toEqual(expect.arrayContaining([
      ['Build-Up Strip — Back', 3000, 1],    // back wall runs through
      ['Build-Up Strip — Back', 1320, 1],    // right wall, set back at both ends
      ['Build-Up Strip — Front', 2400, 1],
      ['Build-Up Strip — Front', 600, 1],    // end of the return
      ['Build-Up Strip — Ends', 720, 1],     // inner side of the return
      ['Build-Up Strip — Ends', 420, 1],     // left end
    ]))
  })

  it('L split by a mitre join: one panel per piece, join recorded, members along the join', () => {
    const top = bt(L(), { joins: [{ p0: { x: 2400, y: 600 }, p1: { x: 3000, y: 0 }, type: 'mitre' }] })
    const parts = byLabel(resolveBenchtopParts(input(top, method({ construction: 'buildup_flat', active_part_roles: BUILDUP, strip_width_mm: 90 }))))
    expect(parts['Worktop Panel — Piece 1']).toMatchObject({ length_mm: 3000, width_mm: 600, piece: 1 })
    expect(parts['Worktop Panel — Piece 2']).toMatchObject({ length_mm: 1500, width_mm: 600, piece: 2 })
    expect(parts['Worktop Panel — Piece 1'].meta?.joins).toEqual([{ type: 'mitre', length: 849 }])
    expect(parts['Build-Up Strip — Join — Piece 1']).toBeDefined()
    expect(parts['Build-Up Strip — Join — Piece 2']).toBeDefined()
  })

  it('cross members take the real width where they cross', () => {
    const parts = resolveBenchtopParts(input(bt(L()), method({ construction: 'buildup_flat', active_part_roles: BUILDUP, strip_width_mm: 90, cross_member_spacing_mm: 600 })))
    const cross = parts.filter(p => p.part_role === 'buildup_cross_member')
    // 3000 run → 4 members, all in the 600-deep run (600 − 2×90)
    expect(cross).toEqual([expect.objectContaining({ length_mm: 420, quantity: 4 })])
  })

  it('a rotated top is sized along its own axis', () => {
    const segs = mapSegments(poly([[0, 0], [2000, 0], [2000, 600], [0, 600]]), rotateFn({ x: 0, y: 0 }, Math.PI / 6))
    const wt = resolveBenchtopParts(input(bt(segs), method({})))[0]
    expect(wt).toMatchObject({ length_mm: 2000, width_mm: 600, outline: null })
  })

  it('island with waterfall ends: mitre leg to the top surface, butt leg to the underside', () => {
    const segs = poly([[0, 0], [2400, 0], [2400, 900], [0, 900]])
    segs[1].edge = { profile_id: WF, waterfall_join: 'mitre' }
    segs[3].edge = { profile_id: WF, waterfall_join: 'butt' }
    const parts = byLabel(resolveBenchtopParts(input(bt(segs), method({ construction: 'outsourced', active_part_roles: ['stone_slab'] }))))
    expect(parts['Waterfall Leg — mitred']).toMatchObject({ length_mm: 920, width_mm: 900, thickness_mm: 20, supply_item: true, benchtop_material_name: '20mm Stone' })
    expect(parts['Waterfall Leg — butt']).toMatchObject({ length_mm: 900, width_mm: 900, supply_item: true })
  })

  it('outsourced: one supply item per piece with area, lineal metres per profile and cutouts', () => {
    const segs = poly([[0, 0], [2400, 0], [2400, 900], [0, 900]])
    segs[1].edge = { profile_id: WF }; segs[3].edge = { profile_id: WF }
    const top = bt(segs, { cutout_polygons: [[{ x: 800, y: 200 }, { x: 1600, y: 200 }, { x: 1600, y: 650 }, { x: 800, y: 650 }]] })
    const parts = resolveBenchtopParts(input(top, method({ construction: 'outsourced', active_part_roles: ['stone_slab'], default_edge_profile_id: ARR })))
    const slab = parts.find(p => p.part_role === 'stone_slab')!
    expect(slab).toMatchObject({ length_mm: 2400, width_mm: 900, supply_item: true })
    expect(slab.meta).toMatchObject({ area_m2: 2.16, profiles: { ARR: 4800, WF: 1800 }, waterfalls: 2, cutouts: [{ w: 800, h: 450, round: false }] })
  })

  it('apron profile makes an apron strip at its drop', () => {
    const segs = poly([[0, 0], [2000, 0], [2000, 600], [0, 600]], [0])
    segs[2].edge = { profile_id: APR }
    const parts = resolveBenchtopParts(input(bt(segs), method({ construction: 'solid' })))
    expect(parts.find(p => p.part_role === 'apron_strip')).toMatchObject({ length_mm: 2000, width_mm: 60, thickness_mm: 16.5 })
  })
  it('built-up waterfall: a mitred apron deeper than the top adds a face piece + return at that end', () => {
    // Wall run (RHK6592): back + right on walls, APR 60 front, waterfall on the left.
    const segs = poly([[0, 0], [1560, 0], [1560, 600], [0, 600]], [0, 1])
    segs[2].edge = { profile_id: APR }
    segs[3].edge = { profile_id: WF, waterfall_join: 'mitre' }
    const all = resolveBenchtopParts(input(bt(segs), method({ construction: 'outsourced', active_part_roles: ['stone_slab'] })))
    const parts = byLabel(all)
    expect(parts['Waterfall Leg — mitred']).toMatchObject({ length_mm: 920, width_mm: 600, thickness_mm: 20 })
    expect(parts['Waterfall Face (APR)']).toMatchObject({ part_role: 'waterfall_face', length_mm: 920, width_mm: 60, thickness_mm: 20, supply_item: true })
    expect(parts['Waterfall Return']).toMatchObject({ part_role: 'waterfall_return', length_mm: 900, width_mm: 100, thickness_mm: 20, supply_item: true })
    expect(all.filter(p => p.part_role === 'waterfall_face')).toHaveLength(1)   // the back end is on the wall
  })
})
