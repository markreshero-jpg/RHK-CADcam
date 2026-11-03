// Cabinet height split (z_cabinet_split S1): the sides and back are cut into
// stacked pieces where they leave for the DB / CNC, every hole goes to the piece
// it lands in, and the suggestions sit 3 below each fixed shelf's top.
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { resolveCabinet } from '../resolver/resolver'
import { mergeRules } from '../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type JointTypeOp, type Material, type Section } from '../resolver/types'
import { buildPersistPayload } from '../resolver/persistResolved'
import { caseBox } from '../jointDrilling'
import { collectDrillRows } from '../optimiser/seamDrillSync'
import { splitCaseParts, splitSuggestions, splitPieceFor, splitBaseKey, normaliseSplit, cutBaseKeys, splitPieceSuffix, splitPieceNote, SPLIT_LIP } from '../cabinetSplit'

const board: Material = { id: 'm', name: 'Board', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const open = (): Section => ({ type: 'open', fittings: [] })
// 2400 tall, two fixed shelves (equal bays), an adjustable shelf in each bay.
const tree: Section = { type: 'hsplit', children: [
  { section: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: false }] }, separator: 'fixed_shelf' },
  { section: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: false }] }, separator: 'fixed_shelf' },
  { section: open() },
] } as unknown as Section

// Screws through the sides for the top / bottom / fixed shelves / back, pin holes for the adj shelves
// (the shop recipe shape, as the seam tests use).
const op = (id: string, ex: Record<string, string>): JointTypeOp => ({
  id, joint_type_id: id, operation_order: 0, target_part: 'part_b', machine_operation: 'drill', face: 'normal',
  tool_diameter_mm: 5, depth_mm: 12, offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: 50,
  qty: 2, spacing_mm: null, qty2: 1, spacing2_mm: null, router_tool_id: null, drill_id: null, auto_tool: false, notes: null,
  expressions: ex,
})
const joints = {
  joint_defaults: {
    'full_top:left_side': 'screw', 'full_top:right_side': 'screw', 'bottom:left_side': 'screw', 'bottom:right_side': 'screw',
    'back:left_side': 'screw', 'back:right_side': 'screw', 'fixed_shelf:side': 'screw', 'adj_shelf:side': 'pin',
  },
  joint_type_ops: {
    screw: [op('screw', { spacing_mm: 'D - 100', depth_mm: 'T', offset_y_mm: 'T / 2' })],
    pin:   [op('pin', { spacing_mm: 'D - 100', offset_y_mm: 'T / 2' })],
  },
  joint_type_names: { screw: 'Screw', pin: 'Pin' },
}

function tall(split?: number[]): CabinetInput {
  return {
    id: 'c1', assembly_class: 'tall', DX: 800, DY: 2400, DZ: 400,
    has_carcass: true, has_internal: true, has_face: false, has_toekick: false,
    left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
    material: board, door_material: board, shelf_material: board, exposed_material: board,
    toekick_face_material: board, toekick_interior_material: board,
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    face_grid: { rows: [], cols: [], zones: [] }, internal_tree: tree, ...joints,
    ...(split ? { split: { at: split } } : {}),
  }
}

describe('splitSuggestions', () => {
  it('one per fixed shelf, SPLIT_LIP below its top, lowest first', () => {
    const rp = resolveCabinet(tall())
    const fixed = rp.internal_parts.filter(p => p.part_type === 'fixed_shelf').sort((a, b) => a.Y - b.Y)
    const s = splitSuggestions(rp.internal_parts)
    expect(s.map(x => x.shelf)).toEqual([1, 2])
    s.forEach((x, i) => expect(x.at).toBeCloseTo(fixed[i].Y + fixed[i].DZ - SPLIT_LIP, 1))
  })
})

describe('splitCaseParts', () => {
  const rp = resolveCabinet(tall())
  const at = splitSuggestions(rp.internal_parts)[1].at

  it('cuts the sides (along DY) and the back (along DX) into stacked pieces', () => {
    const ps = splitCaseParts(rp.case_parts, [at])
    for (const k of ['left_side', 'right_side']) {
      const whole = rp.case_parts.find(p => p.part_key === k)!
      const lo = ps.find(p => p.part_key === k)!, hi = ps.find(p => p.part_key === `split:${k}:1`)!
      expect(lo).toMatchObject({ Y: whole.Y, DY: at - whole.Y })
      expect(hi).toMatchObject({ Y: at, DY: whole.Y + whole.DY - at, DX: whole.DX })
      // cut ends untaped, the outer ends as before
      expect(lo.edge_band.top).toBe(false); expect(hi.edge_band.bottom).toBe(false)
      expect(hi.edge_band.top).toBe(whole.edge_band.top); expect(lo.edge_band.bottom).toBe(whole.edge_band.bottom)
    }
    const back = rp.case_parts.find(p => p.part_key === 'back')!
    const bhi = ps.find(p => p.part_key === 'split:back:1')!, blo = ps.find(p => p.part_key === 'back')!
    // The back sits on the bottom (caseBox draws it at Y + DZ): the cut is at the same real
    // height as the sides', not a board higher (Mark 2026-10-25).
    const box = (q: typeof back) => caseBox({ ...q, part_key: 'back' })
    expect(box(blo).y).toBeCloseTo(box(back).y)
    expect(box(blo).y + box(blo).h).toBeCloseTo(at)
    expect(box(bhi).y).toBeCloseTo(at)
    expect(box(bhi).y + box(bhi).h).toBeCloseTo(box(back).y + box(back).h)
    expect(bhi.DY).toBe(back.DY)
    // top / bottom untouched
    expect(ps.filter(p => p.part_key === 'full_top' || p.part_key === 'bottom')).toEqual(rp.case_parts.filter(p => p.part_key === 'full_top' || p.part_key === 'bottom'))
  })

  it('a shaped cabinet’s per-edge back / side panels are cut too, at the same real height', () => {
    // A turned back on a clipped corner (TC-08 J04): face-kind, height along DX from Y.
    const angled = { ...rp.case_parts.find(p => p.part_key === 'back')!, part_key: 'back:back2' as const, Y: 16.5, DX: 2367, AY: -30 }
    const ps = splitCaseParts([angled], [at])
    expect(ps.map(p => p.part_key)).toEqual(['back:back2', 'split:back:back2:1'])
    expect(ps[0]).toMatchObject({ Y: 16.5, DX: at - 16.5 })
    expect(ps[1]).toMatchObject({ Y: at, DX: 16.5 + 2367 - at, AY: -30 })
    expect(splitBaseKey('split:back:back2:1')).toBe('back:back2')
    expect(splitPieceFor(ps, 'back:back2', at + 5)!.part_key).toBe('split:back:back2:1')
  })

  it('two cuts = three pieces; a cut past the part is ignored', () => {
    const [a, b] = splitSuggestions(rp.internal_parts).map(x => x.at)
    expect(splitCaseParts(rp.case_parts, [a, b]).filter(p => splitBaseKey(p.part_key) === 'left_side').map(p => p.part_key))
      .toEqual(['left_side', 'split:left_side:1', 'split:left_side:2'])
    expect(splitCaseParts(rp.case_parts, [5000])).toEqual(rp.case_parts)
  })

  it('splitPieceFor picks by height, clamping past the ends', () => {
    const ps = splitCaseParts(rp.case_parts, [at])
    expect(splitPieceFor(ps, 'left_side', at - 20)!.part_key).toBe('left_side')
    expect(splitPieceFor(ps, 'left_side', at + 20)!.part_key).toBe('split:left_side:1')
    expect(splitPieceFor(ps, 'left_side', 99999)!.part_key).toBe('split:left_side:1')
  })

  it('piece names: (split bottom / mid / top) on cut parts, nothing on uncut parts', () => {
    const keys = ['left_side', 'split:left_side:1', 'split:left_side:2', 'right_side', 'split:right_side:1', 'bottom']
    const cut = cutBaseKeys(keys)
    expect(keys.map(k => splitPieceSuffix(k, cut)))
      .toEqual([' (split bottom)', ' (split mid)', ' (split top)', ' (split bottom)', ' (split top)', ''])
    expect(keys.map(k => splitPieceNote(k, cut)))
      .toEqual(['SPLIT - BOTTOM', 'SPLIT - MID', 'SPLIT - TOP', 'SPLIT - BOTTOM', 'SPLIT - TOP', null])
  })

  it('normaliseSplit: positive, ascending, de-duplicated, at most 2', () => {
    expect(normaliseSplit({ at: [1500, -3, 800, 1500, 2000] })).toEqual({ at: [800, 1500] })
    expect(normaliseSplit({ at: [] })).toBeNull()
    expect(normaliseSplit(null)).toBeNull()
  })
})

describe('split cabinet through persist + drilling', () => {
  it('the persist payload carries the pieces', () => {
    const at = splitSuggestions(resolveCabinet(tall()).internal_parts)[1].at
    const keys = buildPersistPayload(resolveCabinet(tall([at]))).case_parts.map(p => p.part_key)
    expect(keys).toEqual(expect.arrayContaining(['left_side', 'split:left_side:1', 'right_side', 'split:right_side:1', 'back', 'split:back:1']))
  })

  it('every hole in a cut side lands on the piece that holds it, inside it', () => {
    const at = splitSuggestions(resolveCabinet(tall()).internal_parts)[1].at
    const rp = resolveCabinet(tall([at]))
    const { rows } = collectDrillRows(rp, 'c1')
    const pieces = splitCaseParts(rp.case_parts, rp.split_at)
    const sideRows = rows.filter(r => /^case_(split:)?(left_side|right_side)/.test(r.source_part_key))
    expect(sideRows.some(r => r.source_part_key === 'case_split:left_side:1')).toBe(true)
    expect(sideRows.some(r => r.source_part_key === 'case_left_side')).toBe(true)
    // In the piece's own frame every hole sits within its length (no hole past a cut).
    for (const r of sideRows) {
      const p = pieces.find(x => `case_${x.part_key}` === r.source_part_key)!
      const len = p.DY, wid = p.DX
      expect(Math.min(r.pos_x, r.pos_y)).toBeGreaterThanOrEqual(-0.5)
      expect(r.pos_x <= Math.max(len, wid) + 0.5 && r.pos_y <= Math.max(len, wid) + 0.5).toBe(true)
    }
    // Uncut: the same hole count, just spread over the pieces.
    const whole = collectDrillRows(resolveCabinet(tall()), 'c1').rows.filter(r => /^case_(left_side|right_side)$/.test(r.source_part_key))
    expect(sideRows.length).toBe(whole.length)
  })
})

describe('back width cut (split.back_x, RHK6542 WC-04)', () => {
  const rp = resolveCabinet({ ...tall(), split: { at: [], back_x: [400] } })
  const back = rp.case_parts.find(p => p.part_key === 'back')!

  it('normaliseSplit keeps back_x on its own', () => {
    expect(normaliseSplit({ at: [], back_x: [400] })).toEqual({ at: [], back_x: [400] })
    expect(normaliseSplit({ at: [800] })).toEqual({ at: [800] })
  })

  it('cuts only the back, side by side, untaped at the cut', () => {
    expect(rp.split_back_x).toEqual([400])
    const ps = splitCaseParts(rp.case_parts, rp.split_at, rp.split_back_x)
    const [l, r] = [ps.find(p => p.part_key === 'back')!, ps.find(p => p.part_key === 'split:back:1')!]
    expect(l.X).toBe(back.X); expect(l.DY).toBeCloseTo(400 - back.X, 6)
    expect(r.X).toBe(400); expect(l.DY + r.DY).toBeCloseTo(back.DY, 6)
    expect(l.DX).toBe(back.DX); expect(r.DX).toBe(back.DX)
    expect(l.edge_band.right).toBe(false); expect(r.edge_band.left).toBe(false)
    expect(ps.some(p => p.part_key === 'split:left_side:1')).toBe(false)
    expect(splitPieceFor(ps, 'back', 1000, 600)!.part_key).toBe('split:back:1')
    expect(splitPieceFor(ps, 'back', 1000, 100)!.part_key).toBe('back')
  })

  it('names the pieces left / right with a join note', () => {
    const cut = cutBaseKeys(['back', 'split:back:1'])
    expect(splitPieceSuffix('back', cut, [400])).toBe(' (split left)')
    expect(splitPieceSuffix('split:back:1', cut, [400])).toBe(' (split right)')
    expect(splitPieceNote('split:back:1', cut, [400])).toBe('SPLIT - RIGHT · JOIN TOGETHER')
  })

  it('the persist payload carries both pieces', () => {
    const keys = buildPersistPayload(rp).case_parts.map(p => p.part_key)
    expect(keys).toEqual(expect.arrayContaining(['back', 'split:back:1', 'left_side']))
  })
})

describe('back width cut drilling', () => {
  it('back holes go to the piece under them, none within BACK_CUT_CLEAR of the cut', async () => {
    const { BACK_CUT_CLEAR } = await import('../optimiser/seamDrillSync')
    const base = tall()
    const c = { ...base, joint_defaults: { ...base.joint_defaults, 'fixed_shelf:back': 'screw' } }
    const whole = collectDrillRows(resolveCabinet(c), 'c1').rows.filter(r => r.source_part_key === 'case_back')
    expect(whole.length).toBeGreaterThan(0)
    const back = resolveCabinet(c).case_parts.find(p => p.part_key === 'back')!
    const cut = back.X + back.DY / 2
    const rows = collectDrillRows(resolveCabinet({ ...c, split: { at: [], back_x: [cut] } }), 'c1').rows
      .filter(r => /^case_(split:)?back/.test(r.source_part_key))
    expect(rows.some(r => r.source_part_key === 'case_back')).toBe(true)
    expect(rows.some(r => r.source_part_key === 'case_split:back:1')).toBe(true)
    // Back frame: pos_y runs along the width (the cut is the left piece's pos_y = DY / 2, the right's 0).
    const half = back.DY / 2
    for (const r of rows) {
      const fromCut = r.source_part_key === 'case_back' ? half - r.pos_y : r.pos_y
      expect(fromCut).toBeGreaterThanOrEqual(BACK_CUT_CLEAR - 0.01)
      expect(r.pos_y).toBeLessThanOrEqual(half + 0.5)
    }
    // Same holes as uncut, less any at the cut.
    expect(rows.length).toBeLessThanOrEqual(whole.length)
  })
})
