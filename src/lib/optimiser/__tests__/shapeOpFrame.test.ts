import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { shapeFrameFor, shapeToOpFrame, attachShape, placedOutline, toolPathLoop, type ShapeRow } from '../shapes'
import { toSheet } from '../drills'
import { normalizeProject } from '../normalize'
import { collectDrillRows, collectNotchRoutes } from '../seamDrillSync'
import { resolveCabinet } from '../../resolver/resolver'
import { mergeRules } from '../../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type HandleProductInput, type ResolvedCabinet } from '../../resolver/types'
import { buildPresetFootprint } from '../../cabinetShape/presets'
import { pointInShape } from '../../shapePath'
import type { OptiPart } from '../types'

// Phase plan O2b: shape frame (Part Editor display, y-down) → op frame
// (origin bottom-left, y up, x along w = DX, y along h = DY).

describe('shapeFrameFor — per part kind', () => {
  const cases: [string, string, string, boolean, boolean][] = [
    // table, typeKey, partId, swap, mirror
    ['case_parts', 'left_side', 'case_left_side', false, true],    // op frame front→back (opFrameMirrored)
    ['case_parts', 'right_side', 'case_right_side', false, true],
    ['case_parts', 'bottom', 'case_bottom', true, false],
    ['case_parts', 'full_top', 'case_full_top', true, false],
    ['case_parts', 'rail:front', 'case_rail:front', true, false],
    ['case_parts', 'back', 'case_back', true, false],
    ['case_parts', 'side:end2', 'case_side:end2', true, false],
    ['case_parts', 'back:back2', 'case_back:back2', true, false],
    ['internal_parts', 'adj_shelf', 'int_adj_shelf_0', true, false],
    ['internal_parts', 'divider', 'int_divider_0', false, false],
    ['toekick_parts', 'kick_face', 'tk_kick_face_0', true, false],
    ['toekick_parts', 'spreader_vertical', 'tk_spreader_vertical_0', false, false],
    ['face_zones', 'door', 'zone_0_0', false, false],
    ['drawer_box_parts', 'db_right_side', 'db_0_0_db_right_side', false, true],
    ['drawer_box_parts', 'db_bottom', 'db_0_0_db_bottom', true, false],
    ['drawer_box_parts', 'db_front', 'db_0_0_db_front', true, false],
    ['custom_parts', 'flat', 'custom_x', true, false],
    ['custom_parts', 'side', 'custom_x', false, false],
    ['custom_parts', 'front', 'custom_x', false, false],
  ]
  for (const [t, k, id, swap, mirror] of cases) {
    it(`${t} ${k}`, () => expect(shapeFrameFor(t, k, id)).toEqual({ swap, mirror }))
  }
})

describe('shapeToOpFrame', () => {
  // A 100 × 40 part with a marker point near the shape's top-left corner.
  it('no swap: y flips, x stays (mirror flips x)', () => {
    expect(shapeToOpFrame([{ x: 10, y: 5 }], { swap: false, mirror: false }, 100, 40)).toEqual([{ x: 10, y: 35 }])
    expect(shapeToOpFrame([{ x: 10, y: 5 }], { swap: false, mirror: true }, 100, 40)).toEqual([{ x: 90, y: 35 }])
  })
  it('swap: pos_x = DX − sy, pos_y = sx', () => {
    expect(shapeToOpFrame([{ x: 10, y: 5 }], { swap: true, mirror: false }, 100, 40)).toEqual([{ x: 95, y: 10 }])
  })
})

describe('attachShape', () => {
  const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 0, y: 40 }]
  const frame = { swap: false, mirror: true }
  it('a drawn shape wins over the resolver outline and keeps its mirror', () => {
    const row: ShapeRow = { cabinet_id: 'c', part_key: 'p', revision: 2, meta: null,
      segments: [{ type: 'line', p0: { x: 0, y: 0 }, p1: { x: 100, y: 0 } }, { type: 'line', p0: { x: 100, y: 0 }, p1: { x: 100, y: 40 } },
        { type: 'line', p0: { x: 100, y: 40 }, p1: { x: 0, y: 40 } }, { type: 'line', p0: { x: 0, y: 40 }, p1: { x: 0, y: 0 } }] }
    const { shape } = attachShape(row, 100, 40, { frame, DX: 100, DY: 40 }, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }])
    expect(shape?.source).toBe('drawn')
    expect(shape?.op_polygon[0]).toEqual({ x: 100, y: 40 })   // mirrored
  })
  it('a resolver outline is never mirrored and never stale', () => {
    const { shape, stale } = attachShape(undefined, 100, 40, { frame, DX: 100, DY: 40 }, sq)
    expect(shape?.source).toBe('resolver')
    expect(stale).toBe(false)
    expect(shape?.op_polygon[0]).toEqual({ x: 0, y: 40 })
  })
  it('a resolver outline that no longer fits the part (hand resize) is dropped', () => {
    expect(attachShape(undefined, 120, 40, { frame, DX: 120, DY: 40 }, sq).shape).toBeUndefined()
  })
  it('a part nested turned gets the outline transposed', () => {
    const { shape } = attachShape(undefined, 40, 100, { frame, DX: 100, DY: 40, transpose: true }, sq)
    expect(shape?.op_polygon[0]).toEqual({ x: 40, y: 0 })
  })
})

describe('placedOutline (O3) uses the drill-hole transform', () => {
  const notched = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 40 }, { x: 0, y: 40 }]
  const part = (eb = 0) => ({ w: 100, h: 40, eb_w1: eb, eb_w2: eb, eb_h1: eb, eb_h2: eb,
    ...attachShape(undefined, 100, 40, { frame: { swap: false, mirror: false }, DX: 100, DY: 40 }, notched) })
  for (const rotated of [false, true]) {
    it(`matches toSheet for every point${rotated ? ' (rotated 90°)' : ''}`, () => {
      const pl = { x: 500, y: 300, w: rotated ? 40 : 100, h: rotated ? 100 : 40, rotated }
      const p = part()
      const local = placedOutline(p, pl, false)!
      p.shape!.op_polygon.forEach((q, i) => {
        const s = toSheet(q.x, q.y, pl)
        expect({ x: pl.x + local[i].x, y: pl.y + local[i].y }).toEqual(s)
      })
    })
  }
  it('a resolver shape on a deducted blank: rectangle-side edges come in by their tape, inner edges stay', () => {
    const pl = { w: 98, rotated: false }
    const o = placedOutline(part(1), pl, true)!
    // Fits the 98 × 38 cut blank exactly.
    expect(Math.min(...o.map(p => p.x))).toBeCloseTo(0); expect(Math.max(...o.map(p => p.x))).toBeCloseTo(98)
    expect(Math.min(...o.map(p => p.y))).toBeCloseTo(0); expect(Math.max(...o.map(p => p.y))).toBeCloseTo(38)
    // The notch's inner walls (op x = 80, y = 30) don't move — only the blank shift (−1).
    expect(o.some(p => Math.abs(p.x - 79) < 1e-6)).toBe(true)
    expect(o.some(p => Math.abs(p.y - 29) < 1e-6)).toBe(true)
  })
  it('a drawn shape on a deducted profile is deducted too (O5; untagged → rectangle sides)', () => {
    const drawn = { ...part(1), shape: { ...part().shape!, source: 'drawn' as const } }
    const o = placedOutline(drawn, { w: 98, rotated: false }, true)!
    expect(Math.max(...o.map(p => p.x))).toBeCloseTo(98); expect(Math.max(...o.map(p => p.y))).toBeCloseTo(38)
  })
})

// End to end on real resolver output: resolver part → snapshot row →
// normalizeProject → op polygon. Checked against the CNC ops, which are the
// op frame by definition: every drill must land on material (inside the
// outline), and every finger-rail notch pocket must land in the cut-away.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const shark: HandleProductInput = {
  id: 'sn', name: 'Sharknose', grip_kind: 'sharknose', handle_type: 'other', length: null, bore_centres: null, projection: null,
  cost_per_unit: null, hole_dia_mm: null, holes: [], needs_finger_gap: true, bevel_angle_deg: 45, bevel_land_mm: 2,
}
const grip = { handle: shark, offset_from_edge_mm: 50, inset_from_side_mm: null, orientation: 'vertical' as const }
const lCorner = (side: 'right' | 'left', finger: boolean): CabinetInput => ({
  id: 'c1', assembly_class: 'base_corner', DX: 900, DY: 870, DZ: 900,
  has_carcass: true, has_internal: false, has_face: true, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES), top_type: 'front_rail',
  face_grid: { rows: [{ row_index: 0, height_locked: false }], cols: [{ col_index: 0, width_locked: false }],
    zones: [{ row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'right' }] },
  internal_tree: { type: 'open', fittings: [] },
  ...(finger ? { handle_schedule: { door_base: grip, door_wall: grip, door_tall: grip, drawer: grip } } : {}),
  footprint: buildPresetFootprint('l_corner', { leg_back: 560, leg_side: 560, side }, { w: 900, d: 900 }),
})

function snapshot(rp: ResolvedCabinet): OptiPart[] {
  const cp = rp.case_parts.map((p, i) => ({
    id: `r${i}`, cabinet_instance_id: 'c1', part_key: p.part_key, dx: p.DX, dy: p.DY, dz: p.DZ,
    bevel_lo: p.bevel_lo ?? 0, bevel_hi: p.bevel_hi ?? 0, outline: p.outline ?? null, material_id: 'm18',
  }))
  return normalizeProject({ id: 'p', name: 'p', job_number: null }, [{ id: 'room', name: 'R' }],
    [{ id: 'c1', label: 'BCNP', assembly_class: 'base_corner', room_id: 'room' }], cp, [], [], []).parts
}

// O4 gouge guard: sample the tool-centre path of a real notched gable and
// check the cutter never enters the part, for bits smaller / equal / bigger
// than the notch reliefs (RAILCUT 5 → reliefs sized for a 10 mm bit).
describe('contour tool path never gouges (O4)', () => {
  const segDist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
  }
  const distTo = (p: { x: number; y: number }, poly: { x: number; y: number }[]) =>
    Math.min(...poly.map((a, i) => segDist(p, a, poly[(i + 1) % poly.length])))
  for (const dia of [6, 10, 12, 16]) {
    it(`${dia} mm bit on a finger-pull gable`, () => {
      const parts = snapshot(resolveCabinet(lCorner('right', true)))
      const gable = parts.find(p => p.source_part_key === 'case_right_side')!
      const poly = gable.shape!.op_polygon
      const { pts, dropped } = toolPathLoop(poly, dia / 2)
      // Reliefs fit a ≤ 10 mm bit exactly; a bigger bit has to skip them.
      expect(dropped > 0).toBe(dia > 10)
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length]
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5))
        for (let k = 0; k <= n; k++) {
          const q = { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }
          expect(pointInShape(q, poly)).toBe(false)
          expect(distTo(q, poly)).toBeGreaterThan(dia / 2 - 0.01)
        }
      }
    })
  }
})

describe('L corner (BCNP) outlines in the op frame', () => {
  for (const side of ['right', 'left'] as const) {
    it(`${side} hand: the bottom is an L matching the cabinet's plan footprint`, () => {
      const cab = lCorner(side, false)
      const rp = resolveCabinet(cab)
      const bottom = snapshot(rp).find(p => p.source_part_key === 'case_bottom')!
      const rb = rp.case_parts.find(p => p.part_key === 'bottom')!
      expect(bottom.shape?.source).toBe('resolver')
      expect(bottom.shape!.op_polygon.length).toBeGreaterThanOrEqual(6)
      // Horizontal op frame: pos_x = depth from the bottom's back (plan y − Z),
      // pos_y = across from its left (plan x − X). Sample a grid of op points
      // and compare with the plan footprint (x across, y = depth from back).
      const plan = cab.footprint!.segments.map(s => s.p0)
      let checked = 0
      for (let px = 30; px < bottom.w; px += 60) for (let py = 30; py < bottom.h; py += 60) {
        const onPart = pointInShape({ x: px, y: py }, bottom.shape!.op_polygon)
        const inPlan = pointInShape({ x: rb.X + py, y: rb.Z + px }, plan)
        // Inside the footprint by more than a panel thickness ⇒ bottom material.
        const deepIn = inPlan && [-25, 25].every(d => pointInShape({ x: rb.X + py + d, y: rb.Z + px }, plan) && pointInShape({ x: rb.X + py, y: rb.Z + px + d }, plan))
        if (!inPlan) expect(onPart).toBe(false)
        if (deepIn) { expect(onPart).toBe(true); checked++ }
      }
      expect(checked).toBeGreaterThan(50)
    })

    it(`${side} hand: finger-pull notches on both end panels land in the cut-away`, () => {
      const rp = resolveCabinet(lCorner(side, true))
      const parts = snapshot(rp)
      const routes = collectNotchRoutes(rp, 'c1', 'tool10').rows.filter(r => r.parameters.kind === 'fprail_notch' && r.operation_key.startsWith('fprail_notch'))
      expect(routes.length).toBe(2)
      for (const r of routes) {
        const part = parts.find(p => p.source_part_key === r.source_part_key)!
        expect(part.shape?.source).toBe('resolver')
        // Checked against the contour actually cut (a right gable's is mirrored).
        const cut = placedOutline(part, { w: part.w, rotated: false }, false)!
        // The pocket's middle, pulled inside the part's bbox: a notch, not material.
        const x = Math.min(Math.max(r.pos_x, 1), part.w - 1), y = Math.min(Math.max(r.pos_y, 1), part.h - 1)
        expect(pointInShape({ x, y }, cut)).toBe(false)
        // Its drill holes are all on material.
        for (const h of collectDrillRows(rp, 'c1').rows.filter(d => d.source_part_key === r.source_part_key))
          expect(pointInShape({ x: h.pos_x, y: h.pos_y }, cut, 1)).toBe(true)
      }
    })
  }
})

// RHK6570 (2026-10-29): a right gable machines inner face up, so its holes are
// mirrored front-to-back — the notched contour and the notch pockets must be
// too, or the knock-in block holes land at the back and the back holes at the front.
describe('finger-pull gables: contour, notches and holes agree on both hands', () => {
  const cab: CabinetInput = {
    ...lCorner('right', true), assembly_class: 'base', DX: 600, DY: 870, DZ: 560, footprint: undefined,
    face_grid: { rows: [{ row_index: 0, height_locked: false }, { row_index: 1, height_locked: false }], cols: [{ col_index: 0, width_locked: false }],
      zones: [{ row_index: 0, col_index: 0, face_type: 'drawer_face' }, { row_index: 1, col_index: 0, face_type: 'drawer_face' }] },
  }
  const rp = resolveCabinet(cab)
  const parts = snapshot(rp)
  const drills = collectDrillRows(rp, 'c1').rows
  const notches = collectNotchRoutes(rp, 'c1', 'tool10').rows.filter(r => r.operation_type === 'route')
  for (const key of ['case_left_side', 'case_right_side']) {
    it(key, () => {
      const part = parts.find(p => p.source_part_key === key)!
      const cut = placedOutline(part, { w: part.w, rotated: false }, false)!
      const mine = notches.filter(r => r.source_part_key === key)
      expect(mine.length).toBeGreaterThan(0)
      for (const r of mine) expect(pointInShape({ x: Math.min(Math.max(r.pos_x, 1), part.w - 1), y: r.pos_y }, cut)).toBe(false)
      const blocks = drills.filter(d => d.source_part_key === key && d.parameters.kind === 'fprail_block')
      expect(blocks.length).toBe(mine.length)
      for (const b of blocks) {
        expect(pointInShape({ x: b.pos_x, y: b.pos_y }, cut, 1)).toBe(true)
        // Just behind its notch, at the same (front) edge.
        expect(Math.min(...mine.map(r => Math.abs(r.pos_x - b.pos_x)))).toBeLessThan(40)
      }
      for (const d of drills.filter(d => d.source_part_key === key)) expect(pointInShape({ x: d.pos_x, y: d.pos_y }, cut, 1)).toBe(true)
    })
  }
})
