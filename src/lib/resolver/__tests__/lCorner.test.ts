import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ResolvedFaceZone } from '../types'
import { buildPresetFootprint, seedClassDepthParams } from '../../cabinetShape/presets'
import { evaluateFootprint } from '../../cabinetShape/footprint'
import { rotEulerXYZ, caseBoxAABB } from '../../jointDrilling'

// z_cabinet_shape L corner (BCNP, Mark 2026-10-15): 900 × 900 box, both legs
// at the run's base depth, square notch out of the front corner.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const door = { rows: [{ row_index: 0, height_locked: false }], cols: [{ col_index: 0, width_locked: false }],
  zones: [{ row_index: 0, col_index: 0, face_type: 'door' as const, hinge_side: 'right' as const }] }
const cab = (o: Partial<CabinetInput>): CabinetInput => ({
  id: 'c1', assembly_class: 'base_corner', DX: 900, DY: 870, DZ: 900,
  has_carcass: true, has_internal: false, has_face: true, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
  face_grid: door, internal_tree: { type: 'open', fittings: [] },
  ...o,
})
// Plan-view AABB of a resolved door (X / Z after its AY turn).
const box = (z: ResolvedFaceZone) => {
  const pts = ([[0, 0], [z.DX, 0], [z.DX, z.DZ], [0, z.DZ]] as const).map(([x, d]) => {
    const [rx, , rz] = rotEulerXYZ(0, z.AY, 0, x, 0, d)
    return { x: z.X + rx, y: z.Z + rz }
  })
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

describe('L corner preset', () => {
  it('right hand: legs at the param depths, notch at the front corner', () => {
    const fp = buildPresetFootprint('l_corner', { leg_back: 560, leg_side: 560 }, { w: 900, d: 900 })!
    const pts = evaluateFootprint(fp, { w: 900, d: 900 }).map(s => [Math.round(s.p0.x), Math.round(s.p0.y)])
    expect(pts).toEqual([[0, 0], [900, 0], [900, 560], [560, 560], [560, 900], [0, 900]])
    expect(fp.segments.map(s => s.edge.role)).toEqual(['back', 'side', 'front', 'front', 'side', 'back'])
  })

  it('placement seeds both legs from the class depth and keeps role overrides', () => {
    const def = buildPresetFootprint('l_corner', {}, { w: 900, d: 900 }, { end: { role: 'side', sub: 'scribe' } })!
    const fp = seedClassDepthParams(def, 560, { w: 900, d: 900 })!
    expect(fp.params).toMatchObject({ leg_back: 560, leg_side: 560 })
    expect(fp.segments.find(s => s.edge.id === 'end')!.edge).toMatchObject({ role: 'side', sub: 'scribe' })
    // Presets without class-depth params come back untouched.
    const clip = buildPresetFootprint('clipped_corner', {}, { w: 900, d: 580 })
    expect(seedClassDepthParams(clip, 560, { w: 900, d: 580 })).toBe(clip)
  })

  for (const side of ['right', 'left'] as const) {
    it(`${side} hand: the two doors don't collide at the inside corner`, () => {
      const c = cab({ footprint: buildPresetFootprint('l_corner', { leg_back: 560, leg_side: 560, side }, { w: 900, d: 900 }) })
      const rp = resolveCabinet(c)
      expect(rp.face_zones).toHaveLength(2)
      const [a, b] = rp.face_zones.map(box)
      const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.01 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.01
      expect(overlap).toBe(false)
      // Both stop door t + 2 back from the doors' inside corner (back planes
      // meet FACBUF out from the carcass corner at 560/560): each door's end is
      // exactly 2 clear of the other door's front face.
      const buf = c.rules.FACBUF, t = 18, q = side === 'right' ? 560 : 340
      // Door on the back-wall leg (horizontal in plan) and the return-leg door (vertical).
      const horiz = [a, b].find(z => z.x1 - z.x0 > z.y1 - z.y0)!
      const vert = [a, b].find(z => z.y1 - z.y0 > z.x1 - z.x0)!
      const vertFront = side === 'right' ? vert.x1 : vert.x0
      const horizEnd = side === 'right' ? horiz.x0 : horiz.x1
      expect(Math.abs(horizEnd - vertFront)).toBeCloseTo(2, 3)
      expect(vert.y0 - horiz.y1).toBeCloseTo(2, 3)
      expect(Math.abs(horizEnd - q)).toBeCloseTo(buf + t + 2, 3)
    })
  }
})

describe('L corner top rails', () => {
  for (const orient of ['vertical', 'horizontal'] as const) {
    for (const side of ['right', 'left'] as const) {
      it(`${orient} rails, ${side} hand: one runs through the inside corner, no overlap`, () => {
        const c = cab({
          top_type: 'front_rail',
          rules: mergeRules(DEFAULT_RULES, { RAIL_ORIENT: orient }),
          footprint: buildPresetFootprint('l_corner', { leg_back: 560, leg_side: 560, side }, { w: 900, d: 900 }),
        })
        const rails = resolveCabinet(c).case_parts.filter(p => p.part_key.startsWith('rail:'))
        expect(rails.map(p => p.part_key).sort()).toEqual(['rail:front', 'rail:front2'])
        const depth = orient === 'vertical' ? 18 : DEFAULT_RULES.RD
        for (const p of rails) {
          expect(!!p.upright).toBe(orient === 'vertical')
          expect(caseBoxAABB(p).h).toBeCloseTo(orient === 'vertical' ? DEFAULT_RULES.RD : 18, 3)
        }
        const [a, b] = rails.map(caseBoxAABB)
        const ov = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01
          && Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z) > 0.01
        expect(ov).toBe(false)
        // The depth × depth square inside the corner (560,560) is covered by one rail.
        const q = side === 'right' ? 560 : 340
        const cx = side === 'right' ? q - depth / 2 : q + depth / 2, cz = 560 - depth / 2
        const covers = (r: typeof a) => cx > r.x && cx < r.x + r.w && cz > r.z && cz < r.z + r.d
        expect([a, b].filter(covers)).toHaveLength(1)
      })
    }
  }
})
