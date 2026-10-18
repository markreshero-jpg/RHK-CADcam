// Benchtop cutouts (z_fixtures gap 1): a part's holes are cut as inside
// profiles before its perimeter, the tool kept inside the hole.
import { describe, it, expect } from 'vitest'
import { generateSheetGcode, DEFAULT_POST, type PostProfile } from '../gcode'
import { validateGcode, errorsOf } from '../gcodeValidate'
import { placedHoles, loopArea } from '../shapes'
import type { NestedSheet } from '../nest'

const sheet: NestedSheet = {
  index: 0, materialId: 'm', thickness: 18,
  stock: { w: 2400, h: 1200, trimTop: 0, trimBottom: 0, trimLeft: 0, trimRight: 0, isOffcut: false, label: null },
  placements: [{ uid: 'p1#0', baseUid: 'benchtop_parts:p1', label: 'Worktop', x: 100, y: 100, w: 1000, h: 600, rotated: false }],
  efficiency: 0.1,
}
const hole = [{ x: 300, y: 200 }, { x: 700, y: 200 }, { x: 700, y: 500 }, { x: 300, y: 500 }]
const gen = (over: Partial<PostProfile>, holes: { x: number; y: number }[][] = [hole]) => generateSheetGcode({
  sheet, thickness: 18, profile: { ...DEFAULT_POST, onion_skin_z: 0, ...over }, drills: [],
  toolNumber: 1, toolDiameter: 10, maxDepthPerPass: 30, holes: { 'p1#0': holes },
})
// Moves between the cutout comment and the part's perimeter.
function holeMoves(g: string): { x: number; y: number }[] {
  const ls = g.split('\r\n')
  const a = ls.findIndex(l => l.includes('Cutout 1')), b = ls.findIndex((l, i) => i > a && l.includes('Part Worktop'))
  return ls.slice(a, b).map(l => /^G[0123] X(-?[\d.]+) Y(-?[\d.]+)/.exec(l)).filter(Boolean).map(m => ({ x: Number(m![1]), y: Number(m![2]) }))
}

describe('cutout holes in the G-code', () => {
  const posts: [string, Partial<PostProfile>][] = [
    ['default', {}],
    ['ramp entry', { entry_strategy: 'ramp' }],
    ['plunge + arc lead-in', { entry_strategy: 'straight_plunge', lead_in_type: 'arc_tangent', lead_out_type: 'arc_tangent' }],
    ['conventional', { milling_direction: 'conventional' }],
  ]
  for (const [name, over] of posts) {
    it(`the tool stays inside the hole, one radius in — ${name}`, () => {
      const g = gen(over)
      const ms = holeMoves(g)
      expect(ms.length).toBeGreaterThan(3)
      for (const m of ms) {
        expect(m.x).toBeGreaterThanOrEqual(305 - 1e-6); expect(m.x).toBeLessThanOrEqual(695 + 1e-6)
        expect(m.y).toBeGreaterThanOrEqual(205 - 1e-6); expect(m.y).toBeLessThanOrEqual(495 + 1e-6)
      }
      expect(g.indexOf('Cutout 1')).toBeLessThan(g.indexOf('Part Worktop'))
      expect(errorsOf(validateGcode(g, {}))).toEqual([])
    })
  }
  it('climb runs a hole clockwise, conventional anticlockwise', () => {
    const corners = (g: string) => {
      const ms = holeMoves(g).filter(m => [305, 695].includes(m.x) && [205, 495].includes(m.y))
      return ms.filter((m, i) => i === 0 || m.x !== ms[i - 1].x || m.y !== ms[i - 1].y).slice(0, 4)
    }
    expect(loopArea(corners(gen({})))).toBeLessThan(0)
    expect(loopArea(corners(gen({ milling_direction: 'conventional' })))).toBeGreaterThan(0)
  })
  it('a hole smaller than the bit is skipped with a warning', () => {
    const g = gen({}, [[{ x: 300, y: 200 }, { x: 308, y: 200 }, { x: 308, y: 208 }, { x: 300, y: 208 }]])
    expect(g).toContain('too small for the 10')
    expect(holeMoves(g).length).toBe(0)
  })
  it('placedHoles: shifted onto the deducted blank and turned with the placement', () => {
    const part = { w: 600, h: 1000, eb_w1: 1, eb_w2: 0, eb_h1: 2, eb_h2: 0, cut_holes: [[{ x: 100, y: 200 }]] }
    expect(placedHoles(part, { w: 1000, rotated: false }, false)[0][0]).toEqual({ x: 100, y: 200 })
    expect(placedHoles(part, { w: 1000, rotated: false }, true)[0][0]).toEqual({ x: 99, y: 198 })
    expect(placedHoles(part, { w: 1000, rotated: true }, false)[0][0]).toEqual({ x: 800, y: 100 })
  })
})
