import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { findBin } from '../resolveDrawerStack'
import { DEFAULT_RULES, type CabinetInput, type Material, type SlideDrillOp, type SlideProduct } from '../types'

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
