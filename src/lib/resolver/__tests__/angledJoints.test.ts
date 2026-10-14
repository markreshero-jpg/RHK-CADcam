import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ConstructionRules } from '../types'
import { buildPresetFootprint } from '../../cabinetShape/presets'
import type { PresetParams } from '../../cabinetShape/footprint'
import { shapedInterior, panelFrontEnd } from '../resolveShapedCase'
import { signedArea, clipToConvex } from '../../cabinetShape/construct'
import { casePlanCorners, caseBevelOutline, isSide } from '../../jointDrilling'
import { isShapedPanelKey } from '../../cabinetShape/partKeys'

// z_cabinet_shape 4a: angled carcass joints. The vertical panels must fill the
// band between the outline and the inside of the carcass exactly — no gap at an
// angled corner, no overlap, nothing past the outline.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const cab = (o: Partial<CabinetInput>, rules: Partial<ConstructionRules> = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 900, DY: 870, DZ: 580,
  has_carcass: true, has_internal: false, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, rules),
  face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
  ...o,
})

type P = { x: number; y: number }
const area = (pts: P[]) => Math.abs(signedArea(pts))
const vertical = (k: string) => isSide(k) || k === 'back' || isShapedPanelKey(k)

const cases: [string, PresetParams, number, number][] = [
  ['trapezoid', { inset_l: 100, inset_r: 100 }, 900, 580],
  ['angled_end', { inset: 200 }, 900, 580],
  ['angled_end', { inset: 200, side: 'left' }, 900, 580],
  ['clipped_corner', { clip_w: 300, clip_d: 200 }, 900, 580],
  ['diagonal_corner', {}, 900, 900],
]

describe('angled carcass joints (4a)', () => {
  for (const join of ['butt_bevel', 'mitre'] as const) {
    for (const [preset, params, w, d] of cases) {
      it(`${join} · ${preset} ${JSON.stringify(params)}: panels fill the carcass band exactly`, () => {
        // Every panel end at an angled front bevelled flush (the right-click option).
        const fp = buildPresetFootprint(preset, params, { w, d })!
        const c = cab({ DX: w, DZ: d, footprint: { ...fp, flush_ends: fp.segments.map(e => e.edge.id) } }, { ANGLE_JOIN: join })
        const rp = resolveCabinet(c)
        const sh = shapedInterior(c)!
        const panels = rp.case_parts.filter(p => vertical(p.part_key))
          .map(p => ({ k: p.part_key, pts: casePlanCorners(p).map(q => ({ x: q.x, y: q.z })) }))
        // Inside the outline.
        for (const p of panels) expect(area(clipToConvex(p.pts, sh.outline)), p.k).toBeCloseTo(area(p.pts), 0)
        // No overlaps.
        for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++)
          expect(area(clipToConvex(panels[i].pts, panels[j].pts)), `${panels[i].k} × ${panels[j].k}`).toBeLessThan(0.5)
        // No gaps: the panels add up to the band (the outlines are convex here).
        const band = area(sh.outline) - area(sh.inner)
        expect(panels.reduce((a, p) => a + area(p.pts), 0)).toBeCloseTo(band, 0)
      })
    }
  }

  it('butt_bevel: the side runs through flush; the back stops against it with a bevel', () => {
    const fp = buildPresetFootprint('angled_end', { inset: 200 }, { w: 900, d: 580 })!
    const c = cab({ footprint: { ...fp, flush_ends: ['end'] } })
    const rp = resolveCabinet(c)
    const end = rp.case_parts.find(p => p.part_key === 'side:end')!
    const back = rp.case_parts.find(p => p.part_key === 'back')!
    const alpha = 90 - Math.atan(200 / 580) * 180 / Math.PI   // back → end corner (≈ 71°)
    // Back stops on the end's inner face: bevel = 90 − α, inner face shorter.
    expect(back.bevel_hi).toBeCloseTo(90 - alpha, 1)
    // End runs to the outline: its back end lies in the back's outer plane.
    expect(end.bevel_lo).toBeCloseTo(90 - alpha, 1)
    // Its front end is flush with the front (109° → inner face longer).
    expect(end.bevel_hi).toBeCloseTo(-(90 - alpha), 1)
  })

  it('square front ends (default) stay inside the outline and never overlap', () => {
    for (const [preset, params, w, d] of cases) {
      const c = cab({ DX: w, DZ: d, footprint: buildPresetFootprint(preset, params, { w, d }) })
      const sh = shapedInterior(c)!
      const panels = resolveCabinet(c).case_parts.filter(p => vertical(p.part_key)).map(p => casePlanCorners(p).map(q => ({ x: q.x, y: q.z })))
      for (const p of panels) expect(area(clipToConvex(p, sh.outline))).toBeCloseTo(area(p), 0)
      for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++)
        expect(area(clipToConvex(panels[i], panels[j]))).toBeLessThan(0.5)
    }
  })

  it('mitre: both panels take half the corner', () => {
    const c = cab({ footprint: buildPresetFootprint('angled_end', { inset: 200 }, { w: 900, d: 580 }) }, { ANGLE_JOIN: 'mitre' })
    const rp = resolveCabinet(c)
    const end = rp.case_parts.find(p => p.part_key === 'side:end')!
    const back = rp.case_parts.find(p => p.part_key === 'back')!
    const alpha = 90 - Math.atan(200 / 580) * 180 / Math.PI
    expect(back.bevel_hi).toBeCloseTo(90 - alpha / 2, 1)
    expect(end.bevel_lo).toBeCloseTo(90 - alpha / 2, 1)
    // The back now reaches the outline corner.
    expect(back.X + back.DY).toBeCloseTo(900, 3)
  })

  it('diagonal corner: square back corners stay square; side front ends square unless set flush', () => {
    const fp = buildPresetFootprint('diagonal_corner', {}, { w: 900, d: 900 })!
    const rp = resolveCabinet(cab({ footprint: fp, DZ: 900 }))
    const get = (k: string) => rp.case_parts.find(p => p.part_key === k)!
    expect(caseBevelOutline(get('back'))).toBeNull()
    expect(caseBevelOutline(get('back:back2'))).toBeNull()
    expect(caseBevelOutline(get('right_side'))).toBeNull()
    // Right-click "bevel front edge" on the right side only.
    expect(panelFrontEnd(fp, 900, 900, 'right_side')).toEqual({ edgeId: 'end', flush: false })
    expect(panelFrontEnd(fp, 900, 900, 'back')).toBeNull()          // no angled front at its ends
    const rp2 = resolveCabinet(cab({ footprint: { ...fp, flush_ends: ['end'] }, DZ: 900 }))
    expect(rp2.case_parts.find(p => p.part_key === 'right_side')!.bevel_hi).toBeCloseTo(-45, 6)
    expect(caseBevelOutline(rp2.case_parts.find(p => p.part_key === 'side:side')!)).toBeNull()
    // The backs meet in the corner (one runs through to the outline).
    expect(get('back').X).toBeCloseTo(0, 6)
  })
})
