import { describe, it, expect } from 'vitest'
import { dbBackJointDrills, backTopMarker } from '../slideDrilling'
import type { JointTypeOp } from '../resolver/types'

// z_drawer_back_screws: back → bottom fixing holes, centred, centre outward.
const QTY = 'D > 1000 ? 3 : D > 700 ? 2 : D > 400 ? 1 : 0'
const op: JointTypeOp = {
  id: 'o', joint_type_id: 'j', operation_order: 0, target_part: 'part_b', machine_operation: 'drill',
  face: 'normal', tool_diameter_mm: 5, depth_mm: 16.5, offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: 0,
  qty: 1, spacing_mm: null, qty2: 1, spacing2_mm: null, router_tool_id: null, drill_id: null,
  auto_tool: true, notes: null, expressions: { qty: QTY, offset_y_mm: 'T / 2', depth_mm: 'TB' },
}
// Cabinet space: back front face at Z=100, 16.5 thick, X 50..50+W; bottom underside Y=12.5, 16 thick.
const back = (w: number) => ({ X: 50, Y: 12.5, Z: 100, DX: 154, DY: w, DZ: 16.5 })
const bottom = { X: 44, Y: 12.5, Z: 500, DX: 400, DY: 600, DZ: 16 }
const xs = (w: number) => dbBackJointDrills(back(w), bottom, [op]).map(d => +(d.x - 50).toFixed(2))

describe('dbBackJointDrills', () => {
  it('0-400: none', () => { expect(xs(400)).toEqual([]); expect(xs(300)).toEqual([]) })
  it('>400-700: one, centred', () => { expect(xs(401)).toEqual([200.5]); expect(xs(700)).toEqual([350]) })
  it('>700-1000: two, evenly spaced', () => expect(xs(900)).toEqual([300, 600]))
  it('>1000: three, from the centre out', () => expect(xs(1200)).toEqual([300, 600, 900]))
  it('bores front-ward through the back at the bottom edge centre', () => {
    const [d] = dbBackJointDrills(back(600), bottom, [op])
    expect(d).toMatchObject({ y: 20.5, z: 83.5, axis: 'z+', depthLen: 16.5, radius: 2.5, surface: 'drawer_back', source: 'db_back_joint' })
  })
  it('a fixed spacing is centred too', () => {
    expect(dbBackJointDrills(back(900), bottom, [{ ...op, spacing_mm: 200 }]).map(d => d.x - 50)).toEqual([350, 550])
  })
  it('none when the back sits on the bottom (five-piece dado)', () => {
    expect(dbBackJointDrills({ ...back(900), Y: 30 }, bottom, [op])).toEqual([])
  })
  it('the back top marker ignores them', () => {
    expect(backTopMarker(dbBackJointDrills(back(900), bottom, [op]))).toBeNull()
  })
})
