import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { attachShape, cutBlank, placedOutline, loopArea, type ShapeRow } from '../shapes'
import { normalizeProject } from '../normalize'
import { cutSize } from '../types'
import { resolveCabinet } from '../../resolver/resolver'
import { mergeRules } from '../../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ResolvedCabinet } from '../../resolver/types'
import { buildPresetFootprint } from '../../cabinetShape/presets'
import { type OutlinePt, type ShapePt } from '../../shapePath'

// Phase plan O5 (locked decision #3): on a deducting profile, a shaped part's
// BANDED edges come in by the tape; the blank is that outline's bounding box
// and ops shift with it.

const plain = { frame: { swap: false, mirror: false }, DX: 100, DY: 40 }
const segDist = (p: ShapePt, a: ShapePt, b: ShapePt) => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}
const toBoundary = (p: ShapePt, poly: ShapePt[]) => Math.min(...poly.map((a, i) => segDist(p, a, poly[(i + 1) % poly.length])))
const rectPart = (o: Partial<{ eb_w1: number; eb_w2: number; eb_h1: number; eb_h2: number }> = {}) =>
  ({ w: 100, h: 40, eb_w1: 0, eb_w2: 0, eb_h1: 0, eb_h2: 0, ...o })

// A drawn 100 × 40 part with a notch out of its top-right corner (shape frame,
// y down): top + notch wall + right edge banded, the rest not.
const notchRow = (bands: boolean[] | null): ShapeRow => {
  const pts = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 40 }, { x: 0, y: 40 }]
  return {
    cabinet_id: 'c', part_key: 'p', revision: 1, meta: null,
    segments: pts.map((p, i) => ({ type: 'line', p0: p, p1: pts[(i + 1) % pts.length], ...(bands ? { edge: { band: bands[i], profile: 'square' } } : {}) })),
  }
}
const flags = { top: true, bottom: true, left: true, right: true }

describe('cutBlank', () => {
  it('a plain rectangle is cutSize, shifted by the tape on its origin edges', () => {
    const p = rectPart({ eb_w1: 1, eb_w2: 2, eb_h1: 0.5, eb_h2: 0 })
    expect(cutBlank(p, true)).toEqual({ ...cutSize(p), sx: 1, sy: 0.5, sx2: 2, outline: null })
    expect(cutBlank(p, false)).toEqual({ w: 100, h: 40, sx: 0, sy: 0, sx2: 0, outline: null })
  })

  it('a drawn shape: only its banded segments come in, by exactly the tape', () => {
    const { shape } = attachShape(notchRow([true, true, false, true, false, false]), 100, 40, plain, null, { t: 1, flags })
    const part = { ...rectPart({ eb_w1: 1, eb_w2: 1, eb_h1: 1, eb_h2: 1 }), shape }
    const b = cutBlank(part, true)
    // Op frame (y up): the banded top (y 40) and right (x 100) come in; the
    // unbanded bottom / left stay, so nothing shifts at the origin.
    expect([b.w, b.h, b.sx, b.sy, b.sx2]).toEqual([99, 39, 0, 0, 1])
    const o = b.outline!
    // Notch wall (x 80, banded) moves to 79; its floor (y 30, unbanded) stays.
    expect(o.some(p => Math.abs(p.x - 79) < 1e-6 && Math.abs(p.y - 39) < 1e-6)).toBe(true)
    expect(o.some(p => Math.abs(p.x - 79) < 1e-6 && Math.abs(p.y - 30) < 1e-6)).toBe(true)
    expect(o.some(p => Math.abs(p.x - 99) < 1e-6 && Math.abs(p.y - 30) < 1e-6)).toBe(true)
    // The sheet outline is the blank's contour.
    expect(placedOutline(part, { w: 99, rotated: false }, true)).toEqual(o)
  })

  it('a drawn shape with untagged segments falls back to the rectangle sides', () => {
    const { shape } = attachShape(notchRow(null), 100, 40, plain, null, { t: 1, flags })
    expect(shape!.op_tape).toBeUndefined()
    const b = cutBlank({ ...rectPart({ eb_w1: 1, eb_w2: 1, eb_h1: 1, eb_h2: 1 }), shape }, true)
    expect([b.w, b.h, b.sx, b.sy]).toEqual([98, 38, 1, 1])
  })

  it('a banded arc offsets concentrically; its unbanded neighbours stay put', () => {
    // 100 × 100, top-right corner rounded r 40 (centre (60, 40) shape frame);
    // only the arc is banded ('top').
    const outline: OutlinePt[] = [
      { x: 0, y: 0, e: 'bottom' }, { x: 60, y: 0, b: Math.tan(Math.PI / 8), e: 'top' },
      { x: 100, y: 40, e: 'right' }, { x: 100, y: 100, e: 'bottom' }, { x: 0, y: 100, e: 'left' },
    ]
    const { shape } = attachShape(undefined, 100, 100, { ...plain, DY: 100 }, outline, { t: 1, flags: { top: true, bottom: false, left: false, right: false } })
    const part = { w: 100, h: 100, eb_w1: 0, eb_w2: 0, eb_h1: 0, eb_h2: 0, shape }
    const b = cutBlank(part, true)
    expect(b.failed).toBeUndefined()
    expect([b.w, b.h, b.sx, b.sy]).toEqual([100, 100, 0, 0])
    // Op frame centre (60, 60). Every point strictly inside the arc's sweep is
    // at r − t; none is left on the old radius.
    const inSweep = b.outline!.filter(p => p.x > 60.5 && p.y > 60.5)
    expect(inSweep.length).toBeGreaterThan(10)
    for (const p of inSweep) expect(Math.hypot(p.x - 60, p.y - 60)).toBeCloseTo(39, 1)
    // The straights either side still reach the blank edges.
    expect(Math.max(...b.outline!.map(p => p.x))).toBeCloseTo(100, 6)
    expect(Math.max(...b.outline!.map(p => p.y))).toBeCloseTo(100, 6)
  })

  it('an offset that collapses a sliver fails: finished size, flagged', () => {
    // A 1.5 mm tongue with both walls banded 1 mm.
    const pts = [{ x: 0, y: 20 }, { x: 50, y: 20 }, { x: 50, y: 0 }, { x: 51.5, y: 0 }, { x: 51.5, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 40 }, { x: 0, y: 40 }]
    const row: ShapeRow = { cabinet_id: 'c', part_key: 'p', revision: 1, meta: null,
      segments: pts.map((p, i) => ({ type: 'line', p0: p, p1: pts[(i + 1) % pts.length], edge: { band: true } })) }
    const { shape } = attachShape(row, 100, 40, plain, null, { t: 1, flags })
    const b = cutBlank({ ...rectPart(), shape }, true)
    expect(b.failed).toBe(true)
    expect([b.w, b.h, b.sx, b.sy]).toEqual([100, 40, 0, 0])
  })

  it('banded edges with no tape thickness on record are reported', () => {
    expect(attachShape(notchRow([true, false, false, false, false, false]), 100, 40, plain, null, { t: undefined, flags }).tapeMissing).toBe(true)
    expect(attachShape(notchRow([false, false, false, false, false, false]), 100, 40, plain, null, { t: undefined, flags }).tapeMissing).toBeUndefined()
  })
})

// End to end: a resolved BCNP's L bottom, through the snapshot, both hands.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const lCorner = (side: 'right' | 'left'): CabinetInput => ({
  id: 'c1', assembly_class: 'base_corner', DX: 900, DY: 870, DZ: 900,
  has_carcass: true, has_internal: false, has_face: true, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES), top_type: 'front_rail',
  face_grid: { rows: [{ row_index: 0, height_locked: false }], cols: [{ col_index: 0, width_locked: false }],
    zones: [{ row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'left' }] },
  internal_tree: { type: 'open', fittings: [] },
  footprint: buildPresetFootprint('l_corner', { leg_back: 560, leg_side: 560, side }, { w: 900, d: 900 }),
})
const snapshot = (rp: ResolvedCabinet) => normalizeProject({ id: 'p', name: 'p', job_number: null }, [{ id: 'room', name: 'R' }],
  [{ id: 'c1', label: 'BCNP', assembly_class: 'base_corner', room_id: 'room' }],
  rp.case_parts.map((p, i) => ({
    id: `r${i}`, cabinet_instance_id: 'c1', part_key: p.part_key, dx: p.DX, dy: p.DY, dz: p.DZ,
    bevel_lo: p.bevel_lo ?? 0, bevel_hi: p.bevel_hi ?? 0, outline: p.outline ?? null, material_id: 'm18',
    edge_band_top: p.edge_band.top, edge_band_bottom: p.edge_band.bottom, edge_band_left: p.edge_band.left, edge_band_right: p.edge_band.right,
    edge_band_id: 'tape1',
  })), [], [], [], [], new Map(), [], new Map([['tape1', 1]])).parts

describe('BCNP L bottom on a deducting profile', () => {
  for (const side of ['right', 'left'] as const) {
    it(`${side} hand: fronts + ends come in 1 mm, the back and the side leg's wall edge stay`, () => {
      const rp = resolveCabinet(lCorner(side))
      const bottom = snapshot(rp).find(p => p.source_part_key === 'case_bottom')!
      const shape = bottom.shape!
      const tape = shape.op_tape!
      expect(tape.every(t => t === 0 || t === 1)).toBe(true)
      // Default bottom banding (front + both ends): 4 of the L's 6 edges.
      expect(tape.filter(t => t === 1)).toHaveLength(4)
      const b = cutBlank(bottom, true)
      expect(b.failed).toBeUndefined()
      // Each edge's midpoint, moved in by its tape, is on the blank's contour.
      const poly = shape.op_polygon
      const ccw = loopArea(poly) > 0
      const contour = b.outline!.map(p => ({ x: p.x + b.sx, y: p.y + b.sy }))
      poly.forEach((a, i) => {
        const q = poly[(i + 1) % poly.length], L = Math.hypot(q.x - a.x, q.y - a.y)
        const n = ccw ? { x: -(q.y - a.y) / L, y: (q.x - a.x) / L } : { x: (q.y - a.y) / L, y: -(q.x - a.x) / L }
        const m = { x: (a.x + q.x) / 2 + n.x * tape[i]!, y: (a.y + q.y) / 2 + n.y * tape[i]! }
        expect(toBoundary(m, contour)).toBeLessThan(1e-6)
      })
      // 882 × 882 finished. The back (op x 0) and the side leg's wall edge stay
      // (the old rectangle-side rule banded that wall edge as the 'left' end);
      // the front-most edge is the end2 panel's, banded as an end. Op y = 0 is
      // the wall edge in the right hand, the end panel in the left.
      expect([bottom.w, bottom.h]).toEqual([882, 882])
      expect([b.w, b.h]).toEqual([881, 881])
      expect(b.sx).toBeCloseTo(0, 6)
      expect(b.sy).toBeCloseTo(side === 'left' ? 1 : 0, 6)
      expect(b.sx2).toBeCloseTo(1, 6)
    })
  }
})
