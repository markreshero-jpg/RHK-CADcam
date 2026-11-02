import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material } from '../types'

// Per-gable board (roles left_side / right_side): a 33 box with an 18 right
// gable (RHK6563 study shelf box meeting the back of the box on the next wall).
const b33: Material = { id: 'm33', name: 'Board 33', DZ: 33, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const b18: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const cab = (over: Partial<CabinetInput> = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 1000, DY: 370, DZ: 300,
  has_carcass: true, has_internal: false, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: b33, door_material: b33, shelf_material: b33, exposed_material: b33,
  toekick_face_material: b33, toekick_interior_material: b33,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, { FLOAT: true, SCRBK: 0, SCRL: 0, SCRR: 0 }), top_type: 'full_top',
  face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
  ...over,
})
const part = (c: CabinetInput, k: string) => resolveCabinet(c).case_parts.find(p => p.part_key === k)!

describe('gable material overrides', () => {
  it('default: both gables carcass thickness', () => {
    const c = cab()
    expect(part(c, 'right_side').DZ).toBe(33)
    expect(part(c, 'bottom').DY).toBe(1000 - 66)
  })

  it('right_side 18: thinner right gable at the end, bottom/top/back widen to meet it', () => {
    const c = cab({ right_side_material: b18 })
    const rs = part(c, 'right_side')
    expect(rs.DZ).toBe(18)
    expect(rs.material_id).toBe('m18')
    expect(rs.X).toBe(1000 - 18)
    expect(part(c, 'left_side').DZ).toBe(33)
    for (const k of ['bottom', 'full_top', 'back']) {
      const p = part(c, k)
      expect(p.X).toBe(33)
      expect(p.DY).toBe(1000 - 33 - 18)
    }
  })

  it('left_side 18 shifts the bottom start', () => {
    const c = cab({ left_side_material: b18 })
    expect(part(c, 'left_side').DZ).toBe(18)
    expect(part(c, 'bottom').X).toBe(18)
    expect(part(c, 'bottom').DY).toBe(1000 - 18 - 33)
  })
})

describe('back thinner than the bottom', () => {
  it('back_on_bottom: 3D bottom face (Y + DZ) sits on the bottom, top face under the top', () => {
    const c = cab({ back_material: b18 })
    const back = part(c, 'back'), bottom = part(c, 'bottom')
    const bottomTop = bottom.Y + bottom.DZ
    expect(back.DZ).toBe(18)
    if (c.rules.BOTTOM_BACK_JOIN !== 'butts_into_back') expect(back.Y + back.DZ).toBe(bottomTop)
    else expect(back.Y + back.DZ).toBe(bottom.Y)
    expect(back.Y + back.DZ + back.DX).toBeLessThanOrEqual(370)
  })
})
