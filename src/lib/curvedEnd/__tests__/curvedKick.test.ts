// Curved end C5: on a kick, the carcass lifts TOEH and a curved kick follows
// the face board round the curve (set back TOESCF, bent with the same skin);
// a benchtop follows the curve and the exposed side plus its overhang.
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { resolveCabinet } from '../../resolver/resolver'
import { mergeRules } from '../../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material } from '../../resolver/types'
import { collectCurvedPocketRoutes } from '../../optimiser/seamDrillSync'
import { casePartItem } from '../../displayLayers/registry'
import { resolveCurvedEnd } from '../../resolver/resolveCurvedEnd'
import { sampleOutline } from '../../shapePath'
import { calcCurvedKick } from '../kick'
import { calcCurvedEnd, CURVED_END_DEFAULTS, POCK_EXT, type CurvedEndParams } from '../geometry'
import { curvedEndFootprint, curvedEndKickH, DEFAULT_CURVED_END, type CurvedEndSettings } from '../settings'
import { benchtopSeedFromCabinets } from '../../benchtopSeed'
import { centroid, cabWallPerp, wallInwardNormal } from '../../geometry'
import type { Wall, CabinetInstance } from '../../types'

const TF = 16, TI = 16
function cabFor(kit: Partial<CurvedEndParams>, s: Partial<CurvedEndSettings> = {}, cls = 'base'): CabinetInput {
  const p = { ...CURVED_END_DEFAULTS, ...kit }
  const mat = (id: string, DZ: number): Material => ({ id, name: id, DZ, sheet_dx: 2400, sheet_dy: 1200, has_grain: false })
  const curved_end: CurvedEndSettings = { ...DEFAULT_CURVED_END, hand: p.hand, R: p.R, SK: p.SK, blkS: p.blkS, blkF: p.blkF, lighten: p.lighten, ...s }
  return {
    id: 'c1', assembly_class: cls as CabinetInput['assembly_class'], DX: p.W, DY: p.H, DZ: p.D,
    has_carcass: false, has_internal: false, has_face: false, has_toekick: true,
    left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
    material: mat('carcass', p.T), door_material: mat('face', p.FT), shelf_material: mat('carcass', p.T),
    exposed_material: mat('face', p.FT), toekick_face_material: mat('kickface', TF), toekick_interior_material: mat('kickint', TI),
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
    footprint: curvedEndFootprint(curved_end, { w: p.W, d: p.D }), curved_end,
  }
}
const R = DEFAULT_RULES   // TOEH 150, TOEFC 16.5, TOESCF 40, TOESCB 0, TOESP 450
const kickKeys = (keys: string[]) => keys.filter(k => k.startsWith('crv:kick'))

describe('curved end on a kick (C5)', () => {
  const base = { hand: 'RH' as const, W: 450, D: 600, H: 900, R: 150 }

  it('off: no kick parts, and the standard box kick is never built for a curved end', () => {
    const rp = resolveCabinet(cabFor(base))
    expect(rp.errors).toEqual([])
    expect(kickKeys(rp.case_parts.map(p => p.part_key))).toEqual([])
    expect(rp.toekick_parts).toEqual([])
    expect(rp.case_parts.find(p => p.part_key === 'crv:face')!.Y).toBe(0)
  })

  it('on: everything above the kick is the same cabinet DY − TOEH tall, lifted TOEH', () => {
    const on = resolveCabinet(cabFor(base, { kick: true }))
    const short = resolveCabinet(cabFor({ ...base, H: base.H - R.TOEH }))
    expect(on.errors).toEqual([])
    const above = on.case_parts.filter(p => !p.part_key.startsWith('crv:kick'))
    expect(above.map(p => p.part_key)).toEqual(short.case_parts.map(p => p.part_key))
    above.forEach((p, i) => {
      const q = short.case_parts[i]
      expect({ ...p, Y: p.Y - R.TOEH }, p.part_key).toEqual(q)
    })
    // the declared seams lift with the parts
    const a = resolveCurvedEnd(cabFor(base, { kick: true })).seams, b = resolveCurvedEnd(cabFor({ ...base, H: base.H - R.TOEH })).seams
    expect(a.map(s => ({ ...s, geom: { ...s.geom, origin: { ...s.geom.origin, y: s.geom.origin.y - R.TOEH } } }))).toEqual(b)
  })

  it('RH kick: board bent round R − TOESCF, back along the wall, spreaders on the flat front', () => {
    const rp = resolveCabinet(cabFor(base, { kick: true }))
    const parts = new Map(rp.case_parts.map(p => [p.part_key, p]))
    expect(kickKeys([...parts.keys()])).toEqual(['crv:kick', 'crv:kick_back', 'crv:kick_spr_1', 'crv:kick_spr_2'])
    const k = parts.get('crv:kick')!
    const Rk = base.R - R.TOESCF, CX = base.W - base.R
    const arc = Math.PI / 2 * Rk
    expect(k.DY).toBeCloseTo(CX + arc + (base.D - base.R), 2)          // flat blank, grain along the wrap
    expect([k.DX, k.DZ, k.Y, k.grain_direction, k.material_id]).toEqual([R.TOEH, TF, 0, 'horizontal', 'kickface'])
    expect(k.wrap!.bend!.at).toEqual([[CX - POCK_EXT, Math.round((CX + arc + POCK_EXT) * 100) / 100]])
    expect(k.wrap!.bend!.depth).toBe(TF - 2)   // TF − SK
    // plan: front face TOESCF behind the cabinet front, curved side TOESCF in from the side
    const pts = sampleOutline(k.wrap!.pts, 1)
    expect(Math.max(...pts.map(q => q.y))).toBeCloseTo(base.D - R.TOESCF, 6)
    expect(Math.max(...pts.map(q => q.x))).toBeCloseTo(base.W - R.TOESCF, 6)
    expect(Math.min(...pts.map(q => q.x))).toBeCloseTo(0, 6)
    // the outer arc sits on R − TOESCF about the face board's curve centre
    const onArc = pts.filter(q => q.x > CX + 1 && q.y > base.D - base.R + 1)
    expect(onArc.length).toBeGreaterThan(3)
    for (const q of onArc) {
      const r = Math.hypot(q.x - CX, q.y - (base.D - base.R))
      expect(Math.abs(r - Rk) < 0.01 || Math.abs(r - (Rk - 2)) < 0.01 || r < Rk - 2).toBe(true)
    }
    const back = parts.get('crv:kick_back')!
    expect([back.DX, back.DY, back.DZ, back.Y, back.Z, back.material_id]).toEqual([R.TOEH - R.TOEFC, base.W - R.TOESCF - TF, TI, R.TOEFC, 0, 'kickint'])
    const spr = [parts.get('crv:kick_spr_1')!, parts.get('crv:kick_spr_2')!]
    for (const s of spr) expect([s.DX, s.DY, s.DZ, s.Y]).toEqual([R.TOEH - R.TOEFC, base.D - TI - R.TOESCF - TF, TI, R.TOEFC])
    // one at the gable end, one just before the curve's pocket
    // (turned like the fixing panel: X = the face toward the gable, thickness inward)
    expect(spr.map(s => s.X).sort((a, b) => a - b)).toEqual([0, CX - POCK_EXT - TI])
  })

  it('LH mirrors the kick', () => {
    const rh = resolveCabinet(cabFor(base, { kick: true })).case_parts.find(p => p.part_key === 'crv:kick')!
    const lh = resolveCabinet(cabFor({ ...base, hand: 'LH' }, { kick: true })).case_parts.find(p => p.part_key === 'crv:kick')!
    const a = sampleOutline(rh.wrap!.pts, 1), b = sampleOutline(lh.wrap!.pts, 1)
    expect(Math.min(...b.map(q => q.x))).toBeCloseTo(R.TOESCF, 6)
    expect(Math.max(...b.map(q => q.x))).toBeCloseTo(base.W, 6)
    expect(lh.DY).toBe(rh.DY)
    expect(Math.abs(areaOf(a))).toBeCloseTo(Math.abs(areaOf(b)), 3)
  })

  it('DOUBLE: two bends, spreaders between the curves, back between the sides', () => {
    const W = 1000, D = 500
    const rp = resolveCabinet(cabFor({ hand: 'DOUBLE', W, D, H: 720, R: 150 }, { kick: true }))
    expect(rp.errors).toEqual([])
    const k = rp.case_parts.find(p => p.part_key === 'crv:kick')!
    expect(k.wrap!.bend!.at).toHaveLength(2)
    const back = rp.case_parts.find(p => p.part_key === 'crv:kick_back')!
    expect(back.DY).toBe(W - 2 * (R.TOESCF + TF))
    const spr = rp.case_parts.filter(p => p.part_key.startsWith('crv:kick_spr_'))
    // flat between the pockets: 150+3 … 1000−150−3−16 = 681 → 2 spreaders at ≤ 450 centres + the ends = 3
    expect(spr).toHaveLength(3)
  })

  it('pockets: one per curve on the kick, depth TF − SK, along its length (grain along the wrap)', () => {
    const rp = resolveCabinet(cabFor(base, { kick: true }))
    const { rows } = collectCurvedPocketRoutes(rp, 'c1', 'tool10')
    const kick = rows.filter(r => r.source_part_key === 'case_crv:kick')
    expect(kick).toHaveLength(1)
    expect(kick[0]).toMatchObject({ output_face: 'back', depth: TF - 2, pos_x: R.TOEH / 2, size_dx: R.TOEH + 12 })
    expect(rows.filter(r => r.source_part_key === 'case_crv:face')).toHaveLength(1)
  })

  it('wall cabinets ignore the kick; a floating base never builds one', () => {
    expect(curvedEndKickH({ kick: true }, 'wall', 150)).toBe(0)
    const w = resolveCabinet(cabFor({ ...base, H: 700, D: 350 }, { kick: true }, 'wall'))
    expect(kickKeys(w.case_parts.map(p => p.part_key))).toEqual([])
    const fl = cabFor(base, { kick: true }); fl.rules = { ...fl.rules, FLOAT: true }
    expect(kickKeys(resolveCabinet(fl).case_parts.map(p => p.part_key))).toEqual([])
  })

  it('a radius too small for the setback blocks with a warning and builds no kick', () => {
    const rp = resolveCabinet(cabFor({ ...base, R: 60 }, { kick: true }))
    expect(rp.errors.some(e => e.code === 'CURVED_END' && /kick setback/.test(e.message))).toBe(true)
    expect(kickKeys(rp.case_parts.map(p => p.part_key))).toEqual([])
    const c = calcCurvedEnd({ ...base, R: 60 })
    expect(calcCurvedKick(c, { H: 150, FC: 16.5, s: 40, sb: 0, TF, TI, SP: 450 }).ok).toBe(false)
  })

  it('kick parts show on the kick layers, not the curved-end item', () => {
    expect(casePartItem('crv:kick')).toBe('kick_faces')
    expect(casePartItem('crv:kick_back')).toBe('kick_faces')
    expect(casePartItem('crv:kick_spr_2')).toBe('kick_spreaders')
    expect(casePartItem('crv:face')).toBe('curved_ends')
  })
})

function areaOf(pts: { x: number; y: number }[]) {
  let a = 0
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y }
  return a / 2
}

describe('benchtop follows the curve (C5)', () => {
  const wall = (id: string, x: number, y: number, angle: number, length: number): Wall => ({
    id, room_id: 'r', name: id, sort_order: 0, length, height: null, soffit_height: null,
    angle, pos_x: x, pos_y: y, thickness: 90, wall_type: 'standard', created_at: '',
  })
  const ROOM = [wall('W1', 0, 0, 0, 3000), wall('W2', 3000, 0, 90, 3000), wall('W3', 3000, 3000, 180, 3000), wall('W4', 0, 3000, 270, 3000)]
  const C = centroid(ROOM)
  const place = (x: number, dx: number, extra: Partial<CabinetInstance> = {}) => {
    const c = { id: `c${x}`, wall_id: 'W1', pos_x: x, pos_y: 0, dx, dz: 580, dy: 900, rotation: 0, footprint: null, ...extra } as unknown as CabinetInstance
    return { cab: c, wall: ROOM[0], perp: cabWallPerp(c, ROOM[0], wallInwardNormal(ROOM[0], C)) }
  }
  const oh = 20
  for (const hand of ['RH', 'LH'] as const) {
    it(`${hand}: the curve and the exposed side carry the overhang; the wall edge and the run's join don't`, () => {
      const s = { ...DEFAULT_CURVED_END, hand, R: 150 }
      // a stored footprint from before C5 (exposed straight tagged side) — rebuilt from the settings
      const stale = curvedEndFootprint(s, { w: 450, d: 580 })!
      stale.segments!.forEach(g => { if ((g.edge as { id: string }).id === 'end') g.edge.role = 'side' })
      const crv = place(hand === 'RH' ? 1100 : 500, 450, { curved_end: s, footprint: stale })
      const run = [crv, place(hand === 'RH' ? 500 : 950, 600)]
      const seg = benchtopSeedFromCabinets(run, oh)!
      const pts = seg.map(e => e.p0)
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
      // front 580 + oh; exposed side oh past the cabinet's outer side
      expect(Math.max(...ys)).toBeCloseTo(580 + oh, 1)
      if (hand === 'RH') expect(Math.max(...xs)).toBeCloseTo(1550 + oh, 1)
      else expect(Math.min(...xs)).toBeCloseTo(500 - oh, 1)
      // every vertex on the curve's quadrant sits R + oh from its centre
      const cx = hand === 'RH' ? 1550 - 150 : 500 + 150, cy = 580 - 150
      const arc = pts.filter(p => (hand === 'RH' ? p.x > cx + 0.5 : p.x < cx - 0.5) && p.y > cy + 0.5)
      expect(arc.length).toBeGreaterThan(5)
      for (const p of arc) expect(Math.hypot(p.x - cx, p.y - cy)).toBeCloseTo(150 + oh, 0)
      // back on the wall line, and the exposed side runs straight back to it at the overhang
      expect(Math.min(...ys)).toBeCloseTo(0, 1)
      const sideX = hand === 'RH' ? 1550 + oh : 500 - oh
      expect(pts.some(p => Math.abs(p.x - sideX) < 0.1 && Math.abs(p.y) < 0.1), 'side meets the wall at the overhang').toBe(true)
      expect(pts.some(p => Math.abs(p.x - (hand === 'RH' ? 1550 : 500)) < 0.1 && p.y < cy), 'no step back in').toBe(false)
    })
  }
})
