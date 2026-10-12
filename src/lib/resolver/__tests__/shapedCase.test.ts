import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ResolvedCasePart } from '../types'
import { buildPresetFootprint } from '../../cabinetShape/presets'
import { caseBox } from '../../jointDrilling'

const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }

function cab(overrides: Partial<CabinetInput> = {}): CabinetInput {
  return {
    id: 'c1', assembly_class: 'base', DX: 900, DY: 900, DZ: 580,
    has_carcass: true, has_internal: true, has_face: false, has_toekick: true,
    left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
    material: board, door_material: board, shelf_material: board, exposed_material: board,
    toekick_face_material: board, toekick_interior_material: board,
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    face_grid: { rows: [], cols: [], zones: [] },
    internal_tree: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: false }] },
    ...overrides,
  }
}

const keys = (ps: { part_key: string }[]) => ps.map(p => p.part_key).sort()
const get = (ps: ResolvedCasePart[], k: string) => ps.find(p => p.part_key === k)!

describe('shaped case', () => {
  it('a rectangle cabinet is untouched', () => {
    const a = resolveCabinet(cab()), b = resolveCabinet(cab({ footprint: null }))
    expect(b.case_parts).toEqual(a.case_parts)
  })

  it('clipped corner: right side shortened, angled facet gets no panel, bottom carries an outline', () => {
    const fp = buildPresetFootprint('clipped_corner', { clip_w: 300, clip_d: 200 }, { w: 900, d: 580 })
    const rect = resolveCabinet(cab())
    const res = resolveCabinet(cab({ footprint: fp }))
    expect(res.errors).toEqual([])
    // Same box parts, no new panels; the facet only adds its top rail.
    expect(keys(res.case_parts)).toEqual(keys([...rect.case_parts, { part_key: 'rail:facet' }]))
    const rs = get(res.case_parts, 'right_side'), rsRect = get(rect.case_parts, 'right_side')
    expect(rs.DX).toBeCloseTo(380 - rsRect.Z, 3)                   // stops where the clip starts
    const bottom = get(res.case_parts, 'bottom')
    expect(bottom.outline?.length).toBe(5)                          // bottom has the chamfer
    // Bottom stays inside the facet line through (900,380)–(600,580): 2x + 3z = 2940.
    const b = caseBox(bottom)
    const pts = bottom.outline!.map(q => ({ X: b.x + q.x, Z: b.z + b.d - q.y }))
    for (const q of pts) expect(2 * q.X + 3 * q.Z).toBeLessThanOrEqual(2940 + 0.01)
    expect(pts.some(q => Math.abs(2 * q.X + 3 * q.Z - 2940) < 0.01)).toBe(true)   // reaches it (no facet panel)
    // Shelf clipped too.
    expect(res.internal_parts.find(p => p.part_type === 'adj_shelf')!.outline?.length).toBeGreaterThanOrEqual(5)
  })

  it('angled end: the box right side is replaced by a rotated side:end panel', () => {
    const fp = buildPresetFootprint('angled_end', { inset: 200 }, { w: 900, d: 580 })
    const res = resolveCabinet(cab({ footprint: fp }))
    expect(res.case_parts.some(p => p.part_key === 'right_side')).toBe(false)
    const end = get(res.case_parts, 'side:end')
    // Edge runs (900,0) → (700,580): angle of +u = (−200, 580)/len; AY = atan2(−uz, ux).
    const len = Math.hypot(200, 580)
    expect(end.AY).toBeCloseTo(Math.atan2(-580 / len, -200 / len) * 180 / Math.PI, 6)
    expect(end.DY).toBeGreaterThan(len - 40)
    expect(end.DY).toBeLessThanOrEqual(len)
    expect(end.DZ).toBe(18)
  })

  it('diagonal corner: two backs butt, the corner-wall back becomes back:back2', () => {
    const fp = buildPresetFootprint('diagonal_corner', {}, { w: 900, d: 900 })
    const res = resolveCabinet(cab({ DX: 900, DZ: 900, footprint: fp }))
    expect(res.case_parts.some(p => p.part_key === 'back')).toBe(true)
    const b2 = get(res.case_parts, 'back:back2')
    expect(b2.DY).toBeGreaterThan(800)          // full corner-wall run minus the butt
    expect(res.case_parts.some(p => p.part_key === 'left_side')).toBe(false)   // x = 0 edge is a back
    expect(res.case_parts.some(p => p.part_key === 'front_rail')).toBe(false)  // no straight front
    expect(res.case_parts.some(p => p.part_key === 'rail:facet')).toBe(true)
  })

  it('left-hand presets build the mirror', () => {
    const r = resolveCabinet(cab({ footprint: buildPresetFootprint('angled_end', { side: 'right' }, { w: 900, d: 580 }) }))
    const l = resolveCabinet(cab({ footprint: buildPresetFootprint('angled_end', { side: 'left' }, { w: 900, d: 580 }) }))
    expect(r.case_parts.some(p => p.part_key === 'left_side')).toBe(true)
    expect(l.case_parts.some(p => p.part_key === 'right_side')).toBe(true)
    expect(get(l.case_parts, 'side:end').DY).toBeCloseTo(get(r.case_parts, 'side:end').DY, 3)
  })
})
