import { describe, it, expect } from 'vitest'
import { segmentsFromLegacy, apronSetbackPieces, apronSetbackPlanLines } from '@/src/lib/benchtopGeometry'
import { benchtopGeometries } from '@/src/lib/benchtopSolids'
import { resolveBenchtopParts } from '@/src/lib/benchtop-resolver/resolver'
import type { BenchtopInstance, BenchtopEdgeProfile, BenchtopBuildMethod, BenchtopScheduleRow } from '@/src/lib/types'

const prof = (id: string, generates: BenchtopEdgeProfile['generates'], apron_drop_mm: number | null = null) =>
  ({ id, code: id, name: id, category: 'stone', description: null, generates, apron_drop_mm, radius_mm: null, preview_svg: null, sort_order: 0, active: true, created_at: '', updated_at: '' }) as BenchtopEdgeProfile
const profiles = { MA300: prof('MA300', 'apron', 300), P20: prof('P20', 'none') }

// RHK6468 island: 1080 x 4000, legs 280 at each end. Back edge (x 6188) split
// into leg / seating recess / leg; MA300 round the legs, the recess edge plain
// with the band 300 in.
const island = () => {
  const segs = segmentsFromLegacy([
    { x: 5108, y: -2893 }, { x: 6188, y: -2893 }, { x: 6188, y: -2613 }, { x: 6188, y: 827 }, { x: 6188, y: 1107 }, { x: 5108, y: 1107 },
  ], [], [])
  segs[0].edge = { profile_id: 'MA300' }
  segs[1].edge = { profile_id: 'MA300' }
  segs[2].edge = { profile_id: 'P20', apron_setback: { inset_mm: 300, profile_id: 'MA300' } }
  segs[3].edge = { profile_id: 'MA300' }
  segs[4].edge = { profile_id: 'MA300' }
  segs[5].edge = { profile_id: 'P20' }
  return segs
}

describe('set-back apron', () => {
  it('band 300 in from the edge, mitred returns past both ends covering the legs’ inner faces', () => {
    const sb = apronSetbackPieces(island(), 2, profiles, null, 20)!
    expect(sb).not.toBeNull()
    expect(sb.bandLength).toBe(3440)
    expect(sb.face.map(p => Math.round(p.x))).toEqual([5888, 5888])
    expect(Math.min(...sb.band.map(p => p.x))).toBeCloseTo(5868)
    expect(sb.returns.map(r => [r.side, r.inLine, r.mitre, r.length])).toEqual([['start', true, true, 320], ['end', true, true, 320]])
    const ys = (q: { y: number }[]) => [Math.min(...q.map(p => p.y)), Math.max(...q.map(p => p.y))].map(Math.round)
    expect(ys(sb.returns[0].quad)).toEqual([-2633, -2613])
    expect(ys(sb.returns[1].quad)).toEqual([827, 847])
    // Mitre: the outer corner at the edge, the inner a thickness along.
    expect(sb.returns[0].quad.some(p => Math.round(p.x) === 6168 && Math.round(p.y) === -2633)).toBe(true)
    expect(apronSetbackPlanLines(island(), profiles, null, 20)).toHaveLength(1)
  })

  it('none without a usable apron profile or inset', () => {
    const segs = island()
    segs[2].edge = { apron_setback: { inset_mm: 0, profile_id: 'MA300' } }
    expect(apronSetbackPieces(segs, 2, profiles, null, 20)).toBeNull()
    segs[2].edge = { apron_setback: { inset_mm: 300, profile_id: 'P20' } }
    expect(apronSetbackPieces(segs, 2, profiles, null, 20)).toBeNull()
  })

  it('corner ends: returns inside the edge, band between them', () => {
    // A plain rectangle with the set-back on its back edge and aprons on both ends.
    const segs = segmentsFromLegacy([{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 }, { x: 0, y: 1000 }], [], [])
    segs[0].edge = { apron_setback: { inset_mm: 300, profile_id: 'MA300' } }
    segs[1].edge = { profile_id: 'MA300' }; segs[3].edge = { profile_id: 'MA300' }
    const sb = apronSetbackPieces(segs, 0, profiles, null, 20)!
    expect(sb.returns.map(r => [r.inLine, r.mitre, r.length])).toEqual([[false, false, 300], [false, false, 300]])
    expect(sb.bandLength).toBe(1960)
  })

  it('3D: band + two returns, from the slab underside to the apron bottom', () => {
    const bt = { id: 'bt', segments: island(), cutout_polygons: [] } as unknown as BenchtopInstance
    const geos = benchtopGeometries(bt, { topZ: 920, thick: { total: 20 }, defaultProfileId: null }, profiles)
    const keys = geos.map(g => g.key)
    expect(keys).toEqual(expect.arrayContaining(['slab', 'a1', 'a3', 'sb2', 'sb2s', 'sb2e']))
    const band = geos.find(g => g.key === 'sb2')!.geo
    band.computeBoundingBox()
    const b = band.boundingBox!
    expect([b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z].map(v => Math.round(v))).toEqual([5868, 5888, 620, 900, -2613, 827])
  })

  it('resolver: band + 2 mitred returns as stone supply parts', () => {
    const method = {
      id: 'm', name: 'm', description: null, construction: 'outsourced', active_part_roles: ['stone_slab'],
      strip_width_mm: null, buildup_rail_depth: null, cross_member_spacing_mm: null, default_schedule_id: null,
      drop_front_height: null, default_join_type: 'butt', grain_direction: 'length', corner_join_type: 'butt',
      default_edge_profile_id: null, wizard_answers: {}, is_default: false, active: true, created_at: '', updated_at: '',
    } as BenchtopBuildMethod
    const row: BenchtopScheduleRow = { id: 'r', schedule_id: 's', part_role: 'stone_slab', material_id: null, benchtop_material_id: 'ST', edgeband_id: null }
    const bt = {
      id: 'bt', room_id: 'r', label: null, segments: island(), joins: [], polygon: [], arc_segments: [], edge_tags: [],
      join_types: [], cutout_polygons: [], wall_id: null, wall_side: 'face', height_mm: 900,
      benchtop_build_method_id: null, benchtop_schedule_id: null, notes: null, created_at: '', updated_at: '',
    } as unknown as BenchtopInstance
    const parts = resolveBenchtopParts({
      benchtop: bt, method, scheduleRows: [row], baseHeight: 900,
      boardMaterials: new Map(), surfaceMaterials: new Map([['ST', { name: '20mm Marble', dz: 20 }]]),
      profiles: new Map(Object.entries(profiles)),
    })
    const band = parts.find(p => p.label.startsWith('Set-back Apron'))!
    expect([band.length_mm, band.width_mm, band.thickness_mm, band.quantity, band.supply_item]).toEqual([3440, 280, 20, 1, true])
    const ret = parts.find(p => p.label.startsWith('Apron Return'))!
    expect(ret.label).toContain('mitre 45°')
    expect([ret.length_mm, ret.width_mm, ret.quantity]).toEqual([320, 280, 2])
  })
})
