import { describe, it, expect } from 'vitest'
import type { Wall, CabinetInstance } from '../types'
import { prismFaces } from '../crossSection'
import { partPrism } from '../partSolids'
import { returnWallsOf, returnCutDepth, returnCutPlane, returnSectionLoops, RETURN_CUT_DEFAULT } from '../returnSection'

const wall = (id: string, x: number, y: number, angle: number, length: number, wall_type = 'standard') =>
  ({ id, pos_x: x, pos_y: y, angle, length, thickness: 90, wall_type }) as unknown as Wall
const cab = (wall_id: string, dx: number, dz: number, more: Partial<CabinetInstance> = {}) =>
  ({ id: `${wall_id}-${dx}-${dz}`, wall_id, rotation: 0, dx, dz, ...more }) as unknown as CabinetInstance

// RHK6581 J05-like corner: Wall 1 runs down x = 0 to the origin, Wall 2 runs +x from it.
const w1 = wall('w1', 0, 3061, 270, 3061)
const w2 = wall('w2', 0, 0, 0, 1685)
const isl = wall('isl', 0, 0, 0, 1000, 'island')

describe('returnSection', () => {
  it('finds the walls joined to each end, never islands', () => {
    const { left, right } = returnWallsOf(w1, [w1, w2, isl])
    expect(left).toBeNull()
    expect(right?.id).toBe('w2')
    expect(returnWallsOf(w2, [w1, w2, isl]).left?.id).toBe('w1')
  })

  it('cuts at the deepest real cabinet, ignoring panels, kicks and bulkheads', () => {
    const cabs = [
      cab('w1', 900, 580, { rotation: 270 }),
      cab('w1', 18, 675, { rotation: 270 }),                               // end panel
      cab('w1', 2000, 655, { rotation: 270, is_kick_assembly: true }),     // kick run
      cab('w1', 1200, 700, { rotation: 270, bulkhead: {} as never }),      // bulkhead
      cab('w2', 800, 900),                                                 // another wall
    ]
    expect(returnCutDepth(w1, 'face', cabs)).toBe(580)
    expect(returnCutDepth(w1, 'back', cabs)).toBe(RETURN_CUT_DEFAULT)
  })

  it('slices along the wall: u = elevation x, kept within the wall length', () => {
    // A face frame on a wall along +x from the origin, room toward +y.
    const frame = { o: { x: 0, y: 0 }, d: { x: 1, y: 0 }, n: { x: 0, y: 1 }, len: 3000 }
    const pl = returnCutPlane(frame, 580)
    // A 400-deep return box at the right end (x 2600..3000), 0..1000 out from the face.
    const box = { id: 'b', item: 'carcass_gables', role: 'case' as const,
      faces: prismFaces(partPrism({ x: 2600, y: 0, z: 0, w: 400, h: 2000, d: 1000 }, 'face')) }
    const out = returnSectionLoops([box], pl, 3000)
    expect(out).toHaveLength(1)
    const xs = out[0].loops[0].map(p => p.x), ys = out[0].loops[0].map(p => p.y)
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([2600, 3000])
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([0, 2000])
    // Past the wall end (a return's outside cabinets) → dropped.
    const outside = { ...box, faces: prismFaces(partPrism({ x: 3100, y: 0, z: 0, w: 400, h: 2000, d: 1000 }, 'face')) }
    expect(returnSectionLoops([outside], pl, 3000)).toHaveLength(0)
  })
})
