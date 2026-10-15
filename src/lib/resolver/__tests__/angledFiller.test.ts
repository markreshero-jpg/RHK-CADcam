import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ResolvedFaceZone } from '../types'
import { buildPresetFootprint, presetBox } from '../../cabinetShape/presets'
import { evaluateFootprint, type Footprint } from '../../cabinetShape/footprint'
import { canonicalSegments } from '../../cabinetShape/construct'
import { rotEulerXYZ, zoneBlank } from '../../jointDrilling'
import { evaluateFormula } from '../../formula'

// z_angled_filler (BFKANG): two mitred face fillers in an inside corner where
// wall B turns θ into the room, over an optional support carcass.
const board = (t: number): Material => ({ id: `m${t}`, name: `Board ${t}`, DZ: t, sheet_dx: 2400, sheet_dy: 1200, has_grain: false })

function fp(params: Record<string, number | string> = {}): Footprint {
  const f = buildPresetFootprint('angled_filler', params, { w: 0, d: 0 })!
  return f
}
function cab(f: Footprint, o: Partial<CabinetInput> = {}): CabinetInput {
  const box = presetBox(f)!
  return {
    id: 'c1', assembly_class: 'base', DX: box.w, DY: 870, DZ: box.d,
    has_carcass: true, has_internal: false, has_face: true, has_toekick: true,
    left_neighbour: 'cabinet', right_neighbour: 'cabinet', exposed_interior: false,
    material: board(16), door_material: board(18), shelf_material: board(16), exposed_material: board(18),
    toekick_face_material: board(16), toekick_interior_material: board(16),
    slide_side_deduction: 13, rules: mergeRules({ ...DEFAULT_RULES, TOP_TYPE: 'full_top' }),
    footprint: f, internal_tree: { type: 'open', fittings: [] },
    // A door grid: filler facets ignore it and resolve as false panels.
    face_grid: { rows: [{ row_index: 0, height_locked: false }], cols: [{ col_index: 0, width_locked: false }],
      zones: [{ row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'left' }] },
    ...o,
  }
}

// Front face (z = DZ) end points of a zone in plan, after its bevels and AY turn.
function frontFace(z: ResolvedFaceZone) {
  const h = z.DZ / 2, D = Math.PI / 180
  const l = h * Math.tan((z.bevel_l ?? 0) * D), r = h * Math.tan((z.bevel_r ?? 0) * D)
  return [-l, z.DX + r].map(x => {
    const [rx, , rz] = rotEulerXYZ(0, z.AY ?? 0, 0, x, 0, z.DZ)
    return { x: z.X + rx, y: z.Z + rz }
  })
}
const d2 = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe('formula trig (degrees)', () => {
  it('sin / cos / tan / sqrt', () => {
    const v = (s: string) => { const r = evaluateFormula(s, { roots: {} }); return r.ok ? r.value : NaN }
    expect(v('sin(30)')).toBeCloseTo(0.5, 9)
    expect(v('cos(60)')).toBeCloseTo(0.5, 9)
    expect(v('tan(45)')).toBeCloseTo(1, 9)
    expect(v('sqrt(16)')).toBe(4)
    expect(evaluateFormula('sqrt(-1)', { roots: {} }).ok).toBe(false)
  })
})

describe('angled_filler preset', () => {
  it('45° right hand: sides square to each wall, apex on the bisector, box = bbox', () => {
    const f = fp()
    const pts = evaluateFootprint(f, { w: 0, d: 0 }).map(s => s.p0)
    const [back, back2, sideB, fillB, fillA, sideA] = pts
    const T = Math.tan(22.5 * Math.PI / 180)
    const la = 40 + 1 + 20 * T
    expect(back).toEqual({ x: 0, y: 0 })
    expect(fillA.x).toBeCloseTo(la, 6); expect(fillA.y).toBeCloseTo(580, 6)
    expect(sideA).toEqual({ x: 0, y: 580 })
    expect(back2.x).toBeCloseTo(la + 580 * T, 6); expect(back2.y).toBe(0)
    // wall B runs at 45° from C; side B is square to it, 580 deep
    const ub = { x: (sideB.x - back2.x), y: (sideB.y - back2.y) }
    expect(Math.atan2(ub.y, ub.x) * 180 / Math.PI).toBeCloseTo(45, 6)
    expect(d2(sideB, fillB)).toBeCloseTo(580, 6)
    expect((fillB.x - sideB.x) * ub.x + (fillB.y - sideB.y) * ub.y).toBeCloseTo(0, 6)
    // facet B has the same carcass length as facet A (equal fills)
    expect(d2(fillB, fillA)).toBeCloseTo(la, 6)
    // filler edges carry their width + cleat
    const edges = Object.fromEntries(f.segments.map(s => [s.edge.id, s.edge]))
    expect(edges.fill_a.filler).toEqual({ width: 40, cleat: 50 })
    expect(edges.fill_b.filler).toEqual({ width: 40, cleat: 50 })
    const box = presetBox(f)!
    expect(box.w).toBeCloseTo(Math.max(...pts.map(p => p.x)), 0)
    expect(box.d).toBeCloseTo(Math.max(...pts.map(p => p.y)), 0)
    expect(box.d).toBeGreaterThan(580)
  })

  it('left hand mirrors about the box width', () => {
    const r = evaluateFootprint(fp(), { w: 0, d: 0 }).map(s => s.p0)
    const lf = fp({ side: 'left' })
    const l = evaluateFootprint(lf, { w: 0, d: 0 }).map(s => s.p0)
    const W = presetBox(lf)!.w
    expect(presetBox(lf)).toEqual(presetBox(fp()))
    r.forEach((p, i) => { expect(l[i].x).toBeCloseTo(W - p.x, 0); expect(l[i].y).toBeCloseTo(p.y, 6) })
  })

  it('follows the angle (30° wall)', () => {
    const pts = evaluateFootprint(fp({ angle: 30 }), { w: 0, d: 0 }).map(s => s.p0)
    const ub = { x: pts[2].x - pts[1].x, y: pts[2].y - pts[1].y }
    expect(Math.atan2(ub.y, ub.x) * 180 / Math.PI).toBeCloseTo(30, 6)
  })
})

describe('angled filler resolve', () => {
  for (const side of ['right', 'left'] as const) {
    for (const angle of [45, 30]) {
      it(`${side} hand ${angle}°: two false panels, mitred, each face exactly 40 wide, meeting at the apex`, () => {
        const res = resolveCabinet(cab(fp({ side, angle })))
        expect(res.errors).toEqual([])
        const zones = res.face_zones
        expect(zones).toHaveLength(2)
        expect(zones.every(z => z.face_type === 'false_panel')).toBe(true)
        for (const z of zones) {
          const bev = (z.bevel_l ?? 0) + (z.bevel_r ?? 0)
          expect(bev).toBeCloseTo(-angle / 2, 6)
          const [a, b] = frontFace(z)
          expect(d2(a, b)).toBeCloseTo(40, 6)
          // blank = the longer (back) face
          expect(zoneBlank(z).width).toBeCloseTo(z.DX + (z.DZ / 2) * Math.tan(angle / 2 * Math.PI / 180), 6)
        }
        // The front faces share their apex corner.
        const [fa, fb] = zones.map(frontFace)
        const best = Math.min(...fa.flatMap(p => fb.map(q => d2(p, q))))
        expect(best).toBeLessThan(0.01)
      })
    }
  }

  it('a 16 mm door still shows 40 (the outer gap takes the difference)', () => {
    const res = resolveCabinet(cab(fp(), { door_material: board(16) }))
    for (const z of res.face_zones) {
      const [a, b] = frontFace(z)
      expect(d2(a, b)).toBeCloseTo(40, 6)
    }
  })

  it('fill widths are independent', () => {
    const res = resolveCabinet(cab(fp({ fill_a: 60, fill_b: 25 })))
    const widths = res.face_zones.map(z => { const [a, b] = frontFace(z); return Math.round(d2(a, b) * 1000) / 1000 }).sort((a, b) => a - b)
    expect(widths).toEqual([25, 60])
  })

  it('support carcass: sides, backs, bottom and full top; no rails, no internals', () => {
    const keys = resolveCabinet(cab(fp())).case_parts.map(p => p.part_key).sort()
    expect(keys).toEqual(['back', 'back:back2', 'bottom', 'full_top', 'left_side', 'side:side_b'])
  })

  it('kick follows the shape, mitred at the apex', () => {
    const res = resolveCabinet(cab(fp()))
    const faces = res.toekick_parts.filter(p => p.part_key === 'kick_front_face')
    expect(faces).toHaveLength(2)
    expect(faces.map(p => (p.bevel_lo ?? 0) + (p.bevel_hi ?? 0))).toEqual([-22.5, -22.5])
  })

  it('no cleats while the carcass is on', () => {
    expect(resolveCabinet(cab(fp())).case_parts.some(p => p.part_key.startsWith('cleat:'))).toBe(false)
  })

  for (const side of ['right', 'left'] as const) {
    it(`${side} hand, carcass off: one return cleat per filler, in the side's plane, behind the face`, () => {
      const f = fp({ side })
      const res = resolveCabinet(cab(f, { has_carcass: false }))
      expect(res.errors).toEqual([])
      const cleats = res.case_parts
      expect(cleats.map(p => p.part_key).sort()).toEqual(['cleat:side_a', 'cleat:side_b'])
      const box = presetBox(f)!
      const segs = canonicalSegments(f, box.w, box.d)
      for (const c of cleats) {
        const side = segs.find(s => s.edge.id === c.part_key.slice(6))!
        const u = { x: side.p1.x - side.p0.x, y: side.p1.y - side.p0.y }
        const L = Math.hypot(u.x, u.y); u.x /= L; u.y /= L
        // Outer face on the side edge's line, running along it.
        const cross = (c.X - side.p0.x) * u.y - (c.Z - side.p0.y) * u.x
        expect(Math.abs(cross)).toBeLessThan(1e-6)
        expect(c.AY).toBeCloseTo(Math.atan2(-u.y, u.x) * 180 / Math.PI, 6)
        expect(c.DY).toBeCloseTo(2 + 50, 6)          // FACBUF to the face's back + cleat depth
        expect(c.DZ).toBe(16)
        // Same height as the filler face.
        const z = res.face_zones[0]
        expect(c.Y).toBe(z.Y); expect(c.DX).toBe(z.DY)
        // Front end 2 mm in front of the front vertex (the filler's back face).
        const ends = [{ x: c.X, y: c.Z }, { x: c.X + u.x * c.DY, y: c.Z + u.y * c.DY }]
        const fillers = segs.filter(s => s.edge.filler).flatMap(s => [s.p0, s.p1])
        const front = fillers.reduce((a, b) => (Math.min(d2(b, side.p0), d2(b, side.p1)) < Math.min(d2(a, side.p0), d2(a, side.p1)) ? b : a))
        expect(Math.min(...ends.map(e => d2(e, front)))).toBeCloseTo(2, 6)
      }
    })
  }
})
