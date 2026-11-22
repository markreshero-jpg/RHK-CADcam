import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type FaceGridInput, type HandleProductInput } from '../types'

// z_handles D28 (Mark 2026-11-22, RHK6478 WIP BC-07): an integrated D/W panel
// (front with no carcass) under a finger gap gets its own backing rail across
// the full width, front flush with the cabinet depth, no knock-in blocks — the
// optimiser then joins it to the sink cabinet's top rail (D19).

const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const shark: HandleProductInput = { id: 'sn', name: 'Sharknose', grip_kind: 'sharknose', handle_type: 'other', length: null, bore_centres: null, projection: null, cost_per_unit: 0, hole_dia_mm: null, holes: [], needs_finger_gap: true, bevel_angle_deg: 45, bevel_land_mm: 2 }
const grid = (gap?: number): FaceGridInput => ({
  rows: [{ row_index: 0, height_locked: false }],
  cols: [{ col_index: 0, width_locked: false }],
  zones: [{ row_index: 0, col_index: 0, face_type: 'drawer_face', ...(gap ? { finger_gap: gap } : {}) }],
})
const cab = (has_carcass: boolean, gap?: number): CabinetInput => ({
  id: 'dw', assembly_class: 'base', DX: 600, DY: 800, DZ: 630,
  has_carcass, has_internal: false, has_face: true, has_toekick: false,
  left_neighbour: 'cabinet', right_neighbour: 'cabinet', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 26, rules: mergeRules(DEFAULT_RULES),
  face_grid: grid(gap),
  internal_tree: { type: 'open', fittings: [] },
  slide_products: [],
  handle_schedule: { drawer: { handle: shark, offset_from_edge_mm: 0, inset_from_side_mm: null, orientation: 'horizontal' } },
  handle_products: { sn: shark },
})

describe('appliance front finger rail (D28)', () => {
  it('no carcass + 60 finger gap: one full-width rail at the top, flush, no blocks', () => {
    const rp = resolveCabinet(cab(false, 60))
    const rails = rp.case_parts.filter(p => p.part_key.startsWith('fprail:'))
    expect(rails).toHaveLength(1)
    const [r] = rails
    expect(r.X).toBe(0)
    expect(r.DY).toBe(600)                 // full width
    expect(r.Y + r.DX).toBeCloseTo(800)    // up to the cabinet top
    expect(r.DX).toBeCloseTo(80)           // 60 gap + 20 behind the front
    expect(r.Z + r.DZ).toBeCloseTo(630)    // front flush with the cabinet depth
    expect(r.fprail?.noBlocks).toBe(true)
    expect(rp.case_parts.some(p => p.part_key === 'left_side' || p.part_key === 'right_side')).toBe(false)
  })

  it('no grip (e.g. PTO / no handle): no rail', () => {
    const rp = resolveCabinet({ ...cab(false), handle_schedule: {} })
    expect(rp.case_parts.some(p => p.part_key.startsWith('fprail:'))).toBe(false)
  })
})
