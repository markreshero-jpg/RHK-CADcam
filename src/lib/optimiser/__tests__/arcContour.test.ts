// ============================================================
// True arcs on shaped parts: resolver outlines carry a bulge per arc edge,
// the contour G-code cuts a fitted arc as one G2/G3, the simulator replays it.
// ============================================================

import { describe, it, expect } from 'vitest'
import { generateSheetGcode, DEFAULT_POST } from '../gcode'
import { validateGcode, errorsOf } from '../gcodeValidate'
import { parseGcode } from '../gcodeParser'
import type { NestedSheet } from '../nest'
import { resolveCabinet } from '../../resolver/resolver'
import { mergeRules } from '../../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material } from '../../resolver/types'
import { buildPresetFootprint } from '../../cabinetShape/presets'
import {
  bulgeArc, fitLoopArcs, mapOutline, reverseOutline, sampleOutline, sampleShapeOutline, type OutlinePt, type ShapePt,
} from '../../shapePath'

const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }

function radiusEnd(): ReturnType<typeof resolveCabinet> {
  const fp = buildPresetFootprint('radius_end', { side: 'right', radius: 300 }, { w: 1000, d: 580 })
  return resolveCabinet({
    id: 'c1', assembly_class: 'base', DX: 1000, DY: 840, DZ: 580,
    has_carcass: true, has_internal: true, has_face: false, has_toekick: true,
    left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
    material: board, door_material: board, shelf_material: board, exposed_material: board,
    toekick_face_material: board, toekick_interior_material: board,
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    face_grid: { rows: [], cols: [], zones: [] },
    internal_tree: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: false }] },
    footprint: fp,
  } as CabinetInput)
}

const arcsOf = (o: OutlinePt[]) => o.map((p, i) => ({ p, q: o[(i + 1) % o.length] })).filter(e => e.p.b)

describe('resolver outlines keep the radius', () => {
  const res = radiusEnd()
  const parts: [string, OutlinePt[] | undefined][] = [
    ['bottom', res.case_parts.find(p => p.part_key === 'bottom')?.outline],
    ['front_rail', res.case_parts.find(p => p.part_key === 'front_rail')?.outline],
    ['adj_shelf', res.internal_parts.find(p => p.part_type === 'adj_shelf')?.outline],
  ]
  for (const [k, o] of parts) {
    it(`${k}: the curve is ONE arc edge of radius 300, not 5° flats`, () => {
      expect(o).toBeDefined()
      const arcs = arcsOf(o!)
      expect(arcs).toHaveLength(1)
      const { p, q } = arcs[0]
      const { c, r } = bulgeArc(p, q, p.b!)
      expect(r).toBeCloseTo(300, 2)
      // Everything sampled along it is on the circle, and the loop is short.
      for (const s of sampleOutline([p, q, { x: c.x, y: c.y }]).slice(0, -1)) expect(Math.hypot(s.x - c.x, s.y - c.y)).toBeCloseTo(300, 2)
      expect(o!.length).toBeLessThanOrEqual(7)
    })
  }

  it('an outline reversed and mirrored keeps the same circle', () => {
    const o = parts[2][1]!
    const D = 2000
    const m = reverseOutline(mapOutline(o, p => ({ x: D - p.x, y: p.y }), true))
    const a = arcsOf(o)[0], b = arcsOf(m)[0]
    const ca = bulgeArc(a.p, a.q, a.p.b!).c, cb = bulgeArc(b.p, b.q, b.p.b!).c
    expect(cb.x).toBeCloseTo(D - ca.x, 6)
    expect(cb.y).toBeCloseTo(ca.y, 6)
    // Sampling the mirror = mirroring the samples (same curve, not the other bulge).
    const s1 = sampleOutline(o).map(p => ({ x: D - p.x, y: p.y }))
    for (const p of sampleOutline(m)) expect(s1.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 1e-6)).toBe(true)
  })
})

// 400 × 400 at (100, 100), top-right corner rounded r 150, sampled at 5° (as the snapshot does).
const rounded: ShapePt[] = sampleShapeOutline([
  { type: 'line', p0: { x: 100, y: 100 }, p1: { x: 500, y: 100 } },
  { type: 'line', p0: { x: 500, y: 100 }, p1: { x: 500, y: 350 } },
  { type: 'arc', p0: { x: 500, y: 350 }, p1: { x: 350, y: 500 }, rx: 150, ry: 150, largeArc: 0, sweep: 1 },
  { type: 'line', p0: { x: 350, y: 500 }, p1: { x: 100, y: 500 } },
  { type: 'line', p0: { x: 100, y: 500 }, p1: { x: 100, y: 100 } },
])

describe('fitLoopArcs', () => {
  it('a rectangle stays four straight edges', () => {
    const mv = fitLoopArcs([{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }])
    expect(mv).toHaveLength(4)
    expect(mv.some(m => m.arc)).toBe(false)
  })
  it('a sampled rounded corner comes back as one arc about its centre', () => {
    const mv = fitLoopArcs(rounded)
    const arcs = mv.filter(m => m.arc)
    expect(arcs).toHaveLength(1)
    expect(arcs[0].arc!.c.x).toBeCloseTo(350, 3)
    expect(arcs[0].arc!.c.y).toBeCloseTo(350, 3)
    expect(arcs[0].arc!.ccw).toBe(true)
    expect(mv).toHaveLength(5)
  })
})

describe('contour G-code cuts the arc as G2/G3', () => {
  const sheet: NestedSheet = {
    index: 0, materialId: 'm', thickness: 18,
    stock: { w: 2400, h: 1200, trimTop: 0, trimBottom: 0, trimLeft: 0, trimRight: 0, isOffcut: false, label: null },
    placements: [{ uid: 'p1#0', baseUid: 'case_parts:p1', label: 'Bottom', x: 100, y: 100, w: 400, h: 400, rotated: false }],
    efficiency: 0.1,
  }
  const gen = (over = {}) => generateSheetGcode({
    sheet, thickness: 18, profile: { ...DEFAULT_POST, onion_skin_z: 0, ...over }, drills: [],
    toolNumber: 1, toolDiameter: 10, maxDepthPerPass: 30, outlines: { 'p1#0': rounded },
  })
  for (const [name, over] of [['climb', {}], ['conventional', { milling_direction: 'conventional' }], ['Anderson datum', { origin_corner: 'top_left' }]] as const) {
    it(`one arc move at depth, radius = corner + tool radius — ${name}`, () => {
      const g = gen(over)
      const lines = g.split('\r\n')
      const arcs = lines.filter(l => /^G[23] X/.test(l) && / Z-18\.5/.test(l) && !/helical/.test(l))
      // Lead-in / lead-out arcs (default post) sit off the part; the corner is the one ≥ 100 radius.
      const corner = arcs.filter(l => {
        const m = /I(-?[\d.]+) J(-?[\d.]+)/.exec(l)!
        return Math.hypot(Number(m[1]), Number(m[2])) > 100
      })
      expect(corner).toHaveLength(1)
      const m = /I(-?[\d.]+) J(-?[\d.]+)/.exec(corner[0])!
      expect(Math.hypot(Number(m[1]), Number(m[2]))).toBeCloseTo(155, 1)
      expect(errorsOf(validateGcode(g, {}))).toEqual([])
      // The simulator replays it along the circle (every point 155 from the corner centre).
      const prog = parseGcode(g)
      const ln = lines.indexOf(corner[0])
      const sub = prog.moves.filter(mv => mv.lineIndex === ln)
      expect(sub.length).toBeGreaterThan(10)
      const s0 = sub[0], cx = s0.x0 + Number(m[1]), cy = s0.y0 + Number(m[2])
      for (const mv of sub) expect(Math.hypot(mv.x1 - cx, mv.y1 - cy)).toBeCloseTo(155, 1)
    })
  }
})
