import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ResolvedToekickPart, type ConstructionRules } from '../types'
import { buildPresetFootprint } from '../../cabinetShape/presets'
import type { PresetParams } from '../../cabinetShape/footprint'
import { signedArea, clipToConvex } from '../../cabinetShape/construct'
import { tkPlanCorners, tkBoxLocal } from '../../jointDrilling'

// z_cabinet_shape 4b: the toe kick follows the footprint.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const kickFace: Material = { id: 'k16', name: 'Kick 16', DZ: 16, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const cab = (o: Partial<CabinetInput>, rules: Partial<ConstructionRules> = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 900, DY: 870, DZ: 580,
  has_carcass: true, has_internal: false, has_face: false, has_toekick: true,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: kickFace, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, rules),
  face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
  ...o,
})

type P = { x: number; y: number }
const area = (pts: P[]) => Math.abs(signedArea(pts))
const plan = (p: ResolvedToekickPart) => tkPlanCorners(p).map(q => ({ x: q.x, y: q.z }))
const r2 = (v: number) => Math.round(v * 100) / 100
const sig = (p: ResolvedToekickPart) => [p.part_key, p.DX, p.DY, p.DZ, p.X, p.Y, p.Z, p.AY].map(v => typeof v === 'number' ? r2(v) : v).join('|')

describe('shaped toe kick (4b)', () => {
  it('a rectangle-shaped footprint gives exactly the box kick', () => {
    const fp = buildPresetFootprint('trapezoid', { inset_l: 0, inset_r: 0 }, { w: 900, d: 580 })
    const rules = { TOESCL: 10, TOESCR: 20, TOESCB: 5 }
    const boxKick = resolveCabinet(cab({}, rules)).toekick_parts.map(sig).sort()
    const shaped = resolveCabinet(cab({ footprint: fp }, rules)).toekick_parts.map(sig).sort()
    expect(shaped).toEqual(boxKick)
  })

  const cases: [string, PresetParams, number, number][] = [
    ['clipped_corner', { clip_w: 300, clip_d: 200 }, 900, 580],
    ['clipped_corner', { side: 'left' }, 900, 580],
    ['trapezoid', { inset_l: 100, inset_r: 100 }, 900, 580],
    ['angled_end', { inset: 200 }, 900, 580],
    ['diagonal_corner', {}, 900, 900],
    ['radius_end', {}, 900, 580],
  ]
  for (const [preset, params, w, d] of cases) {
    it(`${preset} ${JSON.stringify(params)}: kick parts inside the footprint, no collisions`, () => {
      const fp = buildPresetFootprint(preset, params, { w, d })!
      const rp = resolveCabinet(cab({ DX: w, DZ: d, footprint: fp }))
      expect(rp.errors).toEqual([])
      const outline = fp.segments.map(s => ({ x: s.p0.x, y: s.p0.y }))
      const ps = rp.toekick_parts.map(p => ({ p, pts: plan(p), y0: p.Y, y1: p.Y + tkBoxLocal(p).h }))
      expect(ps.filter(q => q.p.part_key === 'kick_front_face').length).toBeGreaterThan(0)
      for (const q of ps) expect(area(clipToConvex(q.pts, outline)), q.p.part_key).toBeCloseTo(area(q.pts), 0)
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j]
        if (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) <= 0.01) continue      // different heights
        expect(area(clipToConvex(a.pts, b.pts)), `${a.p.part_key}#${a.p.sort_order} × ${b.p.part_key}#${b.p.sort_order}`).toBeLessThan(0.5)
      }
    })
  }

  it('clipped corner: the two kick faces meet on a mitre (outer and inner corners shared)', () => {
    const fp = buildPresetFootprint('clipped_corner', { clip_w: 300, clip_d: 300 }, { w: 900, d: 580 })
    const rp = resolveCabinet(cab({ footprint: fp }))
    const faces = rp.toekick_parts.filter(p => p.part_key === 'kick_front_face')
    expect(faces).toHaveLength(2)
    const [a, b] = faces.map(plan)
    const shared = a.filter(p => b.some(q => Math.hypot(p.x - q.x, p.y - q.y) < 0.01))
    expect(shared).toHaveLength(2)
    for (const f of faces) expect(Math.abs(f.bevel_lo ?? 0) + Math.abs(f.bevel_hi ?? 0)).toBeCloseTo(22.5, 6)
    // The facet face is set back TOESCF from the facet (2x + 2z = 2·(600 + 580) line → x + z = 1180).
    const facet = faces.find(f => f.AY)!
    const outer = plan(facet).filter(q => Math.abs((q.x + q.y) - (1180 - DEFAULT_RULES.TOESCF * Math.SQRT2)) < 0.01)
    expect(outer.length).toBe(2)
  })

  it('two front edges in line (face filler + open front) share one kick board', () => {
    const t = 25.46, s = 40 / Math.SQRT2
    const fp = { params: {}, segments: [
      { type: 'line' as const, p0: { x: t, y: 0 }, p1: { x: 507.5, y: 0 }, edge: { id: 'back', role: 'back' as const } },
      { type: 'line' as const, p0: { x: 507.5, y: 0 }, p1: { x: 507.5, y: 482 }, edge: { id: 'right', role: 'side' as const } },
      { type: 'line' as const, p0: { x: 507.5, y: 482 }, p1: { x: t + s, y: s }, edge: { id: 'front', role: 'front' as const, sub: 'open' as const } },
      { type: 'line' as const, p0: { x: t + s, y: s }, p1: { x: t, y: 0 }, edge: { id: 'filler', role: 'front' as const } },
    ] }
    const rp = resolveCabinet(cab({ DX: 507.5, DZ: 482, footprint: fp }))
    const faces = rp.toekick_parts.filter(p => p.part_key === 'kick_front_face')
    expect(faces).toHaveLength(1)
    expect(faces[0].DY).toBeLessThan(Math.hypot(482, 482))
    for (const p of rp.toekick_parts) expect(Math.abs(p.X) + Math.abs(p.Z)).toBeLessThan(1100)
  })

  it('leg kick: front faces only', () => {
    const fp = buildPresetFootprint('clipped_corner', {}, { w: 900, d: 580 })
    const rp = resolveCabinet(cab({ footprint: fp }, { TOE_TYPE: 'leg' }))
    expect(new Set(rp.toekick_parts.map(p => p.part_key))).toEqual(new Set(['kick_front_face']))
  })
})
