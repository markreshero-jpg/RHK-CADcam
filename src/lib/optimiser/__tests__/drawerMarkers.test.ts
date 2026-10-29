import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { collectDrillRows } from '../seamDrillSync'
import { resolveCabinet } from '../../resolver/resolver'
import { mergeRules } from '../../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material } from '../../resolver/types'

// z_handles D22: drawer front marker pricks — 1 hole on the top front, 2 on the
// next …, 5 × 1 deep in the back face, 15 up, 60 in from the left (front view),
// 10 apart running inward.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const cab = (rules = mergeRules(DEFAULT_RULES)): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 600, DY: 870, DZ: 560,
  has_carcass: true, has_internal: false, has_face: true, has_toekick: true,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules,
  face_grid: {
    rows: [0, 1, 2].map(r => ({ row_index: r, height_locked: false })),
    cols: [{ col_index: 0, width_locked: false }],
    zones: [0, 1, 2].map(r => ({ row_index: r, col_index: 0, face_type: 'drawer_face' as const })),
  },
  internal_tree: { type: 'open', fittings: [] },
})

describe('drawer front markers (D22)', () => {
  const rp = resolveCabinet(cab())
  const markers = collectDrillRows(rp, 'c1').rows.filter(o => o.parameters.kind === 'df_marker')

  it('top front gets 1 hole, then 2, then 3', () => {
    const byTop = [...rp.face_zones].sort((a, b) => (b.Y + b.DY) - (a.Y + a.DY))
    byTop.forEach((z, i) => {
      const mine = markers.filter(o => o.source_part_key === `zone_${z.row_index}_${z.col_index}`)
      expect(mine).toHaveLength(i + 1)
    })
    expect(markers).toHaveLength(6)
  })

  it('5 dia, 1 deep, back face, 15 up, 60 / 70 / 80 in from the left', () => {
    const bottom = [...rp.face_zones].sort((a, b) => a.Y - b.Y)[0]
    const mine = markers.filter(o => o.source_part_key === `zone_${bottom.row_index}_${bottom.col_index}`)
    expect(mine.map(o => o.pos_x).sort((a, b) => a - b)).toEqual([60, 70, 80])
    for (const o of mine) {
      expect(o).toMatchObject({ diameter: 5, depth: 1, pos_y: 15, plane_kind: 'face_back' })
    }
  })

  it('DF_MARKER off → no pricks', () => {
    const off = resolveCabinet(cab({ ...mergeRules(DEFAULT_RULES), DF_MARKER: false }))
    expect(collectDrillRows(off, 'c1').rows.some(o => o.parameters.kind === 'df_marker')).toBe(false)
  })
})
