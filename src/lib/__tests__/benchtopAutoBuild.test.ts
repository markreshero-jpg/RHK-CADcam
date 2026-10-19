import { describe, it, expect } from 'vitest'
import { planAutoBuild, type AutoBuildSettings } from '../benchtopAutoBuild'
import { outlinePoints, signedArea } from '../benchtopGeometry'
import type { Wall, CabinetInstance, BenchtopSegment } from '../types'

// Auto-build tops (BENCHTOP-SPEC Phase 8). 3 m square room, walls on the inside faces.
const wall = (id: string, x: number, y: number, angle: number, length: number, extra: Partial<Wall> = {}): Wall => ({
  id, room_id: 'r', name: id, sort_order: 0, length, height: null, soffit_height: null,
  angle, pos_x: x, pos_y: y, thickness: 90, wall_type: 'standard', created_at: '', ...extra,
})
const ROOM = [wall('W1', 0, 0, 0, 3000), wall('W2', 3000, 0, 90, 3000), wall('W3', 3000, 3000, 180, 3000), wall('W4', 0, 3000, 270, 3000)]
const [W1, W2] = ROOM
let n = 0
const cab = (w: Wall, x: number, y: number, dx: number, extra: Partial<CabinetInstance> = {}) =>
  ({ id: `c${n++}`, wall_id: w.id, pos_x: x, pos_y: y, dx, dz: 580, dy: 870, rotation: w.angle, footprint: null, assembly_class: 'base', ...extra }) as unknown as CabinetInstance

const S: AutoBuildSettings = { frontOverhang: 40, endOverhang: 20, bridgeGap: 650, corner: 'mitre', islandBackOverhang: 0, skipCovered: true,
  waterfall: 'none', waterfallJoin: 'mitre', waterfallProfileId: 'WF', waterfallOverhang: 33, edgeProfileId: null }
const areaOf = (s: BenchtopSegment[]) => Math.abs(signedArea(outlinePoints(s, 4)))
const bbox = (s: BenchtopSegment[]) => {
  const p = outlinePoints(s, 4), xs = p.map(q => Math.round(q.x)), ys = p.map(q => Math.round(q.y))
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(v => v + 0)
}

describe('auto-build benchtops', () => {
  it('a free-standing run: front overhang + both open ends overhang; back is a wall edge', () => {
    const r = planAutoBuild({ walls: ROOM, cabinets: [cab(W1, 500, 0, 600), cab(W1, 1100, 0, 600)] }, S)
    expect(r.tops).toHaveLength(1)
    const t = r.tops[0]
    expect(bbox(t.segs)).toEqual([480, 0, 1720, 620])
    expect(t.ends).toEqual(['open', 'open'])
    expect(t.segs.filter(s => s.edge?.wall)).toHaveLength(1)
    expect(t.length).toBe(1240)
    expect(t.depth).toBe(620)
  })

  it('an end against a wall gets no overhang (and the end edge is a wall edge)', () => {
    const r = planAutoBuild({ walls: ROOM, cabinets: [cab(W1, 0, 0, 600), cab(W1, 600, 0, 600)] }, S)
    const t = r.tops[0]
    expect(bbox(t.segs)).toEqual([0, 0, 1220, 620])
    expect(t.ends).toEqual(['wall', 'open'])
    expect(t.segs.filter(s => s.edge?.wall)).toHaveLength(2)
  })

  it('per-top overrides: front / end overhangs, skip', () => {
    const cabs = [cab(W1, 500, 0, 600)]
    const key = planAutoBuild({ walls: ROOM, cabinets: cabs }, S).tops[0].key
    const r = planAutoBuild({ walls: ROOM, cabinets: cabs }, S, { [key]: { front: 25, left: 0, right: 50 } })
    expect(bbox(r.tops[0].segs)).toEqual([500, 0, 1150, 605])
    expect(planAutoBuild({ walls: ROOM, cabinets: cabs }, S, { [key]: { skip: true } }).tops[0].skip).toBe(true)
  })

  it('an L corner: two tops, both run into the corner, mitred by default', () => {
    // W1 run into the W2 corner; W2 run starts at W1's cabinet front (580).
    const cabs = [cab(W1, 1800, 0, 1200), cab(W2, 3000, 580, 1200)]
    const r = planAutoBuild({ walls: ROOM, cabinets: cabs }, S)
    expect(r.warnings).toEqual([])
    expect(r.tops).toHaveLength(2)
    expect(r.corners).toHaveLength(1)
    expect(r.corners[0].kind).toBe('L')
    expect(r.corners[0].choice).toBe('mitre')
    expect(r.corners[0].choices).toEqual(expect.arrayContaining(['mitre', 'butt_a', 'butt_b']))
    for (const t of r.tops) {
      expect(t.segs.some(s => s.edge?.joint === 'mitre')).toBe(true)
      expect(t.ends).toContain('corner')
    }
    // Together they cover the L exactly: W1 run 1780..3000 × 620, W2 run 0..1780 × 620 (to y = 1780 + 20 end overhang).
    const total = r.tops.reduce((a, t) => a + areaOf(t.segs), 0)
    expect(total).toBeCloseTo(1220 * 620 + 620 * (1800 - 620), -1)
  })

  it('an L corner with butt joints: the longer top runs through to the wall', () => {
    const cabs = [cab(W1, 600, 0, 2400), cab(W2, 3000, 580, 600)]
    const r = planAutoBuild({ walls: ROOM, cabinets: cabs }, { ...S, corner: 'butt' })
    const long = r.tops.find(t => t.wallId === 'W1')!, short = r.tops.find(t => t.wallId === 'W2')!
    expect(bbox(long.segs)).toEqual([580, 0, 3000, 620])
    expect(bbox(short.segs)[1]).toBe(620)
    expect(short.segs.some(s => s.edge?.joint === 'butt')).toBe(true)
    // The other way round on request.
    const key = r.corners[0].key
    const pick = r.corners[0].a === long.key ? 'butt_b' : 'butt_a'
    const r2 = planAutoBuild({ walls: ROOM, cabinets: cabs }, { ...S, corner: 'butt' }, {}, { [key]: pick })
    expect(bbox(r2.tops.find(t => t.wallId === 'W1')!.segs)[2]).toBe(2380)
    expect(bbox(r2.tops.find(t => t.wallId === 'W2')!.segs)[1]).toBe(0)
  })

  it('a U: three tops, two corners, all cut cleanly', () => {
    const W4 = ROOM[3]
    const cabs = [cab(W1, 0, 0, 3000), cab(W2, 3000, 580, 1420), cab(W4, 0, 2000, 1420)]
    const r = planAutoBuild({ walls: ROOM, cabinets: cabs }, S)
    expect(r.warnings).toEqual([])
    expect(r.tops).toHaveLength(3)
    expect(r.corners).toHaveLength(2)
    const total = r.tops.reduce((a, t) => a + areaOf(t.segs), 0)
    expect(total).toBeCloseTo(3000 * 620 + 2 * 620 * (2020 - 620), -1)
  })

  it('bridges a narrow gap (freestanding D/W) but not a wide one or a tall cabinet', () => {
    const two = [cab(W1, 300, 0, 600), cab(W1, 1500, 0, 600)]
    expect(planAutoBuild({ walls: ROOM, cabinets: two }, S).tops).toHaveLength(1)
    expect(planAutoBuild({ walls: ROOM, cabinets: two }, { ...S, bridgeGap: 500 }).tops).toHaveLength(2)
    const tall = cab(W1, 900, 0, 600, { assembly_class: 'tall', dy: 2100 })
    const r = planAutoBuild({ walls: ROOM, cabinets: [...two, tall] }, S)
    expect(r.tops).toHaveLength(2)
    expect(r.tops.map(t => t.ends).flat().filter(e => e === 'tall')).toHaveLength(2)
    expect(bbox(r.tops[0].segs)[2]).toBe(900)
  })

  it('an island with cabinets both sides is one top with no wall edges', () => {
    const isl = wall('I1', 800, 1600, 0, 1800, { wall_type: 'island', thickness: 0 })
    const a = { ...cab(isl, 900, 1600, 1200), rotation: 0 } as CabinetInstance
    const b = { ...cab(isl, 900, 1600, 1200), rotation: 180 } as CabinetInstance
    const r = planAutoBuild({ walls: [...ROOM, isl], cabinets: [a, b] }, S)
    expect(r.tops).toHaveLength(1)
    const t = r.tops[0]
    expect(t.island).toBe(true)
    expect(t.segs.some(s => s.edge?.wall)).toBe(false)
    expect(t.depth).toBe(1240)
    expect(t.length).toBe(1240)
  })

  it('a free-standing island is not stretched to the wall bench across the walkway', () => {
    const isl = wall('I1', 800, 1300, 0, 1800, { wall_type: 'island', thickness: 0 })
    const r = planAutoBuild({ walls: [...ROOM, isl], cabinets: [cab(W1, 0, 0, 3000), { ...cab(isl, 900, 1300, 1200), rotation: 0 } as CabinetInstance] }, S)
    const top = r.tops.find(t => t.island)!
    expect(bbox(top.segs)).toEqual([880, 1300, 2120, 1920])
    expect(r.corners).toHaveLength(0)
  })

  it('cabinets nudged 0.5 mm into each other still make one closed top', () => {
    const r = planAutoBuild({ walls: ROOM, cabinets: [cab(W1, 500, 0, 600.5), cab(W1, 1100, 0, 600), cab(W1, 1699.5, 0, 600.5)] }, S)
    expect(r.warnings).toEqual([])
    expect(r.tops[0].segs).toHaveLength(4)
  })

  it('a run that is only an end panel starts unticked', () => {
    const r = planAutoBuild({ walls: ROOM, cabinets: [cab(W1, 500, 0, 18), cab(W1, 1500, 0, 600)] }, { ...S, bridgeGap: 0 })
    expect(r.tops.map(t => t.skip)).toEqual([true, false])
  })

  it('waterfall ends on an island: both ends get the leg profile + join, the top runs a leg thickness past the cabinets', () => {
    const isl = wall('I1', 800, 1300, 0, 1800, { wall_type: 'island', thickness: 0 })
    const cabs = [{ ...cab(isl, 900, 1300, 1200), rotation: 0 } as CabinetInstance]
    const r = planAutoBuild({ walls: [...ROOM, isl], cabinets: cabs }, { ...S, waterfall: 'island', waterfallJoin: 'butt' })
    const t = r.tops[0]
    expect(t.waterfall).toEqual([true, true])
    expect(bbox(t.segs)).toEqual([867, 1300, 2133, 1920])
    const wf = t.segs.filter(q => q.edge?.profile_id === 'WF')
    expect(wf).toHaveLength(2)
    expect(wf.every(q => q.edge?.waterfall_join === 'butt' && Math.abs(q.p0.x - q.p1.x) < 0.01)).toBe(true)
    // 'island' leaves wall runs alone.
    expect(planAutoBuild({ walls: ROOM, cabinets: [cab(W1, 500, 0, 600)] }, { ...S, waterfall: 'island' }).tops[0].waterfall).toEqual([false, false])
  })

  it('waterfall on every open end never goes on a wall end; a per-top tick turns one off', () => {
    const cabs = [cab(W1, 0, 0, 1200)]
    const r = planAutoBuild({ walls: ROOM, cabinets: cabs }, { ...S, waterfall: 'open' })
    const t = r.tops[0]
    expect(t.ends).toEqual(['wall', 'open'])
    expect(t.waterfall).toEqual([false, true])
    expect(bbox(t.segs)[2]).toBe(1233)
    const off = planAutoBuild({ walls: ROOM, cabinets: cabs }, { ...S, waterfall: 'open' }, { [t.key]: { rightWaterfall: false } }).tops[0]
    expect(off.waterfall).toEqual([false, false])
    expect(bbox(off.segs)[2]).toBe(1220)
    expect(off.segs.some(q => q.edge?.profile_id === 'WF')).toBe(false)
    // No waterfall profile in the library → never.
    expect(planAutoBuild({ walls: ROOM, cabinets: cabs }, { ...S, waterfall: 'open', waterfallProfileId: null }).tops[0].waterfall).toEqual([false, false])
  })

  it('an edge profile goes on the exposed edges only', () => {
    const r = planAutoBuild({ walls: ROOM, cabinets: [cab(W1, 0, 0, 1200)] }, { ...S, edgeProfileId: 'BN' })
    const t = r.tops[0]
    expect(t.segs.filter(q => q.edge?.wall).every(q => !q.edge?.profile_id)).toBe(true)
    expect(t.segs.filter(q => !q.edge?.wall).every(q => q.edge?.profile_id === 'BN')).toBe(true)
  })

  it('selection only, and cabinets already under a top are skipped', () => {
    const cabs = [cab(W1, 500, 0, 600), cab(W2, 3000, 1500, 600)]
    expect(planAutoBuild({ walls: ROOM, cabinets: cabs, cabIds: [cabs[1].id] }, S).tops.map(t => t.wallId)).toEqual(['W2'])
    const r = planAutoBuild({ walls: ROOM, cabinets: cabs }, S)
    const existing = { id: 'b', segments: r.tops[0].segs } as never
    expect(planAutoBuild({ walls: ROOM, cabinets: cabs, benchtops: [existing] }, S).tops).toHaveLength(1)
  })
})
