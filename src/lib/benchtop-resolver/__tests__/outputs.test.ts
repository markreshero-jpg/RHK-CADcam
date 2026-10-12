import { describe, it, expect } from 'vitest'
import { resolveBenchtopParts } from '../resolver'
import { buildSupplyLines, supplyTotals } from "../supply"
import { normalizeBenchtopParts } from "@/src/lib/optimiser/benchtopParts"
import { segmentsFromLegacy, } from '@/src/lib/benchtopGeometry'
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


// Phase 5 outputs: supply sheet lines / totals and optimiser parts.
const stored = (b: BenchtopInstance, ps: ReturnType<typeof resolveBenchtopParts>) =>
  ps.map((p, i) => ({ ...p, id: `row${i}`, benchtop_id: b.id }))
const PROJECT = { id: 'p', name: 'Job', job_number: 'J1' }
const ROOMS = [{ id: 'r', name: 'Kitchen' }]

describe('supply sheet', () => {
  // Area is the real outline (2.34 m² for the L), not the pieces' bounding boxes, plus the 920 × 600 leg.
  it('an outsourced L with a mitre join + a waterfall end lists both pieces and the leg', () => {
    const segs = L().map((s, i) => i === 2 ? { ...s, edge: { wall: false, profile_id: WF, waterfall_join: 'mitre' as const } } : s)
    const b = bt(segs, { label: 'Kitchen top', joins: [{ p0: { x: 2400, y: 600 }, p1: { x: 3000, y: 0 }, type: 'mitre' }] })
    const m = method({ construction: 'outsourced', active_part_roles: ['stone_slab'], default_edge_profile_id: ARR })
    const lines = buildSupplyLines([b], stored(b, resolveBenchtopParts(input(b, m))))
    expect(lines.map(l => [l.role, l.piece, l.length, l.width])).toEqual([
      ['stone_slab', 1, 3000, 600], ['stone_slab', 2, 1500, 600], ['waterfall_panel', 2, 920, 600],
    ])
    expect(lines[2].waterfallJoin).toBe('mitre')
    const t = supplyTotals(lines)
    expect(t.joins).toBe(1)
    expect(t.waterfalls).toBe(1)
    expect(t.byMaterial).toEqual([{ material: '20mm Stone', thickness: 20, items: 3, area_m2: 2.89 }])
    expect(t.byProfile.map(p => p.code)).toEqual(['ARR', 'WF'])
  })

  it('cut parts are not supply lines', () => {
    const b = bt(poly([[0, 0], [2000, 0], [2000, 600], [0, 600]], [0]))
    const lines = buildSupplyLines([b], stored(b, resolveBenchtopParts(input(b, method({ construction: 'buildup_flat', active_part_roles: BUILDUP, strip_width_mm: 90 })))))
    expect(lines).toEqual([])
  })
})

describe('optimiser parts', () => {
  it('built-up parts become one nestable part per unit; the top is the "cabinet"', () => {
    const b = bt(poly([[0, 0], [2000, 0], [2000, 600], [0, 600]], [0]), { label: 'Island' })
    const rows = stored(b, resolveBenchtopParts(input(b, method({
      construction: 'buildup_flat', active_part_roles: BUILDUP, strip_width_mm: 90, cross_member_spacing_mm: 600,
    }))))
    const { parts, cabinets } = normalizeBenchtopParts(PROJECT, ROOMS, [{ id: 'bt', label: 'Island', room_id: 'r' }], rows)
    const qty = rows.reduce((n, r) => n + r.quantity, 0)
    expect(parts).toHaveLength(qty)
    expect(cabinets).toEqual([{ id: 'bt', label: 'Island', room_id: 'r' }])
    const top = parts.find(p => p.label.startsWith('Worktop'))!
    // h runs along the grain (length), w across it.
    expect([top.w, top.h, top.thickness]).toEqual([600, 2000, 16.5])
    expect(new Set(parts.map(p => p.uid)).size).toBe(parts.length)
    expect(parts.every(p => p.source_table === 'benchtop_parts' && p.cabinet_label === 'Island' && p.room_name === 'Kitchen')).toBe(true)
  })

  it('supply items and rows without a board never reach the cut list', () => {
    const b = bt(poly([[0, 0], [2000, 0], [2000, 600], [0, 600]], [0]))
    const rows = stored(b, resolveBenchtopParts(input(b, method({ construction: 'outsourced', active_part_roles: ['stone_slab'] }))))
    expect(normalizeBenchtopParts(PROJECT, ROOMS, [{ id: 'bt', label: null, room_id: 'r' }], rows).parts).toEqual([])
  })

  it('a shaped worktop carries its outline, rotated into the w × h footprint', () => {
    const b = bt(L())
    const rows = stored(b, resolveBenchtopParts(input(b, method({ construction: 'solid', active_part_roles: ['worktop_panel'] }))))
    const [p] = normalizeBenchtopParts(PROJECT, ROOMS, [{ id: 'bt', label: null, room_id: 'r' }], rows).parts
    expect(p.shape).toBeDefined()
    expect(p.shape!.bbox).toEqual({ w: p.w, h: p.h })
    for (const q of p.shape!.polygon) {
      expect(q.x).toBeGreaterThanOrEqual(-0.5); expect(q.x).toBeLessThanOrEqual(p.w + 0.5)
      expect(q.y).toBeGreaterThanOrEqual(-0.5); expect(q.y).toBeLessThanOrEqual(p.h + 0.5)
    }
  })
})
