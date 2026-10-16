// ============================================================
// Phase plan O4 — shaped parts cut their outline, not the rect.
// ============================================================

import { describe, it, expect } from 'vitest'
import { generateSheetGcode, DEFAULT_POST, type PostProfile } from '../gcode'
import { validateGcode, errorsOf } from '../gcodeValidate'
import type { NestedSheet } from '../nest'

const sheetWith = (pl: Partial<NestedSheet['placements'][number]> = {}): NestedSheet => ({
  index: 0, materialId: 'm', thickness: 18,
  stock: { w: 2400, h: 1200, trimTop: 0, trimBottom: 0, trimLeft: 0, trimRight: 0, isOffcut: false, label: null },
  placements: [{ uid: 'p1#0', baseUid: 'case_parts:p1', label: 'Bottom', x: 100, y: 100, w: 400, h: 400, rotated: false, ...pl }],
  efficiency: 0.1,
})
// L: 400 × 400 with the top-right 200 × 200 quarter missing (sheet coords, CCW).
const L = [
  { x: 100, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 300 },
  { x: 300, y: 300 }, { x: 300, y: 500 }, { x: 100, y: 500 },
]
const gen = (over: Partial<PostProfile>, outline?: { x: number; y: number }[], pl?: Partial<NestedSheet['placements'][number]>) =>
  generateSheetGcode({
    sheet: sheetWith(pl), thickness: 18, profile: { ...DEFAULT_POST, onion_skin_z: 0, ...over }, drills: [],
    toolNumber: 1, toolDiameter: 10, maxDepthPerPass: 30,
    ...(outline ? { outlines: { 'p1#0': outline } } : {}),
  })

// XY of every feed move at the final cut depth.
const atZ = (l: string, z: string) => { const m = / Z(-?[\d.]+)/.exec(l); return !!m && Number(m[1]) === Number(z) }
function cutPoints(g: string, z: string): string[] {
  return g.split('\r\n').filter(l => /^G1 X/.test(l) && atZ(l, z)).map(l => /X(-?[\d.]+) Y(-?[\d.]+)/.exec(l)!).map(m => `${Number(m[1])},${Number(m[2])}`)
}

describe('contour perimeter (O4)', () => {
  const posts: [string, Partial<PostProfile>][] = [
    ['default climb', {}],
    ['conventional', { milling_direction: 'conventional' }],
    ['Anderson datum (top-left, y up → flipped winding)', { origin_corner: 'top_left', keep_decimal_point: true, modal_output: true }],
    ['control comp', { cutter_compensation: 'control' }],
    ['lead-in arcs, plunge entry', { entry_strategy: 'straight_plunge', lead_in_type: 'arc_tangent', lead_out_type: 'arc_tangent' }],
    ['onion skin', { onion_skin_z: 0.4 }],
  ]
  for (const [name, over] of posts) {
    it(`a rectangle outline posts exactly the same program as the plain rect — ${name}`, () => {
      const rect = [{ x: 100, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 500 }, { x: 100, y: 500 }]
      expect(gen(over, rect)).toBe(gen(over))
      expect(gen(over, [...rect].reverse())).toBe(gen(over))   // either winding in
    })
  }

  it('an L cuts the L: tool centre one radius outside every edge, inside corner included', () => {
    const g = gen({}, L)
    const pts = new Set(cutPoints(g, '-18.5'))
    for (const c of ['95,95', '505,95', '505,305', '305,305', '305,505', '95,505']) expect(pts.has(c)).toBe(true)
    // The missing quarter is never entered at depth.
    for (const p of pts) {
      const [x, y] = p.split(',').map(Number)
      expect(x > 305.001 && y > 305.001).toBe(false)
    }
    expect(errorsOf(validateGcode(g, {}))).toEqual([])
  })

  it('climb runs CCW and conventional CW around the L (like the rect)', () => {
    const order = (g: string) => cutPoints(g, '-18.5')
    const area = (pts: string[]) => {
      const v = pts.map(p => p.split(',').map(Number))
      let a = 0
      for (let i = 0; i < v.length; i++) { const [x1, y1] = v[i], [x2, y2] = v[(i + 1) % v.length]; a += x1 * y2 - x2 * y1 }
      return a
    }
    expect(area(order(gen({}, L)))).toBeGreaterThan(0)
    expect(area(order(gen({ milling_direction: 'conventional' }, L)))).toBeLessThan(0)
  })

  it('starts on the longest edge midpoint and ramps in from the waste side', () => {
    const lines = gen({}, L).split('\r\n')
    const firstCut = lines.findIndex(l => /^G1 X/.test(l) && atZ(l, '-18.5'))
    // Longest edges are the two 400-long outer ones (+2r); the one nearest the
    // front (lowest Y) wins: y = 95, midpoint x = 300.
    expect(lines[firstCut]).toMatch(/^G1 X300 Y95 Z/)
    // Approach is offset into the waste (y < 95), not into the part.
    const ap = lines.slice(0, firstCut).reverse().find(l => /^G0 X/.test(l))!
    expect(Number(/Y(-?[\d.]+)/.exec(ap)![1])).toBeLessThan(95)
  })

  it('a part with no outline keeps the rect', () => {
    const pts = new Set(cutPoints(gen({}), '-18.5'))
    expect(pts.has('505,505')).toBe(true)
  })
})
