import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material } from '../types'
import type { Footprint, FootprintSegment } from '../../cabinetShape/footprint'
import { footprintJunctions, joinOptions, withJoin } from '../../cabinetShape/junctions'
import { shapedInterior } from '../resolveShapedCase'
import { signedArea, clipToConvex } from '../../cabinetShape/construct'
import { casePlanCorners, isSide } from '../../jointDrilling'
import { isShapedPanelKey } from '../../cabinetShape/partKeys'

// Square inside corner between two panels (a box-out round a duct, RHK6478 Guest
// Robe TC-03, Mark 2026-11-03): one panel runs past the corner by the other's
// thickness so the corner is closed, and its seen end is taped.
const wb: Material = { id: 'wb', name: 'Whiteboard 16.5', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const W = 855, D = 520
const V = [
  { id: 'back', x: '0', y: '0', role: 'back' },
  { id: 'duct_side', x: 'cab.w - 300', y: '0', role: 'back' },
  { id: 'duct_back', x: 'cab.w - 300', y: '200', role: 'back' },
  { id: 'right', x: 'cab.w', y: '200', role: 'side' },
  { id: 'front', x: 'cab.w', y: 'cab.d', role: 'front' },
  { id: 'left', x: '0', y: 'cab.d', role: 'side' },
] as const
const pts = [[0, 0], [W - 300, 0], [W - 300, 200], [W, 200], [W, D], [0, D]].map(([x, y]) => ({ x, y }))
const fp0: Footprint = {
  preset: null, params: {},
  segments: V.map((v, i) => ({ type: 'line', p0: pts[i], p1: pts[(i + 1) % 6], p0_expr: { x: v.x, y: v.y }, edge: { id: v.id, role: v.role } })) as FootprintSegment[],
}
const cab = (footprint: Footprint): CabinetInput => ({
  id: 'c1', assembly_class: 'tall', DX: W, DY: 2200, DZ: D,
  has_carcass: true, has_internal: false, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: wb, door_material: wb, shelf_material: wb, exposed_material: wb,
  toekick_face_material: wb, toekick_interior_material: wb,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, {}),
  face_grid: { rows: [{ row_index: 0, height_locked: false }], cols: [{ col_index: 0, width_locked: false }], zones: [{ row_index: 0, col_index: 0, face_type: 'open' }] },
  internal_tree: { type: 'open', fittings: [] }, footprint,
})
const plan = (p: Parameters<typeof casePlanCorners>[0]) => casePlanCorners(p).map(q => ({ x: q.x, y: q.z }))
const area = (p: { x: number; y: number }[]) => Math.abs(signedArea(p))
const vertical = (k: string) => isSide(k) || k === 'back' || isShapedPanelKey(k)
const bb = (p: { x: number; y: number }[]) => ({ x0: Math.min(...p.map(q => q.x)), x1: Math.max(...p.map(q => q.x)), y0: Math.min(...p.map(q => q.y)), y1: Math.max(...p.map(q => q.y)) })

function check(fp: Footprint) {
  const c = cab(fp)
  const rp = resolveCabinet(c)
  const sh = shapedInterior(c)!
  const panels = rp.case_parts.filter(p => vertical(p.part_key)).map(p => ({ k: p.part_key, p, pts: plan(p) }))
  for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++)
    expect(area(clipToConvex(panels[i].pts, panels[j].pts)), `${panels[i].k} × ${panels[j].k}`).toBeLessThan(0.5)
  // Closed: the panels fill the band between the outline and the inset polygon.
  expect(panels.reduce((a, p) => a + area(p.pts), 0)).toBeCloseTo(area(sh.outline) - area(sh.inner), 0)
  return Object.fromEntries(panels.map(p => [p.k, p]))
}

describe('square inside corner between two panels', () => {
  it('is listed as a corner with a through choice for each panel', () => {
    const js = footprintJunctions(fp0, W, D).filter(j => j.kind === 'inside')
    expect(js.map(j => j.key)).toEqual(['duct_side|duct_back'])
    expect(joinOptions(js[0]).map(o => o.value)).toEqual(['', 'through:duct_side', 'through:duct_back'])
  })

  it('default: the earlier panel runs past by the other\'s thickness, its seen end taped', () => {
    const ps = check(fp0)
    const side = bb(ps['back:duct_side'].pts), back = bb(ps['back:duct_back'].pts)
    expect(side.y1).toBeCloseTo(216.5)            // past the corner (200) by 16.5
    expect(back.x0).toBeCloseTo(W - 300)          // stops at the corner
    expect(ps['back:duct_side'].p.edge_band).toMatchObject({ right: true, left: false })
    expect(ps['back:duct_back'].p.edge_band).toMatchObject({ left: false, right: false })
  })

  it('hand-set: the other panel runs through instead, its low end taped', () => {
    const ps = check(withJoin(fp0, W, D, 'duct_side|duct_back', 'through:duct_back'))
    const side = bb(ps['back:duct_side'].pts), back = bb(ps['back:duct_back'].pts)
    expect(side.y1).toBeCloseTo(200)
    expect(back.x0).toBeCloseTo(W - 300 - 16.5)
    expect(ps['back:duct_back'].p.edge_band).toMatchObject({ left: true, right: false })
    expect(ps['back:duct_side'].p.edge_band).toMatchObject({ left: false, right: false })
  })
})
