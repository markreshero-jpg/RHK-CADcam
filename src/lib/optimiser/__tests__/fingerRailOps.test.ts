import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { collectDrillRows, collectNotchRoutes } from '../seamDrillSync'
import { railBlockEnds } from '../../resolver/railBlocks'
import { fingerRailStrip } from '../normalize'
import { resolveCabinet } from '../../resolver/resolver'
import { mergeRules } from '../../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type HandleProductInput } from '../../resolver/types'

// z_handles H6b: finger-rail notches (generated through pockets) + knock-in
// block holes on both sides.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const shark: HandleProductInput = {
  id: 'sn', name: 'Sharknose 38°', grip_kind: 'sharknose', handle_type: 'other', length: null, bore_centres: null,
  projection: null, cost_per_unit: null, hole_dia_mm: null, holes: [], needs_finger_gap: true, bevel_angle_deg: 38, bevel_land_mm: 0,
}
const cab: CabinetInput = {
  id: 'c1', assembly_class: 'base', DX: 600, DY: 870, DZ: 560,
  has_carcass: true, has_internal: false, has_face: true, has_toekick: true,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
  face_grid: {
    rows: [{ row_index: 0, height_locked: false }, { row_index: 1, height_locked: false }],
    cols: [{ col_index: 0, width_locked: false }],
    zones: [{ row_index: 0, col_index: 0, face_type: 'drawer_face' }, { row_index: 1, col_index: 0, face_type: 'drawer_face' }],
  },
  internal_tree: { type: 'open', fittings: [] },
  handle_schedule: { drawer: { handle: shark, offset_from_edge_mm: 50, inset_from_side_mm: null, orientation: 'horizontal' } },
}

describe('finger-rail machining (H6b)', () => {
  const rp = resolveCabinet(cab)
  const rails = rp.case_parts.filter(p => p.part_key.startsWith('fprail:'))
  // The right side's op frame is depth from the back (caseFrame); the left's runs
  // front to back — both hands are checked against holes in shapeOpFrame.test.
  const left = rp.case_parts.find(p => p.part_key === 'left_side')!

  it('notch: through pocket the rail thickness deep (not deeper), rail height, run 5 past the front edge', () => {
    const { rows } = collectNotchRoutes(rp, 'c1', 'tool10')
    const pockets = rows.filter(o => o.operation_type === 'route')
    expect(pockets).toHaveLength(rails.length * 2)
    const r = pockets.find(o => o.source_part_key === 'case_right_side' && o.operation_key === 'fprail_notch_0')!
    const rail = rails.find(p => p.part_key === 'fprail:0')!
    const front = rail.Z + rail.DZ - left.Z
    expect(r.pos_x - r.size_dx! / 2).toBeCloseTo(front - 18)      // back of the notch = rail thickness
    expect(r.pos_x + r.size_dx! / 2).toBeCloseTo(front + 5)       // overrun past the edge
    expect(r.size_dy).toBeCloseTo(rail.DX)
    expect(r.pos_y - r.size_dy! / 2).toBeCloseTo(rail.Y - left.Y)
    expect(r.depth).toBeGreaterThan(left.DZ)                      // right through
    expect(r).toMatchObject({ operation_action: 'pocket', router_tool_id: 'tool10' })
  })

  it('reliefs: a 10mm slot at each closed end reaching 5 behind the rail; none at an open end', () => {
    const grooves = collectNotchRoutes(rp, 'c1', 'tool10').rows.filter(o => o.operation_type === 'groove' && o.source_part_key === 'case_right_side')
    const rail = rails.find(p => p.part_key === 'fprail:0')!
    const front = rail.Z + rail.DZ - left.Z
    const mine = grooves.filter(g => g.operation_key.startsWith('fprail_relief_0_'))
    expect(mine).toHaveLength(2)                                  // between drawers: both ends closed
    for (const g of mine) {
      expect(g.width).toBe(10)
      expect(g.pos_x - g.width! / 2).toBeCloseTo(front - 18 - 5)  // round end reaches 5 deeper
      expect(g.pos_x + g.length!).toBeCloseTo(front + 5)
    }
    const bot = rail.Y - left.Y, top = bot + rail.DX
    expect(mine.map(g => g.pos_y).sort((a, b) => a - b)).toEqual([bot + 5, top - 5].map(v => expect.closeTo(v, 2)))
    // The top rail runs out through the side's top: only a bottom relief.
    const topRail = rails.reduce((a, b) => (a.Y > b.Y ? a : b))
    expect(grooves.filter(g => g.operation_key.startsWith(`fprail_relief_${topRail.part_key.slice(7)}_`))).toHaveLength(1)
  })

  it('no 10mm cutter → notches skipped, not guessed', () => {
    const { rows, skipped } = collectNotchRoutes(rp, 'c1', null)
    expect(rows).toHaveLength(0)
    expect(skipped).toBe(rails.length * 2)
  })

  it('knock-in block hole: Ø10 × 12 into each inner face, 15 behind the rail, centred on it', () => {
    const blocks = collectDrillRows(rp, 'c1').rows.filter(o => o.parameters.kind === 'fprail_block')
    expect(blocks).toHaveLength(rails.length * 2)
    const rail = rails.find(p => p.part_key === 'fprail:0')!
    const b = blocks.find(o => o.source_part_key === 'case_left_side' && o.operation_key === 'fprail_block_0')!
    expect(b.diameter).toBe(10)
    expect(b.depth).toBe(12)
    expect(b.pos_y).toBeCloseTo(rail.Y + rail.DX / 2 - left.Y)
    // u = depth from the side's back (mirrored when bored from the down face).
    const u = rail.Z - 15 - left.Z
    expect([u, left.DX - u].some(v => Math.abs(b.pos_x - v) < 0.01)).toBe(true)
  })

  it('rails off → no notches, no blocks', () => {
    const off = resolveCabinet({ ...cab, rules: mergeRules(DEFAULT_RULES, { FPRAIL: false }) })
    expect(collectNotchRoutes(off, 'c1', 'tool10').rows).toHaveLength(0)
    expect(collectDrillRows(off, 'c1').rows.some(o => o.parameters.kind === 'fprail_block')).toBe(false)
  })

  it('on-edge front rail fixes the top rail: no blocks on it, the lower rail keeps its blocks (D20)', () => {
    const onEdge = resolveCabinet({ ...cab, rules: mergeRules(DEFAULT_RULES, { RAIL_ORIENT: 'vertical' }) })
    const rs = onEdge.case_parts.filter(p => p.part_key.startsWith('fprail:'))
    const top = rs.reduce((a, b) => (b.Y > a.Y ? b : a))
    expect(top.fprail?.noBlocks).toBe(true)
    const blocks = collectDrillRows(onEdge, 'c1').rows.filter(o => o.parameters.kind === 'fprail_block')
    expect(blocks.some(o => o.operation_key === `fprail_block_${top.part_key.slice(7)}`)).toBe(false)
    expect(blocks).toHaveLength((rs.length - 1) * 2)
    // Flat front rail: every rail keeps its blocks.
    expect(rails.every(p => !p.fprail?.noBlocks)).toBe(true)
  })

  it('rail tape (D21): the top rail one long edge (its bottom), the others both', () => {
    const top = rails.reduce((a, b) => (b.Y > a.Y ? b : a))
    const low = rails.find(p => p !== top)!
    expect(top.edge_band).toMatchObject({ top: false, bottom: true, left: false, right: false })
    expect(low.edge_band).toMatchObject({ top: true, bottom: true, left: false, right: false })
  })

  it('narrow rails nest as a 60 strip; the note gives the trim size (D21)', () => {
    const both = fingerRailStrip(40, 588, 18, { top: true, bottom: true, left: false, right: false }, 1, false)
    expect(both.dims).toEqual({ w: 60, h: 588, thickness: 18 })
    expect(both.note).toBe('Cut 60 wide, trim to 38, then tape 2 long edges = 40')
    const one = fingerRailStrip(40, 588, 18, { top: false, bottom: true, left: false, right: false }, 1, false)
    expect(one.note).toBe('Cut 60 wide, trim to 39, then tape 1 long edge = 40')
    expect(fingerRailStrip(45, 588, 18, { top: true, bottom: true, left: false, right: false }, 1, true).dims).toEqual({ w: 588, h: 60, thickness: 18 })
  })

  it('flat front rail: the top rail\'s block drops to sit 2 under it; lower rails stay centred', () => {
    const fr = rp.case_parts.find(p => p.part_key === 'front_rail')!
    const top = rails.reduce((a, b) => (b.Y > a.Y ? b : a))
    const low = rails.find(p => p !== top)!
    const ends = railBlockEnds(rp.case_parts, rp.internal_parts)
    const yOf = (rl: { part_key: string }) => ends.find(e => e.railKey === rl.part_key)!.y
    expect(yOf(top)).toBeCloseTo(fr.Y - 2 - 9.5)
    expect(yOf(top) - 9.5).toBeGreaterThanOrEqual(top.Y - 0.01)   // still on the rail
    expect(yOf(low)).toBeCloseTo(low.Y + low.DX / 2)
  })
})

describe('finger-rail machining per column (H5b)', () => {
  // Two drawer columns, a double divider between them (automatic for drawers
  // side by side); column 0's bottom drawer asks for a 30 gap, so the seam
  // above it has a rail per column, each ending on its own divider panel.
  const twoCol: CabinetInput = {
    ...cab, DX: 900, has_internal: true,
    face_grid: {
      rows: cab.face_grid.rows,
      cols: [0, 1].map(i => ({ col_index: i, width_locked: false })),
      zones: [0, 1].flatMap(r => [0, 1].map(c => ({
        row_index: r, col_index: c, face_type: 'drawer_face' as const, ...(r === 0 && c === 0 ? { finger_gap: 30 } : {}),
      }))),
    },
    internal_tree: { type: 'vsplit', children: [{ section: { type: 'open', fittings: [] } }, { section: { type: 'open', fittings: [] } }] },
  }
  const rp = resolveCabinet(twoCol)
  const [a, b] = rp.internal_parts.filter(p => p.part_type === 'divider').sort((p, q) => p.X - q.X)
  const left = rp.case_parts.find(p => p.part_key === 'left_side')!
  const rails = rp.case_parts.filter(p => p.part_key.startsWith('fprail:'))
  const split = rails.filter(rl => rl.DY < twoCol.DX)
  const through = rails.filter(rl => rl.DY >= twoCol.DX)

  it('dividers share the sides\' front edge, so the notch depth is the same', () => {
    expect(a.Z + a.DX).toBeCloseTo(left.Z + left.DX)
  })

  it('notches: through rails cut both panels; a column rail only its own panel', () => {
    const pockets = collectNotchRoutes(rp, 'c1', 'tool10').rows.filter(o => o.operation_type === 'route')
    const on = (key: string, rl: { part_key: string }) => pockets.some(o => o.source_part_key === key && o.operation_key === `fprail_notch_${rl.part_key.slice(7)}`)
    expect(split).toHaveLength(2)
    const [l, r] = [...split].sort((p, q) => p.X - q.X)
    expect(on(`int_divider_${a.sort_order}`, l)).toBe(true)
    expect(on(`int_divider_${b.sort_order}`, l)).toBe(false)
    expect(on(`int_divider_${b.sort_order}`, r)).toBe(true)
    expect(on('case_right_side', l)).toBe(false)
    for (const rl of through) {
      expect(on(`int_divider_${a.sort_order}`, rl)).toBe(true)
      expect(on(`int_divider_${b.sort_order}`, rl)).toBe(true)
    }
    expect(pockets.find(o => o.source_part_key.startsWith('int_divider_'))!.source_table).toBe('internal_parts')
  })

  it('blocks: one at each rail end, into the panel that end sits in', () => {
    const blocks = collectDrillRows(rp, 'c1').rows.filter(o => o.parameters.kind === 'fprail_block')
    expect(blocks).toHaveLength(rails.length * 2)
    const [l, r] = [...split].sort((p, q) => p.X - q.X)
    const at = (rl: { part_key: string }) => blocks.filter(o => o.operation_key === `fprail_block_${rl.part_key.slice(7)}`).map(o => o.source_part_key).sort()
    expect(at(l)).toEqual(['case_left_side', `int_divider_${a.sort_order}`].sort())
    expect(at(r)).toEqual(['case_right_side', `int_divider_${b.sort_order}`].sort())
    for (const rl of through) expect(at(rl)).toEqual(['case_left_side', 'case_right_side'])
  })
})
