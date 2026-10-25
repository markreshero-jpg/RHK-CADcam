import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ConstructionRules } from '../types'
import { buildPresetFootprint, seedClassDepthParams, withShapeChoices } from '../../cabinetShape/presets'
import type { Footprint, JoinChoice, PresetParams } from '../../cabinetShape/footprint'
import { footprintJunctions, joinOptions, toggleFlushEnds, withJoin } from '../../cabinetShape/junctions'
import { shapedInterior, panelFrontEnd } from '../resolveShapedCase'
import { signedArea, clipToConvex } from '../../cabinetShape/construct'
import { casePlanCorners, isSide } from '../../jointDrilling'
import { isShapedPanelKey } from '../../cabinetShape/partKeys'

// z_cabinet_shape_edit E2: a choice per corner — which panel runs through, a
// mitre (square corners too), square / bevelled-flush panel ends at an angled
// front, mitred or square doors between two facets.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const twoDoors = {
  rows: [{ row_index: 0, height_locked: false }],
  cols: [{ col_index: 0, width_locked: false }, { col_index: 1, width_locked: false }],
  zones: [
    { row_index: 0, col_index: 0, face_type: 'door' as const, hinge_side: 'left' as const },
    { row_index: 0, col_index: 1, face_type: 'door' as const, hinge_side: 'right' as const },
  ],
}
const cab = (o: Partial<CabinetInput>, rules: Partial<ConstructionRules> = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 900, DY: 870, DZ: 580,
  has_carcass: true, has_internal: false, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, rules),
  face_grid: twoDoors, internal_tree: { type: 'open', fittings: [] },
  ...o,
})

type P = { x: number; y: number }
const area = (pts: P[]) => Math.abs(signedArea(pts))
const vertical = (k: string) => isSide(k) || k === 'back' || isShapedPanelKey(k)
const plan = (p: Parameters<typeof casePlanCorners>[0]) => casePlanCorners(p).map(q => ({ x: q.x, y: q.z }))

// Panels inside the outline, no overlaps, and (convex shapes) adding up to the band.
function checkPanels(c: CabinetInput, fill = true) {
  const rp = resolveCabinet(c)
  const sh = shapedInterior(c)!
  const panels = rp.case_parts.filter(p => vertical(p.part_key)).map(p => ({ k: p.part_key, pts: plan(p) }))
  for (const p of panels) expect(area(clipToConvex(p.pts, sh.outline)), p.k).toBeCloseTo(area(p.pts), 0)
  for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++)
    expect(area(clipToConvex(panels[i].pts, panels[j].pts)), `${panels[i].k} × ${panels[j].k}`).toBeLessThan(0.5)
  if (fill) expect(panels.reduce((a, p) => a + area(p.pts), 0)).toBeCloseTo(area(sh.outline) - area(sh.inner), 0)
  return rp
}

const shape = (preset: string, params: PresetParams = {}, w = 900, d = 580) => buildPresetFootprint(preset, params, { w, d })!
// Every panel end at an angled front bevelled flush, so the panels fill the band
// exactly (a square end leaves a small triangle there — as the 4a tests).
const allFlush = (fp: Footprint, w = 900, d = 580) => footprintJunctions(fp, w, d)
  .filter(j => j.kind === 'panel_end').reduce((f, j) => withJoin(f, w, d, j.key, 'flush'), fp)
const join = (fp: Footprint, key: string, choice: JoinChoice, w = 900, d = 580) => withJoin(fp, w, d, key, choice)
const part = (c: CabinetInput, k: string) => resolveCabinet(c).case_parts.find(p => p.part_key === k)!

describe('corner joins (z_cabinet_shape_edit E2)', () => {
  it('lists the corners a choice applies to', () => {
    const fp = shape('clipped_corner')
    const js = footprintJunctions(fp, 900, 580)
    const kinds = Object.fromEntries(js.map(j => [[j.a.id, j.b.id].sort().join('|'), j.kind]))
    expect(kinds['back|end']).toBe('panels')
    expect(kinds['back|side']).toBe('panels')
    expect(kinds['end|facet']).toBe('panel_end')
    expect(kinds['facet|front']).toBe('facets')
    expect(kinds['front|side']).toBeUndefined()          // square panel end at a front: nothing to choose
    expect(joinOptions(js.find(j => j.kind === 'panels')!).map(o => o.value)).toHaveLength(4)
  })

  it('square box corner: through-back turns BACK_JOIN round; the side stops on the back', () => {
    const fp = shape('clipped_corner')
    const k = footprintJunctions(fp, 900, 580).find(j => j.kind === 'panels' && [j.a.id, j.b.id].includes('side'))!.key
    const def = cab({ footprint: fp })
    expect(part(def, 'back').X).toBeCloseTo(18, 6)                    // default: back between the sides
    const c = cab({ footprint: join(fp, k, 'through:back') })
    checkPanels(cab({ footprint: allFlush(c.footprint!) }))
    expect(part(c, 'back').X).toBeCloseTo(0, 6)
    expect(part(c, 'left_side').Z).toBeCloseTo(18, 6)
  })

  it('mitre at a square corner: both panels bevelled 45°, both reach the outline corner', () => {
    const fp = shape('clipped_corner')
    const k = footprintJunctions(fp, 900, 580).find(j => j.kind === 'panels' && [j.a.id, j.b.id].includes('side'))!.key
    const c = cab({ footprint: join(fp, k, 'mitre') })
    checkPanels(cab({ footprint: allFlush(c.footprint!) }))
    const back = part(c, 'back'), ls = part(c, 'left_side')
    expect(back.X).toBeCloseTo(0, 6)
    expect(ls.Z).toBeCloseTo(0, 6)
    expect(Math.abs(back.bevel_lo ?? back.bevel_hi ?? 0)).toBeCloseTo(45, 3)
    expect(Math.abs(ls.bevel_lo ?? ls.bevel_hi ?? 0)).toBeCloseTo(45, 3)
  })

  it('angled corner: through-back flips the butt-bevel (back flush, end bevelled to stop on it)', () => {
    const fp = shape('angled_end', { inset: 200 })
    const k = footprintJunctions(fp, 900, 580).find(j => j.kind === 'panels' && [j.a.id, j.b.id].includes('end'))!.key
    const def = cab({ footprint: fp })
    const c = cab({ footprint: join(fp, k, 'through:back') })
    checkPanels(cab({ footprint: allFlush(c.footprint!) }))
    const alpha = 90 - Math.atan(200 / 580) * 180 / Math.PI
    // Default: the end runs through, the back stops (bevel_hi = 90 − α).
    expect(part(def, 'back').bevel_hi).toBeCloseTo(90 - alpha, 1)
    // Flipped: the back runs to the outline corner; the end is cut to stop on the back's inner face.
    const back = part(c, 'back'), end = part(c, 'side:end')
    expect(back.X + back.DY).toBeCloseTo(900, 3)
    // Same bevel angle (both planes run with the back), cut a board thickness further along.
    expect(end.bevel_lo).toBeCloseTo(part(def, 'side:end').bevel_lo!, 3)
    expect(part(def, 'side:end').DY - end.DY).toBeGreaterThan(17)
  })

  it('every choice on every panel corner keeps the panels inside, apart and filling the band', () => {
    const cases: [string, PresetParams, number, number][] = [
      ['clipped_corner', {}, 900, 580], ['clipped_corner', { side: 'left' }, 900, 580],
      ['angled_end', { inset: 200 }, 900, 580], ['trapezoid', { inset_l: 100, inset_r: 100 }, 900, 580],
      ['diagonal_corner', {}, 900, 900],
    ]
    for (const rules of [{}, { BACK_JOIN: 'behind_sides' }, { ANGLE_JOIN: 'mitre' }] as Partial<ConstructionRules>[])
      for (const [preset, params, w, d] of cases) {
        const fp = shape(preset, params, w, d)
        for (const j of footprintJunctions(fp, w, d).filter(j => j.kind === 'panels'))
          for (const o of joinOptions(j).filter(o => o.value)) {
            const c = cab({ DX: w, DZ: d, footprint: allFlush(withJoin(fp, w, d, j.key, o.value as JoinChoice), w, d) }, rules)
            try { checkPanels(c); checkPanels(cab({ DX: w, DZ: d, footprint: withJoin(fp, w, d, j.key, o.value as JoinChoice) }, rules), false) } catch (e) { throw new Error(`${JSON.stringify(rules)} ${preset} ${j.key} ${o.value}: ${(e as Error).message}`) }
          }
      }
  })

  it('a flush panel end set in joins builds as the legacy flush_ends did; the right-click toggle folds it in', () => {
    const fp = shape('clipped_corner')
    const legacy = cab({ footprint: { ...fp, flush_ends: ['end'] } })
    const key = footprintJunctions(fp, 900, 580).find(j => j.kind === 'panel_end')!.key
    const now = cab({ footprint: join(fp, key, 'flush') })
    expect(resolveCabinet(now).case_parts).toEqual(resolveCabinet(legacy).case_parts)
    expect(panelFrontEnd(now.footprint, 900, 580, 'right_side')).toEqual({ edgeId: 'end', flush: true })
    // Toggle off from the legacy form: flush_ends folded away, back to square.
    const off = toggleFlushEnds(legacy.footprint!, 900, 580, 'end')
    expect(off.flush_ends).toBeUndefined()
    expect(panelFrontEnd(off, 900, 580, 'right_side')).toEqual({ edgeId: 'end', flush: false })
    expect(resolveCabinet(cab({ footprint: off })).case_parts).toEqual(resolveCabinet(cab({ footprint: fp })).case_parts)
    // And on again.
    expect(panelFrontEnd(toggleFlushEnds(off, 900, 580, 'end'), 900, 580, 'right_side')!.flush).toBe(true)
  })

  it('door facets: square doors (reveal) lose the mitre and stay apart', () => {
    const fp = shape('clipped_corner', { clip_w: 300, clip_d: 300 })
    const key = footprintJunctions(fp, 900, 580).find(j => j.kind === 'facets')!.key
    const mitred = resolveCabinet(cab({ footprint: fp, has_face: true }))
    const square = resolveCabinet(cab({ footprint: join(fp, key, 'reveal'), has_face: true }))
    expect(mitred.face_zones.some(z => z.bevel_l || z.bevel_r)).toBe(true)
    expect(square.face_zones.some(z => z.bevel_l || z.bevel_r)).toBe(false)
    // Each square door is narrower than its mitred blank by about tan(22.5°) × door thickness.
    const facet = (r: typeof mitred) => r.face_zones.find(z => z.facet === 'facet')!
    expect(facet(square).DX).toBeLessThan(facet(mitred).DX)
    // Plan: the facet door and the primary door it meets don't overlap.
    const box = (z: (typeof mitred)['face_zones'][number]) => {
      const a = (z.AY ?? 0) * Math.PI / 180, ux = Math.cos(a), uz = -Math.sin(a)
      const nx = Math.sin(a), nz = Math.cos(a), t = z.DZ ?? 18
      return [{ x: z.X, y: z.Z }, { x: z.X + ux * z.DX, y: z.Z + uz * z.DX },
        { x: z.X + ux * z.DX + nx * t, y: z.Z + uz * z.DX + nz * t }, { x: z.X + nx * t, y: z.Z + nz * t }]
    }
    const zs = square.face_zones.map(box)
    for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++)
      expect(area(clipToConvex(zs[i], zs[j]))).toBeLessThan(0.5)
  })

  it('corner choices survive a preset rebuild and placement', () => {
    const fp = shape('l_corner', {}, 900, 900)
    const js = footprintJunctions(fp, 900, 900).filter(j => j.kind === 'panels')
    const set = withJoin(fp, 900, 900, js[0].key, 'mitre')
    const rebuilt = withShapeChoices(set, buildPresetFootprint('l_corner', { ...set.params, leg_back: 500 }, { w: 900, d: 900 }))!
    expect(rebuilt.joins).toEqual(set.joins)
    expect(seedClassDepthParams(set, 560, { w: 900, d: 900 })!.joins).toEqual(set.joins)
  })
})
