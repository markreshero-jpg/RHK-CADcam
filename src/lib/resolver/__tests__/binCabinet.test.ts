import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { findBin } from '../resolveDrawerStack'
import { DEFAULT_RULES, type CabinetInput, type Material, type SlideDrillOp, type SlideProduct, type HandleProductInput } from '../types'

// z_bin_cabinet/BIN-CABINET-SPEC.md — B2

const wb: Material = { id: 'wb', name: 'Whiteboard 16.5mm', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }

// Mirrors migration_b1_bins.sql: H = bottom gable row above the floor.
function ops(id: string, H: number): SlideDrillOp[] {
  const op = (n: number, surf: SlideDrillOp['target_surface'], along: number, up: number, qty: number, spc: number | null): SlideDrillOp => ({
    id: `${id}-${n}`, slide_id: id, operation_order: n, target_surface: surf, machine_operation: 'drill',
    tool_diameter_mm: 5, depth_mm: 2, along_off_mm: along, up_off_mm: up, qty, spacing_mm: spc,
    side: 'both', repeat_axis: 'up', router_tool_id: null, drill_id: null, auto_tool: true, notes: null, expressions: null,
  } as SlideDrillOp)
  return [
    op(1, 'cabinet_member', 37, H, 2, 95.5),
    op(2, 'cabinet_member', 261, H, 2, 95.5),
    op(3, 'cabinet_member', 422, H, 1, null),
    op(4, 'cabinet_member', 422, H + 89.5, 2, 12),
    op(5, 'drawer_front', 26, H - 216, 2, 85),
  ]
}
function bin(name: string, wmin: number, wmax: number, height: number, H: number): SlideProduct {
  return {
    id: name, name, brand: 'Nikpol', kind: 'bin', inside_width_min: wmin, inside_width_max: wmax,
    nominal_length: 520, box_height: height, side_deduction: 0, runner_thickness: 12,
    min_runner_depth: null, max_runner_depth: null, soft_close: true, full_extension: true,
    cost_per_pair: null, colour: null, model_url: null, model_format: null, model_scale: 1,
    model_anchor_x: 0, model_anchor_y: 0, model_anchor_z: 0, drill_ops: ops(name, H),
  }
}
const TERAMO = [
  bin('Teramo 32L', 262, 280, 620, 510),
  bin('Teramo 62L', 362, 380, 620, 510),
  bin('Teramo 56L', 412, 430, 460, 345),
  bin('Teramo 66L', 412, 430, 540, 430),
  bin('Teramo 74L', 412, 430, 620, 510),
  bin('Teramo 94L', 562, 580, 620, 510),
]

function binCab(DX: number, overrides: Partial<CabinetInput> = {}): CabinetInput {
  return {
    id: 'bbin', assembly_class: 'base', DX, DY: 870, DZ: 580,
    has_carcass: true, has_internal: false, has_face: true, has_toekick: true,
    left_neighbour: 'cabinet', right_neighbour: 'cabinet', exposed_interior: false,
    material: wb, door_material: wb, shelf_material: wb, exposed_material: wb,
    toekick_face_material: wb, toekick_interior_material: wb,
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    face_grid: {
      rows: [{ row_index: 0, height_locked: false }],
      cols: [{ col_index: 0, width_locked: false }],
      zones: [{ row_index: 0, col_index: 0, face_type: 'drawer_face', drawer_type_config: { type: 'bin' } }],
    },
    internal_tree: { type: 'open', fittings: [] },
    bin_products: TERAMO,
    ...overrides,
  }
}

const FLOOR = 150 + 16.5   // toe kick + bottom board: the B-D6 datum

describe('findBin', () => {
  it('module = outside width: 16.5 gables land every module inside its bin range', () => {
    expect(findBin(300 - 33, 560, 687, TERAMO)?.name).toBe('Teramo 32L')
    expect(findBin(400 - 33, 560, 687, TERAMO)?.name).toBe('Teramo 62L')
    expect(findBin(450 - 33, 560, 687, TERAMO)?.name).toBe('Teramo 74L')   // tallest of the three 450s
    expect(findBin(600 - 33, 560, 687, TERAMO)?.name).toBe('Teramo 94L')
  })
  it('a lower ceiling picks a shorter 450 bin', () => {
    expect(findBin(417, 560, 600, TERAMO)?.name).toBe('Teramo 66L')
    expect(findBin(417, 560, 500, TERAMO)?.name).toBe('Teramo 56L')
  })
  it('too shallow or between ranges: nothing', () => {
    expect(findBin(417, 500, 687, TERAMO)).toBeNull()
    expect(findBin(317, 560, 687, TERAMO)).toBeNull()
  })
})

describe('BBIN front (B2)', () => {
  it('builds no drawer box, only the bin rails on the gables', () => {
    const rp = resolveCabinet(binCab(450))
    const [stack] = rp.drawer_stacks
    expect(stack.drawer_type).toBe('bin')
    expect(stack.box_parts).toEqual([])
    expect(stack.slides.map(s => s.slide_id)).toEqual(['Teramo 74L', 'Teramo 74L'])
    expect(stack.slides[0].X).toBeCloseTo(16.5)
    expect(stack.slides[1].X + stack.slides[1].DZ).toBeCloseTo(450 - 16.5)
    expect(stack.slides[0].Y).toBeCloseTo(FLOOR)
  })

  it('pricks the gables from the floor, measured back from the front', () => {
    const [stack] = resolveCabinet(binCab(450)).drawer_stacks
    const left = stack.slides.find(s => s.side === 'left')!
    const front = left.Z + left.DX
    const gable = left.drills.filter(d => d.surface === 'cabinet_member')
    const pts = gable.map(d => [Math.round(front - d.z), +(d.y - FLOOR).toFixed(1)]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
    expect(pts).toEqual([
      [37, 510], [37, 605.5], [261, 510], [261, 605.5], [422, 510], [422, 599.5], [422, 611.5],
    ])
    expect(gable.every(d => d.x === 16.5 && d.axis === 'x-' && d.depthLen === 2)).toBe(true)
  })

  it('pricks the back of the door 26 in from each side, 294 / 379 above the floor', () => {
    const [stack] = resolveCabinet(binCab(450)).drawer_stacks
    const door = stack.slides.flatMap(s => s.drills).filter(d => d.surface === 'drawer_front')
    const pts = door.map(d => [+d.x.toFixed(1), +(d.y - FLOOR).toFixed(1)]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
    expect(pts).toEqual([[42.5, 294], [42.5, 379], [407.5, 294], [407.5, 379]])
    expect(door.every(d => d.depthLen === 2 && d.axis === 'z+')).toBe(true)
  })

  it('500 wide: no bin fits, warns with the divisions fix', () => {
    const rp = resolveCabinet(binCab(500))
    expect(rp.drawer_stacks).toHaveLength(0)
    const w = rp.warnings.find(x => x.code === 'NO_BIN_FITS')
    expect(w?.message).toMatch(/467mm inside/)
    expect(w?.message).toMatch(/division each side to fit the Teramo 74L/)
  })

  it('bins are never drawer runners', () => {
    // A system drawer with only bins loaded finds no runner (nothing leaks across).
    const rp = resolveCabinet(binCab(450, {
      face_grid: {
        rows: [{ row_index: 0, height_locked: false }],
        cols: [{ col_index: 0, width_locked: false }],
        zones: [{ row_index: 0, col_index: 0, face_type: 'drawer_face', drawer_type_config: { type: 'system' } }],
      },
    }))
    expect(rp.drawer_stacks.every(s => !s.slides.some(sl => sl.slide_id.startsWith('Teramo')))).toBe(true)
  })
})

describe('BBIN+I1: inner drawer above the bin (B3)', () => {
  const withInner = (DY: number) => binCab(450, {
    DY, has_internal: true,
    internal_tree: { type: 'open', fittings: [{ type: 'inner_drawer', y_locked: false }] },
  })
  const binOf = (c: CabinetInput) => resolveCabinet(c).drawer_stacks[0]?.slides[0]?.slide_id

  it('keeps BINUP (140) clear above the bin: 687 interior → the 540 bin, not the 620', () => {
    expect(binOf(binCab(450))).toBe('Teramo 74L')
    expect(binOf(withInner(870))).toBe('Teramo 66L')
  })

  it('a lower carcass drops to the 460 bin', () => {
    expect(binOf(withInner(800))).toBe('Teramo 56L')   // 617 interior − 140 = 477
  })

  it('the inner drawer sits above the bin top + BINGAP, not on the floor', () => {
    const rp = resolveCabinet(withInner(870))
    const inner = rp.internal_parts.filter(p => p.part_type.startsWith('inner_drawer'))
    expect(inner.length).toBeGreaterThan(0)
    expect(Math.min(...inner.map(p => p.Y))).toBeGreaterThanOrEqual(FLOOR + 540 + 10 - 1e-6)
  })

  it('no bin leaves room: tallest that fits + a warning', () => {
    const rp = resolveCabinet(withInner(720))   // 537 interior
    expect(rp.drawer_stacks[0].slides[0].slide_id).toBe('Teramo 56L')
    expect(rp.warnings.find(w => w.code === 'BIN_NO_ROOM_ABOVE')?.message).toMatch(/no bin leaves 140mm/)
  })
})

describe('finger-pull backing rail caps the bin (B3)', () => {
  const shark: HandleProductInput = {
    id: 'sn', name: 'Sharknose 45°', grip_kind: 'sharknose', handle_type: 'other', length: null, bore_centres: null,
    projection: null, cost_per_unit: 0, hole_dia_mm: null, holes: [], needs_finger_gap: true, bevel_angle_deg: 45, bevel_land_mm: 2,
  }
  const sharkSched = { drawer: { handle: shark, offset_from_edge_mm: 0, inset_from_side_mm: null, orientation: 'horizontal' as const } }
  // 900 high on a 100 kick, like BC-23: floor 116.5, carcass top 883.5.
  const rules = mergeRules({ ...DEFAULT_RULES, TOEH: 100 })
  const c = (inner: boolean) => binCab(450, {
    DY: 900, rules, has_internal: true, handle_schedule: sharkSched,
    internal_tree: { type: 'open', fittings: inner ? [{ type: 'inner_drawer', y_locked: false }] : [] },
  })

  it('without the rail the 620 fits under BINUP; the rail pushes it down to the 540', () => {
    const plain = binCab(450, { DY: 900, rules, has_internal: true, internal_tree: { type: 'open', fittings: [{ type: 'inner_drawer', y_locked: false }] } })
    expect(resolveCabinet(plain).drawer_stacks[0].slides[0].slide_id).toBe('Teramo 74L')   // 767 − 140 ≥ 620
    const rp = resolveCabinet(c(true))
    const rail = rp.case_parts.find(p => String(p.part_key).startsWith('fprail'))
    expect(rail).toBeDefined()
    expect(rp.drawer_stacks[0].slides[0].slide_id).toBe('Teramo 66L')
    // The inner drawer stays under the rail.
    const inner = rp.internal_parts.filter(p => p.part_type.startsWith('inner_drawer'))
    expect(Math.max(...inner.map(p => p.Y + (p.part_type === 'inner_drawer_side' ? p.DY : 0)))).toBeLessThanOrEqual(rail!.Y + 1e-6)
  })

  it('no inner drawer: the bin only has to fit under the rail', () => {
    expect(resolveCabinet(c(false)).drawer_stacks[0].slides[0].slide_id).toBe('Teramo 74L')
  })
})

describe('forcing a bin (override)', () => {
  const forced = (DX: number, id: string) => binCab(DX, {
    face_grid: {
      rows: [{ row_index: 0, height_locked: false }],
      cols: [{ col_index: 0, width_locked: false }],
      zones: [{ row_index: 0, col_index: 0, face_type: 'drawer_face', drawer_type_config: { type: 'bin', slide_product_id: id } }],
    },
  })
  it('uses the chosen bin, quietly when it fits', () => {
    const rp = resolveCabinet(forced(450, 'Teramo 56L'))
    expect(rp.drawer_stacks[0].slides[0].slide_id).toBe('Teramo 56L')
    expect(rp.warnings.some(w => w.code === 'BIN_FORCED_MISFIT')).toBe(false)
  })
  it('warns when the chosen bin does not fit the width', () => {
    const rp = resolveCabinet(forced(450, 'Teramo 32L'))
    expect(rp.drawer_stacks[0].slides[0].slide_id).toBe('Teramo 32L')
    expect(rp.warnings.find(w => w.code === 'BIN_FORCED_MISFIT')?.message).toMatch(/417mm inside is over its 280 maximum/)
  })
})

describe('parametric 3D bin — build_bin.py port (B5)', () => {
  it('matches the script in its own 370 × 520 space: 320 × 246 rims, 316 × 242 lids', async () => {
    const { binShape } = await import('../../binGeometry')
    const stack = { ...resolveCabinet(binCab(450)).drawer_stacks[0], box_width: 370, box_height: 540, box_depth: 520 }
    const parts = binShape(stack)
    const rims = parts.filter(p => p.kind === 'rim' && p.shape === 'box')
    expect(rims.map(r => r.shape === 'box' && [Math.round(r.w), Math.round(r.d)])).toEqual([[320, 246], [320, 246]])
    const bins = parts.filter(p => p.shape === 'frustum')
    expect(bins).toHaveLength(2)
    expect(bins[0].shape === 'frustum' && bins[0].top).toEqual([316, 242])
    // Frame + runners stay; carrier, bins, rims, lids slide.
    expect(parts.filter(p => !p.moving).every(p => p.kind === 'frame' || p.kind === 'runner')).toBe(true)
  })

  it('a 74L: stays inside its envelope, two bins front-to-back, standing on the floor', async () => {
    const { binShape } = await import('../../binGeometry')
    const [stack] = resolveCabinet(binCab(450)).drawer_stacks
    const parts = binShape(stack)
    const top = stack.box_Y + stack.box_height
    for (const p of parts) {
      if (p.shape === 'box') {
        expect(p.x).toBeGreaterThanOrEqual(stack.box_X - 1e-6)
        expect(p.x + p.w).toBeLessThanOrEqual(stack.box_X + stack.box_width + 1e-6)
        expect(p.y + p.h).toBeLessThanOrEqual(top + 1e-6)
        expect(p.z + p.d).toBeLessThanOrEqual(stack.box_Z + stack.box_depth + 1e-6)
      }
    }
    const bins = parts.filter(p => p.shape === 'frustum')
    expect(bins).toHaveLength(2)
    expect(bins.every(b => b.shape === 'frustum' && Math.abs(b.y0 - stack.box_Y) < 1e-6)).toBe(true)
    expect(bins[0].shape === 'frustum' && bins[1].shape === 'frustum' && bins[0].cz).not.toBeCloseTo(bins[1].shape === 'frustum' ? bins[1].cz : 0)
  })

  it('600 module: four bins, 2 × 2', async () => {
    const { binShape } = await import('../../binGeometry')
    const [stack] = resolveCabinet(binCab(600)).drawer_stacks
    expect(binShape(stack).filter(p => p.shape === 'frustum')).toHaveLength(4)
  })
})

describe('add divisions (B4)', () => {
  it('500 wide: the warning carries the fix; applying it centres a 74L between two divisions', async () => {
    const { applyBinDivisions } = await import('../../binDivisions')
    const c500 = binCab(500, { has_internal: true })
    const w = resolveCabinet(c500).warnings.find(x => x.code === 'NO_BIN_FITS')!
    expect(w.action).toEqual({ type: 'add_bin_divisions', void_mm: 6.5, bin: 'Teramo 74L', zone: [0, 0] })
    // 467 inside − 2 × 16.5 divisions − 421 (mid 412–430) = 13 → 6.5 each side.

    const tree = applyBinDivisions(c500.internal_tree, w.action!.void_mm)!
    const rp = resolveCabinet({ ...c500, internal_tree: tree })
    expect(rp.warnings.some(x => x.code === 'NO_BIN_FITS')).toBe(false)
    const [stack] = rp.drawer_stacks
    expect(stack.slides[0].slide_id).toBe('Teramo 74L')
    expect(stack.box_width).toBeCloseTo(421)
    expect(stack.box_X + stack.box_width / 2).toBeCloseTo(250)          // central
    const divs = rp.internal_parts.filter(p => p.part_type === 'divider')
    expect(divs).toHaveLength(2)
    expect(stack.slides.every(s => s.member?.internal_part_type === 'divider')).toBe(true)
    // Gable holes now land on the division faces.
    const left = stack.slides.find(s => s.side === 'left')!
    expect(left.drills.filter(d => d.surface === 'cabinet_member').every(d => Math.abs(d.x - stack.box_X) < 1e-6)).toBe(true)
  })

  it('keeps what was in the bin column (BBIN+I1 inner drawer) and refuses an existing vsplit', async () => {
    const { applyBinDivisions } = await import('../../binDivisions')
    const inner = { type: 'open' as const, fittings: [{ type: 'inner_drawer' as const, y_locked: false }] }
    const t = applyBinDivisions(inner, 6.5)!
    expect(t.type === 'vsplit' && t.children[1].section).toEqual(inner)
    expect(applyBinDivisions(t, 6.5)).toBeNull()
  })
})
