import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ConstructionRules, type ResolvedInternalPart } from '../types'
import { buildPresetFootprint } from '../../cabinetShape/presets'
import { evaluateFootprint, withEdgeOverrides, type EdgeOverrides, type Footprint, type PresetParams } from '../../cabinetShape/footprint'
import { shapedInterior } from '../resolveShapedCase'
import { signedArea, clipToConvex, canonicalSegments, edgeFrame } from '../../cabinetShape/construct'
import { casePlanCorners, isSide } from '../../jointDrilling'
import { isShapedPanelKey } from '../../cabinetShape/partKeys'
import { casePartItem } from '../../displayLayers/registry'

// z_cabinet_shape_edit E1: edge sub-types. Finished gables / backs in the
// exposed board (at its thickness), applied end panels outside a set-in gable,
// scribe gables set in from the outline. The vertical panels must still sit
// inside the outline without overlaps, and the horizontals must clear them.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const exposed: Material = { id: 'x25', name: 'Exposed 25', DZ: 25, sheet_dx: 2400, sheet_dy: 1200, has_grain: true }
const cab = (o: Partial<CabinetInput>, rules: Partial<ConstructionRules> = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 900, DY: 870, DZ: 580,
  has_carcass: true, has_internal: true, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: exposed,
  exposed_edgeband_id: 'tape-x', interior_edgeband_id: 'tape-i',
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, rules),
  face_grid: { rows: [], cols: [], zones: [] },
  internal_tree: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: false }] },
  ...o,
})

type P = { x: number; y: number }
const area = (pts: P[]) => Math.abs(signedArea(pts))
const vertical = (k: string) => isSide(k) || k === 'back' || isShapedPanelKey(k)
const plan = (p: Parameters<typeof casePlanCorners>[0]) => casePlanCorners(p).map(q => ({ x: q.x, y: q.z }))
// A shelf's plan polygon (outline in the horizontal shape frame, else its rect).
const shelfPlan = (p: ResolvedInternalPart): P[] => p.outline?.length
  ? p.outline.map(q => ({ x: p.X + q.x, y: p.Z + p.DX - q.y }))
  : [{ x: p.X, y: p.Z }, { x: p.X + p.DY, y: p.Z }, { x: p.X + p.DY, y: p.Z + p.DX }, { x: p.X, y: p.Z + p.DX }]

const shaped = (preset: string, params: PresetParams, ov: EdgeOverrides, w = 900, d = 580) =>
  cab({ DX: w, DZ: d, footprint: buildPresetFootprint(preset, params, { w, d }, ov)! })

// Every vertical panel inside the outline, none overlapping; the horizontals
// (bottom, top) and shelves clear every vertical panel — except that the
// bottom and top pass under / over a back by default (BOTTOM_BACK_JOIN /
// TOP_BACK_JOIN), which a plan check can't tell from a clash.
function checkBuild(c: CabinetInput) {
  const rp = resolveCabinet(c)
  const sh = shapedInterior(c)!
  const panels = rp.case_parts.filter(p => vertical(p.part_key)).map(p => ({ k: p.part_key, pts: plan(p) }))
  for (const p of panels) expect(area(clipToConvex(p.pts, sh.outline)), p.k).toBeCloseTo(area(p.pts), 0)
  for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++)
    expect(area(clipToConvex(panels[i].pts, panels[j].pts)), `${panels[i].k} × ${panels[j].k}`).toBeLessThan(0.5)
  const flats = [
    // bottom_outside / on_top_of_sides: the bottom / top run under / over the sides.
    ...rp.case_parts.filter(p => (p.part_key === 'bottom' && c.rules.BOTTOM_JOIN !== 'bottom_outside')
      || (p.part_key === 'full_top' && c.rules.RAIL_JOIN !== 'on_top_of_sides')).map(p => ({ k: p.part_key, pts: plan(p) })),
    ...rp.internal_parts.filter(p => p.part_type === 'adj_shelf').map(p => ({ k: p.part_type, pts: shelfPlan(p) })),
  ]
  expect(flats.length).toBeGreaterThan(0)   // the shelf at least
  const isBack = (k: string) => k === 'back' || k.startsWith('back:')
  for (const f of flats) for (const p of panels) {
    if (f.k !== 'adj_shelf' && isBack(p.k)) continue
    expect(area(clipToConvex(f.pts, p.pts)), `${f.k} × ${p.k}`).toBeLessThan(0.5)
  }
  return rp
}

describe('edge sub-types (z_cabinet_shape_edit E1)', () => {
  it('reads a legacy scribe role (segments + role_overrides) as side / scribe', () => {
    const fp = buildPresetFootprint('clipped_corner', {}, { w: 900, d: 580 })!
    const legacy: Footprint = {
      ...fp,
      segments: fp.segments.map(s => s.edge.id === 'end' ? { ...s, edge: { ...s.edge, role: 'scribe' as never } } : s),
      role_overrides: { side: 'scribe' },
    }
    const segs = evaluateFootprint(withEdgeOverrides(legacy), { w: 900, d: 580 })
    expect(segs.find(s => s.edge.id === 'end')!.edge).toMatchObject({ role: 'side', sub: 'scribe' })
    expect(segs.find(s => s.edge.id === 'side')!.edge).toMatchObject({ role: 'side', sub: 'scribe' })
    // With no allowance of its own it builds as before (the rules' scribes only).
    const before = resolveCabinet(cab({ footprint: fp })).case_parts
    expect(resolveCabinet(cab({ footprint: legacy })).case_parts).toEqual(before)
  })

  it('default sub-types build exactly what an edge with no sub-type does', () => {
    for (const [preset, params, ov] of [
      ['clipped_corner', {}, { side: { role: 'side', sub: 'unfinished' }, back: { role: 'back', sub: 'standard' }, facet: { role: 'front', sub: 'faces' } }],
      ['angled_end', { inset: 200 }, { end: { role: 'side', sub: 'unfinished' } }],
    ] as [string, PresetParams, EdgeOverrides][]) {
      const plain = resolveCabinet(cab({ footprint: buildPresetFootprint(preset, params, { w: 900, d: 580 })! }))
      const subbed = resolveCabinet(shaped(preset, params, ov))
      expect(subbed.case_parts).toEqual(plain.case_parts)
      expect(subbed.internal_parts).toEqual(plain.internal_parts)
    }
  })

  const cases: [string, PresetParams, string, number, number][] = [
    ['clipped_corner', {}, 'side', 900, 580],                      // box left side (legacy part)
    ['clipped_corner', { side: 'left' }, 'side', 900, 580],        // box right side
    ['angled_end', { inset: 200 }, 'end', 900, 580],               // angled side:end
    ['trapezoid', { inset_l: 100, inset_r: 100 }, 'left', 900, 580],
    ['diagonal_corner', {}, 'end', 900, 900],
  ]

  for (const [preset, params, edge, w, d] of cases) {
    const tag = `${preset} ${JSON.stringify(params)} · ${edge}`

    it(`finished gable · ${tag}: exposed board + tape at its thickness, panels + shelves clear`, () => {
      const rp = checkBuild(shaped(preset, params, { [edge]: { role: 'side', sub: 'finished' } }, w, d))
      const exp = rp.case_parts.filter(p => p.material_id === 'x25')
      expect(exp.length).toBe(1)
      expect(exp[0].DZ).toBe(25)
      expect(exp[0].edge_band.id).toBe('tape-x')
      expect(rp.case_parts.filter(p => p.material_id === 'm18').every(p => p.edge_band.id !== 'tape-x')).toBe(true)
    })

    it(`applied end panel · ${tag}: ap:${edge} on the outline, gable set in behind it`, () => {
      const c = shaped(preset, params, { [edge]: { role: 'side', sub: 'applied' } }, w, d)
      const rp = checkBuild(c)
      const ap = rp.case_parts.find(p => p.part_key === `ap:${edge}`)!
      expect(ap).toBeTruthy()
      expect(ap).toMatchObject({ DZ: 25, material_id: 'x25' })
      expect(ap.edge_band.id).toBe('tape-x')
      expect(casePartItem(ap.part_key)).toBe('applied_panels')
      // The end panel's outer face lies on the edge; the gable is 25 in from it.
      const e = canonicalSegments(c.footprint!, w, d).find(s => s.edge.id === edge)!
      const f = edgeFrame(e)
      const inFrom = (q: P) => (q.x - e.p0.x) * f.n.x + (q.y - e.p0.y) * f.n.y
      const apIn = plan(ap).map(inFrom)
      expect(Math.min(...apIn)).toBeCloseTo(0, 3)
      expect(Math.max(...apIn)).toBeCloseTo(25, 3)
      const gable = rp.case_parts.find(p => p.part_key !== ap.part_key && vertical(p.part_key) && p.material_id === 'm18'
        && plan(p).every(q => inFrom(q) > -0.5 && inFrom(q) < 25 + 18 + 0.5) && Math.abs(Math.min(...plan(p).map(inFrom)) - 25) < 0.01)
      expect(gable, 'gable 25 in from the edge').toBeTruthy()
      // Its height is the gable's.
      expect(ap.DX).toBeCloseTo(Number(gable!.part_key === 'left_side' || gable!.part_key === 'right_side' ? gable!.DY : gable!.DX), 3)
    })

    it(`scribe gable · ${tag}: 20 mm allowance off the outline`, () => {
      const c = shaped(preset, params, { [edge]: { role: 'side', sub: 'scribe', scribe: 20 } }, w, d)
      const rp = checkBuild(c)
      const e = canonicalSegments(c.footprint!, w, d).find(s => s.edge.id === edge)!
      const f = edgeFrame(e)
      const inFrom = (q: P) => (q.x - e.p0.x) * f.n.x + (q.y - e.p0.y) * f.n.y
      // Nothing in the scribe strip along that edge (within its length).
      const along = (q: P) => (q.x - e.p0.x) * f.u.x + (q.y - e.p0.y) * f.u.y
      const mid = (pts: P[]) => ({ x: pts.reduce((a, q) => a + q.x, 0) / pts.length, y: pts.reduce((a, q) => a + q.y, 0) / pts.length })
      const near = rp.case_parts.filter(p => vertical(p.part_key))
        .filter(p => { const m = mid(plan(p)); return along(m) > 0 && along(m) < f.len && inFrom(m) < 40 })
      expect(near.length).toBeGreaterThan(0)
      for (const p of near) expect(Math.min(...plan(p).map(inFrom)), p.part_key).toBeGreaterThanOrEqual(20 - 0.01)
    })
  }

  it('every sub-type stays clear under the other joinery rules', () => {
    const rulesets: Partial<ConstructionRules>[] = [
      { BACK_JOIN: 'behind_sides' }, { ANGLE_JOIN: 'mitre' }, { BOTTOM_JOIN: 'bottom_outside' },
      { RAIL_JOIN: 'on_top_of_sides' }, { SCRL: 10, SCRR: 10, SCRBK: 10 },
    ]
    const subs: EdgeOverrides[string][] = [
      { role: 'side', sub: 'finished' }, { role: 'side', sub: 'applied' }, { role: 'side', sub: 'scribe', scribe: 20 },
    ]
    for (const rules of rulesets) for (const [preset, params, edge, w, d] of cases) for (const o of subs) {
      const c = cab({ DX: w, DZ: d, footprint: buildPresetFootprint(preset, params, { w, d }, { [edge]: o, back: { role: 'back', sub: 'finished' } })! }, rules)
      try { checkBuild(c) } catch (e) { throw new Error(`${JSON.stringify(rules)} ${preset} ${edge} ${o.sub}: ${(e as Error).message}`) }
    }
  })

  it('the rules scribe is not doubled: SCRL 10 + edge scribe 20 sets the box left side 20 in', () => {
    const c = cab({ footprint: buildPresetFootprint('clipped_corner', {}, { w: 900, d: 580 }, { side: { role: 'side', sub: 'scribe', scribe: 20 } })! }, { SCRL: 10 })
    const ls = checkBuild(c).case_parts.find(p => p.part_key === 'left_side')!
    expect(ls.X).toBeCloseTo(20, 6)
    const ruleOnly = cab({ footprint: buildPresetFootprint('clipped_corner', {}, { w: 900, d: 580 }, { side: { role: 'side', sub: 'scribe' } })! }, { SCRL: 10 })
    expect(resolveCabinet(ruleOnly).case_parts.find(p => p.part_key === 'left_side')!.X).toBeCloseTo(10, 6)
  })

  it('finished back: exposed board at its thickness; the bottom, top and shelves stop in front of it', () => {
    const c = shaped('clipped_corner', {}, { back: { role: 'back', sub: 'finished' } })
    const rp = checkBuild(c)
    const back = rp.case_parts.find(p => p.part_key === 'back')!
    expect(back).toMatchObject({ DZ: 25, material_id: 'x25' })
    const top = rp.case_parts.find(p => p.part_key === 'full_top')
    if (top) expect(top.Z).toBeGreaterThanOrEqual(25 - 0.01)
  })

  it('thicker finished box side moves the bottom (sides outside) and the shelves in', () => {
    const plain = resolveCabinet(cab({ footprint: buildPresetFootprint('clipped_corner', {}, { w: 900, d: 580 })! }))
    const rp = checkBuild(shaped('clipped_corner', {}, { side: { role: 'side', sub: 'finished' } }))
    const b0 = plain.case_parts.find(p => p.part_key === 'bottom')!, b1 = rp.case_parts.find(p => p.part_key === 'bottom')!
    expect(b1.X - b0.X).toBeCloseTo(7, 3)
    const s0 = plain.internal_parts.find(p => p.part_type === 'adj_shelf')!, s1 = rp.internal_parts.find(p => p.part_type === 'adj_shelf')!
    expect(s1.X - s0.X).toBeCloseTo(7, 3)
  })
})
