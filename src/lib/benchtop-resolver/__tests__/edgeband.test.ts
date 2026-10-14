import { describe, it, expect } from 'vitest'
import { resolveBenchtopParts } from '../resolver'
import { normalizeBenchtopParts, benchtopEbIds } from '@/src/lib/optimiser/benchtopParts'
import { segmentsFromLegacy } from '@/src/lib/benchtopGeometry'
import { tapeTotals, edgeTape, paintTape, paintProfile, setTapes } from '@/src/lib/benchtopEdgeband'
import type {
  BenchtopInstance, BenchtopBuildMethod, BenchtopScheduleRow, BenchtopPartRole, BenchtopEdgeProfile, BenchtopSegment, BenchtopEdge,
} from '@/src/lib/types'
import type { BenchtopResolverInput } from '../types'

// Benchtop Phase 7 — edge tape per edge, through the resolver to the optimiser.
const BOARD = 'board-16', STONE = 'stone-20', WF = 'p-wf', T1 = 'tape-1', T2 = 'tape-2'

// 2000 × 600, back edge (0) on the wall; 1 = right end, 2 = front, 3 = left end.
const rect = (edges: Record<number, BenchtopEdge> = {}): BenchtopSegment[] =>
  segmentsFromLegacy([{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 600 }, { x: 0, y: 600 }], [], [{ edge_index: 0, type: 'wall' }])
    .map((s, i) => (edges[i] ? { ...s, edge: { ...s.edge, ...edges[i] } } : s))

const bt = (segments: BenchtopSegment[]): BenchtopInstance => ({
  id: 'bt', room_id: 'r', label: null, segments, joins: [], polygon: [], arc_segments: [], edge_tags: [],
  join_types: [], cutout_polygons: [], wall_id: null, wall_side: 'face', height_mm: null,
  benchtop_build_method_id: null, benchtop_schedule_id: null, notes: null, created_at: '', updated_at: '',
})
const method = (over: Partial<BenchtopBuildMethod>): BenchtopBuildMethod => ({
  id: 'm', name: 'm', description: null, construction: 'buildup_flat',
  active_part_roles: ['worktop_panel', 'buildup_rail'], strip_width_mm: 90, buildup_rail_depth: null,
  cross_member_spacing_mm: null, default_schedule_id: null, drop_front_height: null, default_join_type: 'butt',
  grain_direction: 'length', corner_join_type: 'butt', default_edge_profile_id: null, wizard_answers: {},
  is_default: false, active: true, created_at: '', updated_at: '', ...over,
})
const wf: BenchtopEdgeProfile = {
  id: WF, code: 'WF', name: 'WF', category: 'board', description: null, generates: 'waterfall', apron_drop_mm: null,
  radius_mm: null, preview_svg: null, sort_order: 0, active: true, created_at: '', updated_at: '',
}
function input(segs: BenchtopSegment[], m: BenchtopBuildMethod): BenchtopResolverInput {
  const row = (part_role: BenchtopPartRole, material_id: string | null, benchtop_material_id: string | null, edgeband_id: string | null): BenchtopScheduleRow =>
    ({ id: part_role, schedule_id: 's', part_role, material_id, benchtop_material_id, edgeband_id })
  return {
    benchtop: bt(segs), method: m, baseHeight: 900,
    scheduleRows: [row('worktop_panel', BOARD, null, T1), row('buildup_rail', BOARD, null, null), row('stone_slab', null, STONE, null)],
    boardMaterials: new Map([[BOARD, { name: 'Whiteboard 16.5mm', dz: 16.5 }]]),
    surfaceMaterials: new Map([[STONE, { name: '20mm Stone', dz: 20 }]]),
    profiles: new Map([[WF, wf]]),
  }
}
const find = (ps: ReturnType<typeof resolveBenchtopParts>, label: string) => ps.find(p => p.label === label)!

describe('benchtop edge tape (Phase 7)', () => {
  it('defaults: the schedule tape on every exposed edge — worktop sides + metres, members under it', () => {
    const ps = resolveBenchtopParts(input(rect(), method({})))
    const top = find(ps, 'Worktop Panel')
    // Piece frame: x along the wall, y off it — y0 is the back (wall), yW the front.
    expect(top.edgebands).toEqual({ sides: { xL: T1, yW: T1, x0: T1 }, mm: { [T1]: 3200 } })
    // Front strip runs through: outer face + both ends taped. Ends are set back: outer face only.
    expect(find(ps, 'Build-Up Strip — Front').edgebands).toEqual({ sides: { y0: T1, x0: T1, xL: T1 } })
    expect(ps.filter(p => p.label === 'Build-Up Strip — Ends').every(p => JSON.stringify(p.edgebands) === JSON.stringify({ sides: { y0: T1 } }))).toBe(true)
    // Back strip on the wall: no face tape, but its ends sit under the taped ends.
    expect(find(ps, 'Build-Up Strip — Back').edgebands).toEqual({ sides: { x0: T1, xL: T1 } })
  })

  it('hand-set edges: no tape on the front, another tape on one end', () => {
    const ps = resolveBenchtopParts(input(rect({ 1: { edgeband_id: T2 }, 2: { edgeband_id: null } }), method({})))
    expect(find(ps, 'Worktop Panel').edgebands).toEqual({ sides: { xL: T2, x0: T1 }, mm: { [T2]: 600, [T1]: 600 } })
    expect(find(ps, 'Build-Up Strip — Front').edgebands).toEqual({ sides: { x0: T2, xL: T1 } })
  })

  it('stone / supplied tops never take tape', () => {
    const ps = resolveBenchtopParts(input(rect({ 2: { edgeband_id: T2 } }), method({ construction: 'outsourced', active_part_roles: ['stone_slab'] })))
    expect(ps.every(p => !p.edgebands)).toBe(true)
  })

  it('a mitred waterfall end is not taped; the leg takes the front tape on its upright edge', () => {
    const segs = rect({ 1: { profile_id: WF, waterfall_join: 'mitre', edgeband_id: T2 } })
    const ps = resolveBenchtopParts(input(segs, method({})))
    expect(find(ps, 'Worktop Panel').edgebands!.sides).toEqual({ yW: T1, x0: T1 })
    const leg = ps.find(p => p.part_role === 'waterfall_panel')!
    // Leg = 900 + 33 (16.5 top + 16.5 strip). p0 end meets the wall edge, p1 end the front.
    expect(leg.edgebands).toEqual({ sides: { yW: T1 }, mm: { [T1]: 933 } })
    // The canvas totals agree with the parts: 2000 front + 600 left end + the leg's upright.
    expect(edgeTape(segs[1], wf, T1)).toBeNull()
    expect(tapeTotals(segs, s => (s.edge?.profile_id === WF ? wf : undefined), T1, 933)).toEqual(new Map([[T1, 3533]]))
  })

  it('optimiser: sides become footprint deductions; unknown thickness is flagged', () => {
    const ps = resolveBenchtopParts(input(rect(), method({})))
    const rows = ps.map((p, i) => ({ ...p, id: `row${i}`, benchtop_id: 'bt' }))
    expect(benchtopEbIds(rows)).toEqual([T1])
    const room = [{ id: 'r', name: 'K' }], proj = { id: 'p', name: 'J', job_number: null }
    const top = normalizeBenchtopParts(proj, room, [{ id: 'bt', label: null, room_id: 'r' }], rows, new Map([[T1, 1]]))
      .parts.find(p => p.label === 'Worktop Panel')!
    // Length grain: footprint 600 wide × 2000 high. Front (yW) → x = w; the ends → h.
    expect([top.w, top.h, top.eb_w1, top.eb_w2, top.eb_h1, top.eb_h2, top.eb_missing]).toEqual([600, 2000, 0, 1, 1, 1, false])
    const unknown = normalizeBenchtopParts(proj, room, [{ id: 'bt', label: null, room_id: 'r' }], rows).parts.find(p => p.label === 'Worktop Panel')!
    expect(unknown.eb_missing).toBe(true)
  })

  it('painting: the same chip again takes it off; the default is stored as no override; reset clears', () => {
    const none = () => undefined
    let segs = rect()
    segs = paintTape(segs, 2, T2, T1, none)                 // front → T2
    expect(segs[2].edge?.edgeband_id).toBe(T2)
    segs = paintTape(segs, 2, T2, T1, none)                 // again → off
    expect(segs[2].edge?.edgeband_id).toBeNull()
    segs = paintTape(segs, 2, T1, T1, none)                 // the default tape → no override
    expect('edgeband_id' in (segs[2].edge ?? {})).toBe(false)
    expect(paintTape(segs, 0, T2, T1, none)).toBe(segs)     // wall edge: untouched
    segs = paintTape(setTapes(segs, [1, 3], null, T1), 1, T2, T1, none, true)
    expect([segs[1].edge?.edgeband_id, segs[3].edge?.edgeband_id]).toEqual([undefined, null])
  })

  it('painting profiles: Wall chip toggles, a profile chip toggles back to the default', () => {
    let segs = rect({ 2: { edgeband_id: T2 } })
    segs = paintProfile(segs, 2, WF)
    expect(segs[2].edge).toMatchObject({ wall: false, profile_id: WF })
    segs = paintProfile(segs, 2, WF)
    expect(segs[2].edge?.profile_id).toBeUndefined()
    segs = paintProfile(segs, 2, 'wall')                   // wall drops profile + tape
    expect(segs[2].edge).toEqual({ wall: true })
    segs = paintProfile(segs, 2, 'wall')
    expect(segs[2].edge?.wall).toBe(false)
  })
})
