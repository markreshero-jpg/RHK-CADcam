import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ResolvedFaceZone } from '../types'
import { buildPresetFootprint } from '../../cabinetShape/presets'
import { rotEulerXYZ, zoneBevelOutline } from '../../jointDrilling'

const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const twoDoors = {
  rows: [{ row_index: 0, height_locked: false }],
  cols: [{ col_index: 0, width_locked: false }, { col_index: 1, width_locked: false }],
  zones: [
    { row_index: 0, col_index: 0, face_type: 'door' as const, hinge_side: 'left' as const },
    { row_index: 0, col_index: 1, face_type: 'door' as const, hinge_side: 'right' as const },
  ],
}

function cab(overrides: Partial<CabinetInput> = {}): CabinetInput {
  return {
    id: 'c1', assembly_class: 'base', DX: 900, DY: 900, DZ: 580,
    has_carcass: true, has_internal: false, has_face: true, has_toekick: true,
    left_neighbour: 'wall', right_neighbour: 'cabinet', exposed_interior: false,
    material: board, door_material: board, shelf_material: board, exposed_material: board,
    toekick_face_material: board, toekick_interior_material: board,
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    face_grid: twoDoors,
    internal_tree: { type: 'open', fittings: [] },
    ...overrides,
  }
}

describe('shaped fronts', () => {
  it('a rectangle-shaped footprint gives the plain fronts', () => {
    const plain = resolveCabinet(cab())
    const shaped = resolveCabinet(cab({ footprint: buildPresetFootprint('trapezoid', { inset_l: 0, inset_r: 0 }, { w: 900, d: 580 }) }))
    expect(shaped.face_zones.length).toBe(2)
    for (const [a, b] of plain.face_zones.map((z, i) => [z, shaped.face_zones[i]])) {
      expect(b.X).toBeCloseTo(a.X, 6); expect(b.Z).toBeCloseTo(a.Z, 6)
      expect(b.DX).toBeCloseTo(a.DX, 6); expect(b.AY).toBe(0); expect(b.facet).toBeUndefined()
    }
  })

  it('clipped corner: primary front keeps zone ids; the facet gets a mitred single door', () => {
    const fp = buildPresetFootprint('clipped_corner', { clip_w: 300, clip_d: 300 }, { w: 900, d: 580 })
    const res = resolveCabinet(cab({ footprint: fp }))
    expect(res.errors).toEqual([])
    const primary = res.face_zones.filter(z => !z.facet)
    const facet = res.face_zones.filter(z => z.facet === 'facet')
    expect(primary.length).toBe(2)
    expect(facet.length).toBe(1)
    // 45° clip → each side of the mitre is bevelled 22.5°.
    expect(primary.find(z => z.col_index === 1)!.bevel_r).toBeCloseTo(22.5, 6)
    expect(facet[0].bevel_r ?? facet[0].bevel_l).toBeCloseTo(22.5, 6)
    expect(Math.abs(facet[0].AY)).toBeCloseTo(45, 6)
    // With their bevelled outlines the two doors meet on the mitre line: the
    // front corners and the back corners each sit about one reveal apart.
    const outlinePts = (z: ResolvedFaceZone) => zoneBevelOutline(z)!.map(q => {
      const [x, , zz] = rotEulerXYZ(0, z.AY, 0, q.x, 0, q.z)
      return { x: z.X + x, z: z.Z + zz }
    })
    const p = outlinePts(primary.find(z => z.col_index === 1)!)   // [backL, backR, frontR, frontL]
    const q = outlinePts(facet[0])
    const near = (a: { x: number; z: number }, pts: { x: number; z: number }[]) =>
      Math.min(...pts.map(b => Math.hypot(a.x - b.x, a.z - b.z)))
    expect(near(p[1], [q[0], q[1]])).toBeLessThan(2)   // back faces meet
    expect(near(p[2], [q[2], q[3]])).toBeLessThan(2)   // front faces meet
    // Facet door hinges toward its side panel (the end at x = DX is the previous edge).
    expect(facet[0].hinge_side).toBe('right')
  })

  it('diagonal corner: the facet is the primary front, turned 45°', () => {
    const fp = buildPresetFootprint('diagonal_corner', {}, { w: 900, d: 900 })
    const res = resolveCabinet(cab({ DX: 900, DZ: 900, footprint: fp, face_grid: twoDoors }))
    expect(res.face_zones.every(z => !z.facet)).toBe(true)
    expect(res.face_zones.length).toBe(2)
    for (const z of res.face_zones) expect(Math.abs(z.AY)).toBeCloseTo(45, 6)
    expect(res.drawer_stacks).toEqual([])   // no box hardware on turned zones yet
  })

  it('a facet grid from cab.faces is used', () => {
    const fp = buildPresetFootprint('clipped_corner', {}, { w: 900, d: 580 })
    const res = resolveCabinet(cab({ footprint: fp, faces: { facet: { ...twoDoors } } }))
    expect(res.face_zones.filter(z => z.facet === 'facet').length).toBe(2)
    expect(res.face_cols.filter(c => c.facet === 'facet').length).toBe(2)
  })
})
